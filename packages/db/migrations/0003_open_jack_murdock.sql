CREATE TABLE "activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"automation_version_id" uuid NOT NULL,
	"automation_slug" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"channel_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mode" text DEFAULT 'draft_approval' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"engine_ref" text,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"changelog" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"tagline" text NOT NULL,
	"description" text NOT NULL,
	"current_version_id" uuid,
	"tier" text DEFAULT 'starter' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "activation_id" uuid;--> statement-breakpoint
ALTER TABLE "activations" ADD CONSTRAINT "activations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activations" ADD CONSTRAINT "activations_automation_version_id_automation_versions_id_fk" FOREIGN KEY ("automation_version_id") REFERENCES "public"."automation_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activations_workspace_idx" ON "activations" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_versions_unique_idx" ON "automation_versions" USING btree ("automation_id","version");