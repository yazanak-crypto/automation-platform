import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
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
  // Workspace-level risk tolerance (Decision 012): { maxAutoRisk, categoryOverrides }
  autonomySettings: jsonb("autonomy_settings").$type<Record<string, unknown>>(),
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

// ── Channels & conversations (Decision 007, M1 step 3/4) ────────────────────

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    type: text("type", { enum: ["web_chat", "email"] }).notNull(),
    displayName: text("display_name").notNull(),
    // Public, unguessable identifier for the widget; origin check is the real gate.
    widgetKey: uuid("widget_key").notNull().unique().defaultRandom(),
    config: jsonb("config")
      .$type<{ allowedOrigins?: string[]; accentColor?: string; connectedAt?: string }>()
      .notNull()
      .default({}),
    capabilities: jsonb("capabilities").$type<Record<string, unknown>>(),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("channels_workspace_idx").on(t.workspaceId)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    displayName: text("display_name"),
    // Anonymous continuity only (plan §1b): opaque visitor token, no CRM.
    webchatVisitorId: text("webchat_visitor_id"),
    identities: jsonb("identities").$type<{ email?: string }>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contacts_workspace_visitor_idx").on(t.workspaceId, t.webchatVisitorId),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    status: text("status", { enum: ["open", "waiting_approval", "closed"] })
      .notNull()
      .default("open"),
    attentionReason: text("attention_reason"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("conversations_workspace_status_idx").on(t.workspaceId, t.status),
    index("conversations_contact_idx").on(t.contactId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    body: text("body").notNull(),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    // Draft-mode is the only mode (AC-2.10): outbound reaches the visitor only
    // when draft_status = approved.
    draftStatus: text("draft_status", {
      enum: ["none", "pending_approval", "approved", "dismissed", "auto_sent"],
    })
      .notNull()
      .default("none"),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    deliveryState: text("delivery_state"),
    // Client-minted id for webhook/retry dedupe (AC-2.4).
    clientMessageId: text("client_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId),
    uniqueIndex("messages_conversation_client_idx").on(t.conversationId, t.clientMessageId),
  ],
);

// ── Catalog & activations (Decision 009, M1 step 6) ─────────────────────────
// Automations are global catalog objects (not workspace-scoped); the catalog
// is code (automations/ package) seeded into these tables so the marketplace
// treats 1 automation exactly like 500.

export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  tagline: text("tagline").notNull(),
  description: text("description").notNull(),
  currentVersionId: uuid("current_version_id"),
  tier: text("tier", { enum: ["starter", "pro"] }).notNull().default("starter"),
  status: text("status", { enum: ["live", "draft", "archived"] }).notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationVersions = pgTable(
  "automation_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id),
    version: integer("version").notNull(),
    // "How it works" steps, config field descriptors (schema→UI), sample
    // preview messages — everything the marketplace renders from data.
    definition: jsonb("definition").$type<{
      howItWorks: string[];
      requiredCapabilities: string[];
      contextNeeds: string[];
      configFields: {
        key: string;
        label: string;
        type: "text" | "textarea";
        placeholder?: string;
        help?: string;
      }[];
      sampleMessages: string[];
      metricsContract: { key: string; label: string }[];
      setupMinutes: number;
    }>().notNull(),
    changelog: text("changelog"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("automation_versions_unique_idx").on(t.automationId, t.version)],
);

export const activations = pgTable(
  "activations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    automationVersionId: uuid("automation_version_id")
      .notNull()
      .references(() => automationVersions.id),
    automationSlug: text("automation_slug").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    channelIds: jsonb("channel_ids").$type<string[]>().notNull().default([]),
    // Draft-approval is the only mode in M1 (AC-2.10); the enum exists so the
    // trust-graduation upgrade is a data change, not a migration.
    mode: text("mode", { enum: ["supervised", "smart"] })
      .notNull()
      .default("supervised"),
    autonomyOverrides: jsonb("autonomy_overrides").$type<Record<string, unknown>>(),
    status: text("status", { enum: ["active", "paused", "deactivated"] })
      .notNull()
      .default("active"),
    engineRef: text("engine_ref"),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activations_workspace_idx").on(t.workspaceId, t.status)],
);

// ── Runs ledger, skeletal (Decision 009 source of truth; full catalog later) ─

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    kind: text("kind").notNull(), // e.g. "webchat.draft"
    activationId: uuid("activation_id"),
    conversationId: uuid("conversation_id"),
    triggerMessageId: uuid("trigger_message_id"),
    status: text("status", {
      enum: ["running", "waiting_approval", "succeeded", "failed"],
    })
      .notNull()
      .default("running"),
    // Autonomy telemetry (Decision 012): thin columns for cheap aggregation.
    category: text("category"),
    confidence: real("confidence"),
    action: text("action"),
    outcomeMetrics: jsonb("outcome_metrics").$type<Record<string, unknown>>(),
    costMicrocents: integer("cost_microcents").notNull().default(0),
    errorSummary: text("error_summary"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("runs_workspace_idx").on(t.workspaceId, t.startedAt)],
);

export const runEvents = pgTable(
  "run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id),
    seq: integer("seq").notNull(),
    kind: text("kind", { enum: ["step", "ai_call", "decision", "error"] }).notNull(),
    title: text("title").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("run_events_run_idx").on(t.runId, t.seq)],
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
