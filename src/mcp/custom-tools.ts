/**
 * Multi-step tools that cannot be expressed as a single SUMIT call.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ToolError, assertScope, resolveAccount, type ToolContext } from "./context.js";
import { formatFailure } from "./tools.js";

const accountParam = z
  .string()
  .optional()
  .describe("חשבון סאמיט לביצוע הפעולה — שם החשבון, מזהה, או CompanyID. אפשר להשמיט כשיש חשבון ברירת מחדל / חשבון יחיד (ראו sumit_list_accounts).");

function text(t: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text: t }], isError };
}

function errorResult(err: unknown): CallToolResult {
  if (err instanceof ToolError) return text(`❌ ${err.message}${err.hint ? `\nHint: ${err.hint}` : ""}`, true);
  return text(`❌ ${err instanceof Error ? err.message : String(err)}`, true);
}

/** SUMIT returns CRM property values as single-element arrays: { Accounting_Closed: [false] } */
function firstValue(entity: Record<string, unknown> | undefined, key: string): unknown {
  const v = entity?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export function registerCustomTools(server: McpServer, ctx: ToolContext): number {
  server.registerTool(
    "sumit_documents_set_closed",
    {
      title: "סגירה / פתיחה של הצעת מחיר, הזמנה או חשבון עסקה / Mark document closed",
      description:
        "מסמן מסמך פתוח (הצעת מחיר, הזמנה, חשבון עסקה, דרישת תשלום) כסגור — או פותח אותו מחדש — באמצעות השדה Accounting_Closed (\"סגורה\") של כרטיס המסמך ב-CRM של סאמיט. " +
        "זה אותו שדה שסאמיט מסמן אוטומטית כשמפיקים מסמך מתוך ההצעה. הכלי קורא את הרשומה, מעדכן אותה דרך /crm/data/updateentity/ ומאמת את הערך החדש. " +
        "Marks an open document (price quotation, order, proforma) as closed or re-opens it via the CRM Accounting_Closed property. Reversible. Returns the state before and after.",
      inputSchema: {
        documentId: z.number().int().describe("מזהה המסמך (DocumentID / EntityID) — מ-sumit_documents_list או sumit_documents_get_details"),
        closed: z.boolean().default(true).describe("true = סגור, false = פתוח מחדש"),
        account: accountParam
      },
      annotations: { title: "Mark document closed", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ documentId, closed, account }: { documentId: number; closed?: boolean; account?: string }) => {
      const toolName = "sumit_documents_set_closed";
      const target = closed ?? true;
      try {
        assertScope(ctx, "write", toolName);
        const acc = resolveAccount(ctx, account);
        const client = ctx.accounts.clientFor(acc);
        const started = Date.now();

        const before = await client.call("/crm/data/getentity/", { EntityID: documentId });
        if (!before.ok) return formatFailure(acc.name, before);
        const entity = ((before.json?.Data as Record<string, unknown> | undefined)?.Entity ?? {}) as Record<string, unknown>;
        const folder = entity.Folder;
        const wasClosed = firstValue(entity, "Accounting_Closed");
        if (!("Accounting_Closed" in entity)) {
          throw new ToolError(
            `Document ${documentId} has no Accounting_Closed field (type enum ${String(firstValue(entity, "Accounting_DefinitionEnum"))}). Only open-type documents (quotes, orders, proformas, payment requests) can be closed.`
          );
        }
        if (wasClosed === target) {
          return text(`ℹ️ Document ${documentId} (#${String(firstValue(entity, "Accounting_Number"))}) is already ${target ? "closed" : "open"} — nothing changed. account: ${acc.name}`);
        }

        // Verified live: property values go inside Entity.Properties as plain values (arrays are rejected).
        const update = await client.call("/crm/data/updateentity/", {
          Entity: { ID: documentId, Folder: folder, Properties: { Accounting_Closed: target } }
        });
        const after = update.ok ? await client.call("/crm/data/getentity/", { EntityID: documentId }) : undefined;
        const nowClosed = after?.ok ? firstValue(((after.json?.Data as Record<string, unknown> | undefined)?.Entity ?? {}) as Record<string, unknown>, "Accounting_Closed") : undefined;
        const ok = update.ok && nowClosed === target;
        void ctx.store.audit({ at: new Date().toISOString(), kind: "tool", actor: ctx.actor, account: acc.name, tool: toolName, path: "/crm/data/updateentity/", ok, ms: Date.now() - started, message: ok ? undefined : update.errorMessage || "value did not change" });
        if (!update.ok) return formatFailure(acc.name, update);
        if (!ok) {
          return text(`⚠️ /crm/data/updateentity/ returned success but Accounting_Closed is still ${String(nowClosed)} for document ${documentId}. Response: ${JSON.stringify(update.json?.Data ?? update.json)}`, true);
        }
        return text(
          `✅ Document ${documentId} (#${String(firstValue(entity, "Accounting_Number"))}) is now ${target ? "CLOSED (סגורה)" : "OPEN (פתוחה)"} | account: ${acc.name} | was: ${String(wasClosed)}`
        );
      } catch (err) {
        return errorResult(err);
      }
    }
  );
  return 1;
}
