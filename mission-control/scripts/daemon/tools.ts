/**
 * tools.ts — Tool definitions and execution for the OpenRouter agent loop.
 *
 * Five tools matching Claude Code's capabilities:
 *   - read_file: Read file contents
 *   - write_file: Write/create files
 *   - list_directory: List files and dirs
 *   - execute_command: Run shell commands (sandboxed)
 *   - search_files: Grep-like search
 *
 * All file operations enforce workspace sandboxing — paths must resolve
 * within the workspace root to prevent path traversal attacks.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { logger } from "./logger";
import { validatePathWithinWorkspace, scrubCredentials } from "./security";
import type { ToolDefinition } from "./openrouter-client";

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 2_000_000;      // 2MB max file read
const MAX_OUTPUT_SIZE = 1_000_000;    // 1MB max command output
const DEFAULT_CMD_TIMEOUT = 30_000;   // 30s default command timeout
const MAX_CMD_TIMEOUT = 120_000;      // 120s max command timeout
const MAX_SEARCH_RESULTS = 100;       // max matching lines returned

// ─── Tool Definitions (OpenAI function calling format) ──────────────────────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file. Returns the file content as a string. Use this to read JSON data files, source code, configuration, or any text file.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to read (relative to workspace root or absolute within workspace)",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Parent directories are created automatically.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to write (relative to workspace root or absolute within workspace)",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List files and directories at the given path. Returns names with type indicators (/ for dirs, * for executables).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the directory to list (relative to workspace root or absolute within workspace). Defaults to workspace root if empty.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_command",
      description: "Execute a shell command and return its output. Use this for running scripts, checking system state, or performing operations that require shell access. Commands run in the workspace directory.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
          cwd: {
            type: "string",
            description: "Working directory for the command (relative to workspace root). Defaults to workspace root.",
          },
          timeout_ms: {
            type: "number",
            description: "Timeout in milliseconds (default: 30000, max: 120000)",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search for a pattern in files. Returns matching lines with file paths and line numbers, similar to grep. Useful for finding specific content across multiple files.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "The search pattern (plain text or regex if regex is true)",
          },
          path: {
            type: "string",
            description: "Directory to search in (relative to workspace root). Defaults to workspace root.",
          },
          regex: {
            type: "boolean",
            description: "Whether to treat the pattern as a regular expression (default: false)",
          },
          include: {
            type: "string",
            description: "Glob pattern to filter files (e.g., '*.json', '*.ts'). Optional.",
          },
        },
        required: ["pattern"],
      },
    },
  },
];

// ─── Tool Execution ─────────────────────────────────────────────────────────

/**
 * Execute a tool by name with the given arguments.
 * Returns the tool result as a string.
 */
export function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  workspaceRoot: string,
): string {
  try {
    switch (toolName) {
      case "read_file":
        return toolReadFile(String(args.path ?? ""), workspaceRoot);
      case "write_file":
        return toolWriteFile(String(args.path ?? ""), String(args.content ?? ""), workspaceRoot);
      case "list_directory":
        return toolListDirectory(String(args.path ?? "."), workspaceRoot);
      case "execute_command":
        return toolExecuteCommand(
          String(args.command ?? ""),
          args.cwd ? String(args.cwd) : undefined,
          typeof args.timeout_ms === "number" ? args.timeout_ms : undefined,
          workspaceRoot,
        );
      case "search_files":
        return toolSearchFiles(
          String(args.pattern ?? ""),
          args.path ? String(args.path) : ".",
          args.regex === true,
          args.include ? String(args.include) : undefined,
          workspaceRoot,
        );
      default:
        return `Error: Unknown tool "${toolName}"`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("tools", `Tool ${toolName} failed: ${msg}`);
    return `Error: ${msg}`;
  }
}

// ─── Individual Tool Implementations ────────────────────────────────────────

function resolveSafePath(filePath: string, workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot, filePath);
  if (!validatePathWithinWorkspace(filePath, workspaceRoot)) {
    throw new Error(`Path "${filePath}" resolves outside workspace. Access denied.`);
  }
  return resolved;
}

function toolReadFile(filePath: string, workspaceRoot: string): string {
  const resolved = resolveSafePath(filePath, workspaceRoot);

  if (!existsSync(resolved)) {
    return `Error: File not found: ${filePath}`;
  }

  const stat = statSync(resolved);
  if (stat.isDirectory()) {
    return `Error: "${filePath}" is a directory. Use list_directory instead.`;
  }
  if (stat.size > MAX_FILE_SIZE) {
    return `Error: File too large (${(stat.size / 1_000_000).toFixed(1)}MB). Max: ${MAX_FILE_SIZE / 1_000_000}MB.`;
  }

  return readFileSync(resolved, "utf-8");
}

function toolWriteFile(filePath: string, content: string, workspaceRoot: string): string {
  const resolved = resolveSafePath(filePath, workspaceRoot);

  // Create parent directories
  const dir = path.dirname(resolved);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(resolved, content, "utf-8");
  return `Successfully wrote ${content.length} characters to ${filePath}`;
}

function toolListDirectory(dirPath: string, workspaceRoot: string): string {
  const resolved = resolveSafePath(dirPath, workspaceRoot);

  if (!existsSync(resolved)) {
    return `Error: Directory not found: ${dirPath}`;
  }

  const stat = statSync(resolved);
  if (!stat.isDirectory()) {
    return `Error: "${dirPath}" is a file, not a directory.`;
  }

  const entries = readdirSync(resolved, { withFileTypes: true });
  const lines = entries.map((entry) => {
    if (entry.isDirectory()) return `${entry.name}/`;
    if (entry.isSymbolicLink()) return `${entry.name}@`;
    return entry.name;
  });

  if (lines.length === 0) return "(empty directory)";
  return lines.join("\n");
}

function toolExecuteCommand(
  command: string,
  cwd: string | undefined,
  timeoutMs: number | undefined,
  workspaceRoot: string,
): string {
  if (!command.trim()) {
    return "Error: No command provided.";
  }

  // Resolve cwd within workspace
  const resolvedCwd = cwd
    ? resolveSafePath(cwd, workspaceRoot)
    : workspaceRoot;

  const timeout = Math.min(timeoutMs ?? DEFAULT_CMD_TIMEOUT, MAX_CMD_TIMEOUT);

  try {
    const output = execSync(command, {
      cwd: resolvedCwd,
      timeout,
      maxBuffer: MAX_OUTPUT_SIZE,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      // Run with restricted env to prevent credential leakage
      env: buildCommandEnv(),
    });

    const result = scrubCredentials(output);
    if (result.length > MAX_OUTPUT_SIZE) {
      return result.slice(0, MAX_OUTPUT_SIZE) + "\n\n[OUTPUT TRUNCATED]";
    }
    return result || "(no output)";
  } catch (err) {
    const execErr = err as { stderr?: string; stdout?: string; status?: number; killed?: boolean; message?: string };

    if (execErr.killed) {
      return `Error: Command timed out after ${timeout / 1000}s`;
    }

    const stderr = execErr.stderr ? scrubCredentials(execErr.stderr).slice(0, 2000) : "";
    const stdout = execErr.stdout ? scrubCredentials(execErr.stdout).slice(0, 2000) : "";
    const exitCode = execErr.status ?? 1;

    let result = `Command exited with code ${exitCode}`;
    if (stderr) result += `\nstderr: ${stderr}`;
    if (stdout) result += `\nstdout: ${stdout}`;
    return result;
  }
}

function toolSearchFiles(
  pattern: string,
  dirPath: string,
  isRegex: boolean,
  include: string | undefined,
  workspaceRoot: string,
): string {
  if (!pattern.trim()) {
    return "Error: No search pattern provided.";
  }

  const resolved = resolveSafePath(dirPath, workspaceRoot);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return `Error: Directory not found: ${dirPath}`;
  }

  // Build grep command
  const args: string[] = ["-rn", "--color=never"];
  if (!isRegex) args.push("-F"); // Fixed string (literal) matching
  if (include) args.push(`--include=${include}`);
  args.push("--", pattern, ".");

  try {
    const output = execSync(`grep ${args.join(" ")}`, {
      cwd: resolved,
      timeout: 15_000,
      maxBuffer: MAX_OUTPUT_SIZE,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const lines = output.trim().split("\n").slice(0, MAX_SEARCH_RESULTS);
    if (lines.length === MAX_SEARCH_RESULTS) {
      lines.push(`\n... (truncated at ${MAX_SEARCH_RESULTS} results)`);
    }
    return lines.join("\n") || "No matches found.";
  } catch (err) {
    const execErr = err as { status?: number; stdout?: string };
    // grep exits with 1 when no matches found
    if (execErr.status === 1) return "No matches found.";
    return `Error: Search failed — ${(err as Error).message?.slice(0, 200)}`;
  }
}

// ─── Command Environment ────────────────────────────────────────────────────

/**
 * Build a restricted environment for command execution.
 * Passes PATH and essential system vars, strips everything else.
 */
function buildCommandEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};

  // Essentials for command execution
  if (process.env.PATH) env.PATH = process.env.PATH;
  if (process.env.Path) env.Path = process.env.Path;
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.env.USERPROFILE) env.USERPROFILE = process.env.USERPROFILE;
  if (process.env.TEMP) env.TEMP = process.env.TEMP;
  if (process.env.TMP) env.TMP = process.env.TMP;

  // Windows system vars (required for shell)
  if (process.platform === "win32") {
    if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
    if (process.env.COMSPEC) env.COMSPEC = process.env.COMSPEC;
    if (process.env.PATHEXT) env.PATHEXT = process.env.PATHEXT;
    if (process.env.WINDIR) env.WINDIR = process.env.WINDIR;
  }

  // Explicitly do NOT pass: OPENROUTER_API_KEY, MC_API_TOKEN, etc.
  return env as NodeJS.ProcessEnv;
}
