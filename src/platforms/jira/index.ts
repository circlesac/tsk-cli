import { defineCommand } from "citty";
import { commentCommand } from "./commands/comment.js";
import { attachmentCommand } from "./commands/attachment.js";

export const jiraCommand = defineCommand({
  meta: { name: "jira", description: "Jira operations" },
  subCommands: {
    comment: commentCommand,
    attachment: attachmentCommand,
  },
});
