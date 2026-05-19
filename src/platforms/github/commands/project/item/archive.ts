import { defineCommand } from "citty";
import { bulkArchive, bulkUnarchive, listProjectItems } from "../../../api.js";

function parseWhere(s: string | undefined): { field: string; value: string } | null {
  if (!s) return null;
  const m = s.match(/^([^=]+)=(.+)$/);
  if (!m) throw new Error(`Invalid --where: ${s}. Expected 'FieldName=Value'`);
  return { field: m[1]!.trim(), value: m[2]!.trim() };
}

export const itemArchiveCommand = defineCommand({
  meta: { name: "archive", description: "Bulk archive items matching --where" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    where: { type: "string", description: "Filter 'FieldName=Value' (required for safety)" },
    "dry-run": { type: "boolean", description: "Preview only", default: false },
    all: { type: "boolean", description: "Archive ALL items (no --where required)", default: false },
  },
  async run({ args }) {
    const where = parseWhere(args.where ? String(args.where) : undefined);
    if (!where && !args.all) {
      console.error("Specify --where 'Field=Value' or --all (refusing to archive everything by accident)");
      process.exit(1);
    }
    const org = String(args.org);
    const project = Number(args.project);

    if (args["dry-run"]) {
      const items = listProjectItems(org, project);
      const matched = where ? items.filter((i) => i.fields[where.field] === where.value) : items;
      console.log(`Would archive ${matched.length}/${items.length} items`);
      for (const m of matched.slice(0, 20)) console.log(`  #${m.contentNumber}  ${m.contentTitle}`);
      if (matched.length > 20) console.log(`  … and ${matched.length - 20} more`);
      return;
    }

    const result = bulkArchive(org, project, where);
    console.log(`✓ Archived ${result.applied}/${result.matched} matched (total active: ${result.total})`);
  },
});

export const itemUnarchiveCommand = defineCommand({
  meta: { name: "unarchive", description: "Unarchive all archived items in the project" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
  },
  async run({ args }) {
    const result = bulkUnarchive(String(args.org), Number(args.project), null);
    console.log(`✓ Unarchived ${result.applied}/${result.matched} archived items (total in project: ${result.total})`);
  },
});
