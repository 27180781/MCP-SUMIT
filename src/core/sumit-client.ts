/**
 * Minimal HTTP client for the SUMIT REST API (https://api.sumit.co.il).
 *
 * All SUMIT endpoints are POST with a JSON body that must contain
 *   { "Credentials": { "CompanyID": <number>, "APIKey": "<secret>" }, ...fields }
 * and answer with the envelope
 *   { "Status": "Success" | "Success (0)" | 0 | "BusinessError (1)" | ..., "UserErrorMessage", "TechnicalErrorDetails", "Data" }
 */

export interface SumitCredentials {
  companyId: number;
  apiKey: string;
  apiPublicKey?: string;
}

export interface SumitClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

export interface SumitEnvelope {
  Status?: unknown;
  UserErrorMessage?: string | null;
  TechnicalErrorDetails?: string | null;
  Data?: unknown;
  [k: string]: unknown;
}

export interface SumitCallResult {
  ok: boolean;
  httpStatus: number;
  path: string;
  /** Parsed JSON envelope (when the response was JSON) */
  json?: SumitEnvelope;
  /** Binary payload (e.g. PDF) when the response was not JSON */
  binary?: { contentType: string; base64: string; bytes: number };
  /** Raw text when neither JSON nor recognised binary */
  text?: string;
  errorMessage?: string;
  durationMs: number;
}

export class SumitApiError extends Error {
  constructor(message: string, readonly result?: SumitCallResult) {
    super(message);
    this.name = "SumitApiError";
  }
}

export function isSuccessStatus(status: unknown): boolean {
  if (status === 0 || status === "0") return true;
  if (typeof status === "string") return /^success/i.test(status.trim());
  if (typeof status === "object" && status !== null) {
    // Some serializers emit { Value: 0 }
    const v = (status as Record<string, unknown>).Value;
    return v === 0 || v === "0";
  }
  return false;
}

export function normalizePath(p: string): string {
  let out = p.trim();
  if (!out.startsWith("/")) out = "/" + out;
  if (!out.endsWith("/")) out = out + "/";
  // collapse duplicate slashes
  out = out.replace(/\/{2,}/g, "/");
  return out.toLowerCase();
}

export class SumitClient {
  readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(private readonly credentials: SumitCredentials, opts: SumitClientOptions = {}) {
    this.baseUrl = (opts.baseUrl || "https://api.sumit.co.il").replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.userAgent = opts.userAgent ?? "sumit-mcp/0.1";
  }

  /**
   * Performs a POST call to `path` with `body`, injecting Credentials.
   * @param usePublicKey use APIPublicKey instead of APIKey (tokenization endpoints)
   */
  async call(path: string, body: Record<string, unknown> = {}, options: { timeoutMs?: number; usePublicKey?: boolean } = {}): Promise<SumitCallResult> {
    const normalized = normalizePath(path);
    const url = this.baseUrl + normalized;
    const creds: Record<string, unknown> = { CompanyID: this.credentials.companyId };
    if (options.usePublicKey) {
      if (!this.credentials.apiPublicKey) {
        throw new SumitApiError("This operation requires the account's API *public* key (APIPublicKey), which is not configured for this account.");
      }
      creds.APIPublicKey = this.credentials.apiPublicKey;
    } else {
      creds.APIKey = this.credentials.apiKey;
    }
    const payload = { Credentials: creds, ...stripUndefined(body) };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, application/pdf;q=0.9, */*;q=0.8",
          "User-Agent": this.userAgent
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = (err as Error).name === "AbortError" ? `Request to SUMIT timed out after ${options.timeoutMs ?? this.timeoutMs}ms` : `Network error calling SUMIT: ${(err as Error).message}`;
      return { ok: false, httpStatus: 0, path: normalized, errorMessage: msg, durationMs: Date.now() - started };
    }
    clearTimeout(timer);

    const contentType = res.headers.get("content-type") || "";
    const durationMs = Date.now() - started;
    const buf = Buffer.from(await res.arrayBuffer());

    // Binary (PDF) responses
    if (contentType.includes("application/pdf") || buf.subarray(0, 5).toString("latin1") === "%PDF-") {
      return {
        ok: res.ok,
        httpStatus: res.status,
        path: normalized,
        binary: { contentType: contentType || "application/pdf", base64: buf.toString("base64"), bytes: buf.length },
        durationMs
      };
    }

    const text = buf.toString("utf8");
    let json: SumitEnvelope | undefined;
    try {
      json = text.length ? (JSON.parse(text) as SumitEnvelope) : undefined;
    } catch {
      json = undefined;
    }

    if (json && typeof json === "object") {
      const success = isSuccessStatus(json.Status) && res.ok;
      const errorMessage = success
        ? undefined
        : [json.UserErrorMessage, json.TechnicalErrorDetails].filter(Boolean).join(" | ") || (res.ok ? `SUMIT returned status ${String(json.Status)}` : `HTTP ${res.status}`);
      return { ok: success, httpStatus: res.status, path: normalized, json, errorMessage, durationMs };
    }

    return {
      ok: false,
      httpStatus: res.status,
      path: normalized,
      text: text.slice(0, 4000),
      errorMessage: res.ok ? "SUMIT returned a non-JSON response" : `HTTP ${res.status} from SUMIT`,
      durationMs
    };
  }
}

export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripUndefined(v)) as unknown as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}
