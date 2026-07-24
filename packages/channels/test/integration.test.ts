/**
 * DB integration — requires DATABASE_URL with migrations applied (CI service
 * container or local docker-compose). Skipped otherwise.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { channels, db, messages, workspaces } from "@platform/db";
import { eq } from "drizzle-orm";
import {
  appendVisitorMessage,
  getActiveChannelByWidgetKey,
  getOrCreateOpenConversation,
  getVisitorView,
  upsertVisitorContact,
} from "../src";

const hasDb = !!process.env.TEST_DATABASE_URL;
const uuid = () => crypto.randomUUID();

describe.skipIf(!hasDb)("webchat integration", () => {
  let wsA: string;
  let wsB: string;
  let chA: { id: string; widgetKey: string };
  let chB: { id: string; widgetKey: string };

  beforeAll(async () => {
    const mkWs = async (name: string) =>
      (await db().insert(workspaces).values({ name, slug: `t-${uuid().slice(0, 12)}` }).returning())[0]!.id;
    wsA = await mkWs("WC Tenant A");
    wsB = await mkWs("WC Tenant B");
    const mkCh = async (ws: string) =>
      (
        await db()
          .insert(channels)
          .values({
            workspaceId: ws,
            type: "web_chat",
            displayName: "Website chat",
            config: { allowedOrigins: ["https://site.example"] },
          })
          .returning()
      )[0]!;
    chA = await mkCh(wsA);
    chB = await mkCh(wsB);
  });

  it("visitor session continuity: same visitor reuses the open conversation", async () => {
    const visitor = uuid();
    const contact = await upsertVisitorContact(wsA, visitor);
    const c1 = await getOrCreateOpenConversation(wsA, chA.id, contact.id);
    const c2 = await getOrCreateOpenConversation(wsA, chA.id, contact.id);
    expect(c2.id).toBe(c1.id);
  });

  it("message dedupe: same clientMessageId never duplicates (AC-2.4)", async () => {
    const visitor = uuid();
    const contact = await upsertVisitorContact(wsA, visitor);
    const convo = await getOrCreateOpenConversation(wsA, chA.id, contact.id);
    const cmid = uuid();
    const r1 = await appendVisitorMessage({ workspaceId: wsA, conversationId: convo.id, body: "hello", clientMessageId: cmid });
    const r2 = await appendVisitorMessage({ workspaceId: wsA, conversationId: convo.id, body: "hello", clientMessageId: cmid });
    expect(r1.duplicate).toBe(false);
    expect(r2.duplicate).toBe(true);
    expect(r2.message.id).toBe(r1.message.id);
  });

  it("visitor isolation: a visitor sees only their own thread, and only approved outbound (AC-2.10)", async () => {
    const alice = uuid();
    const mallory = uuid();
    const aliceContact = await upsertVisitorContact(wsA, alice);
    const convo = await getOrCreateOpenConversation(wsA, chA.id, aliceContact.id);
    await appendVisitorMessage({ workspaceId: wsA, conversationId: convo.id, body: "my order", clientMessageId: uuid() });
    // pending draft + approved reply
    await db().insert(messages).values([
      { workspaceId: wsA, conversationId: convo.id, direction: "outbound", body: "PENDING DRAFT", aiGenerated: true, draftStatus: "pending_approval" },
      { workspaceId: wsA, conversationId: convo.id, direction: "outbound", body: "Approved reply", aiGenerated: true, draftStatus: "approved" },
    ]);

    const aliceView = await getVisitorView(wsA, chA.id, alice);
    const bodies = aliceView.messages.map((m) => m.body);
    expect(bodies).toContain("my order");
    expect(bodies).toContain("Approved reply");
    expect(bodies).not.toContain("PENDING DRAFT");

    const malloryView = await getVisitorView(wsA, chA.id, mallory);
    expect(malloryView.conversation).toBeNull();
    expect(malloryView.messages).toHaveLength(0);
  });

  it("tenant isolation: the same visitor id in workspace B sees nothing from A", async () => {
    const visitor = uuid();
    const contactA = await upsertVisitorContact(wsA, visitor);
    const convoA = await getOrCreateOpenConversation(wsA, chA.id, contactA.id);
    await appendVisitorMessage({ workspaceId: wsA, conversationId: convoA.id, body: "A-secret", clientMessageId: uuid() });

    const viewInB = await getVisitorView(wsB, chB.id, visitor);
    expect(viewInB.messages.map((m) => m.body)).not.toContain("A-secret");
  });

  it("widget key lookup respects channel status", async () => {
    expect(await getActiveChannelByWidgetKey(chA.widgetKey)).not.toBeNull();
    await db().update(channels).set({ status: "disabled" }).where(eq(channels.id, chB.id));
    expect(await getActiveChannelByWidgetKey(chB.widgetKey)).toBeNull();
    expect(await getActiveChannelByWidgetKey(uuid())).toBeNull();
  });
});

describe.skipIf(hasDb)("webchat integration (skipped)", () => {
  it("requires DATABASE_URL", () => expect(true).toBe(true));
});
