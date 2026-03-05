import { NextResponse } from "next/server";
import { getActiveRuns } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getActiveRuns();
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  let todayCost = 0;
  let weekCost = 0;
  let monthCost = 0;
  let totalRuns = 0;
  let totalTurns = 0;
  let completedRuns = 0;
  let failedRuns = 0;

  for (const run of data.runs) {
    const cost = run.costUsd ?? 0;
    const elapsed = run.startedAt ? now - new Date(run.startedAt).getTime() : Infinity;

    if (elapsed < ONE_DAY) todayCost += cost;
    if (elapsed < 7 * ONE_DAY) weekCost += cost;
    if (elapsed < 30 * ONE_DAY) monthCost += cost;

    totalRuns++;
    totalTurns += run.numTurns ?? 0;
    if (run.status === "completed") completedRuns++;
    if (run.status === "failed" || run.status === "timeout") failedRuns++;
  }

  return NextResponse.json({
    today: Math.round(todayCost * 10000) / 10000,
    week: Math.round(weekCost * 10000) / 10000,
    month: Math.round(monthCost * 10000) / 10000,
    totalRuns,
    completedRuns,
    failedRuns,
    totalTurns,
  });
}
