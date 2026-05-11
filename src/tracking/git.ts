import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type GitSnapshot = {
  branch: string | null;
  recentCommits: string[];
  modifiedFiles: string[];
};

function runGit(cwd: string, args: string): string {
  try {
    return execSync(`git ${args}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

export function collectGit(cwd: string): GitSnapshot {
  if (!existsSync(join(cwd, ".git"))) {
    return { branch: null, recentCommits: [], modifiedFiles: [] };
  }
  const branch = runGit(cwd, "rev-parse --abbrev-ref HEAD").trim() || null;
  const log = runGit(cwd, 'log -5 --pretty=%s');
  const recentCommits = log
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const status = runGit(cwd, "status --porcelain");
  const modifiedFiles = status
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
  return { branch, recentCommits, modifiedFiles };
}

export function tryReadVsCodeWorkspaceFolders(): string[] {
  const raw = process.env.VSCODE_IPC_HOOK_CLI;
  if (!raw) return [];
  const candidates = [
    join(process.cwd(), ".vscode", "settings.json"),
    join(process.cwd(), "workspace.json"),
  ];
  const out: string[] = [];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const j = JSON.parse(readFileSync(p, "utf8")) as { folders?: { path: string }[] };
        for (const f of j.folders ?? []) {
          if (f.path) out.push(f.path);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}
