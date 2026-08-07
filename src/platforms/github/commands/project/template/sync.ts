import { resolve } from "node:path";
import { defineCommand } from "citty";
import { requireCookies } from "../../../credentials.js";
import { loadProjectTemplate, syncProjectTemplate } from "../../../project-template.js";

export const templateSyncCommand = defineCommand({
  meta: { name: "sync", description: "Sync a JSON manifest to an existing Project and mark it as a template" },
  args: {
    owner: { type: "positional", description: "Organization login", required: true },
    project: { type: "positional", description: "Project number", required: true },
    file: { type: "string", description: "Project template JSON file", required: true },
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  async run({ args }) {
    const creds = await requireCookies();
    const file = resolve(String(args.file));
    const result = await syncProjectTemplate(
      creds,
      String(args.owner),
      Number(args.project),
      await loadProjectTemplate(file),
    );
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`✓ Synced ${args.owner} Project #${result.project} from ${file}`);
    console.log(`  Template: ${result.title}`);
    console.log(`  Fields created: ${result.fieldsCreated.join(", ") || "none"}`);
    console.log(`  Fields updated: ${result.fieldsUpdated.join(", ") || "none"}`);
    console.log(`  Views created: ${result.viewsCreated.join(", ") || "none"}`);
    console.log(`  Views updated: ${result.viewsUpdated.join(", ") || "none"}`);
  },
});
