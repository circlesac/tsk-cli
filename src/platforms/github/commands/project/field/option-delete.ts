import { defineCommand } from "citty";
import { deleteFieldOption } from "../../../api.js";

export const optionDeleteCommand = defineCommand({
  meta: { name: "option-delete", description: "Delete an option from a single-select field" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    field: { type: "positional", description: "Field name", required: true },
    option: { type: "positional", description: "Option name to delete", required: true },
  },
  async run({ args }) {
    deleteFieldOption(
      String(args.org),
      Number(args.project),
      String(args.field),
      String(args.option),
    );
    console.log(`✓ Deleted option '${args.option}' from field '${args.field}'`);
  },
});
