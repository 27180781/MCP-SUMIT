import path from "node:path";

type Env = NodeJS.ProcessEnv;

function envBool(env: Env, name: string, def: boolean): boolean {
  const v = env[name];
  if (v === undefined || v === "") return def;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function envInt(env: Env, name: string, def: number): number {
  const v = env[name];
  if (v === undefined || v === "") return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

/**
 * TRUST_PROXY controls Express' "trust proxy" setting:
 *   - unset / false / 0  → no proxy (req.ip is the socket address)
 *   - true / 1           → exactly ONE reverse-proxy hop (CapRover / nginx / Caddy / Railway...)
 *   - N                  → N hops (e.g. 2 for Cloudflare in front of nginx)
 *   - anything else      → passed through to Express (e.g. "loopback, 10.0.0.0/8" or an IP list)
 * Never trust "all hops": a client could spoof X-Forwarded-For and bypass per-IP lockouts.
 */
export function parseTrustProxy(raw: string | undefined): false | number | string {
  const v = (raw || "").trim();
  if (!v || ["0", "false", "no", "off"].includes(v.toLowerCase())) return false;
  if (["true", "yes", "on"].includes(v.toLowerCase())) return 1;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

export interface AppConfig {
  port: number;
  host: string;
  publicUrl: string;
  trustProxy: false | number | string;
  dataDir: string;
  masterKey?: string;
  adminPassword?: string;
  allowUrlTokens: boolean;
  oauthEnabled: boolean;
  sumitBaseUrl: string;
  sumitTimeoutMs: number;
  sessionTtlMinutes: number;
  mcpSessionIdleMinutes: number;
  logLevel: string;
  nodeEnv: string;
}

const PLACEHOLDER = /<[^>]*>/;

/**
 * Rejects values that were copied from the examples without being filled in.
 * Throws an Error whose message says exactly what to change.
 */
export function validateConfig(config: AppConfig, env: Env = process.env): void {
  const problems: string[] = [];
  if (PLACEHOLDER.test(config.publicUrl)) {
    problems.push(`PUBLIC_URL still contains a placeholder ("${config.publicUrl}") — set the real https address of this server, e.g. https://sumit-mcp.apps.example.com`);
  } else {
    try {
      const u = new URL(config.publicUrl);
      if (!/^https?:$/.test(u.protocol)) problems.push(`PUBLIC_URL must start with http:// or https:// (got "${config.publicUrl}")`);
    } catch {
      problems.push(`PUBLIC_URL is not a valid URL ("${config.publicUrl}")`);
    }
  }
  if (config.adminPassword !== undefined && PLACEHOLDER.test(config.adminPassword)) {
    problems.push("ADMIN_PASSWORD still contains the placeholder value — choose a real password (8+ characters)");
  }
  if (config.adminPassword !== undefined && config.adminPassword.length < 8) {
    problems.push("ADMIN_PASSWORD must be at least 8 characters");
  }
  if (env.SUMIT_BASE_URL && PLACEHOLDER.test(env.SUMIT_BASE_URL)) problems.push("SUMIT_BASE_URL contains a placeholder — remove the variable to use https://api.sumit.co.il");
  if (problems.length) throw new Error(problems.join("\n"));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = envInt(env, "PORT", 8080);
  const publicUrl = (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, "");
  return {
    port,
    host: env.HOST || "0.0.0.0",
    publicUrl,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    dataDir: path.resolve(env.DATA_DIR || "./data"),
    masterKey: env.MASTER_KEY || undefined,
    adminPassword: env.ADMIN_PASSWORD || undefined,
    allowUrlTokens: envBool(env, "ALLOW_URL_TOKENS", true),
    oauthEnabled: envBool(env, "OAUTH_ENABLED", true),
    sumitBaseUrl: (env.SUMIT_BASE_URL || "https://api.sumit.co.il").replace(/\/+$/, ""),
    sumitTimeoutMs: envInt(env, "SUMIT_TIMEOUT_MS", 60_000),
    sessionTtlMinutes: envInt(env, "ADMIN_SESSION_TTL_MINUTES", 12 * 60),
    mcpSessionIdleMinutes: envInt(env, "MCP_SESSION_IDLE_MINUTES", 120),
    logLevel: env.LOG_LEVEL || "info",
    nodeEnv: env.NODE_ENV || "development"
  };
}
