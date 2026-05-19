import { defineCommand } from "citty";
import { typeSetCommand } from "./type-set.js";

export const issueCommand = defineCommand({
  meta: { name: "issue", description: "GitHub issue operations (gh-gap fillers)" },
  subCommands: {
    "type-set": typeSetCommand,
  },
});
