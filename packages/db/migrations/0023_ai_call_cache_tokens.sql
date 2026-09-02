-- Prompt-cache accounting on the AI ledger.
--
-- Recorded so "is caching actually working" is a QUERY rather than a belief.
-- A cache_control marker on a prefix shorter than the model minimum (1024
-- tokens for Sonnet, 2048 for Haiku) is accepted by the API and silently does
-- nothing — the call succeeds, the cost is unchanged, and nothing anywhere
-- says so. Without these columns that failure is indistinguishable from
-- success.
--
-- NOT NULL DEFAULT 0 so every historical row reads as "no caching", which is
-- exactly what it was.
ALTER TABLE "ai_calls" ADD COLUMN "cache_write_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN "cache_read_tokens" integer DEFAULT 0 NOT NULL;