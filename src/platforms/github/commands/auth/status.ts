import { defineCommand } from "citty";
import { loadCookies } from "../../credentials.js";

export const statusCommand = defineCommand({
  meta: { name: "status", description: "Show GitHub authentication state" },
  args: {
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  async run({ args }) {
    const creds = await loadCookies();
    if (!creds) {
      console.log('⚠ Not authenticated. Run: tsk github auth login');
      return;
    }

    const ageHours = Math.floor((Date.now() / 1000 - creds.storedAt) / 3600);
    const info = {
      user: creds.dotcomUser || "(unknown)",
      browser: creds.browser,
      storedAt: new Date(creds.storedAt * 1000).toISOString(),
      ageHours,
    };

    if (args.json) {
      console.log(JSON.stringify(info, null, 2));
    } else {
      console.log(`user:     ${info.user}`);
      console.log(`browser:  ${info.browser}`);
      console.log(`storedAt: ${info.storedAt} (${ageHours}h ago)`);
    }
  },
});
