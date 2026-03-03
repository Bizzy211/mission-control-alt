import { NextResponse } from "next/server";
import { readFile, readdir, stat, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const DATA_ROOT = path.join(process.cwd(), "data");

/** Prevent path traversal — resolved path must be within DATA_ROOT */
function safePath(relative: string): string | null {
  const resolved = path.resolve(DATA_ROOT, relative);
  if (!resolved.startsWith(DATA_ROOT)) return null;
  return resolved;
}

const TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".csv", ".xml", ".yaml", ".yml", ".toml",
  ".html", ".htm", ".css", ".js", ".ts", ".tsx", ".jsx", ".py",
  ".sh", ".bash", ".zsh", ".fish", ".env", ".conf", ".cfg", ".ini",
  ".log", ".sql", ".graphql", ".prisma", ".dockerfile",
  ".gitignore", ".editorconfig", ".prettierrc", ".eslintrc",
]);

function isTextFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Files with no extension are often text (Makefile, Dockerfile, README, etc.)
  if (!ext && /^[A-Z]/.test(path.basename(name))) return true;
  return false;
}

function getMime(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const map: Record<string, string> = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".csv": "text/csv",
    ".html": "text/html",
    ".htm": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".ts": "text/typescript",
    ".py": "text/x-python",
    ".sh": "text/x-shellscript",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".xml": "text/xml",
    ".sql": "text/x-sql",
    ".log": "text/plain",
  };
  return map[ext] ?? "text/plain";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const relativePath = searchParams.get("path") ?? "";
  const wantContent = searchParams.get("content") === "true";

  const resolved = safePath(relativePath);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const info = await stat(resolved);

    // ── Read file content ──────────────────────────────────────────────
    if (info.isFile()) {
      if (!wantContent) {
        // Just return file info
        return NextResponse.json({
          type: "file",
          name: path.basename(resolved),
          size: info.size,
          modified: info.mtime.toISOString(),
          isText: isTextFile(resolved),
          mime: getMime(resolved),
        });
      }

      // Safety cap: 1 MB
      if (info.size > 1_048_576) {
        return NextResponse.json(
          { error: "File too large to preview (>1MB). Use the download endpoint instead." },
          { status: 413 },
        );
      }

      if (!isTextFile(resolved)) {
        return NextResponse.json(
          { error: "Binary file — use download endpoint", isText: false },
          { status: 415 },
        );
      }

      const content = await readFile(resolved, "utf-8");
      return NextResponse.json({
        type: "file",
        name: path.basename(resolved),
        content,
        mime: getMime(resolved),
        size: info.size,
        modified: info.mtime.toISOString(),
      });
    }

    // ── List directory ─────────────────────────────────────────────────
    if (info.isDirectory()) {
      // Ensure the directory exists (for fresh installs)
      await mkdir(resolved, { recursive: true });

      const names = await readdir(resolved);
      const entries = await Promise.all(
        names.map(async (name) => {
          try {
            const entryPath = path.join(resolved, name);
            const entryStat = await stat(entryPath);
            return {
              name,
              type: entryStat.isDirectory() ? ("directory" as const) : ("file" as const),
              size: entryStat.isFile() ? entryStat.size : null,
              modified: entryStat.mtime.toISOString(),
              isText: entryStat.isFile() ? isTextFile(name) : null,
            };
          } catch {
            return null;
          }
        }),
      );

      // Filter nulls, sort: directories first, then alphabetical
      const sorted = entries
        .filter(Boolean)
        .sort((a, b) => {
          if (a!.type !== b!.type) return a!.type === "directory" ? -1 : 1;
          return a!.name.localeCompare(b!.name);
        });

      return NextResponse.json({
        type: "directory",
        path: relativePath || "/",
        entries: sorted,
      });
    }

    return NextResponse.json({ error: "Not a file or directory" }, { status: 400 });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // If the root data dir doesn't exist, create it and return empty listing
      if (resolved === DATA_ROOT || relativePath === "" || relativePath === "/") {
        await mkdir(DATA_ROOT, { recursive: true });
        return NextResponse.json({ type: "directory", path: "/", entries: [] });
      }
      return NextResponse.json({ error: "Path not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to read path" }, { status: 500 });
  }
}
