import { NextResponse } from "next/server";
import { spawnClaudeGeneration } from "@/lib/ai-spawn";
import { buildMissionGenPrompt, parseAIJson } from "@/lib/ai-generate";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const requestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(5000),
});

interface GeneratedTask {
  title: string;
  description: string;
  importance: string;
  urgency: string;
  assignedTo: string | null;
  collaborators: string[];
  subtasks: Array<{ id: string; title: string; done: boolean }>;
  blockedBy: string[];
  estimatedMinutes: number | null;
  acceptanceCriteria: string[];
  tags: string[];
  notes: string;
}

interface GeneratedMission {
  project: {
    name: string;
    description: string;
    color: string;
    tags: string[];
    teamMembers: string[];
  };
  tasks: GeneratedTask[];
  goals: Array<{
    title: string;
    type: "long-term" | "medium-term";
    timeframe: string;
  }>;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { prompt } = parsed.data;
  const fullPrompt = buildMissionGenPrompt(prompt);

  try {
    const result = await spawnClaudeGeneration(fullPrompt);
    const mission = parseAIJson<GeneratedMission>(result.text);

    // Validate basic structure
    if (!mission.project?.name) {
      throw new Error("Generated mission is missing project name");
    }
    if (!Array.isArray(mission.tasks) || mission.tasks.length === 0) {
      throw new Error("Generated mission has no tasks");
    }

    return NextResponse.json({
      mission,
      meta: { costUsd: result.costUsd, numTurns: result.numTurns },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error("[ai/generate-mission]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
