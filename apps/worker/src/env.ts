// Loads the monorepo root .env (single source of truth) before anything else.
// Must be the FIRST import in index.ts — module hoisting runs it before the
// rest of the worker touches process.env.
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../../../.env") });
