import { homedir } from "node:os";
import { join } from "node:path";

export const CLAWJ_DIR = join(homedir(), ".clawj");
export const CLAWJ_DB = join(CLAWJ_DIR, "memory.sqlite");
export const CLAWJ_CONFIG = join(CLAWJ_DIR, "config.json");
export const CLAWJ_SECRETS = join(CLAWJ_DIR, "secrets.enc");
