#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { jiraCommand } from "./platforms/jira/index.js";

const main = defineCommand({
  meta: { name: "tsk", description: "Circles Tasks — unified task management CLI" },
  subCommands: {
    jira: jiraCommand,
  },
});

runMain(main);
