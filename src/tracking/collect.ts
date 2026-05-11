import { collectGit, tryReadVsCodeWorkspaceFolders } from "./git.js";
import { extractJiraKeys } from "../utils/jira-ticket-regex.js";
import { suggestTickets } from "../memory/store.js";

export type WorkContext = {
  cwd: string;
  repoName: string;
  gitBranch: string | null;
  commits: string[];
  modifiedFiles: string[];
  vscodeFolders: string[];
  inferredTickets: string[];
  memorySuggestions: string[];
};

function repoNameFromPath(cwd: string): string {
  const parts = cwd.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

export function collectWorkContext(cwd: string): WorkContext {
  const git = collectGit(cwd);
  const vscodeFolders = tryReadVsCodeWorkspaceFolders();
  const blob = [git.branch, ...git.recentCommits, ...git.modifiedFiles].join("\n");
  const fromGit = extractJiraKeys(blob);
  const repo = repoNameFromPath(cwd);
  const memorySuggestions = suggestTickets(repo, 5);
  const inferredTickets = [...new Set([...fromGit, ...memorySuggestions])];
  return {
    cwd,
    repoName: repo,
    gitBranch: git.branch,
    commits: git.recentCommits,
    modifiedFiles: git.modifiedFiles,
    vscodeFolders,
    inferredTickets,
    memorySuggestions,
  };
}
