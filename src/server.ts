import { loadConfig } from "./config.js";
import { bootstrap, createApp } from "./app.js";

const config = loadConfig();
let deps: ReturnType<typeof bootstrap>;
try {
  deps = bootstrap(config);
} catch (err) {
  process.stderr.write(`[sumit-mcp] startup failed: ${(err as Error).message}\n`);
  process.stderr.write(
    "[sumit-mcp] Fix the environment variables and redeploy. CapRover: Apps → <app> → App Configs → Environment Variables → Save & Update. " +
      "Generate secrets with: openssl rand -hex 32 (or ./deploy/caprover/make-env.sh)\n"
  );
  process.exit(1);
}
process.on("unhandledRejection", (reason) => {
  deps.log("error", "unhandled promise rejection — exiting", { reason: reason instanceof Error ? reason.stack || reason.message : String(reason) });
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  deps.log("error", "uncaught exception — exiting", { error: err.stack || err.message });
  process.exit(1);
});
const app = createApp(deps);

const server = app.listen(config.port, config.host, () => {
  deps.log("info", `SUMIT MCP server listening`, {
    url: `http://${config.host}:${config.port}`,
    publicUrl: config.publicUrl,
    mcp: `${config.publicUrl}/mcp`,
    admin: `${config.publicUrl}/admin`,
    oauth: deps.oauthActive,
    accounts: deps.store.get().accounts.length
  });
  if (!deps.adminAuth.isConfigured()) deps.log("warn", `No admin password yet — open ${config.publicUrl}/admin to create one (or set ADMIN_PASSWORD).`);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  deps.log("info", `received ${signal}, shutting down`);
  await deps.mcpSessions.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
