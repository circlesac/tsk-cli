import { defineCommand } from "citty";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getJiraAuth } from "../auth.js";
import { authHeaders, getAttachments, downloadAttachment } from "../api.js";

const downloadCommand = defineCommand({
  meta: { name: "download", description: "Download attachments from an issue" },
  args: {
    key: { type: "string", description: "Issue key (e.g. SHMV-2464)", required: true },
    id: { type: "string", description: "Download specific attachment by ID" },
    out: { type: "string", description: "Output directory", default: "." },
  },
  async run({ args }) {
    const auth = getJiraAuth();
    const attachments = await getAttachments(auth, args.key);

    if (attachments.length === 0) {
      console.log("No attachments found.");
      return;
    }

    const toDownload = args.id
      ? attachments.filter((a) => a.id === args.id)
      : attachments;

    if (toDownload.length === 0) {
      console.error(`Attachment ID ${args.id} not found.`);
      process.exit(1);
    }

    const outDir = join(args.out, args.key);
    mkdirSync(outDir, { recursive: true });

    for (const a of toDownload) {
      process.stdout.write(`Downloading ${a.filename}...`);
      const data = await downloadAttachment(auth, a.content);
      writeFileSync(join(outDir, a.filename), Buffer.from(data));
      console.log(` done (${(data.byteLength / 1024).toFixed(1)}KB)`);
    }

    console.log(`\n${toDownload.length} file(s) saved to ${outDir}`);
  },
});

const listCommand = defineCommand({
  meta: { name: "list", description: "List attachments for an issue" },
  args: {
    key: { type: "string", description: "Issue key (e.g. SHMV-2464)", required: true },
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  async run({ args }) {
    const auth = getJiraAuth();
    const attachments = await getAttachments(auth, args.key);

    if (attachments.length === 0) {
      console.log("No attachments found.");
      return;
    }

    if (args.json) {
      console.log(JSON.stringify(attachments, null, 2));
      return;
    }

    console.log(`${attachments.length} attachment(s):\n`);
    for (const a of attachments) {
      const size =
        a.size > 1024 * 1024
          ? `${(a.size / 1024 / 1024).toFixed(1)}MB`
          : `${(a.size / 1024).toFixed(1)}KB`;
      console.log(`  ${a.id}  ${a.filename}  (${size})`);
    }
  },
});

export const attachmentCommand = defineCommand({
  meta: { name: "attachment", description: "Manage issue attachments" },
  subCommands: {
    download: downloadCommand,
    list: listCommand,
  },
});
