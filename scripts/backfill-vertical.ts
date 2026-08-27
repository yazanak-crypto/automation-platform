/**
 * Backfill `business_profiles.answers.vertical` for profiles that never got one.
 *
 * Run:  pnpm tsx scripts/backfill-vertical.ts           (dry run — writes nothing)
 *       pnpm tsx scripts/backfill-vertical.ts --apply   (writes)
 *
 * WHY THESE ROWS EXIST
 *
 * The setup page detected the vertical from the scraped industry and used it in
 * local state, but `save({vertical})` was only called from the picker's onClick
 * — and a successful detection SKIPS the picker. The server never learned it.
 * Fixed forward in the setup page; this repairs the profiles already written.
 *
 * WHY IT IS WORTH REPAIRING RATHER THAN WAITING
 *
 * `renderAnswerFacts` walks `getQuestionSet(vertical)`. A null vertical resolves
 * to OTHER, so every answer whose question lives in a vertical file is dropped
 * from the context pack — silently, with the value still sitting in the profile.
 * On a live workspace that was 6 of 13 answers reaching the AI. Those owners are
 * grounding customer replies on a partial brain until someone reopens
 * /brain/setup, which may be never.
 *
 * WHAT IT DELIBERATELY WILL NOT DO
 *
 * Only CONFIDENT detections are written. `detectVertical` falls back to "other"
 * for an industry it cannot match (and for an empty one), and writing "other"
 * would be actively harmful: it is a guess with no evidence behind it, and
 * because the setup page shows the picker only when the vertical is null,
 * persisting it would permanently rob the owner of the chance to choose. Those
 * profiles are listed as skipped and left exactly as they are.
 *
 * Writes go through `saveProfileAnswers`, not raw SQL, so each one bumps the
 * brain version and lands in `brain_change_log` under a system actor like every
 * other brain mutation (Decision 011).
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "..", ".env") });

import { saveProfileAnswers } from "@platform/brain";
import { detectVertical, getVertical } from "@platform/brain/verticals";
import { businessProfiles, db } from "@platform/db";
import { isNull, or, sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
/** The no-match fallback id. Derived rather than imported — OTHER is not part
 *  of the verticals barrel, and a script does not justify widening it. */
const OTHER_ID = getVertical(null).id;
const ACTOR = "system:vertical-backfill";

interface Candidate {
  workspaceId: string;
  industry: string | null;
  answerCount: number;
  detected: string;
  confident: boolean;
}

async function main() {
  // `answers` may be NULL entirely, or present with no `vertical` key — both
  // are the same situation to an owner and both need repairing.
  const rows = await db()
    .select({
      workspaceId: businessProfiles.workspaceId,
      identity: businessProfiles.identity,
      answers: businessProfiles.answers,
    })
    .from(businessProfiles)
    .where(
      or(
        isNull(businessProfiles.answers),
        sql`${businessProfiles.answers} -> 'vertical' IS NULL`,
        sql`${businessProfiles.answers} ->> 'vertical' = ''`,
      ),
    );

  const candidates: Candidate[] = rows.map((r) => {
    const industry = r.identity?.industry ?? null;
    const detected = industry ? detectVertical(industry) : OTHER_ID;
    return {
      workspaceId: r.workspaceId,
      industry,
      answerCount: Object.keys(r.answers?.values ?? {}).length,
      detected,
      // "other" is the no-match fallback, not a detection. Never write it.
      confident: !!industry && detected !== OTHER_ID,
    };
  });

  const writable = candidates.filter((c) => c.confident);
  const skipped = candidates.filter((c) => !c.confident);

  console.log(`\nProfiles with no vertical: ${candidates.length}`);
  console.log(`  confidently detected: ${writable.length}`);
  console.log(`  left alone:           ${skipped.length}\n`);

  if (writable.length) {
    console.log("WILL SET:");
    for (const c of writable) {
      console.log(
        `  ${c.workspaceId.slice(0, 8)}  ${getVertical(c.detected).label.padEnd(20)} ` +
          `${c.answerCount} answers  ← industry: ${JSON.stringify(c.industry)}`,
      );
    }
    console.log();
  }

  if (skipped.length) {
    console.log("LEFT ALONE (no industry, or nothing matched — the owner picks):");
    for (const c of skipped) {
      console.log(
        `  ${c.workspaceId.slice(0, 8)}  ${c.answerCount} answers  ` +
          `industry: ${JSON.stringify(c.industry)}`,
      );
    }
    console.log();
  }

  if (!APPLY) {
    console.log("Dry run — nothing written. Re-run with --apply to write.\n");
    return;
  }

  let ok = 0;
  const failed: Array<{ workspaceId: string; error: string }> = [];
  for (const c of writable) {
    try {
      // One profile at a time, on purpose: a failure mid-run leaves every
      // earlier profile correctly saved rather than rolling the batch back.
      await saveProfileAnswers(c.workspaceId, { vertical: c.detected }, ACTOR);
      ok += 1;
      console.log(`  ✓ ${c.workspaceId.slice(0, 8)} → ${c.detected}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      failed.push({ workspaceId: c.workspaceId, error });
      console.error(`  ✗ ${c.workspaceId.slice(0, 8)}: ${error}`);
    }
  }

  console.log(`\nWrote ${ok} of ${writable.length}.`);
  if (failed.length) {
    console.log(`${failed.length} failed — safe to re-run, it only picks up nulls.\n`);
    process.exitCode = 1;
  } else {
    console.log("Re-running now would find nothing left to do.\n");
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
