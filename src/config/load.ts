import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { JIRACLAW_CONFIG, JIRACLAW_DIR, JIRACLAW_SECRETS } from "../utils/paths.js";
import { AppConfigSchema, type AppConfig, type ResolvedCredentials } from "./types.js";
import { decryptSecret, encryptSecret } from "../utils/crypto-secret.js";

const SecretsJsonSchema = z.object({
  jiraApiToken: z.string().optional(),
  tempoApiToken: z.string().optional(),
});

export function ensureJiraclawDir(): void {
  if (!existsSync(JIRACLAW_DIR)) mkdirSync(JIRACLAW_DIR, { recursive: true });
}

export function loadAppConfig(): AppConfig {
  ensureJiraclawDir();
  if (!existsSync(JIRACLAW_CONFIG)) return AppConfigSchema.parse({});
  const raw = JSON.parse(readFileSync(JIRACLAW_CONFIG, "utf8"));
  return AppConfigSchema.parse(raw);
}

export function saveAppConfig(cfg: AppConfig): void {
  ensureJiraclawDir();
  writeFileSync(JIRACLAW_CONFIG, JSON.stringify(cfg, null, 2), "utf8");
}

export function loadSecretsFromDisk(passphrase: string): z.infer<typeof SecretsJsonSchema> {
  if (!existsSync(JIRACLAW_SECRETS)) return {};
  const dec = decryptSecret(readFileSync(JIRACLAW_SECRETS, "utf8"), passphrase);
  return SecretsJsonSchema.parse(JSON.parse(dec));
}

export function saveSecretsToDisk(
  passphrase: string,
  secrets: z.infer<typeof SecretsJsonSchema>,
): void {
  ensureJiraclawDir();
  const json = JSON.stringify(secrets);
  writeFileSync(JIRACLAW_SECRETS, encryptSecret(json, passphrase), "utf8");
}

export function resolveCredentials(): ResolvedCredentials {
  const cfg = loadAppConfig();
  const passphrase = process.env.JIRACLAW_SECRET;
  const fromDisk =
    passphrase && existsSync(JIRACLAW_SECRETS) ? loadSecretsFromDisk(passphrase) : {};

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
      "Missing Jira config. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN or use encrypted store with JIRACLAW_SECRET.",
    );
  }
  if (!tempoApiToken) {
    throw new Error("Missing TEMPO_API_TOKEN (env or encrypted secrets with JIRACLAW_SECRET).");
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
  const passphrase = process.env.JIRACLAW_SECRET;
  if (!passphrase) throw new Error("JIRACLAW_SECRET is required to store encrypted tokens.");
  ensureJiraclawDir();
  const prev = existsSync(JIRACLAW_SECRETS) ? loadSecretsFromDisk(passphrase) : {};
  saveSecretsToDisk(passphrase, { ...prev, [field]: value });
}
