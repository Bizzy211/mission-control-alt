import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy all /api/auth/* requests to the Better Auth service.
 *
 * Next.js rewrites are evaluated at build time, so they can't use
 * runtime-only env vars like BETTER_AUTH_URL. This catch-all API route
 * proxies at runtime instead, keeping auth cookies on the MC domain.
 */

async function proxyToAuth(request: NextRequest) {
  const authUrl = process.env.BETTER_AUTH_URL;
  if (!authUrl) {
    return NextResponse.json(
      { error: "BETTER_AUTH_URL not configured" },
      { status: 503 },
    );
  }

  // Build the target URL: strip /api/auth prefix, reconstruct
  const url = new URL(request.url);
  const targetUrl = `${authUrl}${url.pathname}${url.search}`;

  // Forward the request, preserving the browser's Origin header
  // so Better Auth can validate it against trustedOrigins.
  // If no Origin (e.g. server-side call), use the MC domain.
  const headers = new Headers(request.headers);
  headers.delete("host");
  if (!headers.get("origin")) {
    headers.set("origin", url.origin);
  }

  const body = request.method !== "GET" && request.method !== "HEAD"
    ? await request.arrayBuffer()
    : undefined;

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
  });

  // Forward the response, including Set-Cookie headers
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("transfer-encoding");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyToAuth;
export const POST = proxyToAuth;
export const PUT = proxyToAuth;
export const DELETE = proxyToAuth;
export const PATCH = proxyToAuth;
