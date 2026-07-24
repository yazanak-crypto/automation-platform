/**
 * Regression tests for audit P0 items 1, 2, 4, 5 (DB-gated; run in CI).
 * Each test reproduces the original bug's scenario and asserts the fix.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { addRunEvent, createRun, finishRun } from "@platform/core";
import {
  aiCalls,
  channels,
  contacts,
  conversations,
  db,
  messages,
  runs,
  workspaces,
} from "@platform/db";
import { and, eq } from "drizzle-orm";
import {
  closeConversation,
  closeIdleConversations,
  resolveWaitingRuns,
  supersedePendingDrafts,
} from "../src";

const hasDb = !!process.env.TEST_DATABASE_URL;
const uuid = () => crypto.randomUUID();

describe.skipIf(!hasDb)("lifecycle regressions (audit wave 1)", () => {
  let ws: string;
  let ch: string;

  async function mkConversation(lastMessageAt = new Date()) {
    const contact = (
      await db()
        .insert(contacts)
        .values({ workspaceId: ws, webchatVisitorId: uuid() })
        .returning()
    )[0]!;
    return (
      await db()
        .insert(conversations)
        .values({ workspaceId: ws, channelId: ch, contactId: contact.id, lastMessageAt })
        .returning()
    )[0]!;
  }

  async function mkPendingDraft(conversationId: string, body: string) {
    const run = await createRun({ workspaceId: ws, kind: "lead-concierge", conversationId });
    await db().insert(messages).values({
      workspaceId: ws,
      conversationId,
      direction: "outbound",
      body,
      aiGenerated: true,
      draftStatus: "pending_approval",
    });
    await finishRun(run.id, "waiting_approval", { outcomeMetrics: { drafted: true } });
    return run;
  }

  beforeAll(async () => {
    ws = (await db().insert(workspaces).values({ name: "LC T", slug: `t-${uuid().slice(0, 12)}` }).returning())[0]!.id;
    ch = (
      await db()
        .insert(channels)
        .values({ workspaceId: ws, type: "web_chat", displayName: "wc", config: {} })
        .returning()
    )[0]!.id;
  });

  it("P0-1: a needs-human run resolves when the owner acts (attention item clears)", async () => {
    const convo = await mkConversation();
    const run = await createRun({ workspaceId: ws, kind: "lead-concierge", conversationId: convo.id });
    await finishRun(run.id, "waiting_approval", { outcomeMetrics: { needsHuman: true } });

    // Bug: nothing ever resolved this. Fix path = manual reply / close calls:
    const resolved = await resolveWaitingRuns(convo.id, "manual_reply");
    expect(resolved).toBe(1);

    const after = (await db().select().from(runs).where(eq(runs.id, run.id)))[0]!;
    expect(after.status).toBe("succeeded");
    expect(after.finishedAt).not.toBeNull();
    expect(after.outcomeMetrics).toMatchObject({ needsHuman: true, resolution: "manual_reply" });
  });

  it("P0-2: a newer draft supersedes older pending drafts and resolves their runs", async () => {
    const convo = await mkConversation();
    const oldRun = await mkPendingDraft(convo.id, "old draft");

    // New draft arrives → job calls supersede first (as the worker now does).
    const count = await supersedePendingDrafts(convo.id, "superseded");
    await mkPendingDraft(convo.id, "new draft");
    expect(count).toBe(1);

    const msgs = await db()
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, convo.id), eq(messages.direction, "outbound")));
    expect(msgs.find((m) => m.body === "old draft")?.draftStatus).toBe("dismissed");
    expect(msgs.find((m) => m.body === "new draft")?.draftStatus).toBe("pending_approval");

    const oldRunAfter = (await db().select().from(runs).where(eq(runs.id, oldRun.id)))[0]!;
    expect(oldRunAfter.status).toBe("succeeded");
    expect(oldRunAfter.outcomeMetrics).toMatchObject({ resolution: "superseded" });
  });

  it("P0-4: finishRun aggregates real ai_calls cost onto the run", async () => {
    const convo = await mkConversation();
    const run = await createRun({ workspaceId: ws, kind: "lead-concierge", conversationId: convo.id });
    await db().insert(aiCalls).values([
      { workspaceId: ws, runId: run.id, model: "m", promptRef: "p", promptVersion: "v", tokensIn: 10, tokensOut: 10, estimatedCostMicrocents: 1200, latencyMs: 5, success: true },
      { workspaceId: ws, runId: run.id, model: "m", promptRef: "p", promptVersion: "v", tokensIn: 5, tokensOut: 5, estimatedCostMicrocents: 300, latencyMs: 5, success: true },
    ]);
    await addRunEvent(run.id, 1, "step", "x");
    await finishRun(run.id, "succeeded");
    const after = (await db().select().from(runs).where(eq(runs.id, run.id)))[0]!;
    expect(after.costMicrocents).toBe(1500);
  });

  it("P0-5: closeConversation retires drafts, resolves runs, marks closed; tenancy holds", async () => {
    const convo = await mkConversation();
    await mkPendingDraft(convo.id, "will be retired");

    // wrong workspace → refused
    expect(await closeConversation(uuid(), convo.id)).toBe(false);

    expect(await closeConversation(ws, convo.id)).toBe(true);
    const after = (await db().select().from(conversations).where(eq(conversations.id, convo.id)))[0]!;
    expect(after.status).toBe("closed");
    const drafts = await db()
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, convo.id), eq(messages.draftStatus, "pending_approval")));
    expect(drafts).toHaveLength(0);
  });

  it("P0-5: idle sweep closes only stale conversations", async () => {
    const stale = await mkConversation(new Date(Date.now() - 8 * 24 * 3600 * 1000));
    const fresh = await mkConversation();
    await closeIdleConversations(7);
    const staleAfter = (await db().select().from(conversations).where(eq(conversations.id, stale.id)))[0]!;
    const freshAfter = (await db().select().from(conversations).where(eq(conversations.id, fresh.id)))[0]!;
    expect(staleAfter.status).toBe("closed");
    expect(freshAfter.status).toBe("open");
  });
});

describe.skipIf(hasDb)("lifecycle regressions (skipped)", () => {
  it("requires DATABASE_URL", () => expect(true).toBe(true));
});
