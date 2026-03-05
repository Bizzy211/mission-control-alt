import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const MCP_FILE = path.join(process.cwd(), ".mcp.json");

interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpFile {
  mcpServers: Record<string, McpServerEntry>;
}

async function readMcpFile(): Promise<McpFile> {
  try {
    const raw = await readFile(MCP_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return { mcpServers: parsed.mcpServers ?? {} };
  } catch {
    return { mcpServers: {} };
  }
}

async function writeMcpFile(data: McpFile): Promise<void> {
  await writeFile(MCP_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// GET: list all MCP servers
export async function GET() {
  const data = await readMcpFile();
  const servers = Object.entries(data.mcpServers).map(([name, entry]) => ({
    name,
    command: entry.command,
    args: entry.args ?? [],
    env: entry.env ?? {},
  }));
  return NextResponse.json({ servers });
}

// POST: add a new MCP server
export async function POST(request: Request) {
  const body = await request.json();
  const { name, command, args, env } = body as {
    name?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  };

  if (!name || !command) {
    return NextResponse.json({ error: "name and command are required" }, { status: 400 });
  }
  if (name.length > 100 || command.length > 500) {
    return NextResponse.json({ error: "name or command too long" }, { status: 400 });
  }

  const data = await readMcpFile();
  if (data.mcpServers[name]) {
    return NextResponse.json({ error: `Server "${name}" already exists` }, { status: 409 });
  }

  const entry: McpServerEntry = { command };
  if (args && args.length > 0) entry.args = args;
  if (env && Object.keys(env).length > 0) entry.env = env;

  data.mcpServers[name] = entry;
  await writeMcpFile(data);

  return NextResponse.json({ name, ...entry }, { status: 201 });
}

// PUT: update an existing MCP server
export async function PUT(request: Request) {
  const body = await request.json();
  const { name, command, args, env } = body as {
    name?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  };

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const data = await readMcpFile();
  if (!data.mcpServers[name]) {
    return NextResponse.json({ error: `Server "${name}" not found` }, { status: 404 });
  }

  if (command) data.mcpServers[name].command = command;
  if (args !== undefined) data.mcpServers[name].args = args.length > 0 ? args : undefined;
  if (env !== undefined) data.mcpServers[name].env = Object.keys(env).length > 0 ? env : undefined;

  await writeMcpFile(data);
  return NextResponse.json({ name, ...data.mcpServers[name] });
}

// DELETE: remove an MCP server
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name query param required" }, { status: 400 });
  }

  const data = await readMcpFile();
  if (!data.mcpServers[name]) {
    return NextResponse.json({ error: `Server "${name}" not found` }, { status: 404 });
  }

  delete data.mcpServers[name];
  await writeMcpFile(data);
  return NextResponse.json({ ok: true });
}
