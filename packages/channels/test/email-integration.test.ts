/** DB-gated: email conversation threading + contact reuse (channel-agnostic model). */
import { beforeAll, describe, expect, it } from "vitest";
import { channels, db, workspaces } from "@platform/db";
import { getOrCreateEmailConversation, upsertEmailContact } from "../src/email";

const hasDb = !!process.env.TEST_DATABASE_URL;
const uuid = () => crypto.randomUUID();

describe.skipIf(!hasDb)("email channel integration", () => {
  let ws: string;
  let ch: string;

  beforeAll(async () => {
    ws = (
      await db().insert(workspaces).values({ name: "Em T", slug: `t-${uuid().slice(0, 12)}` }).returning()
    )[0]!.id;
    ch = (
      await db()
        .insert(channels)
        .values({ workspaceId: ws, type: "email", displayName: "Email · t@t.com", config: {} })
        .returning()
    )[0]!.id;
  });

  it("same email address reuses one contact", async () => {
    const a = await upsertEmailContact(ws, "jane@acme.com", "Jane");
    const b = await upsertEmailContact(ws, "jane@acme.com");
    expect(b.id).toBe(a.id);
    const c = await upsertEmailContact(ws, "other@acme.com");
    expect(c.id).not.toBe(a.id);
  });

  it("same gmail thread reuses one conversation; different threads split", async () => {
    const contact = await upsertEmailContact(ws, "thread@acme.com");
    const c1 = await getOrCreateEmailConversation(ws, ch, contact.id, "thread-123");
    const c2 = await getOrCreateEmailConversation(ws, ch, contact.id, "thread-123");
    const c3 = await getOrCreateEmailConversation(ws, ch, contact.id, "thread-456");
    expect(c2.id).toBe(c1.id);
    expect(c3.id).not.toBe(c1.id);
    expect(c1.providerThreadRef).toBe("thread-123");
  });
});

describe.skipIf(hasDb)("email integration (skipped)", () => {
  it("requires DATABASE_URL", () => expect(true).toBe(true));
});
