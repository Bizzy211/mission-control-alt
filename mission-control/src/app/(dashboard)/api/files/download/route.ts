import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const DATA_ROOT = path.join(process.cwd(), "data", "deliverables");

function safePath(relative: string): string | null {
  const resolved = path.resolve(DATA_ROOT, relative);
  if (!resolved.startsWith(DATA_ROOT)) return null;
  return resolved;
}

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".ico": "image/x-icon", ".bmp": "image/bmp", ".avif": "image/avif",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".flac": "audio/flac", ".aac": "audio/aac", ".m4a": "audio/mp4",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".avi": "video/x-msvideo", ".mkv": "video/x-matroska",
  ".html": "text/html", ".htm": "text/html",
  ".json": "application/json", ".xml": "text/xml",
  ".css": "text/css", ".js": "text/javascript",
  ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const relativePath = searchParams.get("path");
  const inline = searchParams.get("inline") === "true";

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

    if (info.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (>50MB)" }, { status: 413 });
    }

    const buffer = await readFile(resolved);
    const filename = path.basename(resolved);
    const ext = path.extname(filename).toLowerCase();
    const mimeType = MIME_MAP[ext] ?? "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": inline ? mimeType : "application/octet-stream",
        "Content-Disposition": inline ? "inline" : `attachment; filename="${filename}"`,
        "Content-Length": String(info.size),
        ...(inline ? { "Cache-Control": "private, max-age=60" } : {}),
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
