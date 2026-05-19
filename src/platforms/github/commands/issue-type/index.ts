import { defineCommand } from "citty";
import { issueTypeListCommand } from "./list.js";
import { issueTypeCreateCommand } from "./create.js";
import { issueTypeUpdateCommand } from "./update.js";
import { issueTypeDeleteCommand } from "./delete.js";

export const issueTypeCommand = defineCommand({
  meta: { name: "issue-type", description: "Manage org-level Issue Types (gh CLI has no equivalent)" },
  subCommands: {
    list: issueTypeListCommand,
    create: issueTypeCreateCommand,
    update: issueTypeUpdateCommand,
    delete: issueTypeDeleteCommand,
  },
});
