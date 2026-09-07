import { z } from "zod";
import { DESTRUCTIVE, READ_ONLY, WRITE, compact, defineEndpoint, pagingSchema } from "./common.js";

const folderRef = {
  folder: z.union([z.string(), z.number()]).optional().describe("שם או מזהה תיקייה (Folder). ניתן לקבל מ-crm_list_folders"),
  folderId: z.number().int().optional().describe("מזהה תיקייה מספרי (FolderID)")
};

function folderBody(a: { folder?: string | number; folderId?: number }) {
  const folderId = a.folderId ?? (typeof a.folder === "number" ? a.folder : undefined);
  return compact({ Folder: a.folder !== undefined ? String(a.folder) : folderId !== undefined ? String(folderId) : undefined, FolderID: folderId });
}

export const crmEndpoints = [
  defineEndpoint({
    name: "crm_list_folders",
    title: "תיקיות CRM / List folders",
    path: "/crm/schema/listfolders/",
    module: "crm.schema",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description:
      "מחזיר את כל התיקיות (טבלאות/ישויות) במודול ה-CRM של הארגון — לקוחות, לידים, פרויקטים, תיקיות מותאמות וכו'. " +
      "זו נקודת ההתחלה לעבודה עם נתוני CRM: קחו את שם/מזהה התיקייה ואז crm_get_folder לסכמת השדות.",
    input: { nameFilter: z.string().optional().describe("סינון לפי שם תיקייה") },
    build: (a) => compact({ NameFilter: a.nameFilter, Name: a.nameFilter })
  }),
  defineEndpoint({
    name: "crm_get_folder",
    title: "סכמת תיקייה / Folder schema",
    path: "/crm/schema/getfolder/",
    module: "crm.schema",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description: "מחזיר את הגדרת התיקייה כולל רשימת השדות (Properties) — שמות, סוגים, ערכים אפשריים. נדרש לפני יצירה/עדכון של רשומות.",
    input: { ...folderRef, includeProperties: z.boolean().default(true) },
    build: (a) => ({ ...folderBody(a), IncludeProperties: a.includeProperties ?? true })
  }),
  defineEndpoint({
    name: "crm_list_views",
    title: "תצוגות של תיקייה / List views",
    path: "/crm/views/listviews/",
    module: "crm.views",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description: "רשימת התצוגות (Views — מסננים שמורים) של תיקייה. משמש גם להגדרת טריגרים/Webhooks על תצוגה.",
    input: { folderId: z.number().int().describe("מזהה תיקייה") },
    build: (a) => ({ FolderID: a.folderId })
  }),
  defineEndpoint({
    name: "crm_list_entities",
    title: "רשימת רשומות / List entities",
    path: "/crm/data/listentities/",
    module: "crm.data",
    scope: "read",
    confidence: "medium",
    annotations: READ_ONLY,
    timeoutMs: 120_000,
    description:
      "מחזיר רשומות (כרטיסים) מתיקיית CRM עם עימוד, אופציונלית לפי תצוגה (viewId) או מסננים. " +
      "Data.Entities[] כולל ID ו-Properties. Lists CRM records in a folder.",
    input: {
      ...folderRef,
      viewId: z.number().int().optional().describe("מזהה תצוגה לסינון"),
      filters: z.record(z.string(), z.unknown()).optional().describe("מסננים לפי שדות (מבנה לפי התיעוד הרשמי)"),
      loadProperties: z.boolean().default(true).describe("להחזיר את כל השדות של כל רשומה"),
      paging: pagingSchema
    },
    build: (a) => compact({ ...folderBody(a), ViewID: a.viewId, Filters: a.filters, LoadProperties: a.loadProperties ?? true, Paging: a.paging })
  }),
  defineEndpoint({
    name: "crm_get_entity",
    title: "רשומה בודדת / Get entity",
    path: "/crm/data/getentity/",
    module: "crm.data",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description: "מחזיר רשומת CRM לפי מזהה, כולל כל השדות. Returns a single CRM record by EntityID.",
    input: { entityId: z.number().int(), ...folderRef },
    build: (a) => compact({ EntityID: a.entityId, ...folderBody(a) })
  }),
  defineEndpoint({
    name: "crm_create_entity",
    title: "יצירת רשומה / Create entity",
    path: "/crm/data/createentity/",
    module: "crm.data",
    scope: "write",
    confidence: "medium",
    annotations: WRITE,
    description:
      "יוצר רשומה (כרטיס) חדשה בתיקיית CRM. properties = מפה של APIName של שדה → ערך פשוט, לפי הסכמה מ-crm_get_folder. " +
      "Creates a CRM record (Entity.Properties with plain values).",
    input: {
      ...folderRef,
      properties: z.record(z.string(), z.unknown()).describe("שדות הרשומה: { \"Name\": \"...\", \"Phone\": \"...\" }")
    },
    build: (a) => {
      const fb = folderBody(a);
      // Property values are plain values inside Entity.Properties (verified live; arrays are rejected by SUMIT).
      return { Entity: compact({ Folder: fb.Folder, Properties: a.properties }) };
    }
  }),
  defineEndpoint({
    name: "crm_update_entity",
    title: "עדכון רשומה / Update entity",
    path: "/crm/data/updateentity/",
    module: "crm.data",
    scope: "write",
    confidence: "high",
    annotations: WRITE,
    description:
      "מעדכן שדות ברשומת CRM קיימת (כולל כרטיסי מסמכים: למשל Accounting_Closed להצעת מחיר). properties = { APIName: value } עם ערכים פשוטים (לא מערכים); את ה-APIName של כל שדה מקבלים מ-crm_get_folder. " +
      "Updates fields of an existing CRM record (createIfMissing creates it when not found).",
    input: {
      entityId: z.number().int(),
      ...folderRef,
      properties: z.record(z.string(), z.unknown()),
      createIfMissing: z.boolean().optional()
    },
    build: (a) => {
      const fb = folderBody(a);
      return compact({ Entity: compact({ ID: a.entityId, Folder: fb.Folder, Properties: a.properties }), CreateIfMissing: a.createIfMissing });
    }
  }),
  defineEndpoint({
    name: "crm_archive_entity",
    title: "ארכוב רשומה / Archive entity",
    path: "/crm/data/archiveentity/",
    module: "crm.data",
    scope: "write",
    confidence: "high",
    annotations: DESTRUCTIVE,
    description: "מעביר רשומה לארכיון (ניתן לשחזור מהמערכת). Archives a CRM record.",
    input: { entityId: z.number().int(), ...folderRef },
    build: (a) => compact({ EntityID: a.entityId, ...folderBody(a) })
  }),
  defineEndpoint({
    name: "crm_delete_entity",
    title: "מחיקת רשומה / Delete entity",
    path: "/crm/data/deleteentity/",
    module: "crm.data",
    scope: "write",
    confidence: "high",
    annotations: DESTRUCTIVE,
    description: "⚠️ מוחק רשומת CRM לצמיתות. Permanently deletes a CRM record — confirm with the user first.",
    input: { entityId: z.number().int(), ...folderRef },
    build: (a) => compact({ EntityID: a.entityId, ...folderBody(a) })
  }),
  defineEndpoint({
    name: "crm_count_entity_usage",
    title: "שימושים ברשומה / Count entity usage",
    path: "/crm/data/countentityusage/",
    module: "crm.data",
    scope: "read",
    confidence: "medium",
    annotations: READ_ONLY,
    description: "סופר כמה רשומות אחרות מקושרות לרשומה (לפני מחיקה). Counts references to a record.",
    input: { entityId: z.number().int() },
    build: (a) => ({ EntityID: a.entityId })
  }),
  defineEndpoint({
    name: "crm_get_entity_print_html",
    title: "תצוגת הדפסה של רשומה / Entity print HTML",
    path: "/crm/data/getentityprinthtml/",
    module: "crm.data",
    scope: "read",
    confidence: "medium",
    annotations: READ_ONLY,
    description: "מחזיר HTML להדפסה של רשומה. Returns printable HTML for a record.",
    input: { entityId: z.number().int() },
    build: (a) => ({ EntityID: a.entityId })
  }),
  defineEndpoint({
    name: "crm_get_entities_html",
    title: "HTML של רשימת רשומות / Entities HTML",
    path: "/crm/data/getentitieshtml/",
    module: "crm.data",
    scope: "read",
    confidence: "low",
    annotations: READ_ONLY,
    description: "מחזיר HTML של רשימת רשומות/תצוגה. Returns HTML rendering of a folder/view.",
    input: { ...folderRef, viewId: z.number().int().optional() },
    build: (a) => compact({ ...folderBody(a), ViewID: a.viewId })
  }),

  /* ---------------------------- Triggers / webhooks ---------------------------- */
  defineEndpoint({
    name: "triggers_subscribe",
    title: "הרשמה ל-Webhook / Subscribe trigger",
    path: "/billing/triggers/triggers/subscribe/",
    module: "triggers",
    scope: "write",
    confidence: "low",
    annotations: WRITE,
    description:
      "רושם כתובת URL שתקבל Webhook כאשר מתרחש אירוע (למשל CrmEntityCreated / CrmEntityUpdated / DocumentCreated / PaymentReceived), אופציונלית לתיקייה/תצוגה. " +
      "הערה: הדרך הרשמית והמתועדת היא מודול הטריגרים בממשק סאמיט (תצוגה → טריגר → קריאת HTTP); ה-endpoint הזה נלקח מספריות קהילה ועשוי להשתנות.",
    input: {
      url: z.string().describe("כתובת ה-Webhook שתקבל POST"),
      triggerType: z.string().describe("סוג האירוע: CrmEntityCreated | CrmEntityUpdated | DocumentCreated | PaymentReceived | מחרוזת מותאמת"),
      folder: z.union([z.string(), z.number()]).optional(),
      viewId: z.number().int().optional()
    },
    build: (a) => compact({ URL: a.url, TriggerType: a.triggerType, Folder: a.folder !== undefined ? String(a.folder) : undefined, View: a.viewId })
  }),
  defineEndpoint({
    name: "triggers_unsubscribe",
    title: "ביטול Webhook / Unsubscribe trigger",
    path: "/billing/triggers/triggers/unsubscribe/",
    module: "triggers",
    scope: "write",
    confidence: "low",
    annotations: DESTRUCTIVE,
    description: "מסיר הרשמת Webhook לפי URL. Unsubscribes a webhook URL.",
    input: { url: z.string() },
    build: (a) => ({ URL: a.url })
  })
];
