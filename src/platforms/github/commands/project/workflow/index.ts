import { defineCommand } from "citty";
import { workflowListCommand } from "./list.js";

export const workflowCommand = defineCommand({
  meta: {
    name: "workflow",
    description: "Project workflows / automation (list only — toggle/create require web UI)",
  },
  subCommands: {
    list: workflowListCommand,
  },
});
