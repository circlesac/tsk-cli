import { defineCommand } from "citty";
import { requireCookies } from "../../../credentials.js";
import { updateChart } from "../../../api.js";

export const chartUpdateCommand = defineCommand({
  meta: { name: "update", description: "Update an existing chart (rename, change filter, type)" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    chart: { type: "positional", description: "Chart number", required: true },
    name: { type: "string", description: "New name" },
    type: { type: "string", description: "column | line | bar" },
    filter: { type: "string", description: "Filter query" },
    period: { type: "string", description: "Time period (line chart)" },
  },
  async run({ args }) {
    const creds = await requireCookies();
    const changes: { name?: string; configuration?: Record<string, unknown> } = {};
    if (args.name) changes.name = String(args.name);
    const cfg: Record<string, unknown> = {};
    if (args.type) cfg.type = String(args.type);
    if (args.filter !== undefined) cfg.filter = String(args.filter);
    if (args.period) cfg.time = { period: String(args.period) };
    if (Object.keys(cfg).length > 0) {
      // PUT requires full configuration on update — fetch existing first
      const { listCharts } = await import("../../../api.js");
      const charts = await listCharts(creds, String(args.org), Number(args.project));
      const existing = charts.find((c) => (c as { number: number }).number === Number(args.chart));
      if (!existing) {
        console.error(`Chart #${args.chart} not found`);
        process.exit(1);
      }
      const exCfg = (existing as { configuration?: Record<string, unknown> }).configuration ?? {};
      changes.configuration = { ...exCfg, ...cfg };
    }
    const c = await updateChart(creds, String(args.org), Number(args.project), Number(args.chart), changes);
    console.log(`✓ Updated chart #${c.number} (${c.name})`);
  },
});
