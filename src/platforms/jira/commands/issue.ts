import { defineCommand } from "citty";
import { getJiraAuth } from "../auth.js";
import { authHeaders } from "../api.js";

const viewCommand = defineCommand({
  meta: { name: "view", description: "View an issue with custom fields (Key details)" },
  args: {
    key: { type: "string", description: "Issue key (e.g. SVOC-537)", required: true },
    json: { type: "boolean", description: "Output raw JSON", default: false },
  },
  async run({ args }) {
    const auth = getJiraAuth();
    const url = `https://${auth.site}/rest/api/3/issue/${args.key}?expand=names,renderedFields`;
    const res = await fetch(url, { headers: authHeaders(auth) });

    if (!res.ok) {
      console.error(`Failed: ${res.status} ${await res.text()}`);
      process.exit(1);
    }

    const issue = await res.json();

    if (args.json) {
      console.log(JSON.stringify(issue, null, 2));
      return;
    }

    printIssue(issue);
  },
});

export const issueCommand = defineCommand({
  meta: { name: "issue", description: "View issues" },
  subCommands: {
    view: viewCommand,
  },
});

function printIssue(issue: any) {
  const names: Record<string, string> = issue.names ?? {};
  const fields: Record<string, any> = issue.fields ?? {};

  console.log(`${issue.key}  ${fields.summary ?? ""}`);
  console.log(`https://${new URL(issue.self).host}/browse/${issue.key}`);

  const standard: [string, any][] = [
    ["Status", fields.status?.name],
    ["Type", fields.issuetype?.name],
    ["Priority", fields.priority?.name],
    ["Assignee", fields.assignee?.displayName],
    ["Reporter", fields.reporter?.displayName],
    ["Created", fields.created?.substring(0, 10)],
    ["Updated", fields.updated?.substring(0, 10)],
    ["Labels", (fields.labels ?? []).join(", ")],
    ["Components", (fields.components ?? []).map((c: any) => c.name).join(", ")],
    ["Fix versions", (fields.fixVersions ?? []).map((v: any) => v.name).join(", ")],
    ["Parent", fields.parent ? `${fields.parent.key} ${fields.parent.fields?.summary ?? ""}` : null],
  ];
  console.log();
  for (const [label, value] of standard) {
    if (value) console.log(`${label.padEnd(14)} ${value}`);
  }

  const customEntries = Object.keys(fields)
    .filter((k) => k.startsWith("customfield_"))
    .map((k) => [names[k] ?? k, fields[k]] as [string, any])
    .filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0));

  if (customEntries.length > 0) {
    console.log("\n-- Custom fields --");
    for (const [label, value] of customEntries) {
      console.log(`${label.padEnd(24)} ${formatValue(value)}`);
    }
  }

  const description = fields.description;
  if (description) {
    const text = extractAdfText(description);
    if (text) {
      console.log("\n-- Description --");
      console.log(text);
    }
  }
}

export function formatValue(v: any): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(formatValue).filter(Boolean).join(", ");
  if (v.displayName) return v.displayName;
  if (v.value) return v.value;
  if (v.name) return v.name;
  if (v.content) return extractAdfText(v);
  return JSON.stringify(v);
}

export function extractAdfText(body: any): string {
  if (!body) return "";
  const parts: string[] = [];
  function walk(node: any) {
    if (node?.type === "text") parts.push(node.text ?? "");
    else if (node?.type === "mention") parts.push(node.attrs?.text ?? "");
    else if (node?.type === "hardBreak") parts.push("\n");
    for (const c of node?.content ?? []) walk(c);
    if (node?.type === "paragraph" || node?.type === "heading" || node?.type === "listItem") parts.push("\n");
  }
  walk(body);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}
