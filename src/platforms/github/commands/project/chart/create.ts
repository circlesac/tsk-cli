import { defineCommand } from "citty";
import { requireCookies } from "../../../credentials.js";
import { createChart, findProjectField } from "../../../api.js";
import type { ChartConfiguration } from "../../../api.js";

export const chartCreateCommand = defineCommand({
  meta: { name: "create", description: "Create an Insights chart" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    type: { type: "string", description: "column | line | bar", default: "column" },
    "x-field": { type: "string", description: "X-axis field name (or 'time' for time series)", required: true },
    filter: { type: "string", description: "Filter query (e.g. 'is:open')" },
    period: { type: "string", description: "Time period for line charts (e.g. '2W', '1M')" },
  },
  async run({ args }) {
    const creds = await requireCookies();
    const org = String(args.org);
    const project = Number(args.project);

    const xField = String(args["x-field"]);
    let xColumn: number | string = xField;
    if (xField !== "time") {
      const f = await findProjectField(org, project, xField);
      xColumn = f.id ? Number((f as { databaseId?: number }).databaseId ?? 0) || xField : xField;
      // Fallback: try resolve via dataType-aware lookup since findProjectField uses id (node ID)
      // For chart endpoint we need numeric databaseId. Use REST API to be safe.
      const restRes = await fetch(
        `https://api.github.com/orgs/${org}/projectsV2/${project}/fields`,
        { headers: { Accept: "application/json", "User-Agent": "tsk-cli", Authorization: `Bearer ${process.env.GH_TOKEN ?? ""}` } },
      ).catch(() => null);
      // Simpler: just use gh CLI for numeric field id
      const { execSync } = await import("node:child_process");
      const out = execSync(`gh api /orgs/${org}/projectsV2/${project}/fields`, { encoding: "utf-8" });
      const fields = JSON.parse(out) as Array<{ id: number; name: string }>;
      const target = fields.find((x) => x.name === xField);
      if (!target) {
        console.error(`Field '${xField}' not found`);
        process.exit(1);
      }
      xColumn = target.id;
    }

    const config: ChartConfiguration = {
      type: String(args.type) as "column" | "line" | "bar",
      xAxis: { dataSource: { column: xColumn } },
      yAxis: { aggregate: { operation: "count" } },
      filter: args.filter ? String(args.filter) : "",
    };
    if (args.period) config.time = { period: String(args.period) };

    const chart = await createChart(creds, org, project, config);
    console.log(`✓ Created chart #${chart.number} (${chart.name}) — type=${chart.configuration.type}, x=${xField}`);
  },
});
