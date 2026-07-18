import { config } from "dotenv";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Env policy: platform/.env (monorepo root) is the single source of truth.
// Next only auto-reads .env from apps/web — load the root one explicitly.
// Values already in the environment (e.g. Vercel dashboard vars) win.
config({ path: resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@platform/db", "@platform/ai"],
};

export default nextConfig;
