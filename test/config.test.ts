import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, parseTrustProxy } from "../src/config.js";
import { JsonStore } from "../src/core/store.js";
import { loadOrCreateMasterKey } from "../src/core/crypto.js";

describe("config", () => {
  it("parses TRUST_PROXY into hop counts, never 'trust everything'", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("0")).toBe(false);
    expect(parseTrustProxy("true")).toBe(1);
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("2")).toBe(2);
    expect(parseTrustProxy("loopback, 10.0.0.0/8")).toBe("loopback, 10.0.0.0/8");
    expect(loadConfig({ TRUST_PROXY: "true" }).trustProxy).toBe(1);
  });

  it("reads numeric/boolean settings from the provided env object", () => {
    const c = loadConfig({ PORT: "9999", ALLOW_URL_TOKENS: "false", SUMIT_TIMEOUT_MS: "1234" });
    expect(c.port).toBe(9999);
    expect(c.allowUrlTokens).toBe(false);
    expect(c.sumitTimeoutMs).toBe(1234);
  });
});

describe("startup safety", () => {
  it("fails fast when the data directory is not writable", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sumit-ro-"));
    const notADir = path.join(dir, "file");
    fs.writeFileSync(notADir, "x");
    expect(() => new JsonStore(path.join(notADir, "data"))).toThrow(/not writable/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("rejects a short or placeholder MASTER_KEY instead of silently ignoring it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sumit-key-"));
    expect(() => loadOrCreateMasterKey(dir, "short")).toThrow(/at least 16/);
    expect(() => loadOrCreateMasterKey(dir, "<openssl rand -hex 32>")).toThrow(/placeholder/);
    expect(loadOrCreateMasterKey(dir, "a-perfectly-fine-master-key")).toBe("a-perfectly-fine-master-key");
    const generated = loadOrCreateMasterKey(dir, undefined);
    expect(generated.length).toBeGreaterThanOrEqual(32);
    expect(loadOrCreateMasterKey(dir, undefined)).toBe(generated);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("validateConfig", () => {
  it("rejects placeholders copied from the examples", async () => {
    const { validateConfig } = await import("../src/config.js");
    expect(() => validateConfig(loadConfig({ PUBLIC_URL: "https://<app-name>.<root-domain>" }), {})).toThrow(/PUBLIC_URL still contains a placeholder/);
    expect(() => validateConfig(loadConfig({ PUBLIC_URL: "https://ok.example.com", ADMIN_PASSWORD: "<סיסמה חזקה>" }), {})).toThrow(/ADMIN_PASSWORD still contains the placeholder/);
    expect(() => validateConfig(loadConfig({ PUBLIC_URL: "not a url" }), {})).toThrow(/not a valid URL/);
    expect(() => validateConfig(loadConfig({ PUBLIC_URL: "https://ok.example.com", ADMIN_PASSWORD: "correct horse" }), {})).not.toThrow();
  });
});
