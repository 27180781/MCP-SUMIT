import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadConfig } from "../src/config.js";
import { bootstrap, createApp, type AppDeps } from "../src/app.js";
import { startFakeSumit } from "./helpers/fake-sumit.js";

let fake: Awaited<ReturnType<typeof startFakeSumit>>;
let deps: AppDeps;
let httpServer: Server;
let base: string;
let cookie = "";
let dataDir: string;

const adminFetch = (p: string, init: RequestInit = {}) =>
  fetch(base + "/admin/api" + p, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Requested-With": "sumit-admin", Cookie: cookie, ...(init.headers || {}) }
  });

beforeAll(async () => {
  fake = await startFakeSumit({ 100: "key-100", 200: "key-200" });
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sumit-mcp-test-"));
  const config = loadConfig({
    PORT: "0",
    PUBLIC_URL: "http://localhost:0",
    DATA_DIR: dataDir,
    MASTER_KEY: "test-master-key-0123456789",
    SUMIT_BASE_URL: fake.baseUrl,
    LOG_LEVEL: "error"
  });
  deps = bootstrap(config, { log: () => undefined });
  const app = createApp(deps);
  httpServer = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await deps.mcpSessions.shutdown();
  await new Promise<void>((r) => httpServer.close(() => r()));
  await fake.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("admin console API", () => {
  it("requires setup then login", async () => {
    const status = await (await fetch(base + "/admin/api/status")).json();
    expect(status.configured).toBe(false);
    const setup = await adminFetch("/setup", { method: "POST", body: JSON.stringify({ password: "correct horse" }) });
    expect(setup.status).toBe(200);
    cookie = (setup.headers.get("set-cookie") || "").split(";")[0];
    expect(cookie).toContain("sumit_admin=");
  });

  it("rejects a bad password and blocks CSRF-less writes", async () => {
    const bad = await fetch(base + "/admin/api/login", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "sumit-admin" }, body: JSON.stringify({ password: "nope" }) });
    expect(bad.status).toBe(401);
    const csrf = await fetch(base + "/admin/api/accounts", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}" });
    expect(csrf.status).toBe(403);
  });

  it("creates accounts and tests the connection", async () => {
    const a = await adminFetch("/accounts", { method: "POST", body: JSON.stringify({ name: "העסק הראשי", companyId: 100, apiKey: "key-100", isDefault: true }) });
    expect(a.status).toBe(200);
    const b = await adminFetch("/accounts", { method: "POST", body: JSON.stringify({ name: "עמותה", companyId: 200, apiKey: "key-200" }) });
    expect(b.status).toBe(200);
    const list = await (await adminFetch("/accounts")).json();
    expect(list.accounts).toHaveLength(2);
    expect(list.accounts[0].apiKeyMasked).not.toContain("key-100");
    const test = await (await adminFetch(`/accounts/${list.accounts[0].id}/test`, { method: "POST" })).json();
    expect(test.ok).toBe(true);
    expect(test.message).toContain("Company 100");
    // stored encrypted
    const raw = fs.readFileSync(path.join(dataDir, "store.json"), "utf8");
    expect(raw).not.toContain("key-100");
  });
});

describe("MCP over Streamable HTTP", () => {
  let token: string;
  let readOnlyToken: string;
  let secondAccountId: string;

  it("issues tokens", async () => {
    const accounts = (await (await adminFetch("/accounts")).json()).accounts as { id: string; name: string }[];
    secondAccountId = accounts.find((a) => a.name === "עמותה")!.id;
    const t = await (await adminFetch("/tokens", { method: "POST", body: JSON.stringify({ name: "claude", scopes: ["read", "write", "payments"], accountIds: "all" }) })).json();
    token = t.token;
    expect(token.startsWith("smt_")).toBe(true);
    const r = await (await adminFetch("/tokens", { method: "POST", body: JSON.stringify({ name: "viewer", scopes: ["read"], accountIds: [secondAccountId] }) })).json();
    readOnlyToken = r.token;
  });

  it("rejects requests without a valid token and advertises the resource metadata", async () => {
    const res = await fetch(base + "/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }) });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("oauth-protected-resource");
    const bad = await fetch(base + "/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer smt_nope" }, body: "{}" });
    expect(bad.status).toBe(401);
  });

  it("lists tools and calls them for the right account", async () => {
    const client = new Client({ name: "test", version: "1.0" });
    const transport = new StreamableHTTPClientTransport(new URL(base + "/mcp"), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toContain("sumit_documents_create");
    expect(names).toContain("sumit_payments_charge");
    expect(names).toContain("sumit_api_request");
    expect(names.length).toBeGreaterThan(55);

    const accounts = await client.callTool({ name: "sumit_list_accounts", arguments: {} });
    const text = (accounts.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("העסק הראשי");
    expect(text).toContain("עמותה");

    // default account (100)
    const vat = await client.callTool({ name: "sumit_general_get_vat_rate", arguments: {} });
    expect(vat.isError).toBeFalsy();
    expect((vat.content as { text: string }[])[0].text).toContain("VATRate");
    expect(fake.calls.at(-1)!.body.Credentials).toEqual({ CompanyID: 100, APIKey: "key-100" });

    // explicit second account by name
    const doc = await client.callTool({
      name: "sumit_documents_create",
      arguments: { account: "עמותה", type: 0, customer: { Name: "לקוח" }, items: [{ Item: { Name: "פריט" }, Quantity: 1, UnitPrice: 10 }], extra: { ResponseLanguage: 0 } }
    });
    expect(doc.isError).toBeFalsy();
    const last = fake.calls.at(-1)!;
    expect(last.path).toBe("/accounting/documents/create/");
    expect(last.body.Credentials).toEqual({ CompanyID: 200, APIKey: "key-200" });
    expect((last.body.Details as { Type: number }).Type).toBe(0);
    expect(last.body.ResponseLanguage).toBe(0);
    expect((doc.content as { text: string }[])[0].text).toContain("DocumentID");

    // session default switch
    await client.callTool({ name: "sumit_use_account", arguments: { account: "200" } });
    await client.callTool({ name: "sumit_general_get_vat_rate", arguments: {} });
    expect(fake.calls.at(-1)!.body.Credentials).toEqual({ CompanyID: 200, APIKey: "key-200" });

    // PDF comes back as an embedded resource
    const pdf = await client.callTool({ name: "sumit_documents_get_pdf", arguments: { documentId: 5 } });
    const res = (pdf.content as { type: string; resource?: { mimeType: string; blob: string } }[]).find((c) => c.type === "resource");
    expect(res?.resource?.mimeType).toBe("application/pdf");

    // raw request
    const raw = await client.callTool({ name: "sumit_api_request", arguments: { path: "/crm/schema/listfolders/", body: { NameFilter: "x" } } });
    expect(raw.isError).toBeFalsy();
    expect(fake.calls.at(-1)!.path).toBe("/crm/schema/listfolders/");

    // close a quote through the CRM entity (multi-step tool)
    const closed = await client.callTool({ name: "sumit_documents_set_closed", arguments: { documentId: 5001 } });
    expect(closed.isError).toBeFalsy();
    expect((closed.content as { text: string }[])[0].text).toContain("CLOSED");
    const upd = fake.calls.filter((c) => c.path === "/crm/data/updateentity/").at(-1)!;
    expect(upd.body).toEqual({ Credentials: { CompanyID: 200, APIKey: "key-200" }, Entity: { ID: 5001, Folder: "109268653", Properties: { Accounting_Closed: true } } });
    const again = await client.callTool({ name: "sumit_documents_set_closed", arguments: { documentId: 5001 } });
    expect((again.content as { text: string }[])[0].text).toContain("already closed");
    const reopened = await client.callTool({ name: "sumit_documents_set_closed", arguments: { documentId: 5001, closed: false } });
    expect((reopened.content as { text: string }[])[0].text).toContain("OPEN");

    // unknown account
    const unknown = await client.callTool({ name: "sumit_general_get_vat_rate", arguments: { account: "לא קיים" } });
    expect(unknown.isError).toBe(true);
    await client.close();
  });

  it("enforces scopes and account restrictions per token", async () => {
    const client = new Client({ name: "viewer", version: "1.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp/t/" + readOnlyToken)));
    const accounts = await client.callTool({ name: "sumit_list_accounts", arguments: {} });
    const text = (accounts.content as { text: string }[])[0].text;
    expect(text).toContain("עמותה");
    expect(text).not.toContain("העסק הראשי");
    const denied = await client.callTool({ name: "sumit_documents_create", arguments: { type: 0, customer: { Name: "x" }, items: [{ Item: { Name: "y" }, UnitPrice: 1 }] } });
    expect(denied.isError).toBe(true);
    expect((denied.content as { text: string }[])[0].text).toContain("Permission denied");
    const other = await client.callTool({ name: "sumit_general_get_vat_rate", arguments: { account: "העסק הראשי" } });
    expect(other.isError).toBe(true);
    const ok = await client.callTool({ name: "sumit_general_get_vat_rate", arguments: {} });
    expect(ok.isError).toBeFalsy();
    expect(fake.calls.at(-1)!.body.Credentials).toEqual({ CompanyID: 200, APIKey: "key-200" });
    await client.close();
  });

  it("revoked tokens stop working", async () => {
    const tokens = (await (await adminFetch("/tokens")).json()).tokens as { id: string; name: string }[];
    const viewer = tokens.find((t) => t.name === "viewer")!;
    await adminFetch(`/tokens/${viewer.id}`, { method: "DELETE" });
    const res = await fetch(base + "/mcp/t/" + readOnlyToken, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "{}" });
    expect(res.status).toBe(401);
  });

  it("records an audit trail without secrets", async () => {
    const audit = await (await adminFetch("/audit?limit=50")).json();
    expect(audit.entries.some((e: { tool?: string }) => e.tool === "sumit_documents_create")).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("key-200");
  });
});

describe("OAuth authorization server", () => {
  it("serves metadata and completes an authorization code flow with consent", async () => {
    const meta = await (await fetch(base + "/.well-known/oauth-authorization-server")).json();
    expect(meta.authorization_endpoint).toContain("/authorize");
    const prm = await (await fetch(base + "/.well-known/oauth-protected-resource/mcp")).json();
    expect(prm.resource).toContain("/mcp");

    const reg = await (await fetch(base + "/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }) })).json();
    expect(reg.client_id).toBeTruthy();

    const verifier = "v".repeat(64);
    const { createHash } = await import("node:crypto");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorizeUrl = `${base}/authorize?response_type=code&client_id=${encodeURIComponent(reg.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz&scope=read%20write`;
    const page = await fetch(authorizeUrl);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("אישור גישה");
    const blob = /name="req" value="([^"]+)"/.exec(html)![1];
    const accountIds = (await (await adminFetch("/accounts")).json()).accounts.map((a: { id: string }) => a.id) as string[];

    // wrong password → re-rendered with error
    const bad = await fetch(base + "/oauth/consent", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams([["req", blob], ["decision", "approve"], ["password", "wrong"], ["account", accountIds[0]], ["scope", "read"]]) });
    expect(bad.status).toBe(401);

    const consent = await fetch(base + "/oauth/consent", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams([["req", blob], ["decision", "approve"], ["password", "correct horse"], ["account", accountIds[0]], ["scope", "read"], ["scope", "write"]]) });
    expect(consent.status).toBe(302);
    const location = new URL(consent.headers.get("location")!);
    expect(location.searchParams.get("state")).toBe("xyz");
    const code = location.searchParams.get("code")!;
    expect(code).toBeTruthy();

    const tokenRes = await fetch(base + "/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: reg.client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback" }) });
    const tokens = await tokenRes.json();
    expect(tokenRes.status).toBe(200);
    expect(tokens.access_token.startsWith("smo_")).toBe(true);
    expect(tokens.scope).toBe("read write");

    // use the OAuth token against MCP: only the granted account is visible
    const client = new Client({ name: "oauth", version: "1.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } }));
    const accounts = await client.callTool({ name: "sumit_list_accounts", arguments: {} });
    const text = (accounts.content as { text: string }[])[0].text;
    expect(text).toContain("העסק הראשי");
    expect(text).not.toContain("עמותה");
    const charge = await client.callTool({ name: "sumit_payments_charge", arguments: { customer: { ID: 1 }, items: [{ Item: { Name: "x" }, UnitPrice: 5 }] } });
    expect(charge.isError).toBe(true); // no payments scope
    await client.close();

    // refresh token rotation
    const refreshed = await (await fetch(base + "/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: reg.client_id }) })).json();
    expect(refreshed.access_token).toBeTruthy();
    expect(refreshed.access_token).not.toBe(tokens.access_token);

    const grants = await (await adminFetch("/oauth/grants")).json();
    expect(grants.grants.length).toBeGreaterThan(0);
  });
});
