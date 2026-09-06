import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools.js";
import type { ToolContext } from "./context.js";

export const SERVER_NAME = "sumit-mcp";
export const SERVER_VERSION = "0.1.0";

export const SERVER_INSTRUCTIONS = `שרת MCP למערכת SUMIT (סאמיט) — הנהלת חשבונות, מסמכים, סליקת אשראי, הוראות קבע, CRM, מלאי וניהול ארגון.
כללים:
1. ייתכנו כמה חשבונות סאמיט (ארגונים). אם המשתמש לא ציין חשבון, קרא ל-sumit_list_accounts; כשיש חשבון ברירת מחדל אפשר להשמיט את הפרמטר account. אפשר לקבוע ברירת מחדל לשיחה עם sumit_use_account.
2. פעולות שמזיזות כסף (sumit_payments_charge, sumit_payments_refund, sumit_recurring_charge, creditguy_*) או מוחקות/מבטלות — אשר עם המשתמש את הסכום, הלקוח והחשבון לפני הקריאה.
3. כל תשובה של סאמיט מגיעה במעטפת {Status, UserErrorMessage, TechnicalErrorDetails, Data}. בכישלון תקבל את הודעת השגיאה — תקן את השדות ונסה שוב; שדות שאינם במודל אפשר להעביר דרך extra.
4. לפעולה שאין לה כלי ייעודי השתמש ב-sumit_api_catalog לחיפוש וב-sumit_api_request לקריאה ישירה לפי התיעוד הרשמי: https://app.sumit.co.il/developers/api/
5. סוגי מסמכים (Type): 0 חשבונית מס, 1 חשבונית מס-קבלה, 2 קבלה, 3 חשבון עסקה, 4 קבלת תרומה, 5 חשבונית זיכוי, 8 הזמנה, 12 הצעת מחיר, 13 דרישת תשלום (ועוד — ראו תיאור הכלי). מטבעות: ILS/USD/EUR. שפות: 0 עברית, 1 אנגלית.`;

export function createMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: SERVER_INSTRUCTIONS });
  registerAllTools(server, ctx);
  return server;
}
