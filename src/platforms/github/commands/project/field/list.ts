import { defineCommand } from "citty";
import { listProjectFields } from "../../../api.js";

export const fieldListCommand = defineCommand({
  meta: { name: "list", description: "List fields of a project" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  async run({ args }) {
    const fields = listProjectFields(String(args.org), Number(args.project));
    if (args.json) {
      console.log(JSON.stringify(fields, null, 2));
      return;
    }
    console.log("name                 type            options");
    console.log("-------------------  --------------  ----------------------------------");
    for (const f of fields) {
      const opts = f.options ? f.options.map((o) => `${o.name}(${o.color})`).join(" ") : "—";
      console.log(`${f.name.padEnd(19)}  ${f.dataType.padEnd(14)}  ${opts.slice(0, 60)}`);
    }
  },
});
