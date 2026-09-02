import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Skeleton schema: identity/tenancy + AI cost ledger (Decision 011).
// Remaining Decision 009 tables land with their features, not before.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  // Account status. NOT enforced anywhere in the request path — signups get
  // access immediately. Kept so an admin can flag an account from /admin, and
  // so enforcement can be reintroduced later without a schema change.
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  clerkOrgId: text("clerk_org_id").unique(),
  plan: text("plan").notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  // Set once, the first time a workspace is granted its free trial, and never
  // cleared. Makes "one trial, ever" a property of the data rather than the
  // absence of code that grants a second one: any future path that wants to
  // start a trial must check this first.
  trialUsedAt: timestamp("trial_used_at", { withTimezone: true }),
  // Manual (bank/Whish) payment access. Null = never paid manually. Independent
  // of Stripe: whichever grants access wins.
  paidThrough: timestamp("paid_through", { withTimezone: true }),
  // Workspace-level risk tolerance (Decision 012): { maxAutoRisk, categoryOverrides }
  autonomySettings: jsonb("autonomy_settings").$type<Record<string, unknown>>(),
  // Owner notification preferences. Null = defaults (draft emails on, sent to
  // the workspace owner). `email` overrides the recipient.
  notificationSettings: jsonb("notification_settings").$type<{
    draftEmails?: boolean;
    email?: string;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // DB-level guarantee behind the onboarding-loop fix: one membership row per
    // user per workspace. Also makes the invite path's onConflictDoNothing real
    // (without a unique constraint it silently never conflicts).
    uniqueIndex("workspace_members_workspace_user_idx").on(t.workspaceId, t.userId),
  ],
);

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
  // Guided setup answers, keyed by question id. Kept separate from the
  // hand-curated `identity`/`voice`/`policies` fields so the advanced
  // Knowledge view keeps working untouched, and so a question set can change
  // without migrating anyone's existing profile.
  answers: jsonb("answers").$type<{
    vertical?: string;
    values?: Record<string, unknown>;
    /** Ids the AI pre-filled that the owner hasn't corrected yet. */
    guessed?: string[];
    completedAt?: string;
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

// ── Integrations (Decision 009): OAuth connections via Nango — no raw tokens ─

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    provider: text("provider").notNull(), // e.g. "google-mail", "instagram"
    nangoConnectionId: text("nango_connection_id").notNull().unique(),
    // Display only (e.g. the connected email address) — never credentials.
    externalAccountLabel: text("external_account_label"),
    // Stable provider-side account id used to route inbound webhooks back to
    // this connection (e.g. Instagram business account id / WA phone number id
    // / FB page id). Null for poll-based providers like Gmail.
    providerAccountId: text("provider_account_id"),
    status: text("status", { enum: ["active", "needs_reconnect", "revoked"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("connections_workspace_idx").on(t.workspaceId),
    // A provider-side account id routes to exactly one connection.
    //
    // Every webhook resolver — resolveWhatsAppChannel, resolveInstagramChannel
    // — looks an id up in this column and takes LIMIT 1 with no ORDER BY. A
    // duplicate would therefore send a customer's messages to an arbitrary
    // workspace, picked by whatever order the planner happened to return: a
    // cross-tenant leak with no error anywhere.
    //
    // Keyed on (provider, provider_account_id) rather than the id alone, so two
    // different providers that happen to mint the same id string do not collide
    // with each other.
    //
    // PARTIAL because provider_account_id is null for poll-based providers like
    // Gmail — many nulls, no meaning, and a plain unique index would be wrong.
    //
    // Scope was widened from whatsapp-only after checking live data: no
    // duplicates exist for ANY provider (instagram and facebook have no rows at
    // all yet). Establishing the invariant while the table is nearly empty is
    // the cheap moment — the same constraint after Instagram has customers is a
    // data migration.
    uniqueIndex("connections_provider_account_uq")
      .on(t.provider, t.providerAccountId)
      .where(sql`${t.providerAccountId} IS NOT NULL`),
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
    type: text("type", {
      enum: ["web_chat", "email", "instagram", "whatsapp", "facebook"],
    }).notNull(),
    // Email/Meta channels ride an OAuth connection; web_chat needs none.
    connectionId: uuid("connection_id").references(() => connections.id),
    displayName: text("display_name").notNull(),
    // Public, unguessable identifier for the widget; origin check is the real gate.
    widgetKey: uuid("widget_key").notNull().unique().defaultRandom(),
    config: jsonb("config")
      .$type<{
        allowedOrigins?: string[];
        accentColor?: string;
        connectedAt?: string;
        // Meta channels: whether the account is subscribed to our webhooks.
        // Until true, Meta delivers no inbound events for the account.
        webhookSubscribed?: boolean;
      }>()
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
    identities: jsonb("identities")
      .$type<{ email?: string; instagram?: string; whatsapp?: string }>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contacts_workspace_visitor_idx").on(t.workspaceId, t.webchatVisitorId),
    // One provider identity = one contact, per workspace.
    //
    // The contact row is what durable per-customer records hang off — order
    // history is `WHERE contact_id = ?`. Both upserts below were
    // select-then-insert with nothing underneath them, and Meta retries
    // webhooks aggressively, so a race produced two contacts for one person.
    // Today that is a duplicate row nobody notices. The moment anything is
    // keyed on contact_id it silently splits one customer's history in half,
    // and "same as last time" reads the wrong half.
    //
    // Partial, because most contacts carry neither identity and NULLs must not
    // collide with each other.
    //
    // EMAIL IS DELIBERATELY ABSENT. A wa_id and an igsid are provider-assigned
    // and arrive only through a webhook, so one value genuinely means one
    // person. An email address is typed by a human and arrives from two
    // independent paths — the email channel and the web-chat identify form —
    // where the SAME person legitimately shows up as two contacts. That is a
    // contact-merge problem, not a constraint violation, and a unique index
    // without a merge path would turn it into a failed web-chat message
    // (upsertVisitorContact writes an email onto an existing contact). See the
    // PR for the full reasoning.
    uniqueIndex("contacts_workspace_whatsapp_uq")
      .on(t.workspaceId, sql`(${t.identities} ->> 'whatsapp')`)
      .where(sql`${t.identities} ->> 'whatsapp' IS NOT NULL`),
    uniqueIndex("contacts_workspace_instagram_uq")
      .on(t.workspaceId, sql`(${t.identities} ->> 'instagram')`)
      .where(sql`${t.identities} ->> 'instagram' IS NOT NULL`),
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
    // Generic provider thread anchor (e.g. email thread id) — adapter-owned.
    providerThreadRef: text("provider_thread_ref"),
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
    // Hot paths: pending-draft counts (dashboard/analytics) and webhook/poll
    // ingestion dedupe, both filtered by workspace.
    index("messages_workspace_draft_idx").on(t.workspaceId, t.draftStatus),
    index("messages_workspace_client_idx").on(t.workspaceId, t.clientMessageId),
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

// ── Orders (structured order capture) ───────────────────────────────────────
//
// Orders are transactional records with a lifecycle, NOT knowledge. They are
// deliberately not knowledge_items: those are retrieved semantically to ground
// replies, and an order landing in that pool would surface as an answer to an
// unrelated question.

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    // THE identity link. History is `WHERE contact_id = ?`, which is why
    // contacts gained provider-identity uniqueness first (migration 0020):
    // a duplicate contact would split one customer's history in half.
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    // Where it was captured. Orders OUTLIVE the conversation, so this is
    // provenance, never the lookup key.
    conversationId: uuid("conversation_id").references(() => conversations.id),
    /** The inbound message this was extracted from — auditable provenance. */
    sourceMessageId: uuid("source_message_id").references(() => messages.id),

    status: text("status", {
      enum: ["pending", "confirmed", "cancelled", "fulfilled"],
    })
      .notNull()
      .default("pending"),

    /** As the customer gave it; may differ from contacts.display_name. */
    customerName: text("customer_name"),

    // BOTH forms of the requested time, on purpose. The timestamp sorts and
    // filters; the raw text is what gets quoted back. "tomorrow evening"
    // resolved to 19:00 is useful for the owner and wrong to repeat verbatim
    // to the customer as though they said 19:00.
    requestedFor: timestamp("requested_for", { withTimezone: true }),
    requestedForText: text("requested_for_text"),

    notes: text("notes"),

    // Nullable BY DESIGN, and the auto-confirm gate treats null as
    // "cannot auto-confirm" rather than as zero. Catalog prices are strings
    // ("45k", "AED 85,000/yr", "حسب الطلب"), so a total is often unknowable —
    // and an unknown total that reads as 0 would slip under every ceiling.
    totalEstimate: numeric("total_estimate", { precision: 12, scale: 2 }),
    currency: text("currency"),

    /** What the extractor claimed. Feeds the auto-confirm gate. */
    captureConfidence: real("capture_confidence"),
    /** True only when the gate fired. False means a human decided. */
    autoConfirmed: boolean("auto_confirmed").notNull().default(false),

    // Covers confirm AND cancel: both are the owner's decision, and `status`
    // already says which. Two separate column pairs would leave the cancel
    // case unattributed, which is the one you most want to look up later.
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),

    // ── Did the customer actually hear about the decision? ──────────────────
    //
    // The decision and the notification are two separate things that can
    // disagree: the owner confirms, the row flips to `confirmed`, and the
    // WhatsApp send then fails. Without recording it, the Orders tab would show
    // a confirmed order and the owner would reasonably believe the customer was
    // told. They were not.
    //
    // So `decided_at` set with `decision_notified_at` NULL is a REAL state that
    // the tab renders explicitly, not an edge case to be tidied away.
    /** The outbound message row carrying the confirmation/cancellation. */
    decisionMessageId: uuid("decision_message_id").references(() => messages.id),
    decisionNotifiedAt: timestamp("decision_notified_at", { withTimezone: true }),
    /** Why the notification failed. Shown to the owner, not just logged. */
    decisionNotifyError: text("decision_notify_error"),

    /**
     * Why this order is still waiting — the auto-confirm gate's reason,
     * recorded at capture.
     *
     * "Why is this pending?" must be answerable from the row. The same reason
     * the gate returns is stored here and shown in the tab, exactly as
     * AutonomyDecision.reason is surfaced on a waiting draft.
     */
    pendingReason: text("pending_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The Orders tab: workspace + status, newest first.
    index("orders_workspace_status_idx").on(t.workspaceId, t.status, t.createdAt),
    // Drizzle's `enum` is a TYPESCRIPT constraint only — it emits no database
    // check, so raw SQL or a future code path can write any string. The Orders
    // tab filters on status, so an out-of-enum value would not raise anything:
    // the order would simply never appear. That silent disappearance is the
    // failure mode this build is meant to avoid, so it is constrained here.
    // A deliberate deviation from the platform's convention for status columns,
    // because this particular one gates visibility.
    check(
      "orders_status_valid",
      sql`${t.status} in ('pending', 'confirmed', 'cancelled', 'fulfilled')`,
    ),
    // The read path: this customer's history, newest first. Without this,
    // every reply to a returning customer sequentially scans the table.
    index("orders_contact_idx").on(t.contactId, t.createdAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // NULLABLE on purpose. A customer will order something the catalog does
    // not contain, or phrase it unmatchably. Forcing a link would mean either
    // dropping the line or inventing a match — both worse than an unlinked row
    // the owner can see and fix. The auto-confirm gate refuses to fire while
    // any item is unlinked, because an unmatched item is an unpriced item.
    knowledgeItemId: uuid("knowledge_item_id").references(() => knowledgeItems.id),
    /** Always populated, even when linked — an unlinked row still reads right. */
    nameText: text("name_text").notNull(),
    quantity: integer("quantity").notNull().default(1),
    /** Copied from the catalog AT CAPTURE, so a later price edit cannot
     *  silently rewrite what the customer was quoted. */
    unitPriceText: text("unit_price_text"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    // A zero or negative quantity is never a real order line; it is an
    // extraction bug. Rejecting it at the database means no later reader has
    // to defend against it.
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

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

// ── Billing (Step 9): subscription state; credits computed from ai_calls ───────

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .unique()
    .references(() => workspaces.id),
  // Provider-neutral. These were stripe_customer_id / stripe_subscription_id,
  // which named one vendor in the schema and would not have held a Paddle id
  // without lying about what it was. Renamed while the table was EMPTY — after
  // the first paying customer this becomes a data migration instead of a rename.
  //
  // `provider` is required rather than defaulted: a row whose ids belong to a
  // provider nobody recorded is unfixable later, and a default would let a
  // caller create one by forgetting.
  provider: text("provider", { enum: ["stripe", "paddle"] }).notNull(),
  providerCustomerId: text("provider_customer_id").notNull(),
  providerSubscriptionId: text("provider_subscription_id"),
  plan: text("plan").notNull().default("trial"),
  status: text("status").notNull().default("incomplete"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

// Team invitations (Users & Permissions). A pending invite is consumed on the
// invitee's first sign-in with the matching email — they join THIS workspace
// with the given role instead of getting a fresh personal one.
export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    email: text("email").notNull(), // lowercased
    role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
    token: text("token").notNull().unique(),
    status: text("status", { enum: ["pending", "accepted", "revoked"] })
      .notNull()
      .default("pending"),
    invitedBy: text("invited_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("workspace_invites_ws_email_idx").on(t.workspaceId, t.email)],
);

// Manual payments (bank transfer / Whish). The owner claims they paid; an admin
// confirms or rejects in /admin. Stripe is untouched and stays behind
// BILLING_ENABLED — this is the path used while there's no registered company.
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    // Mirrors the payable plans in PLANS (packages/core/src/billing.ts). A
    // Drizzle text enum is a TypeScript constraint only — the column is plain
    // `text` in Postgres, so adding a plan here needs no migration.
    plan: text("plan", { enum: ["entry", "starter", "growth", "pro"] }).notNull(),
    // Snapshotted from PLANS server-side at claim time — never client-supplied.
    amountUsd: integer("amount_usd").notNull(),
    // Stable per-user code the payer puts in the transfer memo (OV-XXXXXX).
    referenceCode: text("reference_code").notNull(),
    method: text("method", { enum: ["BANK", "WHISH"] }).notNull(),
    // The reference/receipt number the payer typed from their own transfer.
    claimedReference: text("claimed_reference").notNull(),
    // Optional proof, stored as a data: URL. Capped at ~2MB decoded — at a few
    // payments a month this isn't worth running blob storage for.
    screenshot: text("screenshot"),
    status: text("status", { enum: ["CLAIMED", "CONFIRMED", "REJECTED"] })
      .notNull()
      .default("CLAIMED"),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_status_idx").on(t.status, t.createdAt),
    index("payments_workspace_idx").on(t.workspaceId),
  ],
);

// Outbound owner notifications (e.g. "a reply needs your approval"). Doubles as
// the idempotency ledger: the unique (workspace, type, dedupe_key) index is what
// stops a retried job from emailing the owner twice.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    type: text("type").notNull(), // "draft_approval" | "escalation"
    dedupeKey: text("dedupe_key").notNull(), // triggering message id
    channel: text("channel").notNull().default("email"),
    status: text("status", { enum: ["sent", "failed", "skipped"] }).notNull(),
    detail: text("detail"), // recipient on success, reason on skip/failure
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notifications_dedupe_idx").on(t.workspaceId, t.type, t.dedupeKey)],
);
