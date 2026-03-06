/**
 * provider.ts — AI provider detection.
 *
 * Single source of truth for determining which AI backend to use.
 * Default is "openrouter" (safer fallback — credit-gated customer path).
 * Admin instances explicitly opt into "claude-code".
 */

export type AIProvider = "claude-code" | "openrouter";

/**
 * Returns the configured AI provider.
 * Only returns "claude-code" when explicitly set — everything else
 * (missing, typo, empty) falls back to "openrouter".
 */
export function getProvider(): AIProvider {
  return process.env.AI_PROVIDER === "claude-code" ? "claude-code" : "openrouter";
}

/** Shorthand: true when running in OpenRouter mode (the default). */
export function isOpenRouter(): boolean {
  return getProvider() === "openrouter";
}

/** Shorthand: true when running in Claude Code CLI mode (admin only). */
export function isClaudeCode(): boolean {
  return getProvider() === "claude-code";
}
