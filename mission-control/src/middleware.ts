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

  // --- Auth API proxy: pass through (except signup, which is disabled) ---
  if (pathname.startsWith("/api/auth/") || pathname === "/api/auth") {
    if (pathname.startsWith("/api/auth/sign-up")) {
      return NextResponse.json({ error: "Registration disabled" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // --- Other API routes: MC_API_TOKEN check ---
  if (pathname.startsWith("/api/")) {
    const token = process.env.MC_API_TOKEN;
    if (!token) return NextResponse.next();

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Missing Authorization header" },
        { status: 401 },
      );
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return NextResponse.json(
        { error: "Invalid Authorization format. Expected: Bearer <token>" },
        { status: 401 },
      );
    }

    if (!timingSafeEqual(parts[1], token)) {
      return NextResponse.json(
        { error: "Invalid API token" },
        { status: 401 },
      );
    }

    return NextResponse.next();
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

  // Validate session server-side against Better Auth
  try {
    const res = await fetch(`${betterAuthUrl}/api/auth/get-session`, {
      headers: {
        cookie: `better-auth.session_token=${sessionCookie.value}`,
      },
    });

    if (!res.ok) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete("better-auth.session_token");
      return response;
    }

    return NextResponse.next();
  } catch {
    // Better Auth unreachable — allow through to avoid locking users out
    return NextResponse.next();
  }
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
