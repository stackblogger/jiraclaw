import { spawn } from "node:child_process";
import { join } from "node:path";
import { loadAppConfig, ensureClawjDir } from "../config/load.js";
import { CLAWJ_DIR } from "../utils/paths.js";

type AgentJsonPayload = {
  payloads?: { kind?: string; text?: string; body?: string }[];
  meta?: { assistantTexts?: string[] };
};

function extractAssistantText(data: AgentJsonPayload): string {
  const texts = data.meta?.assistantTexts;
  if (texts?.length) return texts.join("\n");
  const chunks: string[] = [];
  for (const p of data.payloads ?? []) {
    if (typeof p.text === "string") chunks.push(p.text);
    if (typeof p.body === "string") chunks.push(p.body);
  }
  return chunks.join("\n");
}

function zeroclawCommand(): string {
  return process.env.ZEROCLAW_BIN?.trim() || "zeroclaw";
}

export async function runZeroclawAgent(prompt: string): Promise<string> {
  const cfg = loadAppConfig();
  ensureClawjDir();
  const sessionId = cfg.zeroclawSessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const sessionStateFile = join(CLAWJ_DIR, `zeroclaw-session-${sessionId}.json`);
  const cmd = zeroclawCommand();
  const args = ["agent", "--session-state-file", sessionStateFile, "--message", prompt];
  const out = await new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `${cmd} agent failed (${code}). Install ZeroClaw: npm i -g zeroclaw@latest. Stderr: ${stderr.slice(0, 600)}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });
  const trimmed = out.trim();
  if (!trimmed) return "";
  try {
    const data = JSON.parse(trimmed) as AgentJsonPayload;
    return extractAssistantText(data) || trimmed;
  } catch {
    return trimmed;
  }
}
