import type { Request, Response } from "express";
import { hashPassword, randomId, sign, unsign, verifyPassword } from "../core/crypto.js";
import type { JsonStore } from "../core/store.js";

export const ADMIN_COOKIE = "sumit_admin";

/** Admin password: from env (ADMIN_PASSWORD) or stored hash (set through the setup screen). */
export class AdminAuth {
  private failures = new Map<string, { count: number; until: number }>();

  constructor(private readonly store: JsonStore, private readonly envPassword?: string) {}

  isConfigured(): boolean {
    return !!this.envPassword || !!this.store.get().admin.passwordHash;
  }

  async setPassword(password: string): Promise<void> {
    if (this.envPassword) throw new Error("Password is managed by the ADMIN_PASSWORD environment variable");
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    const hash = hashPassword(password);
    await this.store.update((d) => {
      d.admin.passwordHash = hash;
    });
  }

  verify(password: string, ip = "unknown"): boolean {
    const lock = this.failures.get(ip);
    if (lock && lock.until > Date.now() && lock.count >= 5) return false;
    let ok = false;
    if (this.envPassword) ok = safeEqual(password, this.envPassword);
    else if (this.store.get().admin.passwordHash) ok = verifyPassword(password, this.store.get().admin.passwordHash!);
    if (ok) {
      this.failures.delete(ip);
    } else {
      const cur = this.failures.get(ip) || { count: 0, until: 0 };
      cur.count += 1;
      cur.until = Date.now() + 5 * 60_000;
      this.failures.set(ip, cur);
    }
    return ok;
  }

  isLocked(ip: string): boolean {
    const lock = this.failures.get(ip);
    return !!lock && lock.count >= 5 && lock.until > Date.now();
  }
}

function safeEqual(a: string, b: string): boolean {
  const { timingSafeEqualStr } = requireCrypto();
  return timingSafeEqualStr(a, b);
}

// small indirection to keep imports tidy
import { timingSafeEqualStr } from "../core/crypto.js";
function requireCrypto() {
  return { timingSafeEqualStr };
}

export interface AdminSessionOptions {
  secret: string;
  ttlMs: number;
  secure: boolean;
}

export class AdminSessions {
  private sessions = new Map<string, number>(); // id → expiresAt

  constructor(private readonly opts: AdminSessionOptions) {}

  issue(res: Response): void {
    const id = randomId(24);
    this.sessions.set(id, Date.now() + this.opts.ttlMs);
    res.cookie(ADMIN_COOKIE, sign(id, this.opts.secret), {
      httpOnly: true,
      sameSite: "lax",
      secure: this.opts.secure,
      path: "/",
      maxAge: this.opts.ttlMs
    });
  }

  clear(req: Request, res: Response): void {
    const id = this.sessionId(req);
    if (id) this.sessions.delete(id);
    res.clearCookie(ADMIN_COOKIE, { path: "/" });
  }

  isAuthenticated(req: Request): boolean {
    const id = this.sessionId(req);
    if (!id) return false;
    const exp = this.sessions.get(id);
    if (!exp) return false;
    if (exp < Date.now()) {
      this.sessions.delete(id);
      return false;
    }
    return true;
  }

  private sessionId(req: Request): string | null {
    const raw = parseCookies(req.headers.cookie)[ADMIN_COOKIE];
    if (!raw) return null;
    return unsign(raw, this.opts.secret);
  }
}

export function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}
