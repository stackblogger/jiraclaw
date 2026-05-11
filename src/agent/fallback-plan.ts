import { parsePlanJson, type Plan } from "./plan-schema.js";
import type { WorkContext } from "../tracking/collect.js";
import { extractIssueKeyAfterUnder, extractJiraKeys } from "../utils/jira-ticket-regex.js";

const MY_WORK_ITEMS = /\b(tickets?|issues?|tasks?)\b/;

export function wantsMyTicketListPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  if (!lower.includes("my")) return false;
  const hasTickets = MY_WORK_ITEMS.test(lower);
  if (!hasTickets) return false;
  return (
    /\b(show|get|list|display|fetch|see|view)\b/.test(lower) ||
    (lower.includes("assigned") && (lower.includes("show") || lower.includes("get") || lower.includes("list")))
  );
}

function wantsListTicketsUnderParent(userText: string): boolean {
  return /\b(tickets?|issues?|tasks?)\s+under\b/i.test(userText);
}

function parentKeyForListUnder(userText: string): string | undefined {
  return extractIssueKeyAfterUnder(userText) ?? extractJiraKeys(userText)[0];
}

export function planListTicketsUnderFromUserPhrase(userText: string): Plan | null {
  if (!wantsListTicketsUnderParent(userText)) return null;
  const ticketKey = parentKeyForListUnder(userText);
  if (!ticketKey) return null;
  return { intent: "list_tickets_under", ticketKey };
}

export function wantsLogHoursOnMyTicketsPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  if (!lower.includes("my")) return false;
  if (!MY_WORK_ITEMS.test(lower)) return false;
  const timeLike =
    /\b(hour|hours|hrs?|tempo|time|worklog)\b/.test(lower) ||
    /\d+(?:\.\d+)?\s*h\b/i.test(text) ||
    /\b(log|record)\s+(time|hours)\b/.test(lower);
  const addWithNumber = /\b(add|put)\b/.test(lower) && /\d/.test(text);
  return timeLike || addWithNumber;
}

export function rescueUnknownPlan(userText: string, ctx: WorkContext): Plan | null {
  const lower = userText.toLowerCase();
  const keys = extractJiraKeys(userText);
  if (wantsListTicketsUnderParent(userText)) {
    const ticketKey = parentKeyForListUnder(userText);
    if (ticketKey) return { intent: "list_tickets_under", ticketKey };
  }
  if (wantsMyTicketListPhrase(userText)) return { intent: "list_my_tickets" };
  if (wantsLogHoursOnMyTicketsPhrase(userText)) {
    return { intent: "log_hours", ticketKey: keys[0], hours: undefined };
  }
  if (/\b(tempo|worklog)\b/.test(lower) && /\b(hour|hours|hrs?|\d+\s*h)\b/i.test(userText)) {
    return { intent: "log_hours", ticketKey: keys[0] ?? ctx.inferredTickets[0], hours: undefined };
  }
  if (/\b(log|record)\s+(time|hours)\b/.test(lower)) {
    return { intent: "log_hours", ticketKey: keys[0] ?? ctx.inferredTickets[0], hours: undefined };
  }
  return null;
}

export function fallbackPlan(userText: string, ctx: WorkContext): Plan {
  const lower = userText.toLowerCase();
  const keys = extractJiraKeys(userText);
  if (wantsListTicketsUnderParent(userText)) {
    const ticketKey = parentKeyForListUnder(userText);
    if (ticketKey) return { intent: "list_tickets_under", ticketKey };
  }
  if (wantsMyTicketListPhrase(userText)) {
    return { intent: "list_my_tickets" };
  }
  if (wantsLogHoursOnMyTicketsPhrase(userText) && !keys.length) {
    return { intent: "log_hours", ticketKey: undefined, hours: undefined };
  }
  if (lower.includes("today") && (lower.includes("log") || lower.includes("tempo"))) {
    return {
      intent: "log_hours",
      ticketKey: keys[0] ?? ctx.inferredTickets[0],
      hours: undefined,
    };
  }
  if (lower.includes("create") && lower.includes("jira")) {
    return {
      intent: "create_ticket",
      projectKey: undefined,
      summary: userText,
    };
  }
  if (keys.length && (lower.includes("progress") || lower.includes("status") || lower.includes("update"))) {
    const m = userText.match(/status\s+to\s+(.+)/i);
    return {
      intent: "update_ticket",
      ticketKey: keys[0],
      newStatus: m?.[1]?.trim() ?? "In Progress",
    };
  }
  return { intent: "unknown" };
}

export function safeParsePlan(raw: string, userText: string, ctx: WorkContext): Plan {
  try {
    return parsePlanJson(raw);
  } catch {
    return fallbackPlan(userText, ctx);
  }
}
