import { describe, expect, it } from "vitest";
import { parseWhatsAppWebhook } from "../src/meta";

const wrap = (value: unknown) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA_1", changes: [{ field: "messages", value }] }],
});

const textValue = (over: Record<string, unknown> = {}) => ({
  messaging_product: "whatsapp",
  metadata: { display_phone_number: "9611234567", phone_number_id: "PHONE_1" },
  contacts: [{ profile: { name: "Lina" }, wa_id: "96170123456" }],
  messages: [
    {
      from: "96170123456",
      id: "wamid.ABC123",
      timestamp: "1769000000", // UNIX SECONDS as a string
      type: "text",
      text: { body: "Do you deliver to Tripoli?" },
      ...over,
    },
  ],
});

describe("parseWhatsAppWebhook", () => {
  it("extracts an inbound text message", () => {
    const { events, skipped } = parseWhatsAppWebhook(wrap(textValue()));
    expect(skipped).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      phoneNumberId: "PHONE_1",
      wabaId: "WABA_1",
      waId: "96170123456",
      mid: "wamid.ABC123",
      text: "Do you deliver to Tripoli?",
      senderName: "Lina",
      receivedAt: new Date(1769000000 * 1000),
    });
  });

  it("reads the timestamp as seconds, not milliseconds", () => {
    // Instagram sends ms; WhatsApp sends seconds. Treating them alike would
    // date every message to 1970.
    const { events } = parseWhatsAppWebhook(wrap(textValue()));
    expect(events[0]!.receivedAt.getUTCFullYear()).toBeGreaterThan(2020);
  });

  it("reports unsupported types instead of crashing or treating them as text", () => {
    for (const type of ["image", "audio", "location", "sticker", "document"]) {
      const { events, skipped } = parseWhatsAppWebhook(
        wrap(textValue({ type, text: undefined })),
      );
      expect(events).toEqual([]);
      expect(skipped).toEqual([{ mid: "wamid.ABC123", type }]);
    }
  });

  it("ignores delivery/read receipts (statuses, no messages[])", () => {
    const statuses = {
      messaging_product: "whatsapp",
      metadata: { phone_number_id: "PHONE_1" },
      statuses: [{ id: "wamid.ABC123", status: "delivered", recipient_id: "96170123456" }],
    };
    expect(parseWhatsAppWebhook(wrap(statuses))).toEqual({ events: [], skipped: [] });
  });

  it("ignores other objects and malformed payloads", () => {
    expect(parseWhatsAppWebhook({ object: "instagram", entry: [] })).toEqual({ events: [], skipped: [] });
    expect(parseWhatsAppWebhook(null)).toEqual({ events: [], skipped: [] });
    expect(parseWhatsAppWebhook({})).toEqual({ events: [], skipped: [] });
    expect(parseWhatsAppWebhook(wrap({ metadata: {} }))).toEqual({ events: [], skipped: [] });
  });

  it("skips empty text bodies rather than creating a blank conversation", () => {
    const { events, skipped } = parseWhatsAppWebhook(wrap(textValue({ text: { body: "   " } })));
    expect(events).toEqual([]);
    expect(skipped).toEqual([{ mid: "wamid.ABC123", type: "text:empty" }]);
  });
});
