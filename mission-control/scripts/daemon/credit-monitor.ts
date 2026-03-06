/**
 * credit-monitor.ts — Background credit status poller.
 *
 * Periodically calls OpenRouter's `GET /api/v1/key` endpoint to check
 * the customer's credit usage. Writes results to data/credit-status.json
 * so the dispatcher, run-task, and UI can react proactively.
 *
 * Threshold levels:
 *   - ok:        < 80% used
 *   - warning:   80-90% used
 *   - critical:  90-95% used
 *   - exhausted: > 95% used OR a 403 was received
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { logger } from "./logger";
import type { CreditStatus } from "./types";

const DATA_DIR = path.resolve(__dirname, "../../data");
const CREDIT_STATUS_FILE = path.join(DATA_DIR, "credit-status.json");

// ─── Thresholds ─────────────────────────────────────────────────────────────

const THRESHOLD_WARNING = 0.80;   // 80% used
const THRESHOLD_CRITICAL = 0.90;  // 90% used
const THRESHOLD_EXHAUSTED = 0.95; // 95% used → preemptive block

function computeStatus(percentUsed: number, flaggedExhausted: boolean): CreditStatus["status"] {
  if (flaggedExhausted) return "exhausted";
  if (percentUsed >= THRESHOLD_EXHAUSTED) return "exhausted";
  if (percentUsed >= THRESHOLD_CRITICAL) return "critical";
  if (percentUsed >= THRESHOLD_WARNING) return "warning";
  return "ok";
}

// ─── CreditMonitor ──────────────────────────────────────────────────────────

export class CreditMonitor {
  private apiKey: string;
  private baseUrl: string;
  private checkIntervalTicks: number;
  private tickCount: number = 0;

  /**
   * @param apiKey  OpenRouter API key (customer's key, NOT management key)
   * @param baseUrl OpenRouter base URL
   * @param checkEveryNTicks  How many maintenance ticks (60s each) between checks.
   *                          Default 5 = every 5 minutes.
   */
  constructor(apiKey: string, baseUrl: string = "https://openrouter.ai/api/v1", checkEveryNTicks: number = 5) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.checkIntervalTicks = checkEveryNTicks;
  }

  /**
   * Called from the daemon's 60-second maintenance interval.
   * Only actually polls OpenRouter every N ticks.
   */
  async tick(): Promise<void> {
    this.tickCount++;
    if (this.tickCount % this.checkIntervalTicks !== 0) return;
    await this.checkCredits();
  }

  /**
   * Force an immediate credit check. Called on daemon startup.
   */
  async checkCredits(): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/key`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
        },
      });

      if (!res.ok) {
        // 403 means the key is at limit — mark as exhausted
        if (res.status === 403) {
          logger.warn("credit-monitor", "OpenRouter returned 403 — marking credits as exhausted");
          this.writeStatus({
            limit: 0,
            usage: 0,
            limitRemaining: 0,
            percentUsed: 100,
            status: "exhausted",
            lastCheckedAt: new Date().toISOString(),
            exhaustedAt: new Date().toISOString(),
          });
          return;
        }

        logger.warn("credit-monitor", `Failed to check credits (HTTP ${res.status})`);
        return;
      }

      const body = (await res.json()) as {
        data: {
          limit: number | null;
          usage: number;
          limit_remaining: number | null;
        };
      };

      const { limit, usage, limit_remaining } = body.data;

      // If no limit is set, credits are unlimited
      if (limit === null || limit === 0) {
        this.writeStatus({
          limit: 0,
          usage,
          limitRemaining: null,
          percentUsed: 0,
          status: "ok",
          lastCheckedAt: new Date().toISOString(),
        });
        return;
      }

      const percentUsed = limit > 0 ? usage / limit : 0;

      // Check if a 403 flag was previously set (reactive flag from run-task)
      const wasExhausted = this.readCurrentStatus()?.status === "exhausted";

      // If previously exhausted but now have remaining credits, clear the flag
      const effectiveRemaining = limit_remaining ?? (limit - usage);
      const stillExhausted = wasExhausted && effectiveRemaining <= 0;

      const status = computeStatus(percentUsed, stillExhausted);

      const creditStatus: CreditStatus = {
        limit,
        usage: Math.round(usage * 100) / 100,
        limitRemaining: effectiveRemaining != null ? Math.round(effectiveRemaining * 100) / 100 : null,
        percentUsed: Math.round(percentUsed * 10000) / 100, // e.g. 85.42%
        status,
        lastCheckedAt: new Date().toISOString(),
      };

      // Preserve exhaustedAt if still exhausted
      if (status === "exhausted" && wasExhausted) {
        const prev = this.readCurrentStatus();
        if (prev?.exhaustedAt) {
          creditStatus.exhaustedAt = prev.exhaustedAt;
        }
      }

      // Clear exhaustedAt if recovered
      if (status !== "exhausted") {
        delete creditStatus.exhaustedAt;
      }

      this.writeStatus(creditStatus);

      const levelLabel = status === "ok" ? "" : ` [${status.toUpperCase()}]`;
      logger.debug("credit-monitor", `Credits: $${creditStatus.usage} / $${limit} (${creditStatus.percentUsed}% used)${levelLabel}`);

      // Log warnings at threshold crossings
      if (status === "warning") {
        logger.warn("credit-monitor", `Credit usage at ${creditStatus.percentUsed}% — approaching limit`);
      } else if (status === "critical") {
        logger.warn("credit-monitor", `Credit usage at ${creditStatus.percentUsed}% — nearly exhausted`);
      } else if (status === "exhausted") {
        logger.warn("credit-monitor", `Credits exhausted — all dispatches will be blocked`);
      }
    } catch (err) {
      logger.error("credit-monitor", `Failed to check credits: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── File I/O ─────────────────────────────────────────────────────────────

  private readCurrentStatus(): CreditStatus | null {
    try {
      if (!existsSync(CREDIT_STATUS_FILE)) return null;
      return JSON.parse(readFileSync(CREDIT_STATUS_FILE, "utf-8")) as CreditStatus;
    } catch {
      return null;
    }
  }

  private writeStatus(status: CreditStatus): void {
    try {
      const tmp = CREDIT_STATUS_FILE + ".tmp";
      writeFileSync(tmp, JSON.stringify(status, null, 2), "utf-8");
      renameSync(tmp, CREDIT_STATUS_FILE);
    } catch (err) {
      logger.error("credit-monitor", `Failed to write credit status: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
