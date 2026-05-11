import { homedir } from "node:os";
import { join } from "node:path";

export const JIRACLAW_DIR = join(homedir(), ".jiraclaw");
export const JIRACLAW_DB = join(JIRACLAW_DIR, "memory.sqlite");
export const JIRACLAW_CONFIG = join(JIRACLAW_DIR, "config.json");
export const JIRACLAW_SECRETS = join(JIRACLAW_DIR, "secrets.enc");
