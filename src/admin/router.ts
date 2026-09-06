import express, { type NextFunction, type Request, type Response, type Router } from "express";
import type { AppConfig } from "../config.js";
import type { AccountRegistry } from "../core/accounts.js";
import type { JsonStore } from "../core/store.js";
import type { ApiTokenService } from "../auth/tokens.js";
import type { SumitOAuthProvider } from "../auth/oauth.js";
import type { AdminAuth, AdminSessions } from "./auth.js";
import { catalog } from "../mcp/catalog/index.js";
import { loadGeneratedCatalog } from "../mcp/generated.js";
import { SERVER_VERSION } from "../mcp/server.js";
import { renderAdminPage } from "./ui.js";
import type { Logger } from "../logger.js";

export interface AdminDeps {
  config: AppConfig;
  store: JsonStore;
  accounts: AccountRegistry;
  tokens: ApiTokenService;
  oauth?: SumitOAuthProvider;
  adminAuth: AdminAuth;
  sessions: AdminSessions;
  log: Logger;
  oauthActive: boolean;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

function wrap(fn: Handler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fn(req, res);
      if (!res.headersSent) res.json(result ?? { ok: true });
    } catch (err) {
      next(err);
    }
  };
}

export function createAdminRouter(deps: AdminDeps): Router {
  const router = express.Router();
  const { config, accounts, tokens, adminAuth, sessions } = deps;

  router.use((req, res, next) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/", (_req, res) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
    res.type("html").send(renderAdminPage({ version: SERVER_VERSION }));
  });

  const api = express.Router();
  api.use(express.json({ limit: "1mb" }));

  // CSRF guard for state-changing requests
  api.use((req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.headers["x-requested-with"] !== "sumit-admin") {
      res.status(403).json({ error: "Missing X-Requested-With header" });
      return;
    }
    next();
  });

  api.get(
    "/status",
    wrap((req) => ({
      version: SERVER_VERSION,
      configured: adminAuth.isConfigured(),
      passwordFromEnv: !!config.adminPassword,
      authenticated: sessions.isAuthenticated(req),
      secureCookie: sessions.secure,
      requestSecure: req.secure,
      publicUrl: config.publicUrl,
      mcpUrl: `${config.publicUrl}/mcp`,
      sseUrl: `${config.publicUrl}/sse`,
      oauthEnabled: deps.oauthActive,
      allowUrlTokens: config.allowUrlTokens,
      toolCount: catalog.length + loadGeneratedCatalog().length + 5,
      accountsCount: deps.store.get().accounts.length,
      undecryptableAccounts: sessions.isAuthenticated(req) ? accounts.undecryptableAccounts() : undefined
    }))
  );

  const requireHttpsForCookies = (req: Request) => {
    if (sessions.secure && !req.secure) {
      throw new HttpError(
        400,
        `הקונסולה מוגדרת עם PUBLIC_URL ב-https, ולכן עוגיית ההתחברות נשלחת רק דרך https. גשו לכתובת ${config.publicUrl}/admin (ודאו ש-HTTPS מופעל ושה-TRUST_PROXY מוגדר כשיש reverse proxy).`
      );
    }
  };

  api.post(
    "/setup",
    wrap(async (req, res) => {
      requireHttpsForCookies(req);
      if (adminAuth.isConfigured()) throw new HttpError(409, "Admin password is already configured");
      const password = String((req.body as { password?: string })?.password || "");
      await adminAuth.setPassword(password);
      sessions.issue(res);
      void deps.store.audit({ at: new Date().toISOString(), kind: "admin", actor: "admin", ok: true, message: "Admin password created" });
      return { ok: true };
    })
  );

  api.post(
    "/login",
    wrap(async (req, res) => {
      requireHttpsForCookies(req);
      const ip = req.ip || "unknown";
      if (adminAuth.isLocked(ip)) throw new HttpError(429, "יותר מדי ניסיונות — נסו שוב בעוד כמה דקות");
      const password = String((req.body as { password?: string })?.password || "");
      if (!adminAuth.verify(password, ip)) {
        void deps.store.audit({ at: new Date().toISOString(), kind: "auth", actor: ip, ok: false, message: "Admin login failed" });
        throw new HttpError(401, "סיסמה שגויה");
      }
      sessions.issue(res);
      return { ok: true };
    })
  );

  api.post(
    "/logout",
    wrap((req, res) => {
      sessions.clear(req, res);
      return { ok: true };
    })
  );

  // ---- everything below requires an admin session ----
  api.use((req, res, next) => {
    if (!sessions.isAuthenticated(req)) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    next();
  });

  api.get("/accounts", wrap(() => ({ accounts: accounts.list() })));

  api.post(
    "/accounts",
    wrap(async (req) => {
      const b = req.body as Record<string, unknown>;
      const account = await accounts.create({
        name: String(b.name || ""),
        companyId: Number(b.companyId),
        apiKey: String(b.apiKey || ""),
        apiPublicKey: b.apiPublicKey ? String(b.apiPublicKey) : undefined,
        baseUrl: b.baseUrl ? String(b.baseUrl) : undefined,
        notes: b.notes ? String(b.notes) : undefined,
        isDefault: !!b.isDefault
      });
      void deps.store.audit({ at: new Date().toISOString(), kind: "admin", actor: "admin", account: account.name, ok: true, message: "Account created" });
      return { account };
    })
  );

  api.put(
    "/accounts/:id",
    wrap(async (req) => {
      const b = req.body as Record<string, unknown>;
      const account = await accounts.update(String(req.params.id), {
        name: b.name !== undefined ? String(b.name) : undefined,
        companyId: b.companyId !== undefined && b.companyId !== "" ? Number(b.companyId) : undefined,
        apiKey: b.apiKey ? String(b.apiKey) : undefined,
        apiPublicKey: b.apiPublicKey !== undefined ? String(b.apiPublicKey) : undefined,
        baseUrl: b.baseUrl !== undefined ? String(b.baseUrl) : undefined,
        notes: b.notes !== undefined ? String(b.notes) : undefined,
        isDefault: !!b.isDefault
      });
      void deps.store.audit({ at: new Date().toISOString(), kind: "admin", actor: "admin", account: account.name, ok: true, message: "Account updated" });
      return { account };
    })
  );

  api.delete(
    "/accounts/:id",
    wrap(async (req) => {
      const rec = accounts.getRecord(String(req.params.id));
      await accounts.remove(String(req.params.id));
      void deps.store.audit({ at: new Date().toISOString(), kind: "admin", actor: "admin", account: rec?.name, ok: true, message: "Account deleted" });
      return { ok: true };
    })
  );

  api.post(
    "/accounts/:id/default",
    wrap(async (req) => {
      await accounts.setDefault(String(req.params.id));
      return { ok: true };
    })
  );

  api.post(
    "/accounts/:id/test",
    wrap(async (req) => {
      const result = await accounts.test(String(req.params.id));
      const rec = accounts.getRecord(String(req.params.id));
      void deps.store.audit({ at: new Date().toISOString(), kind: "admin", actor: "admin", account: rec?.name, ok: result.ok, path: "/website/companies/getdetails/", message: result.message });
      return result;
    })
  );

  api.get("/tokens", wrap(() => ({ tokens: tokens.list() })));

  api.post(
    "/tokens",
    wrap(async (req) => {
      const b = req.body as { name?: string; accountIds?: string[] | "all"; scopes?: string[]; expiresInDays?: number };
      const created = await tokens.create({
        name: String(b.name || ""),
        accountIds: b.accountIds === "all" || !b.accountIds ? "all" : b.accountIds,
        scopes: (b.scopes || ["read"]) as never,
        expiresInDays: b.expiresInDays ? Number(b.expiresInDays) : undefined
      });
      void deps.store.audit({ at: new Date().toISOString(), kind: "admin", actor: "admin", ok: true, message: `Token created: ${created.record.name}` });
      return created;
    })
  );

  api.delete(
    "/tokens/:id",
    wrap(async (req) => {
      await tokens.revoke(String(req.params.id));
      void deps.store.audit({ at: new Date().toISOString(), kind: "admin", actor: "admin", ok: true, message: `Token revoked: ${req.params.id}` });
      return { ok: true };
    })
  );

  api.get("/oauth/grants", wrap(() => ({ grants: deps.oauth?.listGrants() ?? [], clients: deps.oauth?.listClients() ?? [] })));

  api.delete(
    "/oauth/grants/:id",
    wrap(async (req) => {
      if (!deps.oauth) throw new HttpError(404, "OAuth disabled");
      await deps.oauth.revokeGrant(String(req.params.id));
      return { ok: true };
    })
  );

  api.get(
    "/audit",
    wrap((req) => {
      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
      return { entries: deps.store.get().audit.slice(0, limit) };
    })
  );

  api.get(
    "/catalog",
    wrap(() => ({
      tools: catalog.map((e) => ({ tool: `sumit_${e.name}`, title: e.title, path: e.path, module: e.module, scope: e.scope, confidence: e.confidence, description: e.description })),
      imported: loadGeneratedCatalog().map((g) => ({ tool: `sumit_api_${g.slug}`, path: g.path, scope: g.scope, title: g.summary }))
    }))
  );

  router.use("/api", api);

  // error handler
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : 400;
    const message = err instanceof Error ? err.message : String(err);
    if (status >= 500) deps.log("error", "admin error", { message });
    res.status(status).json({ error: message });
  });

  return router;
}
