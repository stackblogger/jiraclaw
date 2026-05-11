import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { resolveCredentials } from "../config/load.js";
import {
  jiraAssignedOpen,
  jiraCreateIssue,
  jiraGetIssue,
  jiraMyself,
  jiraSearchJql,
  jiraTransitionToStatusName,
} from "../jira/client.js";
import { averageHoursForTicket, recordTicketUsage, recordWorklogMemory } from "../memory/store.js";
import { planFromUserText, summarizeWorkContext } from "../agent/runner.js";
import { collectWorkContext, type WorkContext } from "../tracking/collect.js";
import {
  tempoCreateWorklog,
  tempoListWorklogsForUserRange,
  tempoWorklogIssueNumericId,
} from "../tempo/client.js";
import { extractIssueKeyAfterUnder, extractJiraKeys } from "../utils/jira-ticket-regex.js";
import type { JiraIssue } from "../jira/types.js";
import type { Plan } from "../agent/plan-schema.js";
import type { ResolvedCredentials } from "../config/types.js";
import { rescueUnknownPlan, planListTicketsUnderFromUserPhrase, wantsLogHoursOnMyTicketsPhrase } from "../agent/fallback-plan.js";
import { extractNlSlots, intentUsesNlSlots, mergeNlSlotsIntoPlan } from "../agent/slot-extractor.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseHours(input: string): number {
  const s = input.trim().toLowerCase();
  if (s.endsWith("h")) return Number.parseFloat(s.slice(0, -1)) || 0;
  return Number.parseFloat(s) || 0;
}

function tempoWorklogDescription(ticketKey: string): string {
  return `Working on work item ${ticketKey}`;
}

function uniqueTicketCandidates(text: string, plan: Plan, ctx: WorkContext): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of [plan.ticketKey, ...extractJiraKeys(text), ...ctx.inferredTickets]) {
    if (!k?.trim()) continue;
    const u = k.trim().toUpperCase();
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

async function resolveIssueInteractive(
  creds: ResolvedCredentials,
  candidates: string[],
): Promise<JiraIssue> {
  for (const k of candidates) {
    try {
      return await jiraGetIssue(creds, k);
    } catch (e) {
      console.log(chalk.yellow(`${k}: ${(e as Error).message}`));
    }
  }
  for (;;) {
    const { ticketKey } = await inquirer.prompt<{ ticketKey: string }>([
      { type: "input", name: "ticketKey", message: "Jira issue key?" },
    ]);
    const t = ticketKey.trim();
    if (!t) continue;
    try {
      return await jiraGetIssue(creds, t);
    } catch (e) {
      console.log(chalk.red((e as Error).message));
    }
  }
}

async function pickIssueFromAssigned(
  creds: ResolvedCredentials,
  accountId: string,
  opts?: { alwaysList?: boolean },
): Promise<JiraIssue> {
  const spin = ora("Loading assigned issues…").start();
  try {
    const issues = await jiraAssignedOpen(creds, accountId);
    if (!issues.length) {
      console.log(chalk.yellow("No assigned open issues."));
      return resolveIssueInteractive(creds, []);
    }
    console.log(chalk.bold("\nAssigned issues:"));
    for (const i of issues) {
      const st = i.fields.status?.name ?? "";
      console.log(`  ${chalk.cyan(i.key)}  ${st}  ${i.fields.summary}`);
    }
    const useList = opts?.alwaysList === true || issues.length > 1;
    if (!useList) {
      console.log(chalk.gray(`Using ${issues[0].key}`));
      return issues[0];
    }
    const { choice } = await inquirer.prompt<{ choice: string }>([
      {
        type: "list",
        name: "choice",
        message: "Which issue for this worklog?",
        choices: issues.map((i) => ({
          name: `${i.key}  ${i.fields.status?.name ?? ""}  ${i.fields.summary.slice(0, 72)}`,
          value: i.key,
        })),
      },
    ]);
    const hit = issues.find((i) => i.key === choice);
    return hit ?? (await jiraGetIssue(creds, choice));
  } finally {
    spin.stop();
  }
}

async function resolveIssueForLogHours(
  creds: ResolvedCredentials,
  accountId: string,
  text: string,
  plan: Plan,
  ctx: WorkContext,
): Promise<JiraIssue> {
  const cands = uniqueTicketCandidates(text, plan, ctx);
  const myWork = wantsLogHoursOnMyTicketsPhrase(text);
  const listOpts = { alwaysList: myWork };
  if (cands.length) {
    return resolveIssueInteractive(creds, cands);
  }
  return pickIssueFromAssigned(creds, accountId, listOpts);
}

function parseHoursFromUserText(text: string): { hours?: number; ambiguous: boolean } {
  if (/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i.test(text)) {
    return { ambiguous: true };
  }
  if (/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*h\b/i.test(text)) {
    return { ambiguous: true };
  }
  const mH = text.match(/(\d+(?:\.\d+)?)\s*h(?:\b|ours?\b)/i);
  if (mH) return { hours: Number.parseFloat(mH[1]), ambiguous: false };
  const mHr = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  if (mHr) return { hours: Number.parseFloat(mHr[1]), ambiguous: false };
  return { ambiguous: false };
}

async function clarifyPlanIfNeeded(
  text: string,
  ctx: WorkContext,
  plan: Plan,
): Promise<{ plan: Plan; text: string }> {
  if (plan.intent !== "unknown") return { plan, text };
  const r = rescueUnknownPlan(text, ctx);
  if (r && r.intent !== "unknown") return { plan: r, text };
  const { description } = await inquirer.prompt<{ description: string }>([
    {
      type: "input",
      name: "description",
      message:
        "Could not understand — say what you want in plain language (e.g. log 7h on ABC-123, or list my tickets)",
    },
  ]);
  const extra = description.trim();
  if (!extra) return { plan, text };
  const merged = [text.trim(), extra].filter(Boolean).join("\n");
  const spin = ora("Re-planning…").start();
  let replanned: Plan;
  try {
    replanned = await planFromUserText(merged, ctx);
  } catch (e) {
    spin.fail("ZeroClaw failed — check `zeroclaw` models config.");
    throw e;
  }
  spin.stop();
  const r2 = rescueUnknownPlan(merged, ctx);
  if (replanned.intent !== "unknown") return { plan: replanned, text: merged };
  if (r2 && r2.intent !== "unknown") return { plan: { ...replanned, ...r2 }, text: merged };
  return { plan: replanned, text: merged };
}

async function confirmWorklog(opts: {
  ticketKey: string;
  issueTitle?: string;
  hours: number;
  summary: string;
}): Promise<boolean> {
  const ticketLine =
    opts.issueTitle != null && opts.issueTitle.length > 0
      ? `${opts.ticketKey} — ${opts.issueTitle}`
      : opts.ticketKey;
  console.log(chalk.cyan(`Ticket: ${ticketLine}`));
  console.log(chalk.cyan(`Hours: ${opts.hours}h`));
  console.log("");
  console.log(chalk.bold("Summary:"));
  console.log(opts.summary);
  console.log("");
  const { ok } = await inquirer.prompt<{ ok: boolean }>([
    { type: "confirm", name: "ok", message: "Proceed?", default: false },
  ]);
  return ok;
}

export async function flowLogHoursInteractive(cwd: string): Promise<void> {
  const creds = resolveCredentials();
  const ctx = collectWorkContext(cwd);
  const spin = ora("Loading Jira…").start();
  const me = await jiraMyself(creds);
  spin.text = "Suggesting ticket…";
  const summaryAi = await summarizeWorkContext(ctx);
  spin.stop();
  const ticketDefault = ctx.inferredTickets[0];
  const { ticketKey } = await inquirer.prompt<{ ticketKey: string }>([
    {
      type: "input",
      name: "ticketKey",
      message: "Jira ticket key",
      default: ticketDefault,
    },
  ]);
  const issue = await resolveIssueInteractive(creds, [ticketKey.trim()]);
  const resolvedKey = issue.key;
  const avg = averageHoursForTicket(resolvedKey);
  const { hoursRaw } = await inquirer.prompt<{ hoursRaw: string }>([
    {
      type: "input",
      name: "hoursRaw",
      message: "Hours (e.g. 7 or 7h)",
      default: avg != null ? String(avg) : "8",
    },
  ]);
  const hours = parseHours(hoursRaw);
  const summary =
    summaryAi ||
    (await summarizeWorkContext({
      ...ctx,
      inferredTickets: [resolvedKey, ...ctx.inferredTickets],
    }));
  console.log(chalk.green("\nAI Generated Summary:"));
  console.log(summary);
  const ok = await confirmWorklog({
    ticketKey: resolvedKey,
    issueTitle: issue.fields.summary,
    hours,
    summary,
  });
  if (!ok) {
    console.log(chalk.yellow("Aborted."));
    return;
  }
  const seconds = Math.round(hours * 3600);
  await tempoCreateWorklog(creds, {
    issueId: Number(issue.id),
    authorAccountId: me.accountId,
    timeSpentSeconds: seconds,
    startDate: todayIso(),
    description: tempoWorklogDescription(resolvedKey),
  });
  recordTicketUsage(resolvedKey, ctx.repoName);
  recordWorklogMemory(resolvedKey, ctx.repoName, hours, summary);
  console.log(chalk.green("Worklog created."));
}

export async function flowCreateTicketInteractive(cwd: string): Promise<void> {
  const creds = resolveCredentials();
  const { projectKey, summary, description } = await inquirer.prompt<{
    projectKey: string;
    summary: string;
    description: string;
  }>([
    { type: "input", name: "projectKey", message: "Project key", default: "DEV" },
    { type: "input", name: "summary", message: "Summary" },
    { type: "input", name: "description", message: "Description (optional)", default: "" },
  ]);
  const created = await jiraCreateIssue(creds, {
    projectKey,
    summary,
    description: description || undefined,
  });
  console.log(chalk.green(`Created ${created.key} — ${summary}`));
  const ctx = collectWorkContext(cwd);
  recordTicketUsage(created.key, ctx.repoName);
}

export async function flowUpdateTicketInteractive(): Promise<void> {
  const creds = resolveCredentials();
  const { ticketKey, status } = await inquirer.prompt<{ ticketKey: string; status: string }>([
    { type: "input", name: "ticketKey", message: "Ticket key" },
    { type: "input", name: "status", message: "Target status name" },
  ]);
  await jiraTransitionToStatusName(creds, ticketKey, status);
  console.log(chalk.green("Updated."));
}

export async function flowShowTodayLogs(): Promise<void> {
  const creds = resolveCredentials();
  const me = await jiraMyself(creds);
  const day = todayIso();
  const logs = await tempoListWorklogsForUserRange(creds, me.accountId, day, day);
  if (!logs.length) {
    console.log(chalk.yellow("No Tempo worklogs for today."));
    return;
  }
  const idToKey = new Map<number, string>();
  const keyToSummary = new Map<string, string>();
  for (const w of logs) {
    const nid = tempoWorklogIssueNumericId(w);
    const k = w.issue?.key;
    if (nid != null && k && !/^\d+$/.test(k)) idToKey.set(nid, k);
  }
  const idsMissingKey = [
    ...new Set(
      logs
        .map(tempoWorklogIssueNumericId)
        .filter((id): id is number => id != null)
        .filter((id) => !idToKey.has(id)),
    ),
  ];
  await Promise.all(
    idsMissingKey.map(async (id) => {
      const issue = await jiraGetIssue(creds, String(id));
      idToKey.set(id, issue.key);
      keyToSummary.set(issue.key, issue.fields.summary);
      keyToSummary.set(String(id), issue.fields.summary);
    }),
  );
  const rows: { key: string; h: string; desc: string }[] = [];
  for (const w of logs) {
    const h = (w.timeSpentSeconds / 3600).toFixed(2);
    const nid = tempoWorklogIssueNumericId(w);
    const fromIssue = w.issue?.key;
    const fromMap = nid != null ? idToKey.get(nid) : undefined;
    const fromDesc = w.description ? extractJiraKeys(w.description)[0] : undefined;
    const key =
      [fromIssue, fromMap, fromDesc].find((x) => x && !/^\d+$/.test(x)) ??
      fromIssue ??
      fromMap ??
      fromDesc ??
      (nid != null ? String(nid) : "?");
    rows.push({ key, h, desc: w.description ?? "" });
  }
  const keysNeedingSummary = [...new Set(rows.map((r) => r.key))].filter(
    (k) => k !== "?" && !keyToSummary.has(k),
  );
  await Promise.all(
    keysNeedingSummary.map(async (k) => {
      try {
        const issue = await jiraGetIssue(creds, k);
        keyToSummary.set(k, issue.fields.summary);
        keyToSummary.set(issue.key, issue.fields.summary);
      } catch {
        keyToSummary.set(k, "");
      }
    }),
  );
  console.log(chalk.bold(`Worklogs ${day}`));
  for (const { key, h, desc } of rows) {
    const title = key !== "?" ? (keyToSummary.get(key) ?? "") : "";
    const label = title ? `${key} — ${title}` : key;
    console.log(`${chalk.cyan(label)}  ${h}h  ${desc}`);
  }
}

export async function flowNlCommand(cwd: string, text: string): Promise<void> {
  const creds = resolveCredentials();
  const ctx = collectWorkContext(cwd);
  const spin = ora("ZeroClaw planning…").start();
  let plan;
  try {
    plan = await planFromUserText(text, ctx);
  } catch (e) {
    spin.fail("ZeroClaw failed — check `zeroclaw` models config.");
    throw e;
  }
  spin.stop();
  const clarified = await clarifyPlanIfNeeded(text, ctx, plan);
  plan = clarified.plan;
  text = clarified.text;
  if (intentUsesNlSlots(plan.intent)) {
    const slotSpin = ora("Resolving ticket and hours…").start();
    try {
      const slots = await extractNlSlots(text, ctx);
      plan = mergeNlSlotsIntoPlan(plan, slots);
    } catch {
      // keep plan if ZeroClaw fails
    } finally {
      slotSpin.stop();
    }
  }
  const listUnderSteer = planListTicketsUnderFromUserPhrase(text);
  if (listUnderSteer) plan = listUnderSteer;
  if (plan.intent === "unknown") {
    console.log(chalk.yellow("Nothing to do."));
    return;
  }
  if (plan.intent === "summarize_work") {
    console.log(chalk.cyan(await summarizeWorkContext(ctx)));
    return;
  }
  if (plan.intent === "show_today_logs") {
    await flowShowTodayLogs();
    return;
  }
  if (plan.intent === "list_my_tickets") {
    await flowAssignedTickets();
    return;
  }
  if (plan.intent === "list_tickets_under") {
    const raw =
      extractIssueKeyAfterUnder(text) ?? extractJiraKeys(text)[0] ?? plan.ticketKey?.trim();
    const key = raw?.toUpperCase();
    if (!key) {
      console.log(chalk.yellow("Need a parent or epic key (e.g. DIOL-3)."));
      return;
    }
    let issues = await jiraSearchJql(
      creds,
      `parent = ${key} ORDER BY updated DESC`,
      50,
    );
    if (!issues.length) {
      try {
        issues = await jiraSearchJql(
          creds,
          `"Epic Link" = ${key} ORDER BY updated DESC`,
          50,
        );
      } catch {
        issues = [];
      }
    }
    if (!issues.length) {
      console.log(chalk.yellow(`No issues found under ${key} (tried parent and Epic Link).`));
      return;
    }
    console.log(chalk.bold(`Under ${key}:`));
    for (const i of issues) {
      const st = i.fields.status?.name ?? "";
      console.log(`${chalk.cyan(i.key)}  ${st}  ${i.fields.summary}`);
    }
    return;
  }
  if (plan.intent === "create_ticket") {
    const keys = extractJiraKeys(text);
    const summary =
      plan.summary ??
      (text.replace(/create\s+jira\s+\w+\s+for/gi, "").trim() || "New task");
    const projectGuess = plan.projectKey ?? keys[0]?.split("-")[0] ?? "DEV";
    const created = await jiraCreateIssue(creds, {
      projectKey: projectGuess,
      summary,
      issueTypeName: plan.issueType,
    });
    console.log(chalk.green(`Created ${created.key} — ${summary}`));
    recordTicketUsage(created.key, ctx.repoName);
    return;
  }
  if (plan.intent === "update_ticket") {
    const st = plan.newStatus ?? "In Progress";
    const issue = await resolveIssueInteractive(creds, uniqueTicketCandidates(text, plan, ctx));
    let targetStatus = st;
    try {
      await jiraTransitionToStatusName(creds, issue.key, targetStatus);
    } catch (e) {
      console.log(chalk.yellow((e as Error).message));
      const { statusRetry } = await inquirer.prompt<{ statusRetry: string }>([
        {
          type: "input",
          name: "statusRetry",
          message: "Target status name?",
          default: targetStatus,
        },
      ]);
      targetStatus = statusRetry.trim() || targetStatus;
      await jiraTransitionToStatusName(creds, issue.key, targetStatus);
    }
    console.log(chalk.green(`Updated ${issue.key} — ${issue.fields.summary} → ${targetStatus}`));
    return;
  }
  if (plan.intent === "log_hours") {
    const me = await jiraMyself(creds);
    const issue = await resolveIssueForLogHours(creds, me.accountId, text, plan, ctx);
    const key = issue.key;
    const hourInf = parseHoursFromUserText(text);
    let hours =
      plan.hours ?? averageHoursForTicket(key) ?? (hourInf.ambiguous ? undefined : hourInf.hours);
    const askHours =
      plan.hours == null &&
      (hourInf.ambiguous || wantsLogHoursOnMyTicketsPhrase(text) || hours == null);
    if (askHours) {
      const def =
        hours != null && !Number.isNaN(hours) ? String(hours) : averageHoursForTicket(key) ?? "8";
      const { hoursRaw } = await inquirer.prompt<{ hoursRaw: string }>([
        { type: "input", name: "hoursRaw", message: "How many hours?", default: def },
      ]);
      hours = parseHours(hoursRaw);
    }
    if (hours == null || Number.isNaN(hours) || hours <= 0) hours = 8;
    const summary =
      plan.summary ??
      (await summarizeWorkContext({ ...ctx, inferredTickets: [key, ...ctx.inferredTickets] }));
    console.log(chalk.gray(`Ticket: ${key} — ${issue.fields.summary}`));
    console.log(chalk.gray(`Repo: ${ctx.repoName}`));
    console.log(chalk.green("\nAI Generated Summary:"));
    console.log(summary);
    console.log(chalk.green(`\nSuggested Hours: ${hours}h`));
    const ok = await confirmWorklog({
      ticketKey: key,
      issueTitle: issue.fields.summary,
      hours,
      summary,
    });
    if (!ok) {
      console.log(chalk.yellow("Aborted."));
      return;
    }
    try {
      await tempoCreateWorklog(creds, {
        issueId: Number(issue.id),
        authorAccountId: me.accountId,
        timeSpentSeconds: Math.round(hours * 3600),
        startDate: todayIso(),
        description: tempoWorklogDescription(key),
      });
    } catch (e) {
      console.log(chalk.red((e as Error).message));
      const { retry } = await inquirer.prompt<{ retry: boolean }>([
        { type: "confirm", name: "retry", message: "Retry worklog?", default: true },
      ]);
      if (!retry) return;
      await tempoCreateWorklog(creds, {
        issueId: Number(issue.id),
        authorAccountId: me.accountId,
        timeSpentSeconds: Math.round(hours * 3600),
        startDate: todayIso(),
        description: tempoWorklogDescription(key),
      });
    }
    recordTicketUsage(key, ctx.repoName);
    recordWorklogMemory(key, ctx.repoName, hours, summary);
    console.log(chalk.green("Worklog created."));
    return;
  }
  console.log(chalk.yellow(`Unsupported intent: ${plan.intent}`));
}

export async function flowAssignedTickets(): Promise<void> {
  const creds = resolveCredentials();
  const me = await jiraMyself(creds);
  const issues = await jiraAssignedOpen(creds, me.accountId);
  if (!issues.length) {
    console.log(chalk.yellow("No assigned issues."));
    return;
  }
  for (const i of issues) {
    const st = i.fields.status?.name ?? "";
    console.log(`${chalk.cyan(i.key)}  ${st}  ${i.fields.summary}`);
  }
}

export async function flowSearchJql(jql: string): Promise<void> {
  const creds = resolveCredentials();
  const issues = await jiraSearchJql(creds, jql, 20);
  for (const i of issues) {
    console.log(`${chalk.cyan(i.key)}  ${i.fields.summary}`);
  }
}
