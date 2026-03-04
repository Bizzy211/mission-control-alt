import { NextResponse } from "next/server";
import { getAgents, mutateAgents, mutateSkillsLibrary } from "@/lib/data";
import type { SkillDefinition } from "@/lib/types";

export const dynamic = "force-dynamic";

interface InstallBody {
  name: string;
  description: string;
  content?: string;
  source: string;
  githubUrl?: string;
  tags: string[];
}

/**
 * Attempt to fetch SKILL.md from a GitHub URL.
 * Handles both repo-root URLs (github.com/owner/repo) and
 * subdirectory URLs (github.com/owner/repo/tree/branch/path/to/skill).
 */
async function fetchSkillMd(githubUrl: string): Promise<string | null> {
  // Case 1: URL with /tree/branch/path — e.g. github.com/owner/repo/tree/main/.agents/skills/foo
  const treeMatch = githubUrl.match(
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/,
  );
  if (treeMatch) {
    const [, owner, repo, branch, subPath] = treeMatch;
    const cleanRepo = repo.replace(/\.git$/, "");
    const cleanPath = subPath.replace(/\/$/, "");
    try {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${cleanRepo}/${branch}/${cleanPath}/SKILL.md`;
      const res = await fetch(rawUrl, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const text = await res.text();
        if (text.trim().length > 0) return text;
      }
    } catch {
      // Fall through to repo-root approach
    }
  }

  // Case 2: Repo-root URL — try main then master
  const repoMatch = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!repoMatch) return null;

  const [, owner, repo] = repoMatch;
  const cleanRepo = repo.replace(/\.git$/, "");

  for (const branch of ["main", "master"]) {
    try {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${cleanRepo}/${branch}/SKILL.md`;
      const res = await fetch(rawUrl, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const text = await res.text();
        if (text.trim().length > 0) return text;
      }
    } catch {
      // Try next branch
    }
  }
  return null;
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

  // Try to fetch actual SKILL.md content from GitHub
  let content = body.content || "";
  if (!content && body.githubUrl) {
    const fetched = await fetchSkillMd(body.githubUrl);
    if (fetched) content = fetched;
  }
  if (!content) {
    content = `# ${body.name}\n\nInstalled from Skill Store.\nSource: ${body.source || body.githubUrl || "SkillsMP"}`;
  }

  // Auto-assign to all active non-"me" agents
  const agentsData = await getAgents();
  const allAgentIds = agentsData.agents
    .filter((a) => a.id !== "me" && a.status === "active")
    .map((a) => a.id);

  const newSkill: SkillDefinition = {
    id,
    name: body.name,
    description: body.description || "",
    content,
    agentIds: allAgentIds,
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

  // Side effect: add new skill to all agents' skillIds
  await mutateAgents(async (data) => {
    for (const agent of data.agents) {
      if (agent.id !== "me" && !agent.skillIds.includes(id)) {
        agent.skillIds.push(id);
        agent.updatedAt = now;
      }
    }
  });

  return NextResponse.json(result, { status: 201 });
}
