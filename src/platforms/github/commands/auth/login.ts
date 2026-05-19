import { defineCommand } from "citty";
import { extractBrowserCookies, openLoginPage, captureGhToken } from "../../auth.js";
import { storeCookies } from "../../credentials.js";

export const loginCommand = defineCommand({
  meta: {
    name: "login",
    description: "Extract session cookies + GitHub API token. Run after browser login + `gh auth login`.",
  },
  args: {
    browser: { type: "string", description: "Force a specific browser (chrome, comet, arc, edge, brave, chromium)" },
    "open-browser": { type: "boolean", description: "Open the GitHub login page in the default browser" },
    "gh-token": { type: "string", description: "Provide GitHub PAT explicitly (skip gh CLI lookup)" },
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
      const ghToken = captureGhToken(args["gh-token"] ? String(args["gh-token"]) : undefined);
      creds.ghToken = ghToken;

      await storeCookies(creds);
      console.log(`✓ Authenticated via ${creds.browser}`);
      console.log(`  user:    ${creds.dotcomUser || "(unknown)"}`);
      console.log(`  ghToken: ${ghToken ? `${ghToken.slice(0, 8)}… (captured)` : "(none — run \`gh auth login\` or pass --gh-token PAT)"}`);
      console.log(`  stored:  ~/.config/tsk/github-credentials.json`);
      if (!ghToken) {
        console.log("");
        console.log("⚠ No GitHub API token. Commands that need GraphQL reads will fail.");
        console.log("  Either: run `gh auth login` then `tsk github auth login` again,");
        console.log("  Or:     re-run with --gh-token <PAT>");
      }
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
