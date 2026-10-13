import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { createStreamMasker, maskSecrets, pipeMasked, MASK } from "../mask.js";

function maskChunks(secrets: string[], chunks: (Buffer | string)[]): string {
  const masker = createStreamMasker(secrets);
  return chunks.map((c) => masker.write(c)).join("") + masker.end();
}

describe("createStreamMasker", () => {
  it("masks a secret inside a single chunk", () => {
    assert.equal(maskChunks(["hunter2"], ["pw=hunter2\n"]), `pw=${MASK}\n`);
  });

  it("masks a secret split across two chunks", () => {
    assert.equal(maskChunks(["hunter2"], ["pw=hun", "ter2\n"]), `pw=${MASK}\n`);
  });

  it("masks a secret written one byte at a time", () => {
    const chunks = [..."pw=hunter2!"].map((c) => Buffer.from(c));
    assert.equal(maskChunks(["hunter2"], chunks), `pw=${MASK}!`);
  });

  it("masks a secret split across many chunks of a large stream", () => {
    const secret = "s3cr3t-value-that-is-long";
    const text = "x".repeat(65_530) + secret + "y".repeat(100);
    const buf = Buffer.from(text);
    const chunks = [buf.subarray(0, 65_536), buf.subarray(65_536)];
    const out = maskChunks([secret], chunks);
    assert.ok(!out.includes(secret));
    assert.equal(out, "x".repeat(65_530) + MASK + "y".repeat(100));
  });

  it("keeps multi-byte UTF-8 characters split across chunks intact", () => {
    const buf = Buffer.from("héllo wörld");
    const chunks = [buf.subarray(0, 2), buf.subarray(2, 9), buf.subarray(9)];
    assert.equal(maskChunks(["nomatch"], chunks), "héllo wörld");
  });

  it("masks a multi-byte secret split inside a character", () => {
    const buf = Buffer.from("key=pässwörd;");
    const chunks = [buf.subarray(0, 6), buf.subarray(6)];
    assert.equal(maskChunks(["pässwörd"], chunks), `key=${MASK};`);
  });

  it("does not hold back output that cannot start a secret", () => {
    const masker = createStreamMasker(["hunter2"]);
    assert.equal(masker.write('{"jsonrpc":"2.0"}\n'), '{"jsonrpc":"2.0"}\n');
  });

  it("holds back only the tail that could start a secret", () => {
    const masker = createStreamMasker(["hunter2"]);
    assert.equal(masker.write("abc hun"), "abc ");
    assert.equal(masker.write("gry\n"), "hungry\n");
  });

  it("flushes a held-back partial match on end", () => {
    const masker = createStreamMasker(["hunter2"]);
    assert.equal(masker.write("abc hunt"), "abc ");
    assert.equal(masker.end(), "hunt");
  });

  it("masks every secret, preferring the longest overlap", () => {
    assert.equal(
      maskChunks(["abc", "abcdef"], ["xx abcd", "ef yy abc"]),
      `xx ${MASK} yy ${MASK}`,
    );
  });

  it("masks a whole secret that ends where another one could begin", () => {
    const masker = createStreamMasker(["abc", "bcz"]);
    assert.equal(masker.write("xabc"), `x${MASK}`);
    assert.equal(masker.end(), "");
  });

  it("ignores empty secrets", () => {
    assert.equal(maskChunks([""], ["hello"]), "hello");
  });
});

describe("maskSecrets", () => {
  it("masks every occurrence in a complete string", () => {
    assert.equal(maskSecrets("a hunt hunter2 hunter2", ["hunter2"]), `a hunt ${MASK} ${MASK}`);
  });
});

describe("pipeMasked", () => {
  it("masks a secret split across stream chunks", async () => {
    const source = new PassThrough();
    const target = new PassThrough();
    const received: string[] = [];
    target.on("data", (c: Buffer) => received.push(c.toString()));
    pipeMasked(source, target, ["topsecret"]);
    const done = new Promise((resolve) => source.on("end", resolve));
    source.write("value: tops");
    source.write("ecret\nbye tops");
    source.end();
    await done;
    assert.equal(received.join(""), `value: ${MASK}\nbye tops`);
  });
});
