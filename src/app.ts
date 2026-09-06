import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { validateConfig, type AppConfig } from "./config.js";
import { Cipher, loadOrCreateMasterKey } from "./core/crypto.js";
import { JsonStore } from "./core/store.js";
import { AccountRegistry } from "./core/accounts.js";
import { ApiTokenService } from "./auth/tokens.js";
import { SumitOAuthProvider } from "./auth/oauth.js";
import { fromAuthInfo, toAuthInfo, type ConnectionIdentity } from "./auth/identity.js";
import { AdminAuth, AdminSessions } from "./admin/auth.js";
import { createAdminRouter } from "./admin/router.js";
import { McpSessionManager } from "./mcp/sessions.js";
import type { ToolContext } from "./mcp/context.js";
import { createLogger, type Logger } from "./logger.js";
import { SERVER_NAME, SERVER_VERSION } from "./mcp/server.js";

export interface AppDeps {
  config: AppConfig;
  log: Logger;
  store: JsonStore;
  cipher: Cipher;
  accounts: AccountRegistry;
  tokens: ApiTokenService;
  adminAuth: AdminAuth;
  adminSessions: AdminSessions;
  oauth?: SumitOAuthProvider;
  oauthActive: boolean;
  mcpSessions: McpSessionManager;
}

export interface BootstrapOverrides {
  fetchImpl?: typeof fetch;
  log?: Logger;
  store?: JsonStore;
  masterKey?: string;
}

/** Wires all services together (used by the HTTP server, the stdio entrypoint and tests). */
export function bootstrap(config: AppConfig, overrides: BootstrapOverrides = {}): AppDeps {
  validateConfig(config);
  const log = overrides.log || createLogger(config.logLevel);
  const masterKey = overrides.masterKey || loadOrCreateMasterKey(config.dataDir, config.masterKey);
  const cipher = new Cipher(masterKey);
  const store = overrides.store || new JsonStore(config.dataDir);
  const accounts = new AccountRegistry(store, cipher, { baseUrl: config.sumitBaseUrl, timeoutMs: config.sumitTimeoutMs, fetchImpl: overrides.fetchImpl });
  const tokens = new ApiTokenService(store);
  const adminAuth = new AdminAuth(store, config.adminPassword);
  const publicUrl = new URL(config.publicUrl);
  const adminSessions = new AdminSessions({ secret: masterKey + ":admin-session", ttlMs: config.sessionTtlMinutes * 60_000, secure: publicUrl.protocol === "https:" });

  const insecureAllowed = process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL === "true" || process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL === "1";
  const issuerOk = publicUrl.protocol === "https:" || publicUrl.hostname === "localhost" || publicUrl.hostname === "127.0.0.1" || insecureAllowed;
  const oauthActive = config.oauthEnabled && issuerOk;
  if (config.oauthEnabled && !issuerOk) {
    log("warn", "OAuth disabled: PUBLIC_URL must use https (or localhost). Token based auth still works.", { publicUrl: config.publicUrl });
  }
  const oauth = oauthActive
    ? new SumitOAuthProvider({
        store,
        accounts,
        secret: masterKey + ":oauth",
        publicUrl: config.publicUrl,
        verifyAdminPassword: (pw, ip) => adminAuth.verify(pw, ip),
        isAdminSession: (req) => adminSessions.isAuthenticated(req)
      })
    : undefined;

  const createContext = (identity: ConnectionIdentity): ToolContext => ({
    accounts,
    store,
    allowedAccountIds: identity.accountIds,
    scopes: identity.scopes,
    actor: `${identity.kind}:${identity.name}`,
    log: (level, msg, meta) => log(level, msg, meta)
  });

  const mcpSessions = new McpSessionManager({ createContext, idleMs: config.mcpSessionIdleMinutes * 60_000, log });

  const undecryptable = accounts.undecryptableAccounts();
  if (undecryptable.length) {
    log("error", "MASTER_KEY does not match the stored data: these accounts cannot be decrypted. Restore the original MASTER_KEY (env or DATA_DIR/master.key) or re-enter their API keys in the admin console.", { accounts: undecryptable });
  }
  if (config.nodeEnv === "production" && publicUrl.protocol !== "https:") {
    log("error", "PUBLIC_URL is not https — Claude.ai OAuth connectors will not work and admin cookies are not marked Secure.", { publicUrl: config.publicUrl });
  }

  return { config, log, store, cipher, accounts, tokens, adminAuth, adminSessions, oauth, oauthActive, mcpSessions };
}

export function createApp(deps: AppDeps): Express {
  const { config, log, tokens, oauth, mcpSessions } = deps;
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy !== false) app.set("trust proxy", config.trustProxy);

  const publicUrl = new URL(config.publicUrl);
  const mcpUrl = new URL("/mcp", publicUrl);
  const resourceMetadataUrl = new URL(`/.well-known/oauth-protected-resource/mcp`, publicUrl).href;

  // CORS for browser based MCP clients (MCP Inspector, web IDEs)
  app.use(
    ["/mcp", "/mcp/*splat", "/sse", "/sse/*splat", "/messages", "/messages/*splat", "/.well-known/*splat", "/register", "/token", "/authorize", "/revoke"],
    cors({ origin: true, credentials: false, exposedHeaders: ["Mcp-Session-Id", "WWW-Authenticate"], allowedHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "Mcp-Protocol-Version", "Last-Event-ID"] })
  );

  // Streaming endpoints: make sure intermediate proxies never buffer the event stream
  app.use(["/mcp", "/mcp/*splat", "/sse", "/sse/*splat"], (_req, res, next) => {
    res.setHeader("X-Accel-Buffering", "no");
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, name: SERVER_NAME, version: SERVER_VERSION, sessions: mcpSessions.size });
  });
  app.get("/", (_req, res) => res.redirect("/admin"));

  // ---- OAuth authorization server (for Claude.ai custom connectors) ----
  if (oauth) {
    app.use(
      mcpAuthRouter({
        provider: oauth,
        issuerUrl: publicUrl,
        baseUrl: publicUrl,
        resourceServerUrl: mcpUrl,
        scopesSupported: ["read", "write", "payments"],
        resourceName: "SUMIT MCP",
        serviceDocumentationUrl: new URL("/admin", publicUrl),
        clientRegistrationOptions: { clientSecretExpirySeconds: 0 }
      })
    );
    app.post(oauth.consentPath, express.urlencoded({ extended: false }), (req, res, next) => {
      oauth.handleConsent(req, res).catch(next);
    });
  }

  // ---- bearer authentication (API tokens + OAuth access tokens) ----
  const verifier = {
    verifyAccessToken: async (token: string): Promise<AuthInfo> => {
      const identity = await tokens.verify(token);
      if (identity) return toAuthInfo(token, identity);
      if (oauth) return oauth.verifyAccessToken(token);
      throw new InvalidTokenError("Invalid or revoked token");
    }
  };
  const bearer = requireBearerAuth({ verifier, resourceMetadataUrl });

  const urlToken = (req: Request, res: Response, next: NextFunction) => {
    if (!config.allowUrlTokens) {
      res.status(404).json({ error: "URL tokens are disabled (ALLOW_URL_TOKENS=false)" });
      return;
    }
    // The secret is part of the URL: keep it out of referrers and caches.
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    req.headers.authorization = `Bearer ${req.params.token}`;
    next();
  };

  const identityOf = (req: Request): ConnectionIdentity => fromAuthInfo(req.auth as AuthInfo);

  const mcpHandler = (req: Request, res: Response, next: NextFunction) => {
    mcpSessions.handleStreamable(req, res, identityOf(req)).catch(next);
  };
  const sseConnect = (messagesPath: string) => (req: Request, res: Response, next: NextFunction) => {
    mcpSessions.handleSseConnect(req, res, identityOf(req), messagesPath).catch(next);
  };
  const sseMessage = (req: Request, res: Response, next: NextFunction) => {
    mcpSessions.handleSseMessage(req, res, identityOf(req)).catch(next);
  };

  const jsonBody = express.json({ limit: "10mb" });

  app.all("/mcp", jsonBody, bearer, mcpHandler);
  app.all("/mcp/t/:token", jsonBody, urlToken, bearer, mcpHandler);
  app.get("/sse", bearer, sseConnect("/messages"));
  app.post("/messages", jsonBody, bearer, sseMessage);
  app.get("/sse/t/:token", urlToken, bearer, (req, res, next) => sseConnect(`/messages/t/${req.params.token}`)(req, res, next));
  app.post("/messages/t/:token", jsonBody, urlToken, bearer, sseMessage);

  // ---- admin console ----
  app.use("/admin", createAdminRouter({ config, store: deps.store, accounts: deps.accounts, tokens, oauth, adminAuth: deps.adminAuth, sessions: deps.adminSessions, log, oauthActive: deps.oauthActive }));

  app.use((req, res) => {
    res.status(404).json({ error: "Not found", path: req.path });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "unhandled error", { message, stack: err instanceof Error ? err.stack : undefined });
    if (res.headersSent) return;
    res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: `Internal error: ${message}` }, id: null });
  });

  return app;
}
