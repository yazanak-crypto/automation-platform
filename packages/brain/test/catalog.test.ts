import { describe, expect, it } from "vitest";
import {
  applyColumnMap,
  capRows,
  fieldDirection,
  guessColumnMap,
  mappingSample,
  needsReview,
  normalizeRow,
  parseCsv,
  parseJsonReply,
  renderRowContent,
  rowIsRtl,
} from "../src/catalog";
import { CATALOG_MAX_ITEMS } from "../src/verticals/types";

describe("fieldDirection", () => {
  it("reads direction from the first strong character, not from any RTL presence", () => {
    expect(fieldDirection("Margherita 12")).toBe("ltr");
    expect(fieldDirection("فتوش")).toBe("rtl");
    // Mixed: an English dish name with an Arabic note stays LTR, and vice
    // versa. Getting this backwards is what mangles a bilingual menu.
    expect(fieldDirection("Fattoush فتوش")).toBe("ltr");
    expect(fieldDirection("فتوش Fattoush")).toBe("rtl");
  });

  it("treats digits and punctuation as neutral", () => {
    // "45k" has no strong character at all — it must not flip a row.
    expect(fieldDirection("45k")).toBe("ltr");
    expect(fieldDirection("١٢٣")).toBe("ltr");
    expect(fieldDirection("- 12 —")).toBe("ltr");
  });

  it("handles empty and missing values", () => {
    expect(fieldDirection("")).toBe("ltr");
    expect(fieldDirection(undefined)).toBe("ltr");
  });
});

describe("rowIsRtl", () => {
  it("is true when any field carries Arabic, including only an attribute", () => {
    expect(rowIsRtl({ id: "1", name: "Studio", attributes: { المنطقة: "دبي مارينا" } })).toBe(true);
    expect(rowIsRtl({ id: "2", name: "Studio", attributes: { area: "Marina" } })).toBe(false);
  });
});

describe("normalizeRow", () => {
  it("flags a nameless row and keeps its raw text rather than dropping it", () => {
    const row = normalizeRow({ name: "  ", raw: "?? 45k" });
    expect(row.issue).toBeTruthy();
    expect(row.raw).toBe("?? 45k");
  });

  it("keeps price as the source string, never a number", () => {
    expect(normalizeRow({ name: "Studio", price: "45k" }).price).toBe("45k");
    expect(normalizeRow({ name: "Villa", price: "AED 85,000/yr" }).price).toBe("AED 85,000/yr");
    expect(normalizeRow({ name: "Meze", price: "حسب الطلب" }).price).toBe("حسب الطلب");
  });

  it("drops empty attribute keys and values but keeps real ones", () => {
    const row = normalizeRow({
      name: "1BR",
      attributes: { "": "x", bedrooms: "1", floor: "   " },
    });
    expect(row.attributes).toEqual({ bedrooms: "1" });
  });

  it("omits absent optional fields instead of storing empty strings", () => {
    const row = normalizeRow({ name: "Tea" });
    expect("price" in row).toBe(false);
    expect("description" in row).toBe(false);
  });
});

describe("csv parsing", () => {
  it("strips a BOM so the first header is not corrupted", () => {
    const grid = parseCsv("﻿Name,Price\nTea,5");
    expect(grid.headers).toEqual(["Name", "Price"]);
  });

  it("handles semicolon-delimited exports", () => {
    // Excel in an Arabic locale writes ';' — sniffing must cover it.
    const grid = parseCsv("Name;Price\nTea;5");
    expect(grid.headers).toEqual(["Name", "Price"]);
    expect(grid.rows[0]).toEqual(["Tea", "5"]);
  });

  it("skips blank lines", () => {
    const grid = parseCsv("Name,Price\n\nTea,5\n\n");
    expect(grid.rows).toHaveLength(1);
  });
});

describe("guessColumnMap", () => {
  it("recognises common English headers without a model call", () => {
    expect(guessColumnMap(["Item Name", "Price", "Notes"])).toEqual({
      name: 0,
      price: 1,
      description: 2,
    });
  });

  it("recognises Arabic headers", () => {
    const map = guessColumnMap(["الصنف", "السعر"]);
    expect(map).toEqual({ name: 0, price: 1 });
  });

  it("returns null when no name column is findable, so the model is asked", () => {
    expect(guessColumnMap(["col1", "col2"])).toBeNull();
  });
});

describe("applyColumnMap", () => {
  const grid = {
    headers: ["Dish", "Price", "Spice"],
    rows: [
      ["فتوش", "7", "mild"],
      ["Margherita", "12", ""],
      ["", "9", "hot"],
    ],
  };

  it("routes unmapped columns into attributes", () => {
    const rows = applyColumnMap(grid, { name: 0, price: 1 });
    expect(rows[0]!.name).toBe("فتوش");
    expect(rows[0]!.attributes).toEqual({ Spice: "mild" });
    // An empty cell must not create an empty attribute.
    expect(rows[1]!.attributes).toBeUndefined();
  });

  it("surfaces a nameless row with its whole line in raw", () => {
    const rows = applyColumnMap(grid, { name: 0, price: 1 });
    expect(rows[2]!.issue).toBeTruthy();
    expect(rows[2]!.raw).toContain("9");
    // Crucially, still three rows out for three rows in.
    expect(rows).toHaveLength(3);
  });
});

describe("mappingSample", () => {
  it("sends the header and only a few rows, never the whole sheet", () => {
    const grid = { headers: ["Name", "Price"], rows: Array.from({ length: 500 }, (_, i) => [`i${i}`, "1"]) };
    const sample = mappingSample(grid);
    expect(sample.split("\n")).toHaveLength(4); // header + 3
    expect(sample).not.toContain("i400");
  });
});

describe("capRows", () => {
  it("reports what it dropped instead of truncating silently", () => {
    const rows = Array.from({ length: CATALOG_MAX_ITEMS + 25 }, (_, i) => normalizeRow({ name: `x${i}` }));
    const { rows: kept, dropped } = capRows(rows);
    expect(kept).toHaveLength(CATALOG_MAX_ITEMS);
    expect(dropped).toBe(25);
  });

  it("reports nothing dropped when under the cap", () => {
    expect(capRows([normalizeRow({ name: "a" })]).dropped).toBe(0);
  });
});

describe("needsReview", () => {
  it("selects only flagged rows", () => {
    const rows = [normalizeRow({ name: "ok" }), normalizeRow({ name: "" })];
    expect(needsReview(rows)).toHaveLength(1);
  });
});

describe("renderRowContent", () => {
  it("renders a self-contained line the model can ground on", () => {
    const content = renderRowContent(
      normalizeRow({
        name: "1BR Marina",
        price: "85k",
        description: "Sea view",
        attributes: { bedrooms: "1" },
      }),
    );
    expect(content).toContain("1BR Marina");
    expect(content).toContain("Price: 85k");
    expect(content).toContain("bedrooms: 1");
  });

  it("keeps Arabic untranslated", () => {
    expect(renderRowContent(normalizeRow({ name: "فتوش", price: "7" }))).toContain("فتوش");
  });
});

describe("parseJsonReply", () => {
  it("reads a fenced block", () => {
    expect(parseJsonReply<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("reads JSON wrapped in prose", () => {
    expect(parseJsonReply<{ a: number }>('Here you go: {"a":1} — hope that helps')).toEqual({ a: 1 });
  });

  it("returns null on unparseable text rather than throwing", () => {
    expect(parseJsonReply("no json here")).toBeNull();
    expect(parseJsonReply("{broken")).toBeNull();
  });
});
