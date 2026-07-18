/**
 * Sync the code catalog into the database (idempotent). Run on deploy and in
 * dev: `pnpm --filter @platform/catalog seed`.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../.env") });

import { automations, automationVersions, db } from "@platform/db";
import { and, eq } from "drizzle-orm";
import { CATALOG } from "./index";

export async function seedCatalog() {
  for (const def of CATALOG) {
    const existing = await db()
      .select()
      .from(automations)
      .where(eq(automations.slug, def.slug))
      .limit(1);

    const automation =
      existing[0] ??
      (
        await db()
          .insert(automations)
          .values({
            slug: def.slug,
            name: def.name,
            category: def.category,
            tagline: def.tagline,
            description: def.description,
            tier: def.tier,
            status: "live",
          })
          .returning()
      )[0]!;

    const versionRows = await db()
      .select()
      .from(automationVersions)
      .where(
        and(
          eq(automationVersions.automationId, automation.id),
          eq(automationVersions.version, def.version),
        ),
      )
      .limit(1);

    const version =
      versionRows[0] ??
      (
        await db()
          .insert(automationVersions)
          .values({
            automationId: automation.id,
            version: def.version,
            definition: def.definition,
          })
          .returning()
      )[0]!;

    // Keep listing metadata + current version pointer in sync with code.
    await db()
      .update(automations)
      .set({
        name: def.name,
        category: def.category,
        tagline: def.tagline,
        description: def.description,
        tier: def.tier,
        status: "live",
        currentVersionId: version.id,
      })
      .where(eq(automations.id, automation.id));

    // Same version number, updated definition content → sync it (dev iteration).
    await db()
      .update(automationVersions)
      .set({ definition: def.definition })
      .where(eq(automationVersions.id, version.id));

    console.log(`[catalog] synced ${def.slug} v${def.version}`);
  }
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("automations/seed.ts");
if (isMain) {
  seedCatalog()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
