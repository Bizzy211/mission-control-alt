"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  FolderOpen,
  File,
  FileText,
  FileCode,
  FileJson,
  ChevronRight,
  Download,
  ArrowLeft,
  Folder,
  RefreshCw,
  Home,
  Clock,
  HardDrive,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ErrorState } from "@/components/error-state";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  type: "file" | "directory";
  size: number | null;
  modified: string;
  isText: boolean | null;
}

interface DirResponse {
  type: "directory";
  path: string;
  entries: FileEntry[];
}

interface FileContentResponse {
  type: "file";
  name: string;
  content: string;
  mime: string;
  size: number;
  modified: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHrs = diffMs / (1000 * 60 * 60);
  if (diffMs < 60_000) return "just now";
  if (diffHrs < 1) return `${Math.round(diffMs / 60_000)}m ago`;
  if (diffHrs < 24) return `${Math.round(diffHrs)}h ago`;
  if (diffHrs < 48) return "yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getFileIcon(name: string, type: "file" | "directory") {
  if (type === "directory") return Folder;
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md": return FileText;
    case "json": return FileJson;
    case "ts": case "tsx": case "js": case "jsx": case "py": case "sh":
    case "css": case "html": case "sql": return FileCode;
    default: return File;
  }
}

function getLanguage(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", sh: "bash", css: "css", html: "html",
    json: "json", yaml: "yaml", yml: "yaml", sql: "sql",
    xml: "xml", md: "markdown", txt: "text",
  };
  return map[ext] ?? "text";
}

// ─── Simple Markdown Renderer ───────────────────────────────────────────────

function renderMarkdown(raw: string): string {
  let html = raw;

  // Escape HTML
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<pre class="mk-pre"><code class="mk-code" data-lang="${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code class="mk-inline-code">$1</code>');

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4 class="mk-h4">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="mk-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="mk-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="mk-h1">$1</h1>');

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr class="mk-hr" />');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="mk-link">$1</a>',
  );

  // Unordered lists
  html = html.replace(/^(\s*)[-*] (.+)$/gm, '$1<li class="mk-li">$2</li>');
  // Wrap consecutive li elements in ul
  html = html.replace(/((?:<li class="mk-li">.*<\/li>\n?)+)/g, '<ul class="mk-ul">$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="mk-oli">$1</li>');
  html = html.replace(/((?:<li class="mk-oli">.*<\/li>\n?)+)/g, '<ol class="mk-ol">$1</ol>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="mk-bq">$1</blockquote>');

  // Paragraphs: wrap remaining non-empty, non-tag lines
  html = html.replace(/^(?!<[a-z/])(.+)$/gm, (_, line) => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    return `<p class="mk-p">${trimmed}</p>`;
  });

  return html;
}

// ─── Page Component ─────────────────────────────────────────────────────────

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FileContentResponse | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // ── Fetch directory listing ──────────────────────────────────────────
  const fetchDir = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(dirPath)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to load directory`);
      }
      const data = (await res.json()) as DirResponse;
      setEntries(data.entries);
      setCurrentPath(dirPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch file content ───────────────────────────────────────────────
  const fetchFile = useCallback(async (filePath: string) => {
    setFileLoading(true);
    setFileError(null);
    setSelectedFile(filePath);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(filePath)}&content=true`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load file");
      }
      const data = (await res.json()) as FileContentResponse;
      setFileContent(data);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Unknown error");
      setFileContent(null);
    } finally {
      setFileLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchDir("");
  }, [fetchDir]);

  // ── Navigation helpers ───────────────────────────────────────────────
  const navigateTo = (entry: FileEntry) => {
    const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    if (entry.type === "directory") {
      fetchDir(newPath);
      setSelectedFile(null);
      setFileContent(null);
    } else if (entry.isText) {
      fetchFile(newPath);
    }
  };

  const navigateUp = () => {
    const parent = currentPath.split("/").slice(0, -1).join("/");
    fetchDir(parent);
    setSelectedFile(null);
    setFileContent(null);
  };

  const navigateToSegment = (index: number) => {
    const segments = currentPath.split("/").filter(Boolean);
    const newPath = segments.slice(0, index + 1).join("/");
    fetchDir(newPath);
    setSelectedFile(null);
    setFileContent(null);
  };

  const navigateHome = () => {
    fetchDir("");
    setSelectedFile(null);
    setFileContent(null);
  };

  // ── Path segments for breadcrumb ─────────────────────────────────────
  const pathSegments = useMemo(
    () => currentPath.split("/").filter(Boolean),
    [currentPath],
  );

  // ── Download URL ─────────────────────────────────────────────────────
  const downloadUrl = selectedFile
    ? `/api/files/download?path=${encodeURIComponent(selectedFile)}`
    : null;

  // ── Render markdown or code ──────────────────────────────────────────
  const renderedContent = useMemo(() => {
    if (!fileContent) return null;
    if (fileContent.mime === "text/markdown") {
      return { type: "markdown" as const, html: renderMarkdown(fileContent.content) };
    }
    return { type: "code" as const, language: getLanguage(fileContent.name), code: fileContent.content };
  }, [fileContent]);

  // ─── Stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const dirs = entries.filter((e) => e.type === "directory").length;
    const files = entries.filter((e) => e.type === "file").length;
    const totalSize = entries.reduce((sum, e) => sum + (e.size ?? 0), 0);
    return { dirs, files, totalSize };
  }, [entries]);

  // ─── Render ──────────────────────────────────────────────────────────

  if (loading && !entries.length) {
    return (
      <div className="space-y-6">
        <BreadcrumbNav items={[{ label: "Files" }]} />
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading files…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <BreadcrumbNav items={[{ label: "Files" }]} />
        <ErrorState message={error} onRetry={() => fetchDir(currentPath)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BreadcrumbNav items={[{ label: "Files" }]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Files
        </h1>
        <div className="flex items-center gap-2">
          {stats.files > 0 && (
            <Badge variant="secondary" className="text-xs gap-1">
              <HardDrive className="h-3 w-3" />
              {stats.files} file{stats.files !== 1 ? "s" : ""}
              {stats.dirs > 0 && `, ${stats.dirs} folder${stats.dirs !== 1 ? "s" : ""}`}
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => fetchDir(currentPath)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Path breadcrumb bar */}
      <Card className="bg-card/50">
        <CardContent className="py-2 px-3">
          <div className="flex items-center gap-1 text-sm overflow-x-auto">
            <button
              onClick={navigateHome}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors shrink-0",
                currentPath === ""
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <Home className="h-3 w-3" />
              data
            </button>
            {pathSegments.map((seg, i) => (
              <span key={i} className="flex items-center gap-1 shrink-0">
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                <button
                  onClick={() => navigateToSegment(i)}
                  className={cn(
                    "px-2 py-1 rounded-md text-xs font-medium transition-colors",
                    i === pathSegments.length - 1
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {seg}
                </button>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 min-h-[500px]">
        {/* ── Left: Directory Listing ──────────────────────────────────── */}
        <Card className="flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-1">
              {/* Parent directory link */}
              {currentPath && (
                <button
                  onClick={navigateUp}
                  className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted group"
                >
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10">
                    <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <span className="text-muted-foreground group-hover:text-foreground">..</span>
                </button>
              )}

              {/* Entries */}
              {entries.map((entry) => {
                const Icon = getFileIcon(entry.name, entry.type);
                const isSelected =
                  selectedFile ===
                  (currentPath ? `${currentPath}/${entry.name}` : entry.name);
                const isClickable = entry.type === "directory" || entry.isText;

                return (
                  <button
                    key={entry.name}
                    onClick={() => navigateTo(entry)}
                    disabled={!isClickable}
                    className={cn(
                      "flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm transition-all group text-left",
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : isClickable
                          ? "hover:bg-muted"
                          : "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <div
                      className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                        isSelected
                          ? "bg-primary/20"
                          : entry.type === "directory"
                            ? "bg-blue-500/10 group-hover:bg-blue-500/20"
                            : "bg-muted group-hover:bg-muted/80",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4",
                          isSelected
                            ? "text-primary"
                            : entry.type === "directory"
                              ? "text-blue-500"
                              : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-xs">{entry.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {entry.size !== null && (
                          <span className="text-[10px] text-muted-foreground">
                            {formatSize(entry.size)}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {formatDate(entry.modified)}
                        </span>
                      </div>
                    </div>
                    {entry.type === "directory" && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                    )}
                  </button>
                );
              })}

              {entries.length === 0 && (
                <EmptyState
                  icon={FolderOpen}
                  title="Empty directory"
                  description="No files here yet. Agent outputs will appear as they're created."
                  compact
                />
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* ── Right: Content Viewer ───────────────────────────────────── */}
        <Card className="flex flex-col overflow-hidden">
          {!selectedFile && !fileLoading && (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={FileText}
                title="No file selected"
                description="Select a file from the directory listing to preview its contents."
              />
            </div>
          )}

          {fileLoading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading file…</span>
              </div>
            </div>
          )}

          {fileError && (
            <div className="flex-1 flex items-center justify-center">
              <ErrorState
                message={fileError}
                onRetry={() => selectedFile && fetchFile(selectedFile)}
              />
            </div>
          )}

          {fileContent && !fileLoading && !fileError && (
            <>
              {/* File header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  {(() => {
                    const Icon = getFileIcon(fileContent.name, "file");
                    return <Icon className="h-4 w-4 text-muted-foreground shrink-0" />;
                  })()}
                  <span className="text-sm font-medium truncate">{fileContent.name}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {formatSize(fileContent.size)}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDate(fileContent.modified)}
                  </span>
                </div>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download
                    className="inline-flex"
                  >
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                      <Download className="h-3 w-3" />
                      Download
                    </Button>
                  </a>
                )}
              </div>

              {/* File content */}
              <ScrollArea className="flex-1">
                <div className="p-4 lg:p-6">
                  {renderedContent?.type === "markdown" ? (
                    <article
                      className="mk-article"
                      dangerouslySetInnerHTML={{ __html: renderedContent.html }}
                    />
                  ) : (
                    <pre className="text-sm font-mono bg-muted/50 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed">
                      <code>{renderedContent?.code}</code>
                    </pre>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </Card>
      </div>

      {/* Markdown styles */}
      <style jsx global>{`
        .mk-article {
          line-height: 1.75;
          color: var(--foreground);
        }
        .mk-h1 {
          font-size: 1.75rem;
          font-weight: 700;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          line-height: 1.25;
          letter-spacing: -0.02em;
        }
        .mk-h2 {
          font-size: 1.35rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
          line-height: 1.3;
          padding-bottom: 0.4rem;
          border-bottom: 1px solid hsl(var(--border));
        }
        .mk-h3 {
          font-size: 1.1rem;
          font-weight: 600;
          margin-top: 1.25rem;
          margin-bottom: 0.4rem;
          line-height: 1.4;
        }
        .mk-h4 {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.25rem;
        }
        .mk-p {
          margin-bottom: 0.75rem;
        }
        .mk-hr {
          border: none;
          border-top: 1px solid hsl(var(--border));
          margin: 1.5rem 0;
        }
        .mk-link {
          color: hsl(var(--primary));
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .mk-link:hover {
          opacity: 0.8;
        }
        .mk-ul, .mk-ol {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .mk-ul { list-style-type: disc; }
        .mk-ol { list-style-type: decimal; }
        .mk-li, .mk-oli {
          margin-bottom: 0.25rem;
          line-height: 1.6;
        }
        .mk-pre {
          background: hsl(var(--muted));
          border-radius: 0.5rem;
          padding: 1rem;
          margin: 1rem 0;
          overflow-x: auto;
        }
        .mk-code {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          font-size: 0.8rem;
          line-height: 1.6;
          white-space: pre;
        }
        .mk-inline-code {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          font-size: 0.85em;
          background: hsl(var(--muted));
          padding: 0.15rem 0.4rem;
          border-radius: 0.25rem;
        }
        .mk-bq {
          border-left: 3px solid hsl(var(--primary));
          padding-left: 1rem;
          margin: 1rem 0;
          color: hsl(var(--muted-foreground));
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
