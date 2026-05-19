import { defineCommand } from "citty";
import { chartListCommand } from "./list.js";

export const chartCommand = defineCommand({
  meta: {
    name: "chart",
    description: "Project Insights charts (list only — create/update via web UI for now)",
  },
  subCommands: {
    list: chartListCommand,
  },
});
