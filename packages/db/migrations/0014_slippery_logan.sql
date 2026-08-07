-- Dedupe BEFORE the unique index: keep the oldest membership per (workspace, user),
-- matching the resolver's ORDER BY createdAt, id — so the surviving row is exactly
-- the one every request already resolves to.
DELETE FROM "workspace_members" wm USING "workspace_members" keep
WHERE wm.workspace_id = keep.workspace_id
  AND wm.user_id = keep.user_id
  AND (keep.created_at, keep.id) < (wm.created_at, wm.id);--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_workspace_user_idx" ON "workspace_members" USING btree ("workspace_id","user_id");
