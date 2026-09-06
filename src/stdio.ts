/**
 * stdio entrypoint — run the SUMIT MCP server locally (Claude Desktop, Claude Code, Cursor...).
 *
 * Accounts come from (first match wins):
 *   1. SUMIT_ACCOUNTS='[{"name":"...","companyId":123,"apiKey":"..."}]'
 *   2. SUMIT_COMPANY_ID + SUMIT_API_KEY (+ SUMIT_ACCOUNT_NAME, SUMIT_API_PUBLIC_KEY)
 *   3. The encrypted store in DATA_DIR (accounts managed through the admin console)
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { bootstrap } from "./app.js";
import { JsonStore, ALL_SCOPES } from "./core/store.js";
import { createMcpServer } from "./mcp/server.js";
import { createLogger } from "./logger.js";
import { randomToken } from "./core/crypto.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.logLevel);
  const env = process.env;

  let store: JsonStore | undefined;
  let masterKey: string | undefined;
  const envAccounts: { name: string; companyId: number; apiKey: string; apiPublicKey?: string; baseUrl?: string }[] = [];
  if (env.SUMIT_ACCOUNTS) {
    try {
      const parsed = JSON.parse(env.SUMIT_ACCOUNTS) as typeof envAccounts;
      for (const a of parsed) envAccounts.push({ name: String(a.name), companyId: Number(a.companyId), apiKey: String(a.apiKey), apiPublicKey: a.apiPublicKey, baseUrl: a.baseUrl });
    } catch (err) {
      log("error", `SUMIT_ACCOUNTS is not valid JSON: ${(err as Error).message}`);
      process.exit(1);
    }
  } else if (env.SUMIT_COMPANY_ID && env.SUMIT_API_KEY) {
    envAccounts.push({ name: env.SUMIT_ACCOUNT_NAME || `SUMIT ${env.SUMIT_COMPANY_ID}`, companyId: Number(env.SUMIT_COMPANY_ID), apiKey: env.SUMIT_API_KEY, apiPublicKey: env.SUMIT_API_PUBLIC_KEY || undefined });
  }
  if (envAccounts.length) {
    store = new JsonStore(config.dataDir, "stdio-store.json", { persist: false });
    masterKey = randomToken("ephemeral_", 32);
  }

  const deps = bootstrap(config, { log, store, masterKey });
  for (const a of envAccounts) await deps.accounts.create({ ...a, isDefault: false });
  if (deps.store.get().accounts.length === 0) {
    log("warn", "No SUMIT accounts configured. Set SUMIT_COMPANY_ID/SUMIT_API_KEY (or SUMIT_ACCOUNTS) or add accounts via the admin console.");
  }

  const server = createMcpServer({
    accounts: deps.accounts,
    store: deps.store,
    allowedAccountIds: "all",
    scopes: ALL_SCOPES.filter((s) => s !== "admin"),
    actor: "stdio:local",
    log: (level, msg, meta) => log(level, msg, meta)
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "SUMIT MCP stdio server ready", { accounts: deps.store.get().accounts.map((a) => a.name) });
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).stack || err}\n`);
  process.exit(1);
});
