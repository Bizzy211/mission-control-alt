"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CalendarClock,
  RefreshCw,
  Clock,
  Bot,
  CheckCircle2,
  Circle,
  Timer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { EmptyState } from "@/components/empty-state";
import { apiFetch } from "@/lib/api-client";

interface RecurringTask {
  id: string;
  title: string;
  assignedTo: string | null;
  kanban: string;
  intervalDays: number;
  lastScheduledAt: string | null;
  dueDate: string | null;
  projectId: string | null;
}

interface RecentClone {
  id: string;
  title: string;
  assignedTo: string | null;
  kanban: string;
  intervalDays: number;
  lastScheduledAt: string | null;
}

interface DaemonScheduleEntry {
  enabled: boolean;
  cron: string;
  command: string;
}

interface SchedulesData {
  recurringTasks: RecurringTask[];
  recentClones: RecentClone[];
  daemonSchedule: Record<string, DaemonScheduleEntry>;
  polling: { enabled?: boolean; intervalMinutes?: number };
}

const kanbanColors: Record<string, string> = {
  "not-started": "bg-muted text-muted-foreground",
  "in-progress": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  review: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  done: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

function cronToHuman(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;
  const [min, hour, , , dow] = parts;

  if (min.startsWith("*/")) return `Every ${min.slice(2)} minutes`;

  const h = parseInt(hour);
  const m = parseInt(min);
  const time = `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;

  const dayMap: Record<string, string> = {
    "*": "daily",
    "1-5": "weekdays",
    "0": "Sundays",
    "5": "Fridays",
    "1": "Mondays",
  };
  const dayLabel = dayMap[dow] ?? `days ${dow}`;

  return `${time}, ${dayLabel}`;
}

function daysAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 1) return "today";
  if (diff < 2) return "yesterday";
  return `${Math.floor(diff)}d ago`;
}

export default function SchedulesPage() {
  const [data, setData] = useState<SchedulesData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch("/api/schedules");
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const scheduleEntries = data
    ? Object.entries(data.daemonSchedule)
    : [];

  return (
    <div className="space-y-6">
      <BreadcrumbNav items={[{ label: "Schedules" }]} />

      <h1 className="text-xl font-bold flex items-center gap-2">
        <CalendarClock className="h-5 w-5" />
        Schedules
      </h1>

      <p className="text-sm text-muted-foreground">
        Recurring task schedules and daemon cron jobs. Recurring tasks are
        automatically cloned by the dispatcher when their interval elapses.
      </p>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-card/50 animate-pulse">
              <CardContent className="p-4 h-16" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── Recurring Tasks ──────────────────────────────── */}
          <Card className="bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-primary" />
                Recurring Tasks
                {data && data.recurringTasks.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {data.recurringTasks.length} active
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!data || data.recurringTasks.length === 0 ? (
                <EmptyState
                  icon={RefreshCw}
                  title="No recurring tasks"
                  description='Enable "Repeat Schedule" on a task to create recurring work.'
                />
              ) : (
                data.recurringTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-lg border bg-background/50 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/status-board?task=${task.id}`}
                        className="text-sm font-medium hover:underline truncate block"
                      >
                        {task.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {task.assignedTo && (
                          <span className="flex items-center gap-1">
                            <Bot className="h-3 w-3" />
                            {task.assignedTo}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          Every {task.intervalDays}d
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] shrink-0 ${kanbanColors[task.kanban] ?? ""}`}
                    >
                      {task.kanban}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* ── Daemon Cron Schedules ────────────────────────── */}
          <Card className="bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Daemon Schedules
                {data?.polling?.enabled && (
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    polling every {data.polling.intervalMinutes ?? 5}m
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {scheduleEntries.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="No daemon schedules"
                  description="Configure cron schedules in daemon-config.json."
                />
              ) : (
                scheduleEntries.map(([name, entry]) => (
                  <div
                    key={name}
                    className="flex items-center gap-3 rounded-lg border bg-background/50 p-3"
                  >
                    {entry.enabled ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize">
                        {name.replace(/([A-Z])/g, " $1").trim()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        /{entry.command} &mdash; {cronToHuman(entry.cron)}
                      </p>
                    </div>
                    <Badge
                      variant={entry.enabled ? "default" : "secondary"}
                      className="text-[10px] shrink-0"
                    >
                      {entry.enabled ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* ── Recent Clones (history) ──────────────────────── */}
          {data && data.recentClones.length > 0 && (
            <Card className="bg-card/50 lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  Recent Recurrences
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.recentClones.map((clone) => (
                    <div
                      key={clone.id}
                      className="flex items-center gap-2 rounded-lg border bg-background/50 p-2.5 text-xs"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{clone.title}</p>
                        <p className="text-muted-foreground mt-0.5">
                          Cloned {clone.lastScheduledAt ? daysAgo(clone.lastScheduledAt) : "unknown"}{" "}
                          &middot; every {clone.intervalDays}d
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
