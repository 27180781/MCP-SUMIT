import { z } from "zod";
import { DESTRUCTIVE, READ_ONLY, WRITE, compact, defineEndpoint } from "./common.js";

const companySchema = z
  .looseObject({
    Name: z.string().optional(),
    EmailAddress: z.string().optional(),
    CorporateNumber: z.string().optional().describe("ח.פ / מספר עוסק"),
    Address: z.string().optional(),
    City: z.string().optional(),
    Phone: z.string().optional(),
    Website: z.string().optional()
  })
  .describe("פרטי הארגון / company details");

export const websiteEndpoints = [
  defineEndpoint({
    name: "company_get_details",
    title: "פרטי הארגון / Company details",
    path: "/website/companies/getdetails/",
    module: "website.companies",
    scope: "read",
    confidence: "high",
    annotations: READ_ONLY,
    description: "מחזיר את פרטי הארגון (החברה) שאליו שייך המפתח: שם, ח.פ, כתובת, הגדרות. משמש גם לבדיקת תקינות החיבור. Returns the organisation details for the account.",
    input: {},
    build: () => ({})
  }),
  defineEndpoint({
    name: "company_list_quotas",
    title: "מכסות שימוש / Usage quotas",
    path: "/website/companies/listquotas/",
    module: "website.companies",
    scope: "read",
    confidence: "medium",
    annotations: READ_ONLY,
    description: "מכסות השימוש של הארגון (מסמכים, SMS, משתמשים וכו'). Lists the organisation's usage quotas.",
    input: {},
    build: () => ({})
  }),
  defineEndpoint({
    name: "company_update",
    title: "עדכון פרטי הארגון / Update company",
    path: "/website/companies/update/",
    module: "website.companies",
    scope: "write",
    confidence: "medium",
    annotations: WRITE,
    description: "מעדכן את פרטי הארגון. Updates organisation details.",
    input: { company: companySchema },
    build: (a) => ({ Company: a.company })
  }),
  defineEndpoint({
    name: "company_create",
    title: "יצירת ארגון חדש / Create company",
    path: "/website/companies/create/",
    module: "website.companies",
    scope: "write",
    confidence: "medium",
    annotations: WRITE,
    description: "יוצר ארגון (חברה) חדש במערכת סאמיט — למשווקים/משרדי הנהלת חשבונות שמנהלים לקוחות רבים. Creates a new organisation (reseller / accountant flows).",
    input: { company: companySchema.describe("פרטי הארגון החדש (Name, EmailAddress חובה בדרך כלל)") },
    build: (a) => ({ Company: a.company })
  }),
  defineEndpoint({
    name: "users_create",
    title: "יצירת משתמש / Create user",
    path: "/website/users/create/",
    module: "website.users",
    scope: "write",
    confidence: "medium",
    annotations: WRITE,
    description: "יוצר משתמש חדש ומעניק לו הרשאה לארגון. Creates a user and grants organisation permissions.",
    input: {
      user: z.looseObject({
        Name: z.string(),
        EmailAddress: z.string(),
        Password: z.string().optional(),
        Phone: z.string().optional(),
        SkipActivation: z.boolean().optional()
      }),
      role: z.enum(["Shared", "Admin", "ReadOnly"]).default("Shared").describe("תפקיד: Shared | Admin | ReadOnly")
    },
    build: (a) => ({ User: a.user, Role: a.role || "Shared" })
  }),
  defineEndpoint({
    name: "users_login_redirect",
    title: "קישור כניסה למשתמש / Login redirect URL",
    path: "/website/users/loginredirect/",
    module: "website.users",
    scope: "write",
    confidence: "medium",
    annotations: WRITE,
    description: "מייצר קישור כניסה ישירה (SSO-like) למערכת סאמיט עבור משתמש קיים. Generates a login redirect URL for an existing user.",
    input: { emailAddress: z.string(), password: z.string().optional(), redirectPath: z.string().optional() },
    build: (a) => compact({ EmailAddress: a.emailAddress, Password: a.password, RedirectPath: a.redirectPath })
  }),
  defineEndpoint({
    name: "permissions_set",
    title: "הענקת הרשאה למשתמש / Set permission",
    path: "/website/permissions/set/",
    module: "website.permissions",
    scope: "write",
    confidence: "medium",
    annotations: WRITE,
    description: "מעניק/מעדכן הרשאת משתמש בארגון (Shared/Admin/ReadOnly). Grants or updates a user's role in the organisation.",
    input: { userId: z.number().int(), role: z.enum(["Shared", "Admin", "ReadOnly"]) },
    build: (a) => ({ UserID: a.userId, Role: a.role })
  }),
  defineEndpoint({
    name: "permissions_remove",
    title: "הסרת הרשאה / Remove permission",
    path: "/website/permissions/remove/",
    module: "website.permissions",
    scope: "write",
    confidence: "medium",
    annotations: DESTRUCTIVE,
    description: "מסיר הרשאת משתמש מהארגון. Removes a user's access to the organisation.",
    input: { userId: z.number().int() },
    build: (a) => ({ UserID: a.userId })
  }),
  defineEndpoint({
    name: "tickets_create",
    title: "פתיחת פנייה לתמיכת סאמיט / Create support ticket",
    path: "/customerservice/tickets/create/",
    module: "customerservice",
    scope: "write",
    confidence: "medium",
    annotations: WRITE,
    description: "פותח פניית שירות (טיקט) לצוות התמיכה של סאמיט בשם הארגון. Opens a support ticket with SUMIT's customer service.",
    input: { subject: z.string(), description: z.string() },
    build: (a) => ({ Subject: a.subject, Description: a.description })
  })
];
