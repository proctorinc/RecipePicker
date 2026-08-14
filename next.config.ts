import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    // Keep dev output separate so agent-run `next build` jobs do not clobber
    // the live dev server's module graph.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    serverExternalPackages: ["drizzle-orm", "better-sqlite3", "@libsql/client"],
    experimental: {
      serverActions: {
        bodySizeLimit: "12mb",
      },
    },
    images: {
      remotePatterns: [
        {
          protocol: "https",
          hostname: "**",
        },
        {
          protocol: "http",
          hostname: "**",
        },
      ],
    },
  };
}
