import { defineCommand } from "citty";
import { chartListCommand } from "./list.js";
import { chartCreateCommand } from "./create.js";
import { chartUpdateCommand } from "./update.js";
import { chartDeleteCommand } from "./delete.js";

export const chartCommand = defineCommand({
  meta: { name: "chart", description: "Project Insights charts (full CRUD)" },
  subCommands: {
    list: chartListCommand,
    create: chartCreateCommand,
    update: chartUpdateCommand,
    delete: chartDeleteCommand,
  },
});
