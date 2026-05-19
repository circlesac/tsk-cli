// Pure parsing/transform helpers used across github commands.
// No IO, no side effects — easy to unit test.

import type { Color, FieldValueInput, ProjectField, ViewLayout } from "./types-helpers.js";

export const COLORS = ["GRAY", "BLUE", "GREEN", "YELLOW", "ORANGE", "RED", "PINK", "PURPLE"] as const;

export const LAYOUT_MAP: Record<string, ViewLayout> = {
  TABLE_LAYOUT: "table_layout",
  BOARD_LAYOUT: "board_layout",
  ROADMAP_LAYOUT: "roadmap_layout",
  table_layout: "table_layout",
  board_layout: "board_layout",
  roadmap_layout: "roadmap_layout",
  table: "table_layout",
  board: "board_layout",
  roadmap: "roadmap_layout",
};

export function resolveLayout(input: string | undefined): ViewLayout | undefined {
  if (!input) return undefined;
  const lower = String(input).toLowerCase();
  return LAYOUT_MAP[lower] ?? LAYOUT_MAP[String(input)];
}

export function isColor(value: string): value is Color {
  return (COLORS as readonly string[]).includes(value.toUpperCase());
}

export function parseColor(input: string): Color {
  const c = input.toUpperCase();
  if (!isColor(c)) {
    throw new Error(`Invalid color: ${input}. Use: ${COLORS.join(", ")}`);
  }
  return c as Color;
}

export function parseIntList(v: string | undefined): number[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (v === "") return [];
  return v
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

export function parseSortBy(v: string | undefined): [number, "asc" | "desc"][] | undefined {
  if (v === undefined || v === null) return undefined;
  if (v === "") return [];
  return v.split(",").map((pair) => {
    const [id, dir] = pair.split(":");
    return [parseInt(id!.trim(), 10), dir?.trim() === "desc" ? "desc" : "asc"] as [
      number,
      "asc" | "desc",
    ];
  });
}

export interface WhereClause {
  field: string;
  value: string;
}

export function parseWhere(s: string | undefined): WhereClause | null {
  if (!s) return null;
  const m = s.match(/^([^=]+)=(.+)$/);
  if (!m) throw new Error(`Invalid --where: ${s}. Expected 'FieldName=Value'`);
  return { field: m[1]!.trim(), value: m[2]!.trim() };
}

export function parseColorMap(s: string): Record<string, Color> {
  const out: Record<string, Color> = {};
  for (const pair of s.split(",")) {
    const m = pair.trim().match(/^([^=]+)=(.+)$/);
    if (!m) throw new Error(`Invalid pair: '${pair}'. Expected 'name=COLOR'`);
    out[m[1]!.trim()] = parseColor(m[2]!.trim());
  }
  return out;
}

export interface OwnerRef {
  owner: string;
  repo: string;
  number?: number;
}

export function parseOwnerRepoRef(ref: string): OwnerRef {
  const m = ref.match(/^([^/]+)\/([^#]+)(?:#(\d+))?$/);
  if (!m) throw new Error(`Invalid ref: ${ref}. Expected owner/repo or owner/repo#NNN`);
  return { owner: m[1]!, repo: m[2]!, number: m[3] ? parseInt(m[3], 10) : undefined };
}

/**
 * Coerce a raw string value into a typed FieldValueInput based on the target field's dataType.
 * Used by `item field-set` to support text/number/date/single-select uniformly.
 */
export function coerceFieldValue(
  field: Pick<ProjectField, "dataType" | "options" | "name">,
  rawValue: string,
): { value: FieldValueInput; valueType: string } {
  if (field.dataType === "SINGLE_SELECT") {
    if (!field.options) {
      throw new Error(`Field '${field.name}' missing options (data inconsistency)`);
    }
    const opt = field.options.find((o) => o.name === rawValue);
    if (!opt) {
      throw new Error(
        `Option '${rawValue}' not found on '${field.name}'. Available: ${field.options.map((o) => o.name).join(", ")}`,
      );
    }
    return { value: { type: "singleSelect", optionId: opt.id }, valueType: "single-select" };
  }
  if (field.dataType === "TEXT") {
    return { value: { type: "text", text: rawValue }, valueType: "text" };
  }
  if (field.dataType === "NUMBER") {
    const n = Number(rawValue);
    if (Number.isNaN(n)) {
      throw new Error(`Field '${field.name}' is NUMBER but value '${rawValue}' isn't numeric`);
    }
    return { value: { type: "number", number: n }, valueType: "number" };
  }
  if (field.dataType === "DATE") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
      throw new Error(`Field '${field.name}' is DATE; expected YYYY-MM-DD, got '${rawValue}'`);
    }
    return { value: { type: "date", date: rawValue }, valueType: "date" };
  }
  throw new Error(`Unsupported field dataType: ${field.dataType}. Use single-select, text, number, or date fields.`);
}

/**
 * Filter project items by a --where clause, comparing field value as string.
 * If `where` is null, returns all items.
 */
export function filterItems<T extends { fields: Record<string, string> }>(
  items: T[],
  where: WhereClause | null,
): T[] {
  if (!where) return items;
  return items.filter((i) => i.fields[where.field] === where.value);
}
