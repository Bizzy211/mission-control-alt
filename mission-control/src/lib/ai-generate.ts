/**
 * AI generation prompt builders and JSON extraction.
 *
 * Server-side only — reads data files from disk to inject context
 * into generation prompts (available agents, projects, etc.).
 */

import { readFileSync } from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");

// ─── Data loaders ───────────────────────────────────────────────────────────

interface AgentSummary {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
}

interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  status: string;
  deletedAt?: string | null;
}

function loadAgents(): AgentSummary[] {
  try {
    const raw = readFileSync(path.join(DATA_DIR, "agents.json"), "utf-8");
    const data = JSON.parse(raw) as { agents: AgentSummary[] };
    return data.agents
      .filter((a) => a.id !== "me" && a.id !== "system")
      .map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        capabilities: a.capabilities,
      }));
  } catch {
    return [];
  }
}

function loadProjects(): ProjectSummary[] {
  try {
    const raw = readFileSync(path.join(DATA_DIR, "projects.json"), "utf-8");
    const data = JSON.parse(raw) as { projects: ProjectSummary[] };
    return data.projects
      .filter((p) => !p.deletedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
      }));
  } catch {
    return [];
  }
}

function loadGoalTitles(): string[] {
  try {
    const raw = readFileSync(path.join(DATA_DIR, "goals.json"), "utf-8");
    const data = JSON.parse(raw) as { goals: Array<{ title: string; type: string; deletedAt?: string | null }> };
    return data.goals
      .filter((g) => !g.deletedAt)
      .map((g) => `${g.title} (${g.type})`);
  } catch {
    return [];
  }
}

// ─── JSON Extraction ────────────────────────────────────────────────────────

/**
 * Extract and parse JSON from Claude's text response.
 * Handles: raw JSON, markdown-fenced JSON, JSON embedded in prose.
 */
export function parseAIJson<T>(text: string): T {
  // Try direct parse first
  try {
    return JSON.parse(text) as T;
  } catch {
    /* not raw JSON */
  }

  // Try extracting from markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]) as T;
    } catch {
      /* malformed JSON in fence */
    }
  }

  // Try finding the first { ... } or [ ... ] block
  const braceStart = text.indexOf("{");
  const bracketStart = text.indexOf("[");
  const start =
    braceStart === -1
      ? bracketStart
      : bracketStart === -1
        ? braceStart
        : Math.min(braceStart, bracketStart);

  if (start !== -1) {
    const isArray = text[start] === "[";
    const closeChar = isArray ? "]" : "}";
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === (isArray ? "[" : "{")) depth++;
      else if (text[i] === closeChar) depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as T;
        } catch {
          break;
        }
      }
    }
  }

  throw new Error("Could not extract valid JSON from AI response");
}

// ─── Task Generation Prompt ─────────────────────────────────────────────────

const PROJECT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];

export function buildTaskGenPrompt(userPrompt: string, projectId?: string): string {
  const agents = loadAgents();
  const projects = loadProjects();

  const agentList = agents
    .map((a) => `- "${a.id}" (${a.name}): ${a.description}. Capabilities: ${a.capabilities.join(", ")}`)
    .join("\n");

  const projectList = projects
    .map((p) => `- "${p.id}": ${p.name} — ${p.description} (${p.status})`)
    .join("\n");

  const projectHint = projectId
    ? `\nThe user wants this task in project "${projectId}". Set projectId to "${projectId}".`
    : "";

  return `You are a task planning assistant for Mission Control, an AI agent management dashboard.

Given a natural language description, generate a structured task as JSON.

## Available AI Agents
${agentList || "No agents configured."}

## Existing Projects
${projectList || "No projects yet."}
${projectHint}

## Output Format
Return ONLY a JSON object with these fields (no explanation, no markdown fences):

{
  "title": "Concise task title (max 200 chars)",
  "description": "Expanded description of what needs to be done",
  "importance": "important" or "not-important",
  "urgency": "urgent" or "not-urgent",
  "kanban": "not-started",
  "projectId": "matching project ID or null",
  "milestoneId": null,
  "assignedTo": "best-fit agent ID or null",
  "collaborators": ["other agent IDs if task spans domains"],
  "subtasks": [{"id": "sub_1", "title": "Step description", "done": false}, ...],
  "blockedBy": [],
  "estimatedMinutes": estimated_number_or_null,
  "dueDate": "YYYY-MM-DD or null",
  "acceptanceCriteria": "One criterion per line\\nAnother criterion",
  "tags": "comma,separated,tags",
  "notes": "Any additional context"
}

Rules:
- assignedTo must be one of the agent IDs listed above, or null if no agent fits
- Pick the agent whose capabilities best match the task
- Add collaborators only if the task genuinely needs multiple skill sets
- Generate 3-8 subtasks that break down the work into actionable steps
- Set importance/urgency based on the language used (ASAP = urgent, etc.)
- estimatedMinutes should be realistic for an AI agent
- Tags should be lowercase, relevant keywords

## User Request
${userPrompt}`;
}

// ─── Mission Generation Prompt ──────────────────────────────────────────────

export function buildMissionGenPrompt(userPrompt: string): string {
  const agents = loadAgents();
  const existingGoals = loadGoalTitles();

  const agentList = agents
    .map((a) => `- "${a.id}" (${a.name}): ${a.description}. Capabilities: ${a.capabilities.join(", ")}`)
    .join("\n");

  const goalHint = existingGoals.length > 0
    ? `\n## Existing Goals (for context)\n${existingGoals.map((g) => `- ${g}`).join("\n")}`
    : "";

  return `You are a mission planning assistant for Mission Control, an AI agent management dashboard.

Given a natural language description of a mission/project, generate a complete mission plan with a project, tasks, and goals.

## Available AI Agents
${agentList || "No agents configured."}
${goalHint}

## Output Format
Return ONLY a JSON object (no explanation, no markdown fences):

{
  "project": {
    "name": "Project name",
    "description": "What this project aims to achieve",
    "color": "${PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)]}",
    "tags": ["tag1", "tag2"],
    "teamMembers": ["agent-id-1", "agent-id-2"]
  },
  "tasks": [
    {
      "title": "Task title",
      "description": "What needs to be done",
      "importance": "important" or "not-important",
      "urgency": "urgent" or "not-urgent",
      "assignedTo": "agent-id",
      "collaborators": [],
      "subtasks": [{"id": "sub_1", "title": "Step", "done": false}],
      "blockedBy": [],
      "estimatedMinutes": 30,
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
      "tags": ["tag"],
      "notes": ""
    }
  ],
  "goals": [
    {
      "title": "Goal title",
      "type": "long-term" or "medium-term",
      "timeframe": "Q1 2026" or "2 weeks" etc.
    }
  ]
}

Rules:
- Generate 5-15 tasks that cover the full scope of the mission
- Order tasks logically — earlier tasks should come first in the array
- Use blockedBy with "$ref:INDEX" to reference other tasks by position (e.g. "$ref:0" means blocked by the first task). Only reference tasks earlier in the array.
- Assign each task to the most capable agent
- Set teamMembers to all agents who have at least one task
- Generate 1-3 goals: at least one medium-term milestone and optionally a long-term vision
- Tasks should be concrete and actionable, not vague
- Estimate realistic times for AI agent execution
- Make importance/urgency varied — not everything is urgent+important

## User Request
${userPrompt}`;
}
