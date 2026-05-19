import { defineCommand } from "citty";
import { createIssueType } from "../../api.js";
import type { Color } from "../../api.js";

const COLORS = ["GRAY", "BLUE", "GREEN", "YELLOW", "ORANGE", "RED", "PINK", "PURPLE"];

export const issueTypeCreateCommand = defineCommand({
  meta: { name: "create", description: "Create an Issue Type on the org" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    name: { type: "positional", description: "Issue Type name (e.g. Epic)", required: true },
    color: { type: "string", description: "GRAY|BLUE|GREEN|YELLOW|ORANGE|RED|PINK|PURPLE", default: "GRAY" },
    description: { type: "string", description: "Description text", default: "" },
    disabled: { type: "boolean", description: "Create as disabled", default: false },
  },
  async run({ args }) {
    const color = String(args.color).toUpperCase();
    if (!COLORS.includes(color)) {
      console.error(`Invalid color: ${args.color}. Use one of: ${COLORS.join(", ")}`);
      process.exit(1);
    }
    const t = await createIssueType(String(args.org), {
      name: String(args.name),
      color: color as Color,
      description: String(args.description),
      isEnabled: !args.disabled,
    });
    console.log(`✓ Created Issue Type '${t.name}' (${t.color}) — id: ${t.id}`);
  },
});
