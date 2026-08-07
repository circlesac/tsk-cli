import { defineCommand } from "citty";
import { authCommand } from "./commands/auth/index.js";
import { projectCommand } from "./commands/project/index.js";
import { issueTypeCommand } from "./commands/issue-type/index.js";
import { issueCommand } from "./commands/issue/index.js";

export const githubCommand = defineCommand({
  meta: {
    name: "github",
    description:
      "GitHub gap-fillers — Project template sync, view CRUD, Issue Types, field options, and bulk item edits",
  },
  subCommands: {
    auth: authCommand,
    "issue-type": issueTypeCommand,
    issue: issueCommand,
    project: projectCommand,
  },
});
