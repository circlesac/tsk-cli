import { defineCommand } from "citty";
import { authCommand } from "./commands/auth/index.js";
import { projectCommand } from "./commands/project/index.js";

export const githubCommand = defineCommand({
  meta: {
    name: "github",
    description: "GitHub Projects v2 internal API (memexes) — fills gaps in `gh` (view update / delete / extended config)",
  },
  subCommands: {
    auth: authCommand,
    project: projectCommand,
  },
});
