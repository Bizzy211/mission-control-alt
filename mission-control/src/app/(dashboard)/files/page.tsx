"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  FolderOpen, File, FileText, FileCode, FileJson,
  ChevronRight, Download, ArrowLeft, Folder, RefreshCw,
  Home, Clock, HardDrive, Search, Music, Film, FileImage,
  FileSpreadsheet, Globe, ExternalLink, Maximize2, Minimize2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/error-state";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark-dimmed.css";

// ─── Types ──────────────────────────────────────────────────────────────────

type ViewerType = "markdown" | "code" | "json" | "csv" | "pdf" | "image" | "html" | "docx" | "audio" | "video" | "unsupported";

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

interface FileInfo {
  name: string;
  size: number;
  modified: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const EXT_VIEWER_MAP: Record<string, ViewerType> = {
  md: "markdown",
  pdf: "pdf",
  csv: "csv",
  docx: "docx",
  html: "html", htm: "html",
  png: "image", jpg: "image", jpeg: "image", gif: "image",
  svg: "image", webp: "image", ico: "image", bmp: "image", avif: "image",
  mp3: "audio", wav: "audio", ogg: "audio", flac: "audio", aac: "audio", m4a: "audio",
  mp4: "video", webm: "video", mov: "video", avi: "video", mkv: "video",
  json: "json",
  ts: "code", tsx: "code", js: "code", jsx: "code",
  py: "code", sh: "code", bash: "code",
  css: "code", sql: "code", xml: "code",
  yaml: "code", yml: "code", toml: "code",
  txt: "code", log: "code", env: "code", conf: "code",
  ini: "code", cfg: "code",
};

const TEXT_VIEWERS = new Set<ViewerType>(["markdown", "code", "json", "csv", "html", "docx"]);

const EXT_BADGES: Record<string, { label: string; color: string }> = {
  md: { label: "MD", color: "bg-purple-500/15 text-purple-500" },
  json: { label: "JSON", color: "bg-amber-500/15 text-amber-500" },
  ts: { label: "TS", color: "bg-blue-500/15 text-blue-500" },
  tsx: { label: "TSX", color: "bg-blue-500/15 text-blue-500" },
  js: { label: "JS", color: "bg-yellow-500/15 text-yellow-500" },
  jsx: { label: "JSX", color: "bg-yellow-500/15 text-yellow-500" },
  py: { label: "PY", color: "bg-green-500/15 text-green-500" },
  sh: { label: "SH", color: "bg-lime-500/15 text-lime-500" },
  pdf: { label: "PDF", color: "bg-red-500/15 text-red-500" },
  csv: { label: "CSV", color: "bg-emerald-500/15 text-emerald-500" },
  html: { label: "HTML", color: "bg-orange-500/15 text-orange-500" },
  htm: { label: "HTML", color: "bg-orange-500/15 text-orange-500" },
  css: { label: "CSS", color: "bg-pink-500/15 text-pink-500" },
  docx: { label: "DOCX", color: "bg-blue-600/15 text-blue-600" },
  png: { label: "PNG", color: "bg-violet-500/15 text-violet-500" },
  jpg: { label: "JPG", color: "bg-violet-500/15 text-violet-500" },
  jpeg: { label: "JPG", color: "bg-violet-500/15 text-violet-500" },
  gif: { label: "GIF", color: "bg-violet-500/15 text-violet-500" },
  svg: { label: "SVG", color: "bg-violet-500/15 text-violet-500" },
  webp: { label: "WEBP", color: "bg-violet-500/15 text-violet-500" },
  mp3: { label: "MP3", color: "bg-fuchsia-500/15 text-fuchsia-500" },
  wav: { label: "WAV", color: "bg-fuchsia-500/15 text-fuchsia-500" },
  mp4: { label: "MP4", color: "bg-rose-500/15 text-rose-500" },
  webm: { label: "WEBM", color: "bg-rose-500/15 text-rose-500" },
  txt: { label: "TXT", color: "bg-gray-500/15 text-gray-500" },
  log: { label: "LOG", color: "bg-gray-500/15 text-gray-500" },
  sql: { label: "SQL", color: "bg-cyan-500/15 text-cyan-500" },
  xml: { label: "XML", color: "bg-teal-500/15 text-teal-500" },
  yaml: { label: "YAML", color: "bg-teal-500/15 text-teal-500" },
  yml: { label: "YAML", color: "bg-teal-500/15 text-teal-500" },
};

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  py: "python", sh: "bash", bash: "bash",
  css: "css", html: "html", htm: "html",
  json: "json", yaml: "yaml", yml: "yaml",
  sql: "sql", xml: "xml", md: "markdown",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function ext(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function getViewerType(name: string): ViewerType {
  return EXT_VIEWER_MAP[ext(name)] ?? "unsupported";
}

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
  const e = ext(name);
  if (e === "md") return FileText;
  if (e === "json") return FileJson;
  if (e === "pdf") return FileText;
  if (e === "csv") return FileSpreadsheet;
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp", "ico"].includes(e)) return FileImage;
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(e)) return Music;
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(e)) return Film;
  if (["html", "htm"].includes(e)) return Globe;
  if (["docx"].includes(e)) return FileText;
  if (["ts", "tsx", "js", "jsx", "py", "sh", "css", "sql", "xml"].includes(e)) return FileCode;
  return File;
}

function getViewerIcon(type: ViewerType) {
  switch (type) {
    case "markdown": return FileText;
    case "pdf": return FileText;
    case "image": return FileImage;
    case "audio": return Music;
    case "video": return Film;
    case "csv": return FileSpreadsheet;
    case "html": return Globe;
    case "docx": return FileText;
    case "json": return FileJson;
    case "code": return FileCode;
    default: return File;
  }
}

// ─── CSV Parser ─────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const parse = (line: string) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  };
  return { headers: parse(lines[0]), rows: lines.slice(1).map(parse) };
}

// ─── Markdown Components ────────────────────────────────────────────────────

const mdComponents = {
  h1: ({ children, ...p }: React.ComponentProps<"h1">) => <h1 className="text-2xl font-bold mt-8 mb-4 first:mt-0 tracking-tight" {...p}>{children}</h1>,
  h2: ({ children, ...p }: React.ComponentProps<"h2">) => <h2 className="text-xl font-semibold mt-8 mb-3 pb-2 border-b border-border" {...p}>{children}</h2>,
  h3: ({ children, ...p }: React.ComponentProps<"h3">) => <h3 className="text-lg font-semibold mt-6 mb-2" {...p}>{children}</h3>,
  h4: ({ children, ...p }: React.ComponentProps<"h4">) => <h4 className="text-base font-semibold mt-5 mb-1" {...p}>{children}</h4>,
  p: ({ children, ...p }: React.ComponentProps<"p">) => <p className="mb-4 leading-7 text-foreground/90" {...p}>{children}</p>,
  a: ({ children, ...p }: React.ComponentProps<"a">) => <a className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity" target="_blank" rel="noopener noreferrer" {...p}>{children}</a>,
  ul: ({ children, ...p }: React.ComponentProps<"ul">) => <ul className="list-disc pl-6 mb-4 space-y-1.5" {...p}>{children}</ul>,
  ol: ({ children, ...p }: React.ComponentProps<"ol">) => <ol className="list-decimal pl-6 mb-4 space-y-1.5" {...p}>{children}</ol>,
  li: ({ children, ...p }: React.ComponentProps<"li">) => <li className="leading-7" {...p}>{children}</li>,
  blockquote: ({ children, ...p }: React.ComponentProps<"blockquote">) => (
    <blockquote className="border-l-[3px] border-primary/60 pl-4 my-4 text-muted-foreground italic" {...p}>{children}</blockquote>
  ),
  hr: (p: React.ComponentProps<"hr">) => <hr className="my-8 border-border" {...p} />,
  pre: ({ children, ...p }: React.ComponentProps<"pre">) => (
    <pre className="rounded-lg my-4 overflow-hidden [&>code]:block [&>code]:p-4 [&>code]:overflow-x-auto text-sm" {...p}>{children}</pre>
  ),
  code: ({ className, children, ...p }: React.ComponentProps<"code"> & { className?: string }) => {
    if (className && /language-/.test(className)) {
      return <code className={className} {...p}>{children}</code>;
    }
    return <code className="bg-muted px-1.5 py-0.5 rounded text-[0.85em] font-mono" {...p}>{children}</code>;
  },
  table: ({ children, ...p }: React.ComponentProps<"table">) => (
    <div className="my-4 overflow-x-auto rounded-lg border"><table className="w-full text-sm" {...p}>{children}</table></div>
  ),
  thead: ({ children, ...p }: React.ComponentProps<"thead">) => <thead className="bg-muted/50" {...p}>{children}</thead>,
  th: ({ children, ...p }: React.ComponentProps<"th">) => <th className="px-4 py-2.5 text-left font-semibold text-xs uppercase tracking-wider border-b" {...p}>{children}</th>,
  td: ({ children, ...p }: React.ComponentProps<"td">) => <td className="px-4 py-2 border-b border-border/40" {...p}>{children}</td>,
  img: ({ alt, ...p }: React.ComponentProps<"img">) => <img alt={alt ?? ""} className="max-w-full rounded-lg my-4 shadow-sm" {...p} />,
  input: ({ ...p }: React.ComponentProps<"input">) => <input className="mr-2 accent-primary" disabled {...p} />,
};

// ─── Page Component ─────────────────────────────────────────────────────────

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");

  // Viewer state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewerType, setViewerType] = useState<ViewerType | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Fetch directory listing ──────────────────────────────────────────
  const fetchDir = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(dirPath)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load directory");
      }
      const data = (await res.json()) as DirResponse;
      setEntries(data.entries);
      setCurrentPath(dirPath);
      setSearchFilter("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Handle file selection ────────────────────────────────────────────
  const selectFile = useCallback(async (filePath: string) => {
    const name = filePath.split("/").pop() ?? "";
    const type = getViewerType(name);

    setSelectedFile(filePath);
    setViewerType(type);
    setFileLoading(true);
    setFileError(null);
    setTextContent(null);
    setPreviewUrl(null);

    try {
      if (TEXT_VIEWERS.has(type)) {
        const res = await fetch(`/api/files?path=${encodeURIComponent(filePath)}&content=true`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to load file");
        }
        const data = await res.json();
        setTextContent(data.content);
        setFileInfo({ name: data.name, size: data.size, modified: data.modified });
      } else {
        // Binary — set preview URL and fetch metadata
        setPreviewUrl(`/api/files/download?path=${encodeURIComponent(filePath)}&inline=true`);
        const res = await fetch(`/api/files?path=${encodeURIComponent(filePath)}`);
        if (res.ok) {
          const data = await res.json();
          setFileInfo({ name: data.name, size: data.size, modified: data.modified });
        }
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setFileLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchDir(""); }, [fetchDir]);

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  // ── Navigation ──────────────────────────────────────────────────────
  const clearViewer = () => { setSelectedFile(null); setViewerType(null); setTextContent(null); setPreviewUrl(null); setFileInfo(null); setFileError(null); };
  const navigateTo = (entry: FileEntry) => {
    const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    if (entry.type === "directory") { fetchDir(newPath); clearViewer(); }
    else { selectFile(newPath); }
  };
  const navigateUp = () => { fetchDir(currentPath.split("/").slice(0, -1).join("/")); clearViewer(); };
  const navigateToSegment = (i: number) => { fetchDir(currentPath.split("/").filter(Boolean).slice(0, i + 1).join("/")); clearViewer(); };
  const navigateHome = () => { fetchDir(""); clearViewer(); };

  const pathSegments = useMemo(() => currentPath.split("/").filter(Boolean), [currentPath]);

  const downloadUrl = selectedFile ? `/api/files/download?path=${encodeURIComponent(selectedFile)}` : null;

  // ── Filtered entries ─────────────────────────────────────────────────
  const filteredEntries = useMemo(() => {
    if (!searchFilter) return entries;
    const q = searchFilter.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, searchFilter]);

  const stats = useMemo(() => {
    const dirs = entries.filter((e) => e.type === "directory").length;
    const files = entries.filter((e) => e.type === "file").length;
    return { dirs, files };
  }, [entries]);

  // ─── Viewer renderer ─────────────────────────────────────────────────
  function renderViewer(fullscreen = false) {
    if (!viewerType || !fileInfo) return null;
    const dl = downloadUrl ?? "#";

    switch (viewerType) {
      case "markdown":
        return (
          <article className="max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={mdComponents}>
              {textContent ?? ""}
            </ReactMarkdown>
          </article>
        );

      case "json":
        try {
          const formatted = JSON.stringify(JSON.parse(textContent ?? ""), null, 2);
          return (
            <pre className="rounded-lg overflow-hidden"><code className="hljs language-json block p-4 overflow-x-auto text-sm">{formatted}</code></pre>
          );
        } catch {
          return <pre className="text-sm font-mono bg-muted/50 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">{textContent}</pre>;
        }

      case "csv": {
        const { headers, rows } = parseCSV(textContent ?? "");
        return (
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/70 sticky top-0 z-10">
                <tr>{headers.map((h, i) => <th key={i} className="px-4 py-2.5 text-left font-semibold text-xs uppercase tracking-wider border-b whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-transparent" : "bg-muted/20"}>
                    {row.map((cell, j) => <td key={j} className="px-4 py-2 border-b border-border/30 whitespace-nowrap">{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/30">
              {rows.length} row{rows.length !== 1 ? "s" : ""} × {headers.length} column{headers.length !== 1 ? "s" : ""}
            </div>
          </div>
        );
      }

      case "code":
        return (
          <pre className="rounded-lg overflow-hidden">
            <code className={`hljs language-${LANG_MAP[ext(fileInfo.name)] ?? "plaintext"} block p-4 overflow-x-auto text-sm`}>
              {textContent}
            </code>
          </pre>
        );

      case "html":
        return (
          <div className={cn("space-y-2", fullscreen && "flex flex-col h-[calc(100vh-5rem)]")}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
              <Globe className="h-3 w-3" /> HTML Preview (sandboxed)
            </div>
            <iframe
              srcDoc={textContent ?? ""}
              sandbox="allow-same-origin"
              className={cn("w-full rounded-lg border bg-white", fullscreen ? "flex-1 min-h-0" : "min-h-[600px]")}
              title="HTML Preview"
            />
          </div>
        );

      case "docx":
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" /> Converted from DOCX
            </div>
            <div
              className="prose prose-sm dark:prose-invert max-w-none p-4 rounded-lg border bg-card"
              dangerouslySetInnerHTML={{ __html: textContent ?? "" }}
            />
          </div>
        );

      case "pdf":
        return (
          <div className={cn("space-y-2", fullscreen && "flex flex-col h-[calc(100vh-5rem)]")}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
              <FileText className="h-3 w-3" /> PDF Document
              <a href={previewUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="ml-auto text-primary hover:underline flex items-center gap-1">
                Open in new tab <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <iframe
              src={previewUrl ?? ""}
              className={cn("w-full rounded-lg border", fullscreen ? "flex-1 min-h-0" : "min-h-[700px]")}
              title="PDF Preview"
            />
          </div>
        );

      case "image":
        return (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <img
              src={previewUrl ?? ""}
              alt={fileInfo.name}
              className={cn("max-w-full rounded-lg shadow-lg object-contain", fullscreen ? "max-h-[calc(100vh-10rem)]" : "max-h-[70vh]")}
            />
            <p className="text-xs text-muted-foreground">
              {fileInfo.name} — {formatSize(fileInfo.size)}
            </p>
          </div>
        );

      case "audio":
        return (
          <div className="flex flex-col items-center justify-center py-16 gap-6">
            <div className="h-24 w-24 rounded-2xl bg-fuchsia-500/10 flex items-center justify-center">
              <Music className="h-12 w-12 text-fuchsia-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">{fileInfo.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatSize(fileInfo.size)}</p>
            </div>
            <audio controls src={previewUrl ?? ""} className="w-full max-w-lg" />
          </div>
        );

      case "video":
        return (
          <div className="flex flex-col items-center justify-center py-4 gap-3">
            <video
              controls
              src={previewUrl ?? ""}
              className={cn("max-w-full rounded-lg shadow-lg", fullscreen ? "max-h-[calc(100vh-10rem)]" : "max-h-[70vh]")}
            />
            <p className="text-xs text-muted-foreground">
              {fileInfo.name} — {formatSize(fileInfo.size)}
            </p>
          </div>
        );

      case "unsupported":
      default: {
        const fileExt = ext(fileInfo.name).toUpperCase() || "FILE";
        const VIcon = getViewerIcon(viewerType ?? "unsupported");
        return (
          <div className="flex flex-col items-center justify-center py-16 gap-5">
            <div className="relative">
              <div className="h-24 w-24 rounded-2xl bg-muted flex items-center justify-center">
                <VIcon className="h-12 w-12 text-muted-foreground/60" />
              </div>
              <Badge className="absolute -bottom-2 -right-2 text-[10px] px-1.5">{fileExt}</Badge>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">{fileInfo.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatSize(fileInfo.size)}</p>
              <p className="text-xs text-muted-foreground mt-3">Preview not available for this file type</p>
            </div>
            <a href={dl} download className="mt-2">
              <Button className="gap-2">
                <Download className="h-4 w-4" />
                Download File
              </Button>
            </a>
          </div>
        );
      }
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────

  if (loading && !entries.length) {
    return (
      <div className="space-y-6">
        <BreadcrumbNav items={[{ label: "Deliverables" }]} />
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
        <BreadcrumbNav items={[{ label: "Deliverables" }]} />
        <ErrorState message={error} onRetry={() => fetchDir(currentPath)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BreadcrumbNav items={[{ label: "Deliverables" }]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Deliverables
        </h1>
        <div className="flex items-center gap-2">
          {(stats.files > 0 || stats.dirs > 0) && (
            <Badge variant="secondary" className="text-xs gap-1">
              <HardDrive className="h-3 w-3" />
              {stats.files} file{stats.files !== 1 ? "s" : ""}
              {stats.dirs > 0 && `, ${stats.dirs} folder${stats.dirs !== 1 ? "s" : ""}`}
            </Badge>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => fetchDir(currentPath)}>
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
                currentPath === "" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <Home className="h-3 w-3" />
              deliverables
            </button>
            {pathSegments.map((seg, i) => (
              <span key={i} className="flex items-center gap-1 shrink-0">
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                <button
                  onClick={() => navigateToSegment(i)}
                  className={cn(
                    "px-2 py-1 rounded-md text-xs font-medium transition-colors",
                    i === pathSegments.length - 1 ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted",
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
          {/* Search filter */}
          {entries.length > 5 && (
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter files…"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
          )}
          <ScrollArea className="flex-1">
            <div className="p-1">
              {currentPath && (
                <button onClick={navigateUp} className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted group">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10">
                    <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <span className="text-muted-foreground group-hover:text-foreground">..</span>
                </button>
              )}

              {filteredEntries.map((entry) => {
                const Icon = getFileIcon(entry.name, entry.type);
                const isSelected = selectedFile === (currentPath ? `${currentPath}/${entry.name}` : entry.name);
                const badge = entry.type === "file" ? (EXT_BADGES[ext(entry.name)] ?? { label: ext(entry.name).toUpperCase(), color: "bg-muted text-muted-foreground" }) : null;
                const vType = entry.type === "file" ? getViewerType(entry.name) : null;
                const isClickable = entry.type === "directory" || (vType && vType !== "unsupported") || entry.isText;

                return (
                  <button
                    key={entry.name}
                    onClick={() => navigateTo(entry)}
                    disabled={!isClickable}
                    className={cn(
                      "flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm transition-all group text-left",
                      isSelected ? "bg-primary/10 text-primary" : isClickable ? "hover:bg-muted" : "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                      isSelected ? "bg-primary/20" : entry.type === "directory" ? "bg-blue-500/10 group-hover:bg-blue-500/20" : "bg-muted group-hover:bg-muted/80",
                    )}>
                      <Icon className={cn("h-4 w-4", isSelected ? "text-primary" : entry.type === "directory" ? "text-blue-500" : "text-muted-foreground")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-medium text-xs">{entry.name}</p>
                        {badge && <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded", badge.color)}>{badge.label}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {entry.size !== null && <span className="text-[10px] text-muted-foreground">{formatSize(entry.size)}</span>}
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />{formatDate(entry.modified)}
                        </span>
                      </div>
                    </div>
                    {entry.type === "directory" && <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
                  </button>
                );
              })}

              {filteredEntries.length === 0 && !searchFilter && (
                <EmptyState icon={FolderOpen} title="Empty directory" description="No deliverables here yet. Agent outputs will appear as they're created." compact />
              )}
              {filteredEntries.length === 0 && searchFilter && (
                <EmptyState icon={Search} title="No matches" description={`No files matching "${searchFilter}"`} compact />
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* ── Right: Content Viewer ───────────────────────────────────── */}
        <Card className="flex flex-col overflow-hidden">
          {!selectedFile && !fileLoading && (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState icon={FileText} title="No file selected" description="Select a file from the directory listing to preview its contents." />
            </div>
          )}

          {fileLoading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            </div>
          )}

          {fileError && !fileLoading && (
            <div className="flex-1 flex items-center justify-center">
              <ErrorState message={fileError} onRetry={() => selectedFile && selectFile(selectedFile)} />
            </div>
          )}

          {!fileLoading && !fileError && fileInfo && viewerType && (
            <>
              {/* File header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  {(() => { const I = getFileIcon(fileInfo.name, "file"); return <I className="h-4 w-4 text-muted-foreground shrink-0" />; })()}
                  <span className="text-sm font-medium truncate">{fileInfo.name}</span>
                  {(() => {
                    const b = EXT_BADGES[ext(fileInfo.name)];
                    return b ? <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0", b.color)}>{b.label}</span> : null;
                  })()}
                  <Badge variant="secondary" className="text-[10px] shrink-0">{formatSize(fileInfo.size)}</Badge>
                  <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">{formatDate(fileInfo.modified)}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setIsFullscreen(true)}>
                    <Maximize2 className="h-3 w-3" /> Fullscreen
                  </Button>
                  {downloadUrl && (
                    <a href={downloadUrl} download className="inline-flex">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                        <Download className="h-3 w-3" /> Download
                      </Button>
                    </a>
                  )}
                </div>
              </div>

              {/* Content */}
              <ScrollArea className="flex-1">
                <div className="p-4 lg:p-6">
                  {renderViewer()}
                </div>
              </ScrollArea>
            </>
          )}
        </Card>
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && viewerType && fileInfo && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {(() => { const I = getFileIcon(fileInfo.name, "file"); return <I className="h-4 w-4 text-muted-foreground shrink-0" />; })()}
              <span className="text-sm font-medium truncate">{fileInfo.name}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0">{formatSize(fileInfo.size)}</Badge>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {downloadUrl && (
                <a href={downloadUrl} download className="inline-flex">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                    <Download className="h-3 w-3" /> Download
                  </Button>
                </a>
              )}
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setIsFullscreen(false)}>
                <Minimize2 className="h-3 w-3" /> Exit
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {renderViewer(true)}
          </div>
        </div>
      )}
    </div>
  );
}
