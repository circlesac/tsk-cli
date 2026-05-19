import { defineCommand } from "citty";
import { itemListCommand } from "./list.js";
import { itemFieldSetCommand } from "./field-set.js";

export const itemCommand = defineCommand({
  meta: { name: "item", description: "Manage project items (bulk operations gh doesn't have)" },
  subCommands: {
    list: itemListCommand,
    "field-set": itemFieldSetCommand,
  },
});
