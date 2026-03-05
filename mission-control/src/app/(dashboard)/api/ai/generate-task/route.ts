import { NextResponse } from "next/server";
import { spawnClaudeGeneration } from "@/lib/ai-spawn";
import { buildTaskGenPrompt, parseAIJson } from "@/lib/ai-generate";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // allow long generation

const requestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(5000),
  projectId: z.string().optional(),
});

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

  const { prompt, projectId } = parsed.data;
  const fullPrompt = buildTaskGenPrompt(prompt, projectId);

  try {
    const result = await spawnClaudeGeneration(fullPrompt);
    const task = parseAIJson<Record<string, unknown>>(result.text);

    return NextResponse.json({
      task,
      meta: { costUsd: result.costUsd, numTurns: result.numTurns },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error("[ai/generate-task]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
