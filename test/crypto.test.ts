import { describe, expect, it } from "vitest";
import { Cipher, hashPassword, sign, unsign, verifyPassword } from "../src/core/crypto.js";

describe("crypto", () => {
  it("encrypts and decrypts round trip", () => {
    const c = new Cipher("master-secret");
    const ct = c.encrypt("סוד גדול");
    expect(ct.startsWith("v1:")).toBe(true);
    expect(c.decrypt(ct)).toBe("סוד גדול");
    expect(() => new Cipher("other").decrypt(ct)).toThrow();
  });

  it("hashes and verifies passwords", () => {
    const h = hashPassword("hunter22");
    expect(verifyPassword("hunter22", h)).toBe(true);
    expect(verifyPassword("hunter23", h)).toBe(false);
  });

  it("signs and verifies values", () => {
    const s = sign("abc", "k");
    expect(unsign(s, "k")).toBe("abc");
    expect(unsign(s, "k2")).toBeNull();
    expect(unsign(s + "x", "k")).toBeNull();
  });
});
