import { defineCommand } from "citty";
import { viewCreateCommand } from "./create.js";
import { viewUpdateCommand } from "./update.js";
import { viewDeleteCommand } from "./delete.js";

export const viewCommand = defineCommand({
  meta: {
    name: "view",
    description: "Manage project views (use `gh api graphql` for listing)",
  },
  subCommands: {
    create: viewCreateCommand,
    update: viewUpdateCommand,
    delete: viewDeleteCommand,
  },
});
