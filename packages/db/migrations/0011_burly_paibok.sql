ALTER TABLE "users" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: accounts that existed before manual activation was introduced keep
-- their access. Only NEW signups (after this migration) land inactive.
UPDATE "users" SET "is_active" = true WHERE "created_at" < now();
