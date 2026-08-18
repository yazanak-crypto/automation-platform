import { describe, expect, it } from "vitest";
import { journalTags } from "../src/migrate";

// The journal is the source of truth for "how many migrations should exist".
// If it and the migration files disagree, drift detection silently misreports
// and the failure it exists to prevent comes back.

describe("journalTags", () => {
  it("returns every migration in index order", () => {
    const tags = journalTags();
    expect(tags.length).toBeGreaterThan(0);
    expect(tags[0]).toMatch(/^0000_/);
    // Ordered by idx, so position N is migration N.
    tags.forEach((t, i) => {
      expect(t.startsWith(String(i).padStart(4, "0")), `${t} is not at index ${i}`).toBe(true);
    });
  });

  it("has no duplicate tags", () => {
    const tags = journalTags();
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("matches the .sql files on disk", async () => {
    // A migration file added without a journal entry (or vice versa) makes the
    // pending count wrong in exactly the direction that hides a problem.
    const { readdirSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const folder = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
    const files = readdirSync(folder)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort();
    expect(journalTags().slice().sort()).toEqual(files);
  });
});
