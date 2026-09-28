import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeSecretFile, redactSecret, redactSecretListItem } from "../api.js";
import type { Secret, SecretListItem } from "../types.js";

const REDACTED = "••••••••";

describe("redactSecret", () => {
  it("redacts password field on password secret", () => {
    const secret: Secret = {
      type: "password",
      name: "GitHub",
      username: "user1",
      password: "s3cret",
    };
    const result = redactSecret(secret);
    assert.equal(result.name, "GitHub");
    assert.equal(result.username, "user1");
    assert.equal((result as any).password, REDACTED);
  });

  it("redacts cardNumber and cvvCode on paymentCard", () => {
    const secret: Secret = {
      type: "paymentCard",
      name: "Visa",
      cardNumber: "4111111111111111",
      cvvCode: "123",
    };
    const result = redactSecret(secret);
    assert.equal(result.name, "Visa");
    assert.equal((result as any).cardNumber, REDACTED);
    assert.equal((result as any).cvvCode, REDACTED);
  });

  it("redacts credentials on apiCredentials", () => {
    const secret: Secret = {
      type: "apiCredentials",
      name: "Stripe",
      credentials: "sk_test_123",
    };
    const result = redactSecret(secret);
    assert.equal((result as any).credentials, REDACTED);
  });

  it("redacts password on databaseCredentials", () => {
    const secret: Secret = {
      type: "databaseCredentials",
      name: "Postgres",
      password: "host=localhost password=abc",
    };
    const result = redactSecret(secret);
    assert.equal((result as any).password, REDACTED);
  });

  it("redacts privateKey on sshKey", () => {
    const secret: Secret = {
      type: "sshKey",
      name: "Deploy Key",
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\n...",
    };
    const result = redactSecret(secret);
    assert.equal((result as any).privateKey, REDACTED);
  });

  it("redacts secureNote on secureNote", () => {
    const secret: Secret = {
      type: "secureNote",
      name: "Notes",
      secureNote: "top secret content",
    };
    const result = redactSecret(secret);
    assert.equal((result as any).secureNote, REDACTED);
  });

  it("redacts TOTP field", () => {
    const secret: Secret = {
      type: "password",
      name: "With TOTP",
      password: "pw",
      TOTP: "JBSWY3DPEHPK3PXP",
    };
    const result = redactSecret(secret);
    assert.equal((result as any).password, REDACTED);
    assert.equal((result as any).TOTP, REDACTED);
  });

  it("preserves non-sensitive fields", () => {
    const secret: Secret = {
      id: "abc123",
      type: "password",
      name: "Test",
      username: "admin",
      web: "https://example.com",
      password: "pw",
    };
    const result = redactSecret(secret);
    assert.equal(result.id, "abc123");
    assert.equal(result.name, "Test");
    assert.equal(result.username, "admin");
    assert.equal(result.web, "https://example.com");
    assert.equal(result.type, "password");
  });

  it("preserves non-sensitive paymentCard fields (expirationDate, cardholderName)", () => {
    const secret: Secret = {
      type: "paymentCard",
      name: "Visa",
      cardNumber: "4111111111111111",
      cvvCode: "123",
      expirationDate: "12/30",
      cardholderName: "Test Holder",
    };
    const result = redactSecret(secret);
    assert.equal((result as any).expirationDate, "12/30");
    assert.equal((result as any).cardholderName, "Test Holder");
    assert.equal((result as any).cardNumber, REDACTED);
    assert.equal((result as any).cvvCode, REDACTED);
  });

  it("preserves non-sensitive apiCredentials fields (hostname)", () => {
    const secret: Secret = {
      type: "apiCredentials",
      name: "API",
      credentials: "sk_test_123",
      hostname: "api.example.com",
    };
    const result = redactSecret(secret);
    assert.equal((result as any).hostname, "api.example.com");
    assert.equal((result as any).credentials, REDACTED);
  });

  it("preserves non-sensitive databaseCredentials fields (databaseName, databaseType, server, port)", () => {
    const secret: Secret = {
      type: "databaseCredentials",
      name: "DB",
      password: "secret",
      databaseName: "mydb",
      databaseType: "postgresql",
      server: "db.example.com",
      port: "5432",
    };
    const result = redactSecret(secret);
    assert.equal((result as any).databaseName, "mydb");
    assert.equal((result as any).databaseType, "postgresql");
    assert.equal((result as any).server, "db.example.com");
    assert.equal((result as any).port, "5432");
    assert.equal((result as any).password, REDACTED);
  });

  it("preserves non-sensitive sshKey fields (publicKey)", () => {
    const secret: Secret = {
      type: "sshKey",
      name: "Key",
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\n...",
      publicKey: "ssh-ed25519 AAAAC3 test@test",
    };
    const result = redactSecret(secret);
    assert.equal((result as any).publicKey, "ssh-ed25519 AAAAC3 test@test");
    assert.equal((result as any).privateKey, REDACTED);
  });

  it("leaves null/undefined sensitive fields as-is", () => {
    const secret: Secret = {
      type: "password",
      name: "No Password",
      // password not set
    };
    const result = redactSecret(secret);
    assert.equal((result as any).password, undefined);
  });

  it("redacts empty string sensitive field", () => {
    const secret: Secret = {
      type: "password",
      name: "Empty PW",
      password: "",
    };
    const result = redactSecret(secret);
    assert.equal((result as any).password, REDACTED);
  });
});

const KUBECONFIG = "apiVersion: v1\nusers:\n- name: admin\n  user:\n    client-key-data: TOP-SECRET-KEY-MATERIAL\n";
const dataUrl = (text: string): string =>
  `data:application/octet-stream;base64,${Buffer.from(text).toString("base64")}`;

describe("redactSecret with file attachments", () => {
  it("redacts the attachment content and keeps its name", () => {
    const secret: Secret = {
      type: "password",
      name: "kubeconfig PROD",
      file: { name: "kubeconfig.prod", data: dataUrl(KUBECONFIG) },
    };
    const result = redactSecret(secret);
    assert.deepEqual(result.file, { name: "kubeconfig.prod", data: REDACTED });
    assert.ok(!JSON.stringify(result).includes(Buffer.from(KUBECONFIG).toString("base64")));
  });

  it("leaves a null attachment as-is", () => {
    const secret: Secret = { type: "password", name: "No file", file: null };
    assert.equal(redactSecret(secret).file, null);
  });

  it("does not mutate the original secret", () => {
    const secret: Secret = {
      type: "password",
      name: "kubeconfig",
      file: { name: "k", data: dataUrl(KUBECONFIG) },
    };
    redactSecret(secret);
    assert.equal(secret.file?.data, dataUrl(KUBECONFIG));
  });
});

describe("redactSecretListItem", () => {
  it("redacts attachments and sensitive fields returned by the list endpoint", () => {
    const item: SecretListItem = {
      id: "abc",
      type: "password",
      name: "kubeconfig PREPROD",
      password: "s3cret",
      file: { name: "kubeconfig.preprod", data: dataUrl(KUBECONFIG) },
    };
    const result = redactSecretListItem(item);
    assert.equal(result.id, "abc");
    assert.equal(result.password, REDACTED);
    assert.deepEqual(result.file, { name: "kubeconfig.preprod", data: REDACTED });
  });
});

describe("decodeSecretFile", () => {
  it("decodes a base64 data URL", () => {
    const bytes = decodeSecretFile({ name: "k", data: dataUrl(KUBECONFIG) });
    assert.equal(bytes.toString("utf-8"), KUBECONFIG);
  });

  it("decodes a percent-encoded data URL", () => {
    const bytes = decodeSecretFile({ name: "t", data: "data:text/plain,hello%20world" });
    assert.equal(bytes.toString("utf-8"), "hello world");
  });

  it("keeps binary content intact", () => {
    const raw = Buffer.from([0, 1, 2, 255]);
    const bytes = decodeSecretFile({ name: "b", data: `data:application/octet-stream;base64,${raw.toString("base64")}` });
    assert.deepEqual(bytes, raw);
  });

  it("rejects content that is not a data URL", () => {
    assert.throws(() => decodeSecretFile({ name: "x", data: "plain text" }), /not a data URL/);
  });
});
