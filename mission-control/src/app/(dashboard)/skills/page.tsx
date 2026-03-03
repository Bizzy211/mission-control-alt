"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  BookOpen,
  Tag,
  Terminal,
  Copy,
  Check,
  Search,
  Star,
  Download,
  ExternalLink,
  Sparkles,
  Loader2,
  Store,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Tip } from "@/components/ui/tip";
import { useSkills, useAgents } from "@/hooks/use-data";
import { SkillCardSkeleton } from "@/components/skeletons";
import { ErrorState } from "@/components/error-state";
import { apiFetch } from "@/lib/api-client";
import { SKILLS } from "@/lib/types";
import type { SkillDefinition } from "@/lib/types";
import { cn } from "@/lib/utils";

// ─── Shared components ────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleCopy} aria-label="Copy to clipboard">
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function SkillCard({ skill, agentNames }: { skill: SkillDefinition; agentNames: string[] }) {
  return (
    <Link href={`/skills/${skill.id}`}>
      <div className="group rounded-xl border bg-card p-5 transition-all hover:shadow-md hover:border-primary/30">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
              {skill.name}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {skill.description}
            </p>
          </div>
          <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>

        {agentNames.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {agentNames.slice(0, 5).map((name) => (
              <Badge key={name} variant="outline" className="text-[10px] px-1.5 py-0">
                {name}
              </Badge>
            ))}
            {agentNames.length > 5 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                +{agentNames.length - 5}
              </Badge>
            )}
          </div>
        )}

        {skill.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-2">
            <Tag className="h-3 w-3 text-muted-foreground" />
            <div className="flex flex-wrap gap-1">
              {skill.tags.slice(0, 4).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t line-clamp-2 font-mono">
          {skill.content.slice(0, 120)}...
        </p>
      </div>
    </Link>
  );
}

// ─── Store types ──────────────────────────────────────────────────────────────

interface StoreSkill {
  id: string;
  name: string;
  author: string;
  description: string;
  githubUrl: string;
  skillUrl: string;
  stars: number;
  score?: number;
  updatedAt: string;
}

// ─── Skill Store Tab ──────────────────────────────────────────────────────────

function SkillStoreTab({ installedNames, onInstalled }: { installedNames: Set<string>; onInstalled: () => void }) {
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"keyword" | "ai">("keyword");
  const [results, setResults] = useState<StoreSkill[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const doSearch = useCallback(async (q: string, p: number) => {
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    setNeedsSetup(false);

    try {
      const endpoint = searchMode === "ai" ? "ai-search" : "search";
      const params = new URLSearchParams({ q: q.trim(), page: String(p), limit: "20" });
      const res = await apiFetch(`/api/skill-store/${endpoint}?${params}`);
      const data = await res.json();

      if (!res.ok) {
        if (data.setup) {
          setNeedsSetup(true);
          return;
        }
        throw new Error(data.error || "Search failed");
      }

      setResults(p === 1 ? data.skills : (prev: StoreSkill[]) => [...prev, ...data.skills]);
      setTotal(data.pagination?.total ?? data.skills.length);
      setHasMore(data.pagination?.hasNext ?? false);
      setPage(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [searchMode]);

  const handleSearch = () => {
    setResults([]);
    doSearch(query, 1);
  };

  const handleInstall = async (skill: StoreSkill) => {
    setInstalling(skill.id);
    try {
      const res = await apiFetch("/api/skill-store/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: skill.name,
          description: skill.description,
          content: `# ${skill.name}\n\nInstalled from Skill Store.\nAuthor: ${skill.author}\nSource: ${skill.githubUrl || skill.skillUrl || "SkillsMP"}`,
          source: skill.githubUrl || skill.skillUrl || "",
          tags: [skill.author],
        }),
      });

      if (res.ok) {
        onInstalled();
      } else {
        const data = await res.json();
        setError(data.error || "Install failed");
      }
    } catch {
      setError("Failed to install skill");
    } finally {
      setInstalling(null);
    }
  };

  if (needsSetup) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <AlertCircle className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-semibold">Skill Store Setup Required</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          To search the SkillsMP marketplace (350K+ skills), add your API key to the environment:
        </p>
        <code className="block text-xs bg-muted px-4 py-2 rounded-lg font-mono">
          SKILLSMP_API_KEY=sk_live_...
        </code>
        <p className="text-xs text-muted-foreground">
          Get a free key at{" "}
          <a href="https://skillsmp.com/docs/api" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            skillsmp.com/docs/api
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchMode === "ai" ? "Describe what you need..." : "Search skills..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-lg border overflow-hidden">
          <button
            onClick={() => setSearchMode("keyword")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              searchMode === "keyword" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
            )}
          >
            <Search className="h-3.5 w-3.5 inline mr-1" />
            Keyword
          </button>
          <button
            onClick={() => setSearchMode("ai")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              searchMode === "ai" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
            )}
          >
            <Sparkles className="h-3.5 w-3.5 inline mr-1" />
            AI
          </button>
        </div>
        <Button onClick={handleSearch} disabled={searching || !query.trim()} size="sm" className="gap-1.5">
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Search
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length === 0 && !searching && !error && (
        <div className="text-center py-12">
          <Store className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Search the SkillsMP marketplace to discover agent skills.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            350K+ skills from the open SKILL.md ecosystem
          </p>
        </div>
      )}

      {searching && results.length === 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkillCardSkeleton />
          <SkillCardSkeleton />
          <SkillCardSkeleton />
          <SkillCardSkeleton />
          <SkillCardSkeleton />
          <SkillCardSkeleton />
        </div>
      )}

      {results.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {total.toLocaleString()} results
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((skill) => {
              const isInstalled = installedNames.has(skill.name.toLowerCase());
              return (
                <div
                  key={skill.id}
                  className="rounded-xl border bg-card p-5 transition-all hover:shadow-md hover:border-primary/30"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate">{skill.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        by <span className="font-medium">{skill.author}</span>
                      </p>
                    </div>
                    {skill.stars > 0 && (
                      <div className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0 ml-2">
                        <Star className="h-3 w-3" />
                        {skill.stars.toLocaleString()}
                      </div>
                    )}
                    {skill.score != null && skill.score > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0 ml-2">
                        {Math.round(skill.score * 100)}% match
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground mt-2 line-clamp-3">
                    {skill.description || "No description available"}
                  </p>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    {isInstalled ? (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Check className="h-3 w-3" /> Installed
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={installing === skill.id}
                        onClick={() => handleInstall(skill)}
                      >
                        {installing === skill.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                        Install
                      </Button>
                    )}
                    {skill.githubUrl && (
                      <a
                        href={skill.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 ml-auto"
                      >
                        <ExternalLink className="h-3 w-3" /> GitHub
                      </a>
                    )}
                    {skill.skillUrl && (
                      <a
                        href={skill.skillUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> Details
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="text-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => doSearch(query, page + 1)}
                disabled={searching}
                className="gap-1.5"
              >
                {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SkillsPage() {
  const { skills, loading, error: skillsError, refetch } = useSkills();
  const { agents } = useAgents();
  const router = useRouter();
  const [tab, setTab] = useState<"my-skills" | "store">("my-skills");

  const getAgentNames = (agentIds: string[]) =>
    agentIds.map((id) => agents.find((a) => a.id === id)?.name ?? id);

  const installedNames = new Set(skills.map((s) => s.name.toLowerCase()));

  if (loading) {
    return (
      <div className="space-y-6">
        <BreadcrumbNav items={[{ label: "Skills Library" }]} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkillCardSkeleton />
          <SkillCardSkeleton />
          <SkillCardSkeleton />
        </div>
      </div>
    );
  }

  if (skillsError) {
    return (
      <div className="space-y-6">
        <BreadcrumbNav items={[{ label: "Skills Library" }]} />
        <ErrorState message={skillsError} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BreadcrumbNav items={[{ label: "Skills Library" }]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Skills Library</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {skills.length} skill{skills.length !== 1 ? "s" : ""} installed
          </p>
        </div>
        <Tip content="Create a new skill">
          <Button size="sm" onClick={() => router.push("/skills/new")} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Skill
          </Button>
        </Tip>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1">
        <Button
          variant={tab === "my-skills" ? "default" : "ghost"}
          size="sm"
          className="text-xs gap-1.5"
          onClick={() => setTab("my-skills")}
        >
          <BookOpen className="h-3.5 w-3.5" /> My Skills
        </Button>
        <Button
          variant={tab === "store" ? "default" : "ghost"}
          size="sm"
          className="text-xs gap-1.5"
          onClick={() => setTab("store")}
        >
          <Store className="h-3.5 w-3.5" /> Skill Store
        </Button>
      </div>

      {/* Tab content */}
      {tab === "my-skills" && (
        <>
          {skills.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No skills yet"
              description="Skills define specialized knowledge that agents can use. Create your first skill or browse the Skill Store."
              actionLabel="Browse Skill Store"
              onAction={() => setTab("store")}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {skills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  agentNames={getAgentNames(skill.agentIds)}
                />
              ))}
            </div>
          )}

          {/* AI Commands */}
          <div className="rounded-xl border bg-card">
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Terminal className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">AI Commands</h2>
                <p className="text-xs text-muted-foreground">
                  Slash commands for Claude Code — type in the CLI to activate
                </p>
              </div>
            </div>
            <div className="divide-y">
              {SKILLS.map((skill) => (
                <div key={skill.command} className="flex items-center gap-3 px-5 py-2.5">
                  <code className="text-xs font-mono font-medium text-primary min-w-[130px]">
                    {skill.command}
                  </code>
                  <span className="text-xs text-muted-foreground flex-1">
                    {skill.longDescription}
                  </span>
                  <CopyButton text={skill.command} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "store" && (
        <SkillStoreTab
          installedNames={installedNames}
          onInstalled={() => {
            refetch();
            setTab("my-skills");
          }}
        />
      )}
    </div>
  );
}
