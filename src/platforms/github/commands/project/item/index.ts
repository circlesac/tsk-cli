import { defineCommand } from "citty";
import { itemListCommand } from "./list.js";
import { itemFieldSetCommand } from "./field-set.js";
import { itemFieldClearCommand } from "./field-clear.js";
import { itemArchiveCommand, itemUnarchiveCommand } from "./archive.js";
import { itemMoveCommand } from "./move.js";

export const itemCommand = defineCommand({
  meta: { name: "item", description: "Manage project items (bulk operations + ops gh doesn't have)" },
  subCommands: {
    list: itemListCommand,
    "field-set": itemFieldSetCommand,
    "field-clear": itemFieldClearCommand,
    archive: itemArchiveCommand,
    unarchive: itemUnarchiveCommand,
    move: itemMoveCommand,
  },
});
