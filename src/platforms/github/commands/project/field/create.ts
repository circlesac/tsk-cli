import { defineCommand } from "citty";
import { createTextField, createNumberField, createDateField, createIterationField } from "../../../api.js";

export const fieldCreateCommand = defineCommand({
  meta: {
    name: "create",
    description: "Create a text / number / date / iteration field (single-select use GraphQL via gh)",
  },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    name: { type: "string", description: "Field name", required: true },
    type: {
      type: "string",
      description: "text | number | date | iteration",
      required: true,
    },
    "iteration-start": { type: "string", description: "(iteration) Start date YYYY-MM-DD" },
    "iteration-duration": { type: "string", description: "(iteration) Duration in days" },
  },
  async run({ args }) {
    const org = String(args.org);
    const project = Number(args.project);
    const name = String(args.name);
    const type = String(args.type).toLowerCase();

    let result: { id: string; databaseId: number };
    switch (type) {
      case "text":   result = createTextField(org, project, name); break;
      case "number": result = createNumberField(org, project, name); break;
      case "date":   result = createDateField(org, project, name); break;
      case "iteration": {
        const start = String(args["iteration-start"] ?? "");
        const dur = Number(args["iteration-duration"] ?? 0);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
          console.error("--iteration-start YYYY-MM-DD required for iteration field");
          process.exit(1);
        }
        if (!dur || dur < 1) {
          console.error("--iteration-duration (days) required for iteration field");
          process.exit(1);
        }
        result = createIterationField(org, project, name, start, dur);
        break;
      }
      default:
        console.error(`Invalid --type: ${args.type}. Use: text | number | date | iteration`);
        process.exit(1);
    }

    console.log(`✓ Created ${type} field '${name}' — id: ${result.id} (databaseId: ${result.databaseId})`);
  },
});
