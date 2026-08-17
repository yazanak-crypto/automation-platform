import * as Sentry from "@sentry/node";
import { aiConfigured, callAi } from "@platform/ai";
import { getContextPack } from "@platform/brain";
import {
  deliverOutbound,
  findBannedPhrase,
  priorClosedConversations,
  recentConversationMessages,
  supersedePendingDrafts,
} from "@platform/channels";
import {
  addRunEvent,
  createRun,
  findActiveActivation,
  finishRun,
  QUEUE_NAMES,
  WORKER_TUNING,
  type WebchatDraftJob,
} from "@platform/core";
import { conversations, db, messages, runs, workspaces } from "@platform/db";
import {
  boundaryCheckOutputSchema,
  webchatDraftOutputSchema,
  type ActivationAutonomyOverrides,
  type Category,
  type WebchatDraftOutput,
  type WorkspaceAutonomySettings,
} from "@platform/schemas";
import {
  buildLeadConciergePrompt,
  leadConcierge,
  LEAD_CONCIERGE_PROMPT_REF,
  LEAD_CONCIERGE_PROMPT_VERSION,
  LEAD_CONCIERGE_SYSTEM,
} from "@platform/catalog";
import {
  decideAction,
  getCreditStatus,
  notifyDraftAwaitingApproval,
  resolvePolicy,
  shouldSendHoldingLine,
  takeLimit,
  withRedisLock,
  type AutonomyDecision,
} from "@platform/core";
import { Worker, type ConnectionOptions } from "bullmq";
import { and, desc, eq } from "drizzle-orm";

const PROMPT_REF = LEAD_CONCIERGE_PROMPT_REF;
const PROMPT_VERSION = LEAD_CONCIERGE_PROMPT_VERSION;
const SYSTEM = LEAD_CONCIERGE_SYSTEM;

function parseDraft(text: string): WebchatDraftOutput | null {
  const raw = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return webchatDraftOutputSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Deterministic banned-phrase scan + fast-tier AI boundary check (plan §4.3). */
async function violatesBoundaries(args: {
  workspaceId: string;
  runId: string;
  brainVersion: number;
  reply: string;
  boundaries: string[];
  bannedPhrases: string[];
}): Promise<{ violates: boolean; rule?: string }> {
  const banned = findBannedPhrase(args.reply, args.bannedPhrases);
  if (banned) return { violates: true, rule: `banned phrase: "${banned}"` };
  if (args.boundaries.length === 0) return { violates: false };

  const res = await callAi({
    workspaceId: args.workspaceId,
    runId: args.runId,
    promptRef: "webchat/boundary-check",
    promptVersion: "v1",
    tier: "fast",
    system:
      'You check whether a reply violates any of the given hard rules. Respond ONLY with JSON: {"violates":boolean,"rule":string}. rule = the violated rule, only when violates is true.',
    prompt: `Rules:\n${args.boundaries.map((b) => `- ${b}`).join("\n")}\n\nReply to check:\n<reply>\n${args.reply}\n</reply>`,
    maxTokens: 200,
    brainVersion: args.brainVersion,
  });
  try {
    const parsed = boundaryCheckOutputSchema.parse(
      JSON.parse(res.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()),
    );
    return parsed;
  } catch {
    // Unparseable check = fail closed: treat as violation, human handles it.
    return { violates: true, rule: "boundary check unparseable" };
  }
}

async function processDraft(job: WebchatDraftJob) {
  // Audit-2 P0-1: serialize per conversation; concurrent messages can never
  // double-draft or double-auto-send.
  const result = await withRedisLock(`draft:${job.conversationId}`, 120, () =>
    processDraftLocked(job),
  );
  if (result === null) throw new Error("Could not acquire conversation lock");
  return result;
}

async function latestInboundId(conversationId: string): Promise<string | null> {
  const rows = await db()
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.direction, "inbound")))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function processDraftLocked(job: WebchatDraftJob) {
  // Activation gate (M1 step 6): only act when this workspace has an active
  // Lead Concierge activation covering this conversation's channel.
  const convoRows = await db()
    .select()
    .from(conversations)
    .where(eq(conversations.id, job.conversationId))
    .limit(1);
  const convo = convoRows[0];
  if (!convo) return { outcome: "skipped", reason: "conversation missing" };
  const activation = await findActiveActivation(
    job.workspaceId,
    "lead-concierge",
    convo.channelId,
  );
  if (!activation) {
    // No activation → no AI, no run, no cost. Owner replies manually.
    return { outcome: "skipped", reason: "no active activation" };
  }

  // Audit-2 P0-1: if a newer visitor message already arrived, skip — the
  // newest job answers with full context instead of racing this one.
  if ((await latestInboundId(job.conversationId)) !== job.messageId) {
    return { outcome: "skipped", reason: "superseded by newer message" };
  }

  // AI provider optional (founder directive): no key -> no drafting, no crash.
  // The message waits for the owner like any manual conversation.
  if (!aiConfigured()) {
    return { outcome: "skipped", reason: "ai not configured" };
  }

  // Step 9: credit enforcement — exhausted credits block AI work gracefully;
  // the conversation surfaces to the owner instead of being dropped.
  const credits = await getCreditStatus(job.workspaceId);
  if (credits.exhausted) {
    await db()
      .update(conversations)
      .set({
        status: "waiting_approval",
        attentionReason: credits.trialEnded
          ? "Your free trial has ended — upgrade to put your AI back on duty"
          : "You've used this month's conversations — upgrade your plan or reply yourself",
      })
      .where(eq(conversations.id, job.conversationId));
    return { outcome: "credits_exhausted" };
  }

  // Audit-2 P0-2: interim per-workspace AI-draft cap across ALL channels
  // until Step 9 metering lands. Deferred, never silently dropped.
  if (!(await takeLimit(`draftcap:${job.workspaceId}`, 300, 86400))) {
    await db()
      .update(conversations)
      .set({
        status: "waiting_approval",
        attentionReason: "Daily AI limit reached — this message is waiting for your reply",
      })
      .where(eq(conversations.id, job.conversationId));
    console.warn(`[draft] workspace ${job.workspaceId} hit the daily draft cap`);
    return { outcome: "capped" };
  }

  const run = await createRun({
    workspaceId: job.workspaceId,
    kind: "lead-concierge",
    activationId: activation.id,
    conversationId: job.conversationId,
    triggerMessageId: job.messageId,
  });
  let seq = 0;

  try {
    const msgRows = await db()
      .select()
      .from(messages)
      .where(eq(messages.id, job.messageId))
      .limit(1);
    const trigger = msgRows[0];
    if (!trigger) throw new Error("Trigger message not found");
    await addRunEvent(run.id, ++seq, "step", "Read visitor message", {
      preview: trigger.body.slice(0, 200),
    });
    const prior = await priorClosedConversations(convo.contactId);
    const history = await recentConversationMessages(job.conversationId);

    const { pack, brainVersion } = await getContextPack(
      job.workspaceId,
      ["identity", "voice", "policies", "boundaries", "faq_retrieval"],
      { queryText: trigger.body },
    );
    await addRunEvent(run.id, ++seq, "step", "Assembled business context", {
      brainVersion,
      knowledgeUsed: pack.knowledge?.map((k) => k.title) ?? [],
      boundaries: pack.boundaries?.length ?? 0,
    });

    const contextBlock = JSON.stringify({
      business: pack.identity ?? {},
      voice: pack.voice ?? {},
      policies: pack.policies ?? {},
      knowledge: pack.knowledge ?? [],
      boundaries: pack.boundaries ?? [],
      returningVisitor: prior > 0 ? `${prior} previous conversation(s)` : undefined,
    });
    const gen = async (feedback?: string) =>
      callAi({
        workspaceId: job.workspaceId,
        runId: run.id,
        promptRef: PROMPT_REF,
        promptVersion: PROMPT_VERSION,
        tier: "frontier",
        system: SYSTEM,
        prompt: buildLeadConciergePrompt({
          contextPack: JSON.parse(contextBlock),
          activationConfig: activation.config,
          history,
          visitorMessage: trigger.body,
          feedback,
        }),
        maxTokens: 1024,
        brainVersion,
      });

    let res = await gen();
    let draft = parseDraft(res.text);
    if (!draft) {
      res = await gen();
      draft = parseDraft(res.text);
    }
    if (!draft) throw new Error("Draft output failed validation twice");

    await addRunEvent(run.id, ++seq, "decision", `Classified as ${draft.category}`, {
      reasoning: draft.reasoning,
      usedFacts: draft.usedFacts,
      confidence: draft.confidence,
      grounded: draft.groundedOnContext,
    });

    if (draft.category === "spam" || draft.category === "abusive") {
      await finishRun(run.id, "succeeded", {
        outcomeMetrics: { drafted: false },
        category: draft.category,
        confidence: draft.confidence,
        action: "ignored",
      });
      return { outcome: draft.category };
    }
    const category = draft.category as Category;

    // Boundary post-check (fail-closed), with one regeneration attempt.
    let boundaryCheckPassed = true;
    if (draft.reply.trim()) {
      const bannedPhrases =
        (pack.voice as { bannedPhrases?: string[] } | undefined)?.bannedPhrases ?? [];
      let check = await violatesBoundaries({
        workspaceId: job.workspaceId,
        runId: run.id,
        brainVersion,
        reply: draft.reply,
        boundaries: pack.boundaries ?? [],
        bannedPhrases,
      });
      if (check.violates) {
        // Re-check credits before regenerating. The gate above ran BEFORE the
        // first draft; a workspace near its limit can cross it mid-message, and
        // regeneration plus a second boundary check is two more calls. Skip the
        // AI here rather than overshoot — the draft is unverified, so it fails
        // closed and goes to the owner.
        const now = await getCreditStatus(job.workspaceId, { skipCache: true });
        if (now.exhausted) {
          await addRunEvent(run.id, ++seq, "decision", "Out of conversations — not regenerating", {
            rule: check.rule,
          });
          boundaryCheckPassed = false;
        } else {
          await addRunEvent(run.id, ++seq, "decision", "Draft violated a boundary — regenerating", {
            rule: check.rule,
          });
          const retry = await gen(check.rule);
          const retryDraft = parseDraft(retry.text);
          if (retryDraft?.reply.trim()) {
            check = await violatesBoundaries({
              workspaceId: job.workspaceId,
              runId: run.id,
              brainVersion,
              reply: retryDraft.reply,
              boundaries: pack.boundaries ?? [],
              bannedPhrases,
            });
            if (!check.violates) {
              draft = { ...retryDraft, category: draft.category };
            } else {
              boundaryCheckPassed = false;
            }
          } else {
            boundaryCheckPassed = false;
          }
        }
      }
    }

    // ── The autonomy decision (Decision 012): deterministic, never the LLM ──
    const wsRows = await db()
      .select({ autonomySettings: workspaces.autonomySettings })
      .from(workspaces)
      .where(eq(workspaces.id, job.workspaceId))
      .limit(1);
    const policy = resolvePolicy(
      leadConcierge.autonomyPolicy,
      (wsRows[0]?.autonomySettings ?? null) as WorkspaceAutonomySettings | null,
      (activation.autonomyOverrides ?? null) as ActivationAutonomyOverrides | null,
    );
    const decision = decideAction({
      mode: activation.mode,
      policy,
      category,
      confidence: draft.confidence,
      grounded: draft.groundedOnContext,
      boundaryCheckPassed,
      needsHuman: draft.needsHuman,
      hasReply: !!draft.reply.trim(),
    });
    await addRunEvent(run.id, ++seq, "decision", autonomyEventTitle(decision), {
      reason: decision.reason,
      wouldAutoSend: decision.wouldAutoSend,
    });

    const telemetry = {
      category,
      confidence: draft.confidence,
      action: decision.action === "escalate" ? "escalated" : decision.action,
    };

    if (decision.action === "escalate") {
      const overrides = (activation.autonomyOverrides ?? {}) as ActivationAutonomyOverrides;
      const holdingLine = shouldSendHoldingLine(activation.mode, overrides);
      await db().transaction(async (tx) => {
        if (holdingLine) {
          // Fixed copy, never generated — the visitor isn't ghosted.
          await tx.insert(messages).values({
            workspaceId: job.workspaceId,
            conversationId: job.conversationId,
            direction: "outbound",
            body: "Thanks for reaching out — I've passed this to the owner. You'll hear back from them shortly.",
            aiGenerated: true,
            draftStatus: "auto_sent",
            deliveryState: "visible",
          });
        }
        await tx
          .update(conversations)
          .set({ status: "waiting_approval", attentionReason: decision.reason })
          .where(eq(conversations.id, job.conversationId));
      });
      await finishRun(run.id, "waiting_approval", {
        outcomeMetrics: { drafted: false, needsHuman: true, escalationReason: decision.reason },
        ...telemetry,
      });
      if (holdingLine) await deliverAutoMessage(job.conversationId, run.id);
      return { outcome: "escalated" };
    }

    // Audit P0-2: a newer draft supersedes any older pending one — nothing orphans.
    const superseded = await supersedePendingDrafts(job.conversationId, "superseded");
    if (superseded > 0) {
      await addRunEvent(run.id, ++seq, "step", "Replaced an older waiting draft", {});
    }

    if (decision.action === "auto_send" && (await latestInboundId(job.conversationId)) !== job.messageId) {
      await addRunEvent(run.id, ++seq, "decision", "Newer message arrived — not auto-sending", {});
      await finishRun(run.id, "succeeded", { outcomeMetrics: { superseded: true }, ...telemetry });
      return { outcome: "superseded" };
    }

    if (decision.action === "auto_send") {
      await db().transaction(async (tx) => {
        await tx.insert(messages).values({
          workspaceId: job.workspaceId,
          conversationId: job.conversationId,
          direction: "outbound",
          body: draft.reply,
          aiGenerated: true,
          draftStatus: "auto_sent",
          deliveryState: "visible",
        });
        await tx
          .update(conversations)
          .set({ status: "open", attentionReason: null, lastMessageAt: new Date() })
          .where(eq(conversations.id, job.conversationId));
      });
      await addRunEvent(run.id, ++seq, "step", "Reply sent automatically", {
        preview: draft.reply.slice(0, 200),
      });
      await finishRun(run.id, "succeeded", {
        outcomeMetrics: { drafted: true, autoSent: true },
        ...telemetry,
      });
      await deliverAutoMessage(job.conversationId, run.id);
      return { outcome: "auto_sent" };
    }

    await db().transaction(async (tx) => {
      await tx.insert(messages).values({
        workspaceId: job.workspaceId,
        conversationId: job.conversationId,
        direction: "outbound",
        body: draft.reply,
        aiGenerated: true,
        draftStatus: "pending_approval",
      });
      await tx
        .update(conversations)
        .set({ status: "waiting_approval", attentionReason: decision.reason })
        .where(eq(conversations.id, job.conversationId));
    });
    await addRunEvent(run.id, ++seq, "step", "Draft ready for approval", {
      preview: draft.reply.slice(0, 200),
    });
    await finishRun(run.id, "waiting_approval", {
      outcomeMetrics: { drafted: true, wouldAutoSend: decision.wouldAutoSend },
      ...telemetry,
    });
    // Tell the owner a reply is waiting (Priority 2). Idempotent on the trigger
    // message; never lets a notification failure fail the run.
    await notifyDraftAwaitingApproval({
      workspaceId: job.workspaceId,
      conversationId: job.conversationId,
      triggerMessageId: job.messageId,
      customerMessage: trigger.body,
      suggestedReply: draft.reply,
    }).catch((err) => {
      console.error("[notify] draft-approval email failed:", err);
      Sentry.captureException(err);
    });
    return { outcome: "drafted" };
  } catch (err) {
    await addRunEvent(run.id, ++seq, "error", "Draft generation failed", {
      message: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
    await finishRun(run.id, "failed", {
      errorSummary: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
    throw err;
  }
}

async function deliverAutoMessage(conversationId: string, runId: string) {
  // Deliver the newest auto_sent outbound on its channel (email sends; web chat
  // is a no-op — the widget polls). Failure marks deliveryState, never throws
  // the whole run away.
  const rows = await db()
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.draftStatus, "auto_sent")))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (!rows[0]) return;
  await deliverOutbound(rows[0].id).catch(async (err) => {
    // Audit-2 P0-4: a failed delivery is never silent — the owner sees it.
    console.error("[deliver] auto message failed:", err.message);
    Sentry.captureException(err);
    await db()
      .update(conversations)
      .set({
        status: "waiting_approval",
        attentionReason: "A reply failed to send — please resend or reply yourself",
      })
      .where(eq(conversations.id, conversationId));
    await db()
      .update(runs)
      .set({ status: "failed", errorSummary: `Delivery failed: ${err.message}` })
      .where(eq(runs.id, runId));
  });
}

function autonomyEventTitle(decision: AutonomyDecision): string {
  switch (decision.action) {
    case "auto_send":
      return "Auto-handled";
    case "escalate":
      return "Escalated to owner";
    default:
      return decision.wouldAutoSend
        ? "Draft for approval (would have been auto-handled)"
        : "Draft for approval";
  }
}

export function startWebchatWorker(connection: ConnectionOptions) {
  const w = new Worker<WebchatDraftJob>(
    QUEUE_NAMES.webchatDraft,
    async (job) => processDraft(job.data),
    { connection, concurrency: 3, ...WORKER_TUNING },
  );
  w.on("failed", (job, err) => {
    console.error(`[webchat.draft] job ${job?.id} failed:`, err.message);
    Sentry.captureException(err);
  });
  return w;
}
