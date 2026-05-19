import { defineCommand } from "citty";
import { requireCookies } from "../../../credentials.js";
import { deleteChart } from "../../../api.js";

export const chartDeleteCommand = defineCommand({
  meta: { name: "delete", description: "Delete a chart" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    chart: { type: "positional", description: "Chart number to delete", required: true },
  },
  async run({ args }) {
    const creds = await requireCookies();
    await deleteChart(creds, String(args.org), Number(args.project), Number(args.chart));
    console.log(`✓ Deleted chart #${args.chart}`);
  },
});
