import { defineCommand } from "citty";
import { listStatusUpdates, updateStatusUpdate } from "../../../api.js";
import type { StatusUpdateStatus } from "../../../api.js";

const STATUSES = ["INACTIVE", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETE"];

export const statusUpdateUpdateCommand = defineCommand({
  meta: { name: "update", description: "Update an existing status update" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    id: { type: "positional", description: "Status update fullDatabaseId (from list)", required: true },
    body: { type: "string", description: "New body" },
    status: { type: "string", description: "New status" },
    "start-date": { type: "string", description: "YYYY-MM-DD" },
    "target-date": { type: "string", description: "YYYY-MM-DD" },
  },
  async run({ args }) {
    // Look up the GraphQL node ID via list (matches by fullDatabaseId)
    const updates = listStatusUpdates(String(args.org), Number(args.project));
    const wanted = Number(args.id);
    const target = updates.find((u) => Number(u.fullDatabaseId) === wanted);
    if (!target) {
      console.error(`Status update #${wanted} not found`);
      process.exit(1);
    }

    const changes: { body?: string; status?: StatusUpdateStatus; startDate?: string; targetDate?: string } = {};
    if (args.body !== undefined) changes.body = String(args.body);
    if (args.status !== undefined) {
      const s = String(args.status).toUpperCase();
      if (!STATUSES.includes(s)) {
        console.error(`Invalid --status: ${args.status}. Use: ${STATUSES.join(", ")}`);
        process.exit(1);
      }
      changes.status = s as StatusUpdateStatus;
    }
    if (args["start-date"] !== undefined) changes.startDate = String(args["start-date"]);
    if (args["target-date"] !== undefined) changes.targetDate = String(args["target-date"]);

    const u = updateStatusUpdate(target.id, changes);
    console.log(`✓ Updated status update #${u.fullDatabaseId}`);
  },
});
