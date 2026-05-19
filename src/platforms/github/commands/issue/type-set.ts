import { defineCommand } from "citty";
import { setIssueType, bulkSetIssueType } from "../../api.js";

function parseRef(ref: string): { owner: string; repo: string; number?: number } {
  // Accepts "owner/repo#NNN" or "owner/repo"
  const m = ref.match(/^([^/]+)\/([^#]+)(?:#(\d+))?$/);
  if (!m) throw new Error(`Invalid ref: ${ref}. Expected owner/repo or owner/repo#NNN`);
  return { owner: m[1]!, repo: m[2]!, number: m[3] ? parseInt(m[3], 10) : undefined };
}

export const typeSetCommand = defineCommand({
  meta: {
    name: "type-set",
    description: "Assign an Issue Type to one issue or all issues in a repo (bulk)",
  },
  args: {
    ref: { type: "positional", description: "owner/repo#NNN (single) or owner/repo (bulk)", required: true },
    type: { type: "positional", description: "Issue Type name (e.g. Epic)", required: true },
    org: { type: "string", description: "Org to source Issue Type from (defaults to owner of repo)" },
    bulk: { type: "boolean", description: "Bulk mode — assign to multiple issues in the repo", default: false },
    state: { type: "string", description: "Bulk filter: OPEN|CLOSED|ALL (default OPEN)", default: "OPEN" },
    milestone: { type: "string", description: "Bulk filter: milestone number" },
    label: { type: "string", description: "Bulk filter: label name" },
  },
  async run({ args }) {
    const { owner, repo, number } = parseRef(String(args.ref));
    const org = String(args.org ?? owner);
    const typeName = String(args.type);

    if (!args.bulk && number !== undefined) {
      await setIssueType(org, owner, repo, number, typeName);
      console.log(`✓ Set ${owner}/${repo}#${number} → Issue Type '${typeName}'`);
      return;
    }

    if (!args.bulk && number === undefined) {
      console.error("Specify owner/repo#NNN for single, or pass --bulk to apply to many.");
      process.exit(1);
    }

    const state = String(args.state).toUpperCase() as "OPEN" | "CLOSED" | "ALL";
    const filter: { state: typeof state; milestone?: number; label?: string } = { state };
    if (args.milestone) filter.milestone = parseInt(String(args.milestone), 10);
    if (args.label) filter.label = String(args.label);

    const result = await bulkSetIssueType(org, owner, repo, typeName, filter);
    console.log(
      `✓ Bulk set ${owner}/${repo} → Issue Type '${typeName}': applied=${result.applied} skipped=${result.skipped} total=${result.total}`,
    );
  },
});
