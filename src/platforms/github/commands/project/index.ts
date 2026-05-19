import { defineCommand } from "citty";
import { viewCommand } from "./view/index.js";
import { fieldCommand } from "./field/index.js";
import { itemCommand } from "./item/index.js";
import { statusUpdateCommand } from "./status-update/index.js";

export const projectCommand = defineCommand({
  meta: { name: "project", description: "GitHub Projects v2 operations (memexes internal API + GraphQL gap fillers)" },
  subCommands: {
    view: viewCommand,
    field: fieldCommand,
    item: itemCommand,
    "status-update": statusUpdateCommand,
  },
});
