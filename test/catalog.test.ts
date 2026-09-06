import { describe, expect, it } from "vitest";
import { z } from "zod";
import { catalog, findEndpoint, toDocumentType } from "../src/mcp/catalog/index.js";
import { inferScopeFromPath } from "../src/mcp/tools.js";

describe("catalog", () => {
  it("has unique tool names and valid paths", () => {
    const names = new Set<string>();
    for (const e of catalog) {
      expect(names.has(e.name)).toBe(false);
      names.add(e.name);
      expect(e.path).toMatch(/^\/[a-z]+(\/[a-z]+){2,3}\/$/);
      expect(e.description.length).toBeGreaterThan(20);
    }
    expect(catalog.length).toBeGreaterThanOrEqual(55);
  });

  it("every input shape converts to JSON schema", () => {
    for (const e of catalog) {
      const schema = z.object(e.input);
      const json = z.toJSONSchema(schema, { io: "input" }) as { type: string; properties?: Record<string, unknown> };
      expect(json.type).toBe("object");
    }
  });

  it("builds a documents/create body with computed totals and defaults", () => {
    const def = findEndpoint("documents_create")!;
    const args = z.object(def.input).parse({
      type: "InvoiceAndReceipt",
      customer: { Name: "ישראל ישראלי", EmailAddress: "a@b.co.il" },
      items: [{ Item: { Name: "שירות" }, Quantity: 2, UnitPrice: 100 }],
      payments: [{ Amount: 200, Details_Cash: {} }],
      language: "he",
      sendByEmail: { emailAddress: "a@b.co.il" }
    });
    const body = def.build(args) as Record<string, any>;
    expect(body.Details.Type).toBe(1);
    expect(body.Details.Language).toBe(0);
    expect(body.Details.SendByEmail).toEqual({ EmailAddress: "a@b.co.il", Original: true });
    expect(body.Items[0].TotalPrice).toBe(200);
    expect(body.Items[0].Item.SearchMode).toBe(0);
    expect(body.VATIncluded).toBe(true);
    expect(body.Payments).toHaveLength(1);
  });

  it("requires a locator for document lookups", () => {
    const def = findEndpoint("documents_get_details")!;
    expect(() => def.build(z.object(def.input).parse({}))).toThrow(/documentId/);
    const body = def.build(z.object(def.input).parse({ documentType: 1, documentNumber: 5 })) as Record<string, unknown>;
    expect(body).toEqual({ DocumentType: 1, DocumentNumber: 5 });
  });

  it("builds a charge body", () => {
    const def = findEndpoint("payments_charge")!;
    const args = z.object(def.input).parse({
      customer: { ID: 77 },
      items: [{ Item: { Name: "מנוי" }, UnitPrice: 50, Currency: "ILS" }],
      singleUseToken: "tok",
      paymentsCount: 3
    });
    const body = def.build(args) as Record<string, any>;
    expect(body.SingleUseToken).toBe("tok");
    expect(body.Payments_Count).toBe(3);
    expect(body.Items[0].Quantity).toBe(1);
    expect(body.Customer).toEqual({ ID: 77 });
  });

  it("builds a refund body as a negative charge", () => {
    const def = findEndpoint("payments_refund")!;
    const body = def.build(z.object(def.input).parse({ customer: { ID: 1 }, amount: 30, originalAuthNumber: "A1" })) as Record<string, any>;
    expect(body.Items[0].UnitPrice).toBe(-30);
    expect(body.SupportCredit).toBe(true);
    expect(body.Payment.CreditCardAuthNumber).toBe("A1");
  });

  it("maps document types by name or number", () => {
    expect(toDocumentType("Receipt")).toBe(2);
    expect(toDocumentType(12)).toBe(12);
    expect(() => toDocumentType("Nope")).toThrow();
  });

  it("infers scopes for raw requests", () => {
    expect(inferScopeFromPath("/accounting/documents/list/")).toBe("read");
    expect(inferScopeFromPath("/billing/payments/charge/")).toBe("payments");
    expect(inferScopeFromPath("/crm/data/createentity/")).toBe("write");
    expect(inferScopeFromPath("/billing/paymentmethods/getforcustomer/")).toBe("read");
  });
});
