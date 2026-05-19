import { defineCommand } from "citty";
import { deleteIssueType } from "../../api.js";

export const issueTypeDeleteCommand = defineCommand({
  meta: { name: "delete", description: "Delete an org Issue Type" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    name: { type: "positional", description: "Issue Type name to delete", required: true },
  },
  async run({ args }) {
    await deleteIssueType(String(args.org), String(args.name));
    console.log(`✓ Deleted Issue Type '${args.name}' from ${args.org}`);
  },
});
