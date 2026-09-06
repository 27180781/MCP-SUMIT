import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

export type Scope = "read" | "write" | "payments" | "admin";
export const ALL_SCOPES: Scope[] = ["read", "write", "payments", "admin"];

export interface AccountRecord {
  id: string;
  name: string;
  companyId: number;
  /** AES-GCM encrypted API key */
  apiKeyEnc: string;
  /** AES-GCM encrypted public key (optional, used for tokenization endpoints) */
  apiPublicKeyEnc?: string;
  baseUrl?: string;
  notes?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastTestAt?: string;
  lastTestOk?: boolean;
  lastTestMessage?: string;
}

export interface ApiTokenRecord {
  id: string;
  name: string;
  tokenHash: string;
  prefix: string;
  /** "all" or explicit list of account ids */
  accountIds: string[] | "all";
  scopes: Scope[];
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface OAuthCodeRecord {
  codeHash: string;
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: Scope[];
  accountIds: string[] | "all";
  resource?: string;
  expiresAt: string;
}

export interface OAuthTokenRecord {
  id: string;
  clientId: string;
  clientName?: string;
  accessHash: string;
  refreshHash?: string;
  scopes: Scope[];
  accountIds: string[] | "all";
  resource?: string;
  accessExpiresAt: string;
  refreshExpiresAt?: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface AuditEntry {
  at: string;
  kind: "tool" | "admin" | "auth";
  actor?: string;
  account?: string;
  tool?: string;
  path?: string;
  ok: boolean;
  ms?: number;
  message?: string;
}

export interface StoreData {
  version: 1;
  admin: { passwordHash?: string };
  accounts: AccountRecord[];
  tokens: ApiTokenRecord[];
  oauth: {
    clients: (OAuthClientInformationFull & { createdAt?: string })[];
    codes: OAuthCodeRecord[];
    tokens: OAuthTokenRecord[];
  };
  audit: AuditEntry[];
}

export function emptyStore(): StoreData {
  return {
    version: 1,
    admin: {},
    accounts: [],
    tokens: [],
    oauth: { clients: [], codes: [], tokens: [] },
    audit: []
  };
}

const MAX_AUDIT = 1000;

/**
 * Small persistent JSON store with atomic writes and a write queue.
 * Suitable for a single-process server. Secrets are encrypted by callers before being stored.
 */
export class JsonStore {
  private data: StoreData;
  private queue: Promise<void> = Promise.resolve();
  readonly file: string;

  private readonly persistEnabled: boolean;

  constructor(dataDir: string, fileName = "store.json", options: { persist?: boolean } = {}) {
    this.persistEnabled = options.persist !== false;
    if (this.persistEnabled) fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, fileName);
    this.data = this.persistEnabled ? this.load() : emptyStore();
  }

  private load(): StoreData {
    if (!fs.existsSync(this.file)) return emptyStore();
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      const base = emptyStore();
      return {
        ...base,
        ...parsed,
        admin: { ...base.admin, ...(parsed.admin || {}) },
        oauth: { ...base.oauth, ...(parsed.oauth || {}) },
        version: 1
      };
    } catch (err) {
      throw new Error(`Failed to read store file ${this.file}: ${(err as Error).message}`);
    }
  }

  get(): StoreData {
    return this.data;
  }

  /** Mutate the store inside `fn` and persist atomically. */
  async update<T>(fn: (data: StoreData) => T | Promise<T>): Promise<T> {
    let result!: T;
    const run = async () => {
      result = await fn(this.data);
      await this.persist();
    };
    this.queue = this.queue.then(run, run);
    await this.queue;
    return result;
  }

  private async persist(): Promise<void> {
    if (!this.persistEnabled) return;
    const tmp = `${this.file}.${process.pid}.tmp`;
    const json = JSON.stringify(this.data, null, 2);
    await fsp.writeFile(tmp, json, { mode: 0o600 });
    await fsp.rename(tmp, this.file);
  }

  async audit(entry: AuditEntry): Promise<void> {
    await this.update((d) => {
      d.audit.unshift(entry);
      if (d.audit.length > MAX_AUDIT) d.audit.length = MAX_AUDIT;
    });
  }
}
