import { describe, expect, it } from "vitest";
import { AccountRegistry, accountTag, deriveFpKey, globalFingerprint } from "../src/identity.js";

const SEED = new Uint8Array(32).fill(5);
const KEY = deriveFpKey(SEED);

describe("account fingerprints", () => {
  it("derives a stable key and 64-hex tags", () => {
    expect(deriveFpKey(SEED).equals(KEY)).toBe(true);
    const tag = accountTag(KEY, "123456", 0);
    expect(tag).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same (uid, mandate)", () => {
    expect(accountTag(KEY, "123456", 7)).toBe(accountTag(KEY, "123456", 7));
  });

  it("is unlinkable across mandates (privacy): same account, different tags", () => {
    expect(accountTag(KEY, "123456", 1)).not.toBe(accountTag(KEY, "123456", 2));
  });

  it("differs by account", () => {
    expect(accountTag(KEY, "111", 0)).not.toBe(accountTag(KEY, "222", 0));
  });

  it("does not reveal the uid (one-way)", () => {
    const tag = accountTag(KEY, "secret-uid-42", 0);
    expect(tag).not.toContain("42");
    expect(tag).not.toContain("secret");
  });

  it("global fingerprint is stable per account and salted vs the on-chain tag", () => {
    expect(globalFingerprint(KEY, "123456")).toBe(globalFingerprint(KEY, "123456"));
    expect(globalFingerprint(KEY, "123456")).not.toBe(accountTag(KEY, "123456", 0));
  });
});

describe("AccountRegistry (enclave-private de-dup)", () => {
  it("lets the same MM re-claim its account", () => {
    const r = new AccountRegistry();
    expect(r.claim("fp1", "mm.testnet")).toBe("ok");
    expect(r.claim("fp1", "mm.testnet")).toBe("ok");
  });

  it("rejects a second MM claiming the same account", () => {
    const r = new AccountRegistry();
    expect(r.claim("fp1", "mm-a.testnet")).toBe("ok");
    expect(r.claim("fp1", "mm-b.testnet")).toBe("conflict");
  });
});
