import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createSecret } from "@passwd/passwd-lib";
import type { SecretType } from "@passwd/passwd-lib";
import { formatJson } from "../util/format.js";
import { parseRefFlag } from "../util/parse-ref.js";

export async function createCommand(opts: {
  type: string;
  name: string;
  username?: string;
  password?: string;
  web?: string;
  note?: string;
  tags?: string[];
  group?: string[];
  user?: string[];
  file?: string;
  visibleToAll?: boolean;
  totp?: string;
  cardNumber?: string;
  cvvCode?: string;
  credentials?: string;
  privateKey?: string;
  secureNote?: string;
}): Promise<void> {
  const payload: Record<string, unknown> = {
    type: opts.type as SecretType,
    name: opts.name,
  };

  if (opts.username !== undefined) payload.username = opts.username;
  if (opts.password !== undefined) payload.password = opts.password;
  if (opts.web !== undefined) payload.web = opts.web;
  if (opts.note !== undefined) payload.note = opts.note;
  if (opts.tags !== undefined) payload.tags = opts.tags;
  if (opts.group !== undefined) {
    payload.groups = opts.group.map(parseRefFlag);
  }
  if (opts.user !== undefined) {
    payload.whitelistUsers = opts.user.map(parseRefFlag);
  }
  if (opts.file !== undefined) {
    const buf = readFileSync(opts.file);
    const name = basename(opts.file);
    const ext = name.split(".").pop() ?? "";
    const mime = guessMime(ext);
    payload.file = { name, data: `data:${mime};base64,${buf.toString("base64")}` };
  }
  if (opts.visibleToAll !== undefined) payload.visibleToAll = opts.visibleToAll;
  if (opts.totp !== undefined) payload.TOTP = opts.totp;
  if (opts.cardNumber !== undefined) payload.cardNumber = opts.cardNumber;
  if (opts.cvvCode !== undefined) payload.cvvCode = opts.cvvCode;
  if (opts.credentials !== undefined) payload.credentials = opts.credentials;
  if (opts.privateKey !== undefined) payload.privateKey = opts.privateKey;
  if (opts.secureNote !== undefined) payload.secureNote = opts.secureNote;

  const secret = await createSecret(payload);
  console.log(formatJson(secret));
}

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    txt: "text/plain",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    json: "application/json",
    xml: "application/xml",
    csv: "text/csv",
    zip: "application/zip",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}
