import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const MISSIONS_FILE = path.join(DATA_DIR, "missions.json");

interface MissionEntry {
  id: string;
  projectId: string;
  status: string;
  approvalGate: { stage: string; message: string; requestedAt: string } | null;
}

// POST /api/missions/[id]/approve — approve a mission's gate and resume it
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: missionId } = await params;

    if (!existsSync(MISSIONS_FILE)) {
      return NextResponse.json({ error: "No missions found" }, { status: 404 });
    }

    const data = JSON.parse(readFileSync(MISSIONS_FILE, "utf-8")) as {
      missions: MissionEntry[];
    };

    const mission = data.missions.find((m) => m.id === missionId);
    if (!mission) {
      return NextResponse.json(
        { error: "Mission not found" },
        { status: 404 }
      );
    }

    if (mission.status !== "awaiting-approval") {
      return NextResponse.json(
        { error: `Mission is ${mission.status}, not awaiting approval` },
        { status: 400 }
      );
    }

    // Approve: clear gate and resume
    mission.approvalGate = null;
    mission.status = "running";

    writeFileSync(MISSIONS_FILE, JSON.stringify(data, null, 2), "utf-8");

    return NextResponse.json({ ok: true, missionId, status: "running" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
