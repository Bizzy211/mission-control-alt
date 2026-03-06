/**
 * runner.ts — Agent runner factory.
 *
 * Delegates to the appropriate runner based on the AI_PROVIDER env var:
 *   - "claude-code" → runner-claude.ts (spawns Claude Code CLI binary)
 *   - "openrouter"  → runner-openrouter.ts (calls OpenRouter HTTP API)
 *
 * Both sub-runners export the same public API:
 *   - AgentRunner class with spawnAgent() + killSession()
 *   - parseClaudeOutput() function
 *
 * All other daemon files import from this module — they never import
 * the sub-runners directly.
 */

import { getProvider } from "./provider";
import type { SpawnOptions, SpawnResult, ClaudeOutputMeta } from "./types";

// ─── Lazy imports to avoid loading unused modules ────────────────────────────

let _claudeRunner: typeof import("./runner-claude") | null = null;
let _openrouterRunner: typeof import("./runner-openrouter") | null = null;

function getClaudeModule() {
  if (!_claudeRunner) _claudeRunner = require("./runner-claude");
  return _claudeRunner!;
}

function getOpenRouterModule() {
  if (!_openrouterRunner) _openrouterRunner = require("./runner-openrouter");
  return _openrouterRunner!;
}

// ─── parseClaudeOutput (shared — both runners produce compatible output) ─────

export function parseClaudeOutput(stdout: string): ClaudeOutputMeta {
  const provider = getProvider();
  if (provider === "claude-code") {
    return getClaudeModule().parseClaudeOutput(stdout);
  }
  return getOpenRouterModule().parseClaudeOutput(stdout);
}

// ─── AgentRunner (unified wrapper) ──────────────────────────────────────────

export class AgentRunner {
  private delegate: InstanceType<
    typeof import("./runner-claude").AgentRunner |
    typeof import("./runner-openrouter").AgentRunner
  >;

  constructor(cwd?: string) {
    const provider = getProvider();
    if (provider === "claude-code") {
      const mod = getClaudeModule();
      this.delegate = new mod.AgentRunner(cwd);
    } else {
      const mod = getOpenRouterModule();
      this.delegate = new mod.AgentRunner(cwd);
    }
  }

  async spawnAgent(opts: SpawnOptions): Promise<SpawnResult & { pid: number }> {
    return this.delegate.spawnAgent(opts);
  }

  killSession(pid: number): Promise<void> {
    return this.delegate.killSession(pid);
  }
}
