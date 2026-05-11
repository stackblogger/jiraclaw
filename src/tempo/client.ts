import type { ResolvedCredentials } from "../config/types.js";

export type TempoWorklogInput = {
  issueId: number;
  authorAccountId: string;
  timeSpentSeconds: number;
  startDate: string;
  description: string;
};

export type TempoWorklog = {
  tempoWorklogId: number;
  issue?: { id?: number | string; key?: string };
  issueId?: number | string;
  timeSpentSeconds: number;
  startDate: string;
  description?: string;
};

export function tempoWorklogIssueNumericId(w: TempoWorklog): number | undefined {
  const raw = w.issue?.id ?? w.issueId;
  if (raw == null) return undefined;
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

async function tempoFetch<T>(
  creds: ResolvedCredentials,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${creds.tempoBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.tempoApiToken}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Tempo ${res.status}: ${t.slice(0, 500)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function tempoCreateWorklog(
  creds: ResolvedCredentials,
  input: TempoWorklogInput,
): Promise<TempoWorklog> {
  return tempoFetch<TempoWorklog>(creds, "/worklogs", {
    method: "POST",
    body: JSON.stringify({
      issueId: input.issueId,
      timeSpentSeconds: input.timeSpentSeconds,
      startDate: input.startDate,
      description: input.description,
      authorAccountId: input.authorAccountId,
    }),
  });
}

export async function tempoListWorklogsForUserRange(
  creds: ResolvedCredentials,
  accountId: string,
  from: string,
  to: string,
): Promise<TempoWorklog[]> {
  const qs = new URLSearchParams({ from, to });
  const path = `/worklogs/user/${encodeURIComponent(accountId)}?${qs.toString()}`;
  const data = await tempoFetch<{ results?: TempoWorklog[] } | TempoWorklog[]>(creds, path);
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}
