import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Scope } from "../core/store.js";

/** Who is calling the MCP server and what they may do. */
export interface ConnectionIdentity {
  kind: "api_token" | "oauth" | "stdio" | "admin";
  id: string;
  name: string;
  accountIds: string[] | "all";
  scopes: Scope[];
  /** Epoch seconds; undefined = no expiry */
  expiresAt?: number;
}

export function identityKey(id: ConnectionIdentity): string {
  return `${id.kind}:${id.id}`;
}

/** Far-future expiry used for non-expiring tokens (the SDK's bearer middleware requires a value). */
const NO_EXPIRY = () => Math.floor(Date.now() / 1000) + 100 * 365 * 24 * 3600;

export function toAuthInfo(token: string, identity: ConnectionIdentity, expiresAt?: number, resource?: URL): AuthInfo {
  return {
    token,
    clientId: identity.id,
    scopes: identity.scopes,
    expiresAt: expiresAt ?? identity.expiresAt ?? NO_EXPIRY(),
    resource,
    extra: { kind: identity.kind, id: identity.id, name: identity.name, accountIds: identity.accountIds }
  };
}

export function fromAuthInfo(auth: AuthInfo): ConnectionIdentity {
  const extra = (auth.extra || {}) as Partial<ConnectionIdentity>;
  return {
    kind: (extra.kind as ConnectionIdentity["kind"]) || "api_token",
    id: extra.id || auth.clientId,
    name: extra.name || auth.clientId,
    accountIds: extra.accountIds || [],
    scopes: (auth.scopes as Scope[]) || []
  };
}
