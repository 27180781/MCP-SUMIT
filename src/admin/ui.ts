/**
 * Admin console — a single self-contained HTML page (Hebrew, RTL).
 * Talks to /admin/api/* with fetch. No build step / external assets.
 */
export function renderAdminPage(model: { version: string }): string {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SUMIT MCP — קונסולת ניהול</title>
<style>
:root{--bg:#f3f5f9;--card:#fff;--ink:#101828;--muted:#667085;--line:#e4e7ec;--brand:#1d4ed8;--brand-soft:#e8efff;--ok:#067647;--ok-soft:#ecfdf3;--bad:#b42318;--bad-soft:#fef3f2;--warn:#b54708;--warn-soft:#fffaeb}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,"Noto Sans Hebrew",sans-serif;background:var(--bg);color:var(--ink);font-size:15px;line-height:1.5}
header{background:#0b1e4b;color:#fff;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
header h1{font-size:18px;margin:0;font-weight:800;letter-spacing:.2px}
header .sub{opacity:.75;font-size:13px}
header code{background:rgba(255,255,255,.12);padding:2px 8px;border-radius:6px;font-size:13px;direction:ltr;display:inline-block}
main{max-width:1180px;margin:0 auto;padding:20px}
nav.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px}
nav.tabs button{background:#fff;border:1px solid var(--line);padding:9px 16px;border-radius:999px;cursor:pointer;font-size:14px;font-weight:600;color:var(--muted)}
nav.tabs button.active{background:var(--brand);border-color:var(--brand);color:#fff}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:18px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.card h2{margin:0 0 6px;font-size:18px}.card p.lead{margin:0 0 14px;color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:10px 8px;border-bottom:1px solid var(--line);text-align:right;vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:13px}
.btn{border:1px solid var(--line);background:#fff;padding:8px 14px;border-radius:9px;cursor:pointer;font-size:14px;font-weight:600;color:var(--ink)}
.btn.primary{background:var(--brand);border-color:var(--brand);color:#fff}
.btn.danger{color:var(--bad);border-color:#fecdca;background:var(--bad-soft)}
.btn.sm{padding:5px 10px;font-size:13px}
.btn:disabled{opacity:.5;cursor:not-allowed}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
label.f{display:block;font-size:13px;color:var(--muted);font-weight:600;margin-bottom:4px}
input[type=text],input[type=password],input[type=number],input[type=url],textarea,select{width:100%;padding:10px 12px;border:1px solid #d0d5dd;border-radius:9px;font-size:15px;background:#fff;font-family:inherit}
input.ltr,textarea.ltr,code,pre{direction:ltr;text-align:left;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
pre{background:#0f172a;color:#e2e8f0;padding:14px;border-radius:10px;overflow:auto;font-size:13px;line-height:1.5;position:relative;margin:8px 0 14px}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700;background:var(--brand-soft);color:var(--brand)}
.badge.ok{background:var(--ok-soft);color:var(--ok)}.badge.bad{background:var(--bad-soft);color:var(--bad)}.badge.warn{background:var(--warn-soft);color:var(--warn)}.badge.muted{background:#f2f4f7;color:var(--muted)}
.msg{padding:10px 14px;border-radius:10px;margin:10px 0;font-size:14px}
.msg.ok{background:var(--ok-soft);color:var(--ok)}.msg.bad{background:var(--bad-soft);color:var(--bad)}.msg.warn{background:var(--warn-soft);color:var(--warn)}
.modal-bg{position:fixed;inset:0;background:rgba(16,24,40,.45);display:none;align-items:center;justify-content:center;padding:16px;z-index:50}
.modal-bg.open{display:flex}
.modal{background:#fff;border-radius:16px;max-width:640px;width:100%;padding:22px;max-height:92vh;overflow:auto}
.login{max-width:420px;margin:8vh auto}
.checks{display:flex;gap:14px;flex-wrap:wrap}.checks label{display:flex;gap:6px;align-items:center;font-size:14px;cursor:pointer}
.token-box{background:var(--warn-soft);border:1px solid #fedf89;border-radius:12px;padding:14px;margin:12px 0}
.token-box code{font-size:15px;word-break:break-all;background:#fff;padding:8px 10px;border-radius:8px;display:block;margin:8px 0}
small.muted{color:var(--muted)}
.tool{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px}
.tool b{font-family:ui-monospace,monospace;direction:ltr;display:inline-block}
.copy{position:absolute;top:8px;right:8px;background:#334155;color:#fff;border:0;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer}
details summary{cursor:pointer;font-weight:700;margin:6px 0}
@media (max-width:700px){td,th{padding:8px 4px}.hide-sm{display:none}}
</style>
</head>
<body>
<header>
  <div><h1>SUMIT MCP · קונסולת ניהול</h1><div class="sub">מחבר MCP למערכת סאמיט עם תמיכה בכמה חשבונות · גרסה ${model.version}</div></div>
  <div class="row"><span class="sub">כתובת השרת:</span> <code id="hdr-url">…</code> <button class="btn sm" id="btn-logout" style="display:none">התנתקות</button></div>
</header>
<main id="app"><div class="card">טוען…</div></main>

<div class="modal-bg" id="modal"><div class="modal" id="modal-body"></div></div>

<script>
(function(){
const $ = (s, el=document) => el.querySelector(s);
const state = { status:null, accounts:[], tokens:[], grants:{grants:[],clients:[]}, audit:[], catalog:null, tab:'accounts', newToken:null };
const api = async (path, opts={}) => {
  const res = await fetch('/admin/api'+path, { credentials:'same-origin', headers: Object.assign({'Content-Type':'application/json','X-Requested-With':'sumit-admin'}, opts.headers||{}), method: opts.method||'GET', body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = {}; try { data = await res.json(); } catch(e){}
  if(!res.ok){ const err = new Error(data.error || ('שגיאה '+res.status)); err.status=res.status; throw err; }
  return data;
};
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = s => s ? new Date(s).toLocaleString('he-IL') : '—';
const scopeLabel = { read:'קריאה', write:'כתיבה', payments:'סליקה', admin:'ניהול' };
const toast = (msg, kind='ok') => { const el=document.createElement('div'); el.className='msg '+kind; el.style.cssText='position:fixed;bottom:18px;left:18px;z-index:99;box-shadow:0 8px 30px rgba(0,0,0,.15)'; el.textContent=msg; document.body.appendChild(el); setTimeout(()=>el.remove(), 4200); };
const copy = async (text, btn) => { try { await navigator.clipboard.writeText(text); if(btn){ const t=btn.textContent; btn.textContent='הועתק ✓'; setTimeout(()=>btn.textContent=t,1500);} } catch(e){ toast('לא ניתן להעתיק אוטומטית','warn'); } };
window.__copy = (id, btn) => copy($('#'+id).textContent, btn);

async function boot(){
  state.status = await api('/status');
  $('#hdr-url').textContent = state.status.mcpUrl;
  if(!state.status.configured) return renderSetup();
  if(!state.status.authenticated) return renderLogin();
  $('#btn-logout').style.display='inline-block';
  $('#btn-logout').onclick = async () => { await api('/logout',{method:'POST'}); location.reload(); };
  await loadAll();
  renderApp();
}

function renderSetup(){
  $('#app').innerHTML = '<div class="card login"><h2>ברוכים הבאים 👋</h2>'+insecureBanner()+'<p class="lead">זו ההפעלה הראשונה. קבעו סיסמת מנהל לקונסולה (לפחות 8 תווים). הסיסמה משמשת גם לאישור חיבורי OAuth מ-Claude.</p>'+
    '<label class="f">סיסמת מנהל</label><input type="password" id="pw1" autocomplete="new-password"><br><br><label class="f">אימות סיסמה</label><input type="password" id="pw2" autocomplete="new-password"><br><br>'+
    '<button class="btn primary" id="do-setup">יצירת סיסמה והתחברות</button><div id="setup-msg"></div></div>';
  $('#do-setup').onclick = async () => {
    const a=$('#pw1').value, b=$('#pw2').value;
    if(a!==b) return $('#setup-msg').innerHTML='<div class="msg bad">הסיסמאות אינן זהות</div>';
    try { await api('/setup',{method:'POST',body:{password:a}}); location.reload(); } catch(e){ $('#setup-msg').innerHTML='<div class="msg bad">'+esc(e.message)+'</div>'; }
  };
}

function insecureBanner(){
  return (state.status.secureCookie && !state.status.requestSecure) ? '<div class="msg warn">השרת מוגדר ל-https ('+esc(state.status.publicUrl)+') אבל הגישה כרגע אינה מאובטחת, ולכן ההתחברות לא תישמר. פתחו את הקונסולה בכתובת ה-https, או בדקו את TRUST_PROXY.</div>' : '';
}
function renderLogin(){
  $('#app').innerHTML = '<div class="card login"><h2>כניסה לקונסולת הניהול</h2>'+insecureBanner()+'<p class="lead">הזינו את סיסמת המנהל של השרת.</p><label class="f">סיסמה</label><input type="password" id="pw" autocomplete="current-password"><br><br><button class="btn primary" id="do-login">כניסה</button><div id="login-msg"></div></div>';
  const go = async () => { try { await api('/login',{method:'POST',body:{password:$('#pw').value}}); location.reload(); } catch(e){ $('#login-msg').innerHTML='<div class="msg bad">'+esc(e.message)+'</div>'; } };
  $('#do-login').onclick = go; $('#pw').addEventListener('keydown', e => { if(e.key==='Enter') go(); });
}

async function loadAll(){
  const [a,t,g,au] = await Promise.all([api('/accounts'), api('/tokens'), api('/oauth/grants'), api('/audit?limit=200')]);
  state.accounts=a.accounts; state.tokens=t.tokens; state.grants=g; state.audit=au.entries;
}

function renderApp(){
  const tabs = [['accounts','חשבונות סאמיט'],['access','גישה וטוקנים'],['connect','חיבור ל-Claude / AI'],['audit','יומן פעילות'],['tools','כלים (Tools)']];
  const keyWarn = (state.status.undecryptableAccounts && state.status.undecryptableAccounts.length) ? '<div class="msg bad">⚠️ MASTER_KEY אינו תואם לנתונים השמורים: לא ניתן לפענח את מפתחות ה-API של '+esc(state.status.undecryptableAccounts.join(', '))+'. שחזרו את ה-MASTER_KEY המקורי, או ערכו את החשבונות והזינו את המפתחות מחדש.</div>' : '';
  $('#app').innerHTML = keyWarn + '<nav class="tabs">'+tabs.map(([k,l])=>'<button data-tab="'+k+'" class="'+(state.tab===k?'active':'')+'">'+l+'</button>').join('')+'</nav><div id="tab"></div>';
  document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => { state.tab=b.dataset.tab; renderApp(); });
  ({accounts:renderAccounts, access:renderAccess, connect:renderConnect, audit:renderAudit, tools:renderTools})[state.tab]();
}

/* ---------------- accounts ---------------- */
function renderAccounts(){
  const rows = state.accounts.map(a => '<tr><td><b>'+esc(a.name)+'</b>'+(a.isDefault?' <span class="badge">ברירת מחדל</span>':'')+'<br><small class="muted">'+esc(a.notes||'')+'</small></td>'+
    '<td class="ltr" style="direction:ltr;text-align:left">'+a.companyId+'</td><td class="hide-sm"><code>'+esc(a.apiKeyMasked)+'</code>'+(a.hasPublicKey?'<br><small class="muted">+ מפתח ציבורי</small>':'')+'</td>'+
    '<td>'+(a.lastTestAt? '<span class="badge '+(a.lastTestOk?'ok':'bad')+'">'+(a.lastTestOk?'תקין':'נכשל')+'</span><br><small class="muted">'+esc(a.lastTestMessage||'')+'<br>'+fmtDate(a.lastTestAt)+'</small>' : '<span class="badge muted">לא נבדק</span>')+'</td>'+
    '<td><div class="row"><button class="btn sm" data-act="test" data-id="'+a.id+'">בדיקת חיבור</button><button class="btn sm" data-act="edit" data-id="'+a.id+'">עריכה</button>'+(a.isDefault?'':'<button class="btn sm" data-act="default" data-id="'+a.id+'">קבע כברירת מחדל</button>')+'<button class="btn sm danger" data-act="del" data-id="'+a.id+'">מחיקה</button></div></td></tr>').join('');
  $('#tab').innerHTML = '<div class="card"><div class="row" style="justify-content:space-between"><div><h2>חשבונות סאמיט</h2><p class="lead">כל חשבון = ארגון בסאמיט עם מזהה חברה (CompanyID) ומפתח API. את המפתחות מפיקים בסאמיט: הגדרות ← מפתחות API / מפתחים. המפתחות נשמרים מוצפנים.</p></div><button class="btn primary" id="add-acc">+ הוספת חשבון</button></div>'+
    (state.accounts.length ? '<table><thead><tr><th>שם</th><th>CompanyID</th><th class="hide-sm">מפתח API</th><th>סטטוס</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>' : '<div class="msg warn">עדיין אין חשבונות. הוסיפו את החשבון הראשון כדי להתחיל.</div>')+'</div>';
  $('#add-acc').onclick = () => accountForm();
  document.querySelectorAll('[data-act]').forEach(b => b.onclick = () => accountAction(b.dataset.act, b.dataset.id, b));
}
function accountForm(acc){
  const a = acc || {};
  openModal('<h2>'+(acc?'עריכת חשבון':'הוספת חשבון סאמיט')+'</h2><div class="grid">'+
    '<div><label class="f">שם החשבון (לזיהוי ע"י ה-AI)</label><input type="text" id="f-name" value="'+esc(a.name||'')+'" placeholder="למשל: העסק הראשי"></div>'+
    '<div><label class="f">CompanyID (מזהה חברה)</label><input type="number" class="ltr" id="f-company" value="'+esc(a.companyId||'')+'"></div>'+
    '<div style="grid-column:1/-1"><label class="f">מפתח API (APIKey — פרטי)'+(acc?' — השאירו ריק כדי לא לשנות':'')+'</label><input type="password" class="ltr" id="f-key" autocomplete="off"></div>'+
    '<div style="grid-column:1/-1"><label class="f">מפתח ציבורי (APIPublicKey — אופציונלי, לטוקניזציה של כרטיסים)</label><input type="password" class="ltr" id="f-pub" autocomplete="off" placeholder="'+(a.hasPublicKey?'מוגדר (השאירו ריק כדי לא לשנות)':'')+'"></div>'+
    '<div><label class="f">כתובת API (ברירת מחדל api.sumit.co.il)</label><input type="url" class="ltr" id="f-base" value="'+esc(a.baseUrl||'')+'" placeholder="https://api.sumit.co.il"></div>'+
    '<div><label class="f">הערות</label><input type="text" id="f-notes" value="'+esc(a.notes||'')+'"></div>'+
    '<div style="grid-column:1/-1"><label><input type="checkbox" id="f-default" '+(a.isDefault?'checked':'')+'> חשבון ברירת מחדל (ישמש כשלא מציינים חשבון)</label></div></div>'+
    '<div id="f-msg"></div><div class="row" style="margin-top:14px"><button class="btn primary" id="f-save">שמירה</button><button class="btn" id="f-cancel">ביטול</button></div>');
  $('#f-cancel').onclick = closeModal;
  $('#f-save').onclick = async () => {
    const body = { name:$('#f-name').value, companyId:Number($('#f-company').value), apiKey:$('#f-key').value, baseUrl:$('#f-base').value, notes:$('#f-notes').value, isDefault:$('#f-default').checked };
    const pub = $('#f-pub').value; if(pub || !acc) body.apiPublicKey = pub; 
    if(acc && !pub) delete body.apiPublicKey;
    if(acc && !body.apiKey) delete body.apiKey;
    try { await api(acc?'/accounts/'+acc.id:'/accounts', {method: acc?'PUT':'POST', body}); closeModal(); await loadAll(); renderApp(); toast('החשבון נשמר'); } catch(e){ $('#f-msg').innerHTML='<div class="msg bad">'+esc(e.message)+'</div>'; }
  };
}
async function accountAction(act, id, btn){
  const acc = state.accounts.find(x=>x.id===id);
  try {
    if(act==='edit') return accountForm(acc);
    if(act==='test'){ btn.disabled=true; btn.textContent='בודק…'; const r = await api('/accounts/'+id+'/test',{method:'POST'}); toast(r.message, r.ok?'ok':'bad'); }
    if(act==='default'){ await api('/accounts/'+id+'/default',{method:'POST'}); toast('עודכן'); }
    if(act==='del'){ if(!confirm('למחוק את החשבון "'+acc.name+'"? טוקנים שמוגבלים אליו יאבדו גישה.')) return; await api('/accounts/'+id,{method:'DELETE'}); toast('נמחק'); }
    await loadAll(); renderApp();
  } catch(e){ toast(e.message,'bad'); await loadAll(); renderApp(); }
}

/* ---------------- access ---------------- */
function renderAccess(){
  const accOpts = state.accounts.map(a=>'<label><input type="checkbox" name="tok-acc" value="'+a.id+'" checked> '+esc(a.name)+'</label>').join('');
  const tokRows = state.tokens.map(t => '<tr><td><b>'+esc(t.name)+'</b><br><code>'+esc(t.prefix)+'…</code></td><td>'+t.scopes.map(s=>'<span class="badge '+(s==='payments'?'warn':'')+'">'+scopeLabel[s]+'</span> ').join('')+'</td>'+
    '<td>'+(t.accountIds==='all'?'כל החשבונות':t.accountIds.map(id=>esc((state.accounts.find(a=>a.id===id)||{name:'(נמחק)'}).name)).join(', '))+'</td>'+
    '<td class="hide-sm"><small class="muted">נוצר '+fmtDate(t.createdAt)+'<br>שימוש אחרון '+fmtDate(t.lastUsedAt)+(t.expiresAt?'<br>תפוגה '+fmtDate(t.expiresAt):'')+'</small></td>'+
    '<td>'+(t.revokedAt?'<span class="badge bad">בוטל</span>':'<button class="btn sm danger" data-revoke="'+t.id+'">ביטול</button>')+'</td></tr>').join('');
  const grantRows = state.grants.grants.map(g => '<tr><td><b>'+esc(g.client)+'</b><br><small class="muted ltr">'+esc(g.clientId)+'</small></td><td>'+g.scopes.map(s=>'<span class="badge '+(s==='payments'?'warn':'')+'">'+scopeLabel[s]+'</span> ').join('')+'</td>'+
    '<td>'+(g.accountIds==='all'?'כל החשבונות':g.accountIds.map(id=>esc((state.accounts.find(a=>a.id===id)||{name:'(נמחק)'}).name)).join(', '))+'</td><td class="hide-sm"><small class="muted">נוצר '+fmtDate(g.createdAt)+'<br>שימוש אחרון '+fmtDate(g.lastUsedAt)+'</small></td>'+
    '<td>'+(g.revokedAt?'<span class="badge bad">בוטל</span>':'<button class="btn sm danger" data-grant="'+g.id+'">ניתוק</button>')+'</td></tr>').join('');
  $('#tab').innerHTML = (state.newToken ? '<div class="card token-box"><b>✅ הטוקן נוצר — העתיקו אותו עכשיו, הוא לא יוצג שוב:</b><code id="new-token">'+esc(state.newToken)+'</code><div class="row"><button class="btn primary sm" onclick="__copy(\\'new-token\\',this)">העתקה</button><button class="btn sm" id="tok-connect">הצג הוראות חיבור עם הטוקן הזה</button><button class="btn sm" id="tok-hide">סגירה</button></div></div>' : '')+
    '<div class="card"><h2>יצירת טוקן גישה (API Token)</h2><p class="lead">טוקן מאפשר לקליינט MCP (Claude Code, Cursor, Claude Desktop, ChatGPT…) להתחבר. אפשר להגביל אותו לחשבונות ולהרשאות מסוימות.</p>'+
    '<div class="grid"><div><label class="f">שם (למשל: המחשב של דני)</label><input type="text" id="tok-name"></div><div><label class="f">תפוגה בימים (ריק = ללא)</label><input type="number" class="ltr" id="tok-exp" min="1"></div></div>'+
    '<div style="margin-top:10px"><label class="f">הרשאות</label><div class="checks"><label><input type="checkbox" name="tok-scope" value="read" checked disabled> קריאה</label><label><input type="checkbox" name="tok-scope" value="write" checked> כתיבה (מסמכים, לקוחות, CRM)</label><label><input type="checkbox" name="tok-scope" value="payments"> סליקה וחיובים (מזיז כסף!)</label></div></div>'+
    '<div style="margin-top:10px"><label class="f">חשבונות</label><div class="checks"><label><input type="checkbox" id="tok-all" checked> כל החשבונות (כולל עתידיים)</label></div><div class="checks" id="tok-acc-list" style="display:none;margin-top:6px">'+accOpts+'</div></div>'+
    '<div class="row" style="margin-top:14px"><button class="btn primary" id="tok-create">יצירת טוקן</button></div></div>'+
    '<div class="card"><h2>טוקנים קיימים</h2>'+(state.tokens.length?'<table><thead><tr><th>שם</th><th>הרשאות</th><th>חשבונות</th><th class="hide-sm">זמנים</th><th></th></tr></thead><tbody>'+tokRows+'</tbody></table>':'<div class="msg warn">אין טוקנים עדיין.</div>')+'</div>'+
    '<div class="card"><h2>חיבורי OAuth (Claude.ai ואחרים)</h2><p class="lead">חיבורים שאושרו דרך מסך ההסכמה. '+(state.status.oauthEnabled?'':'<span class="badge bad">OAuth כבוי — נדרש PUBLIC_URL עם https</span>')+'</p>'+(grantRows?'<table><thead><tr><th>אפליקציה</th><th>הרשאות</th><th>חשבונות</th><th class="hide-sm">זמנים</th><th></th></tr></thead><tbody>'+grantRows+'</tbody></table>':'<div class="msg warn">אין חיבורי OAuth פעילים.</div>')+'</div>';
  $('#tok-all').onchange = e => $('#tok-acc-list').style.display = e.target.checked ? 'none':'flex';
  $('#tok-create').onclick = async () => {
    const scopes = [...document.querySelectorAll('[name=tok-scope]:checked')].map(c=>c.value);
    const all = $('#tok-all').checked; const accountIds = all ? 'all' : [...document.querySelectorAll('[name=tok-acc]:checked')].map(c=>c.value);
    try { const r = await api('/tokens',{method:'POST',body:{name:$('#tok-name').value, scopes, accountIds, expiresInDays:$('#tok-exp').value||undefined}}); state.newToken=r.token; await loadAll(); renderApp(); } catch(e){ toast(e.message,'bad'); }
  };
  if(state.newToken){ $('#tok-hide').onclick = () => { state.newToken=null; renderApp(); }; $('#tok-connect').onclick = () => { state.tab='connect'; renderApp(); }; }
  document.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => { if(!confirm('לבטל את הטוקן?')) return; await api('/tokens/'+b.dataset.revoke,{method:'DELETE'}); await loadAll(); renderApp(); });
  document.querySelectorAll('[data-grant]').forEach(b => b.onclick = async () => { if(!confirm('לנתק את החיבור?')) return; await api('/oauth/grants/'+b.dataset.grant,{method:'DELETE'}); await loadAll(); renderApp(); });
}

/* ---------------- connect ---------------- */
function renderConnect(){
  const url = state.status.mcpUrl, tok = state.newToken || '<TOKEN>';
  const block = (id, text) => '<pre><button class="copy" onclick="__copy(\\''+id+'\\',this)">העתקה</button><span id="'+id+'">'+esc(text)+'</span></pre>';
  const oauthNote = state.status.oauthEnabled ? '<div class="msg ok">OAuth פעיל: ב-Claude.ai פשוט מדביקים את הכתובת, לוחצים "Connect", ונפתח מסך אישור שבו בוחרים חשבונות והרשאות (עם סיסמת המנהל).</div>' : '<div class="msg warn">OAuth כבוי כי PUBLIC_URL אינו https. ל-Claude.ai השתמשו בכתובת עם טוקן מוטמע (למטה) או הגדירו PUBLIC_URL=https://… </div>';
  $('#tab').innerHTML = '<div class="card"><h2>חיבור ל-Claude ולמנועי AI</h2><p class="lead">השרת תומך ב-Streamable HTTP (התקן העדכני), ב-SSE (ישן) וב-stdio (מקומי). כל הכלים דורשים טוקן/OAuth; כל תשובה מחזירה את שם החשבון שבו בוצעה הפעולה.</p>'+
    '<h3>1. Claude.ai / Claude Desktop / Claude Mobile — Custom Connector</h3>'+oauthNote+
    '<p>Settings ← Connectors ← <b>Add custom connector</b> ← הדביקו:</p>'+block('c1', url)+
    (state.status.allowUrlTokens ? '<p>חלופה ללא OAuth (הטוקן בתוך הכתובת — שמרו עליה בסוד):</p>'+block('c2', url+'/t/'+tok) : '')+
    '<h3>2. Claude Code (CLI)</h3>'+block('c3', 'claude mcp add --transport http sumit '+url+' --header "Authorization: Bearer '+tok+'"')+
    '<h3>3. Claude Desktop דרך קובץ הגדרות (mcp-remote)</h3><small class="muted">claude_desktop_config.json</small>'+block('c4', JSON.stringify({mcpServers:{sumit:{command:'npx',args:['-y','mcp-remote',url,'--header','Authorization: Bearer '+tok]}}},null,2))+
    '<h3>4. Cursor / Windsurf / VS Code (Copilot) / Cline</h3>'+block('c5', JSON.stringify({mcpServers:{sumit:{url:url,headers:{Authorization:'Bearer '+tok}}}},null,2))+
    '<h3>5. ChatGPT (Developer mode → Connectors) ואחרים</h3><p>כתובת: <code>'+esc(url)+'</code> עם OAuth, או הכתובת עם הטוקן המוטמע.</p>'+
    '<h3>6. הפעלה מקומית (stdio) ללא שרת</h3>'+block('c6', JSON.stringify({mcpServers:{sumit:{command:'node',args:['/path/to/sumit-mcp/dist/stdio.js'],env:{SUMIT_COMPANY_ID:'123456',SUMIT_API_KEY:'…',SUMIT_ACCOUNT_NAME:'העסק שלי'}}}},null,2))+
    '<h3>בדיקה מהירה</h3>'+block('c7', 'curl -s '+url+' -H "Authorization: Bearer '+tok+'" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d \\'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}\\'')+
    '</div>';
}

/* ---------------- audit ---------------- */
function renderAudit(){
  const rows = state.audit.map(e => '<tr><td><small>'+fmtDate(e.at)+'</small></td><td><span class="badge muted">'+esc(e.kind)+'</span></td><td>'+esc(e.actor||'')+'</td><td>'+esc(e.account||'')+'</td><td><code>'+esc(e.tool||'')+'</code><br><small class="muted ltr">'+esc(e.path||'')+'</small></td><td><span class="badge '+(e.ok?'ok':'bad')+'">'+(e.ok?'הצליח':'נכשל')+'</span>'+(e.ms!=null?'<br><small class="muted">'+e.ms+'ms</small>':'')+'</td><td><small>'+esc(e.message||'')+'</small></td></tr>').join('');
  $('#tab').innerHTML = '<div class="card"><div class="row" style="justify-content:space-between"><h2>יומן פעילות</h2><button class="btn sm" id="refresh">רענון</button></div><p class="lead">כל קריאה שבוצעה דרך ה-MCP (ללא סודות), פעולות ניהול ואירועי אימות.</p>'+(rows?'<table><thead><tr><th>זמן</th><th>סוג</th><th>מבצע</th><th>חשבון</th><th>כלי / נתיב</th><th>תוצאה</th><th>הודעה</th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="msg warn">אין רשומות עדיין.</div>')+'</div>';
  $('#refresh').onclick = async () => { await loadAll(); renderApp(); };
}

/* ---------------- tools ---------------- */
async function renderTools(){
  if(!state.catalog) state.catalog = await api('/catalog');
  const groups = {};
  state.catalog.tools.forEach(t => { (groups[t.module.split('.')[0]] = groups[t.module.split('.')[0]] || []).push(t); });
  const conf = { high:'<span class="badge ok">מאומת</span>', medium:'<span class="badge">בינוני</span>', low:'<span class="badge warn">משוער</span>' };
  const html = Object.entries(groups).map(([m, list]) => '<details open><summary>'+esc(m)+' ('+list.length+')</summary>'+list.map(t => '<div class="tool"><b>'+esc(t.tool)+'</b> <span class="badge '+(t.scope==='payments'?'warn':t.scope==='write'?'':'ok')+'">'+scopeLabel[t.scope]+'</span> '+conf[t.confidence]+' <small class="muted ltr">POST '+esc(t.path)+'</small><div><small>'+esc(t.description.split('\\n')[0])+'</small></div></div>').join('')+'</details>').join('');
  const imported = state.catalog.imported.length ? '<details><summary>מיובא מ-Swagger ('+state.catalog.imported.length+')</summary>'+state.catalog.imported.map(t=>'<div class="tool"><b>'+esc(t.tool)+'</b> <small class="muted ltr">'+esc(t.path)+'</small></div>').join('')+'</details>' : '<div class="msg warn">אפשר להרחיב את הקטלוג אוטומטית מקובץ ה-Swagger הרשמי של סאמיט: <code>npm run import-swagger -- swagger.json</code> (ראו README).</div>';
  $('#tab').innerHTML = '<div class="card"><h2>כלים זמינים ('+state.status.toolCount+')</h2><p class="lead">בנוסף לכלים הייעודיים קיימים: sumit_list_accounts, sumit_use_account, sumit_test_connection, sumit_api_catalog ו-sumit_api_request (קריאה חופשית לכל endpoint).</p>'+html+imported+'</div>';
}

function openModal(html){ $('#modal-body').innerHTML = html; $('#modal').classList.add('open'); }
function closeModal(){ $('#modal').classList.remove('open'); }
$('#modal').addEventListener('click', e => { if(e.target.id==='modal') closeModal(); });

boot().catch(e => { $('#app').innerHTML = '<div class="card"><div class="msg bad">'+esc(e.message)+'</div></div>'; });
})();
</script>
</body></html>`;
}
