import { defineCommand } from "citty";
import { listStatusUpdates, deleteStatusUpdate } from "../../../api.js";

export const statusUpdateDeleteCommand = defineCommand({
  meta: { name: "delete", description: "Delete a status update" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    id: { type: "positional", description: "Status update fullDatabaseId", required: true },
  },
  async run({ args }) {
    const updates = listStatusUpdates(String(args.org), Number(args.project));
    const wanted = Number(args.id);
    const target = updates.find((u) => Number(u.fullDatabaseId) === wanted);
    if (!target) {
      console.error(`Status update #${wanted} not found`);
      process.exit(1);
    }
    deleteStatusUpdate(target.id);
    console.log(`✓ Deleted status update #${wanted}`);
  },
});
