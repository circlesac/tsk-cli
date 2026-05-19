import { defineCommand } from "citty";
import { requireCookies } from "../../../credentials.js";
import { updateView, getViewStateFull } from "../../../api.js";
import type { ViewConfig, ViewLayout } from "../../../types.js";

const LAYOUT_MAP: Record<string, ViewLayout> = {
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

function parseIntList(v: string | undefined): number[] | undefined {
  if (!v) return undefined;
  return v.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
}

function parseSortBy(v: string | undefined): [number, "asc" | "desc"][] | undefined {
  if (!v) return undefined;
  return v.split(",").map((pair) => {
    const [id, dir] = pair.split(":");
    return [parseInt(id!.trim(), 10), (dir?.trim() === "desc" ? "desc" : "asc")] as [number, "asc" | "desc"];
  });
}

export const viewUpdateCommand = defineCommand({
  meta: {
    name: "update",
    description: "Update view — preserves existing groupBy/sortBy/verticalGroupBy/visibleFields if not specified",
  },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    view: { type: "positional", description: "View number to update", required: true },
    name: { type: "string", description: "New view name" },
    layout: { type: "string", description: "Layout: table | board | roadmap" },
    filter: { type: "string", description: "Filter query (e.g. 'type:Epic')" },
    "group-by": { type: "string", description: "Replace group-by field IDs (comma-sep). Empty string clears." },
    "vertical-group-by": { type: "string", description: "Replace Board column-by field IDs" },
    "sort-by": { type: "string", description: "Replace sort: '<fieldId>:asc,<fieldId>:desc'" },
    "visible-fields": { type: "string", description: "Replace visible field IDs" },
    "slice-field": { type: "string", description: "Slice-by field ID (Board sidebar slicer)" },
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  async run({ args }) {
    const creds = await requireCookies();
    const org = String(args.org);
    const project = Number(args.project);
    const viewNum = Number(args.view);

    const existing = getViewStateFull(org, project, viewNum);

    const incomingLayout = args.layout
      ? (LAYOUT_MAP[String(args.layout).toLowerCase()] ?? LAYOUT_MAP[String(args.layout)])
      : undefined;
    const existingLayout = LAYOUT_MAP[existing.layout];

    const view: ViewConfig = {
      name: args.name ?? existing.name,
      layout: incomingLayout ?? existingLayout ?? "table_layout",
      filter: args.filter ?? existing.filter,
      // For list-shaped fields: parse new value if user passed it (even empty string),
      // otherwise preserve existing.
      groupBy: args["group-by"] !== undefined ? (parseIntList(String(args["group-by"])) ?? []) : existing.groupBy,
      verticalGroupBy: args["vertical-group-by"] !== undefined
        ? (parseIntList(String(args["vertical-group-by"])) ?? [])
        : existing.verticalGroupBy,
      sortBy: args["sort-by"] !== undefined ? (parseSortBy(String(args["sort-by"])) ?? []) : existing.sortBy,
      visibleFields: args["visible-fields"] !== undefined
        ? (parseIntList(String(args["visible-fields"])) ?? [])
        : existing.visibleFields,
    };
    if (args["slice-field"]) {
      view.sliceBy = { field: Number(args["slice-field"]), filter: "" };
    }

    const result = await updateView(creds, org, project, viewNum, view);
    const summary = {
      number: result.number,
      name: result.name,
      layout: result.layout,
      filter: result.filter,
      updatedAt: result.updatedAt,
    };
    if (args.json) console.log(JSON.stringify(summary, null, 2));
    else for (const [k, v] of Object.entries(summary)) console.log(`${k.padEnd(10)} ${v}`);
  },
});
