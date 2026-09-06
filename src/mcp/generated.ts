import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolScope } from "./catalog/common.js";
import { normalizePath } from "../core/sumit-client.js";

export interface GeneratedField {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  enum?: string[];
}

export interface GeneratedEndpoint {
  slug: string;
  path: string;
  summary?: string;
  description?: string;
  scope: ToolScope;
  fields: GeneratedField[];
}

let cache: GeneratedEndpoint[] | undefined;

/**
 * Loads `catalog/generated.json` (produced by `npm run import-swagger -- swagger.json`) if present.
 * Every endpoint in that file becomes an additional tool unless a curated tool already covers the path.
 */
export function loadGeneratedCatalog(): GeneratedEndpoint[] {
  if (cache) return cache;
  const candidates = [
    process.env.SUMIT_GENERATED_CATALOG,
    path.resolve(process.cwd(), "catalog/generated.json"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../catalog/generated.json")
  ].filter(Boolean) as string[];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { endpoints?: GeneratedEndpoint[] };
      const seen = new Set<string>();
      cache = (parsed.endpoints || [])
        .filter((e) => e && typeof e.path === "string")
        .map((e) => ({ ...e, path: normalizePath(e.path), fields: e.fields || [] }))
        .filter((e) => {
          if (seen.has(e.slug)) return false;
          seen.add(e.slug);
          return true;
        });
      return cache;
    } catch (err) {
      console.error(`[sumit-mcp] failed to load generated catalog ${file}: ${(err as Error).message}`);
    }
  }
  cache = [];
  return cache;
}

export function resetGeneratedCatalogCache(): void {
  cache = undefined;
}
