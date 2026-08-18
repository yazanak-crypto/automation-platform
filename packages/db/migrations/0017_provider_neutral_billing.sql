-- Provider-neutral billing identifiers.
--
-- RENAME, not drop-and-add: a drop would discard the ids of any paying
-- customer. The table is empty today, which is exactly why this is the moment
-- to do it — the same change after the first subscription is a data migration.
ALTER TABLE "subscriptions" RENAME COLUMN "stripe_customer_id" TO "provider_customer_id";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "stripe_subscription_id" TO "provider_subscription_id";--> statement-breakpoint

-- `provider` records which system those ids belong to. Added NOT NULL without a
-- default: there are no rows to backfill, and a default would let a caller
-- create a row whose ids belong to a provider nobody recorded — unfixable after
-- the fact. Any future row must say what it is.
ALTER TABLE "subscriptions" ADD COLUMN "provider" text NOT NULL;
