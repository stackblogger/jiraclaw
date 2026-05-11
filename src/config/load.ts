import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { CLAWJ_CONFIG, CLAWJ_DIR, CLAWJ_SECRETS } from "../utils/paths.js";
import { AppConfigSchema, type AppConfig, type ResolvedCredentials } from "./types.js";
import { decryptSecret, encryptSecret } from "../utils/crypto-secret.js";

const SecretsJsonSchema = z.object({
  jiraApiToken: z.string().optional(),
  tempoApiToken: z.string().optional(),
});

export function ensureClawjDir(): void {
  if (!existsSync(CLAWJ_DIR)) mkdirSync(CLAWJ_DIR, { recursive: true });
}

export function loadAppConfig(): AppConfig {
  ensureClawjDir();
  if (!existsSync(CLAWJ_CONFIG)) return AppConfigSchema.parse({});
  const raw = JSON.parse(readFileSync(CLAWJ_CONFIG, "utf8"));
  return AppConfigSchema.parse(raw);
}

export function saveAppConfig(cfg: AppConfig): void {
  ensureClawjDir();
  writeFileSync(CLAWJ_CONFIG, JSON.stringify(cfg, null, 2), "utf8");
}

export function loadSecretsFromDisk(passphrase: string): z.infer<typeof SecretsJsonSchema> {
  if (!existsSync(CLAWJ_SECRETS)) return {};
  const dec = decryptSecret(readFileSync(CLAWJ_SECRETS, "utf8"), passphrase);
  return SecretsJsonSchema.parse(JSON.parse(dec));
}

export function saveSecretsToDisk(
  passphrase: string,
  secrets: z.infer<typeof SecretsJsonSchema>,
): void {
  ensureClawjDir();
  const json = JSON.stringify(secrets);
  writeFileSync(CLAWJ_SECRETS, encryptSecret(json, passphrase), "utf8");
}

export function resolveCredentials(): ResolvedCredentials {
  const cfg = loadAppConfig();
  const passphrase = process.env.CLAWJ_SECRET;
  const fromDisk =
    passphrase && existsSync(CLAWJ_SECRETS) ? loadSecretsFromDisk(passphrase) : {};

  const jiraBaseUrl =
    process.env.JIRA_BASE_URL ?? cfg.jiraBaseUrl ?? "";
  const jiraEmail = process.env.JIRA_EMAIL ?? "";
  const jiraApiToken =
    process.env.JIRA_API_TOKEN ?? fromDisk.jiraApiToken ?? "";

  const tempoBaseUrl =
    process.env.TEMPO_BASE_URL ??
    cfg.tempoBaseUrl ??
    "https://api.tempo.io/4";
  const tempoApiToken = process.env.TEMPO_API_TOKEN ?? fromDisk.tempoApiToken ?? "";

  if (!jiraBaseUrl || !jiraEmail || !jiraApiToken) {
    throw new Error(
      "Missing Jira config. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN or use encrypted store with CLAWJ_SECRET.",
    );
  }
  if (!tempoApiToken) {
    throw new Error("Missing TEMPO_API_TOKEN (env or encrypted secrets with CLAWJ_SECRET).");
  }
  return {
    jiraBaseUrl: jiraBaseUrl.replace(/\/$/, ""),
    jiraEmail,
    jiraApiToken,
    tempoBaseUrl: tempoBaseUrl.replace(/\/$/, ""),
    tempoApiToken,
  };
}

export function writeSecretField(
  field: "jiraApiToken" | "tempoApiToken",
  value: string,
): void {
  const passphrase = process.env.CLAWJ_SECRET;
  if (!passphrase) throw new Error("CLAWJ_SECRET is required to store encrypted tokens.");
  ensureClawjDir();
  const prev = existsSync(CLAWJ_SECRETS) ? loadSecretsFromDisk(passphrase) : {};
  saveSecretsToDisk(passphrase, { ...prev, [field]: value });
}
