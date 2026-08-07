import { defineCommand } from "citty";
import { templateSyncCommand } from "./sync.js";

export const templateCommand = defineCommand({
  meta: { name: "template", description: "Synchronize file-defined GitHub Project templates" },
  subCommands: {
    sync: templateSyncCommand,
  },
});
