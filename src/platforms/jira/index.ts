import { defineCommand } from "citty";
import { commentCommand } from "./commands/comment.js";
import { attachmentCommand } from "./commands/attachment.js";
import { issueCommand } from "./commands/issue.js";

export const jiraCommand = defineCommand({
  meta: { name: "jira", description: "Jira operations" },
  subCommands: {
    issue: issueCommand,
    comment: commentCommand,
    attachment: attachmentCommand,
  },
});
