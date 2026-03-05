import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { mutateInbox } from "@/lib/data";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const MISSIONS_FILE = path.join(DATA_DIR, "missions.json");
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
  if (!expectedToken) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expectedToken}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface MissionEntry {
  id: string;
  projectId: string;
  status: string;
  approvalGate: { stage: string; message: string; requestedAt: string } | null;
  [key: string]: unknown;
}

// ─── POST: receive mission event webhooks ────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { event, missionId, data } = body as {
      event: string;
      missionId: string;
      data?: Record<string, unknown>;
    };

    if (!event || !missionId) {
      return NextResponse.json(
        { error: "Missing event or missionId" },
        { status: 400 }
      );
    }

    if (!existsSync(MISSIONS_FILE)) {
      return NextResponse.json({ error: "No missions file" }, { status: 404 });
    }

    const fileData = JSON.parse(readFileSync(MISSIONS_FILE, "utf-8")) as {
      missions: MissionEntry[];
    };
    const mission = fileData.missions.find((m) => m.id === missionId);
    if (!mission) {
      return NextResponse.json({ error: "Mission not found" }, { status: 404 });
    }

    switch (event) {
      case "mission.pause": {
        mission.status = "stopped";
        mission.stoppedAt = new Date().toISOString();
        break;
      }

      case "mission.resume": {
        if (mission.status === "stopped" || mission.status === "stalled") {
          mission.status = "running";
        }
        break;
      }

      case "mission.request-approval": {
        const stage = (data?.stage as string) ?? "checkpoint";
        const message = (data?.message as string) ?? "Mission requires approval to continue.";
        mission.status = "awaiting-approval";
        mission.approvalGate = {
          stage,
          message,
          requestedAt: new Date().toISOString(),
        };
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown event: ${event}` },
          { status: 400 }
        );
    }

    writeFileSync(MISSIONS_FILE, JSON.stringify(fileData, null, 2), "utf-8");

    // Post webhook receipt to inbox
    await mutateInbox(async (inbox) => {
      inbox.messages.push({
        id: `msg_wh_${Date.now()}`,
        from: "system" as const,
        to: "me" as const,
        type: "update" as const,
        taskId: null,
        subject: `Webhook: ${event}`,
        body: `Received webhook event "${event}" for mission ${missionId}.`,
        status: "unread" as const,
        createdAt: new Date().toISOString(),
        readAt: null,
      });
    });

    return NextResponse.json({ ok: true, event, missionId, status: mission.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
