import { defineCommand } from "citty";
import { requireCookies } from "../../../credentials.js";
import { listWorkflows } from "../../../api.js";

export const workflowListCommand = defineCommand({
  meta: { name: "list", description: "List project workflows (built-in + custom automation rules)" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  async run({ args }) {
    const creds = await requireCookies();
    const workflows = await listWorkflows(creds, String(args.org), Number(args.project));
    if (args.json) {
      console.log(JSON.stringify(workflows, null, 2));
      return;
    }
    if (workflows.length === 0) {
      console.log("(no workflows)");
      return;
    }
    console.log("#  name                                 trigger                          enabled  actions");
    console.log("-- -----------------------------------  -------------------------------  -------  -------");
    for (const w of workflows) {
      const actStr = w.actions.map((a) => a.actionType).join(",");
      console.log(
        `${String(w.number).padEnd(2)} ${w.name.padEnd(35).slice(0,35)}  ${w.triggerType.padEnd(30).slice(0,30)}  ${String(w.enabled).padEnd(7)}  ${actStr}`,
      );
    }
  },
});
