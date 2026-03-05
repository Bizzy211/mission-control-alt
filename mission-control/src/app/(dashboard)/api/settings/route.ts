import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

export interface AppSettings {
  notifications: {
    soundEnabled: boolean;
    volume: number;
    onTaskComplete: boolean;
    onNewMessage: boolean;
    onDecisionNeeded: boolean;
  };
  tts: {
    enabled: boolean;
    voice: string;
    rate: number;
    pitch: number;
  };
}

const DEFAULTS: AppSettings = {
  notifications: {
    soundEnabled: true,
    volume: 0.7,
    onTaskComplete: true,
    onNewMessage: true,
    onDecisionNeeded: true,
  },
  tts: {
    enabled: false,
    voice: "",
    rate: 1.0,
    pitch: 1.0,
  },
};

function readSettings(): AppSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return { ...DEFAULTS };
    const raw = readFileSync(SETTINGS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return {
      notifications: { ...DEFAULTS.notifications, ...data.notifications },
      tts: { ...DEFAULTS.tts, ...data.tts },
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeSettings(settings: AppSettings): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

// GET /api/settings — return current settings with defaults
export async function GET() {
  return NextResponse.json(readSettings());
}

// POST /api/settings — merge partial update and save
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const current = readSettings();

    const updated: AppSettings = {
      notifications: { ...current.notifications, ...body.notifications },
      tts: { ...current.tts, ...body.tts },
    };

    writeSettings(updated);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 }
    );
  }
}
