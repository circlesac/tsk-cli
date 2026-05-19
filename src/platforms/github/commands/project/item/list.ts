import { defineCommand } from "citty";
import { listProjectItems } from "../../../api.js";

export const itemListCommand = defineCommand({
  meta: { name: "list", description: "List items + their field values" },
  args: {
    org: { type: "positional", description: "Org login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  async run({ args }) {
    const items = listProjectItems(String(args.org), Number(args.project));
    if (args.json) {
      console.log(JSON.stringify(items, null, 2));
      return;
    }
    console.log("#       title                                    fields");
    console.log("------  ---------------------------------------  -----------------------------------------------");
    for (const i of items) {
      const num = (i.contentNumber !== null ? `#${i.contentNumber}` : "(draft)").padEnd(6);
      const title = (i.contentTitle ?? "").slice(0, 40).padEnd(40);
      const fields = Object.entries(i.fields).map(([k, v]) => `${k}=${v}`).join(", ");
      console.log(`${num}  ${title}  ${fields.slice(0, 80)}`);
    }
  },
});
