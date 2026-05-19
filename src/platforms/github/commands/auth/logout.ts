import { defineCommand } from "citty";
import { removeCookies } from "../../credentials.js";

export const logoutCommand = defineCommand({
  meta: { name: "logout", description: "Remove stored GitHub cookies" },
  async run() {
    const removed = await removeCookies();
    if (removed) console.log("✓ Logged out");
    else console.log("⚠ Not logged in");
  },
});
