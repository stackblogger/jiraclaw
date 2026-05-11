import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const SALT = "clawj-v1";
const TAG_LEN = 16;

function keyFromPassphrase(passphrase: string): Buffer {
  return scryptSync(passphrase, SALT, 32);
}

export function encryptSecret(plaintext: string, passphrase: string): string {
  const key = keyFromPassphrase(passphrase);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string, passphrase: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 12 + TAG_LEN);
  const data = raw.subarray(12 + TAG_LEN);
  const key = keyFromPassphrase(passphrase);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
