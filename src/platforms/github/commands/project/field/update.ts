import { defineCommand } from "citty";
import { updateFieldName } from "../../../api.js";

export const fieldUpdateCommand = defineCommand({
  meta: { name: "update", description: "Rename a project field" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    field: { type: "positional", description: "Current field name", required: true },
    name: { type: "string", description: "New field name", required: true },
  },
  async run({ args }) {
    updateFieldName(String(args.org), Number(args.project), String(args.field), String(args.name));
    console.log(`✓ Renamed field '${args.field}' → '${args.name}'`);
  },
});
