import { defineCommand } from "citty";
import { updateFieldOption } from "../../../api.js";
import type { Color } from "../../../api.js";

const COLORS = ["GRAY", "BLUE", "GREEN", "YELLOW", "ORANGE", "RED", "PINK", "PURPLE"];

export const optionUpdateCommand = defineCommand({
  meta: {
    name: "option-update",
    description: "Update an existing option (rename / change color / description)",
  },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    field: { type: "positional", description: "Field name", required: true },
    option: { type: "positional", description: "Current option name", required: true },
    "new-name": { type: "string", description: "New option name" },
    color: { type: "string", description: "New color" },
    description: { type: "string", description: "New description" },
  },
  async run({ args }) {
    const changes: { name?: string; color?: Color; description?: string } = {};
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
    await updateFieldOption(
      String(args.org),
      Number(args.project),
      String(args.field),
      String(args.option),
      changes,
    );
    console.log(`✓ Updated option '${args.option}' on field '${args.field}'`);
  },
});
