import { randomToken, sha256Hex } from "../core/crypto.js";
import type { ApiTokenRecord, JsonStore, Scope } from "../core/store.js";
import { ALL_SCOPES } from "../core/store.js";
import type { ConnectionIdentity } from "./identity.js";

export interface ApiTokenPublic {
  id: string;
  name: string;
  prefix: string;
  accountIds: string[] | "all";
  scopes: Scope[];
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface CreateTokenInput {
  name: string;
  accountIds: string[] | "all";
  scopes: Scope[];
  expiresInDays?: number;
}

export function normalizeScopes(scopes: unknown): Scope[] {
  const list = Array.isArray(scopes) ? scopes : typeof scopes === "string" ? scopes.split(/[\s,]+/) : [];
  const out = new Set<Scope>();
  for (const s of list) if (ALL_SCOPES.includes(s as Scope) && s !== "admin") out.add(s as Scope);
  if (out.has("payments")) out.add("write");
  if (out.has("write")) out.add("read");
  if (out.size === 0) out.add("read");
  return ALL_SCOPES.filter((s) => out.has(s));
}

export class ApiTokenService {
  private lastTouched = new Map<string, number>();

  constructor(private readonly store: JsonStore) {}

  list(): ApiTokenPublic[] {
    return this.store.get().tokens.map(toPublic);
  }

  async create(input: CreateTokenInput): Promise<{ token: string; record: ApiTokenPublic }> {
    const name = input.name?.trim();
    if (!name) throw new Error("name is required");
    const token = randomToken("smt_", 32);
    const now = new Date();
    const rec: ApiTokenRecord = {
      id: sha256Hex(token).slice(0, 16),
      name,
      tokenHash: sha256Hex(token),
      prefix: token.slice(0, 10),
      accountIds: input.accountIds === "all" ? "all" : [...new Set(input.accountIds)],
      scopes: normalizeScopes(input.scopes),
      createdAt: now.toISOString(),
      expiresAt: input.expiresInDays && input.expiresInDays > 0 ? new Date(now.getTime() + input.expiresInDays * 86_400_000).toISOString() : undefined
    };
    await this.store.update((d) => {
      if (rec.accountIds !== "all") {
        const known = new Set(d.accounts.map((a) => a.id));
        rec.accountIds = rec.accountIds.filter((id) => known.has(id));
        if (rec.accountIds.length === 0) throw new Error("Select at least one existing account (or all)");
      }
      d.tokens.push(rec);
    });
    return { token, record: toPublic(rec) };
  }

  async revoke(id: string): Promise<void> {
    await this.store.update((d) => {
      const rec = d.tokens.find((t) => t.id === id);
      if (!rec) throw new Error("Token not found");
      rec.revokedAt = new Date().toISOString();
    });
  }

  async remove(id: string): Promise<void> {
    await this.store.update((d) => {
      const idx = d.tokens.findIndex((t) => t.id === id);
      if (idx < 0) throw new Error("Token not found");
      d.tokens.splice(idx, 1);
    });
  }

  /** Returns the identity for a valid token, or null. */
  async verify(token: string): Promise<ConnectionIdentity | null> {
    if (!token || !token.startsWith("smt_")) return null;
    const hash = sha256Hex(token);
    const rec = this.store.get().tokens.find((t) => t.tokenHash === hash);
    if (!rec || rec.revokedAt) return null;
    if (rec.expiresAt && new Date(rec.expiresAt).getTime() < Date.now()) return null;
    const last = this.lastTouched.get(rec.id) || 0;
    if (Date.now() - last > 60_000) {
      this.lastTouched.set(rec.id, Date.now());
      this.store
        .update((d) => {
          const r = d.tokens.find((t) => t.id === rec.id);
          if (r) r.lastUsedAt = new Date().toISOString();
        })
        .catch(() => undefined);
    }
    return {
      kind: "api_token",
      id: rec.id,
      name: rec.name,
      accountIds: rec.accountIds,
      scopes: rec.scopes,
      expiresAt: rec.expiresAt ? Math.floor(new Date(rec.expiresAt).getTime() / 1000) : undefined
    };
  }
}

function toPublic(rec: ApiTokenRecord): ApiTokenPublic {
  return {
    id: rec.id,
    name: rec.name,
    prefix: rec.prefix,
    accountIds: rec.accountIds,
    scopes: rec.scopes,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
    lastUsedAt: rec.lastUsedAt,
    revokedAt: rec.revokedAt
  };
}
