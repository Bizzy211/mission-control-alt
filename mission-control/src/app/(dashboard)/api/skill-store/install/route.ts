import { NextResponse } from "next/server";
import { mutateSkillsLibrary } from "@/lib/data";
import type { SkillDefinition } from "@/lib/types";

export const dynamic = "force-dynamic";

interface InstallBody {
  name: string;
  description: string;
  content: string;
  source: string;
  tags: string[];
}

export async function POST(request: Request) {
  let body: InstallBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const id = `skill_store_${body.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60)}_${Date.now()}`;

  const newSkill: SkillDefinition = {
    id,
    name: body.name,
    description: body.description || "",
    content: body.content || `# ${body.name}\n\nInstalled from Skill Store.\nSource: ${body.source || "SkillsMP"}`,
    agentIds: [],
    tags: [...(body.tags || []), "skill-store"],
    createdAt: now,
    updatedAt: now,
  };

  const result = await mutateSkillsLibrary(async (data) => {
    // Check for duplicate by name
    const existing = data.skills.find(
      (s) => s.name.toLowerCase() === body.name.toLowerCase(),
    );
    if (existing) return null;

    data.skills.push(newSkill);
    return newSkill;
  });

  if (!result) {
    return NextResponse.json(
      { error: `Skill "${body.name}" is already installed` },
      { status: 409 },
    );
  }

  return NextResponse.json(result, { status: 201 });
}
