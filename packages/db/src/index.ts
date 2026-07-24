import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

let _db: ReturnType<typeof createDb> | undefined;

/** True when running under Vitest (or any NODE_ENV=test runner). */
function isTestEnv(): boolean {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

/**
 * Guard: refuse to let a test run touch anything that isn't obviously a
 * throwaway test database. Prevents `pnpm test` from ever hitting the
 * production Neon DB when a developer has the prod DATABASE_URL in their .env.
 * Exported so it can be unit-tested directly.
 */
export function assertTestDatabase(url: string): void {
  let host = "";
  let dbName = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    dbName = u.pathname.replace(/^\//, "").toLowerCase();
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid connection URL.");
  }
  // Never equal to the configured production database.
  if (process.env.DATABASE_URL && url === process.env.DATABASE_URL) {
    throw new Error(
      "Refusing to run tests: TEST_DATABASE_URL is identical to the production DATABASE_URL.",
    );
  }
  const isLocal = ["localhost", "127.0.0.1", "::1", "postgres", "db"].includes(host);
  const looksLikeTest = dbName.includes("test") || host.includes("test");
  if (!isLocal && !looksLikeTest) {
    throw new Error(
      `Refusing to run tests against "${host}/${dbName}": not a recognized test database. ` +
        "Point TEST_DATABASE_URL at a local Postgres or a database whose name contains 'test'.",
    );
  }
}

/**
 * Resolve the connection URL. In test mode the ONLY accepted source is
 * TEST_DATABASE_URL (production DATABASE_URL is ignored entirely), and it must
 * pass assertTestDatabase. Outside tests we use DATABASE_URL as normal.
 */
function resolveDatabaseUrl(): string {
  if (isTestEnv()) {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) {
      throw new Error(
        "TEST_DATABASE_URL is not set. Integration tests must gate on it and skip when unset; " +
          "if you see this, a test opened a DB connection without a test database configured.",
      );
    }
    assertTestDatabase(testUrl);
    return testUrl;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. All env comes from platform/.env (monorepo root); " +
        "apps load it at startup — if you see this in a new entry point, load the root .env there too.",
    );
  }
  return url;
}

function createDb() {
  const client = postgres(resolveDatabaseUrl(), { prepare: false });
  return drizzle(client, { schema });
}

/** Lazy singleton so importing the package never requires env at build time. */
export function db() {
  _db ??= createDb();
  return _db;
}
