/**
 * agent-loop.ts — Multi-turn orchestrator for OpenRouter agent execution.
 *
 * Runs a conversation loop:
 *   1. Send system prompt + user message + tool definitions to OpenRouter
 *   2. If model responds with tool_calls → execute each tool → append results
 *   3. Repeat until: model returns text (no tool_calls), maxTurns hit, or timeout
 *   4. Produce output in the same JSON shape as Claude Code (--output-format json)
 *      so all downstream consumers (parseClaudeOutput, run-task.ts, etc.) work unchanged.
 *
 * Output format (matches Claude Code):
 *   {
 *     type: "result",
 *     subtype: "success" | "error_max_turns" | "error_timeout",
 *     result: "final text from the model",
 *     is_error: false,
 *     total_cost_usd: null,
 *     num_turns: 5,
 *     session_id: "...",
 *     usage: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
 *   }
 */

import { randomUUID } from "crypto";
import { OpenRouterClient, CreditExhaustedError } from "./openrouter-client";
import { TOOL_DEFINITIONS, executeTool } from "./tools";
import { logger } from "./logger";
import type { ChatMessage, ToolCall } from "./openrouter-client";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentLoopOptions {
  /** The full prompt to send as the user message */
  prompt: string;
  /** OpenRouter model identifier (e.g. "anthropic/claude-sonnet-4-20250514") */
  model: string;
  /** Max conversation turns (each API call = 1 turn) */
  maxTurns: number;
  /** Timeout in minutes for the entire loop */
  timeoutMinutes: number;
  /** Workspace root for tool execution sandboxing */
  workspaceRoot: string;
  /** OpenRouter API key */
  apiKey: string;
  /** OpenRouter base URL (default: https://openrouter.ai/api/v1) */
  baseUrl?: string;
}

export interface AgentLoopResult {
  /** JSON string matching Claude Code output format */
  stdout: string;
  /** Error messages (empty on success) */
  stderr: string;
  /** 0 = success, 1 = failure */
  exitCode: number;
  /** Whether the loop was terminated by timeout */
  timedOut: boolean;
}

interface AccumulatedUsage {
  inputTokens: number;
  outputTokens: number;
}

// ─── Agent Loop ─────────────────────────────────────────────────────────────

/**
 * Run the agent loop. Returns a result shaped like a Claude Code process exit.
 */
export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const client = new OpenRouterClient(opts.apiKey, opts.baseUrl);
  const sessionId = randomUUID();
  const startTime = Date.now();
  const timeoutMs = opts.timeoutMinutes * 60 * 1000;

  // Conversation history
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(),
    },
    {
      role: "user",
      content: opts.prompt,
    },
  ];

  const usage: AccumulatedUsage = { inputTokens: 0, outputTokens: 0 };
  let turnCount = 0;
  let lastTextResult = "";

  logger.info("agent-loop", `Starting agent loop (model: ${opts.model}, maxTurns: ${opts.maxTurns}, timeout: ${opts.timeoutMinutes}min, session: ${sessionId})`);

  try {
    while (turnCount < opts.maxTurns) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        logger.warn("agent-loop", `Session ${sessionId} timed out after ${opts.timeoutMinutes} minutes (${turnCount} turns)`);
        return buildResult({
          subtype: "error_timeout",
          result: lastTextResult || "(timed out before producing output)",
          isError: true,
          numTurns: turnCount,
          usage,
          sessionId,
          exitCode: 0,
          timedOut: true,
        });
      }

      turnCount++;
      logger.debug("agent-loop", `Turn ${turnCount}/${opts.maxTurns}`);

      // Call OpenRouter
      const response = await client.chatCompletion({
        model: opts.model,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
        max_tokens: 16384,
        temperature: 0.1,
      });

      // Accumulate usage
      if (response.usage) {
        usage.inputTokens += response.usage.prompt_tokens;
        usage.outputTokens += response.usage.completion_tokens;
      }

      const choice = response.choices[0];
      if (!choice) {
        logger.error("agent-loop", "No choice in OpenRouter response");
        return buildResult({
          subtype: "success",
          result: "(empty response from model)",
          isError: true,
          numTurns: turnCount,
          usage,
          sessionId,
          exitCode: 1,
          timedOut: false,
        });
      }

      const assistantMessage = choice.message;

      // Append assistant message to conversation
      messages.push(assistantMessage);

      // Check if the model wants to call tools
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Execute each tool call and append results
        for (const toolCall of assistantMessage.tool_calls) {
          const toolResult = executeToolCall(toolCall, opts.workspaceRoot);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }

        // If the assistant also included text alongside tool calls, save it
        if (assistantMessage.content) {
          lastTextResult = assistantMessage.content;
        }

        // Continue the loop — model may want to call more tools
        continue;
      }

      // Model returned text (no tool calls) — we're done
      const finalText = assistantMessage.content ?? "";
      logger.info("agent-loop", `Session ${sessionId} completed in ${turnCount} turns`);

      return buildResult({
        subtype: "success",
        result: finalText,
        isError: false,
        numTurns: turnCount,
        usage,
        sessionId,
        exitCode: 0,
        timedOut: false,
      });
    }

    // Exceeded max turns
    logger.warn("agent-loop", `Session ${sessionId} hit max turns (${opts.maxTurns})`);
    return buildResult({
      subtype: "error_max_turns",
      result: lastTextResult || "(max turns reached before producing output)",
      isError: true,
      numTurns: turnCount,
      usage,
      sessionId,
      exitCode: 0,
      timedOut: false,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Credit exhaustion — distinct exit code (2) so run-task can handle it specially
    if (err instanceof CreditExhaustedError) {
      logger.warn("agent-loop", `Session ${sessionId} credit exhausted after ${turnCount} turns: ${errMsg}`);
      return buildResult({
        subtype: "error_credit_exhausted",
        result: lastTextResult || "(credit limit reached before completing task)",
        isError: true,
        numTurns: turnCount,
        usage,
        sessionId,
        exitCode: 2,
        timedOut: false,
        stderr: errMsg,
      });
    }

    logger.error("agent-loop", `Session ${sessionId} error: ${errMsg}`);

    return buildResult({
      subtype: "success",
      result: "",
      isError: true,
      numTurns: turnCount,
      usage,
      sessionId,
      exitCode: 1,
      timedOut: false,
      stderr: errMsg,
    });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Execute a single tool call and return the result string.
 */
function executeToolCall(toolCall: ToolCall, workspaceRoot: string): string {
  const { name, arguments: argsStr } = toolCall.function;

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsStr);
  } catch {
    logger.error("agent-loop", `Failed to parse tool args for ${name}: ${argsStr.slice(0, 200)}`);
    return `Error: Invalid JSON arguments for tool "${name}"`;
  }

  logger.debug("agent-loop", `Executing tool: ${name}(${Object.keys(args).join(", ")})`);
  const result = executeTool(name, args, workspaceRoot);
  logger.debug("agent-loop", `Tool ${name} returned ${result.length} chars`);

  return result;
}

/**
 * Build the system prompt that instructs the model how to use tools.
 */
function buildSystemPrompt(): string {
  return `You are an AI agent executing tasks in a Mission Control workspace. You have access to tools for reading/writing files, executing commands, listing directories, and searching files.

## Important Rules
- All file paths are relative to the workspace root unless they start with /
- Always read a file before modifying it to understand its current state
- Use 2-space indentation when writing JSON files
- After completing your work, provide a clear summary of what you accomplished
- If you encounter an error, try to recover and continue. Only give up if the error is unrecoverable.
- Do NOT perform bookkeeping tasks like updating task status in tasks.json — the system handles this automatically.
- Focus entirely on executing the assigned work described in the user message.`;
}

/**
 * Build the result object matching Claude Code's --output-format json shape.
 */
function buildResult(opts: {
  subtype: string;
  result: string;
  isError: boolean;
  numTurns: number;
  usage: AccumulatedUsage;
  sessionId: string;
  exitCode: number;
  timedOut: boolean;
  stderr?: string;
}): AgentLoopResult {
  const output = {
    type: "result",
    subtype: opts.subtype,
    result: opts.result,
    is_error: opts.isError,
    total_cost_usd: null, // OpenRouter doesn't return cost per-request in the same way
    num_turns: opts.numTurns,
    session_id: opts.sessionId,
    usage: {
      input_tokens: opts.usage.inputTokens,
      output_tokens: opts.usage.outputTokens,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  };

  return {
    stdout: JSON.stringify(output),
    stderr: opts.stderr ?? "",
    exitCode: opts.exitCode,
    timedOut: opts.timedOut,
  };
}
