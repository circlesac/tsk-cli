import { defineCommand } from "citty";
import { statusUpdateListCommand } from "./list.js";
import { statusUpdateCreateCommand } from "./create.js";
import { statusUpdateUpdateCommand } from "./update.js";
import { statusUpdateDeleteCommand } from "./delete.js";

export const statusUpdateCommand = defineCommand({
  meta: {
    name: "status-update",
    description: "Project status updates (the 'Add status update' button — gh has nothing)",
  },
  subCommands: {
    list: statusUpdateListCommand,
    create: statusUpdateCreateCommand,
    update: statusUpdateUpdateCommand,
    delete: statusUpdateDeleteCommand,
  },
});
