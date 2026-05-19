import { defineCommand } from "citty";
import { viewCommand } from "./view/index.js";

export const projectCommand = defineCommand({
  meta: { name: "project", description: "GitHub Projects v2 operations (memexes internal API)" },
  subCommands: {
    view: viewCommand,
  },
});
