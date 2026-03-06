"use client";

import { useUsage } from "@/hooks/use-usage";
import { cn } from "@/lib/utils";
import { Sparkles, Zap } from "lucide-react";

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

/**
 * Compact subscription badge for the admin dashboard (claude-code mode).
 * Shows Claude Max subscription status and rolling usage stats.
 */
export function SubscriptionBadge() {
  const { usage, isLoading } = useUsage();

  if (isLoading) return null;

  const totalTokens = usage.totalInputTokens + usage.totalOutputTokens;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2">
      {/* Subscription indicator */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="relative">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-card" />
        </div>
        <span className="text-xs font-medium text-violet-500">Claude Max</span>
      </div>

      {/* Divider */}
      <div className="h-3 w-px bg-border shrink-0" />

      {/* Tasks today */}
      <div className="flex items-center gap-1 shrink-0">
        <Zap className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs tabular-nums text-muted-foreground">
          {usage.tasksToday} today
        </span>
      </div>

      {/* Tokens used */}
      {totalTokens > 0 && (
        <>
          <div className="h-3 w-px bg-border shrink-0" />
          <span className={cn(
            "text-xs tabular-nums text-muted-foreground",
          )}>
            {formatTokenCount(totalTokens)} tokens
          </span>
        </>
      )}

      {/* Total completed */}
      {usage.totalTasksCompleted > 0 && (
        <>
          <div className="h-3 w-px bg-border shrink-0" />
          <span className="text-xs tabular-nums text-muted-foreground">
            {usage.totalTasksCompleted} completed
          </span>
        </>
      )}
    </div>
  );
}
