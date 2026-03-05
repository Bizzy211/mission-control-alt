"use client";

import { useState, useEffect, useCallback } from "react";
import { Plug, Plus, Trash2, Pencil, Terminal, Key } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { EmptyState } from "@/components/empty-state";
import { Tip } from "@/components/ui/tip";
import { showSuccess, showError } from "@/lib/toast";
import { apiFetch } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface McpServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export default function McpServersPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<McpServer | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formCommand, setFormCommand] = useState("");
  const [formArgs, setFormArgs] = useState("");
  const [formEnvPairs, setFormEnvPairs] = useState<{ key: string; value: string }[]>([]);

  const fetchServers = useCallback(async () => {
    try {
      const res = await apiFetch("/api/mcp-servers");
      if (res.ok) {
        const data = await res.json();
        setServers(data.servers ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchServers(); }, [fetchServers]);

  const openAdd = () => {
    setEditing(null);
    setFormName("");
    setFormCommand("npx");
    setFormArgs("");
    setFormEnvPairs([]);
    setDialogOpen(true);
  };

  const openEdit = (server: McpServer) => {
    setEditing(server);
    setFormName(server.name);
    setFormCommand(server.command);
    setFormArgs(server.args.join(" "));
    setFormEnvPairs(
      Object.entries(server.env).map(([key, value]) => ({ key, value }))
    );
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const args = formArgs.trim() ? formArgs.trim().split(/\s+/) : [];
    const env: Record<string, string> = {};
    for (const pair of formEnvPairs) {
      if (pair.key.trim()) env[pair.key.trim()] = pair.value;
    }

    const body = { name: formName.trim(), command: formCommand.trim(), args, env };

    try {
      const res = await apiFetch(`/api/mcp-servers`, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        showError(data.error ?? "Failed to save");
        return;
      }
      showSuccess(editing ? "Server updated" : "Server added");
      setDialogOpen(false);
      fetchServers();
    } catch {
      showError("Failed to save MCP server");
    }
  };

  const handleDelete = async (name: string) => {
    try {
      const res = await apiFetch(`/api/mcp-servers?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showSuccess("Server removed");
        setServers((prev) => prev.filter((s) => s.name !== name));
      } else {
        showError("Failed to remove server");
      }
    } catch {
      showError("Failed to remove server");
    }
  };

  return (
    <div className="space-y-6">
      <BreadcrumbNav items={[{ label: "MCP Servers" }]} />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Plug className="h-5 w-5" />
          MCP Servers
        </h1>
        <Tip content="Add a new MCP server for agents to use">
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" />
            Add Server
          </Button>
        </Tip>
      </div>

      <p className="text-sm text-muted-foreground">
        MCP servers are available to all Claude Code agent runs. Changes take effect on the next agent spawn.
      </p>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-card/50 animate-pulse">
              <CardContent className="p-4 h-16" />
            </Card>
          ))}
        </div>
      ) : servers.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No MCP servers configured"
          description="Add MCP servers to give your agents access to external tools and data sources."
        />
      ) : (
        <div className="space-y-2">
          {servers.map((server) => (
            <Card key={server.name} className="bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Plug className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{server.name}</p>
                      {Object.keys(server.env).length > 0 && (
                        <Badge variant="secondary" className="text-[10px] gap-0.5">
                          <Key className="h-2.5 w-2.5" />
                          {Object.keys(server.env).length} env
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground font-mono">
                      <Terminal className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {server.command} {server.args.join(" ")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Tip content="Edit server">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(server)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Tip>
                    <Tip content="Remove server">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(server.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </Tip>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="h-4 w-4" />
              {editing ? "Edit MCP Server" : "Add MCP Server"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. github, context7"
                className="h-8 text-sm font-mono"
                disabled={!!editing}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Command</Label>
              <Input
                value={formCommand}
                onChange={(e) => setFormCommand(e.target.value)}
                placeholder="e.g. npx, node, docker"
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Arguments (space-separated)</Label>
              <Input
                value={formArgs}
                onChange={(e) => setFormArgs(e.target.value)}
                placeholder="e.g. -y @modelcontextprotocol/server-github"
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Environment Variables</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs gap-1"
                  onClick={() => setFormEnvPairs([...formEnvPairs, { key: "", value: "" }])}
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              {formEnvPairs.map((pair, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={pair.key}
                    onChange={(e) => {
                      const next = [...formEnvPairs];
                      next[i] = { ...next[i], key: e.target.value };
                      setFormEnvPairs(next);
                    }}
                    placeholder="KEY"
                    className="h-7 text-xs font-mono flex-1"
                  />
                  <Input
                    value={pair.value}
                    onChange={(e) => {
                      const next = [...formEnvPairs];
                      next[i] = { ...next[i], value: e.target.value };
                      setFormEnvPairs(next);
                    }}
                    placeholder="value"
                    className="h-7 text-xs font-mono flex-1"
                    type="password"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-destructive"
                    onClick={() => setFormEnvPairs(formEnvPairs.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formName.trim() || !formCommand.trim()}>
              {editing ? "Update" : "Add Server"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
