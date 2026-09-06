/**
 * Imports SUMIT's official OpenAPI/Swagger document and produces `catalog/generated.json`.
 * Every operation in the spec becomes an extra MCP tool (unless a curated tool already covers the path).
 *
 * Usage:
 *   1. Download the spec while logged in to SUMIT (one of):
 *        https://app.sumit.co.il/swagger/v1/swagger.json
 *        https://app.sumit.co.il/help/developers/swagger/   (open DevTools → Network → swagger.json)
 *   2. npm run import-swagger -- ./swagger.json
 *   3. Restart the server (the file is loaded at startup).
 */
import fs from "node:fs";
import path from "node:path";

type Json = Record<string, any>;

const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run import-swagger -- <swagger.json> [output.json]");
  process.exit(1);
}
const output = process.argv[3] || path.resolve("catalog/generated.json");
const spec = JSON.parse(fs.readFileSync(input, "utf8")) as Json;
const components: Json = spec.components?.schemas || spec.definitions || {};

function deref(schema: Json | undefined, depth = 0): Json | undefined {
  if (!schema || depth > 8) return schema;
  if (schema.$ref) {
    const name = String(schema.$ref).split("/").pop()!;
    return deref(components[name], depth + 1);
  }
  if (schema.allOf) {
    const merged: Json = { type: "object", properties: {}, required: [] };
    for (const part of schema.allOf) {
      const d = deref(part, depth + 1) || {};
      Object.assign(merged.properties, d.properties || {});
      merged.required.push(...(d.required || []));
      if (d.description && !merged.description) merged.description = d.description;
    }
    return merged;
  }
  return schema;
}

function typeOf(schema: Json | undefined): string {
  const d = deref(schema);
  if (!d) return "any";
  if (d.enum) return "enum";
  if (d.type === "array") return `array<${typeOf(d.items)}>`;
  if (d.type === "object" || d.properties) {
    const keys = Object.keys(d.properties || {});
    return keys.length ? `object{${keys.slice(0, 12).join(",")}${keys.length > 12 ? ",…" : ""}}` : "object";
  }
  return Array.isArray(d.type) ? d.type.join("|") : d.type || "any";
}

function enumOf(schema: Json | undefined): string[] | undefined {
  const d = deref(schema);
  if (!d?.enum) return undefined;
  const names: string[] | undefined = d["x-enumNames"] || d["x-enum-varnames"];
  return d.enum.map((v: unknown, i: number) => (names?.[i] ? `${v}=${names[i]}` : String(v)));
}

function inferScope(p: string): "read" | "write" | "payments" {
  if (/\/(billing\/payments\/(charge|multivendorcharge)|billing\/recurring\/charge|creditguy\/gateway\/)/.test(p)) return "payments";
  if (/\/(get|list|verify|count|find|search|check)[a-z]*\/$/.test(p)) return "read";
  return "write";
}

const endpoints: Json[] = [];
for (const [rawPath, item] of Object.entries<Json>(spec.paths || {})) {
  const op: Json | undefined = item.post || item.get || item.put;
  if (!op) continue;
  let p = rawPath.toLowerCase().replace(/^\/api\//, "/");
  if (!p.startsWith("/")) p = "/" + p;
  if (!p.endsWith("/")) p += "/";
  const bodySchema = deref(op.requestBody?.content?.["application/json"]?.schema || op.parameters?.find((x: Json) => x.in === "body")?.schema);
  const props: Json = bodySchema?.properties || {};
  const required: string[] = bodySchema?.required || [];
  const fields = Object.entries<Json>(props)
    .filter(([name]) => name !== "Credentials")
    .map(([name, schema]) => ({
      name,
      type: typeOf(schema),
      required: required.includes(name) || undefined,
      description: (deref(schema)?.description || schema.description || "").toString().trim().slice(0, 300) || undefined,
      enum: enumOf(schema)
    }));
  endpoints.push({
    slug: p.replace(/^\/|\/$/g, "").replace(/\//g, "_"),
    path: p,
    summary: (op.summary || "").toString().trim(),
    description: (op.description || "").toString().trim().slice(0, 600),
    scope: inferScope(p),
    tags: op.tags || [],
    fields
  });
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), source: path.basename(input), count: endpoints.length, endpoints }, null, 2));
console.log(`Wrote ${endpoints.length} endpoints to ${output}`);
