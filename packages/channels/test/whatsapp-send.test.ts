import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OutsideServiceWindowError,
  ReconnectRequiredError,
  sendWhatsAppMessage,
  whatsappCredentials,
} from "../src/meta";

const creds = { accessToken: "TOKEN", phoneNumberId: "PHONE_1" };

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendWhatsAppMessage", () => {
  it("posts to the phone number's messages endpoint with a bearer token", async () => {
    const fetchMock = mockFetch(200, { messages: [{ id: "wamid.OUT1" }] });
    const res = await sendWhatsAppMessage(creds, "96170123456", "On our way.");

    expect(res).toEqual({ mid: "wamid.OUT1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v21.0/PHONE_1/messages");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer TOKEN" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "96170123456",
      type: "text",
      text: { preview_url: false, body: "On our way." },
    });
  });

  it("raises a specific error when the 24-hour service window has closed", async () => {
    // Meta reports this as error code 131047. It is the single most likely
    // send failure in production, and it must not look like a network blip.
    mockFetch(400, { error: { code: 131047, message: "Re-engagement message" } });
    await expect(sendWhatsAppMessage(creds, "96170123456", "hi")).rejects.toBeInstanceOf(
      OutsideServiceWindowError,
    );
  });

  it("treats auth failures as reconnect-required", async () => {
    mockFetch(401, { error: { message: "Invalid OAuth access token" } });
    await expect(sendWhatsAppMessage(creds, "96170123456", "hi")).rejects.toBeInstanceOf(
      ReconnectRequiredError,
    );
  });

  it("throws when Meta returns 200 without a message id", async () => {
    mockFetch(200, { messages: [] });
    await expect(sendWhatsAppMessage(creds, "96170123456", "hi")).rejects.toThrow(
      /no message id/i,
    );
  });
});

describe("whatsappCredentials", () => {
  it("returns null unless both the token and the phone number id are set", () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    expect(whatsappCredentials()).toBeNull();

    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "T");
    expect(whatsappCredentials()).toBeNull();

    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "P");
    expect(whatsappCredentials()).toEqual({
      accessToken: "T",
      phoneNumberId: "P",
      businessAccountId: undefined,
    });
  });
});
