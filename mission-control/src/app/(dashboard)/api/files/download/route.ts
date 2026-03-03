import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const DATA_ROOT = path.join(process.cwd(), "data");

function safePath(relative: string): string | null {
  const resolved = path.resolve(DATA_ROOT, relative);
  if (!resolved.startsWith(DATA_ROOT)) return null;
  return resolved;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const relativePath = searchParams.get("path");

  if (!relativePath) {
    return NextResponse.json({ error: "path parameter required" }, { status: 400 });
  }

  const resolved = safePath(relativePath);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const info = await stat(resolved);
    if (!info.isFile()) {
      return NextResponse.json({ error: "Not a file" }, { status: 400 });
    }

    // 50 MB download cap
    if (info.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large to download (>50MB)" }, { status: 413 });
    }

    const buffer = await readFile(resolved);
    const filename = path.basename(resolved);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(info.size),
      },
    });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
