import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGO = "aes-256-gcm";

/** Derive a 32-byte key from any master secret string. */
export function deriveKey(masterSecret: string): Buffer {
  return crypto.createHash("sha256").update(masterSecret, "utf8").digest();
}

/**
 * Loads the master key from the environment or from DATA_DIR/master.key (creating it if needed).
 */
export function loadOrCreateMasterKey(dataDir: string, envKey?: string): string {
  if (envKey !== undefined && envKey.trim() !== "") {
    const key = envKey.trim();
    if (key.length < 16) {
      throw new Error(`MASTER_KEY must be at least 16 characters (got ${key.length}). Generate one with: openssl rand -hex 32`);
    }
    if (/^<.*>$/.test(key)) throw new Error("MASTER_KEY still contains the placeholder value — set a real key (openssl rand -hex 32)");
    return key;
  }
  const file = path.join(dataDir, "master.key");
  if (fs.existsSync(file)) {
    const k = fs.readFileSync(file, "utf8").trim();
    if (k.length >= 16) return k;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const generated = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, generated + "\n", { mode: 0o600 });
  return generated;
}

export class Cipher {
  private readonly key: Buffer;
  constructor(masterSecret: string) {
    this.key = deriveKey(masterSecret);
  }

  encrypt(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
  }

  decrypt(payload: string): string {
    const parts = payload.split(":");
    if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Unsupported ciphertext format");
    const [, ivB64, tagB64, ctB64] = parts;
    const decipher = crypto.createDecipheriv(ALGO, this.key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
    return pt.toString("utf8");
  }
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function randomToken(prefix = "smt_", bytes = 32): string {
  return prefix + crypto.randomBytes(bytes).toString("base64url");
}

export function randomId(bytes = 12): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // compare against self to keep constant time, then fail
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/** scrypt password hashing: "scrypt:<salt b64>:<hash b64>" */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltB64, hashB64] = stored.split(":");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = crypto.scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** HMAC-signed value for cookies: value.signature */
export function sign(value: string, secret: string): string {
  const sig = crypto.createHmac("sha256", secret).update(value).digest("base64url");
  return `${value}.${sig}`;
}

export function unsign(signed: string, secret: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const expected = sign(value, secret);
  return timingSafeEqualStr(expected, signed) ? value : null;
}
