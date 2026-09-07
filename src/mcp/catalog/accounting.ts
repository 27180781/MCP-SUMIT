import { z } from "zod";
import {
  DESTRUCTIVE,
  READ_ONLY,
  WRITE,
  compact,
  currencySchema,
  customerSchema,
  defineEndpoint,
  documentLineSchema,
  documentTypeSchema,
  languageSchema,
  pagingSchema,
  paymentLineSchema,
  toDocumentType,
  toLanguage,
  itemRefSchema
} from "./common.js";

const docLocator = {
  documentId: z.number().int().optional().describe("מזהה מסמך פנימי (DocumentID / EntityID) — עדיף"),
  documentType: documentTypeSchema.optional().describe("סוג מסמך — נדרש יחד עם documentNumber אם אין documentId"),
  documentNumber: z.number().int().optional().describe("מספר מסמך רץ — נדרש יחד עם documentType אם אין documentId")
};

function locatorBody(a: { documentId?: number; documentType?: number | string; documentNumber?: number }) {
  if (!a.documentId && !(a.documentType !== undefined && a.documentNumber)) {
    throw new Error("Provide either documentId, or documentType + documentNumber");
  }
  return compact({
    DocumentID: a.documentId,
    DocumentType: a.documentType !== undefined ? toDocumentType(a.documentType) : undefined,
    DocumentNumber: a.documentNumber
  });
}

export const accountingEndpoints = [
  /* ---------------------------- Customers ---------------------------- */
  defineEndpoint({
    name: "customers_create",
    title: "יצירת לקוח / Create customer",
    path: "/accounting/customers/create/",
    module: "accounting.customers",
    scope: "write",
    confidence: "high",
    annotations: WRITE,
    description:
      "יוצר כרטיס לקוח חדש בסאמיט (מודול הנהלת חשבונות / CRM). מחזיר Data.CustomerID. " +
      "Creates a new customer card. Returns Data.CustomerID (or Data.ID). Use customers_update to change an existing customer.",
    input: {
      customer: customerSchema.describe("פרטי הלקוח. חובה לפחות Name."),
      responseLanguage: languageSchema.optional()
    },
    build: (a) => compact({ Details: a.customer, ResponseLanguage: toLanguage(a.responseLanguage) })
  }),
  defineEndpoint({
    name: "customers_update",
    title: "עדכון לקוח / Update customer",
    path: "/accounting/customers/update/",
    module: "accounting.customers",
    scope: "write",
    confidence: "high",
    annotations: WRITE,
    description:
      "מעדכן פרטי לקוח קיים. חובה customer.ID (או ExternalIdentifier עם SearchMode=2). " +
      "Updates an existing customer. Requires customer.ID (or ExternalIdentifier + SearchMode).",
    input: {
      customer: customerSchema.describe("פרטי הלקוח לעדכון כולל ID"),
      responseLanguage: languageSchema.optional()
    },
    build: (a) => compact({ Details: a.customer, ResponseLanguage: toLanguage(a.responseLanguage) })
  }),
  defineEndpoint({
    name: "customers_get_details_url",
    title: "קישור לכרטיס לקוח / Customer details URL",
    path: "/accounting/customers/getdetailsurl/",
    module: "accounting.customers",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description: "מחזיר קישור (URL) לדף כרטיס הלקוח במערכת סאמיט. Returns a URL to the customer's page in SUMIT (Data.URL).",
    input: {
      customerId: z.number().int().describe("מזהה לקוח בסאמיט"),
      responseLanguage: languageSchema.optional()
    },
    build: (a) => compact({ CustomerID: a.customerId, Customer: { ID: a.customerId }, ResponseLanguage: toLanguage(a.responseLanguage) })
  }),
  defineEndpoint({
    name: "customers_create_remark",
    title: "הוספת הערה ללקוח / Add customer remark",
    path: "/accounting/customers/createremark/",
    module: "accounting.customers",
    scope: "write",
    confidence: "medium",
    annotations: WRITE,
    description: "מוסיף הערה / תיעוד לכרטיס הלקוח. Adds a free-text remark to the customer card.",
    input: {
      customerId: z.number().int(),
      remark: z.string().min(1).describe("תוכן ההערה")
    },
    build: (a) => ({ CustomerID: a.customerId, Remark: a.remark })
  }),

  /* ---------------------------- Documents ---------------------------- */
  defineEndpoint({
    name: "documents_create",
    title: "יצירת מסמך / Create document",
    path: "/accounting/documents/create/",
    module: "accounting.documents",
    scope: "write",
    confidence: "high",
    annotations: WRITE,
    timeoutMs: 120_000,
    description:
      "יוצר מסמך חשבונאי: חשבונית מס, חשבונית מס-קבלה, קבלה, חשבון עסקה, הצעת מחיר, הזמנה, דרישת תשלום, זיכוי ועוד (ראו type). " +
      "מסמכים שמתעדים תשלום (קבלה=2, חשבונית מס-קבלה=1, קבלת תרומה=4) חייבים מערך payments עם סכומים שסכומם שווה לסה\"כ. " +
      "מחזיר Data.DocumentID, Data.DocumentNumber, Data.CustomerID, Data.DocumentDownloadURL (ולעיתים DocumentPaymentURL לדרישת תשלום). " +
      "טיפ: השתמשו ב-isDraft=true כדי ליצור טיוטה שניתן לבטל בקלות. " +
      "Creates an accounting document. Payment-bearing types (Receipt, InvoiceAndReceipt, DonationReceipt) require `payments`. Returns document id/number and a download URL.",
    input: {
      type: documentTypeSchema,
      customer: customerSchema,
      items: z.array(documentLineSchema).min(1).describe("שורות המסמך"),
      payments: z.array(paymentLineSchema).optional().describe("תשלומים שהתקבלו — חובה לקבלות / חשבונית מס-קבלה"),
      vatIncluded: z.boolean().default(true).describe("האם המחירים כוללים מע\"מ (true) או שיש להוסיף מע\"מ (false)"),
      vatRate: z.number().optional().describe("שיעור מע\"מ באחוזים (ברירת מחדל: לפי הגדרות החברה/התאריך)"),
      vatPerItem: z.boolean().optional().describe("מע\"מ שונה לכל שורה (משתמש ב-VAT של כל שורה)"),
      currency: currencySchema.optional().describe("מטבע המסמך (ברירת מחדל ILS)"),
      language: languageSchema.optional().describe("שפת המסמך"),
      description: z.string().optional().describe("תיאור/כותרת המסמך (מודפס במסמך)"),
      openingText: z.string().optional().describe("טקסט פתיחה"),
      closingText: z.string().optional().describe("טקסט סיום / הערות"),
      externalReference: z.string().optional().describe("אסמכתא חיצונית (מספר הזמנה וכו')"),
      date: z.string().optional().describe("תאריך המסמך ISO 8601 (ברירת מחדל היום)"),
      dueDate: z.string().optional().describe("תאריך לתשלום"),
      isDraft: z.boolean().optional().describe("שמירה כטיוטה (ניתן להעביר לספרים עם documents_move_to_books)"),
      sendByEmail: z
        .object({
          emailAddress: z.string().optional().describe("אם ריק — נשלח לדוא\"ל הלקוח"),
          original: z.boolean().default(true).describe("שליחת מקור (true) או העתק"),
          sendAsPaymentRequest: z.boolean().optional().describe("שליחה כדרישת תשלום עם קישור לתשלום")
        })
        .optional()
        .describe("שליחת המסמך במייל מיד לאחר היצירה"),
      details: z.record(z.string(), z.unknown()).optional().describe("שדות נוספים לאובייקט Details (מעבר לשדות המובנים)"),
      responseLanguage: languageSchema.optional()
    },
    build: (a) => {
      const items = a.items.map((line) => {
        const qty = line.Quantity ?? 1;
        const unit = line.UnitPrice;
        return compact({
          ...line,
          Quantity: qty,
          UnitPrice: unit,
          TotalPrice: line.TotalPrice ?? (unit !== undefined ? Math.round(unit * qty * 100) / 100 : undefined),
          Item: compact({ SearchMode: 0, ...line.Item })
        });
      });
      const details = compact({
        Type: toDocumentType(a.type),
        Customer: a.customer,
        Language: toLanguage(a.language),
        Currency: a.currency,
        Description: a.description,
        OpeningText: a.openingText,
        ClosingText: a.closingText,
        ExternalReference: a.externalReference,
        Date: a.date,
        DueDate: a.dueDate,
        IsDraft: a.isDraft,
        SendByEmail: a.sendByEmail
          ? compact({ EmailAddress: a.sendByEmail.emailAddress, Original: a.sendByEmail.original ?? true, SendAsPaymentRequest: a.sendByEmail.sendAsPaymentRequest })
          : undefined,
        ...(a.details || {})
      });
      return compact({
        Details: details,
        Items: items,
        Payments: a.payments && a.payments.length ? a.payments : undefined,
        VATIncluded: a.vatIncluded ?? true,
        VATRate: a.vatRate,
        VATPerItem: a.vatPerItem,
        ResponseLanguage: toLanguage(a.responseLanguage)
      });
    }
  }),
  defineEndpoint({
    name: "documents_list",
    title: "רשימת מסמכים / List documents",
    path: "/accounting/documents/list/",
    module: "accounting.documents",
    scope: "read",
    confidence: "medium",
    annotations: READ_ONLY,
    description:
      "מחזיר רשימת מסמכים לפי סוגים, טווח תאריכים, טווח מספרים ולקוח. תומך בעימוד. " +
      "Lists documents with filters (types, date range, number range, customer). Data.Documents[] with DocumentID/DocumentNumber/Type/Date/CustomerName/DocumentValue/IsClosed and HasNextPage. " +
      "SUMIT returns pages of 10; use narrower date/number ranges when HasNextPage is true (the paging fields are sent but SUMIT may ignore them).",
    input: {
      documentTypes: z.array(documentTypeSchema).optional().describe("סוגי מסמכים לסינון (ריק = הכל)"),
      dateFrom: z.string().optional().describe("מתאריך (ISO 8601)"),
      dateTo: z.string().optional().describe("עד תאריך"),
      documentNumberFrom: z.number().int().optional(),
      documentNumberTo: z.number().int().optional(),
      customerId: z.number().int().optional().describe("סינון לפי לקוח"),
      includeDrafts: z.boolean().optional().describe("לכלול טיוטות"),
      paging: pagingSchema
    },
    build: (a) =>
      compact({
        DocumentTypes: a.documentTypes?.map(toDocumentType),
        DateFrom: a.dateFrom,
        DateTo: a.dateTo,
        DocumentNumberFrom: a.documentNumberFrom,
        DocumentNumberTo: a.documentNumberTo,
        CustomerID: a.customerId,
        IncludeDrafts: a.includeDrafts,
        Paging: a.paging,
        StartIndex: a.paging?.StartIndex,
        PageSize: a.paging?.PageSize
      })
  }),
  defineEndpoint({
    name: "documents_get_details",
    title: "פרטי מסמך / Document details",
    path: "/accounting/documents/getdetails/",
    module: "accounting.documents",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description:
      "מחזיר את פרטי המסמך המלאים: Document (מספר, סוג, תאריך, לקוח, סכום, IsClosed=שולם), Items, Payments, DocumentDownloadURL. " +
      "Locate by documentId or by documentType + documentNumber.",
    input: { ...docLocator },
    build: (a) => locatorBody(a)
  }),
  defineEndpoint({
    name: "documents_get_pdf",
    title: "הורדת PDF של מסמך / Document PDF",
    path: "/accounting/documents/getpdf/",
    module: "accounting.documents",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    timeoutMs: 120_000,
    description:
      "מחזיר את קובץ ה-PDF של המסמך (מקור או העתק). התשובה עשויה להיות קובץ בינארי (מוחזר כ-base64) או JSON עם Data.PDFURL. " +
      "Returns the document PDF (binary base64 or a URL). Prefer documents_get_details for the DocumentDownloadURL when you only need a link.",
    input: {
      ...docLocator,
      original: z.boolean().default(true).describe("מקור (true) או העתק (false)"),
      language: languageSchema.optional()
    },
    build: (a) => compact({ ...locatorBody(a), Original: a.original ?? true, Language: toLanguage(a.language) }),
    format: (r) => {
      if (r.binary) {
        return {
          text: `PDF received (${r.binary.bytes} bytes). The file is attached as a base64 resource.`,
          extraContent: [
            {
              type: "resource",
              resource: { uri: `sumit://document${r.path}?bytes=${r.binary.bytes}`, mimeType: "application/pdf", blob: r.binary.base64 }
            }
          ]
        };
      }
      return undefined;
    }
  }),
  defineEndpoint({
    name: "documents_send",
    title: "שליחת מסמך במייל / Send document",
    path: "/accounting/documents/send/",
    module: "accounting.documents",
    scope: "write",
    confidence: "high",
    annotations: WRITE,
    description: "שולח מסמך קיים לכתובת דוא\"ל (מקור/העתק). Sends an existing document by e-mail.",
    input: {
      ...docLocator,
      emailAddress: z.string().describe("כתובת הנמען"),
      original: z.boolean().default(true).describe("מקור (true) או העתק"),
      language: languageSchema.optional(),
      sendAsPaymentRequest: z.boolean().optional().describe("לשלוח כדרישת תשלום עם קישור לתשלום"),
      personalMessage: z.string().optional().describe("הודעה אישית בגוף המייל (אם נתמך)")
    },
    build: (a) =>
      compact({
        ...locatorBody(a),
        EmailAddress: a.emailAddress,
        Original: a.original ?? true,
        Language: toLanguage(a.language),
        SendAsPaymentRequest: a.sendAsPaymentRequest,
        PersonalMessage: a.personalMessage
      })
  }),
  defineEndpoint({
    name: "documents_cancel",
    title: "ביטול מסמך / Cancel document",
    path: "/accounting/documents/cancel/",
    module: "accounting.documents",
    scope: "write",
    confidence: "high",
    annotations: DESTRUCTIVE,
    description:
      "מבטל מסמך (סטורנו). לרוב מותר רק באותו יום קלנדרי שבו נוצר המסמך; אחרת יש להפיק מסמך זיכוי (documents_create עם סוג Credit*). " +
      "Cancels (stornos) a document — usually only allowed on the creation day; otherwise issue a credit document.",
    input: { documentId: z.number().int().describe("מזהה המסמך לביטול") },
    build: (a) => ({ DocumentID: a.documentId })
  }),
  defineEndpoint({
    name: "documents_move_to_books",
    title: "העברת טיוטה לספרים / Move draft to books",
    path: "/accounting/documents/movetobooks/",
    module: "accounting.documents",
    scope: "write",
    confidence: "medium",
    annotations: WRITE,
    description: "הופך מסמך טיוטה למסמך סופי (מקבל מספר רץ). Finalises a draft document.",
    input: { documentId: z.number().int() },
    build: (a) => ({ DocumentID: a.documentId })
  }),
  defineEndpoint({
    name: "documents_add_expense",
    title: "הוספת הוצאה / Add expense",
    path: "/accounting/documents/addexpense/",
    module: "accounting.documents",
    scope: "write",
    confidence: "low",
    annotations: WRITE,
    timeoutMs: 120_000,
    description:
      "רושם מסמך הוצאה (חשבונית ספק) בספרים, כולל אפשרות לצרף קובץ (base64). " +
      "Records an expense/supplier document. Shape is partly inferred — if SUMIT rejects it, pass the exact fields from the official docs via `extra`.",
    input: {
      supplier: customerSchema.optional().describe("הספק (כלקוח)"),
      type: documentTypeSchema.optional().describe("סוג מסמך ההוצאה (16=ExpenseInvoice, 15=ExpenseInvoiceReceipt, 17=ExpenseReceipt)"),
      items: z
        .array(z.looseObject({ Item: itemRefSchema.optional(), Amount: z.number().optional(), TotalPrice: z.number().optional(), Description: z.string().optional(), VAT: z.number().optional() }))
        .optional(),
      payments: z.array(paymentLineSchema).optional(),
      vatIncluded: z.boolean().optional(),
      expenseNumber: z.string().optional().describe("מספר החשבונית אצל הספק"),
      date: z.string().optional(),
      description: z.string().optional(),
      isDraft: z.boolean().optional(),
      expenseFileBase64: z.string().optional().describe("קובץ המסמך (PDF/תמונה) ב-base64"),
      expenseFilename: z.string().optional()
    },
    build: (a) =>
      compact({
        Details: compact({ Type: a.type !== undefined ? toDocumentType(a.type) : undefined, Customer: a.supplier, Date: a.date, Description: a.description, IsDraft: a.isDraft }),
        Items: a.items,
        Payments: a.payments,
        VATIncluded: a.vatIncluded,
        ExpenseNumber: a.expenseNumber,
        Date: a.date,
        Description: a.description,
        IsDraft: a.isDraft,
        ExpenseFile: a.expenseFileBase64,
        ExpenseFilename: a.expenseFilename
      })
  }),
  defineEndpoint({
    name: "documents_get_debt",
    title: "יתרת חוב של לקוח / Customer debt",
    path: "/accounting/documents/getdebt/",
    module: "accounting.documents",
    scope: "read",
    confidence: "medium",
    annotations: READ_ONLY,
    description:
      "מחזיר את יתרת החוב של לקוח (הפרש בין מסמכי חיוב למסמכי זיכוי/תשלום). " +
      "Returns the customer's outstanding balance. DebitSource/CreditSource select which document families count (1 = tax invoices vs receipts).",
    input: {
      customerId: z.number().int(),
      debitSource: z.number().int().optional().describe("מקור חיוב (ברירת מחדל 1)"),
      creditSource: z.number().int().optional().describe("מקור זיכוי (ברירת מחדל 1)"),
      includeDraftDocuments: z.boolean().optional()
    },
    build: (a) => compact({ CustomerID: a.customerId, DebitSource: a.debitSource ?? 1, CreditSource: a.creditSource ?? 1, IncludeDraftDocuments: a.includeDraftDocuments })
  }),
  defineEndpoint({
    name: "documents_get_debt_report",
    title: "דוח חובות / Debt report",
    path: "/accounting/documents/getdebtreport/",
    module: "accounting.documents",
    scope: "read",
    confidence: "medium",
    annotations: READ_ONLY,
    timeoutMs: 120_000,
    description: "דוח גיול/חובות של כל הלקוחות. Full receivables (debt) report across customers.",
    input: {
      debitSource: z.number().int().optional(),
      creditSource: z.number().int().optional(),
      includeDraftDocuments: z.boolean().optional(),
      date: z.string().optional().describe("נכון לתאריך")
    },
    build: (a) => compact({ DebitSource: a.debitSource ?? 1, CreditSource: a.creditSource ?? 1, IncludeDraftDocuments: a.includeDraftDocuments, Date: a.date })
  }),

  /* ---------------------------- General ---------------------------- */
  defineEndpoint({
    name: "general_get_vat_rate",
    title: "שיעור מע\"מ / VAT rate",
    path: "/accounting/general/getvatrate/",
    module: "accounting.general",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description: "מחזיר את שיעור המע\"מ בישראל לתאריך נתון (ברירת מחדל היום). Returns the VAT rate for a date. Also a cheap way to verify credentials.",
    input: { date: z.string().optional().describe("תאריך ISO 8601 (ברירת מחדל: עכשיו)") },
    build: (a) => ({ Date: a.date || new Date().toISOString() })
  }),
  defineEndpoint({
    name: "general_get_exchange_rate",
    title: "שער חליפין / Exchange rate",
    path: "/accounting/general/getexchangerate/",
    module: "accounting.general",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description: "שער חליפין יציג בין שני מטבעות לתאריך. Representative exchange rate between two currencies for a date.",
    input: {
      currencyFrom: z.string().default("USD").describe("קוד מטבע מקור, למשל USD"),
      currencyTo: z.string().default("ILS").describe("קוד מטבע יעד, למשל ILS"),
      date: z.string().optional()
    },
    build: (a) => ({ Date: a.date || new Date().toISOString(), Currency_From: a.currencyFrom || "USD", Currency_To: a.currencyTo || "ILS" })
  }),
  defineEndpoint({
    name: "general_verify_bank_account",
    title: "אימות חשבון בנק / Verify bank account",
    path: "/accounting/general/verifybankaccount/",
    module: "accounting.general",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description: "בודק תקינות של מספר בנק/סניף/חשבון ישראלי (ספרת ביקורת). Validates an Israeli bank account number.",
    input: {
      bankCode: z.number().int().describe("מספר בנק"),
      branchCode: z.number().int().describe("מספר סניף"),
      accountNumber: z.union([z.number().int(), z.string()]).describe("מספר חשבון"),
      verifyBranchNumber: z.boolean().default(true),
      verifyLimitedAccount: z.boolean().default(true)
    },
    build: (a) => ({
      BankCode: a.bankCode,
      BranchCode: a.branchCode,
      AccountNumber: a.accountNumber,
      VerifyBranchNumber: a.verifyBranchNumber ?? true,
      VerifyLimitedAccount: a.verifyLimitedAccount ?? true
    })
  }),
  defineEndpoint({
    name: "general_get_next_document_number",
    title: "מספר מסמך הבא / Next document number",
    path: "/accounting/general/getnextdocumentnumber/",
    module: "accounting.general",
    scope: "read",
    confidence: "medium",
    annotations: READ_ONLY,
    description: "מחזיר את המספר הרץ הבא לסוג מסמך. Returns the next sequential number for a document type.",
    input: { type: documentTypeSchema },
    build: (a) => ({ Type: toDocumentType(a.type) })
  }),
  defineEndpoint({
    name: "general_set_next_document_number",
    title: "קביעת מספר מסמך הבא / Set next document number",
    path: "/accounting/general/setnextdocumentnumber/",
    module: "accounting.general",
    scope: "write",
    confidence: "low",
    annotations: WRITE,
    description: "קובע את המספר הרץ הבא לסוג מסמך (זהירות — משפיע על רצף המספור). Sets the next sequential number for a document type.",
    input: { type: documentTypeSchema, number: z.number().int().describe("המספר הבא") },
    build: (a) => ({ Type: toDocumentType(a.type), Number: a.number, NextDocumentNumber: a.number })
  }),
  defineEndpoint({
    name: "general_update_settings",
    title: "עדכון הגדרות חברה / Update settings",
    path: "/accounting/general/updatesettings/",
    module: "accounting.general",
    scope: "write",
    confidence: "low",
    annotations: WRITE,
    description: "מעדכן הגדרות של מודול הנהלת החשבונות. יש להעביר את השדות המדויקים מהתיעוד הרשמי ב-settings. Updates accounting settings (pass raw fields).",
    input: { settings: z.record(z.string(), z.unknown()).describe("שדות ההגדרות כפי שמופיעים בתיעוד הרשמי") },
    build: (a) => ({ ...a.settings })
  }),

  /* ---------------------------- Income items ---------------------------- */
  defineEndpoint({
    name: "income_items_create",
    title: "יצירת פריט הכנסה / Create income item",
    path: "/accounting/incomeitems/create/",
    module: "accounting.incomeitems",
    scope: "write",
    confidence: "high",
    annotations: WRITE,
    description: "יוצר פריט/מוצר/שירות בקטלוג ההכנסות. Creates a product/service (income item). Returns Data.EntityID / Data.ID.",
    input: {
      item: z
        .looseObject({
          Name: z.string(),
          Price: z.number().optional(),
          Cost: z.number().optional(),
          Description: z.string().optional(),
          Currency: currencySchema.optional(),
          SKU: z.string().optional(),
          ExternalIdentifier: z.string().optional(),
          SearchMode: z.union([z.number().int(), z.string()]).optional()
        })
        .describe("פרטי הפריט")
    },
    build: (a) => ({ IncomeItem: a.item, Item: a.item })
  }),
  defineEndpoint({
    name: "income_items_list",
    title: "רשימת פריטי הכנסה / List income items",
    path: "/accounting/incomeitems/list/",
    module: "accounting.incomeitems",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description: "מחזיר את קטלוג הפריטים/מוצרים/שירותים. Lists income items (products & services) with paging.",
    input: { paging: pagingSchema },
    build: (a) => compact({ Paging: a.paging })
  }),

  /* ---------------------------- Stock ---------------------------- */
  defineEndpoint({
    name: "stock_list",
    title: "מלאי / Stock levels",
    path: "/stock/stock/list/",
    module: "stock",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description: "רמות מלאי לפריטים (מודול מלאי). Stock levels per item: Data.Stock[] { ItemID, Stock }.",
    input: { excludeZeroStock: z.boolean().optional().describe("להסתיר פריטים עם מלאי 0") },
    build: (a) => compact({ ExcludeZeroStock: a.excludeZeroStock })
  })
];
