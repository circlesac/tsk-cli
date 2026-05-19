import { defineCommand } from "citty";
import { requireCookies } from "../../../credentials.js";
import { createView } from "../../../api.js";
import type { ViewConfig, ViewLayout } from "../../../types.js";

const LAYOUT_MAP: Record<string, ViewLayout> = {
  table: "table_layout",
  board: "board_layout",
  roadmap: "roadmap_layout",
  table_layout: "table_layout",
  board_layout: "board_layout",
  roadmap_layout: "roadmap_layout",
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

export const viewCreateCommand = defineCommand({
  meta: { name: "create", description: "Create a project view (extended schema)" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    name: { type: "string", description: "View name", required: true },
    layout: { type: "string", description: "table | board | roadmap", required: true },
    filter: { type: "string", description: "Filter query (e.g. 'type:Epic')" },
    "group-by": { type: "string", description: "Group-by field IDs, comma-separated" },
    "vertical-group-by": { type: "string", description: "Board column-by field IDs" },
    "sort-by": { type: "string", description: "Sort: '<fieldId>:asc,<fieldId>:desc'" },
    "visible-fields": { type: "string", description: "Visible field IDs, comma-separated" },
    "slice-field": { type: "string", description: "Slice-by field ID" },
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  async run({ args }) {
    const creds = await requireCookies();
    const layout = LAYOUT_MAP[String(args.layout).toLowerCase()];
    if (!layout) {
      console.error(`Invalid layout: ${args.layout}. Use: table | board | roadmap`);
      process.exit(1);
    }

    const view: ViewConfig = {
      name: String(args.name),
      layout,
      filter: args.filter ? String(args.filter) : "",
      groupBy: parseIntList(args["group-by"]) ?? [],
      verticalGroupBy: parseIntList(args["vertical-group-by"]) ?? [],
      sortBy: parseSortBy(args["sort-by"]) ?? [],
      visibleFields: parseIntList(args["visible-fields"]) ?? [],
    };
    if (args["slice-field"]) {
      view.sliceBy = { field: Number(args["slice-field"]), filter: "" };
    }

    const result = await createView(creds, String(args.org), Number(args.project), view);
    const summary = {
      number: result.number,
      name: result.name,
      layout: result.layout,
      filter: result.filter,
      createdAt: result.createdAt,
    };
    if (args.json) console.log(JSON.stringify(summary, null, 2));
    else for (const [k, v] of Object.entries(summary)) console.log(`${k.padEnd(10)} ${v}`);
  },
});
