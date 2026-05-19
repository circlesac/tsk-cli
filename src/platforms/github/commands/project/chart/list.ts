import { defineCommand } from "citty";
import { requireCookies } from "../../../credentials.js";
import { listCharts } from "../../../api.js";

export const chartListCommand = defineCommand({
  meta: { name: "list", description: "List project Insights charts" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  async run({ args }) {
    const creds = await requireCookies();
    const charts = await listCharts(creds, String(args.org), Number(args.project));
    if (args.json) {
      console.log(JSON.stringify(charts, null, 2));
      return;
    }
    if (charts.length === 0) {
      console.log("(no charts)");
      return;
    }
    for (const c of charts) {
      console.log(JSON.stringify(c, null, 2));
    }
  },
});
