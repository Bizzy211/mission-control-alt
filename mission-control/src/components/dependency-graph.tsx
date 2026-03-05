"use client";

import { useMemo } from "react";
import type { Task } from "@/lib/types";

// ─── Layout helpers ──────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  title: string;
  kanban: string;
  assignedTo: string | null;
  x: number;
  y: number;
  depth: number;
}

interface GraphEdge {
  from: string;
  to: string;
}

const NODE_W = 180;
const NODE_H = 40;
const H_GAP = 60;
const V_GAP = 20;
const PAD = 24;

const kanbanFill: Record<string, string> = {
  "not-started": "var(--color-muted)",
  "in-progress": "#3b82f6",
  review: "#f59e0b",
  done: "#10b981",
};

const kanbanText: Record<string, string> = {
  "not-started": "var(--color-foreground)",
  "in-progress": "#ffffff",
  review: "#ffffff",
  done: "#ffffff",
};

/**
 * Topological sort + assign depth (longest path from root)
 */
function topoLayout(tasks: Task[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const edges: GraphEdge[] = [];

  // Build adjacency (blocker → dependent)
  const children = new Map<string, string[]>();
  for (const t of tasks) {
    for (const dep of t.blockedBy) {
      if (taskMap.has(dep)) {
        edges.push({ from: dep, to: t.id });
        if (!children.has(dep)) children.set(dep, []);
        children.get(dep)!.push(t.id);
      }
    }
  }

  // Compute depth via BFS (longest path)
  const depth = new Map<string, number>();
  for (const t of tasks) depth.set(t.id, 0);

  // Iterate until stable
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tasks) {
      for (const dep of t.blockedBy) {
        if (!depth.has(dep)) continue;
        const newDepth = depth.get(dep)! + 1;
        if (newDepth > (depth.get(t.id) ?? 0)) {
          depth.set(t.id, newDepth);
          changed = true;
        }
      }
    }
  }

  // Group by depth
  const depthGroups = new Map<number, Task[]>();
  for (const t of tasks) {
    const d = depth.get(t.id) ?? 0;
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(t);
  }

  // Assign positions
  const nodes: GraphNode[] = [];
  const sortedDepths = [...depthGroups.keys()].sort((a, b) => a - b);

  for (const d of sortedDepths) {
    const group = depthGroups.get(d)!;
    const x = PAD + d * (NODE_W + H_GAP);
    group.forEach((t, i) => {
      const y = PAD + i * (NODE_H + V_GAP);
      nodes.push({
        id: t.id,
        title: t.title,
        kanban: t.kanban,
        assignedTo: t.assignedTo,
        x,
        y,
        depth: d,
      });
    });
  }

  return { nodes, edges };
}

// ─── Component ───────────────────────────────────────────────────────────────

interface DependencyGraphProps {
  tasks: Task[];
  className?: string;
}

export function DependencyGraph({ tasks, className }: DependencyGraphProps) {
  const { nodes, edges } = useMemo(() => topoLayout(tasks), [tasks]);

  if (nodes.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No tasks to display.
      </p>
    );
  }

  // Only show graph if there are actual dependencies
  const hasDeps = edges.length > 0;
  if (!hasDeps) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No task dependencies defined. Add &ldquo;Blocked By&rdquo; links on tasks to see a graph.
      </p>
    );
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const maxX = Math.max(...nodes.map((n) => n.x)) + NODE_W + PAD;
  const maxY = Math.max(...nodes.map((n) => n.y)) + NODE_H + PAD;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${maxX} ${maxY}`}
        className="w-full"
        style={{ minHeight: Math.min(maxY, 500) }}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 7"
            refX="10"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 3.5 L 0 7 Z" fill="var(--color-muted-foreground)" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((e) => {
          const from = nodeMap.get(e.from);
          const to = nodeMap.get(e.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_W;
          const y1 = from.y + NODE_H / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_H / 2;
          const cx = (x1 + x2) / 2;
          return (
            <path
              key={`${e.from}-${e.to}`}
              d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
              fill="none"
              stroke="var(--color-muted-foreground)"
              strokeWidth={1.5}
              opacity={0.4}
              markerEnd="url(#arrow)"
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const fill = kanbanFill[n.kanban] ?? kanbanFill["not-started"];
          const textFill = kanbanText[n.kanban] ?? kanbanText["not-started"];
          const truncated =
            n.title.length > 22 ? n.title.slice(0, 20) + "…" : n.title;
          return (
            <g key={n.id}>
              <rect
                x={n.x}
                y={n.y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={fill}
                opacity={n.kanban === "not-started" ? 0.6 : 0.85}
              />
              <text
                x={n.x + 10}
                y={n.y + 16}
                fontSize={11}
                fontWeight={600}
                fill={textFill}
              >
                {truncated}
              </text>
              {n.assignedTo && (
                <text
                  x={n.x + 10}
                  y={n.y + 30}
                  fontSize={9}
                  fill={textFill}
                  opacity={0.7}
                >
                  {n.assignedTo}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
