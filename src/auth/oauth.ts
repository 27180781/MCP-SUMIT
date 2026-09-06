import type { Request, Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidGrantError, InvalidTokenError, InvalidRequestError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { redirectUriMatches } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { randomId, randomToken, sha256Hex, sign, unsign } from "../core/crypto.js";
import type { JsonStore, OAuthTokenRecord, Scope } from "../core/store.js";
import type { AccountRegistry } from "../core/accounts.js";
import { normalizeScopes } from "./tokens.js";
import { renderConsentPage } from "./consent-page.js";
import { toAuthInfo } from "./identity.js";

export interface OAuthProviderOptions {
  store: JsonStore;
  accounts: AccountRegistry;
  secret: string;
  publicUrl: string;
  verifyAdminPassword: (password: string, ip: string) => boolean;
  isAdminSession: (req: Request) => boolean;
  accessTtlSeconds?: number;
  refreshTtlSeconds?: number;
}

interface RequestBlob {
  cid: string;
  ru: string;
  st?: string;
  cc: string;
  sc?: string[];
  rs?: string;
  iat: number;
}

const CONSENT_PATH = "/oauth/consent";

export class SumitOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  constructor(private readonly opts: OAuthProviderOptions) {
    this.accessTtl = opts.accessTtlSeconds ?? 24 * 3600;
    this.refreshTtl = opts.refreshTtlSeconds ?? 90 * 24 * 3600;
    const store = opts.store;
    this.clientsStore = {
      getClient: (clientId: string) => store.get().oauth.clients.find((c) => c.client_id === clientId),
      registerClient: async (client) => {
        const provided = (client as Partial<OAuthClientInformationFull>).client_id;
        const full: OAuthClientInformationFull & { createdAt?: string } = {
          ...client,
          client_id: provided || randomId(16),
          client_id_issued_at: Math.floor(Date.now() / 1000),
          createdAt: new Date().toISOString()
        } as OAuthClientInformationFull & { createdAt?: string };
        await store.update((d) => {
          d.oauth.clients.push(full);
          if (d.oauth.clients.length > 200) d.oauth.clients.splice(0, d.oauth.clients.length - 200);
        });
        return full;
      }
    };
  }

  get consentPath(): string {
    return CONSENT_PATH;
  }

  /* ----------------------------- authorize ----------------------------- */

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const blob: RequestBlob = {
      cid: client.client_id,
      ru: params.redirectUri,
      st: params.state,
      cc: params.codeChallenge,
      sc: params.scopes,
      rs: params.resource?.toString(),
      iat: Date.now()
    };
    const req = res.req as Request;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Frame-Options", "DENY");
    res.type("html").send(
      renderConsentPage({
        clientName: client.client_name || client.client_id,
        clientUri: client.client_uri,
        accounts: this.opts.accounts.list(),
        requestBlob: this.encodeBlob(blob),
        adminLoggedIn: this.opts.isAdminSession(req),
        requestedScopes: params.scopes,
        actionUrl: CONSENT_PATH
      })
    );
  }

  /** Express handler for POST /oauth/consent (urlencoded form). */
  async handleConsent(req: Request, res: Response): Promise<void> {
    const body = (req.body || {}) as Record<string, unknown>;
    const blob = this.decodeBlob(String(body.req || ""));
    if (!blob) {
      res.status(400).type("html").send("<p>בקשת הרשאה לא תקינה או שפג תוקפה. חזרו לאפליקציה ונסו להתחבר שוב.</p>");
      return;
    }
    const client = await this.clientsStore.getClient(blob.cid);
    if (!client || !client.redirect_uris.some((r) => redirectUriMatches(blob.ru, r))) {
      res.status(400).type("html").send("<p>לקוח OAuth לא מוכר או redirect_uri לא רשום.</p>");
      return;
    }
    const redirect = new URL(blob.ru);
    if (blob.st) redirect.searchParams.set("state", blob.st);

    if (body.decision === "deny") {
      redirect.searchParams.set("error", "access_denied");
      redirect.searchParams.set("error_description", "The user denied the request");
      res.redirect(302, redirect.toString());
      return;
    }

    const rerender = (error: string) => {
      res.status(401).type("html").send(
        renderConsentPage({
          clientName: client.client_name || client.client_id,
          clientUri: client.client_uri,
          accounts: this.opts.accounts.list(),
          requestBlob: this.encodeBlob(blob),
          adminLoggedIn: this.opts.isAdminSession(req),
          requestedScopes: blob.sc,
          actionUrl: CONSENT_PATH,
          error
        })
      );
    };

    if (!this.opts.isAdminSession(req)) {
      const password = typeof body.password === "string" ? body.password : "";
      if (!password || !this.opts.verifyAdminPassword(password, req.ip || "unknown")) {
        rerender("סיסמת מנהל שגויה (או שהחשבון נעול זמנית לאחר ניסיונות כושלים).");
        return;
      }
    }

    const known = new Set(this.opts.accounts.list().map((a) => a.id));
    const selected = toArray(body.account).filter((id) => known.has(id));
    if (selected.length === 0) {
      rerender("יש לבחור לפחות חשבון סאמיט אחד.");
      return;
    }
    const scopes = normalizeScopes(toArray(body.scope));
    const accountIds: string[] | "all" = selected.length === known.size ? "all" : selected;

    const code = randomToken("smc_", 24);
    await this.opts.store.update((d) => {
      pruneExpired(d.oauth.codes, (c) => c.expiresAt);
      d.oauth.codes.push({
        codeHash: sha256Hex(code),
        clientId: client.client_id,
        codeChallenge: blob.cc,
        redirectUri: blob.ru,
        scopes,
        accountIds,
        resource: blob.rs,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
      });
    });
    void this.opts.store.audit({ at: new Date().toISOString(), kind: "auth", actor: client.client_name || client.client_id, ok: true, message: `OAuth grant: scopes=${scopes.join(",")} accounts=${accountIds === "all" ? "all" : accountIds.length}` });
    redirect.searchParams.set("code", code);
    res.redirect(302, redirect.toString());
  }

  /* ----------------------------- token exchange ----------------------------- */

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const rec = this.opts.store.get().oauth.codes.find((c) => c.codeHash === sha256Hex(authorizationCode));
    if (!rec || rec.clientId !== client.client_id) throw new InvalidGrantError("Invalid authorization code");
    if (new Date(rec.expiresAt).getTime() < Date.now()) throw new InvalidGrantError("Authorization code expired");
    return rec.codeChallenge;
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, _codeVerifier?: string, redirectUri?: string, resource?: URL): Promise<OAuthTokens> {
    const hash = sha256Hex(authorizationCode);
    const rec = await this.opts.store.update((d) => {
      const idx = d.oauth.codes.findIndex((c) => c.codeHash === hash);
      if (idx < 0) return undefined;
      const [found] = d.oauth.codes.splice(idx, 1);
      return found;
    });
    if (!rec || rec.clientId !== client.client_id) throw new InvalidGrantError("Invalid authorization code");
    if (new Date(rec.expiresAt).getTime() < Date.now()) throw new InvalidGrantError("Authorization code expired");
    if (redirectUri && redirectUri !== rec.redirectUri) throw new InvalidGrantError("redirect_uri mismatch");
    if (resource && rec.resource && resource.toString() !== rec.resource) throw new InvalidRequestError("resource mismatch");
    return this.issueTokens({
      clientId: client.client_id,
      clientName: client.client_name,
      scopes: rec.scopes,
      accountIds: rec.accountIds,
      resource: rec.resource ?? resource?.toString()
    });
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[], _resource?: URL): Promise<OAuthTokens> {
    const hash = sha256Hex(refreshToken);
    const existing = this.opts.store.get().oauth.tokens.find((t) => t.refreshHash === hash);
    if (!existing || existing.revokedAt || existing.clientId !== client.client_id) throw new InvalidGrantError("Invalid refresh token");
    if (existing.refreshExpiresAt && new Date(existing.refreshExpiresAt).getTime() < Date.now()) throw new InvalidGrantError("Refresh token expired");
    let newScopes: Scope[] = existing.scopes;
    if (scopes && scopes.length) {
      const requested = normalizeScopes(scopes);
      newScopes = requested.filter((s) => existing.scopes.includes(s));
      if (newScopes.length === 0) newScopes = ["read"];
    }
    return this.issueTokens({ clientId: existing.clientId, clientName: existing.clientName, scopes: newScopes, accountIds: existing.accountIds, resource: existing.resource, reuseId: existing.id });
  }

  private async issueTokens(input: { clientId: string; clientName?: string; scopes: Scope[]; accountIds: string[] | "all"; resource?: string; reuseId?: string }): Promise<OAuthTokens> {
    const access = randomToken("smo_", 32);
    const refresh = randomToken("smr_", 32);
    const now = Date.now();
    const rec: OAuthTokenRecord = {
      id: input.reuseId || randomId(12),
      clientId: input.clientId,
      clientName: input.clientName,
      accessHash: sha256Hex(access),
      refreshHash: sha256Hex(refresh),
      scopes: input.scopes,
      accountIds: input.accountIds,
      resource: input.resource,
      accessExpiresAt: new Date(now + this.accessTtl * 1000).toISOString(),
      refreshExpiresAt: new Date(now + this.refreshTtl * 1000).toISOString(),
      createdAt: new Date(now).toISOString()
    };
    await this.opts.store.update((d) => {
      pruneExpired(d.oauth.tokens, (t) => t.refreshExpiresAt || t.accessExpiresAt);
      const idx = d.oauth.tokens.findIndex((t) => t.id === rec.id);
      if (idx >= 0) {
        rec.createdAt = d.oauth.tokens[idx].createdAt;
        d.oauth.tokens[idx] = rec;
      } else d.oauth.tokens.push(rec);
    });
    return { access_token: access, token_type: "bearer", expires_in: this.accessTtl, refresh_token: refresh, scope: input.scopes.join(" ") };
  }

  /* ----------------------------- verification ----------------------------- */

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (!token.startsWith("smo_")) throw new InvalidTokenError("Unknown token");
    const hash = sha256Hex(token);
    const rec = this.opts.store.get().oauth.tokens.find((t) => t.accessHash === hash);
    if (!rec || rec.revokedAt) throw new InvalidTokenError("Token revoked or unknown");
    const exp = new Date(rec.accessExpiresAt).getTime();
    if (exp < Date.now()) throw new InvalidTokenError("Token expired");
    touch(this.opts.store, rec.id);
    return toAuthInfo(
      token,
      { kind: "oauth", id: rec.id, name: rec.clientName || rec.clientId, accountIds: rec.accountIds, scopes: rec.scopes },
      Math.floor(exp / 1000),
      rec.resource ? new URL(rec.resource) : undefined
    );
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const hash = sha256Hex(request.token);
    await this.opts.store.update((d) => {
      const rec = d.oauth.tokens.find((t) => (t.accessHash === hash || t.refreshHash === hash) && t.clientId === client.client_id);
      if (rec) rec.revokedAt = new Date().toISOString();
    });
  }

  /* ----------------------------- admin helpers ----------------------------- */

  listGrants() {
    return this.opts.store.get().oauth.tokens.map((t) => ({
      id: t.id,
      client: t.clientName || t.clientId,
      clientId: t.clientId,
      scopes: t.scopes,
      accountIds: t.accountIds,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      accessExpiresAt: t.accessExpiresAt,
      refreshExpiresAt: t.refreshExpiresAt,
      revokedAt: t.revokedAt
    }));
  }

  async revokeGrant(id: string): Promise<void> {
    await this.opts.store.update((d) => {
      const rec = d.oauth.tokens.find((t) => t.id === id);
      if (!rec) throw new Error("Grant not found");
      rec.revokedAt = new Date().toISOString();
    });
  }

  listClients() {
    return this.opts.store.get().oauth.clients.map((c) => ({ client_id: c.client_id, client_name: c.client_name, client_uri: c.client_uri, redirect_uris: c.redirect_uris, createdAt: c.createdAt }));
  }

  /* ----------------------------- blob helpers ----------------------------- */

  private encodeBlob(blob: RequestBlob): string {
    return sign(Buffer.from(JSON.stringify(blob), "utf8").toString("base64url"), this.opts.secret);
  }

  private decodeBlob(value: string): RequestBlob | null {
    const raw = unsign(value, this.opts.secret);
    if (!raw) return null;
    try {
      const blob = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as RequestBlob;
      if (!blob.cid || !blob.ru || !blob.cc || typeof blob.iat !== "number") return null;
      if (Date.now() - blob.iat > 15 * 60_000) return null;
      return blob;
    } catch {
      return null;
    }
  }
}

const touched = new Map<string, number>();
function touch(store: JsonStore, id: string): void {
  const last = touched.get(id) || 0;
  if (Date.now() - last < 60_000) return;
  touched.set(id, Date.now());
  void store.update((d) => {
    const rec = d.oauth.tokens.find((t) => t.id === id);
    if (rec) rec.lastUsedAt = new Date().toISOString();
  });
}

function pruneExpired<T>(list: T[], getExpiry: (item: T) => string | undefined): void {
  const now = Date.now();
  for (let i = list.length - 1; i >= 0; i--) {
    const exp = getExpiry(list[i]);
    if (exp && new Date(exp).getTime() < now - 86_400_000) list.splice(i, 1);
  }
}

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v === undefined || v === null || v === "") return [];
  return [String(v)];
}
