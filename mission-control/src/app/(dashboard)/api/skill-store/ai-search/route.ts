import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SKILLSMP_API = "https://skillsmp.com/api/v1/skills/ai-search";

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

  const url = `${SKILLSMP_API}?q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: body?.error?.message ?? `SkillsMP returned ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();

    // Normalize AI search results into same shape as keyword search
    const results = data.data?.data ?? [];
    const skills = results.map((r: Record<string, unknown>) => {
      const attrs = r.attributes as Record<string, unknown> | undefined;
      const file = (attrs?.file ?? {}) as Record<string, string>;
      const contentArr = r.content as Array<{ text: string; score: number }> | undefined;
      const preview = contentArr?.[0]?.text?.slice(0, 300) ?? "";

      return {
        id: file["skill-id"] ?? (r.file_id as string),
        name: file["skill-name"] ?? "unknown",
        author: (file["skill-id"] ?? "").split("-")[0] ?? "unknown",
        description: preview.replace(/^[\s\n#-]+/, "").slice(0, 200),
        githubUrl: "",
        skillUrl: "",
        stars: 0,
        score: r.score as number,
        updatedAt: attrs?.timestamp ? String(attrs.timestamp) : "",
      };
    });

    return NextResponse.json({ skills, pagination: { total: skills.length } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `SkillsMP request failed: ${message}` }, { status: 502 });
  }
}
