import { defineCommand } from "citty";
import { bulkClearField, listProjectItems } from "../../../api.js";

function parseWhere(s: string | undefined): { field: string; value: string } | null {
  if (!s) return null;
  const m = s.match(/^([^=]+)=(.+)$/);
  if (!m) throw new Error(`Invalid --where: ${s}. Expected 'FieldName=Value'`);
  return { field: m[1]!.trim(), value: m[2]!.trim() };
}

export const itemFieldClearCommand = defineCommand({
  meta: { name: "field-clear", description: "Bulk clear a field value (set to unset) on items matching --where" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    field: { type: "string", description: "Field name to clear", required: true },
    where: { type: "string", description: "Filter 'FieldName=Value'" },
    "dry-run": { type: "boolean", description: "Show what would change", default: false },
  },
  async run({ args }) {
    const where = parseWhere(args.where ? String(args.where) : undefined);
    const org = String(args.org);
    const project = Number(args.project);
    const field = String(args.field);

    if (args["dry-run"]) {
      const items = await listProjectItems(org, project);
      const matched = where ? items.filter((i) => i.fields[where.field] === where.value) : items;
      console.log(`Would clear '${field}' on ${matched.length}/${items.length} items`);
      for (const m of matched.slice(0, 20)) {
        console.log(`  #${m.contentNumber}  ${m.contentTitle}  (current: ${m.fields[field] ?? '(unset)'})`);
      }
      if (matched.length > 20) console.log(`  … and ${matched.length - 20} more`);
      return;
    }

    const result = await bulkClearField(org, project, field, where);
    console.log(`✓ Cleared '${field}' on ${result.applied}/${result.matched} matched items (total: ${result.total})`);
  },
});
