import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { CLAWJ_DB } from "../utils/paths.js";

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const dir = dirname(CLAWJ_DB);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(CLAWJ_DB);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_usage (
      ticket_key TEXT NOT NULL,
      repo TEXT,
      hits INTEGER NOT NULL DEFAULT 1,
      last_used TEXT NOT NULL,
      PRIMARY KEY (ticket_key, repo)
    );
    CREATE TABLE IF NOT EXISTS worklog_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_key TEXT NOT NULL,
      repo TEXT,
      hours REAL NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prefs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export function recordTicketUsage(ticketKey: string, repo: string | null): void {
  const d = getDb();
  const now = new Date().toISOString();
  const st = d.prepare(
    `INSERT INTO ticket_usage (ticket_key, repo, hits, last_used)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(ticket_key, repo) DO UPDATE SET hits = hits + 1, last_used = excluded.last_used`,
  );
  st.run(ticketKey, repo ?? "", now);
}

export function recordWorklogMemory(
  ticketKey: string,
  repo: string | null,
  hours: number,
  summary: string,
): void {
  const d = getDb();
  const st = d.prepare(
    `INSERT INTO worklog_memory (ticket_key, repo, hours, summary, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  st.run(ticketKey, repo ?? "", hours, summary, new Date().toISOString());
}

export function suggestTickets(repo: string | null, limit = 5): string[] {
  const d = getDb();
  if (repo) {
    const rows = d
      .prepare(
        `SELECT ticket_key FROM ticket_usage WHERE repo = ? ORDER BY hits DESC, last_used DESC LIMIT ?`,
      )
      .all(repo, limit) as { ticket_key: string }[];
    return rows.map((r) => r.ticket_key);
  }
  const rows = d
    .prepare(
      `SELECT ticket_key, SUM(hits) as s FROM ticket_usage GROUP BY ticket_key ORDER BY s DESC LIMIT ?`,
    )
    .all(limit) as { ticket_key: string }[];
  return rows.map((r) => r.ticket_key);
}

export function averageHoursForTicket(ticketKey: string): number | null {
  const d = getDb();
  const row = d
    .prepare(`SELECT AVG(hours) as a FROM worklog_memory WHERE ticket_key = ?`)
    .get(ticketKey) as { a: number | null };
  if (row?.a == null || Number.isNaN(row.a)) return null;
  return Math.round(row.a * 10) / 10;
}

export function setPref(key: string, value: string): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function getPref(key: string): string | null {
  const d = getDb();
  const row = d.prepare(`SELECT value FROM prefs WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}
