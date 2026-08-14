import { describe, expect, it } from "vitest";
import { CONTACT_CSV_HEADERS, contactsToCsv, type ContactListRow } from "../src/contacts";

const row = (over: Partial<ContactListRow> = {}): ContactListRow => ({
  id: "c1",
  displayName: "Nadia Haddad",
  email: "nadia@example.com",
  phone: null,
  channels: ["web_chat"],
  firstContactAt: new Date("2026-08-01T10:00:00Z"),
  lastContactAt: new Date("2026-08-05T14:30:00Z"),
  conversationCount: 2,
  messageCount: 9,
  ...over,
});

describe("contactsToCsv", () => {
  it("writes a header row and one row per contact", () => {
    const csv = contactsToCsv([row(), row({ id: "c2", displayName: "Sami" })]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(CONTACT_CSV_HEADERS.join(","));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Nadia Haddad");
    expect(lines[1]).toContain("nadia@example.com");
  });

  it("escapes commas, quotes and newlines so columns never shift", () => {
    // A name like this in a spreadsheet is the classic CSV corruption: without
    // quoting it silently pushes every later column one to the right.
    const csv = contactsToCsv([
      row({ displayName: 'Haddad, Nadia "Nad"', email: "line1\nline2@example.com" }),
    ]);
    const body = csv.trim().split("\r\n")[1]!;
    expect(body).toContain('"Haddad, Nadia ""Nad"""');
    expect(body).toContain('"line1\nline2@example.com"');
    // Header + one record: the embedded newline must stay inside its quotes.
    expect(csv.trim().split("\r\n")[0]).toBe(CONTACT_CSV_HEADERS.join(","));
  });

  it("exports anonymous visitors with empty cells, never a fabricated name", () => {
    const csv = contactsToCsv([
      row({ displayName: null, email: null, phone: null, lastContactAt: null }),
    ]);
    const cells = csv.trim().split("\r\n")[1]!.split(",");
    expect(cells[0]).toBe(""); // name
    expect(cells[1]).toBe(""); // email
    expect(cells[2]).toBe(""); // phone
    expect(csv).not.toMatch(/anonymous/i);
  });

  it("renders dates as ISO timestamps and counts as plain numbers", () => {
    const csv = contactsToCsv([row()]);
    expect(csv).toContain("2026-08-01T10:00:00.000Z");
    expect(csv).toContain("2026-08-05T14:30:00.000Z");
    expect(csv.trim().split("\r\n")[1]!.endsWith(",2,9")).toBe(true);
  });

  it("joins multiple channels without breaking the column", () => {
    const csv = contactsToCsv([row({ channels: ["web_chat", "whatsapp"] })]);
    expect(csv).toContain("web_chat whatsapp");
    expect(csv.trim().split("\r\n")[1]!.split(",")).toHaveLength(CONTACT_CSV_HEADERS.length);
  });
});
