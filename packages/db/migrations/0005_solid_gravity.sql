CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"nango_connection_id" text NOT NULL,
	"external_account_label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_nango_connection_id_unique" UNIQUE("nango_connection_id")
);
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "provider_thread_ref" text;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connections_workspace_idx" ON "connections" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_channel_thread_idx" ON "conversations" ("channel_id","provider_thread_ref") WHERE "provider_thread_ref" IS NOT NULL;
