/**
 * openrouter-client.ts — HTTP wrapper for OpenRouter chat completions API.
 *
 * Handles authentication, retries with exponential backoff, and response parsing.
 * Uses the OpenAI-compatible /api/v1/chat/completions endpoint.
 */

import { logger } from "./logger";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | "required";
  max_tokens?: number;
  temperature?: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: "stop" | "tool_calls" | "length" | null;
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: UsageInfo;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/**
 * Thrown when OpenRouter returns 403 (key limit exceeded).
 * Callers should NOT retry — the key is out of credits.
 */
export class CreditExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditExhaustedError";
  }
}

// ─── Client ─────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = "https://openrouter.ai/api/v1") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Send a chat completion request to OpenRouter.
   * Retries on 429 (rate limit) and 5xx errors with exponential backoff.
   */
  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = request.tool_choice ?? "auto";
    }
    if (request.max_tokens) body.max_tokens = request.max_tokens;
    if (request.temperature !== undefined) body.temperature = request.temperature;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
            "HTTP-Referer": "https://thejhccrew.ai",
            "X-Title": "The JHC Crew Mission Control",
          },
          body: JSON.stringify(body),
        });

        // Rate limited — retry with backoff
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);

          logger.warn("openrouter", `Rate limited (429). Retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
          await sleep(delay);
          continue;
        }

        // Server error — retry with backoff
        if (response.status >= 500) {
          const delay = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
          logger.warn("openrouter", `Server error (${response.status}). Retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
          await sleep(delay);
          continue;
        }

        // Credit limit exceeded — do NOT retry
        if (response.status === 403) {
          const errorBody = await response.text().catch(() => "");
          throw new CreditExhaustedError(
            `OpenRouter credit limit exceeded (403): ${errorBody.slice(0, 500)}`
          );
        }

        // Client error (not retryable)
        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          throw new Error(`OpenRouter API error ${response.status}: ${errorBody.slice(0, 500)}`);
        }

        const data = (await response.json()) as ChatCompletionResponse;
        return data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Network errors are retryable
        if (err instanceof TypeError && err.message.includes("fetch")) {
          const delay = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
          logger.warn("openrouter", `Network error: ${err.message}. Retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
          await sleep(delay);
          continue;
        }

        // Non-retryable errors
        throw lastError;
      }
    }

    throw lastError ?? new Error("OpenRouter request failed after all retries");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
