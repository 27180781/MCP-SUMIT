import { Cipher, randomId } from "./crypto.js";
import type { AccountRecord, JsonStore } from "./store.js";
import { SumitClient } from "./sumit-client.js";
import { maskSecret } from "./redact.js";

export interface AccountInput {
  name: string;
  companyId: number;
  apiKey?: string;
  apiPublicKey?: string;
  baseUrl?: string;
  notes?: string;
  isDefault?: boolean;
}

export interface AccountPublic {
  id: string;
  name: string;
  companyId: number;
  apiKeyMasked: string;
  hasPublicKey: boolean;
  baseUrl?: string;
  notes?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastTestAt?: string;
  lastTestOk?: boolean;
  lastTestMessage?: string;
}

export interface ResolvedAccount {
  id: string;
  name: string;
  companyId: number;
  apiKey: string;
  apiPublicKey?: string;
  baseUrl?: string;
  isDefault: boolean;
}

export class AccountRegistry {
  constructor(
    private readonly store: JsonStore,
    private readonly cipher: Cipher,
    private readonly defaults: { baseUrl: string; timeoutMs: number; fetchImpl?: typeof fetch }
  ) {}

  list(): AccountPublic[] {
    return this.store.get().accounts.map((a) => this.toPublic(a));
  }

  private toPublic(a: AccountRecord): AccountPublic {
    let masked = "";
    try {
      masked = maskSecret(this.cipher.decrypt(a.apiKeyEnc));
    } catch {
      masked = "(לא ניתן לפענח - MASTER_KEY השתנה?)";
    }
    return {
      id: a.id,
      name: a.name,
      companyId: a.companyId,
      apiKeyMasked: masked,
      hasPublicKey: !!a.apiPublicKeyEnc,
      baseUrl: a.baseUrl,
      notes: a.notes,
      isDefault: a.isDefault,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      lastTestAt: a.lastTestAt,
      lastTestOk: a.lastTestOk,
      lastTestMessage: a.lastTestMessage
    };
  }

  getRecord(id: string): AccountRecord | undefined {
    return this.store.get().accounts.find((a) => a.id === id);
  }

  /** Resolve by id, exact name, case-insensitive name or company id. */
  resolve(ref: string | number | undefined, allowed: string[] | "all"): ResolvedAccount | undefined {
    const accounts = this.store.get().accounts.filter((a) => allowed === "all" || allowed.includes(a.id));
    if (accounts.length === 0) return undefined;
    let rec: AccountRecord | undefined;
    if (ref === undefined || ref === null || ref === "") {
      rec = accounts.find((a) => a.isDefault) || (accounts.length === 1 ? accounts[0] : undefined);
    } else {
      const s = String(ref).trim();
      rec =
        accounts.find((a) => a.id === s) ||
        accounts.find((a) => a.name === s) ||
        accounts.find((a) => a.name.toLowerCase() === s.toLowerCase()) ||
        accounts.find((a) => String(a.companyId) === s);
    }
    return rec ? this.decrypt(rec) : undefined;
  }

  decrypt(rec: AccountRecord): ResolvedAccount {
    return {
      id: rec.id,
      name: rec.name,
      companyId: rec.companyId,
      apiKey: this.cipher.decrypt(rec.apiKeyEnc),
      apiPublicKey: rec.apiPublicKeyEnc ? this.cipher.decrypt(rec.apiPublicKeyEnc) : undefined,
      baseUrl: rec.baseUrl,
      isDefault: rec.isDefault
    };
  }

  clientFor(account: ResolvedAccount, timeoutMs?: number): SumitClient {
    return new SumitClient(
      { companyId: account.companyId, apiKey: account.apiKey, apiPublicKey: account.apiPublicKey },
      { baseUrl: account.baseUrl || this.defaults.baseUrl, timeoutMs: timeoutMs ?? this.defaults.timeoutMs, fetchImpl: this.defaults.fetchImpl }
    );
  }

  async create(input: AccountInput): Promise<AccountPublic> {
    if (!input.apiKey) throw new Error("apiKey is required");
    validateAccountInput(input);
    const now = new Date().toISOString();
    const rec: AccountRecord = {
      id: randomId(),
      name: input.name.trim(),
      companyId: input.companyId,
      apiKeyEnc: this.cipher.encrypt(input.apiKey.trim()),
      apiPublicKeyEnc: input.apiPublicKey?.trim() ? this.cipher.encrypt(input.apiPublicKey.trim()) : undefined,
      baseUrl: cleanBaseUrl(input.baseUrl),
      notes: input.notes?.trim() || undefined,
      isDefault: false,
      createdAt: now,
      updatedAt: now
    };
    await this.store.update((d) => {
      if (d.accounts.some((a) => a.name.toLowerCase() === rec.name.toLowerCase())) {
        throw new Error(`Account name "${rec.name}" already exists`);
      }
      const makeDefault = input.isDefault || d.accounts.length === 0;
      if (makeDefault) d.accounts.forEach((a) => (a.isDefault = false));
      rec.isDefault = makeDefault;
      d.accounts.push(rec);
    });
    return this.toPublic(rec);
  }

  async update(id: string, input: Partial<AccountInput>): Promise<AccountPublic> {
    const updated = await this.store.update((d) => {
      const rec = d.accounts.find((a) => a.id === id);
      if (!rec) throw new Error("Account not found");
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) throw new Error("name is required");
        if (d.accounts.some((a) => a.id !== id && a.name.toLowerCase() === name.toLowerCase())) {
          throw new Error(`Account name "${name}" already exists`);
        }
        rec.name = name;
      }
      if (input.companyId !== undefined) {
        if (!Number.isInteger(input.companyId) || input.companyId <= 0) throw new Error("companyId must be a positive integer");
        rec.companyId = input.companyId;
      }
      if (input.apiKey !== undefined && input.apiKey !== "") rec.apiKeyEnc = this.cipher.encrypt(input.apiKey.trim());
      if (input.apiPublicKey !== undefined) {
        rec.apiPublicKeyEnc = input.apiPublicKey.trim() ? this.cipher.encrypt(input.apiPublicKey.trim()) : undefined;
      }
      if (input.baseUrl !== undefined) rec.baseUrl = cleanBaseUrl(input.baseUrl);
      if (input.notes !== undefined) rec.notes = input.notes.trim() || undefined;
      if (input.isDefault) {
        d.accounts.forEach((a) => (a.isDefault = false));
        rec.isDefault = true;
      }
      rec.updatedAt = new Date().toISOString();
      return rec;
    });
    return this.toPublic(updated);
  }

  async remove(id: string): Promise<void> {
    await this.store.update((d) => {
      const idx = d.accounts.findIndex((a) => a.id === id);
      if (idx < 0) throw new Error("Account not found");
      const [removed] = d.accounts.splice(idx, 1);
      if (removed.isDefault && d.accounts.length > 0) d.accounts[0].isDefault = true;
      // drop the account from token scopes
      for (const t of d.tokens) if (t.accountIds !== "all") t.accountIds = t.accountIds.filter((x) => x !== id);
      for (const t of d.oauth.tokens) if (t.accountIds !== "all") t.accountIds = t.accountIds.filter((x) => x !== id);
    });
  }

  async setDefault(id: string): Promise<void> {
    await this.store.update((d) => {
      if (!d.accounts.some((a) => a.id === id)) throw new Error("Account not found");
      d.accounts.forEach((a) => (a.isDefault = a.id === id));
    });
  }

  /** Calls /website/companies/getdetails/ to verify the credentials and records the result. */
  async test(id: string): Promise<{ ok: boolean; message: string; company?: unknown }> {
    const rec = this.getRecord(id);
    if (!rec) throw new Error("Account not found");
    const account = this.decrypt(rec);
    const client = this.clientFor(account, 30_000);
    const result = await client.call("/website/companies/getdetails/", {});
    const ok = result.ok;
    const data = (result.json?.Data ?? {}) as Record<string, unknown>;
    const companyName = (data.Name as string) || (data.CompanyName as string) || ((data.Company as Record<string, unknown>)?.Name as string) || undefined;
    const message = ok ? `החיבור תקין${companyName ? ` — ${companyName}` : ""}` : result.errorMessage || "החיבור נכשל";
    await this.store.update((d) => {
      const r = d.accounts.find((a) => a.id === id);
      if (r) {
        r.lastTestAt = new Date().toISOString();
        r.lastTestOk = ok;
        r.lastTestMessage = message;
      }
    });
    return { ok, message, company: ok ? data : undefined };
  }
}

function validateAccountInput(input: AccountInput): void {
  if (!input.name || !input.name.trim()) throw new Error("name is required");
  if (!Number.isInteger(input.companyId) || input.companyId <= 0) throw new Error("companyId must be a positive integer");
}

function cleanBaseUrl(url?: string): string | undefined {
  const u = url?.trim();
  if (!u) return undefined;
  if (!/^https?:\/\//i.test(u)) throw new Error("baseUrl must start with http:// or https://");
  return u.replace(/\/+$/, "");
}
