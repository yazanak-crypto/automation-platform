import { callAi } from "@platform/ai";
import { getContextPack } from "@platform/brain";
import {
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
  type WebchatDraftJob,
} from "@platform/core";
import { conversations, db, messages } from "@platform/db";
import {
  boundaryCheckOutputSchema,
  webchatDraftOutputSchema,
  type WebchatDraftOutput,
} from "@platform/schemas";
import {
  buildLeadConciergePrompt,
  LEAD_CONCIERGE_PROMPT_REF,
  LEAD_CONCIERGE_PROMPT_VERSION,
  LEAD_CONCIERGE_SYSTEM,
} from "@platform/catalog";
import { Worker, type ConnectionOptions } from "bullmq";
import { eq } from "drizzle-orm";

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

    await addRunEvent(run.id, ++seq, "decision", `Classified as ${draft.classification}`, {
      reasoning: draft.reasoning,
      usedFacts: draft.usedFacts,
    });

    if (draft.classification === "spam" || draft.classification === "abusive") {
      await finishRun(run.id, "succeeded", {
        outcomeMetrics: { classification: draft.classification, drafted: false },
      });
      return { outcome: draft.classification };
    }

    let needsHuman = draft.needsHuman || !draft.reply.trim();

    if (!needsHuman) {
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
            draft = { ...retryDraft, classification: draft.classification };
          } else {
            needsHuman = true;
          }
        } else {
          needsHuman = true;
        }
      }
    }

    if (needsHuman) {
      await addRunEvent(run.id, ++seq, "decision", "Needs a human reply", {});
      await db()
        .update(conversations)
        .set({ status: "waiting_approval" })
        .where(eq(conversations.id, job.conversationId));
      await finishRun(run.id, "waiting_approval", {
        outcomeMetrics: { classification: draft.classification, drafted: false, needsHuman: true },
      });
      return { outcome: "needs_human" };
    }

    // Audit P0-2: a newer draft supersedes any older pending one — nothing orphans.
    const superseded = await supersedePendingDrafts(job.conversationId, "superseded");
    if (superseded > 0) {
      await addRunEvent(run.id, ++seq, "step", "Replaced an older waiting draft", {});
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
        .set({ status: "waiting_approval" })
        .where(eq(conversations.id, job.conversationId));
    });
    await addRunEvent(run.id, ++seq, "step", "Draft ready for approval", {
      preview: draft.reply.slice(0, 200),
    });
    await finishRun(run.id, "waiting_approval", {
      outcomeMetrics: { classification: draft.classification, drafted: true },
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

export function startWebchatWorker(connection: ConnectionOptions) {
  const w = new Worker<WebchatDraftJob>(
    QUEUE_NAMES.webchatDraft,
    async (job) => processDraft(job.data),
    { connection, concurrency: 3 },
  );
  w.on("failed", (job, err) =>
    console.error(`[webchat.draft] job ${job?.id} failed:`, err.message),
  );
  return w;
}
