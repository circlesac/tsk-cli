import { defineCommand } from "citty";
import { markdownToAdf } from "marklassian";
import { getJiraAuth } from "../auth.js";
import { authHeaders, findUserByEmail } from "../api.js";

const addCommand = defineCommand({
  meta: { name: "add", description: "Add a comment (supports markdown, @email mentions)" },
  args: {
    key: { type: "string", description: "Issue key (e.g. SHMV-2464)", required: true },
    body: { type: "string", description: "Comment body in markdown (bold, lists, code, etc.)", required: true },
  },
  async run({ args }) {
    const auth = getJiraAuth();
    const adf = await buildAdf(auth, args.body);

    const url = `https://${auth.site}/rest/api/3/issue/${args.key}/comment`;
    const res = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders(auth), "Content-Type": "application/json" },
      body: JSON.stringify({ body: adf }),
    });

    if (!res.ok) {
      console.error(`Failed: ${res.status} ${await res.text()}`);
      process.exit(1);
    }

    const data = await res.json();
    console.log(`Comment added (id: ${data.id})`);
  },
});

const listCommand = defineCommand({
  meta: { name: "list", description: "List comments on an issue" },
  args: {
    key: { type: "string", description: "Issue key", required: true },
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  async run({ args }) {
    const auth = getJiraAuth();
    const url = `https://${auth.site}/rest/api/3/issue/${args.key}/comment`;
    const res = await fetch(url, { headers: authHeaders(auth) });

    if (!res.ok) {
      console.error(`Failed: ${res.status}`);
      process.exit(1);
    }

    const data = await res.json();
    const comments = data.comments ?? [];

    if (args.json) {
      console.log(JSON.stringify(comments, null, 2));
      return;
    }

    if (comments.length === 0) {
      console.log("No comments.");
      return;
    }

    for (const c of comments) {
      const author = c.author?.displayName ?? "?";
      const created = c.created?.substring(0, 10) ?? "";
      const text = extractText(c.body);
      console.log(`${c.id}  ${author}  (${created})`);
      if (text) console.log(`    ${text.substring(0, 120)}`);
      console.log();
    }
  },
});

const updateCommand = defineCommand({
  meta: { name: "update", description: "Update a comment (supports markdown, @email mentions)" },
  args: {
    key: { type: "string", description: "Issue key", required: true },
    id: { type: "string", description: "Comment ID", required: true },
    body: { type: "string", description: "New comment body in markdown", required: true },
  },
  async run({ args }) {
    const auth = getJiraAuth();
    const adf = await buildAdf(auth, args.body);

    const url = `https://${auth.site}/rest/api/3/issue/${args.key}/comment/${args.id}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...authHeaders(auth), "Content-Type": "application/json" },
      body: JSON.stringify({ body: adf }),
    });

    if (!res.ok) {
      console.error(`Failed: ${res.status} ${await res.text()}`);
      process.exit(1);
    }

    console.log(`Comment ${args.id} updated.`);
  },
});

const deleteCommand = defineCommand({
  meta: { name: "delete", description: "Delete a comment" },
  args: {
    key: { type: "string", description: "Issue key", required: true },
    id: { type: "string", description: "Comment ID", required: true },
  },
  async run({ args }) {
    const auth = getJiraAuth();
    const url = `https://${auth.site}/rest/api/3/issue/${args.key}/comment/${args.id}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: authHeaders(auth),
    });

    if (!res.ok) {
      console.error(`Failed: ${res.status}`);
      process.exit(1);
    }

    console.log(`Comment ${args.id} deleted.`);
  },
});

export const commentCommand = defineCommand({
  meta: { name: "comment", description: "Manage issue comments" },
  subCommands: {
    add: addCommand,
    list: listCommand,
    update: updateCommand,
    delete: deleteCommand,
  },
});

// --- helpers ---

async function buildAdf(auth: any, markdown: string) {
  // Resolve @email mentions before markdown conversion
  // Replace @email with placeholder to prevent marklassian from splitting into mailto links
  const mentionPattern = /@([\w.+-]+@[\w.-]+\.\w+)/g;
  const matches = [...markdown.matchAll(mentionPattern)];

  const mentions: { token: string; accountId: string; displayName: string }[] = [];
  let processed = markdown;

  for (const match of matches) {
    const user = await findUserByEmail(auth, match[1]);
    if (user) {
      const token = `TSKMENTION${mentions.length}END`;
      processed = processed.replace(match[0], token);
      mentions.push({ token, accountId: user.accountId, displayName: user.displayName });
    }
  }

  const adf = markdownToAdf(processed);

  // Replace placeholder tokens with mention nodes
  if (mentions.length > 0) {
    injectMentions(adf, mentions);
  }

  return adf;
}

function injectMentions(adf: any, mentions: { token: string; accountId: string; displayName: string }[]) {
  function walk(nodes: any[]) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.type === "text" && node.text) {
        for (const m of mentions) {
          const idx = node.text.indexOf(m.token);
          if (idx !== -1) {
            const before = node.text.substring(0, idx);
            const after = node.text.substring(idx + m.token.length);
            const replacement: any[] = [];
            if (before) replacement.push({ type: "text", text: before, ...(node.marks ? { marks: node.marks } : {}) });
            replacement.push({ type: "mention", attrs: { id: m.accountId, text: `@${m.displayName}`, accessLevel: "" } });
            if (after) replacement.push({ type: "text", text: after, ...(node.marks ? { marks: node.marks } : {}) });
            nodes.splice(i, 1, ...replacement);
            i += replacement.length - 1;
            break;
          }
        }
      }
      if (node.content) walk(node.content);
    }
  }
  if (adf.content) walk(adf.content);
}

function extractText(body: any): string {
  const texts: string[] = [];
  function walk(node: any) {
    if (node?.type === "text") texts.push(node.text ?? "");
    if (node?.type === "mention") texts.push(node.attrs?.text ?? "");
    for (const c of node?.content ?? []) walk(c);
  }
  walk(body);
  return texts.join(" ").trim();
}
