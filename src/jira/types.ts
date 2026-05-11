export type JiraMyself = {
  accountId: string;
  displayName?: string;
  emailAddress?: string;
};

export type JiraIssueFields = {
  summary: string;
  status?: { name: string };
  project?: { key: string };
};

export type JiraIssue = {
  id: string;
  key: string;
  fields: JiraIssueFields;
};

export type JiraCreateIssueInput = {
  projectKey: string;
  summary: string;
  description?: string;
  issueTypeName?: string;
};
