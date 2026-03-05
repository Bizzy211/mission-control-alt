import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { mutateTasks, mutateInbox } from "@/lib/data";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const TOKEN_FILE = path.join(DATA_DIR, "webhook-token.json");

// ─── Auth ────────────────────────────────────────────────────────────────────

function getToken(): string | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null;
    const data = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
    return data.token ?? null;
  } catch {
    return null;
  }
}

function authorize(req: NextRequest): boolean {
  const expectedToken = getToken();
  if (!expectedToken) return false; // No token configured → deny all
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expectedToken}`;
}

// ─── POST: receive task event webhooks ───────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { event, taskId, data } = body as {
      event: string;
      taskId: string;
      data?: Record<string, unknown>;
    };

    if (!event || !taskId) {
      return NextResponse.json(
        { error: "Missing event or taskId" },
        { status: 400 }
      );
    }

    switch (event) {
      case "task.complete": {
        await mutateTasks(async (file) => {
          const task = file.tasks.find((t) => t.id === taskId);
          if (task) {
            task.kanban = "done";
            task.completedAt = new Date().toISOString();
            task.updatedAt = new Date().toISOString();
          }
        });
        break;
      }

      case "task.update": {
        if (!data) {
          return NextResponse.json({ error: "Missing data" }, { status: 400 });
        }
        await mutateTasks(async (file) => {
          const task = file.tasks.find((t) => t.id === taskId);
          if (task) {
            if (typeof data.kanban === "string") task.kanban = data.kanban as typeof task.kanban;
            if (typeof data.notes === "string") task.notes = data.notes;
            if (typeof data.title === "string") task.title = data.title;
            task.updatedAt = new Date().toISOString();
          }
        });
        break;
      }

      case "task.comment": {
        const content = (data?.content as string) ?? "";
        const author = (data?.author as string) ?? "system";
        if (!content) {
          return NextResponse.json({ error: "Missing data.content" }, { status: 400 });
        }
        await mutateTasks(async (file) => {
          const task = file.tasks.find((t) => t.id === taskId);
          if (task) {
            task.comments.push({
              id: `cmt_${Date.now()}`,
              author: author as typeof task.comments[0]["author"],
              content,
              createdAt: new Date().toISOString(),
            });
            task.updatedAt = new Date().toISOString();
          }
        });
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 });
    }

    // Post webhook receipt to inbox
    await mutateInbox(async (inbox) => {
      inbox.messages.push({
        id: `msg_wh_${Date.now()}`,
        from: "system" as const,
        to: "me" as const,
        type: "update" as const,
        taskId,
        subject: `Webhook: ${event}`,
        body: `Received webhook event "${event}" for task ${taskId}.`,
        status: "unread" as const,
        createdAt: new Date().toISOString(),
        readAt: null,
      });
    });

    return NextResponse.json({ ok: true, event, taskId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
