import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const ACTIVE_RUNS_FILE = path.join(DATA_DIR, "active-runs.json");
const STATUS_FILE = path.join(DATA_DIR, "daemon-status.json");

interface RunEntry {
  taskId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  costUsd: number | null;
  numTurns: number | null;
}

/**
 * GET /api/daemon/usage
 *
 * Returns aggregated usage stats for the SubscriptionBadge (claude-code mode).
 * Reads from active-runs.json and daemon-status.json.
 */
export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Read completed runs
    let allRuns: RunEntry[] = [];
    if (existsSync(ACTIVE_RUNS_FILE)) {
      try {
        const data = JSON.parse(readFileSync(ACTIVE_RUNS_FILE, "utf-8")) as { runs: RunEntry[] };
        allRuns = data.runs ?? [];
      } catch { /* ignore parse errors */ }
    }

    // Today's completed tasks
    const todayRuns = allRuns.filter(
      (r) => r.status === "completed" && r.completedAt && r.completedAt >= todayStart
    );

    // Aggregate stats from daemon-status.json (has cumulative token counts)
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;
    let totalTasksCompleted = 0;

    if (existsSync(STATUS_FILE)) {
      try {
        const status = JSON.parse(readFileSync(STATUS_FILE, "utf-8")) as {
          stats?: {
            totalInputTokens?: number;
            totalOutputTokens?: number;
            totalCostUsd?: number;
            tasksCompleted?: number;
          };
        };
        totalInputTokens = status.stats?.totalInputTokens ?? 0;
        totalOutputTokens = status.stats?.totalOutputTokens ?? 0;
        totalCostUsd = status.stats?.totalCostUsd ?? 0;
        totalTasksCompleted = status.stats?.tasksCompleted ?? 0;
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      tasksToday: todayRuns.length,
      totalTasksCompleted,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd,
      lastUpdated: now.toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to read usage data" },
      { status: 500 }
    );
  }
}
