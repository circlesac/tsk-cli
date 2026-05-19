import { defineCommand } from "citty";
import { createStatusUpdate } from "../../../api.js";
import type { StatusUpdateStatus } from "../../../api.js";

const STATUSES = ["INACTIVE", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETE"];

export const statusUpdateCreateCommand = defineCommand({
  meta: { name: "create", description: "Create a project status update" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    body: { type: "string", description: "Update body (markdown)", required: true },
    status: { type: "string", description: "INACTIVE | ON_TRACK | AT_RISK | OFF_TRACK | COMPLETE" },
    "start-date": { type: "string", description: "YYYY-MM-DD" },
    "target-date": { type: "string", description: "YYYY-MM-DD" },
  },
  async run({ args }) {
    const opts: { status?: StatusUpdateStatus; startDate?: string; targetDate?: string } = {};
    if (args.status) {
      const s = String(args.status).toUpperCase();
      if (!STATUSES.includes(s)) {
        console.error(`Invalid --status: ${args.status}. Use: ${STATUSES.join(", ")}`);
        process.exit(1);
      }
      opts.status = s as StatusUpdateStatus;
    }
    if (args["start-date"]) opts.startDate = String(args["start-date"]);
    if (args["target-date"]) opts.targetDate = String(args["target-date"]);

    const u = createStatusUpdate(String(args.org), Number(args.project), String(args.body), opts);
    console.log(`✓ Created status update #${u.fullDatabaseId} (status: ${u.status ?? "—"})`);
  },
});
