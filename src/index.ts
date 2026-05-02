#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { jiraCommand } from "./platforms/jira/index.js";
import { checkForUpdate } from "./lib/update-check.ts";

const main = defineCommand({
  meta: { name: "tsk", description: "Circles Tasks — unified task management CLI" },
  subCommands: {
    jira: jiraCommand,
  },
});

await checkForUpdate();
runMain(main);
