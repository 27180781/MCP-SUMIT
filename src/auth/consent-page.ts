import type { AccountPublic } from "../core/accounts.js";

export interface ConsentPageModel {
  clientName: string;
  clientUri?: string;
  accounts: AccountPublic[];
  requestBlob: string;
  adminLoggedIn: boolean;
  error?: string;
  requestedScopes?: string[];
  actionUrl: string;
}

function esc(s: string | undefined): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function renderConsentPage(m: ConsentPageModel): string {
  const wantsPayments = m.requestedScopes?.includes("payments");
  const wantsWrite = !m.requestedScopes || m.requestedScopes.length === 0 || m.requestedScopes.includes("write") || wantsPayments;
  const accountRows = m.accounts
    .map(
      (a) => `<label class="row"><input type="checkbox" name="account" value="${esc(a.id)}" checked> <span><b>${esc(a.name)}</b> <small>CompanyID ${a.companyId}${a.isDefault ? " · ברירת מחדל" : ""}</small></span></label>`
    )
    .join("");
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>אישור גישה — SUMIT MCP</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;background:#f4f6fb;margin:0;color:#1b2430}
.card{max-width:520px;margin:6vh auto;background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(20,40,80,.12);padding:32px}
h1{font-size:22px;margin:0 0 6px}p{margin:6px 0 14px;color:#4b5563;line-height:1.5}
.row{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:8px;cursor:pointer}
.row small{display:block;color:#6b7280}
fieldset{border:0;padding:0;margin:0 0 18px}legend{font-weight:700;margin-bottom:8px}
input[type=password]{width:100%;box-sizing:border-box;padding:12px;border:1px solid #d1d5db;border-radius:10px;font-size:16px}
.btn{width:100%;padding:13px;border:0;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer}
.primary{background:#2563eb;color:#fff}.secondary{background:#eef2ff;color:#1e3a8a;margin-top:8px}
.err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca;padding:10px 12px;border-radius:10px;margin-bottom:14px}
.warn{color:#92400e;background:#fffbeb;border:1px solid #fde68a;padding:8px 12px;border-radius:10px;font-size:14px}
.badge{display:inline-block;background:#ecfdf5;color:#065f46;border-radius:999px;padding:2px 10px;font-size:13px}
</style></head><body>
<form class="card" method="post" action="${esc(m.actionUrl)}">
  <h1>אישור גישה למחבר SUMIT</h1>
  <p><b>${esc(m.clientName)}</b>${m.clientUri ? ` <small>(${esc(m.clientUri)})</small>` : ""} מבקש להתחבר לשרת ה-MCP של סאמיט. בחרו לאילו חשבונות ואילו הרשאות לאשר.</p>
  ${m.error ? `<div class="err">${esc(m.error)}</div>` : ""}
  <input type="hidden" name="req" value="${esc(m.requestBlob)}">
  <fieldset><legend>חשבונות סאמיט</legend>
    ${accountRows || '<div class="warn">אין חשבונות מוגדרים. הוסיפו חשבון בקונסולת הניהול ואז נסו שוב.</div>'}
  </fieldset>
  <fieldset><legend>הרשאות</legend>
    <label class="row"><input type="checkbox" name="scope" value="read" checked disabled><input type="hidden" name="scope" value="read"> <span><b>קריאה</b><small>מסמכים, לקוחות, תשלומים, CRM, דוחות</small></span></label>
    <label class="row"><input type="checkbox" name="scope" value="write" ${wantsWrite ? "checked" : ""}> <span><b>כתיבה</b><small>יצירת מסמכים, לקוחות, רשומות CRM, שליחת מיילים, ביטולים</small></span></label>
    <label class="row"><input type="checkbox" name="scope" value="payments" ${wantsPayments ? "checked" : ""}> <span><b>סליקה וחיובים</b><small>חיוב כרטיסי אשראי, זיכויים, הוראות קבע (מזיז כסף!)</small></span></label>
  </fieldset>
  <fieldset><legend>אימות מנהל</legend>
    ${m.adminLoggedIn ? '<span class="badge">מחובר/ת לקונסולת הניהול ✓</span>' : '<input type="password" name="password" placeholder="סיסמת מנהל של השרת" autocomplete="current-password" required>'}
  </fieldset>
  <button class="btn primary" type="submit" name="decision" value="approve" ${m.accounts.length ? "" : "disabled"}>אישור והתחברות</button>
  <button class="btn secondary" type="submit" name="decision" value="deny" formnovalidate>ביטול</button>
</form>
</body></html>`;
}
