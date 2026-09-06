import path from "node:path";

function envBool(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return def;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function envInt(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

export interface AppConfig {
  port: number;
  host: string;
  publicUrl: string;
  trustProxy: boolean;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = envInt("PORT", 8080);
  const publicUrl = (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, "");
  return {
    port,
    host: env.HOST || "0.0.0.0",
    publicUrl,
    trustProxy: envBool("TRUST_PROXY", false),
    dataDir: path.resolve(env.DATA_DIR || "./data"),
    masterKey: env.MASTER_KEY || undefined,
    adminPassword: env.ADMIN_PASSWORD || undefined,
    allowUrlTokens: envBool("ALLOW_URL_TOKENS", true),
    oauthEnabled: envBool("OAUTH_ENABLED", true),
    sumitBaseUrl: (env.SUMIT_BASE_URL || "https://api.sumit.co.il").replace(/\/+$/, ""),
    sumitTimeoutMs: envInt("SUMIT_TIMEOUT_MS", 60_000),
    sessionTtlMinutes: envInt("ADMIN_SESSION_TTL_MINUTES", 12 * 60),
    mcpSessionIdleMinutes: envInt("MCP_SESSION_IDLE_MINUTES", 120),
    logLevel: env.LOG_LEVEL || "info",
    nodeEnv: env.NODE_ENV || "development"
  };
}
