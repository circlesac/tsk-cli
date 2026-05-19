import { defineCommand } from "citty";
import { listIssueTypes } from "../../api.js";

export const issueTypeListCommand = defineCommand({
  meta: { name: "list", description: "List org-level Issue Types" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  async run({ args }) {
    const types = await listIssueTypes(String(args.org));
    if (args.json) {
      console.log(JSON.stringify(types, null, 2));
      return;
    }
    if (types.length === 0) {
      console.log("(no issue types)");
      return;
    }
    console.log("name           color    enabled  description");
    console.log("-------------  -------  -------  -----------");
    for (const t of types) {
      console.log(
        `${t.name.padEnd(13)}  ${t.color.padEnd(7)}  ${String(t.isEnabled).padEnd(7)}  ${t.description ?? ""}`,
      );
    }
  },
});
