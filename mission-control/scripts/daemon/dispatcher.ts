import { readFileSync, writeFileSync, renameSync, existsSync, openSync, closeSync } from "fs";
import { spawn } from "child_process";
import path from "path";
import { logger } from "./logger";
import { AgentRunner, parseClaudeOutput } from "./runner";
import { HealthMonitor } from "./health";
import { buildScheduledPrompt, getPendingTasks, isTaskUnblocked, hasPendingDecision } from "./prompt-builder";
import type { DaemonConfig, MissionsFile } from "./types";

const DATA_DIR = path.resolve(__dirname, "../../data");
const MISSIONS_FILE = path.join(DATA_DIR, "missions.json");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const ACTIVE_RUNS_FILE = path.join(DATA_DIR, "active-runs.json");
const DECISIONS_FILE = path.join(DATA_DIR, "decisions.json");
const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
// PROJECT_ROOT = mission-control project dir (where node_modules/ lives).
// WORKSPACE_ROOT goes one level higher and resolves to "/" inside Docker,
// which breaks tsx module resolution.  Use PROJECT_ROOT as cwd when spawning
// run-task.ts so that "--import tsx" can find node_modules/tsx/.
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const RETRY_QUEUE_FILE = path.join(DATA_DIR, "daemon-retry-queue.json");
const SPAWN_STDERR_LOG = path.join(DATA_DIR, "daemon-spawn.log");
const MAX_RETRY_DELAY_MINUTES = 60;

// ─── Retry Queue ────────────────────────────────────────────────────────────

interface RetryEntry {
  taskId: string;
  agentId: string;
  retryAt: string;    // ISO timestamp — when this retry becomes eligible
  attempt: number;    // 1-based attempt number (1 = first retry)
  failedAt: string;   // ISO timestamp — when the failure occurred
  error: string | null;
}

// ─── Task Dispatcher ─────────────────────────────────────────────────────────

export class Dispatcher {
  private config: DaemonConfig;
  private runner: AgentRunner;
  private health: HealthMonitor;
  private retryQueue: RetryEntry[] = [];

  constructor(config: DaemonConfig, runner: AgentRunner, health: HealthMonitor) {
    this.config = config;
    this.runner = runner;
    this.health = health;
    this.loadRetryQueue();
  }

  updateConfig(config: DaemonConfig): void {
    this.config = config;
  }

  // ─── Retry Queue Persistence ────────────────────────────────────────────

  private loadRetryQueue(): void {
    try {
      if (!existsSync(RETRY_QUEUE_FILE)) return;
      const raw = readFileSync(RETRY_QUEUE_FILE, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        this.retryQueue = data;
        logger.info("dispatcher", `Loaded ${data.length} pending retry(ies) from disk`);
      }
    } catch {
      logger.warn("dispatcher", "Failed to load retry queue — starting fresh");
      this.retryQueue = [];
    }
  }

  private saveRetryQueue(): void {
    try {
      const tmp = RETRY_QUEUE_FILE + ".tmp";
      writeFileSync(tmp, JSON.stringify(this.retryQueue, null, 2), "utf-8");
      renameSync(tmp, RETRY_QUEUE_FILE);
    } catch (err) {
      logger.error("dispatcher", `Failed to persist retry queue: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Calculate retry delay with exponential backoff.
   * delay = retryDelayMinutes * 2^(attempt-1), capped at MAX_RETRY_DELAY_MINUTES
   */
  private getRetryDelayMinutes(attempt: number): number {
    const base = this.config.execution.retryDelayMinutes;
    return Math.min(base * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MINUTES);
  }

  // ─── Active Runs ────────────────────────────────────────────────────────

  /**
   * Read active-runs.json and return the set of currently running task IDs.
   * run-task.ts maintains this file — it's the source of truth for running tasks.
   */
  private getRunningTaskIds(): Set<string> {
    try {
      if (!existsSync(ACTIVE_RUNS_FILE)) return new Set();
      const raw = readFileSync(ACTIVE_RUNS_FILE, "utf-8");
      const data = JSON.parse(raw) as { runs: Array<{ taskId: string; status: string }> };
      return new Set(
        data.runs.filter((r) => r.status === "running").map((r) => r.taskId),
      );
    } catch {
      return new Set();
    }
  }

  // ─── Polling ────────────────────────────────────────────────────────────

  /**
   * Poll for pending tasks and dispatch them to agents.
   * Also processes due retries from the persistent queue.
   * Called on each polling interval.
   */
  async pollAndDispatch(): Promise<void> {
    logger.info("dispatcher", "Polling for pending tasks...");
    this.health.setLastPollAt(new Date().toISOString());

    try {
      // 1. Process due retries first (they have higher priority — already started once)
      await this.processDueRetries();

      // 2. Get pending tasks sorted by Eisenhower priority
      const pendingTasks = getPendingTasks();

      if (pendingTasks.length === 0) {
        logger.debug("dispatcher", "No pending tasks to dispatch");
        return;
      }

      logger.info("dispatcher", `Found ${pendingTasks.length} pending task(s)`);

      // Read active-runs.json to check which tasks are already running
      const runningTaskIds = this.getRunningTaskIds();

      // 3. Filter to dispatchable tasks
      const dispatchable = pendingTasks.filter(task => {
        // Already running? (check active-runs.json, written by run-task.ts)
        if (runningTaskIds.has(task.id)) {
          logger.debug("dispatcher", `Skipping ${task.id} — already running`);
          return false;
        }

        // Already in retry queue?
        if (this.retryQueue.some(r => r.taskId === task.id)) {
          logger.debug("dispatcher", `Skipping ${task.id} — in retry queue`);
          return false;
        }

        // Blocked by dependencies?
        const taskWithBlockedBy = task as typeof task & { blockedBy: string[] };
        if (!isTaskUnblocked(taskWithBlockedBy)) {
          logger.debug("dispatcher", `Skipping ${task.id} — blocked by dependencies`);
          return false;
        }

        // Has pending decision?
        if (hasPendingDecision(task.id)) {
          logger.debug("dispatcher", `Skipping ${task.id} — waiting for decision`);
          return false;
        }

        // Exceeded retry limit?
        const retryCount = this.health.getRetryCount(task.id);
        if (retryCount >= this.config.execution.retries + 1) {
          logger.warn("dispatcher", `Skipping ${task.id} — exceeded retry limit (${retryCount} attempts)`);
          return false;
        }

        return true;
      });

      if (dispatchable.length === 0) {
        logger.debug("dispatcher", "No dispatchable tasks (all blocked, running, or at retry limit)");
        return;
      }

      // 4. Dispatch up to concurrency limit (use active-runs.json count, not in-memory health)
      const availableSlots = this.config.concurrency.maxParallelAgents - runningTaskIds.size;
      if (availableSlots <= 0) {
        logger.info("dispatcher", `No available slots (${runningTaskIds.size}/${this.config.concurrency.maxParallelAgents} agents running)`);
        return;
      }

      const toDispatch = dispatchable.slice(0, availableSlots);

      for (const task of toDispatch) {
        this.dispatchTask(task.id, task.assignedTo!);
      }
    } catch (err) {
      logger.error("dispatcher", `Poll error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Also check for running/stalled missions that need continuation
    this.pollMissions();
  }

  /**
   * Process retry entries that are due (retryAt <= now).
   */
  private async processDueRetries(): Promise<void> {
    if (this.retryQueue.length === 0) return;

    const now = new Date();
    const dueRetries: RetryEntry[] = [];
    const remaining: RetryEntry[] = [];

    for (const entry of this.retryQueue) {
      if (new Date(entry.retryAt) <= now) {
        dueRetries.push(entry);
      } else {
        remaining.push(entry);
      }
    }

    if (dueRetries.length === 0) return;

    // Check available concurrency slots
    const runningCount = this.getRunningTaskIds().size;
    const availableSlots = this.config.concurrency.maxParallelAgents - runningCount;
    const toRetry = dueRetries.slice(0, Math.max(0, availableSlots));
    const deferred = dueRetries.slice(Math.max(0, availableSlots));

    // Update queue: remove retries we're about to dispatch
    this.retryQueue = [...remaining, ...deferred];
    this.saveRetryQueue();

    for (const entry of toRetry) {
      logger.info("dispatcher", `Retrying task ${entry.taskId} (attempt ${entry.attempt + 1}, agent=${entry.agentId})`);
      this.dispatchTask(entry.taskId, entry.agentId);
    }

    if (deferred.length > 0) {
      logger.info("dispatcher", `${deferred.length} due retry(ies) deferred — no concurrency slots available`);
    }
  }

  /**
   * Dispatch a single task to its assigned agent.
   * Spawns run-task.ts as a detached process so that all bookkeeping
   * (mark in-progress/done, inbox report, activity log, context regen)
   * is handled consistently.
   */
  private dispatchTask(taskId: string, agentId: string): void {
    try {
      logger.info("dispatcher", `Dispatching task ${taskId} to agent "${agentId}"`);

      const scriptPath = path.resolve(__dirname, "run-task.ts");
      const args = [
        "--import", "tsx",
        scriptPath,
        taskId,
        "--source", "daemon-poll",
      ];
      if (this.config.execution.agentTeams) {
        args.push("--agent-teams");
      }

      // Open a log file for stderr so spawn failures are diagnosable
      const stderrFd = openSync(SPAWN_STDERR_LOG, "a");
      const child = spawn(process.execPath, args, {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: ["ignore", "ignore", stderrFd],
        shell: false,
      });
      child.unref();
      closeSync(stderrFd);

      logger.info("dispatcher", `Spawned run-task for ${taskId} (pid: ${child.pid}, cwd: ${PROJECT_ROOT})`);
    } catch (err) {
      logger.error("dispatcher", `Failed to dispatch task ${taskId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Handle a failed task execution.
   * Pushes to the persistent retry queue with exponential backoff instead of setTimeout.
   */
  private handleFailure(
    taskId: string,
    agentId: string,
    result: { exitCode: number | null; stderr: string; timedOut: boolean }
  ): void {
    const retryCount = this.health.getRetryCount(taskId);

    if (retryCount < this.config.execution.retries) {
      const attempt = retryCount + 1;
      const delayMinutes = this.getRetryDelayMinutes(attempt);
      const retryAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

      logger.warn("dispatcher", `Task ${taskId} failed (attempt ${attempt}/${this.config.execution.retries + 1}), scheduling retry at ${retryAt} (${delayMinutes} min delay)`);

      // Remove any existing entry for this task (shouldn't happen, but be safe)
      this.retryQueue = this.retryQueue.filter(r => r.taskId !== taskId);

      this.retryQueue.push({
        taskId,
        agentId,
        retryAt,
        attempt,
        failedAt: new Date().toISOString(),
        error: result.stderr?.slice(0, 500) || null,
      });

      this.saveRetryQueue();
    } else {
      logger.error("dispatcher", `Task ${taskId} permanently failed after ${retryCount + 1} attempts`);

      // Clean up any stale retry entries for this task
      const hadEntry = this.retryQueue.some(r => r.taskId === taskId);
      if (hadEntry) {
        this.retryQueue = this.retryQueue.filter(r => r.taskId !== taskId);
        this.saveRetryQueue();
      }
    }
  }

  // ─── Mission Continuation ──────────────────────────────────────────────

  /**
   * Poll for running/stalled missions that have dispatchable tasks but no
   * live processes. Acts as a daemon-level safety net for chain dispatch.
   */
  private pollMissions(): void {
    try {
      if (!existsSync(MISSIONS_FILE)) return;
      const missionsData: MissionsFile = JSON.parse(readFileSync(MISSIONS_FILE, "utf-8"));

      const activeMissions = missionsData.missions.filter(
        (m) => m.status === "running" || m.status === "stalled"
      );
      if (activeMissions.length === 0) return;

      // Read state
      const tasksRaw = existsSync(TASKS_FILE) ? readFileSync(TASKS_FILE, "utf-8") : '{"tasks":[]}';
      const tasksData = JSON.parse(tasksRaw) as { tasks: Array<Record<string, unknown>> };
      const runsRaw = existsSync(ACTIVE_RUNS_FILE) ? readFileSync(ACTIVE_RUNS_FILE, "utf-8") : '{"runs":[]}';
      const runsData = JSON.parse(runsRaw) as { runs: Array<{ taskId: string; missionId: string | null; pid: number; status: string }> };
      const decisionsRaw = existsSync(DECISIONS_FILE) ? readFileSync(DECISIONS_FILE, "utf-8") : '{"decisions":[]}';
      const decisionsData = JSON.parse(decisionsRaw) as { decisions: Array<{ taskId: string | null; status: string }> };

      const pendingDecisionTaskIds = new Set(
        decisionsData.decisions
          .filter((d) => d.status === "pending" && d.taskId)
          .map((d) => d.taskId as string)
      );

      // Check which runs are actually alive
      const liveRunningTaskIds = new Set<string>();
      let liveRunningCount = 0;
      for (const run of runsData.runs) {
        if (run.status === "running") {
          let alive = run.pid <= 0;
          if (!alive) {
            try { process.kill(run.pid, 0); alive = true; } catch { alive = false; }
          }
          if (alive) {
            liveRunningTaskIds.add(run.taskId);
            liveRunningCount++;
          }
        }
      }

      let changed = false;

      for (const mission of activeMissions) {
        // Check if this mission has live processes
        const missionRuns = runsData.runs.filter(
          (r) => r.missionId === mission.id && r.status === "running"
        );
        const hasLiveProcesses = missionRuns.some((r) => {
          if (r.pid <= 0) return true;
          try { process.kill(r.pid, 0); return true; } catch { return false; }
        });

        if (hasLiveProcesses) continue;

        // No live processes — find dispatchable tasks
        const projectTasks = tasksData.tasks.filter((t) => t.projectId === mission.projectId);
        const remaining = projectTasks.filter(
          (t) => t.kanban !== "done" && t.assignedTo && t.assignedTo !== "me" && !t.deletedAt
        );

        if (remaining.length === 0) {
          mission.status = "completed";
          mission.completedAt = new Date().toISOString();
          changed = true;
          continue;
        }

        const dispatchable = remaining.filter((t) => {
          const tid = t.id as string;
          if (liveRunningTaskIds.has(tid)) return false;
          const blocked = (t.blockedBy as string[] | undefined) ?? [];
          if (blocked.length > 0) {
            const allDone = blocked.every((depId) => {
              const dep = tasksData.tasks.find((d) => d.id === depId);
              return (dep as Record<string, unknown> | undefined)?.kanban === "done";
            });
            if (!allDone) return false;
          }
          if (pendingDecisionTaskIds.has(tid)) return false;
          const attempts = mission.loopDetection?.taskAttempts?.[tid] ?? 0;
          if (attempts >= 3) return false;
          return true;
        });

        if (dispatchable.length > 0) {
          const slotsAvailable = Math.max(0, this.config.concurrency.maxParallelAgents - liveRunningCount);
          const toSpawn = dispatchable.slice(0, slotsAvailable);

          if (toSpawn.length > 0) {
            // Revive stalled missions
            if (mission.status === "stalled") {
              mission.status = "running";
              changed = true;
            }

            const scriptPath = path.resolve(__dirname, "run-task.ts");
            for (const task of toSpawn) {
              const args = [
                "--import", "tsx",
                scriptPath,
                task.id as string,
                "--source", "mission-chain",
                "--mission", mission.id,
              ];
              if (this.config.execution.agentTeams) {
                args.push("--agent-teams");
              }
              try {
                const stderrFd = openSync(SPAWN_STDERR_LOG, "a");
                const child = spawn(process.execPath, args, {
                  cwd: PROJECT_ROOT,
                  detached: true,
                  stdio: ["ignore", "ignore", stderrFd],
                  shell: false,
                });
                child.unref();
                closeSync(stderrFd);
                logger.info("dispatcher", `Mission ${mission.id}: re-dispatched task ${task.id} (pid: ${child.pid})`);
              } catch (err) {
                logger.error("dispatcher", `Mission ${mission.id}: failed to re-dispatch task ${task.id}: ${err instanceof Error ? err.message : String(err)}`);
              }
            }
          }
        }
      }

      if (changed) {
        writeFileSync(MISSIONS_FILE, JSON.stringify(missionsData, null, 2), "utf-8");
      }
    } catch (err) {
      logger.error("dispatcher", `Mission poll error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Run a scheduled command (daily-plan, standup, etc.)
   */
  async runScheduledCommand(command: string): Promise<void> {
    if (this.health.isCommandRunning(command)) {
      logger.info("dispatcher", `Scheduled command "/${command}" already running, skipping`);
      return;
    }

    const availableSlots = this.config.concurrency.maxParallelAgents - this.health.activeCount();
    if (availableSlots <= 0) {
      logger.info("dispatcher", `No slots available for scheduled command "/${command}"`);
      return;
    }

    logger.info("dispatcher", `Running scheduled command: /${command}`);

    const prompt = buildScheduledPrompt(command);

    const sessionId = this.health.startSession("system", null, command, 0);

    try {
      const result = await this.runner.spawnAgent({
        prompt,
        maxTurns: this.config.execution.maxTurns,
        timeoutMinutes: this.config.execution.timeoutMinutes,
        skipPermissions: this.config.execution.skipPermissions,
        allowedTools: this.config.execution.allowedTools,
        cwd: "",
      });

      // Parse cost/usage from Claude Code output
      const meta = parseClaudeOutput(result.stdout);
      this.health.endSession(sessionId, result.exitCode, result.stderr || null, result.timedOut, meta.totalCostUsd, meta.numTurns, meta.usage);

      if (result.exitCode === 0) {
        logger.info("dispatcher", `Scheduled command "/${command}" completed successfully`);
      } else {
        logger.error("dispatcher", `Scheduled command "/${command}" failed (exit=${result.exitCode})`);
      }
    } catch (err) {
      this.health.endSession(sessionId, 1, err instanceof Error ? err.message : String(err), false);
      logger.error("dispatcher", `Scheduled command "/${command}" error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
