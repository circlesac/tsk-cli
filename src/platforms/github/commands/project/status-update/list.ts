import { defineCommand } from "citty";
import { listStatusUpdates } from "../../../api.js";

export const statusUpdateListCommand = defineCommand({
  meta: { name: "list", description: "List project status updates" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  async run({ args }) {
    const updates = listStatusUpdates(String(args.org), Number(args.project));
    if (args.json) {
      console.log(JSON.stringify(updates, null, 2));
      return;
    }
    if (updates.length === 0) {
      console.log("(no status updates)");
      return;
    }
    for (const u of updates) {
      console.log(`#${u.fullDatabaseId}  ${u.status ?? "(no status)"}  ${u.createdAt}`);
      console.log(`  ${u.body.slice(0, 200)}`);
      console.log("");
    }
  },
});
