"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Users, Sparkles, Loader2, ArrowLeft, CheckSquare, Target, Trash2 } from "lucide-react";
import { useAgents } from "@/hooks/use-data";
import { getAgentIcon } from "@/lib/agent-icons";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const PROJECT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];

// ─── Types for AI-generated mission ─────────────────────────────────────────

interface GenTask {
  title: string;
  description: string;
  importance: string;
  urgency: string;
  assignedTo: string | null;
  collaborators: string[];
  subtasks: Array<{ id: string; title: string; done: boolean }>;
  blockedBy: string[];
  estimatedMinutes: number | null;
  acceptanceCriteria: string[];
  tags: string[];
  notes: string;
}

interface GenGoal {
  title: string;
  type: "long-term" | "medium-term";
  timeframe: string;
}

interface GenMission {
  project: {
    name: string;
    description: string;
    color: string;
    tags: string[];
    teamMembers: string[];
  };
  tasks: GenTask[];
  goals: GenGoal[];
}

type DialogMode = "manual" | "ai" | "preview";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description: string; color: string; tags: string; teamMembers: string[] }) => void;
  onMissionGenerated?: (mission: GenMission) => Promise<void>;
}

export function CreateProjectDialog({ open, onOpenChange, onSubmit, onMissionGenerated }: CreateProjectDialogProps) {
  const { agents } = useAgents();
  const activeAgents = agents.filter((a) => a.status === "active");

  // Manual form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [tags, setTags] = useState("");
  const [teamMembers, setTeamMembers] = useState<string[]>([]);

  // AI state
  const [mode, setMode] = useState<DialogMode>("manual");
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [genMission, setGenMission] = useState<GenMission | null>(null);

  const toggleTeamMember = (agentId: string) => {
    setTeamMembers((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), description, color, tags, teamMembers });
    resetAndClose();
  };

  const resetAndClose = () => {
    setName("");
    setDescription("");
    setColor(PROJECT_COLORS[0]);
    setTags("");
    setTeamMembers([]);
    setMode("manual");
    setAiPrompt("");
    setAiError(null);
    setGenMission(null);
    setGenerating(false);
    setCreating(false);
    onOpenChange(false);
  };

  // ─── AI Generation ──────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setAiError(null);
    try {
      const res = await apiFetch("/api/ai/generate-mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
        retries: 0,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Generation failed (${res.status})`);
      }
      const { mission } = await res.json();
      setGenMission(mission);
      setMode("preview");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const removeGenTask = (index: number) => {
    if (!genMission) return;
    setGenMission({
      ...genMission,
      tasks: genMission.tasks.filter((_, i) => i !== index),
    });
  };

  const removeGenGoal = (index: number) => {
    if (!genMission) return;
    setGenMission({
      ...genMission,
      goals: genMission.goals.filter((_, i) => i !== index),
    });
  };

  // ─── Create all resources from AI plan ──────────────────────────────────

  const handleCreateMission = async () => {
    if (!genMission) return;
    setCreating(true);
    setAiError(null);

    try {
      // If parent provides a handler, delegate to it
      if (onMissionGenerated) {
        await onMissionGenerated(genMission);
        resetAndClose();
        return;
      }

      // 1. Create project
      const projRes = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: genMission.project.name,
          description: genMission.project.description,
          status: "active",
          color: genMission.project.color,
          teamMembers: genMission.project.teamMembers,
          tags: genMission.project.tags,
        }),
      });
      if (!projRes.ok) throw new Error("Failed to create project");
      const project = await projRes.json();
      const projectId = project.id;

      // 2. Create tasks (sequentially to resolve $ref dependencies)
      const createdTaskIds: string[] = [];
      for (const task of genMission.tasks) {
        // Resolve $ref:INDEX references to actual task IDs
        const resolvedBlockedBy = (task.blockedBy ?? []).map((ref: string) => {
          if (typeof ref === "string" && ref.startsWith("$ref:")) {
            const idx = parseInt(ref.slice(5), 10);
            return createdTaskIds[idx] ?? null;
          }
          return ref;
        }).filter(Boolean);

        const taskRes = await apiFetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: task.title,
            description: task.description,
            importance: task.importance || "not-important",
            urgency: task.urgency || "not-urgent",
            kanban: "not-started",
            projectId,
            milestoneId: null,
            assignedTo: task.assignedTo,
            collaborators: task.collaborators ?? [],
            dailyActions: [],
            subtasks: task.subtasks ?? [],
            blockedBy: resolvedBlockedBy,
            estimatedMinutes: task.estimatedMinutes,
            actualMinutes: null,
            acceptanceCriteria: task.acceptanceCriteria ?? [],
            comments: [],
            tags: task.tags ?? [],
            notes: task.notes ?? "",
          }),
        });
        if (taskRes.ok) {
          const created = await taskRes.json();
          createdTaskIds.push(created.id);
        } else {
          createdTaskIds.push(""); // Placeholder to keep indices aligned
        }
      }

      // 3. Create goals
      for (const goal of genMission.goals ?? []) {
        await apiFetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: goal.title,
            type: goal.type,
            timeframe: goal.timeframe ?? "",
            parentGoalId: null,
            projectId,
            status: "not-started",
            milestones: [],
            tasks: createdTaskIds.filter(Boolean),
          }),
        });
      }

      resetAndClose();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Failed to create mission");
    } finally {
      setCreating(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => v ? onOpenChange(true) : resetAndClose()}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", mode === "preview" ? "max-w-2xl" : "max-w-md")}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Create Mission</DialogTitle>
              <DialogDescription>
                {mode === "ai"
                  ? "Describe your mission and AI will generate a full plan."
                  : mode === "preview"
                    ? "Review the AI-generated mission plan."
                    : "Start a new mission to organize your work."}
              </DialogDescription>
            </div>
            {mode === "manual" && !generating && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs shrink-0"
                onClick={() => setMode("ai")}
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI Generate
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* ─── AI Prompt Mode ───────────────────────────────────────────── */}
        {mode === "ai" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder='e.g. "Build a marketing website for our SaaS product with SEO, copywriting, and development tasks"'
                rows={4}
                disabled={generating}
                autoFocus
                className="text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                AI will generate the project, tasks with subtasks, agent assignments, dependencies, and goals.
              </p>
            </div>

            {aiError && <p className="text-xs text-destructive">{aiError}</p>}

            <div className="flex justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode("manual")}
                disabled={generating}
                className="gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Manual
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleGenerate}
                disabled={!aiPrompt.trim() || generating}
                className="gap-1.5"
              >
                {generating ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" /> Generate Mission</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Preview Mode ─────────────────────────────────────────────── */}
        {mode === "preview" && genMission && (
          <div className="space-y-4">
            {/* Project summary */}
            <div className="rounded-lg border p-3 space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: genMission.project.color }} />
                <h3 className="text-sm font-semibold">{genMission.project.name}</h3>
              </div>
              <p className="text-xs text-muted-foreground">{genMission.project.description}</p>
              {genMission.project.teamMembers.length > 0 && (
                <div className="flex items-center gap-1 pt-1">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {genMission.project.teamMembers.join(", ")}
                  </span>
                </div>
              )}
            </div>

            {/* Tasks */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium flex items-center gap-1.5">
                <CheckSquare className="h-3.5 w-3.5" />
                Tasks ({genMission.tasks.length})
              </h4>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {genMission.tasks.map((task, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate">{task.title}</span>
                        {task.assignedTo && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">
                            {task.assignedTo}
                          </Badge>
                        )}
                      </div>
                      {task.subtasks.length > 0 && (
                        <span className="text-muted-foreground">{task.subtasks.length} subtasks</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeGenTask(i)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 p-0.5"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Goals */}
            {genMission.goals.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5" />
                  Goals ({genMission.goals.length})
                </h4>
                <div className="space-y-1">
                  {genMission.goals.map((goal, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs group">
                      <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                        {goal.type === "long-term" ? "Long" : "Mid"}
                      </Badge>
                      <span className="flex-1 truncate">{goal.title}</span>
                      <span className="text-muted-foreground shrink-0">{goal.timeframe}</span>
                      <button
                        type="button"
                        onClick={() => removeGenGoal(i)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 p-0.5"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiError && <p className="text-xs text-destructive">{aiError}</p>}

            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode("ai")}
                disabled={creating}
                className="gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Edit Prompt
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCreateMission}
                disabled={creating || genMission.tasks.length === 0}
                className="gap-1.5"
              >
                {creating ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating...</>
                ) : (
                  <>Create Mission ({genMission.tasks.length} tasks)</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Manual Mode ──────────────────────────────────────────────── */}
        {mode === "manual" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="proj-name">Name</Label>
              <Input
                id="proj-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mission name"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-desc">Description</Label>
              <Textarea
                id="proj-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      color === c ? "scale-110 border-foreground" : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
            {/* Team Members */}
            {activeAgents.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Team Members
                  {teamMembers.length > 0 && (
                    <span className="text-xs text-muted-foreground ml-1">
                      {teamMembers.length} selected
                    </span>
                  )}
                </Label>
                {teamMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {teamMembers.map((memberId) => {
                      const agent = activeAgents.find((a) => a.id === memberId);
                      const MemberIcon = getAgentIcon(memberId, agent?.icon);
                      return (
                        <Badge key={memberId} variant="secondary" className="gap-1 pr-1 text-xs">
                          <MemberIcon className="h-3 w-3" />
                          {agent?.name ?? memberId}
                          <button
                            type="button"
                            onClick={() => toggleTeamMember(memberId)}
                            className="rounded-full hover:bg-muted-foreground/20 p-0.5 ml-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {activeAgents
                    .filter((a) => !teamMembers.includes(a.id))
                    .map((agent) => {
                      const AgentIcon = getAgentIcon(agent.id, agent.icon);
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => toggleTeamMember(agent.id)}
                          className="flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        >
                          <AgentIcon className="h-3 w-3" />
                          {agent.name}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="proj-tags">Tags (comma-separated)</Label>
              <Input
                id="proj-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="saas, web, mobile..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => resetAndClose()}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                Create Mission
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
