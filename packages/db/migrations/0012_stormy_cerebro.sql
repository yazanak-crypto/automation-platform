ALTER TABLE "users" ALTER COLUMN "is_active" SET DEFAULT true;--> statement-breakpoint
-- The activation gate is no longer enforced anywhere in the request path, so no
-- account should be left flagged from when it was. Activate everyone; the
-- column and the /admin toggle stay available for manual use later.
UPDATE "users" SET "is_active" = true WHERE "is_active" = false;
