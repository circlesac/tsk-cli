import { defineCommand } from "citty";
import { fieldListCommand } from "./list.js";
import { fieldUpdateCommand } from "./update.js";
import { fieldCreateCommand } from "./create.js";
import { optionAddCommand } from "./option-add.js";
import { optionUpdateCommand } from "./option-update.js";
import { optionDeleteCommand } from "./option-delete.js";
import { optionRecolorCommand } from "./option-recolor.js";

export const fieldCommand = defineCommand({
  meta: { name: "field", description: "Manage project fields (text/number/date/iteration create + option mgmt)" },
  subCommands: {
    list: fieldListCommand,
    create: fieldCreateCommand,
    update: fieldUpdateCommand,
    "option-add": optionAddCommand,
    "option-update": optionUpdateCommand,
    "option-delete": optionDeleteCommand,
    "option-recolor": optionRecolorCommand,
  },
});
