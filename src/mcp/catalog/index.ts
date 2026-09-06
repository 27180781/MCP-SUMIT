import type { EndpointDef } from "./common.js";
import { accountingEndpoints } from "./accounting.js";
import { billingEndpoints } from "./billing.js";
import { crmEndpoints } from "./crm.js";
import { websiteEndpoints } from "./website.js";

export * from "./common.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const catalog: EndpointDef<any>[] = [...accountingEndpoints, ...billingEndpoints, ...crmEndpoints, ...websiteEndpoints];

const names = new Set<string>();
for (const e of catalog) {
  if (names.has(e.name)) throw new Error(`Duplicate endpoint tool name: ${e.name}`);
  names.add(e.name);
}

export function findEndpoint(name: string): EndpointDef | undefined {
  return catalog.find((e) => e.name === name);
}

/** Known SUMIT API paths → tool names (for the raw request tool and catalog listing). */
export function pathIndex(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of catalog) {
    const list = map.get(e.path) || [];
    list.push(`sumit_${e.name}`);
    map.set(e.path, list);
  }
  return map;
}
