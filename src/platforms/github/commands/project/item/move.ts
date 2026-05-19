import { defineCommand } from "citty";
import { listProjectItems, getProjectId, moveItem } from "../../../api.js";

export const itemMoveCommand = defineCommand({
  meta: {
    name: "move",
    description: "Move an item to top (no --after) or after another item (--after #N)",
  },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    item: { type: "positional", description: "Item content number (e.g. issue #N) to move", required: true },
    after: { type: "string", description: "Content number of item to place AFTER. Omit = move to top." },
  },
  async run({ args }) {
    const org = String(args.org);
    const project = Number(args.project);
    const itemNum = Number(args.item);
    const afterNum = args.after ? Number(args.after) : null;

    const projectId = await getProjectId(org, project);
    const items = await listProjectItems(org, project);
    const target = items.find((i) => i.contentNumber === itemNum);
    if (!target) {
      console.error(`Item with content #${itemNum} not found in project`);
      process.exit(1);
    }
    let afterItemId: string | null = null;
    if (afterNum !== null) {
      const a = items.find((i) => i.contentNumber === afterNum);
      if (!a) {
        console.error(`--after #${afterNum} not found`);
        process.exit(1);
      }
      afterItemId = a.itemId;
    }
    await moveItem(projectId, target.itemId, afterItemId);
    console.log(
      afterItemId
        ? `✓ Moved #${itemNum} after #${afterNum}`
        : `✓ Moved #${itemNum} to top`,
    );
  },
});
