import { describe, it, expect } from "vitest";
import {
  parseIntList,
  parseSortBy,
  parseWhere,
  parseColorMap,
  parseOwnerRepoRef,
  parseColor,
  resolveLayout,
  coerceFieldValue,
  filterItems,
  COLORS,
} from "../../../src/platforms/github/parsers.js";
import type { ProjectField } from "../../../src/platforms/github/types-helpers.js";

describe("parseIntList", () => {
  it("returns undefined for undefined input", () => {
    expect(parseIntList(undefined)).toBeUndefined();
  });
  it("returns empty array for empty string", () => {
    expect(parseIntList("")).toEqual([]);
  });
  it("parses comma-separated", () => {
    expect(parseIntList("1,2,3")).toEqual([1, 2, 3]);
  });
  it("trims whitespace", () => {
    expect(parseIntList(" 1 , 2 , 3 ")).toEqual([1, 2, 3]);
  });
  it("filters non-numeric tokens", () => {
    expect(parseIntList("1,abc,3")).toEqual([1, 3]);
  });
});

describe("parseSortBy", () => {
  it("returns undefined for undefined", () => {
    expect(parseSortBy(undefined)).toBeUndefined();
  });
  it("returns empty array for empty string", () => {
    expect(parseSortBy("")).toEqual([]);
  });
  it("parses single pair asc", () => {
    expect(parseSortBy("100:asc")).toEqual([[100, "asc"]]);
  });
  it("parses multiple pairs", () => {
    expect(parseSortBy("100:asc,200:desc")).toEqual([
      [100, "asc"],
      [200, "desc"],
    ]);
  });
  it("defaults to asc when direction missing", () => {
    expect(parseSortBy("100")).toEqual([[100, "asc"]]);
  });
});

describe("parseWhere", () => {
  it("returns null for undefined", () => {
    expect(parseWhere(undefined)).toBeNull();
  });
  it("parses simple Field=Value", () => {
    expect(parseWhere("Status=Done")).toEqual({ field: "Status", value: "Done" });
  });
  it("preserves spaces in value", () => {
    expect(parseWhere("단계=한도샘플 승인 (PV)")).toEqual({
      field: "단계",
      value: "한도샘플 승인 (PV)",
    });
  });
  it("throws on bad format", () => {
    expect(() => parseWhere("noequals")).toThrow(/Expected/);
  });
});

describe("parseColor / parseColorMap", () => {
  it("accepts known colors case-insensitive", () => {
    expect(parseColor("blue")).toBe("BLUE");
    expect(parseColor("PURPLE")).toBe("PURPLE");
  });
  it("rejects unknown colors", () => {
    expect(() => parseColor("teal")).toThrow(/Invalid color/);
  });
  it("parses color map", () => {
    expect(parseColorMap("a=BLUE,b=red")).toEqual({ a: "BLUE", b: "RED" });
  });
  it("rejects bad map pair", () => {
    expect(() => parseColorMap("a:BLUE")).toThrow(/Expected 'name=COLOR'/);
  });
  it("rejects bad color inside map", () => {
    expect(() => parseColorMap("a=teal")).toThrow(/Invalid color/);
  });
});

describe("parseOwnerRepoRef", () => {
  it("parses owner/repo", () => {
    expect(parseOwnerRepoRef("foo/bar")).toEqual({ owner: "foo", repo: "bar" });
  });
  it("parses owner/repo#NNN", () => {
    expect(parseOwnerRepoRef("foo/bar#42")).toEqual({ owner: "foo", repo: "bar", number: 42 });
  });
  it("handles repo names with dashes", () => {
    expect(parseOwnerRepoRef("zigbang-smarthome/yunsuo-p1#21")).toEqual({
      owner: "zigbang-smarthome",
      repo: "yunsuo-p1",
      number: 21,
    });
  });
  it("rejects bad format", () => {
    expect(() => parseOwnerRepoRef("just-a-thing")).toThrow(/Invalid ref/);
  });
});

describe("resolveLayout", () => {
  it("maps short names", () => {
    expect(resolveLayout("table")).toBe("table_layout");
    expect(resolveLayout("board")).toBe("board_layout");
    expect(resolveLayout("roadmap")).toBe("roadmap_layout");
  });
  it("maps GraphQL caps", () => {
    expect(resolveLayout("TABLE_LAYOUT")).toBe("table_layout");
    expect(resolveLayout("BOARD_LAYOUT")).toBe("board_layout");
  });
  it("maps full lowercase", () => {
    expect(resolveLayout("board_layout")).toBe("board_layout");
  });
  it("returns undefined for unknown / empty", () => {
    expect(resolveLayout(undefined)).toBeUndefined();
    expect(resolveLayout("garbage")).toBeUndefined();
  });
});

describe("coerceFieldValue", () => {
  const singleSelect: ProjectField = {
    id: "PVTSSF_X",
    name: "Status",
    dataType: "SINGLE_SELECT",
    options: [
      { id: "opt1", name: "Todo", color: "GRAY", description: null },
      { id: "opt2", name: "Done", color: "GREEN", description: null },
    ],
  };

  it("coerces single-select option by name", () => {
    const r = coerceFieldValue(singleSelect, "Done");
    expect(r.valueType).toBe("single-select");
    expect(r.value).toEqual({ type: "singleSelect", optionId: "opt2" });
  });

  it("throws on unknown single-select option with available options listed", () => {
    expect(() => coerceFieldValue(singleSelect, "InProgress")).toThrow(/Available.*Todo.*Done/);
  });

  it("coerces text", () => {
    const r = coerceFieldValue({ id: "x", name: "Note", dataType: "TEXT" }, "hello world");
    expect(r).toEqual({ value: { type: "text", text: "hello world" }, valueType: "text" });
  });

  it("coerces valid number", () => {
    const r = coerceFieldValue({ id: "x", name: "Count", dataType: "NUMBER" }, "42");
    expect(r).toEqual({ value: { type: "number", number: 42 }, valueType: "number" });
  });

  it("rejects non-numeric for NUMBER", () => {
    expect(() => coerceFieldValue({ id: "x", name: "Count", dataType: "NUMBER" }, "abc")).toThrow(/numeric/);
  });

  it("accepts ISO date for DATE", () => {
    const r = coerceFieldValue({ id: "x", name: "Due", dataType: "DATE" }, "2026-08-18");
    expect(r).toEqual({ value: { type: "date", date: "2026-08-18" }, valueType: "date" });
  });

  it("rejects bad date format", () => {
    expect(() => coerceFieldValue({ id: "x", name: "Due", dataType: "DATE" }, "2026/08/18")).toThrow(/YYYY-MM-DD/);
  });

  it("rejects unsupported dataType", () => {
    expect(() => coerceFieldValue({ id: "x", name: "It", dataType: "ITERATION" }, "x")).toThrow(/Unsupported field dataType/);
  });
});

describe("filterItems", () => {
  const items = [
    { contentNumber: 1, fields: { 단계: "사전검토", Phase: "Plan" } },
    { contentNumber: 2, fields: { 단계: "사전검토", Phase: "Plan" } },
    { contentNumber: 3, fields: { 단계: "T0 시료", Phase: "DV" } },
    { contentNumber: 4, fields: { 단계: "한도샘플 승인 (PV)", Phase: "PV" } },
  ];

  it("returns all when where is null", () => {
    expect(filterItems(items, null)).toEqual(items);
  });

  it("filters by Korean field name and value", () => {
    const r = filterItems(items, { field: "단계", value: "사전검토" });
    expect(r.map((i) => i.contentNumber)).toEqual([1, 2]);
  });

  it("filters by value with spaces", () => {
    const r = filterItems(items, { field: "단계", value: "한도샘플 승인 (PV)" });
    expect(r).toHaveLength(1);
    expect(r[0]?.contentNumber).toBe(4);
  });

  it("returns empty when no match", () => {
    expect(filterItems(items, { field: "단계", value: "초도양산 출하 (SRA)" })).toEqual([]);
  });
});

describe("COLORS", () => {
  it("contains all 8 GitHub colors", () => {
    expect(COLORS).toHaveLength(8);
    expect(COLORS).toContain("GRAY");
    expect(COLORS).toContain("PURPLE");
  });
});
