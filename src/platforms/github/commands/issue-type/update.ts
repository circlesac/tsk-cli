import { defineCommand } from "citty";
import { updateIssueType } from "../../api.js";
import type { Color } from "../../api.js";

const COLORS = ["GRAY", "BLUE", "GREEN", "YELLOW", "ORANGE", "RED", "PINK", "PURPLE"];

export const issueTypeUpdateCommand = defineCommand({
  meta: { name: "update", description: "Update an existing Issue Type" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    name: { type: "positional", description: "Current Issue Type name", required: true },
    "new-name": { type: "string", description: "New name" },
    color: { type: "string", description: "New color" },
    description: { type: "string", description: "New description" },
    enabled: { type: "boolean", description: "Set isEnabled true" },
    disabled: { type: "boolean", description: "Set isEnabled false" },
  },
  async run({ args }) {
    const changes: { name?: string; color?: Color; description?: string; isEnabled?: boolean } = {};
    if (args["new-name"]) changes.name = String(args["new-name"]);
    if (args.color) {
      const c = String(args.color).toUpperCase();
      if (!COLORS.includes(c)) {
        console.error(`Invalid color: ${args.color}. Use: ${COLORS.join(", ")}`);
        process.exit(1);
      }
      changes.color = c as Color;
    }
    if (args.description !== undefined) changes.description = String(args.description);
    if (args.enabled) changes.isEnabled = true;
    if (args.disabled) changes.isEnabled = false;

    const t = await updateIssueType(String(args.org), String(args.name), changes);
    console.log(`✓ Updated Issue Type '${t.name}' (${t.color}, enabled=${t.isEnabled})`);
  },
});
