import { defineCommand } from "citty";
import { requireCookies } from "../../../credentials.js";
import { updateWorkflow } from "../../../api.js";

export const workflowUpdateCommand = defineCommand({
  meta: { name: "update", description: "Update a workflow (rename, change contentTypes)" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    workflow: { type: "positional", description: "Workflow number", required: true },
    name: { type: "string", description: "New name" },
    "content-types": { type: "string", description: "Comma-separated content types (Issue,PullRequest)" },
  },
  async run({ args }) {
    const creds = await requireCookies();
    const changes: { name?: string; contentTypes?: string[] } = {};
    if (args.name) changes.name = String(args.name);
    if (args["content-types"]) {
      changes.contentTypes = String(args["content-types"]).split(",").map((s) => s.trim()).filter(Boolean);
    }
    const wf = await updateWorkflow(
      creds,
      String(args.org),
      Number(args.project),
      Number(args.workflow),
      changes,
    );
    console.log(`✓ Updated workflow #${wf.number ?? args.workflow} (${wf.name ?? "?"})`);
  },
});
