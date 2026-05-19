#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { jiraCommand } from "./platforms/jira/index.js";
import { githubCommand } from "./platforms/github/index.js";
import { checkForUpdate } from "./lib/update-check.ts";

const main = defineCommand({
  meta: { name: "tsk", description: "Circles Tasks — unified task management CLI" },
  subCommands: {
    jira: jiraCommand,
    github: githubCommand,
  },
});

await checkForUpdate();
runMain(main);
