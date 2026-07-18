import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

let _db: ReturnType<typeof createDb> | undefined;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. All env comes from platform/.env (monorepo root); " +
        "apps load it at startup — if you see this in a new entry point, load the root .env there too.",
    );
  }
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema });
}

/** Lazy singleton so importing the package never requires env at build time. */
export function db() {
  _db ??= createDb();
  return _db;
}
