import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createSecret } from "@passwd/passwd-lib";
import type { SecretType } from "@passwd/passwd-lib";
import { formatJson } from "../util/format.js";
import { parseRefFlag } from "../util/parse-ref.js";
import { guessMime } from "../util/mime.js";
import { resolveStdin } from "../util/stdin.js";

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
  publicKey?: string;
  secureNote?: string;
  expirationDate?: string;
  cardholderName?: string;
  hostname?: string;
  databaseName?: string;
  databaseType?: string;
  server?: string;
  port?: string;
}): Promise<void> {
  const payload: Record<string, unknown> = {
    type: opts.type as SecretType,
    name: opts.name,
  };

  if (opts.username !== undefined) payload.username = opts.username;
  if (opts.password !== undefined) payload.password = resolveStdin(opts.password);
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
  if (opts.totp !== undefined) payload.TOTP = resolveStdin(opts.totp);
  if (opts.cardNumber !== undefined) payload.cardNumber = resolveStdin(opts.cardNumber);
  if (opts.cvvCode !== undefined) payload.cvvCode = resolveStdin(opts.cvvCode);
  if (opts.credentials !== undefined) payload.credentials = resolveStdin(opts.credentials);
  if (opts.privateKey !== undefined) payload.privateKey = resolveStdin(opts.privateKey);
  if (opts.publicKey !== undefined) payload.publicKey = opts.publicKey;
  if (opts.secureNote !== undefined) payload.secureNote = resolveStdin(opts.secureNote);
  if (opts.expirationDate !== undefined) payload.expirationDate = opts.expirationDate;
  if (opts.cardholderName !== undefined) payload.cardholderName = opts.cardholderName;
  if (opts.hostname !== undefined) payload.hostname = opts.hostname;
  if (opts.databaseName !== undefined) payload.databaseName = opts.databaseName;
  if (opts.databaseType !== undefined) payload.databaseType = opts.databaseType;
  if (opts.server !== undefined) payload.server = opts.server;
  if (opts.port !== undefined) payload.port = opts.port;

  const secret = await createSecret(payload);
  console.log(formatJson(secret));
}
