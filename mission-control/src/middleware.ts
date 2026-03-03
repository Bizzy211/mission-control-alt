import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Constant-time string comparison using XOR.
 * Prevents timing side-channel attacks on token comparison.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─── Session validation cache ────────────────────────────────────────────────
// Avoids calling Better Auth on every single API request. Once validated,
// a session token is trusted for CACHE_TTL ms. This makes the system resilient
// to transient BA outages and reduces inter-container HTTP calls.

const SESSION_CACHE_TTL = 60_000; // 60 seconds
const MAX_CACHE_SIZE = 500;
const sessionCache = new Map<string, number>(); // token → validatedAt timestamp

function isSessionCached(token: string): boolean {
  const validatedAt = sessionCache.get(token);
  if (!validatedAt) return false;
  if (Date.now() - validatedAt > SESSION_CACHE_TTL) {
    sessionCache.delete(token);
    return false;
  }
  return true;
}

function cacheSession(token: string): void {
  // Evict oldest entries if cache is full
  if (sessionCache.size >= MAX_CACHE_SIZE) {
    const oldest = sessionCache.keys().next().value;
    if (oldest) sessionCache.delete(oldest);
  }
  sessionCache.set(token, Date.now());
}

function invalidateSession(token: string): void {
  sessionCache.delete(token);
}

/**
 * Validate a session token against Better Auth, with caching.
 * Returns true if valid, false if explicitly invalid, null if BA unreachable.
 */
async function validateSession(
  betterAuthUrl: string,
  token: string,
): Promise<boolean | null> {
  // Check cache first
  if (isSessionCached(token)) return true;

  try {
    const res = await fetch(`${betterAuthUrl}/api/auth/get-session`, {
      headers: { cookie: `better-auth.session_token=${token}` },
    });
    if (res.ok) {
      cacheSession(token);
      return true;
    }
    invalidateSession(token);
    return false;
  } catch {
    // BA unreachable — return null to let caller decide
    return null;
  }
}

/**
 * Authentication Middleware
 *
 * Two layers:
 * 1. API routes (/api/* except /api/auth/*): MC_API_TOKEN Bearer auth
 * 2. Browser routes (everything else): Better Auth session cookie
 *
 * When BETTER_AUTH_URL is not set, browser auth is skipped (local dev).
 * Auth API routes (/api/auth/*) are proxied via next.config rewrites
 * and always pass through here.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Auth API proxy: pass through ---
  if (pathname.startsWith("/api/auth/") || pathname === "/api/auth") {
    return NextResponse.next();
  }

  // --- Other API routes: MC_API_TOKEN OR valid session cookie ---
  if (pathname.startsWith("/api/")) {
    const token = process.env.MC_API_TOKEN;
    if (!token) return NextResponse.next();

    // Option 1: Bearer token (API-to-API calls, daemon, etc.)
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
      const parts = authHeader.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer" && timingSafeEqual(parts[1], token)) {
        return NextResponse.next();
      }
      return NextResponse.json({ error: "Invalid API token" }, { status: 401 });
    }

    // Option 2: Valid session cookie (browser dashboard calls)
    const betterAuthUrl = process.env.BETTER_AUTH_URL;
    const sessionCookie = request.cookies.get("better-auth.session_token");
    if (betterAuthUrl && sessionCookie?.value) {
      const result = await validateSession(betterAuthUrl, sessionCookie.value);
      if (result === true) return NextResponse.next();
      // result === false: BA says session is invalid → 401
      // result === null: BA unreachable → allow through (same as browser routes)
      if (result === null) return NextResponse.next();
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Browser routes: Better Auth session check ---
  const betterAuthUrl = process.env.BETTER_AUTH_URL;
  if (!betterAuthUrl) return NextResponse.next();

  // Public pages — no auth required
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Check for session cookie (set via proxied /api/auth endpoints)
  const sessionCookie = request.cookies.get("better-auth.session_token");
  if (!sessionCookie?.value) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Validate session server-side against Better Auth (cached)
  const result = await validateSession(betterAuthUrl, sessionCookie.value);
  if (result === true) return NextResponse.next();
  if (result === null) return NextResponse.next(); // BA unreachable — allow through

  // Session explicitly invalid — clear cookie and redirect to login
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete("better-auth.session_token");
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, icon.svg (static assets)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg).*)",
  ],
};
