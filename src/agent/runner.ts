import type { WorkContext } from "../tracking/collect.js";
import { safeParsePlan } from "./fallback-plan.js";
import { runZeroclawAgent } from "./zeroclaw.js";
import type { Plan } from "./plan-schema.js";

const PLAN_INSTRUCTION = `You are clawj planner. Output ONLY valid JSON (no prose) with keys:
intent: one of log_hours|create_ticket|update_ticket|show_today_logs|list_my_tickets|list_tickets_under|summarize_work|unknown
ticketKey: optional Jira key PROJ-123 — uppercase project prefix and digits after hyphen. If the user writes diol 5, diol-5, or similar, normalize to DIOL-5. Omit if they name no issue.
hours: optional number
summary: optional short work summary
projectKey: optional Jira project key for new tickets
newStatus: optional Jira status name for updates
issueType: optional e.g. Task, Bug`;

export async function planFromUserText(userText: string, ctx: WorkContext): Promise<Plan> {
  const blob = [
    `User command: ${userText}`,
    `cwd: ${ctx.cwd}`,
    `repo: ${ctx.repoName}`,
    `branch: ${ctx.gitBranch ?? "n/a"}`,
    `commits: ${ctx.commits.join(" | ")}`,
    `modified: ${ctx.modifiedFiles.slice(0, 20).join(", ")}`,
    `inferredTickets: ${ctx.inferredTickets.join(", ")}`,
  ].join("\n");
  const raw = await runZeroclawAgent(`${PLAN_INSTRUCTION}\n\n${blob}`);
  return safeParsePlan(raw, userText, ctx);
}

export async function summarizeWorkContext(ctx: WorkContext): Promise<string> {
  const prompt = `Write one concise professional sentence (max 240 chars) summarizing likely work done from this context. No quotes in output.
Repo: ${ctx.repoName}
Branch: ${ctx.gitBranch ?? ""}
Commits: ${ctx.commits.join(" | ")}
Changed files: ${ctx.modifiedFiles.slice(0, 15).join(", ")}`;
  const t = await runZeroclawAgent(prompt);
  return t.replace(/\s+/g, " ").trim().slice(0, 280);
}
