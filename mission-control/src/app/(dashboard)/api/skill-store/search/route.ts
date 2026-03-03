import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SKILLSMP_API = "https://skillsmp.com/api/v1/skills/search";

export async function GET(request: Request) {
  const apiKey = process.env.SKILLSMP_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "SKILLSMP_API_KEY not configured", setup: true },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  if (!q) {
    return NextResponse.json({ error: "q parameter required" }, { status: 400 });
  }

  const page = searchParams.get("page") ?? "1";
  const limit = searchParams.get("limit") ?? "20";
  const sortBy = searchParams.get("sortBy") ?? "stars";

  const url = `${SKILLSMP_API}?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}&sortBy=${sortBy}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: body?.error?.message ?? `SkillsMP returned ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();

    // Normalize response
    const skills = (data.data?.skills ?? []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      name: s.name as string,
      author: s.author as string,
      description: s.description as string,
      githubUrl: s.githubUrl as string,
      skillUrl: s.skillUrl as string,
      stars: s.stars as number,
      updatedAt: s.updatedAt as string,
    }));

    const pagination = data.data?.pagination ?? {};

    return NextResponse.json({ skills, pagination });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `SkillsMP request failed: ${message}` }, { status: 502 });
  }
}
