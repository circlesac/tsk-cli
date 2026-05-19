import { defineCommand } from "citty";
import { loginCommand } from "./login.js";
import { statusCommand } from "./status.js";
import { logoutCommand } from "./logout.js";

export const authCommand = defineCommand({
  meta: { name: "auth", description: "Manage GitHub session authentication (browser cookies)" },
  subCommands: {
    login: loginCommand,
    status: statusCommand,
    logout: logoutCommand,
  },
});
