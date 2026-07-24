import { afterEach, describe, expect, it } from "vitest";
import { assertTestDatabase } from "@platform/db";

// Verifies the production-database safety net (P1). Pure function — no DB needed.

const PROD = "postgres://u:p@ep-delicate-wind-as6t59e2-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const origProd = process.env.DATABASE_URL;
afterEach(() => {
  if (origProd === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = origProd;
});

describe("assertTestDatabase", () => {
  it("accepts a local Postgres", () => {
    expect(() => assertTestDatabase("postgres://platform:platform@localhost:5432/platform")).not.toThrow();
    expect(() => assertTestDatabase("postgres://u:p@127.0.0.1:5432/anything")).not.toThrow();
  });

  it("accepts a remote database whose name marks it as test", () => {
    expect(() => assertTestDatabase("postgres://u:p@somehost.neon.tech/ovanth_test")).not.toThrow();
  });

  it("rejects a remote production-looking database", () => {
    expect(() => assertTestDatabase(PROD)).toThrow(/not a recognized test database/);
  });

  it("rejects a URL identical to the configured production DATABASE_URL", () => {
    process.env.DATABASE_URL = "postgres://u:p@localhost:5432/platform";
    // Even though it's local, matching prod exactly is refused.
    expect(() => assertTestDatabase("postgres://u:p@localhost:5432/platform")).toThrow(
      /identical to the production/,
    );
  });

  it("rejects a malformed URL", () => {
    expect(() => assertTestDatabase("not-a-url")).toThrow(/not a valid/);
  });
});
