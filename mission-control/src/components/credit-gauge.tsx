"use client";

import { useCredits } from "@/hooks/use-credits";
import { cn } from "@/lib/utils";
import { AlertTriangle, Coins, ExternalLink } from "lucide-react";

/**
 * Compact credit usage gauge for the dashboard.
 * Shows a progress bar with dollar amounts, and an alert banner when exhausted.
 */
export function CreditGauge() {
  const { credits, isExhausted, isCritical, isWarning, isLoading } = useCredits();

  // Don't render if no limit is configured or still loading
  if (isLoading || (credits.limit === 0 && credits.status === "ok")) return null;

  const used = credits.usage;
  const total = credits.limit;
  const remaining = credits.limitRemaining ?? 0;
  const pct = Math.min(credits.percentUsed, 100);

  // Determine bar color
  const barColor = isExhausted
    ? "bg-red-500"
    : isCritical
      ? "bg-red-400"
      : isWarning
        ? "bg-yellow-500"
        : "bg-emerald-500";

  // Top-up URL: provisioner base URL (injected as env var during provisioning)
  const topupUrl = process.env.NEXT_PUBLIC_TOPUP_URL;

  // Exhaustion banner
  if (isExhausted) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-500">
              AI Credits Exhausted
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              All tasks are paused. Purchase additional credits or wait for your next billing renewal.
            </p>
            <div className="flex items-center gap-3 mt-2">
              {/* Progress bar (full) */}
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: "100%" }} />
              </div>
              <span className="text-xs text-red-400 tabular-nums whitespace-nowrap">
                ${used.toFixed(2)} / ${total.toFixed(2)}
              </span>
            </div>
          </div>
          {topupUrl && (
            <a
              href={topupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-400 transition-colors px-2 py-1 rounded border border-red-500/30 hover:bg-red-500/10"
            >
              Buy Credits <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    );
  }

  // Normal / warning / critical gauge
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border px-3 py-2",
      isCritical ? "border-red-500/20 bg-red-500/5" :
      isWarning ? "border-yellow-500/20 bg-yellow-500/5" :
      "border-border bg-card/50"
    )}>
      <div className="flex items-center gap-1.5 shrink-0">
        <Coins className={cn(
          "h-3.5 w-3.5",
          isCritical ? "text-red-400" :
          isWarning ? "text-yellow-500" :
          "text-emerald-500"
        )} />
        <span className="text-xs font-medium text-muted-foreground">Credits</span>
      </div>

      {/* Progress bar */}
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[60px]">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Dollar amounts */}
      <span className={cn(
        "text-xs tabular-nums whitespace-nowrap",
        isCritical ? "text-red-400" :
        isWarning ? "text-yellow-500" :
        "text-muted-foreground"
      )}>
        ${remaining.toFixed(2)} left
      </span>

      {/* Buy more link (shown at warning+) */}
      {(isWarning || isCritical) && topupUrl && (
        <a
          href={topupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
        >
          Buy more <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
    </div>
  );
}
