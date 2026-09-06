import { z } from "zod";
import type { SumitCallResult } from "../../core/sumit-client.js";

/* ------------------------------------------------------------------ */
/*  Catalog types                                                      */
/* ------------------------------------------------------------------ */

export type ToolScope = "read" | "write" | "payments";
export type Confidence = "high" | "medium" | "low";

export interface EndpointDef<Shape extends z.ZodRawShape = z.ZodRawShape> {
  /** Tool name without the `sumit_` prefix, e.g. `documents_create` */
  name: string;
  /** Short human title (Hebrew / English) */
  title: string;
  /** SUMIT REST path, e.g. `/accounting/documents/create/` */
  path: string;
  /** Module group used in the catalog listing */
  module: string;
  /** Rich description for the model */
  description: string;
  scope: ToolScope;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  /** Tool specific parameters (account / extra / responseLanguage are added automatically) */
  input: Shape;
  /** Maps validated args to the SUMIT request body (Credentials are injected by the client) */
  build: (args: z.infer<z.ZodObject<Shape>>) => Record<string, unknown>;
  timeoutMs?: number;
  /** Use the account's API *public* key instead of the private key */
  usePublicKey?: boolean;
  /** How confident we are about the request shape (see docs/SUMIT_API_COVERAGE.md) */
  confidence: Confidence;
  /** Optional result post-processing (e.g. binary PDF) */
  format?: (result: SumitCallResult) => { text: string; extraContent?: unknown[] } | undefined;
}

export function defineEndpoint<Shape extends z.ZodRawShape>(def: EndpointDef<Shape>): EndpointDef<Shape> {
  return def;
}

/* ------------------------------------------------------------------ */
/*  Enumerations                                                       */
/* ------------------------------------------------------------------ */

export const DOCUMENT_TYPES: Record<number, { key: string; he: string }> = {
  0: { key: "Invoice", he: "חשבונית מס" },
  1: { key: "InvoiceAndReceipt", he: "חשבונית מס-קבלה" },
  2: { key: "Receipt", he: "קבלה" },
  3: { key: "ProformaInvoice", he: "חשבון עסקה (פרופורמה)" },
  4: { key: "DonationReceipt", he: "קבלת תרומה" },
  5: { key: "CreditInvoice", he: "חשבונית זיכוי" },
  6: { key: "CreditInvoiceAndReceipt", he: "חשבונית מס-קבלה זיכוי" },
  7: { key: "CreditReceipt", he: "קבלה זיכוי" },
  8: { key: "Order", he: "הזמנה" },
  9: { key: "DeliveryNote", he: "תעודת משלוח" },
  10: { key: "GoodsReturnNote", he: "תעודת החזרה" },
  11: { key: "PurchasingOrder", he: "הזמנת רכש" },
  12: { key: "PriceQuotation", he: "הצעת מחיר" },
  13: { key: "PaymentRequest", he: "דרישת תשלום" },
  14: { key: "CreditDonationReceipt", he: "קבלת תרומה זיכוי" },
  15: { key: "ExpenseInvoiceReceipt", he: "חשבונית מס-קבלה (הוצאה)" },
  16: { key: "ExpenseInvoice", he: "חשבונית מס (הוצאה)" },
  17: { key: "ExpenseReceipt", he: "קבלה (הוצאה)" },
  18: { key: "ExpenseRequest", he: "דרישת תשלום (הוצאה)" },
  19: { key: "CreditExpenseInvoiceReceipt", he: "חשבונית מס-קבלה זיכוי (הוצאה)" },
  20: { key: "CreditExpenseInvoice", he: "חשבונית זיכוי (הוצאה)" },
  21: { key: "CreditExpenseReceipt", he: "קבלה זיכוי (הוצאה)" },
  22: { key: "SupplierPayment", he: "תשלום לספק" }
};

const DOCUMENT_TYPE_KEYS = Object.values(DOCUMENT_TYPES).map((d) => d.key);

export function documentTypeText(): string {
  return Object.entries(DOCUMENT_TYPES)
    .map(([n, d]) => `${n}=${d.key} (${d.he})`)
    .join(", ");
}

/** Accepts a numeric code or the enum name and returns the numeric code. */
export function toDocumentType(v: number | string): number {
  if (typeof v === "number") return v;
  const s = v.trim();
  if (/^\d+$/.test(s)) return Number(s);
  const idx = Object.entries(DOCUMENT_TYPES).find(([, d]) => d.key.toLowerCase() === s.toLowerCase());
  if (!idx) throw new Error(`Unknown document type "${v}". Use one of: ${documentTypeText()}`);
  return Number(idx[0]);
}

export const documentTypeSchema = z
  .union([z.number().int().min(0).max(22), z.enum(DOCUMENT_TYPE_KEYS as [string, ...string[]])])
  .describe(`סוג מסמך / Document type. ${documentTypeText()}`);

export const CURRENCIES = ["ILS", "USD", "EUR", "CAD", "CHF", "GBP", "AUD"] as const;
export const currencySchema = z
  .union([z.enum(CURRENCIES), z.number().int().min(0).max(6)])
  .describe("מטבע / Currency: ILS (0), USD (1), EUR (2), CAD (3), CHF (4), GBP (5), AUD (6). Code names are accepted by SUMIT; numeric codes are the enum values.");

export const LANGUAGES: Record<string, number> = { hebrew: 0, he: 0, english: 1, en: 1, arabic: 2, ar: 2, spanish: 3, es: 3 };
export const languageSchema = z
  .union([z.number().int().min(0).max(3), z.enum(["he", "en", "ar", "es", "Hebrew", "English", "Arabic", "Spanish"])])
  .describe("שפה / Language: 0=Hebrew (he), 1=English (en), 2=Arabic (ar), 3=Spanish (es)");

export function toLanguage(v: number | string | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return v;
  const n = LANGUAGES[v.toLowerCase()];
  return n ?? undefined;
}

export const customerSearchModeSchema = z
  .union([z.number().int().min(0).max(6), z.enum(["Automatic", "None", "ExternalIdentifier", "Name", "CompanyNumber", "Phone", "EmailAddress"])])
  .describe(
    "אופן איתור לקוח קיים / how SUMIT matches an existing customer: 0=Automatic, 1=None (always create new), 2=ExternalIdentifier, 3=Name, 4=CompanyNumber, 5=Phone, 6=EmailAddress. If `ID` is given, the existing customer is used as-is."
  );

export const itemSearchModeSchema = z
  .union([z.number().int().min(0).max(3), z.enum(["Automatic", "None", "ExternalIdentifier", "Name"])])
  .describe("אופן איתור פריט קיים / item matching: 0=Automatic, 1=None (create new), 2=ExternalIdentifier, 3=Name");

/* ------------------------------------------------------------------ */
/*  Shared object schemas (loose: extra SUMIT fields are passed through) */
/* ------------------------------------------------------------------ */

export const customerSchema = z
  .looseObject({
    ID: z.number().int().optional().describe("מזהה לקוח קיים בסאמיט / existing SUMIT customer ID"),
    Name: z.string().optional().describe("שם הלקוח"),
    EmailAddress: z.string().optional().describe("דוא\"ל"),
    Phone: z.string().optional().describe("טלפון"),
    CompanyNumber: z.string().optional().describe("ח.פ / ת.ז / מספר עוסק"),
    ExternalIdentifier: z.string().optional().describe("מזהה חיצוני שלכם ללקוח (למניעת כפילויות)"),
    Address: z.string().optional(),
    City: z.string().optional(),
    ZipCode: z.string().optional(),
    NoVAT: z.boolean().optional().describe("לקוח פטור ממע\"מ / customer is VAT exempt"),
    Folder: z.string().optional().describe("תיקיית לקוחות (CRM folder) — אופציונלי"),
    SearchMode: customerSearchModeSchema.optional(),
    Properties: z.record(z.string(), z.unknown()).optional().describe("שדות מותאמים אישית של כרטיס הלקוח (CRM properties)")
  })
  .describe("פרטי לקוח / Customer. Give `ID` for an existing customer, or Name (+ contact details) to create/match one.");

export const itemRefSchema = z
  .looseObject({
    ID: z.number().int().optional().describe("מזהה פריט קיים / existing income item ID"),
    Name: z.string().optional().describe("שם הפריט / השירות"),
    Description: z.string().optional(),
    SKU: z.string().optional().describe("מק\"ט"),
    ExternalIdentifier: z.string().optional(),
    Price: z.number().optional().describe("מחיר מחירון של הפריט (לא חובה — משתמשים ב-UnitPrice בשורה)"),
    Cost: z.number().optional(),
    SearchMode: itemSearchModeSchema.optional(),
    Duration_Months: z.number().int().optional().describe("למנויים: מרווח חיוב בחודשים")
  })
  .describe("פריט / Item reference (existing ID or Name to create automatically)");

export const documentLineSchema = z
  .looseObject({
    Item: itemRefSchema,
    Quantity: z.number().default(1).describe("כמות"),
    UnitPrice: z.number().optional().describe("מחיר ליחידה (במטבע המסמך)"),
    TotalPrice: z.number().optional().describe("סה\"כ לשורה (אם לא נשלח — SUMIT מחשב Quantity×UnitPrice)"),
    Description: z.string().optional().describe("תיאור השורה שיודפס במסמך"),
    Currency: currencySchema.optional(),
    VAT: z.number().optional().describe("שיעור מע\"מ לשורה (אחוזים) — רק אם VATPerItem"),
    DocumentCurrency_UnitPrice: z.number().optional(),
    DocumentCurrency_TotalPrice: z.number().optional()
  })
  .describe("שורת פריט במסמך / document line");

export const paymentLineSchema = z
  .looseObject({
    Amount: z.number().describe("סכום התשלום"),
    Date: z.string().optional().describe("תאריך התשלום (ISO 8601)"),
    Details_Cash: z.looseObject({}).optional().describe("מזומן — אובייקט ריק {}"),
    Details_Cheque: z
      .looseObject({
        BankNumber: z.number().int().optional(),
        BranchNumber: z.number().int().optional(),
        AccountNumber: z.string().optional(),
        ChequeNumber: z.string().optional(),
        DueDate: z.string().optional()
      })
      .optional()
      .describe("צ'ק"),
    Details_BankTransfer: z
      .looseObject({
        BankNumber: z.number().int().optional(),
        BranchNumber: z.number().int().optional(),
        AccountNumber: z.string().optional(),
        Reference: z.string().optional()
      })
      .optional()
      .describe("העברה בנקאית"),
    Details_CreditCard: z
      .looseObject({
        CardBrand: z.string().optional(),
        Expiration: z.string().optional(),
        Last4Digits: z.string().optional(),
        AuthNumber: z.string().optional(),
        Payments: z.number().int().optional()
      })
      .optional()
      .describe("כרטיס אשראי (תיעוד תשלום שבוצע חיצונית — לא סליקה)"),
    Details_Other: z
      .looseObject({ Type: z.string().optional(), Description: z.string().optional(), DueDate: z.string().optional() })
      .optional()
      .describe("אמצעי תשלום אחר (PayPal, Bit, ביט וכו')"),
    Details_TaxWithholding: z.looseObject({}).optional().describe("ניכוי מס במקור"),
    DocumentCurrency_Amount: z.number().optional()
  })
  .describe("תשלום שהתקבל (עבור קבלות / חשבונית מס-קבלה). יש למלא בדיוק אחד מאובייקטי Details_*");

export const pagingSchema = z
  .object({
    StartIndex: z.number().int().min(0).optional().describe("אינדקס התחלה (0 = ראשון)"),
    PageSize: z.number().int().min(1).max(500).optional().describe("גודל עמוד")
  })
  .optional()
  .describe("עימוד / paging");

export const chargeLineSchema = z
  .looseObject({
    Item: itemRefSchema,
    Quantity: z.number().default(1),
    UnitPrice: z.number().describe("מחיר ליחידה"),
    Currency: currencySchema.optional(),
    Description: z.string().optional(),
    Duration_Months: z.number().int().optional().describe("הוראת קבע: מרווח חיוב בחודשים (1=חודשי, 12=שנתי). 0/ריק = חיוב חד-פעמי"),
    Duration_Days: z.number().int().optional(),
    Recurrence: z.number().int().optional().describe("הוראת קבע: מספר חיובים. 0/ריק = עד לביטול"),
    Date_Start: z.string().optional().describe("הוראת קבע: תאריך חיוב ראשון YYYY-MM-DD (עתידי = תקופת ניסיון)")
  })
  .describe("שורת חיוב / charge line");

export const paymentMethodSchema = z
  .looseObject({
    Type: z.number().int().optional().describe("1 = כרטיס אשראי (ברירת מחדל)"),
    CreditCard_Token: z.string().optional().describe("טוקן קבוע של כרטיס שמור בסאמיט"),
    CreditCard_Number: z.string().optional().describe("מספר כרטיס מלא — רק לחשבונות עם אישור PCI"),
    CreditCard_ExpirationMonth: z.union([z.number().int(), z.string()]).optional(),
    CreditCard_ExpirationYear: z.union([z.number().int(), z.string()]).optional(),
    CreditCard_CVV: z.string().optional(),
    CreditCard_CitizenID: z.string().optional().describe("ת.ז של בעל הכרטיס"),
    CreditCard_LastDigits: z.string().optional()
  })
  .describe("אמצעי תשלום / payment method. Prefer `SingleUseToken` (from payments.js) or a saved `CreditCard_Token`.");

/* ------------------------------------------------------------------ */
/*  Helpers used by builders                                           */
/* ------------------------------------------------------------------ */

export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== "") out[k] = v;
  return out as Partial<T>;
}

export function isoDate(v?: string): string | undefined {
  if (!v) return undefined;
  return v;
}

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
export const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;
export const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false } as const;
