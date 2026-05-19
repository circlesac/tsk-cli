import { defineCommand } from "citty";
import { extractBrowserCookies, openLoginPage } from "../../auth.js";
import { storeCookies } from "../../credentials.js";

export const loginCommand = defineCommand({
  meta: { name: "login", description: "Extract github.com session cookies from a Chromium browser" },
  args: {
    browser: { type: "string", description: "Force a specific browser (chrome, comet, arc, edge, brave, chromium)" },
    "open-browser": { type: "boolean", description: "Open the GitHub login page in the default browser" },
  },
  async run({ args }) {
    if (args["open-browser"]) {
      console.log("Opening https://github.com/login in default browser…");
      openLoginPage();
      console.log("After you finish logging in, re-run: tsk github auth login");
      return;
    }

    try {
      const creds = await extractBrowserCookies(args.browser);
      await storeCookies(creds);
      console.log(`✓ Authenticated via ${creds.browser}`);
      console.log(`  user:   ${creds.dotcomUser || "(unknown)"}`);
      console.log(`  stored: ~/.config/tsk/github-credentials.json`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/No github\.com session/.test(msg)) {
        console.log("⚠ No github.com session found in any installed browser.");
        console.log("  Opening https://github.com/login in default browser…");
        openLoginPage();
        console.log("  After you finish logging in, re-run: tsk github auth login");
        return;
      }
      console.error(`✗ ${msg}`);
      process.exit(1);
    }
  },
});
