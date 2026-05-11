export const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

export function extractJiraKeys(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(JIRA_KEY_RE.source, "g"))) {
    const k = m[1];
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

export function extractIssueKeyAfterUnder(text: string): string | undefined {
  const m = text.match(/\bunder\s+(?:the\s+)?([A-Za-z][A-Za-z0-9]*)[-\s]+(\d+)\b/i);
  if (!m) return undefined;
  return `${m[1].toUpperCase()}-${m[2]}`;
}
