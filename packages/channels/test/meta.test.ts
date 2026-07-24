import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseInstagramWebhook, verifyMetaSignature } from "../src/meta";

const APP_SECRET = "test-app-secret";
const sign = (body: string) =>
  `sha256=${createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex")}`;

describe("verifyMetaSignature", () => {
  it("accepts a correct signature", () => {
    const body = JSON.stringify({ object: "instagram", entry: [] });
    expect(verifyMetaSignature(body, sign(body), APP_SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ object: "instagram" });
    expect(verifyMetaSignature(body + " ", sign(body), APP_SECRET)).toBe(false);
  });

  it("rejects wrong secret, missing header, and malformed header", () => {
    const body = "{}";
    expect(verifyMetaSignature(body, sign(body), "other-secret")).toBe(false);
    expect(verifyMetaSignature(body, null, APP_SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", APP_SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "garbage", APP_SECRET)).toBe(false);
    expect(verifyMetaSignature(body, sign(body), "")).toBe(false);
  });
});

describe("parseInstagramWebhook", () => {
  const event = (over: Record<string, unknown> = {}) => ({
    object: "instagram",
    entry: [
      {
        id: "IG_ACCOUNT_1",
        time: 1700000000000,
        messaging: [
          {
            sender: { id: "IGSID_123" },
            recipient: { id: "IG_ACCOUNT_1" },
            timestamp: 1700000000000,
            message: { mid: "mid_abc", text: "Hi there", ...over },
          },
        ],
      },
    ],
  });

  it("extracts an inbound text DM", () => {
    expect(parseInstagramWebhook(event())).toEqual([
      {
        igAccountId: "IG_ACCOUNT_1",
        senderId: "IGSID_123",
        mid: "mid_abc",
        text: "Hi there",
        receivedAt: new Date(1700000000000),
      },
    ]);
  });

  it("skips echoes of our own outbound", () => {
    expect(parseInstagramWebhook(event({ is_echo: true }))).toEqual([]);
  });

  it("skips attachment-only / empty-text and non-message events", () => {
    expect(parseInstagramWebhook(event({ text: undefined }))).toEqual([]);
    expect(parseInstagramWebhook(event({ text: "   " }))).toEqual([]);
    expect(
      parseInstagramWebhook({
        object: "instagram",
        entry: [{ id: "A", messaging: [{ sender: { id: "s" }, read: { mid: "x" } }] }],
      }),
    ).toEqual([]);
  });

  it("ignores non-instagram objects and malformed payloads", () => {
    expect(parseInstagramWebhook({ object: "page", entry: [] })).toEqual([]);
    expect(parseInstagramWebhook(null)).toEqual([]);
    expect(parseInstagramWebhook({})).toEqual([]);
  });
});
