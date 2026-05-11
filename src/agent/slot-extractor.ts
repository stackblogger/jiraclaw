import { z } from "zod";
import type { WorkContext } from "../tracking/collect.js";
import { runZeroclawAgent } from "./zeroclaw.js";
import type { Plan } from "./plan-schema.js";

const SlotSchema = z.object({
  ticketKey: z.string().optional(),
  hours: z.number().optional(),
});

export type NlSlots = z.infer<typeof SlotSchema>;

const SLOT_INSTRUCTION = `You extract Jira worklog slots from the user message. Output ONLY valid JSON (no prose) with keys:
ticketKey: optional string — the ONE Jira issue key the user wants to act on, normalized as PROJ-123 (uppercase letters/digits before hyphen, digits after). Map informal refs: "diol 5", "diol-5", "proj 12" -> DIOL-5, PROJ-12. Omit this key entirely if the user names no specific issue.
hours: optional positive number — hours of work if the user stated a duration (e.g. 7h, 7 hrs, 7.5 hours). Omit if unclear.`;

function parseSlotJson(raw: string): NlSlots {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const slice = fence?.[1]?.trim() ?? raw.trim();
  const start = slice.indexOf("{");
  const end = slice.lastIndexOf("}");
  const json = start >= 0 && end > start ? slice.slice(start, end + 1) : slice;
  const parsed = JSON.parse(json) as unknown;
  return SlotSchema.parse(parsed);
}

export async function extractNlSlots(userText: string, ctx: WorkContext): Promise<NlSlots> {
  const blob = [
    `User message: ${userText}`,
    `branch: ${ctx.gitBranch ?? "n/a"}`,
    `inferredTickets (git hints only, do not invent keys from them): ${ctx.inferredTickets.join(", ") || "none"}`,
  ].join("\n");
  const raw = await runZeroclawAgent(`${SLOT_INSTRUCTION}\n\n${blob}`);
  try {
    return parseSlotJson(raw);
  } catch {
    return {};
  }
}

export function mergeNlSlotsIntoPlan(plan: Plan, slots: NlSlots): Plan {
  const next: Plan = { ...plan };
  const tk = slots.ticketKey?.trim();
  if (tk) {
    const compact = tk.replace(/\s+/g, "-").replace(/-+/g, "-");
    const m = compact.match(/^([A-Za-z0-9]+)-(\d+)$/);
    next.ticketKey = m ? `${m[1].toUpperCase()}-${m[2]}` : compact.toUpperCase();
  }
  if (slots.hours != null && Number.isFinite(slots.hours) && slots.hours > 0) {
    next.hours = slots.hours;
  }
  return next;
}

export function intentUsesNlSlots(intent: Plan["intent"]): boolean {
  return intent === "log_hours" || intent === "update_ticket" || intent === "list_tickets_under";
}
