import { defineCommand } from "citty";
import { addFieldOption } from "../../../api.js";
import type { Color } from "../../../api.js";

const COLORS = ["GRAY", "BLUE", "GREEN", "YELLOW", "ORANGE", "RED", "PINK", "PURPLE"];

export const optionAddCommand = defineCommand({
  meta: { name: "option-add", description: "Add a new option to a single-select field" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    field: { type: "positional", description: "Field name", required: true },
    option: { type: "positional", description: "New option name", required: true },
    color: { type: "string", description: "Color (GRAY default)", default: "GRAY" },
    description: { type: "string", description: "Option description", default: "" },
  },
  async run({ args }) {
    const color = String(args.color).toUpperCase();
    if (!COLORS.includes(color)) {
      console.error(`Invalid color: ${args.color}. Use: ${COLORS.join(", ")}`);
      process.exit(1);
    }
    addFieldOption(
      String(args.org),
      Number(args.project),
      String(args.field),
      String(args.option),
      color as Color,
      String(args.description),
    );
    console.log(`✓ Added option '${args.option}' (${color}) to field '${args.field}'`);
  },
});
