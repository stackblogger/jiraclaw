#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { Command } from "commander";
import chalk from "chalk";
import { runInteractiveMenu } from "./interactive.js";
import { flowNlCommand, flowSearchJql, flowShowTodayLogs } from "../commands/workflows.js";
import { ensureJiraclawDir, loadAppConfig, saveAppConfig, writeSecretField } from "../config/load.js";

loadEnv();

const program = new Command();
program
  .name("jiraclaw")
  .description("Jira + Tempo CLI (ZeroClaw-powered planning)")
  .version("0.1.0");

program
  .argument("[words...]", "natural language command")
  .action(async (words: string[]) => {
    const cwd = process.cwd();
    if (!words.length) {
      await runInteractiveMenu(cwd);
      return;
    }
    await flowNlCommand(cwd, words.join(" "));
  });

program
  .command("search")
  .argument("<jql>", "JQL")
  .action(async (jql: string) => {
    await flowSearchJql(jql);
  });

program
  .command("today")
  .description("Show today's Tempo worklogs")
  .action(async () => {
    await flowShowTodayLogs();
  });

program
  .command("config")
  .description("Manage local config")
  .addCommand(
    new Command("set-jira-url")
      .argument("<url>", "https://your.atlassian.net")
      .action((url: string) => {
        ensureJiraclawDir();
        const cfg = loadAppConfig();
        saveAppConfig({ ...cfg, jiraBaseUrl: url });
        console.log(chalk.green("Saved Jira base URL."));
      }),
  )
  .addCommand(
    new Command("set-tempo-url")
      .argument("<url>", "https://api.tempo.io/4")
      .action((url: string) => {
        ensureJiraclawDir();
        const cfg = loadAppConfig();
        saveAppConfig({ ...cfg, tempoBaseUrl: url });
        console.log(chalk.green("Saved Tempo base URL."));
      }),
  )
  .addCommand(
    new Command("set-jira-token")
      .argument("<token>", "API token (stored encrypted if JIRACLAW_SECRET set)")
      .action((token: string) => {
        writeSecretField("jiraApiToken", token);
        console.log(chalk.green("Stored Jira API token."));
      }),
  )
  .addCommand(
    new Command("set-tempo-token")
      .argument("<token>", "Tempo API token")
      .action((token: string) => {
        writeSecretField("tempoApiToken", token);
        console.log(chalk.green("Stored Tempo API token."));
      }),
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
