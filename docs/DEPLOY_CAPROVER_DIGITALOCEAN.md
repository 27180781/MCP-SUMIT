# פריסה על DigitalOcean עם CapRover

מדריך מלא להרמת שרת SUMIT MCP על Droplet של DigitalOcean באמצעות [CapRover](https://caprover.com) —
כולל HTTPS אוטומטי, נתונים מתמידים, ושלוש דרכים לפרוס (GitHub, CLI, One-Click).

> זמן משוער: 20–30 דקות. עלות: Droplet של 2GB RAM (~12$/חודש) מספיק בהחלט.

---

## 1. דרישות מוקדמות

| מה | פרטים |
| --- | --- |
| חשבון DigitalOcean | [cloud.digitalocean.com](https://cloud.digitalocean.com) |
| דומיין | נדרש **רשומת A עם wildcard** (למשל `*.apps.example.com`) שמצביעה ל-IP של ה-Droplet. Claude.ai דורש https, ולכן חובה דומיין אמיתי (לא IP). |
| מחשב מקומי | Node.js 20+ (ל-CLI של CapRover) ו-git — נדרש רק לשיטת ה-CLI |
| הקוד | הריפו הזה ב-GitHub (`27180781/MCP-SUMIT`) |

---

## 2. יצירת ה-Droplet עם CapRover

**הדרך הקלה — תמונת ה-Marketplace:**

1. ב-DigitalOcean: **Create → Droplets → Marketplace** → חפשו **CapRover** ובחרו אותו.
2. תוכנית: **Basic, Regular, לפחות 2GB RAM** (1GB עובד אבל הבנייה של Docker איטית; אפשר להוסיף swap).
3. אזור: Frankfurt (FRA1) או Amsterdam (AMS3) — הקרובים ביותר לישראל.
4. אימות: מפתח SSH (מומלץ).
5. שם ל-Droplet, למשל `caprover-sumit`, ו-**Create Droplet**.
6. העתיקו את כתובת ה-IP הציבורית.

**חלופה — התקנה ידנית על Ubuntu 22.04/24.04:**

```bash
ssh root@<IP>
curl -fsSL https://get.docker.com | sh
docker run -p 80:80 -p 443:443 -p 3000:3000 -e ACCEPTED_TERMS=true \
  -v /var/run/docker.sock:/var/run/docker.sock -v /captain:/captain caprover/caprover
```

**חומת אש (אם הפעלתם DigitalOcean Cloud Firewall או ufw):** פתחו TCP `22, 80, 443, 3000, 996, 7946, 2377` ו-UDP `7946, 4789`. לשרת יחיד מספיקים בפועל 22/80/443/3000; פורט 3000 נדרש רק להתקנה הראשונית.

---

## 3. DNS

אצל ספק הדומיין צרו רשומת **A**:

| Host | Type | Value |
| --- | --- | --- |
| `*.apps` (או `*` על תת-דומיין ייעודי) | A | `<IP של ה-Droplet>` |

ה-root domain של CapRover יהיה אז `apps.example.com`, לוח הבקרה ב-`captain.apps.example.com`, והאפליקציה ב-`sumit-mcp.apps.example.com`. המתינו כמה דקות לפני שממשיכים (בדקו עם `ping captain.apps.example.com`).

---

## 4. הגדרה ראשונית של CapRover

מהמחשב המקומי:

```bash
npm install -g caprover
caprover serversetup
```

עונים על השאלות: IP של ה-Droplet, סיסמת ברירת המחדל `captain42`, root domain (`apps.example.com`), סיסמה חדשה, אימייל ל-Let's Encrypt, ושם למכונה (למשל `sumit`). בסיום לוח הבקרה זמין ב-`https://captain.apps.example.com`.

(אפשר גם דרך הדפדפן: `http://<IP>:3000`, סיסמה `captain42`, ואז Root Domain → Update → Enable HTTPS → Force HTTPS.)

---

## 5. יצירת האפליקציה

בלוח הבקרה של CapRover → **Apps**:

1. **Create A New App**: שם `sumit-mcp`, סמנו **Has Persistent Data** ✓, ולחצו Create.
2. פתחו את האפליקציה → טאב **App Configs**:
   * **Persistent Directories → Add Persistent Directory**: Path in App `/data`, בחרו **Label** והזינו `sumit-mcp-data` → Save & Update.
     (העדיפו Label על פני נתיב בשרת: הקונטיינר רץ כמשתמש לא-root, ו-volume מנוהל מקבל הרשאות נכונות אוטומטית. אם בכל זאת בחרתם נתיב כמו `/captain/data/sumit-mcp`, הריצו בשרת `chown -R 1000:1000 /captain/data/sumit-mcp`.)
   * **Environment Variables → Bulk Edit** — הדביקו (ראו `deploy/caprover/env.example`):

     ```env
     NODE_ENV=production
     PORT=8080
     HOST=0.0.0.0
     DATA_DIR=/data
     PUBLIC_URL=https://sumit-mcp.apps.example.com
     TRUST_PROXY=true
     MASTER_KEY=<הפלט של: openssl rand -hex 32>
     ADMIN_PASSWORD=<סיסמה חזקה>
     ALLOW_URL_TOKENS=true
     OAUTH_ENABLED=true
     ```

     שמרו את `MASTER_KEY` במקום בטוח — הוא מצפין את מפתחות ה-API של סאמיט. Instance Count נשאר 1 (חובה עם נתונים מתמידים).
3. טאב **HTTP Settings**:
   * **Container HTTP Port**: `8080` → Save & Update.
   * **Enable HTTPS** (Let's Encrypt) ואז סמנו **Force HTTPS by redirecting all HTTP traffic to HTTPS**.
   * **Websocket Support** ✓ (לא חובה ל-SSE, אבל לא מזיק ומפעיל `proxy_http_version 1.1`).
   * אופציונלי: **Connect New Domain** לדומיין יפה כמו `mcp.example.com` (רשומת A רגילה ל-IP), ואז Enable HTTPS גם לו ועדכנו `PUBLIC_URL` בהתאם.

---

## 6. פריסה — בחרו שיטה

### שיטה A: ישירות מ-GitHub (מומלץ — כל push מתפרס אוטומטית)

1. באפליקציה → טאב **Deployment** → **Method 3: Deploy from Github/Bitbucket/Gitlab**.
2. Repository: `github.com/27180781/MCP-SUMIT`, Branch: `main` (או הענף שבו הקוד), Username + **Personal Access Token** של GitHub (או SSH key) אם הריפו פרטי → **Save & Update**.
3. העתיקו את **Webhook URL** שמופיע, ובריפו ב-GitHub: **Settings → Webhooks → Add webhook** → הדביקו ב-Payload URL, Content type `application/json`, אירוע push.
4. לחצו **Force Build** לבנייה הראשונה. CapRover קורא את `captain-definition` בשורש הריפו, בונה לפי ה-`Dockerfile` ומריץ.

### שיטה B: מהמחשב המקומי עם ה-CLI

```bash
# פעם אחת (אם לא עשיתם serversetup מהמחשב הזה):
caprover login          # URL: https://captain.apps.example.com, סיסמה, שם מכונה: sumit

# בכל פריסה (מתוך תיקיית הריפו, אחרי commit):
CAPROVER_NAME=sumit CAPROVER_APP=sumit-mcp ./deploy/caprover/deploy.sh
# או ישירות:
caprover deploy -n sumit -a sumit-mcp -b main
```

ה-CLI מעלה את הענף ה-committed, ו-CapRover בונה את ה-Docker image בשרת.

### שיטה C: One-Click App מ-image מוכן (GHCR)

1. ודאו ש-`.github/workflows/docker-publish.yml` רץ ופרסם את `ghcr.io/27180781/mcp-sumit:latest` (Actions בריפו), ושה-package מוגדר **Public** ב-GitHub (Packages → Package settings → Change visibility).
2. ב-CapRover: **Apps → One-Click Apps/Databases** → גללו לתחתית → **>> TEMPLATE <<** → הדביקו את התוכן של `deploy/caprover/one-click-app.yml` → Next → מלאו שם אפליקציה, מפתח ראשי וסיסמת מנהל → Deploy.
3. אחרי הפריסה: HTTP Settings → **Enable HTTPS** → **Force HTTPS** (התבנית כבר מגדירה פורט 8080, volume ומשתני סביבה).

### שיטה D (אופציונלי): GitHub Actions שמפעיל את ה-CLI

הקובץ `.github/workflows/caprover-deploy.yml` פורס אוטומטית בכל push ל-`main` כאשר מגדירים בריפו:
* Variable: `CAPROVER_AUTO_DEPLOY=true`
* Secrets: `CAPROVER_URL` (`https://captain.apps.example.com`), `CAPROVER_APP` (`sumit-mcp`), `CAPROVER_APP_TOKEN` (באפליקציה → Deployment → **Enable App Token**).

---

## 7. בדיקות אחרי הפריסה

```bash
curl https://sumit-mcp.apps.example.com/healthz
# {"ok":true,"name":"sumit-mcp","version":"0.1.0","sessions":0}

curl -i https://sumit-mcp.apps.example.com/mcp -X POST \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
# מצופה: 401 עם כותרת WWW-Authenticate שמפנה ל-/.well-known/oauth-protected-resource/mcp

curl https://sumit-mcp.apps.example.com/.well-known/oauth-authorization-server
# מצופה: JSON עם issuer = https://sumit-mcp.apps.example.com/
```

ואז בדפדפן: `https://sumit-mcp.apps.example.com/admin` → כניסה עם `ADMIN_PASSWORD` → הוספת חשבונות סאמיט → **בדיקת חיבור** → יצירת טוקן / חיבור Claude.ai לכתובת `https://sumit-mcp.apps.example.com/mcp`.

לוגים: באפליקציה → **Deployment → App Logs**, או בשרת `docker service logs srv-captain--sumit-mcp -f`.

---

## 8. עדכונים, גיבויים ושחזור

* **עדכון גרסה:** push ל-GitHub (שיטה A/D), או `caprover deploy` (B), או שינוי התג ב-One-Click (C) → Save & Update. הנתונים ב-`/data` נשמרים בין פריסות.
* **גיבוי:** הנתונים (חשבונות מוצפנים, טוקנים, יומן) יושבים ב-volume של Docker. בשרת:

  ```bash
  docker volume ls | grep sumit-mcp          # שם ה-volume (מכיל את שם האפליקציה/התווית, לעיתים עם קידומת captain--)
  VOL=<השם מהפלט>
  docker run --rm -v "$VOL":/data -v /root:/backup alpine tar czf /backup/sumit-mcp-$(date +%F).tgz -C / data
  ```

  גבו גם את `MASTER_KEY` (משתנה הסביבה). בלעדיו קובץ ה-store לא ניתן לפענוח.
* **שחזור:** צרו את האפליקציה עם אותו `MASTER_KEY`, פרסו, ואז פרקו את ה-tar לתוך ה-volume (`docker run --rm -v "$VOL":/data -v /root:/backup alpine tar xzf /backup/<file>.tgz -C /`) והפעילו מחדש (Save & Update).
* **החלפת סיסמת מנהל:** שנו את `ADMIN_PASSWORD` במשתני הסביבה → Save & Update.

---

## 9. פתרון תקלות

| תסמין | סיבה / פתרון |
| --- | --- |
| 502 Bad Gateway מיד אחרי פריסה | הקונטיינר עדיין עולה, או שה-Container HTTP Port אינו 8080. בדקו App Logs. |
| `EACCES` על `/data` בלוגים | Persistent Directory עם נתיב בשרת ללא הרשאות — הריצו `chown -R 1000:1000 <path>` או עברו ל-Label. |
| OAuth לא מופיע / Claude.ai לא מצליח להתחבר | `PUBLIC_URL` חייב להיות בדיוק הכתובת ה-https הציבורית (בלי `/` בסוף), HTTPS מופעל ו-Force HTTPS פעיל. בדקו `/.well-known/oauth-authorization-server`. |
| "Token has no expiration"/401 מוזר | ודאו שה-`Authorization: Bearer` מגיע לשרת (Websocket Support/Headers). עם `TRUST_PROXY=true` ה-IP האמיתי מגיע מ-nginx. |
| הבנייה נכשלת על Droplet של 1GB | הוסיפו swap (`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`) או פרסו image מוכן (שיטה C). |
| הפעולות בסאמיט מחזירות "Invalid credentials" | בדקו CompanyID ומפתח בקונסולה (בדיקת חיבור). המפתח הפרטי — לא הציבורי. |
| שיחה ארוכה מתנתקת אחרי דקה | ודאו שהפריסה כוללת את הגרסה הזו (keep-alive + `X-Accel-Buffering: no`); ב-nginx מותאם אישית אל תפעילו `proxy_buffering on`. |

---

## 10. אבטחה — המלצות

* השאירו `ALLOW_URL_TOKENS=true` רק אם אתם צריכים חיבור ללא OAuth; כתובות עם טוקן מוטמע מופיעות בלוגים של nginx.
* צרו טוקן נפרד לכל קליינט/אדם, עם ההרשאה המינימלית (רוב השימושים לא צריכים `payments`).
* הגבילו גישה ל-`/admin` (למשל דרך Cloudflare Access או IP allow-list ב-nginx המותאם של CapRover) אם השרת ציבורי.
* עדכנו את CapRover ואת ה-Droplet (`apt upgrade`) מדי פעם, והפעילו גיבוי אוטומטי של DigitalOcean ל-Droplet (Backups, +20%).
