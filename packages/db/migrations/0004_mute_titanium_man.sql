ALTER TABLE "activations" ALTER COLUMN "mode" SET DEFAULT 'supervised';--> statement-breakpoint
ALTER TABLE "activations" ADD COLUMN "autonomy_overrides" jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "attention_reason" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "confidence" real;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "action" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "autonomy_settings" jsonb;
--> statement-breakpoint
UPDATE "activations" SET "mode" = 'supervised' WHERE "mode" = 'draft_approval';
--> statement-breakpoint
UPDATE "activations" SET "mode" = 'smart' WHERE "mode" = 'autopilot';
