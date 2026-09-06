import { z } from "zod";
import {
  DESTRUCTIVE,
  READ_ONLY,
  WRITE,
  chargeLineSchema,
  compact,
  customerSchema,
  defineEndpoint,
  documentTypeSchema,
  languageSchema,
  paymentMethodSchema,
  toDocumentType,
  toLanguage
} from "./common.js";

const chargeCommon = {
  customer: customerSchema.describe("הלקוח שיחויב (ID של לקוח קיים או פרטים ליצירה/איתור)"),
  items: z.array(chargeLineSchema).min(1).describe("שורות החיוב"),
  singleUseToken: z.string().optional().describe("SingleUseToken שנוצר ב-payments.js בדפדפן (מומלץ — הכרטיס לא עובר דרך השרת)"),
  paymentMethod: paymentMethodSchema.optional().describe("חלופה ל-singleUseToken: טוקן שמור (CreditCard_Token) או פרטי כרטיס (PCI בלבד). אם לא נשלח דבר — סאמיט ינסה את אמצעי התשלום השמור של הלקוח"),
  vatIncluded: z.boolean().default(true),
  vatRate: z.number().optional(),
  documentType: documentTypeSchema.optional().describe("סוג המסמך שיופק אוטומטית (ברירת מחדל לפי הגדרות)"),
  documentDescription: z.string().optional().describe("תיאור שיופיע במסמך"),
  documentLanguage: languageSchema.optional(),
  sendDocumentByEmail: z.boolean().optional().describe("לשלוח את המסמך ללקוח במייל"),
  draftDocument: z.boolean().optional().describe("להפיק את המסמך כטיוטה"),
  paymentsCount: z.number().int().min(1).max(36).optional().describe("מספר תשלומים (Payments_Count)"),
  maximumPayments: z.number().int().min(1).max(36).optional().describe("מקסימום תשלומים מותר"),
  merchantNumber: z.string().optional().describe("מספר מסוף/ספק סליקה ספציפי (אם יש כמה)"),
  externalReference: z.string().optional(),
  updateCustomerOnSuccess: z.boolean().optional(),
  responseLanguage: languageSchema.optional()
};

function chargeBody(a: z.infer<z.ZodObject<typeof chargeCommon>>) {
  return compact({
    Customer: a.customer,
    Items: a.items,
    SingleUseToken: a.singleUseToken,
    PaymentMethod: a.paymentMethod ? compact({ Type: 1, ...a.paymentMethod }) : undefined,
    VATIncluded: a.vatIncluded ?? true,
    VATRate: a.vatRate,
    DocumentType: a.documentType !== undefined ? toDocumentType(a.documentType) : undefined,
    DocumentDescription: a.documentDescription,
    DocumentLanguage: toLanguage(a.documentLanguage),
    SendDocumentByEmail: a.sendDocumentByEmail,
    DraftDocument: a.draftDocument,
    Payments_Count: a.paymentsCount,
    MaximumPayments: a.maximumPayments,
    MerchantNumber: a.merchantNumber,
    ExternalReference: a.externalReference,
    UpdateCustomerOnSuccess: a.updateCustomerOnSuccess,
    ResponseLanguage: toLanguage(a.responseLanguage)
  });
}

export const billingEndpoints = [
  /* ---------------------------- Payments ---------------------------- */
  defineEndpoint({
    name: "payments_charge",
    title: "חיוב כרטיס אשראי / Charge",
    path: "/billing/payments/charge/",
    module: "billing.payments",
    scope: "payments",
    confidence: "high",
    annotations: DESTRUCTIVE,
    timeoutMs: 180_000,
    description:
      "⚠️ מבצע חיוב אמיתי בכרטיס אשראי (מודול סליקה) ומפיק אוטומטית חשבונית מס-קבלה/קבלה. " +
      "אמצעי תשלום: singleUseToken (מ-payments.js), paymentMethod.CreditCard_Token (כרטיס שמור), פרטי כרטיס מלאים (PCI בלבד), או ללא — אמצעי התשלום השמור של הלקוח. " +
      "authoriseOnly=true תופס מסגרת בלבד (J5) ללא חיוב; onlyDocument=true מפיק מסמך בלבד ללא סליקה. " +
      "מחזיר Data.Payment {ID, ValidPayment, Status ('000'=אושר), StatusDescription, AuthNumber, Amount}, Data.CustomerID, Data.DocumentID. " +
      "Charges a card and issues the document. Always confirm amount + customer with the user before calling.",
    input: {
      ...chargeCommon,
      authoriseOnly: z.boolean().optional().describe("תפיסת מסגרת בלבד ללא חיוב"),
      authorizeAmount: z.number().optional().describe("סכום לתפיסת מסגרת (אם שונה מהסכום)"),
      autoCapture: z.boolean().optional(),
      onlyDocument: z.boolean().optional().describe("הפקת מסמך בלבד ללא חיוב בפועל"),
      supportCredit: z.boolean().optional().describe("אפשר עסקת זיכוי (סכום שלילי)"),
      cancelable: z.boolean().optional()
    },
    build: (a) =>
      compact({
        ...chargeBody(a),
        AuthoriseOnly: a.authoriseOnly,
        AuthorizeAmount: a.authorizeAmount,
        AutoCapture: a.autoCapture,
        OnlyDocument: a.onlyDocument,
        SupportCredit: a.supportCredit,
        Cancelable: a.cancelable
      })
  }),
  defineEndpoint({
    name: "payments_refund",
    title: "זיכוי / Refund",
    path: "/billing/payments/charge/",
    module: "billing.payments",
    scope: "payments",
    confidence: "medium",
    annotations: DESTRUCTIVE,
    timeoutMs: 180_000,
    description:
      "⚠️ מבצע זיכוי (החזר כספי) לכרטיס האשראי של הלקוח דרך אותו endpoint של חיוב: סכום שלילי + SupportCredit=true, " +
      "עם הפניה למספר האישור של העסקה המקורית (originalAuthNumber). מפיק מסמך זיכוי. " +
      "Refunds a previous card charge (negative amount + SupportCredit). Confirm with the user first.",
    input: {
      customer: customerSchema.describe("הלקוח (רצוי ID)"),
      amount: z.number().positive().describe("סכום הזיכוי (חיובי — יישלח כשלילי)"),
      description: z.string().default("זיכוי").describe("תיאור הזיכוי / שם השורה"),
      originalAuthNumber: z.string().optional().describe("מספר אישור (AuthNumber) של העסקה המקורית"),
      originalPaymentId: z.number().int().optional().describe("מזהה התשלום המקורי (PaymentID)"),
      paymentMethod: paymentMethodSchema.optional().describe("כרטיס ספציפי לזיכוי (ברירת מחדל: הכרטיס השמור)"),
      currency: z.union([z.string(), z.number()]).optional(),
      vatIncluded: z.boolean().default(true),
      documentLanguage: languageSchema.optional(),
      sendDocumentByEmail: z.boolean().optional()
    },
    build: (a) =>
      compact({
        Customer: a.customer,
        Items: [
          compact({
            Item: { Name: a.description || "זיכוי", SearchMode: 0 },
            Quantity: 1,
            UnitPrice: -Math.abs(a.amount),
            Currency: a.currency
          })
        ],
        SupportCredit: true,
        Payment: a.originalAuthNumber || a.originalPaymentId ? compact({ CreditCardAuthNumber: a.originalAuthNumber, ID: a.originalPaymentId }) : undefined,
        PaymentMethod: a.paymentMethod ? compact({ Type: 1, ...a.paymentMethod }) : undefined,
        VATIncluded: a.vatIncluded ?? true,
        DocumentDescription: a.description,
        DocumentLanguage: toLanguage(a.documentLanguage),
        SendDocumentByEmail: a.sendDocumentByEmail
      })
  }),
  defineEndpoint({
    name: "payments_get",
    title: "פרטי תשלום / Get payment",
    path: "/billing/payments/get/",
    module: "billing.payments",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description: "מחזיר פרטי תשלום/עסקת סליקה לפי מזהה. Returns a payment (Data.Payment) by PaymentID.",
    input: { paymentId: z.number().int() },
    build: (a) => ({ PaymentID: a.paymentId })
  }),
  defineEndpoint({
    name: "payments_list",
    title: "רשימת תשלומים / List payments",
    path: "/billing/payments/list/",
    module: "billing.payments",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    timeoutMs: 120_000,
    description:
      "רשימת עסקאות סליקה בטווח תאריכים (ברירת מחדל 30 הימים האחרונים). Data.Payments[] + HasNextPage; השתמשו ב-startIndex לעימוד. " +
      "valid=true מחזיר רק עסקאות שאושרו.",
    input: {
      dateFrom: z.string().optional().describe("ISO 8601"),
      dateTo: z.string().optional(),
      valid: z.boolean().optional().describe("רק תשלומים תקינים/מאושרים"),
      customerId: z.number().int().optional(),
      startIndex: z.number().int().min(0).optional()
    },
    build: (a) =>
      compact({
        Date_From: a.dateFrom || new Date(Date.now() - 30 * 86_400_000).toISOString(),
        Date_To: a.dateTo || new Date().toISOString(),
        Valid: a.valid,
        CustomerID: a.customerId,
        Customer: a.customerId ? { ID: a.customerId } : undefined,
        StartIndex: a.startIndex
      })
  }),
  defineEndpoint({
    name: "payments_begin_redirect",
    title: "יצירת דף תשלום / Hosted payment page",
    path: "/billing/payments/beginredirect/",
    module: "billing.payments",
    scope: "write",
    confidence: "high",
    annotations: WRITE,
    description:
      "יוצר קישור לדף תשלום מאובטח של סאמיט (כרטיס אשראי, או Bit עם automaticallyRedirectToProviderPaymentPage='UpayBit'). " +
      "הלקוח מופנה ל-Data.RedirectURL; לאחר התשלום מופנה ל-redirectUrl ונשלח IPN ל-ipnUrl. " +
      "Creates a hosted checkout page URL. Returns Data.RedirectURL.",
    input: {
      ...chargeCommon,
      redirectUrl: z.string().describe("כתובת חזרה לאחר תשלום מוצלח"),
      cancelRedirectUrl: z.string().optional().describe("כתובת חזרה בביטול"),
      ipnUrl: z.string().optional().describe("Webhook/IPN שיקבל את תוצאת התשלום"),
      automaticallyRedirectToProviderPaymentPage: z.string().optional().describe("'UpayBit' לתשלום ב-Bit"),
      authoriseOnly: z.boolean().optional()
    },
    build: (a) =>
      compact({
        ...chargeBody(a),
        RedirectURL: a.redirectUrl,
        CancelRedirectURL: a.cancelRedirectUrl,
        IPNURL: a.ipnUrl,
        AutomaticallyRedirectToProviderPaymentPage: a.automaticallyRedirectToProviderPaymentPage,
        AuthoriseOnly: a.authoriseOnly
      })
  }),
  defineEndpoint({
    name: "payments_multivendor_charge",
    title: "חיוב מרובה ספקים / Multi-vendor charge",
    path: "/billing/payments/multivendorcharge/",
    module: "billing.payments",
    scope: "payments",
    confidence: "low",
    annotations: DESTRUCTIVE,
    timeoutMs: 180_000,
    description:
      "⚠️ חיוב עם פיצול בין כמה ספקים/חברות (Marketplace). המבנה דומה ל-payments_charge; שדות הפיצול (Vendors/Splits) יש להעביר ב-extra לפי התיעוד הרשמי. " +
      "Multi-vendor split charge — pass vendor split fields via `extra`.",
    input: { ...chargeCommon },
    build: (a) => chargeBody(a)
  }),

  /* ---------------------------- Payment methods ---------------------------- */
  defineEndpoint({
    name: "payment_methods_get_for_customer",
    title: "אמצעי תשלום שמורים / Saved payment methods",
    path: "/billing/paymentmethods/getforcustomer/",
    module: "billing.paymentmethods",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description: "מחזיר את אמצעי התשלום (כרטיסים שמורים, טוקנים) של לקוח. Returns the customer's saved payment methods (masked).",
    input: { customerId: z.number().int() },
    build: (a) => ({ Customer: { ID: a.customerId } })
  }),
  defineEndpoint({
    name: "payment_methods_set_for_customer",
    title: "שמירת אמצעי תשלום ללקוח / Save payment method",
    path: "/billing/paymentmethods/setforcustomer/",
    module: "billing.paymentmethods",
    scope: "write",
    confidence: "high",
    annotations: WRITE,
    description:
      "שומר כרטיס אשראי כאמצעי התשלום (ברירת המחדל) של הלקוח, מתוך SingleUseToken או טוקן קבוע (CreditCard_Token). " +
      "Stores a card as the customer's default payment method.",
    input: {
      customerId: z.number().int(),
      singleUseToken: z.string().optional(),
      paymentMethod: paymentMethodSchema.optional()
    },
    build: (a) => {
      if (!a.singleUseToken && !a.paymentMethod) throw new Error("Provide singleUseToken or paymentMethod");
      return compact({ Customer: { ID: a.customerId }, SingleUseToken: a.singleUseToken, PaymentMethod: a.paymentMethod ? compact({ Type: 1, ...a.paymentMethod }) : undefined });
    }
  }),
  defineEndpoint({
    name: "payment_methods_remove",
    title: "הסרת אמצעי תשלום / Remove payment method",
    path: "/billing/paymentmethods/remove/",
    module: "billing.paymentmethods",
    scope: "write",
    confidence: "high",
    annotations: DESTRUCTIVE,
    description: "מסיר את אמצעי התשלום השמור של הלקוח. Removes the customer's saved payment method.",
    input: { customerId: z.number().int(), paymentMethodId: z.number().int().optional().describe("מזהה אמצעי תשלום ספציפי (אם יש כמה)") },
    build: (a) => compact({ Customer: { ID: a.customerId }, PaymentMethodID: a.paymentMethodId })
  }),

  /* ---------------------------- Recurring ---------------------------- */
  defineEndpoint({
    name: "recurring_charge",
    title: "הוראת קבע / Recurring charge",
    path: "/billing/recurring/charge/",
    module: "billing.recurring",
    scope: "payments",
    confidence: "high",
    annotations: DESTRUCTIVE,
    timeoutMs: 180_000,
    description:
      "⚠️ יוצר הוראת קבע (מנוי) בכרטיס אשראי ומחייב לפי Items[].Duration_Months / Recurrence / Date_Start (תאריך עתידי = תקופת ניסיון). " +
      "לחיוב חוזר של הוראת קבע קיימת העבירו recurringPaymentId. מחזיר Data.RecurringCustomerItemIDs[] / RecurringID, CustomerID, DocumentID, Payment. " +
      "Creates a standing order (subscription) or charges an existing one (recurringPaymentId).",
    input: {
      ...chargeCommon,
      recurringPaymentId: z.union([z.number().int(), z.string()]).optional().describe("מזהה הוראת קבע קיימת לחיוב חוזר"),
      authoriseOnly: z.boolean().optional(),
      onlyDocument: z.boolean().optional()
    },
    build: (a) => compact({ ...chargeBody(a), RecurringPaymentID: a.recurringPaymentId, AuthoriseOnly: a.authoriseOnly, OnlyDocument: a.onlyDocument })
  }),
  defineEndpoint({
    name: "recurring_list_for_customer",
    title: "הוראות קבע של לקוח / List recurring items",
    path: "/billing/recurring/listforcustomer/",
    module: "billing.recurring",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description: "רשימת הוראות הקבע/מנויים של לקוח: Data.RecurringItems[] {ID, Date_NextBilling, Status, ...}.",
    input: {
      customerId: z.number().int().optional(),
      customer: customerSchema.optional().describe("חלופה ל-customerId (למשל ExternalIdentifier + SearchMode=2)"),
      includeInactive: z.boolean().optional()
    },
    build: (a) => {
      if (!a.customerId && !a.customer) throw new Error("Provide customerId or customer");
      return compact({ Customer: a.customerId ? { ID: a.customerId } : a.customer, IncludeInactive: a.includeInactive });
    }
  }),
  defineEndpoint({
    name: "recurring_update",
    title: "עדכון הוראת קבע / Update recurring item",
    path: "/billing/recurring/update/",
    module: "billing.recurring",
    scope: "write",
    confidence: "low",
    annotations: WRITE,
    description:
      "מעדכן הוראת קבע קיימת (סכום, תאריך חיוב הבא, סטטוס...). מזהה: RecurringCustomerItemID (מ-recurring_list_for_customer). שדות העדכון יש להעביר ב-fields לפי התיעוד הרשמי.",
    input: {
      recurringCustomerItemId: z.union([z.number().int(), z.string()]).describe("מזהה הוראת הקבע"),
      fields: z.record(z.string(), z.unknown()).describe("שדות לעדכון (למשל UnitPrice, Date_NextBilling, Quantity)")
    },
    build: (a) => ({ RecurringCustomerItemID: a.recurringCustomerItemId, ID: a.recurringCustomerItemId, ...a.fields })
  }),
  defineEndpoint({
    name: "recurring_cancel",
    title: "ביטול הוראת קבע / Cancel recurring item",
    path: "/billing/recurring/cancel/",
    module: "billing.recurring",
    scope: "write",
    confidence: "medium",
    annotations: DESTRUCTIVE,
    description: "⚠️ מבטל הוראת קבע/מנוי (הפסקת חיובים עתידיים). Cancels a standing order.",
    input: { recurringCustomerItemId: z.union([z.number().int(), z.string()]).describe("מזהה הוראת הקבע") },
    build: (a) => ({ RecurringCustomerItemID: a.recurringCustomerItemId, ID: a.recurringCustomerItemId })
  }),

  /* ---------------------------- CreditGuy terminal ---------------------------- */
  defineEndpoint({
    name: "creditguy_transaction",
    title: "עסקת מסוף (CreditGuy) / Terminal transaction",
    path: "/creditguy/gateway/transaction/",
    module: "creditguy",
    scope: "payments",
    confidence: "medium",
    annotations: DESTRUCTIVE,
    timeoutMs: 180_000,
    description:
      "⚠️ עסקת סליקה ברמת המסוף ללא הפקת מסמך: חיוב (transactionType=1) או אישור/תפיסת מסגרת (2), יצירת טוקן קבוע (paramJ='J2'/'J5'), אימות כרטיס בסכום 1₪. " +
      "Low-level gateway transaction (no document). Returns Data.{Success, TransactionID, Token}.",
    input: {
      amount: z.number().describe("סכום"),
      currency: z.string().default("ILS"),
      numPayments: z.number().int().min(1).max(36).default(1),
      transactionType: z.number().int().optional().describe("1=חיוב, 2=אישור בלבד"),
      paramJ: z.enum(["J2", "J5", "J6"]).optional().describe("סוג טוקן ליצירה"),
      singleUseToken: z.string().optional(),
      token: z.string().optional().describe("טוקן קבוע קיים"),
      card: z
        .object({
          CardNumber: z.string(),
          ExpirationMonth: z.union([z.string(), z.number()]),
          ExpirationYear: z.union([z.string(), z.number()]),
          CVV: z.string().optional(),
          CitizenID: z.string().optional()
        })
        .optional()
        .describe("פרטי כרטיס גולמיים — PCI בלבד"),
      orderId: z.string().optional().describe("אסמכתא")
    },
    build: (a) =>
      compact({
        Amount: a.amount,
        Currency: a.currency || "ILS",
        NumPayments: a.numPayments ?? 1,
        TransactionType: a.transactionType,
        ParamJ: a.paramJ,
        SingleUseToken: a.singleUseToken,
        Token: a.token,
        ...(a.card || {}),
        OrderID: a.orderId
      })
  }),
  defineEndpoint({
    name: "creditguy_capture",
    title: "תפיסת מסגרת → חיוב / Capture authorization",
    path: "/creditguy/gateway/capture/",
    module: "creditguy",
    scope: "payments",
    confidence: "medium",
    annotations: DESTRUCTIVE,
    timeoutMs: 120_000,
    description: "⚠️ ממיר אישור (J5) לחיוב בפועל, כולל תפיסה חלקית. Captures a previous authorization (partial capture allowed).",
    input: {
      transactionId: z.string().describe("TransactionID מהאישור"),
      amount: z.number().describe("סכום לחיוב (≤ הסכום שאושר)"),
      orderId: z.string().optional()
    },
    build: (a) => compact({ TransactionID: a.transactionId, Amount: a.amount, OrderID: a.orderId })
  }),
  defineEndpoint({
    name: "creditguy_tokenize_single_use",
    title: "יצירת SingleUseToken מפרטי כרטיס / Tokenize card",
    path: "/creditguy/vault/tokenizesingleusejson/",
    module: "creditguy",
    scope: "write",
    confidence: "medium",
    annotations: WRITE,
    usePublicKey: true,
    description:
      "ממיר פרטי כרטיס אשראי ל-SingleUseToken (משתמש במפתח הציבורי של החשבון — יש להגדירו בקונסולת הניהול). " +
      "⚠️ העברת מספרי כרטיס דרך ה-AI אינה מומלצת מבחינת PCI — עדיף payments.js בדפדפן. Creates a single-use token from raw card data (uses APIPublicKey).",
    input: {
      cardNumber: z.string(),
      expirationMonth: z.union([z.string(), z.number()]),
      expirationYear: z.union([z.string(), z.number()]),
      cvv: z.string().optional(),
      citizenId: z.string().optional()
    },
    build: (a) => compact({ CardNumber: a.cardNumber, ExpirationMonth: String(a.expirationMonth), ExpirationYear: String(a.expirationYear), CVV: a.cvv, CitizenID: a.citizenId })
  })
];
