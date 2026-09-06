import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SumitClient, isSuccessStatus, normalizePath } from "../src/core/sumit-client.js";
import { startFakeSumit } from "./helpers/fake-sumit.js";

let fake: Awaited<ReturnType<typeof startFakeSumit>>;
beforeAll(async () => {
  fake = await startFakeSumit({ 100: "key-100" });
});
afterAll(() => fake.close());

describe("SumitClient", () => {
  it("normalizes paths", () => {
    expect(normalizePath("accounting/Documents/Create")).toBe("/accounting/documents/create/");
    expect(normalizePath("/billing//payments/charge/")).toBe("/billing/payments/charge/");
  });

  it("recognises success statuses", () => {
    expect(isSuccessStatus("Success (0)")).toBe(true);
    expect(isSuccessStatus("Success")).toBe(true);
    expect(isSuccessStatus(0)).toBe(true);
    expect(isSuccessStatus("BusinessError (1)")).toBe(false);
    expect(isSuccessStatus(undefined)).toBe(false);
  });

  it("injects credentials and parses the envelope", async () => {
    const client = new SumitClient({ companyId: 100, apiKey: "key-100" }, { baseUrl: fake.baseUrl });
    const r = await client.call("/accounting/general/getvatrate/", { Date: "2026-01-01" });
    expect(r.ok).toBe(true);
    expect((r.json?.Data as { VATRate: number }).VATRate).toBe(18);
    const last = fake.calls.at(-1)!;
    expect(last.body.Credentials).toEqual({ CompanyID: 100, APIKey: "key-100" });
    expect(last.body.Date).toBe("2026-01-01");
  });

  it("reports business errors", async () => {
    const client = new SumitClient({ companyId: 100, apiKey: "wrong" }, { baseUrl: fake.baseUrl });
    const r = await client.call("/accounting/general/getvatrate/");
    expect(r.ok).toBe(false);
    expect(r.errorMessage).toContain("Invalid credentials");
  });

  it("returns binary PDFs", async () => {
    const client = new SumitClient({ companyId: 100, apiKey: "key-100" }, { baseUrl: fake.baseUrl });
    const r = await client.call("/accounting/documents/getpdf/", { DocumentID: 1, Original: true });
    expect(r.ok).toBe(true);
    expect(r.binary?.contentType).toContain("pdf");
    expect(Buffer.from(r.binary!.base64, "base64").subarray(0, 4).toString()).toBe("%PDF");
  });

  it("requires a public key for tokenization endpoints", async () => {
    const client = new SumitClient({ companyId: 100, apiKey: "key-100" }, { baseUrl: fake.baseUrl });
    await expect(client.call("/creditguy/vault/tokenizesingleusejson/", {}, { usePublicKey: true })).rejects.toThrow(/public/);
  });
});
