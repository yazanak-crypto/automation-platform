ALTER TABLE "orders" ADD COLUMN "decision_message_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "decision_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "decision_notify_error" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pending_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_decision_message_id_messages_id_fk" FOREIGN KEY ("decision_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;