import { z } from "zod";

export const PlanSchema = z.object({
  intent: z.enum([
    "log_hours",
    "create_ticket",
    "update_ticket",
    "show_today_logs",
    "list_my_tickets",
    "list_tickets_under",
    "summarize_work",
    "unknown",
  ]),
  ticketKey: z.string().optional(),
  hours: z.number().optional(),
  summary: z.string().optional(),
  projectKey: z.string().optional(),
  newStatus: z.string().optional(),
  issueType: z.string().optional(),
});

export type Plan = z.infer<typeof PlanSchema>;

export function parsePlanJson(text: string): Plan {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const slice = fence?.[1]?.trim() ?? text.trim();
  const start = slice.indexOf("{");
  const end = slice.lastIndexOf("}");
  const json = start >= 0 && end > start ? slice.slice(start, end + 1) : slice;
  const raw = JSON.parse(json) as unknown;
  return PlanSchema.parse(raw);
}
