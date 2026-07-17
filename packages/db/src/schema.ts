import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// Skeleton schema: identity/tenancy + AI cost ledger (Decision 011).
// Remaining Decision 009 tables land with their features, not before.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  clerkOrgId: text("clerk_org_id").unique(),
  plan: text("plan").notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Business Brain (Decision 008, M1 step 2) ────────────────────────────────

export const businessProfiles = pgTable("business_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .unique()
    .references(() => workspaces.id),
  identity: jsonb("identity").$type<{
    businessName?: string;
    url?: string;
    industry?: string;
    description?: string;
    offerings?: string[];
  }>(),
  voice: jsonb("voice").$type<{
    tone?: string[];
    formality?: string;
    languages?: string[];
    signOff?: string;
    bannedPhrases?: string[];
  }>(),
  policies: jsonb("policies").$type<{
    shipping?: string;
    refunds?: string;
    pricing?: string;
    hours?: string;
    custom?: { name: string; text: string }[];
  }>(),
  onboardingStatus: text("onboarding_status", {
    enum: ["pending", "draft_ready", "confirmed", "skipped"],
  })
    .notNull()
    .default("pending"),
  // Bumped on EVERY brain mutation via bumpBrainVersion() (Decision 011 refinement).
  brainVersion: integer("brain_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const boundaries = pgTable(
  "boundaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    ruleText: text("rule_text").notNull(),
    category: text("category", {
      enum: ["never_promise", "never_offer", "handoff", "other"],
    })
      .notNull()
      .default("other"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("boundaries_workspace_idx").on(t.workspaceId)],
);

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    kind: text("kind", { enum: ["faq", "product", "document", "scraped"] }).notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }),
    provenance: text("provenance", {
      enum: ["user_provided", "ai_inferred", "learned_from_feedback"],
    }).notNull(),
    // `suggested` never influences AI output; only explicit user action confirms.
    status: text("status", { enum: ["confirmed", "suggested", "rejected"] }).notNull(),
    sourceRef: text("source_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("knowledge_workspace_status_idx").on(t.workspaceId, t.status)],
);

// Append-only. No UI in M1 — debugging via SQL/internal admin only.
export const brainChangeLog = pgTable(
  "brain_change_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    version: integer("version").notNull(),
    entity: text("entity", { enum: ["profile", "boundary", "knowledge"] }).notNull(),
    entityId: uuid("entity_id"),
    changeKind: text("change_kind", {
      enum: ["create", "update", "delete", "confirm", "reject"],
    }).notNull(),
    diff: jsonb("diff").$type<{ old?: unknown; new?: unknown }>(),
    actor: text("actor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("brain_change_log_workspace_idx").on(t.workspaceId),
    uniqueIndex("brain_change_log_workspace_version_idx").on(t.workspaceId, t.version),
  ],
);

// Every AI call in the platform is recorded here, from call #1.
// No code path may reach an LLM provider without writing this row.
export const aiCalls = pgTable("ai_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  runId: uuid("run_id"),
  model: text("model").notNull(),
  promptRef: text("prompt_ref").notNull(),
  promptVersion: text("prompt_version").notNull(),
  contextPack: jsonb("context_pack"),
  // Which brain state the context pack was assembled from (Decision 011 refinement).
  brainVersion: integer("brain_version"),
  tokensIn: integer("tokens_in").notNull(),
  tokensOut: integer("tokens_out").notNull(),
  estimatedCostMicrocents: integer("estimated_cost_microcents").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  success: boolean("success").notNull().default(true),
  errorSummary: text("error_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
