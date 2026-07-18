import { describe, expect, it } from "vitest";
import { buildReplyMime, extractBody, parseAddress } from "../src/gmail";

const b64url = (s: string) =>
  Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

describe("parseAddress", () => {
  it("parses named and bare addresses, lowercases", () => {
    expect(parseAddress('Jane Doe <Jane@Acme.COM>')).toEqual({ name: "Jane Doe", email: "jane@acme.com" });
    expect(parseAddress("jane@acme.com")).toEqual({ email: "jane@acme.com" });
    expect(parseAddress('"Quoted Name" <q@x.com>')).toEqual({ name: "Quoted Name", email: "q@x.com" });
    expect(parseAddress("not an address")).toBeNull();
    expect(parseAddress(undefined)).toBeNull();
  });
});

describe("extractBody", () => {
  it("prefers text/plain in nested multiparts", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: b64url("<b>HTML version</b>") } },
        { mimeType: "text/plain", body: { data: b64url("Plain version") } },
      ],
    };
    expect(extractBody(payload)).toBe("Plain version");
  });

  it("falls back to stripped html", () => {
    const payload = { mimeType: "text/html", body: { data: b64url("<p>Hello <b>there</b></p>") } };
    expect(extractBody(payload)).toBe("Hello there");
  });

  it("caps length and handles empty payloads", () => {
    expect(extractBody(undefined)).toBe("");
    const long = { mimeType: "text/plain", body: { data: b64url("x".repeat(10000)) } };
    expect(extractBody(long, 100).length).toBe(100);
  });
});

describe("buildReplyMime", () => {
  function decode(raw: string): string {
    return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  }

  it("threads correctly: Re: subject, In-Reply-To, References", () => {
    const mime = decode(
      buildReplyMime({
        to: "jane@acme.com",
        subject: "Order question",
        body: "Yes, we ship to Canada.",
        inReplyTo: "<msg1@mail.gmail.com>",
        references: "<msg0@mail.gmail.com> <msg1@mail.gmail.com>",
      }),
    );
    expect(mime).toContain("To: jane@acme.com");
    expect(mime).toContain("Subject: Re: Order question");
    expect(mime).toContain("In-Reply-To: <msg1@mail.gmail.com>");
    expect(mime).toContain("References: <msg0@mail.gmail.com> <msg1@mail.gmail.com>");
    expect(mime).toContain(Buffer.from("Yes, we ship to Canada.", "utf8").toString("base64"));
  });

  it("doesn't double the Re: prefix and encodes non-ASCII subjects", () => {
    const mime = decode(
      buildReplyMime({ to: "a@b.com", subject: "Re: Höhenverstellbar?", body: "Ja." }),
    );
    expect(mime).not.toContain("Re: Re:");
    expect(mime).toContain("=?UTF-8?B?");
  });
});
