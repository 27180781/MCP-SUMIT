const SENSITIVE_KEY = /(apikey|apipublickey|api_key|secret|password|authorization|token|cvv|creditcard_number|cardnumber|citizenid|creditcard_citizenid)/i;

/** Recursively mask sensitive fields so that logs / audit entries never contain secrets. */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 12) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = typeof v === "string" && v.length > 0 ? "[REDACTED]" : v === undefined ? undefined : "[REDACTED]";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out as T;
  }
  return value;
}

export function maskSecret(secret: string, visible = 4): string {
  if (!secret) return "";
  if (secret.length <= visible * 2) return "*".repeat(secret.length);
  return `${secret.slice(0, visible)}${"*".repeat(Math.min(12, secret.length - visible * 2))}${secret.slice(-visible)}`;
}
