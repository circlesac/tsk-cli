import { defineCommand } from "citty";
import { requireCookies } from "../../../credentials.js";
import { deleteView } from "../../../api.js";

export const viewDeleteCommand = defineCommand({
  meta: { name: "delete", description: "Delete a view" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    view: { type: "positional", description: "View number to delete", required: true },
  },
  async run({ args }) {
    const creds = await requireCookies();
    await deleteView(creds, String(args.org), Number(args.project), Number(args.view));
    console.log(`✓ Deleted view #${args.view}`);
  },
});
