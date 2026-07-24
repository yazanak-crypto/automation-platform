// Loads the monorepo root .env (single source of truth) before anything else.
// Must be the FIRST import in index.ts — module hoisting runs it before the
// rest of the worker touches process.env.
//
// The worker is ESM ("type": "module"), so the CommonJS `__dirname` global
// doesn't exist — derive it from import.meta.url instead.
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(here, "../../../.env") });
