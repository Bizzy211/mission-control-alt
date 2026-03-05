"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TaskForm, type TaskFormData } from "@/components/task-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, ArrowLeft } from "lucide-react";
import type { Project, Goal, Subtask } from "@/lib/types";
import { apiFetch } from "@/lib/api-client";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  goals: Goal[];
  onSubmit: (data: TaskFormData) => void;
  defaultValues?: Partial<TaskFormData>;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  projects,
  goals,
  onSubmit,
  defaultValues,
}: CreateTaskDialogProps) {
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiGenerated, setAiGenerated] = useState<Partial<TaskFormData> | null>(null);

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setAiError(null);
    try {
      const res = await apiFetch("/api/ai/generate-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
        retries: 0,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Generation failed (${res.status})`);
      }
      const { task } = await res.json();

      // Map AI response to TaskFormData shape
      const generated: Partial<TaskFormData> = {
        title: task.title ?? "",
        description: task.description ?? "",
        importance: task.importance ?? "not-important",
        urgency: task.urgency ?? "not-urgent",
        kanban: task.kanban ?? "not-started",
        projectId: task.projectId ?? null,
        milestoneId: task.milestoneId ?? null,
        assignedTo: task.assignedTo ?? null,
        collaborators: Array.isArray(task.collaborators) ? task.collaborators : [],
        subtasks: Array.isArray(task.subtasks)
          ? task.subtasks.map((s: Subtask, i: number) => ({
              id: s.id || `sub_${Date.now()}_${i}`,
              title: s.title,
              done: false,
            }))
          : [],
        blockedBy: Array.isArray(task.blockedBy) ? task.blockedBy : [],
        estimatedMinutes: typeof task.estimatedMinutes === "number" ? task.estimatedMinutes : null,
        dueDate: task.dueDate ?? null,
        acceptanceCriteria: typeof task.acceptanceCriteria === "string"
          ? task.acceptanceCriteria
          : Array.isArray(task.acceptanceCriteria)
            ? task.acceptanceCriteria.join("\n")
            : "",
        tags: typeof task.tags === "string"
          ? task.tags
          : Array.isArray(task.tags)
            ? task.tags.join(", ")
            : "",
        notes: task.notes ?? "",
      };

      setAiGenerated(generated);
      setMode("manual"); // Switch to form for review
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      // Reset AI state when closing
      setMode("manual");
      setAiPrompt("");
      setAiError(null);
      setAiGenerated(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Create Task</DialogTitle>
              <DialogDescription>
                {mode === "ai" ? "Describe your task and AI will fill in the details." : aiGenerated ? "Review the AI-generated task and make any changes." : "Add a new task to your mission."}
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

        {mode === "ai" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder='e.g. "Research the top 5 competitors in the CRM space and write a comparison report"'
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
                AI will choose the best agent, generate subtasks, set priority, and estimate time.
              </p>
            </div>

            {aiError && (
              <p className="text-xs text-destructive">{aiError}</p>
            )}

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
                  <><Sparkles className="h-3.5 w-3.5" /> Generate Task</>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {aiGenerated && (
              <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary mb-2 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                AI-generated — review and edit before creating.
              </div>
            )}
            <TaskForm
              initial={aiGenerated ?? defaultValues}
              projects={projects}
              goals={goals}
              onSubmit={(data) => {
                onSubmit(data);
                handleClose(false);
              }}
              onCancel={() => handleClose(false)}
              submitLabel="Create Task"
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
