import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";

const CREDIT_STATUS_FILE = path.resolve(process.cwd(), "data", "credit-status.json");

export async function GET() {
  try {
    if (!existsSync(CREDIT_STATUS_FILE)) {
      return NextResponse.json({
        limit: 0,
        usage: 0,
        limitRemaining: null,
        percentUsed: 0,
        status: "ok",
        lastCheckedAt: null,
      });
    }

    const data = JSON.parse(readFileSync(CREDIT_STATUS_FILE, "utf-8"));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to read credit status" },
      { status: 500 }
    );
  }
}
