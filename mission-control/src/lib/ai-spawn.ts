/**
 * AI generation for Next.js API routes.
 *
 * Provider-aware: checks AI_PROVIDER env var to decide between:
 *   - "claude-code": Spawns Claude Code CLI (admin only)
 *   - "openrouter":  Calls OpenRouter HTTP API (customer default)
 *
 * Used for single-shot generation (task/mission planning, no tool use).
 */

import { spawn, execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";

const TIMEOUT_MS = 90_000; // 90 seconds max
const MAX_STDOUT = 2_000_000; // 2MB

// ─── Binary Detection (mirrored from runner.ts) ────────────────────────────

interface ResolvedBinary {
  bin: string;
  prefixArgs: string[];
}

let cached: ResolvedBinary | null = null;

function resolveJsFromCmd(cmdPath: string): string | null {
  try {
    const content = readFileSync(cmdPath, "utf-8");
    const match =
      content.match(/%dp0%\\([^"]+\.js)/i) ||
      content.match(/%dp0%\\([^\s"]+\.js)/i);
    if (match) {
      const jsPath = path.join(path.dirname(cmdPath), match[1]);
      if (existsSync(jsPath)) return jsPath;
    }
  } catch {
    /* ignore */
  }
  const standard = path.join(
    path.dirname(cmdPath),
    "node_modules",
    "@anthropic-ai",
    "claude-code",
    "cli.js"
  );
  return existsSync(standard) ? standard : null;
}

function findBinary(): ResolvedBinary {
  if (cached) return cached;

  // Check daemon-config.json for explicit path
  try {
    const configPath = path.resolve(process.cwd(), "data", "daemon-config.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      if (config?.execution?.claudeBinaryPath) {
        cached = { bin: config.execution.claudeBinaryPath, prefixArgs: [] };
        return cached;
      }
    }
  } catch {
    /* ignore */
  }

  // Check common locations
  const candidates: string[] = [];
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? "";
    const localAppData = process.env.LOCALAPPDATA ?? "";
    const userProfile = process.env.USERPROFILE ?? "";
    candidates.push(
      path.join(appData, "npm", "claude.cmd"),
      path.join(appData, "npm", "claude"),
      path.join(localAppData, "pnpm", "claude.cmd"),
      path.join(localAppData, "pnpm", "claude"),
      path.join(userProfile, ".local", "bin", "claude"),
      path.join(userProfile, ".local", "bin", "claude.exe")
    );
  } else {
    const home = process.env.HOME ?? "";
    candidates.push(
      path.join(home, ".local", "bin", "claude"),
      path.join(home, ".npm-global", "bin", "claude"),
      "/usr/local/bin/claude",
      "/usr/bin/claude"
    );
  }

  for (const c of candidates) {
    if (c && existsSync(c)) {
      if (c.endsWith(".cmd")) {
        const js = resolveJsFromCmd(c);
        if (js) {
          cached = { bin: process.execPath, prefixArgs: [js] };
          return cached;
        }
      }
      cached = { bin: c, prefixArgs: [] };
      return cached;
    }
  }

  // Try which/where
  try {
    const cmd = process.platform === "win32" ? "where claude" : "which claude";
    const result = execSync(cmd, { encoding: "utf-8", timeout: 5000 })
      .trim()
      .split("\n")[0]
      .trim();
    if (result) {
      if (result.endsWith(".cmd")) {
        const js = resolveJsFromCmd(result);
        if (js) {
          cached = { bin: process.execPath, prefixArgs: [js] };
          return cached;
        }
      }
      cached = { bin: result, prefixArgs: [] };
      return cached;
    }
  } catch {
    /* not found */
  }

  return { bin: "claude", prefixArgs: [] };
}

// ─── Safe Environment ───────────────────────────────────────────────────────

function buildSafeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const pass = [
    "PATH",
    "Path",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "ANTHROPIC_API_KEY",
  ];
  for (const key of pass) {
    if (process.env[key]) env[key] = process.env[key]!;
  }
  if (process.platform === "win32") {
    for (const key of ["SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT"]) {
      if (process.env[key]) env[key] = process.env[key]!;
    }
  }
  return env;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface AISpawnResult {
  text: string;
  costUsd: number | null;
  numTurns: number | null;
}

/**
 * Run a single-shot AI generation.
 * Delegates to Claude Code CLI or OpenRouter based on AI_PROVIDER.
 */
export async function spawnClaudeGeneration(prompt: string): Promise<AISpawnResult> {
  const provider = process.env.AI_PROVIDER === "claude-code" ? "claude-code" : "openrouter";
  if (provider === "openrouter") {
    return spawnOpenRouterGeneration(prompt);
  }
  return spawnClaudeCliGeneration(prompt);
}

// ─── OpenRouter HTTP Path ───────────────────────────────────────────────────

interface GenerationConfig {
  model: string;
  baseUrl: string;
}

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

function loadGenerationConfig(): GenerationConfig {
  try {
    const configPath = path.resolve(process.cwd(), "data", "daemon-config.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      return {
        model: config?.execution?.openrouterModel ?? DEFAULT_MODEL,
        baseUrl: config?.execution?.openrouterBaseUrl ?? DEFAULT_BASE_URL,
      };
    }
  } catch {
    /* ignore */
  }
  return { model: DEFAULT_MODEL, baseUrl: DEFAULT_BASE_URL };
}

async function spawnOpenRouterGeneration(prompt: string): Promise<AISpawnResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is not set");
  }

  const config = loadGenerationConfig();
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://thejhccrew.ai",
        "X-Title": "The JHC Crew Mission Control",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8192,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`OpenRouter API error ${response.status}: ${errorBody.slice(0, 500)}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return {
      text: data.choices?.[0]?.message?.content ?? "",
      costUsd: null,
      numTurns: 1,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("AI generation timed out (90s)");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Claude Code CLI Path ───────────────────────────────────────────────────

async function spawnClaudeCliGeneration(prompt: string): Promise<AISpawnResult> {
  const { bin, prefixArgs } = findBinary();

  const args = [
    ...prefixArgs,
    "-p",
    prompt,
    "--output-format",
    "json",
    "--max-turns",
    "1",
  ];

  const isRoot =
    process.platform !== "win32" &&
    typeof process.getuid === "function" &&
    process.getuid() === 0;

  const env = buildSafeEnv();
  if (isRoot) env.HOME = "/home/node";

  return new Promise<AISpawnResult>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: process.cwd(),
      env: env as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      ...(isRoot ? { uid: 1000, gid: 1000 } : {}),
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_STDOUT) stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_STDOUT) stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      reject(new Error("AI generation timed out (90s)"));
    }, TIMEOUT_MS);

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (exitCode !== 0) {
        reject(
          new Error(
            `Claude Code exited with code ${exitCode}: ${stderr.slice(0, 500)}`
          )
        );
        return;
      }

      // Parse the JSON output to extract the text result
      try {
        const parsed = JSON.parse(stdout) as Record<string, unknown>;
        // Claude Code --output-format json wraps the result text
        const text =
          typeof parsed.result === "string"
            ? parsed.result
            : typeof parsed.text === "string"
              ? parsed.text
              : stdout;
        resolve({
          text,
          costUsd:
            typeof parsed.total_cost_usd === "number"
              ? parsed.total_cost_usd
              : null,
          numTurns:
            typeof parsed.num_turns === "number" ? parsed.num_turns : null,
        });
      } catch {
        // If not valid JSON, return raw stdout
        resolve({ text: stdout, costUsd: null, numTurns: null });
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
    });
  });
}
