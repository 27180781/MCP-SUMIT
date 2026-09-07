import http from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedCall {
  path: string;
  body: Record<string, unknown>;
}

/**
 * A tiny fake of api.sumit.co.il used by the tests: records every call and answers
 * with a SUMIT-style envelope. Credentials are validated against `validKeys`.
 */
export async function startFakeSumit(validKeys: Record<number, string>) {
  const calls: RecordedCall[] = [];
  const entities = new Map<number, Record<string, unknown>>([[5001, { ID: 5001, Folder: "109268653", Properties: null, Accounting_Number: [1000], Accounting_Closed: [false] }]]);
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const path = req.url || "/";
      calls.push({ path, body });
      const creds = (body.Credentials || {}) as { CompanyID?: number; APIKey?: string; APIPublicKey?: string };
      const send = (obj: unknown, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(obj));
      };
      if (!creds.CompanyID || (validKeys[creds.CompanyID] !== creds.APIKey && !creds.APIPublicKey)) {
        return send({ Status: "BusinessError (1)", UserErrorMessage: "Invalid credentials", TechnicalErrorDetails: null, Data: null });
      }
      switch (path) {
        case "/website/companies/getdetails/":
          return send({ Status: "Success (0)", UserErrorMessage: null, TechnicalErrorDetails: null, Data: { Name: `Company ${creds.CompanyID}`, CorporateNumber: "514000000" } });
        case "/accounting/general/getvatrate/":
          return send({ Status: 0, UserErrorMessage: null, TechnicalErrorDetails: null, Data: { VATRate: 18 } });
        case "/accounting/documents/create/":
          return send({ Status: "Success", Data: { DocumentID: 555, DocumentNumber: 1001, CustomerID: 77, DocumentDownloadURL: "https://example.test/doc.pdf" } });
        case "/accounting/documents/getpdf/": {
          const pdf = Buffer.from("%PDF-1.4\n%fake\n", "latin1");
          res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": pdf.length });
          return res.end(pdf);
        }
        case "/billing/payments/charge/":
          return send({ Status: "Success", Data: { Payment: { ID: 9, ValidPayment: true, Status: "000", AuthNumber: "123" }, CustomerID: 77, DocumentID: 556 } });
        case "/crm/data/getentity/": {
          const e = entities.get(Number(body.EntityID));
          if (!e) return send({ Status: "BusinessError (1)", UserErrorMessage: "Entity not found", Data: null });
          return send({ Status: "Success", Data: { Entity: e } });
        }
        case "/crm/data/updateentity/": {
          const ent = body.Entity as { ID?: number; Properties?: Record<string, unknown> } | undefined;
          const e = ent?.ID !== undefined ? entities.get(Number(ent.ID)) : undefined;
          if (!e) return send({ Status: "BusinessError (1)", UserErrorMessage: "Entity not found", Data: null });
          for (const [k, v] of Object.entries(ent?.Properties || {})) {
            if (Array.isArray(v)) return send({ Status: 1, UserErrorMessage: "Value Type not supported (PropertyValueType = Boolean)", Data: null });
            e[k] = [v];
          }
          return send({ Status: "Success", Data: { EntityID: e.ID } });
        }
        case "/accounting/documents/list/":
          return send({ Status: "Success", Data: { Documents: [{ ID: 1, Number: 1000, Type: 1 }], HasNextPage: false } });
        default:
          return send({ Status: "Success", Data: { echo: body } });
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}
