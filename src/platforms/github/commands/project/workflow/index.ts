import { defineCommand } from "citty";
import { workflowListCommand } from "./list.js";
import { workflowToggleCommand } from "./toggle.js";
import { workflowUpdateCommand } from "./update.js";

export const workflowCommand = defineCommand({
  meta: {
    name: "workflow",
    description: "Project workflows / automation rules (built-in + custom)",
  },
  subCommands: {
    list: workflowListCommand,
    toggle: workflowToggleCommand,
    update: workflowUpdateCommand,
  },
});
