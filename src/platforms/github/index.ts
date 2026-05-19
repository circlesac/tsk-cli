import { defineCommand } from "citty";
import { authCommand } from "./commands/auth/index.js";
import { projectCommand } from "./commands/project/index.js";
import { issueTypeCommand } from "./commands/issue-type/index.js";
import { issueCommand } from "./commands/issue/index.js";

export const githubCommand = defineCommand({
  meta: {
    name: "github",
    description:
      "GitHub gap-fillers — operations gh CLI doesn't expose (view CRUD, Issue Type CRUD + assignment, field option color, item bulk field-set)",
  },
  subCommands: {
    auth: authCommand,
    "issue-type": issueTypeCommand,
    issue: issueCommand,
    project: projectCommand,
  },
});
