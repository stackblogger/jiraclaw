import type { JiraCreateIssueInput, JiraIssue, JiraMyself } from "./types.js";
import type { ResolvedCredentials } from "../config/types.js";

function authHeader(creds: ResolvedCredentials): string {
  const raw = `${creds.jiraEmail}:${creds.jiraApiToken}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

async function jiraFetch<T>(
  creds: ResolvedCredentials,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${creds.jiraBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(creds),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Jira ${res.status}: ${t.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

export async function jiraMyself(creds: ResolvedCredentials): Promise<JiraMyself> {
  return jiraFetch<JiraMyself>(creds, "/rest/api/3/myself");
}

export async function jiraGetIssue(
  creds: ResolvedCredentials,
  issueKey: string,
): Promise<JiraIssue> {
  return jiraFetch<JiraIssue>(creds, `/rest/api/3/issue/${encodeURIComponent(issueKey)}`);
}

export async function jiraSearchJql(
  creds: ResolvedCredentials,
  jql: string,
  maxResults = 50,
): Promise<JiraIssue[]> {
  const body = {
    jql,
    maxResults,
    fields: ["summary", "status", "project"],
  };
  const data = await jiraFetch<{ issues: JiraIssue[] }>(creds, "/rest/api/3/search/jql", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.issues ?? [];
}

export async function jiraCreateIssue(
  creds: ResolvedCredentials,
  input: JiraCreateIssueInput,
): Promise<{ key: string; id: string }> {
  const issueType = input.issueTypeName ?? "Task";
  const fields: Record<string, unknown> = {
    project: { key: input.projectKey },
    summary: input.summary,
    issuetype: { name: issueType },
  };
  if (input.description) {
    fields.description = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: input.description }],
        },
      ],
    };
  }
  const body = { fields };
  const data = await jiraFetch<{ key: string; id: string }>(creds, "/rest/api/3/issue", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data;
}

export async function jiraTransitionToStatusName(
  creds: ResolvedCredentials,
  issueKey: string,
  statusName: string,
): Promise<void> {
  const trans = await jiraFetch<{ transitions: { id: string; name: string }[] }>(
    creds,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions?expand=transitions.fields`,
  );
  const match = trans.transitions.find(
    (t) => t.name.toLowerCase() === statusName.toLowerCase(),
  );
  if (!match) {
    throw new Error(`No transition found to status "${statusName}"`);
  }
  await jiraFetch(creds, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: match.id } }),
  });
}

export async function jiraAssignedOpen(creds: ResolvedCredentials, accountId: string) {
  const jql = `assignee = ${JSON.stringify(accountId)} AND resolution = Unresolved ORDER BY updated DESC`;
  return jiraSearchJql(creds, jql, 30);
}
