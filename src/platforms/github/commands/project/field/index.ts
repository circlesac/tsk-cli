import { defineCommand } from "citty";
import { fieldListCommand } from "./list.js";
import { fieldUpdateCommand } from "./update.js";
import { optionAddCommand } from "./option-add.js";
import { optionUpdateCommand } from "./option-update.js";
import { optionDeleteCommand } from "./option-delete.js";

export const fieldCommand = defineCommand({
  meta: { name: "field", description: "Manage project fields (gh only has create)" },
  subCommands: {
    list: fieldListCommand,
    update: fieldUpdateCommand,
    "option-add": optionAddCommand,
    "option-update": optionUpdateCommand,
    "option-delete": optionDeleteCommand,
  },
});
