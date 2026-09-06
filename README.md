# SUMIT MCP — מחבר MCP למערכת סאמיט (SUMIT) עם ניהול ריבוי חשבונות

שרת [Model Context Protocol](https://modelcontextprotocol.io) שחושף את כל ה-REST API של
[SUMIT](https://www.sumit.co.il) (הנהלת חשבונות, מסמכים, סליקת אשראי, הוראות קבע, CRM, מלאי, ניהול ארגון)
לכל מנוע AI שתומך ב-MCP — Claude.ai, Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, ChatGPT ועוד.

* **ריבוי חשבונות** — מנהלים כמה ארגונים של סאמיט (CompanyID + APIKey לכל אחד) מקונסולת ניהול אחת; כל כלי מקבל פרמטר `account`, יש חשבון ברירת מחדל, וה-AI יכול לעבור בין חשבונות באמצע שיחה.
* **קונסולת ניהול בעברית** (`/admin`) — הוספת חשבונות, בדיקת חיבור, יצירת טוקנים עם הרשאות (קריאה / כתיבה / סליקה) ולפי חשבונות, ניהול חיבורי OAuth, יומן פעילות, קטלוג כלים, והוראות חיבור מוכנות להעתקה.
* **67 כלים** — 62 כלים ייעודיים לכל endpoint מוכר + `sumit_api_request` לקריאה חופשית לכל endpoint, `sumit_api_catalog`, `sumit_list_accounts`, `sumit_use_account`, `sumit_test_connection`. אפשר להרחיב אוטומטית מקובץ ה-Swagger הרשמי.
* **אבטחה** — מפתחות ה-API מוצפנים במנוחה (AES-256-GCM), טוקנים נשמרים כ-hash, OAuth 2.1 מלא (PKCE + Dynamic Client Registration) עם מסך הסכמה שבו בוחרים חשבונות והרשאות, הפרדת הרשאות לפעולות שמזיזות כסף, יומן ביקורת ללא סודות.
* **תחבורה** — Streamable HTTP (התקן העדכני), SSE (תאימות לאחור) ו-stdio (הפעלה מקומית).

> **חשוב לדעת:** תיעוד ה-API הרשמי של סאמיט זמין רק למשתמשים מחוברים, ולכן מבני הבקשות נבנו מספריות לקוח ציבוריות (ראו [docs/SUMIT_API_COVERAGE.md](docs/SUMIT_API_COVERAGE.md)). לכל כלי מצוינת רמת ביטחון; ולקבלת כיסוי מדויק ומלא מומלץ לייבא את קובץ ה-Swagger הרשמי (הוראות למטה). השרת עצמו נבדק מקצה לקצה מול שרת סאמיט מדומה — לא מול חשבון סאמיט חי.

---

## תוכן עניינים

1. [התקנה מהירה](#התקנה-מהירה)
2. [הגדרת חשבונות סאמיט](#הגדרת-חשבונות-סאמיט)
3. [חיבור ל-Claude ולמנועי AI](#חיבור-ל-claude-ולמנועי-ai)
4. [הרשאות, טוקנים ו-OAuth](#הרשאות-טוקנים-ו-oauth)
5. [הכלים](#הכלים)
6. [הרחבת הקטלוג מה-Swagger הרשמי](#הרחבת-הקטלוג-מה-swagger-הרשמי)
7. [משתני סביבה](#משתני-סביבה)
8. [פריסה לענן](#פריסה-לענן)
9. [פיתוח ובדיקות](#פיתוח-ובדיקות)
10. [English summary](#english-summary)

---

## התקנה מהירה

### Docker (מומלץ)

```bash
git clone <this repo> sumit-mcp && cd sumit-mcp
cp .env.example .env            # ערכו PUBLIC_URL, MASTER_KEY (openssl rand -hex 32), ADMIN_PASSWORD
docker compose up -d --build
```

### Node.js 20+

```bash
npm install
npm run build
PUBLIC_URL=https://sumit-mcp.example.com MASTER_KEY=$(openssl rand -hex 32) npm start
```

פתחו את `PUBLIC_URL/admin`. בכניסה הראשונה תתבקשו לקבוע סיסמת מנהל (אלא אם הגדרתם `ADMIN_PASSWORD`).

---

## הגדרת חשבונות סאמיט

1. בסאמיט: **הגדרות ← מפתחות API / מפתחים** — העתיקו את **מזהה החברה (CompanyID)** ואת **מפתח ה-API (הפרטי)**. למי שרוצה להשתמש בכלי הטוקניזציה של כרטיסים אפשר להוסיף גם את המפתח הציבורי.
2. בקונסולה: **חשבונות סאמיט ← + הוספת חשבון** — תנו שם ברור (למשל "העסק הראשי", "עמותה"), הזינו CompanyID ומפתח, וסמנו חשבון ברירת מחדל.
3. לחצו **בדיקת חיבור** — השרת קורא ל-`/website/companies/getdetails/` ומציג את שם הארגון.

הוסיפו כמה חשבונות שתרצו. ה-AI פונה אליהם לפי השם/מזהה/CompanyID (`account: "עמותה"`), ואפשר להגביל כל טוקן או חיבור OAuth לחשבונות מסוימים.

---

## חיבור ל-Claude ולמנועי AI

בקונסולה יש טאב **"חיבור ל-Claude / AI"** עם כל הקטעים מוכנים להעתקה (כולל הטוקן שיצרתם). בקצרה:

| קליינט | איך |
| --- | --- |
| **Claude.ai / Claude Desktop / Mobile** (Custom Connector) | Settings ← Connectors ← Add custom connector ← `https://<server>/mcp` ← Connect. נפתח מסך אישור (סיסמת מנהל) שבו בוחרים חשבונות והרשאות. דורש `PUBLIC_URL` ב-https. |
| **ללא OAuth** (Claude.ai, ChatGPT, קליינטים שלא שולחים כותרות) | `https://<server>/mcp/t/<TOKEN>` — הטוקן בתוך הכתובת; שמרו עליה בסוד. |
| **Claude Code** | `claude mcp add --transport http sumit https://<server>/mcp --header "Authorization: Bearer <TOKEN>"` |
| **Claude Desktop (קובץ הגדרות)** | `{"mcpServers":{"sumit":{"command":"npx","args":["-y","mcp-remote","https://<server>/mcp","--header","Authorization: Bearer <TOKEN>"]}}}` |
| **Cursor / Windsurf / VS Code / Cline** | `{"mcpServers":{"sumit":{"url":"https://<server>/mcp","headers":{"Authorization":"Bearer <TOKEN>"}}}}` |
| **SSE (קליינטים ישנים)** | `https://<server>/sse` (+ אותו Bearer) או `https://<server>/sse/t/<TOKEN>` |
| **מקומי בלי שרת (stdio)** | `node dist/stdio.js` עם `SUMIT_COMPANY_ID`/`SUMIT_API_KEY` (או `SUMIT_ACCOUNTS` בפורמט JSON לכמה חשבונות) |

דוגמת Claude Desktop במצב stdio:

```json
{
  "mcpServers": {
    "sumit": {
      "command": "node",
      "args": ["/path/to/sumit-mcp/dist/stdio.js"],
      "env": {
        "SUMIT_ACCOUNTS": "[{\"name\":\"העסק הראשי\",\"companyId\":123456,\"apiKey\":\"...\"},{\"name\":\"עמותה\",\"companyId\":654321,\"apiKey\":\"...\"}]"
      }
    }
  }
}
```

---

## הרשאות, טוקנים ו-OAuth

* **הרשאות (scopes):** `read` (קריאה), `write` (יצירת/עדכון מסמכים, לקוחות, CRM, שליחת מיילים, ביטולים), `payments` (חיובי אשראי, זיכויים, הוראות קבע, CreditGuy). כלי שדורש הרשאה שאין לחיבור מחזיר שגיאה ברורה.
* **טוקני API** נוצרים בקונסולה, מוצגים פעם אחת בלבד, נשמרים כ-hash, ניתנים להגבלה לחשבונות ולתאריך תפוגה, וניתנים לביטול.
* **OAuth 2.1** מופעל אוטומטית כש-`PUBLIC_URL` הוא https (או localhost). השרת מפרסם `/.well-known/oauth-authorization-server` ו-`/.well-known/oauth-protected-resource/mcp`, תומך ב-Dynamic Client Registration, PKCE (S256) ו-refresh tokens. במסך ההסכמה בוחרים חשבונות והרשאות; ברירת המחדל היא ללא `payments`.
* **יומן פעילות:** כל קריאת כלי (מבצע, חשבון, נתיב, תוצאה, משך) נרשמת ללא סודות.

---

## הכלים

| מודול | כלים |
| --- | --- |
| לקוחות | `sumit_customers_create`, `sumit_customers_update`, `sumit_customers_get_details_url`, `sumit_customers_create_remark` |
| מסמכים | `sumit_documents_create` (חשבונית מס, חשבונית מס-קבלה, קבלה, חשבון עסקה, הצעת מחיר, הזמנה, דרישת תשלום, זיכויים…), `sumit_documents_list`, `sumit_documents_get_details`, `sumit_documents_get_pdf`, `sumit_documents_send`, `sumit_documents_cancel`, `sumit_documents_move_to_books`, `sumit_documents_add_expense`, `sumit_documents_get_debt`, `sumit_documents_get_debt_report` |
| כללי | `sumit_general_get_vat_rate`, `sumit_general_get_exchange_rate`, `sumit_general_verify_bank_account`, `sumit_general_get_next_document_number`, `sumit_general_set_next_document_number`, `sumit_general_update_settings` |
| פריטים ומלאי | `sumit_income_items_create`, `sumit_income_items_list`, `sumit_stock_list` |
| סליקה | `sumit_payments_charge`, `sumit_payments_refund`, `sumit_payments_get`, `sumit_payments_list`, `sumit_payments_begin_redirect` (דף תשלום / Bit), `sumit_payments_multivendor_charge` |
| אמצעי תשלום | `sumit_payment_methods_get_for_customer`, `sumit_payment_methods_set_for_customer`, `sumit_payment_methods_remove` |
| הוראות קבע | `sumit_recurring_charge`, `sumit_recurring_list_for_customer`, `sumit_recurring_update`, `sumit_recurring_cancel` |
| מסוף (CreditGuy) | `sumit_creditguy_transaction`, `sumit_creditguy_capture`, `sumit_creditguy_tokenize_single_use` |
| CRM | `sumit_crm_list_folders`, `sumit_crm_get_folder`, `sumit_crm_list_views`, `sumit_crm_list_entities`, `sumit_crm_get_entity`, `sumit_crm_create_entity`, `sumit_crm_update_entity`, `sumit_crm_archive_entity`, `sumit_crm_delete_entity`, `sumit_crm_count_entity_usage`, `sumit_crm_get_entity_print_html`, `sumit_crm_get_entities_html` |
| טריגרים | `sumit_triggers_subscribe`, `sumit_triggers_unsubscribe` |
| ארגון ומשתמשים | `sumit_company_get_details`, `sumit_company_list_quotas`, `sumit_company_update`, `sumit_company_create`, `sumit_users_create`, `sumit_users_login_redirect`, `sumit_permissions_set`, `sumit_permissions_remove`, `sumit_tickets_create` |
| מטא | `sumit_list_accounts`, `sumit_use_account`, `sumit_test_connection`, `sumit_api_catalog`, `sumit_api_request` |

לכל כלי יש פרמטר `account` (אופציונלי) ו-`extra` — מפה של שדות נוספים שמתווספים לגוף הבקשה כפי שהם, כך שאפשר להעביר כל שדה מהתיעוד הרשמי גם אם אינו ממודל.
הרשימה המלאה עם נתיבים ורמות ביטחון: [docs/SUMIT_API_COVERAGE.md](docs/SUMIT_API_COVERAGE.md).

---

## הרחבת הקטלוג מה-Swagger הרשמי

1. היכנסו לסאמיט והורידו את קובץ ה-OpenAPI: `https://app.sumit.co.il/swagger/v1/swagger.json` (או דרך Swagger UI ב-`/help/developers/swagger/`).
2. הריצו:

   ```bash
   npm run import-swagger -- ./swagger.json        # יוצר catalog/generated.json
   ```

3. הפעילו מחדש את השרת. כל פעולה בקובץ הופכת לכלי `sumit_api_<module>_<controller>_<action>` עם תיאור השדות מהתיעוד (כלים ייעודיים קיימים לא מוחלפים).

---

## משתני סביבה

| משתנה | ברירת מחדל | תיאור |
| --- | --- | --- |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | כתובת האזנה |
| `PUBLIC_URL` | `http://localhost:8080` | הכתובת הציבורית (נדרש https עבור OAuth / Claude.ai) |
| `TRUST_PROXY` | `false` | `true` מאחורי reverse proxy |
| `MASTER_KEY` | נוצר אוטומטית ב-`DATA_DIR/master.key` | מפתח הצפנה למפתחות ה-API. **גבו אותו** — בלעדיו לא ניתן לפענח את החשבונות |
| `ADMIN_PASSWORD` | — | סיסמת מנהל קבועה (אחרת נקבעת בכניסה הראשונה) |
| `ALLOW_URL_TOKENS` | `true` | לאפשר `/mcp/t/<token>` |
| `OAUTH_ENABLED` | `true` | להפעיל את שרת ה-OAuth המובנה |
| `DATA_DIR` | `./data` | תיקיית הנתונים (`store.json` מוצפן חלקית + `master.key`) |
| `SUMIT_BASE_URL` | `https://api.sumit.co.il` | ניתן לדרוס גם לכל חשבון בנפרד |
| `SUMIT_TIMEOUT_MS` | `60000` | timeout לקריאות (חיובים משתמשים ב-180 שניות) |
| `MCP_SESSION_IDLE_MINUTES` | `120` | ניקוי סשנים לא פעילים |
| `SUMIT_GENERATED_CATALOG` | `catalog/generated.json` | מיקום קובץ הקטלוג המיובא |
| `SUMIT_COMPANY_ID`, `SUMIT_API_KEY`, `SUMIT_ACCOUNT_NAME`, `SUMIT_ACCOUNTS` | — | חשבונות למצב stdio |

---

## פריסה לענן

* **DigitalOcean + CapRover (מומלץ):** מדריך מלא בעברית — [docs/DEPLOY_CAPROVER_DIGITALOCEAN.md](docs/DEPLOY_CAPROVER_DIGITALOCEAN.md). הריפו כולל `captain-definition`, תבנית One-Click (`deploy/caprover/one-click-app.yml`), סקריפט פריסה (`deploy/caprover/deploy.sh`) ו-GitHub Actions שמפרסם image ל-GHCR.
* **Railway / Render / Fly.io / Koyeb:** פרסו את ה-Dockerfile, הגדירו `PUBLIC_URL=https://<your-domain>`, `TRUST_PROXY=true`, `MASTER_KEY`, `ADMIN_PASSWORD`, וחברו נפח (volume) ל-`/data`.
* **VPS עם Caddy:** `caddy reverse-proxy --from sumit.example.com --to localhost:8080` נותן https אוטומטי.
* בדיקת בריאות: `GET /healthz`.

---

## פיתוח ובדיקות

```bash
npm run dev          # tsx watch
npm run typecheck
npm test             # vitest: יחידה + מקצה-לקצה (שרת סאמיט מדומה, MCP client אמיתי, OAuth מלא)
```

מבנה הקוד: `src/core` (הצפנה, אחסון, לקוח סאמיט, חשבונות) · `src/mcp` (קטלוג הכלים, הקשר ריבוי-חשבונות, סשנים) · `src/auth` (טוקנים, OAuth, מסך הסכמה) · `src/admin` (API + ממשק הניהול) · `src/app.ts` (חיבור הכל ב-Express) · `src/server.ts` / `src/stdio.ts` (נקודות כניסה).

---

## English summary

**SUMIT MCP** is a Model Context Protocol server for the Israeli SUMIT business platform (accounting documents, credit-card clearing, recurring billing, CRM, stock, organisation management) with first-class **multi-account** support.

* Admin console (`/admin`, Hebrew/RTL): add SUMIT accounts (CompanyID + API key, encrypted at rest), test them, mint scoped API tokens (`read` / `write` / `payments`, per-account), manage OAuth grants, view an audit log and copy ready-made connection snippets.
* 67 tools: 62 curated endpoint tools (documents, customers, payments, refunds, recurring, payment methods, CreditGuy terminal, CRM schema/data/views, triggers, company/users/permissions, stock, VAT/exchange rates, bank account validation) plus `sumit_api_request` (any endpoint), `sumit_api_catalog`, `sumit_list_accounts`, `sumit_use_account`, `sumit_test_connection`. Every tool accepts `account` and `extra`.
* Transports: Streamable HTTP (`/mcp`, bearer token or `/mcp/t/<token>`), legacy SSE (`/sse`), stdio (`dist/stdio.js`).
* Built-in OAuth 2.1 authorization server (DCR + PKCE + refresh tokens) with a consent page for Claude.ai custom connectors, where the admin picks which accounts and scopes each connection may use.
* Extend the catalog from the official Swagger: `npm run import-swagger -- swagger.json`.
* Request shapes were reconstructed from public client libraries because SUMIT's docs require a login; see `docs/SUMIT_API_COVERAGE.md` for per-tool confidence levels. The server was verified end-to-end against a fake SUMIT API, not a live account.
