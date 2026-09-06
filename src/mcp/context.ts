import type { AccountRegistry, ResolvedAccount } from "../core/accounts.js";
import type { JsonStore, Scope } from "../core/store.js";
import type { ToolScope } from "./catalog/common.js";

export interface ToolContext {
  accounts: AccountRegistry;
  store: JsonStore;
  /** Accounts this connection may use */
  allowedAccountIds: string[] | "all";
  /** Permission scopes of this connection */
  scopes: Scope[];
  /** Human readable actor (token name / OAuth client / "stdio") for the audit log */
  actor: string;
  /** Per-session default account chosen with sumit_use_account */
  sessionDefaultAccountId?: string;
  log: (level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) => void;
}

export class ToolError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
    this.name = "ToolError";
  }
}

export function hasScope(ctx: Pick<ToolContext, "scopes">, required: ToolScope): boolean {
  const s = new Set(ctx.scopes);
  if (s.has("admin")) return true;
  switch (required) {
    case "read":
      return s.has("read") || s.has("write") || s.has("payments");
    case "write":
      return s.has("write") || s.has("payments");
    case "payments":
      return s.has("payments");
  }
}

export function assertScope(ctx: ToolContext, required: ToolScope, toolName: string): void {
  if (!hasScope(ctx, required)) {
    const label = required === "payments" ? "payments (סליקה/חיובים)" : required === "write" ? "write (כתיבה)" : "read";
    throw new ToolError(
      `Permission denied: tool ${toolName} requires the "${label}" scope, but this connection only has [${ctx.scopes.join(", ")}].`,
      "Create a token / OAuth grant with the required scope in the admin console."
    );
  }
}

export function accessibleAccounts(ctx: ToolContext) {
  return ctx.accounts.list().filter((a) => ctx.allowedAccountIds === "all" || ctx.allowedAccountIds.includes(a.id));
}

/** Resolve the account for a tool call: explicit ref → session default → default account → single account. */
export function resolveAccount(ctx: ToolContext, ref?: string | number): ResolvedAccount {
  const accessible = accessibleAccounts(ctx);
  if (accessible.length === 0) {
    throw new ToolError("No SUMIT accounts are available for this connection.", "Add an account in the admin console (or grant this token access to one).");
  }
  if (ref !== undefined && ref !== null && String(ref).trim() !== "") {
    const acc = ctx.accounts.resolve(ref, ctx.allowedAccountIds);
    if (!acc) {
      throw new ToolError(
        `Unknown account "${ref}". Available accounts: ${accessible.map((a) => `${a.name} (id=${a.id}, companyId=${a.companyId})`).join("; ")}`,
        "Use sumit_list_accounts to see the accounts you can use."
      );
    }
    return acc;
  }
  if (ctx.sessionDefaultAccountId) {
    const acc = ctx.accounts.resolve(ctx.sessionDefaultAccountId, ctx.allowedAccountIds);
    if (acc) return acc;
  }
  const def = ctx.accounts.resolve(undefined, ctx.allowedAccountIds);
  if (def) return def;
  throw new ToolError(
    `Several accounts are available and none is the default — specify the "account" parameter. Available: ${accessible.map((a) => `${a.name} (id=${a.id})`).join("; ")}`,
    "Call sumit_use_account to set a default for this session."
  );
}
