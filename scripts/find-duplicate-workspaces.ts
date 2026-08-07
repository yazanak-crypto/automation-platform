/**
 * Diagnose the onboarding-loop residue: users who own MORE THAN ONE workspace
 * (created by the pre-fix first-login race). Read-only — prints a report and
 * suggested cleanup SQL, deletes nothing.
 *
 * Run: pnpm tsx scripts/find-duplicate-workspaces.ts
 *
 * Note: since the resolver now deterministically picks the OLDEST membership,
 * duplicates no longer cause the loop — but the orphan workspaces (and any
 * onboarding state written to them during the bug) are dead weight. Only
 * delete orphans that are verifiably empty.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "..", ".env") });

import { sql } from "drizzle-orm";
import { db } from "@platform/db";

(async () => {
  const dupes = await db().execute(sql`
    SELECT u.email, u.id AS user_id,
           array_agg(w.id ORDER BY wm.created_at, wm.id) AS workspace_ids,
           array_agg(w.name ORDER BY wm.created_at, wm.id) AS names,
           count(*) AS n
    FROM users u
    JOIN workspace_members wm ON wm.user_id = u.id
    JOIN workspaces w ON w.id = wm.workspace_id
    GROUP BY u.email, u.id
    HAVING count(*) > 1
  `);
  const rows = (dupes as unknown as { rows?: Record<string, unknown>[] }).rows ?? (dupes as unknown as Record<string, unknown>[]);

  if (!rows || rows.length === 0) {
    console.log("✅ No users with multiple workspaces. Nothing to clean up.");
    process.exit(0);
  }

  console.log(`⚠️  ${rows.length} user(s) own multiple workspaces (first one listed = the one the app resolves):\n`);
  for (const r of rows) console.log("  ", JSON.stringify(r));

  console.log(`
To inspect whether the EXTRA workspaces are empty (safe to remove), run per workspace id:

  SELECT
    (SELECT count(*) FROM channels       WHERE workspace_id = '<id>') AS channels,
    (SELECT count(*) FROM conversations  WHERE workspace_id = '<id>') AS conversations,
    (SELECT count(*) FROM activations    WHERE workspace_id = '<id>') AS activations,
    (SELECT count(*) FROM runs           WHERE workspace_id = '<id>') AS runs;

If all zero, remove the orphan with (order matters for FKs):

  DELETE FROM brain_change_log   WHERE workspace_id = '<id>';
  DELETE FROM knowledge_items    WHERE workspace_id = '<id>';
  DELETE FROM boundaries         WHERE workspace_id = '<id>';
  DELETE FROM business_profiles  WHERE workspace_id = '<id>';
  DELETE FROM ai_calls           WHERE workspace_id = '<id>';
  DELETE FROM subscriptions      WHERE workspace_id = '<id>';
  DELETE FROM workspace_invites  WHERE workspace_id = '<id>';
  DELETE FROM notifications      WHERE workspace_id = '<id>';
  DELETE FROM workspace_members  WHERE workspace_id = '<id>';
  DELETE FROM workspaces         WHERE id           = '<id>';

Keep the FIRST workspace in each list — it is the one the resolver picks.
`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
