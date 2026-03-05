import { NextResponse } from "next/server";
import { getTasks, getDaemonConfig } from "@/lib/data";

// GET — return recurring tasks + daemon cron schedules
export async function GET() {
  try {
    const [tasksData, daemonConfig] = await Promise.all([
      getTasks(),
      getDaemonConfig(),
    ]);

    // Recurring tasks (active = recurrence enabled on a non-deleted task)
    const recurringTasks = tasksData.tasks
      .filter((t) => !t.deletedAt && t.recurrence?.enabled)
      .map((t) => ({
        id: t.id,
        title: t.title,
        assignedTo: t.assignedTo,
        kanban: t.kanban,
        intervalDays: t.recurrence!.intervalDays,
        lastScheduledAt: t.recurrence!.lastScheduledAt,
        dueDate: t.dueDate,
        projectId: t.projectId,
      }));

    // Recently cloned (recurrence disabled but lastScheduledAt set — parent tasks)
    const recentClones = tasksData.tasks
      .filter(
        (t) =>
          !t.deletedAt &&
          t.recurrence &&
          !t.recurrence.enabled &&
          t.recurrence.lastScheduledAt
      )
      .map((t) => ({
        id: t.id,
        title: t.title,
        assignedTo: t.assignedTo,
        kanban: t.kanban,
        intervalDays: t.recurrence!.intervalDays,
        lastScheduledAt: t.recurrence!.lastScheduledAt,
      }))
      .sort(
        (a, b) =>
          new Date(b.lastScheduledAt!).getTime() -
          new Date(a.lastScheduledAt!).getTime()
      )
      .slice(0, 20);

    // Daemon cron schedules
    const schedule = (daemonConfig as Record<string, unknown>).schedule ?? {};
    const polling = (daemonConfig as Record<string, unknown>).polling ?? {};

    return NextResponse.json({
      recurringTasks,
      recentClones,
      daemonSchedule: schedule,
      polling,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
