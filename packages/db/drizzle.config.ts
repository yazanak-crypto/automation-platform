import { config } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// Env policy: the monorepo root `.env` (platform/.env) is the single source
// of truth. drizzle-kit runs with packages/db as cwd, so load it explicitly.
config({ path: resolve(__dirname, "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Put it in platform/.env (the monorepo root) — see .env.example.",
  );
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
