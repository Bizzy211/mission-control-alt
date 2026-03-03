import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost",
    "http://127.0.0.1",
    "localhost",
    "127.0.0.1",
  ],
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Proxy Better Auth API so cookies are set on this domain
  async rewrites() {
    const authUrl = process.env.BETTER_AUTH_URL;
    if (!authUrl) return [];
    return [
      {
        source: "/api/auth/:path*",
        destination: `${authUrl}/api/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
