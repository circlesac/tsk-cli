import { defineCommand } from "citty";
import { recolorOptions } from "../../../api.js";
import type { Color } from "../../../api.js";

const COLORS = ["GRAY", "BLUE", "GREEN", "YELLOW", "ORANGE", "RED", "PINK", "PURPLE"];

function parseMap(s: string): Record<string, Color> {
  const out: Record<string, Color> = {};
  for (const pair of s.split(",")) {
    const m = pair.trim().match(/^([^=]+)=(.+)$/);
    if (!m) throw new Error(`Invalid pair: '${pair}'. Expected 'name=COLOR'`);
    const name = m[1]!.trim();
    const color = m[2]!.trim().toUpperCase();
    if (!COLORS.includes(color)) {
      throw new Error(`Invalid color for '${name}': ${color}. Use: ${COLORS.join(", ")}`);
    }
    out[name] = color as Color;
  }
  return out;
}

export const optionRecolorCommand = defineCommand({
  meta: {
    name: "option-recolor",
    description: "Bulk recolor options on a single-select field in one call",
  },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    field: { type: "positional", description: "Field name", required: true },
    map: {
      type: "string",
      description: "Mapping: 'optionName=COLOR,optionName2=COLOR2,...'",
      required: true,
    },
  },
  async run({ args }) {
    const map = parseMap(String(args.map));
    const result = recolorOptions(String(args.org), Number(args.project), String(args.field), map);
    console.log(`✓ Recolored ${result.changed} option(s) on '${args.field}'`);
    if (result.skipped.length > 0) {
      console.log(`  ⚠ Unknown option names (skipped): ${result.skipped.join(", ")}`);
    }
  },
});
