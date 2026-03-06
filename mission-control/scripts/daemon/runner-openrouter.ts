/**
 * runner.ts — Agent execution via OpenRouter API.
 *
 * Replaces the original Claude Code CLI spawning with an HTTP-based agent loop.
 * Maintains the same public API (AgentRunner, parseClaudeOutput) so that
 * run-task.ts, run-inbox-respond.ts, dispatcher.ts, etc. work unchanged.
 */

import path from "path";
import { logger } from "./logger";
import { loadConfig } from "./config";
import { scrubCredentials } from "./security";
import { runAgentLoop } from "./agent-loop";
import type { SpawnOptions, SpawnResult, ClaudeOutputMeta, ClaudeUsage } from "./types";

const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

// Monotonic counter for synthetic PIDs (agent loop runs in-process, not as child)
let pidCounter = 100_000;

// ─── Agent Output Parser ─────────────────────────────────────────────────────

/**
 * Parse agent loop JSON stdout into structured metadata.
 * Compatible with both Claude Code output and our agent-loop output format.
 * Returns null-safe fields for every property. Handles non-JSON gracefully.
 */
export function parseClaudeOutput(stdout: string): ClaudeOutputMeta {
  const empty: ClaudeOutputMeta = {
    totalCostUsd: null,
    numTurns: null,
    subtype: null,
    sessionId: null,
    isError: false,
    usage: null,
  };

  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;

    const meta: ClaudeOutputMeta = {
      totalCostUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : null,
      numTurns: typeof parsed.num_turns === "number" ? parsed.num_turns : null,
      subtype: typeof parsed.subtype === "string" ? parsed.subtype : null,
      sessionId: typeof parsed.session_id === "string" ? parsed.session_id : null,
      isError: parsed.is_error === true,
      usage: null,
    };

    // Parse nested usage object
    if (parsed.usage && typeof parsed.usage === "object") {
      const u = parsed.usage as Record<string, unknown>;
      const usage: ClaudeUsage = {
        inputTokens: typeof u.input_tokens === "number" ? u.input_tokens : 0,
        outputTokens: typeof u.output_tokens === "number" ? u.output_tokens : 0,
        cacheReadInputTokens: typeof u.cache_read_input_tokens === "number" ? u.cache_read_input_tokens : 0,
        cacheCreationInputTokens: typeof u.cache_creation_input_tokens === "number" ? u.cache_creation_input_tokens : 0,
      };
      meta.usage = usage;
    }

    return meta;
  } catch {
    return empty;
  }
}

// ─── Agent Runner ────────────────────────────────────────────────────────────

export class AgentRunner {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? WORKSPACE_ROOT;
  }

  /**
   * Run an agent session via OpenRouter API.
   * Replaces Claude Code CLI spawning with the in-process agent loop.
   * Maintains the same return interface for backward compatibility.
   */
  async spawnAgent(opts: SpawnOptions): Promise<SpawnResult & { pid: number }> {
    const config = loadConfig();
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      const errMsg = "OPENROUTER_API_KEY environment variable is not set";
      logger.error("runner", errMsg);
      return {
        pid: 0,
        exitCode: 1,
        stdout: "",
        stderr: errMsg,
        timedOut: false,
      };
    }

    // Generate a synthetic PID for tracking (agent loop runs in-process)
    const syntheticPid = ++pidCounter;

    // Notify caller of PID immediately (for active-runs tracking)
    opts.onSpawned?.(syntheticPid);

    const workspaceRoot = opts.cwd || this.cwd;
    const model = config.execution.openrouterModel ?? "anthropic/claude-sonnet-4-20250514";
    const baseUrl = config.execution.openrouterBaseUrl ?? "https://openrouter.ai/api/v1";

    logger.info("runner", `Starting agent loop (model: ${model}, maxTurns: ${opts.maxTurns}, timeout: ${opts.timeoutMinutes}min, workspace: ${workspaceRoot})`);

    try {
      const result = await runAgentLoop({
        prompt: opts.prompt,
        model,
        maxTurns: opts.maxTurns,
        timeoutMinutes: opts.timeoutMinutes,
        workspaceRoot,
        apiKey,
        baseUrl,
      });

      // Scrub any credentials from output
      return {
        pid: syntheticPid,
        exitCode: result.exitCode,
        stdout: scrubCredentials(result.stdout),
        stderr: scrubCredentials(result.stderr),
        timedOut: result.timedOut,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error("runner", `Agent loop failed: ${errMsg}`);

      return {
        pid: syntheticPid,
        exitCode: 1,
        stdout: "",
        stderr: scrubCredentials(errMsg),
        timedOut: false,
      };
    }
  }

  /**
   * Kill a running agent session.
   * Since agent loops run in-process (not as child processes),
   * this is a no-op. The timeout mechanism in agent-loop.ts handles termination.
   */
  killSession(pid: number): Promise<void> {
    logger.info("runner", `Kill requested for session ${pid} (agent loops self-terminate via timeout)`);
    return Promise.resolve();
  }
}
