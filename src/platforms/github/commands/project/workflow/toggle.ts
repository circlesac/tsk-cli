import { defineCommand } from "citty";
import { requireCookies } from "../../../credentials.js";
import { toggleWorkflow } from "../../../api.js";

export const workflowToggleCommand = defineCommand({
  meta: { name: "toggle", description: "Enable or disable a workflow" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    workflow: { type: "positional", description: "Workflow number (from `workflow list`)", required: true },
    enable: { type: "boolean", description: "Enable", default: false },
    disable: { type: "boolean", description: "Disable", default: false },
  },
  async run({ args }) {
    if (args.enable === args.disable) {
      console.error("Specify exactly one of --enable or --disable");
      process.exit(1);
    }
    const creds = await requireCookies();
    const wf = await toggleWorkflow(creds, String(args.org), Number(args.project), Number(args.workflow), args.enable);
    console.log(`✓ Workflow #${wf.number ?? args.workflow} (${wf.name ?? "?"}) → enabled=${args.enable}`);
  },
});
