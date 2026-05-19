import { defineCommand } from "citty";
import { bulkSetField } from "../../../api.js";

function parseWhere(s: string | undefined): { field: string; value: string } | null {
  if (!s) return null;
  const m = s.match(/^([^=]+)=(.+)$/);
  if (!m) throw new Error(`Invalid --where: ${s}. Expected 'FieldName=Value'`);
  return { field: m[1]!.trim(), value: m[2]!.trim() };
}

export const itemFieldSetCommand = defineCommand({
  meta: {
    name: "field-set",
    description:
      "Bulk set a field value (single-select / text / number / date) on items matching --where",
  },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    field: { type: "string", description: "Field name", required: true },
    value: {
      type: "string",
      description: "Value to assign — option name (single-select), text, number, or YYYY-MM-DD (date)",
      required: true,
    },
    where: { type: "string", description: "Filter 'FieldName=Value'. Omit to target all items." },
    "dry-run": { type: "boolean", description: "Show what would change without applying", default: false },
  },
  async run({ args }) {
    const where = parseWhere(args.where ? String(args.where) : undefined);
    const org = String(args.org);
    const project = Number(args.project);
    const field = String(args.field);
    const value = String(args.value);

    if (args["dry-run"]) {
      const { listProjectItems } = await import("../../../api.js");
      const items = listProjectItems(org, project);
      const matched = where ? items.filter((i) => i.fields[where.field] === where.value) : items;
      console.log(`Would set ${field}=${value} on ${matched.length}/${items.length} items:`);
      for (const m of matched.slice(0, 20)) {
        console.log(`  #${m.contentNumber}  ${m.contentTitle}`);
      }
      if (matched.length > 20) console.log(`  … and ${matched.length - 20} more`);
      return;
    }

    const result = bulkSetField(org, project, field, value, where);
    console.log(
      `✓ Set ${field}=${value} (${result.valueType}) on ${result.applied}/${result.matched} matched items (total: ${result.total})`,
    );
  },
});
