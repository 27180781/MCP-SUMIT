import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { catalog, type EndpointDef, type ToolScope } from "./catalog/index.js";
import { ToolError, accessibleAccounts, assertScope, resolveAccount, type ToolContext } from "./context.js";
import { redact } from "../core/redact.js";
import { normalizePath, type SumitCallResult } from "../core/sumit-client.js";
import { loadGeneratedCatalog, type GeneratedEndpoint } from "./generated.js";

const MAX_TEXT = 160_000;

const accountParam = z
  .string()
  .optional()
  .describe("חשבון סאמיט לביצוע הפעולה — שם החשבון, מזהה, או CompanyID. אפשר להשמיט כשיש חשבון ברירת מחדל / חשבון יחיד (ראו sumit_list_accounts).");

const extraParam = z
  .record(z.string(), z.unknown())
  .optional()
  .describe("שדות נוספים שיתווספו לגוף הבקשה כפי שהם (לפי התיעוד הרשמי של סאמיט) — דורסים שדות שנבנו אוטומטית.");

function textResult(text: string, isError = false, extraContent: unknown[] = []): CallToolResult {
  return { content: [{ type: "text", text }, ...(extraContent as CallToolResult["content"])], isError };
}

function clip(text: string): string {
  if (text.length <= MAX_TEXT) return text;
  return text.slice(0, MAX_TEXT) + `\n\n[... truncated ${text.length - MAX_TEXT} characters — use paging / narrower filters ...]`;
}

export function formatSuccess(accountName: string, result: SumitCallResult, formatted?: { text: string; extraContent?: unknown[] }): CallToolResult {
  const json = result.json;
  const data = json && "Data" in json ? json.Data : json;
  const header = `✅ ${result.path} | account: ${accountName} | ${result.durationMs}ms`;
  if (formatted) return textResult(`${header}\n${formatted.text}`, false, formatted.extraContent);
  if (result.binary) {
    return textResult(`${header}\nBinary response (${result.binary.contentType}, ${result.binary.bytes} bytes) returned as base64 resource.`, false, [
      { type: "resource", resource: { uri: `sumit://binary${result.path}`, mimeType: result.binary.contentType, blob: result.binary.base64 } }
    ]);
  }
  const body = data === undefined || data === null ? "(no data)" : JSON.stringify(data, null, 2);
  const warnings = json?.UserErrorMessage ? `\nNote: ${json.UserErrorMessage}` : "";
  return textResult(clip(`${header}${warnings}\n${body}`));
}

export function formatFailure(accountName: string, result: SumitCallResult): CallToolResult {
  const lines = [`❌ ${result.path} | account: ${accountName} | HTTP ${result.httpStatus || "n/a"} | ${result.durationMs}ms`];
  if (result.json) {
    if (result.json.UserErrorMessage) lines.push(`UserErrorMessage: ${result.json.UserErrorMessage}`);
    if (result.json.TechnicalErrorDetails) lines.push(`TechnicalErrorDetails: ${result.json.TechnicalErrorDetails}`);
    lines.push(`Status: ${JSON.stringify(result.json.Status)}`);
    if (result.json.Data !== undefined && result.json.Data !== null) lines.push(`Data: ${clip(JSON.stringify(result.json.Data, null, 2))}`);
  } else if (result.errorMessage) {
    lines.push(result.errorMessage);
  }
  if (result.text) lines.push(`Response: ${result.text.slice(0, 2000)}`);
  lines.push("Hint: check field names against the SUMIT docs (https://app.sumit.co.il/developers/api/); unknown/extra fields can be passed via `extra`.");
  return textResult(lines.join("\n"), true);
}

function errorResult(err: unknown): CallToolResult {
  if (err instanceof ToolError) return textResult(`❌ ${err.message}${err.hint ? `\nHint: ${err.hint}` : ""}`, true);
  const msg = err instanceof Error ? err.message : String(err);
  return textResult(`❌ ${msg}`, true);
}

export function inferScopeFromPath(path: string): ToolScope {
  const p = normalizePath(path);
  if (/\/(billing\/payments\/(charge|multivendorcharge)|billing\/recurring\/charge|creditguy\/gateway\/)/.test(p)) return "payments";
  if (/\/(get|list|verify|count|find|search|check)[a-z]*\/$/.test(p) || /\/(getdetails|getpdf|listviews|listfolders|listquotas|listentities|getfolder|getentity|getdebt|getdebtreport|getvatrate|getexchangerate|getnextdocumentnumber|getforcustomer|listforcustomer|getdetailsurl)\/$/.test(p)) {
    return "read";
  }
  return "write";
}

/** Executes a SUMIT call for a tool, with scope enforcement, account resolution and audit logging. */
export async function executeCall(
  ctx: ToolContext,
  opts: { toolName: string; scope: ToolScope; path: string; body: Record<string, unknown>; accountRef?: string; timeoutMs?: number; usePublicKey?: boolean; format?: EndpointDef["format"] }
): Promise<CallToolResult> {
  assertScope(ctx, opts.scope, opts.toolName);
  const account = resolveAccount(ctx, opts.accountRef);
  const client = ctx.accounts.clientFor(account, opts.timeoutMs);
  const started = Date.now();
  let result: SumitCallResult;
  try {
    result = await client.call(opts.path, opts.body, { timeoutMs: opts.timeoutMs, usePublicKey: opts.usePublicKey });
  } catch (err) {
    void ctx.store.audit({ at: new Date().toISOString(), kind: "tool", actor: ctx.actor, account: account.name, tool: opts.toolName, path: opts.path, ok: false, ms: Date.now() - started, message: (err as Error).message });
    return errorResult(err);
  }
  void ctx.store.audit({
    at: new Date().toISOString(),
    kind: "tool",
    actor: ctx.actor,
    account: account.name,
    tool: opts.toolName,
    path: result.path,
    ok: result.ok,
    ms: result.durationMs,
    message: result.ok ? undefined : result.errorMessage?.slice(0, 300)
  });
  ctx.log(result.ok ? "info" : "warn", `tool ${opts.toolName} ${result.path} ${result.ok ? "ok" : "failed"}`, { account: account.name, ms: result.durationMs, body: redact(opts.body) });
  if (!result.ok) return formatFailure(account.name, result);
  return formatSuccess(account.name, result, opts.format?.(result));
}

function mergeExtra(body: Record<string, unknown>, extra?: Record<string, unknown>): Record<string, unknown> {
  if (!extra) return body;
  return { ...body, ...extra };
}

export function registerEndpointTool(server: McpServer, ctx: ToolContext, def: EndpointDef): void {
  const toolName = `sumit_${def.name}`;
  const confidenceNote = def.confidence === "high" ? "" : def.confidence === "medium" ? "\n(Request shape confidence: medium — verified against community client libraries.)" : "\n(Request shape confidence: LOW — inferred; if SUMIT rejects the call, pass exact fields via `extra` or use sumit_api_request.)";
  server.registerTool(
    toolName,
    {
      title: def.title,
      description: `${def.description}\nEndpoint: POST ${def.path} | scope: ${def.scope}${confidenceNote}`,
      inputSchema: { ...def.input, account: accountParam, extra: extraParam },
      annotations: { title: def.title, ...def.annotations, openWorldHint: true }
    },
    async (args: Record<string, unknown>) => {
      try {
        const { account, extra, ...rest } = args as { account?: string; extra?: Record<string, unknown> } & Record<string, unknown>;
        const body = mergeExtra(def.build(rest as never), extra);
        return await executeCall(ctx, { toolName, scope: def.scope, path: def.path, body, accountRef: account, timeoutMs: def.timeoutMs, usePublicKey: def.usePublicKey, format: def.format });
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}

export function registerGeneratedTool(server: McpServer, ctx: ToolContext, gen: GeneratedEndpoint): void {
  const toolName = `sumit_api_${gen.slug}`;
  const fields = gen.fields.length
    ? "\nRequest fields:\n" + gen.fields.map((f) => `- ${f.name}${f.required ? " (required)" : ""}: ${f.type}${f.enum ? ` [${f.enum.join("|")}]` : ""}${f.description ? ` — ${f.description}` : ""}`).join("\n")
    : "";
  server.registerTool(
    toolName,
    {
      title: gen.summary || gen.path,
      description: `${gen.summary || ""}${gen.description ? `\n${gen.description}` : ""}\nEndpoint: POST ${gen.path} | scope: ${gen.scope} (imported from the official Swagger).${fields}`,
      inputSchema: {
        body: z.record(z.string(), z.unknown()).default({}).describe("גוף הבקשה (ללא Credentials) לפי השדות המתועדים"),
        account: accountParam
      },
      annotations: { title: gen.summary || gen.path, readOnlyHint: gen.scope === "read", destructiveHint: gen.scope === "payments", openWorldHint: true }
    },
    async (args: Record<string, unknown>) => {
      try {
        const { account, body } = args as { account?: string; body?: Record<string, unknown> };
        return await executeCall(ctx, { toolName, scope: gen.scope, path: gen.path, body: body || {}, accountRef: account });
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}

export function registerMetaTools(server: McpServer, ctx: ToolContext, generated: GeneratedEndpoint[]): void {
  server.registerTool(
    "sumit_list_accounts",
    {
      title: "רשימת חשבונות סאמיט / List accounts",
      description:
        "מחזיר את חשבונות הסאמיט (ארגונים) שהחיבור הזה רשאי לעבוד איתם, כולל מי ברירת המחדל. השתמשו בשם/מזהה בפרמטר `account` של שאר הכלים. " +
        "Lists the SUMIT accounts available to this connection and which one is the default.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      const accounts = accessibleAccounts(ctx).map((a) => ({
        id: a.id,
        name: a.name,
        companyId: a.companyId,
        isDefault: a.isDefault,
        sessionDefault: ctx.sessionDefaultAccountId === a.id,
        lastTestOk: a.lastTestOk,
        notes: a.notes
      }));
      return textResult(JSON.stringify({ scopes: ctx.scopes, accounts }, null, 2));
    }
  );

  server.registerTool(
    "sumit_use_account",
    {
      title: "בחירת חשבון ברירת מחדל לשיחה / Use account",
      description: "קובע איזה חשבון סאמיט ישמש כברירת מחדל להמשך השיחה (כשלא מציינים `account`). Sets the default account for this session.",
      inputSchema: { account: z.string().describe("שם / מזהה / CompanyID של החשבון") },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ account }: { account: string }) => {
      try {
        const acc = resolveAccount(ctx, account);
        ctx.sessionDefaultAccountId = acc.id;
        return textResult(`✅ Default account for this session: ${acc.name} (companyId=${acc.companyId}, id=${acc.id})`);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "sumit_test_connection",
    {
      title: "בדיקת חיבור לחשבון / Test connection",
      description: "בודק שהמפתחות של החשבון תקינים (קורא ל-/website/companies/getdetails/) ומחזיר את פרטי הארגון. Verifies the account credentials.",
      inputSchema: { account: accountParam },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ account }: { account?: string }) => {
      try {
        return await executeCall(ctx, { toolName: "sumit_test_connection", scope: "read", path: "/website/companies/getdetails/", body: {}, accountRef: account, timeoutMs: 30_000 });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "sumit_api_catalog",
    {
      title: "קטלוג פעולות סאמיט / API catalog",
      description:
        "מחזיר את רשימת כל פעולות ה-API של סאמיט שהשרת מכיר (שם הכלי, נתיב, מודול, הרשאה נדרשת, תיאור), עם חיפוש חופשי. " +
        "השתמשו בזה כדי למצוא את הכלי המתאים, או את הנתיב לקריאה ידנית דרך sumit_api_request.",
      inputSchema: {
        search: z.string().optional().describe("טקסט חיפוש (עברית/אנגלית) — בשם, בנתיב או בתיאור"),
        module: z.string().optional().describe("סינון לפי מודול: accounting, billing, crm, website, stock, creditguy, triggers, customerservice")
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ search, module }: { search?: string; module?: string }) => {
      const q = search?.toLowerCase();
      const rows = catalog
        .filter((e) => !module || e.module.startsWith(module.toLowerCase()))
        .filter((e) => !q || `${e.name} ${e.title} ${e.path} ${e.description}`.toLowerCase().includes(q))
        .map((e) => ({ tool: `sumit_${e.name}`, path: e.path, module: e.module, scope: e.scope, confidence: e.confidence, title: e.title, summary: e.description.split(/(?<=\.)\s|\n/)[0].slice(0, 220) }));
      const genRows = generated
        .filter((g) => !module || g.path.slice(1).startsWith(module.toLowerCase()))
        .filter((g) => !q || `${g.slug} ${g.path} ${g.summary} ${g.description}`.toLowerCase().includes(q))
        .map((g) => ({ tool: `sumit_api_${g.slug}`, path: g.path, scope: g.scope, source: "swagger", title: g.summary }));
      return textResult(JSON.stringify({ count: rows.length + genRows.length, tools: rows, imported: genRows }, null, 2));
    }
  );

  server.registerTool(
    "sumit_api_request",
    {
      title: "קריאה חופשית ל-API של סאמיט / Raw API request",
      description:
        "שולח בקשת POST לכל endpoint של SUMIT REST API (https://api.sumit.co.il) עם גוף JSON חופשי. ה-Credentials מוזרקים אוטומטית לפי החשבון. " +
        "מיועד לפעולות שאין להן כלי ייעודי, או כשצריך שדות מיוחדים. ההרשאה הנדרשת נגזרת מהנתיב (get/list → read, charge → payments, אחרת → write). " +
        "Calls any SUMIT endpoint with a raw JSON body (Credentials injected).",
      inputSchema: {
        path: z.string().describe("נתיב ה-API, למשל /accounting/documents/list/"),
        body: z.record(z.string(), z.unknown()).default({}).describe("גוף הבקשה ללא Credentials"),
        account: accountParam,
        usePublicKey: z.boolean().optional().describe("להשתמש במפתח הציבורי (APIPublicKey) במקום הפרטי — לפעולות טוקניזציה"),
        timeoutMs: z.number().int().min(1000).max(300_000).optional()
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }
    },
    async ({ path, body, account, usePublicKey, timeoutMs }: { path: string; body?: Record<string, unknown>; account?: string; usePublicKey?: boolean; timeoutMs?: number }) => {
      try {
        if (!/^\/?[a-z0-9_-]+(\/[a-z0-9_-]+)*\/?$/i.test(path.trim())) throw new ToolError(`Invalid path "${path}"`, "Use a path like /accounting/documents/list/");
        const scope = inferScopeFromPath(path);
        return await executeCall(ctx, { toolName: "sumit_api_request", scope, path, body: body || {}, accountRef: account, usePublicKey, timeoutMs });
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}

/** Registers every tool (catalog + imported swagger + meta) on the server. */
export function registerAllTools(server: McpServer, ctx: ToolContext): { count: number } {
  const generated = loadGeneratedCatalog();
  const curatedPaths = new Set(catalog.map((e) => normalizePath(e.path)));
  let count = 0;
  for (const def of catalog) {
    registerEndpointTool(server, ctx, def);
    count++;
  }
  const extraGenerated = generated.filter((g) => !curatedPaths.has(normalizePath(g.path)));
  for (const g of extraGenerated) {
    registerGeneratedTool(server, ctx, g);
    count++;
  }
  registerMetaTools(server, ctx, extraGenerated);
  count += 5;
  return { count };
}
