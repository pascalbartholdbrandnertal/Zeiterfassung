const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const DAYS   = ['So','Mo','Di','Mi','Do','Fr','Sa'];
const TYPE_LABEL = { vacation:'Urlaub', sick:'Krankenstand', other:'Zeitausgleich', holiday:'Feiertag' };
const TYPE_STYLE = {
  vacation:'background:#B5D4F4;color:#0C447C',
  sick:'background:#F5C4B3;color:#712B13',
  other:'background:#FAC775;color:#633806',
  holiday:'background:#C0DD97;color:#27500A'
};

function todayStr() { return new Date().toISOString().slice(0, 10); }
function calcNet(inT, outT, bm) {
  if (!inT || !outT) return 0;
  const [ih,im]=inT.split(':').map(Number), [oh,om]=outT.split(':').map(Number);
  return Math.max(0, (oh*60+om)-(ih*60+im)-bm);
}
function fmtMins(m) { return `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`; }
function fmtDate(s) {
  if (!s) return '—';
  const [y,m,d]=s.split('-');
  return `${parseInt(d)}. ${MONTHS[parseInt(m)-1]} ${y}`;
}
function workdays(from, to) {
  let c=0, cur=new Date(from), end=new Date(to);
  while(cur<=end){const d=cur.getDay();if(d>0&&d<6)c++;cur.setDate(cur.getDate()+1);}
  return c;
}
async function getSetting(key, def='') {
  const s = await db.settings.findOne({ key });
  return s?.value || def;
}

router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const t = todayStr();
    const bm = parseInt(await getSetting('break_minutes','30'));
    const company = await getSetting('company_name','');
    const users = await db.users.find({ active: true }).sort({ role:1, name:1 });
    const employees = users.filter(u => u.role === 'employee');
    const todayEntries = await db.entries.find({ date: t });
    const todayAbs = await db.absences.find({ date_from: { $lte: t }, date_to: { $gte: t } });
    const stamped = todayEntries.filter(e => e.stamp_in && !e.stamp_out);
    res.send(await adminPage(req.session.userName, employees, users, todayEntries, stamped, todayAbs, company, bm, t));
  } catch(e) { res.status(500).send('Fehler: '+e.message); }
});

router.get('/admin/monat', requireAdmin, async (req, res) => {
  try {
    const employees = await db.users.find({ active:true, role:'employee' }).sort({ name:1 });
    const month = req.query.month || todayStr().slice(0,7);
    const uid   = req.query.user;
    const bm    = parseInt(await getSetting('break_minutes','30'));
    const company = await getSetting('company_name','');
    const address = await getSetting('company_address','');
    if (!uid) return res.send(monatSelect(employees, month));
    const user = await db.users.findOne({ _id: uid });
    if (!user) return res.redirect('/admin/monat');
    const [y,m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthStart = `${month}-01`;
    const monthEnd   = `${month}-${String(daysInMonth).padStart(2,'0')}`;
    const entries  = await db.entries.find({ user_id: uid, date: { $gte: monthStart, $lte: monthEnd } }).sort({ date:1 });
    const absences = await db.absences.find({ user_id: uid, date_from: { $lte: monthEnd }, date_to: { $gte: monthStart } });
    res.send(monatPage(user, entries, absences, y, m, daysInMonth, bm, company, address, month, employees));
  } catch(e) { res.status(500).send('Fehler: '+e.message); }
});

router.post('/admin/mitarbeiter/neu', requireAdmin, async (req, res) => {
  try {
    const { name, username, password, position, weekly_hours, vacation_days } = req.body;
    const hash = bcrypt.hashSync(password || 'mitarbeiter123', 10);
    await db.users.insert({ name, username, password_hash:hash, role:'employee', position:position||'', weekly_hours:parseFloat(weekly_hours)||38.5, vacation_days:parseInt(vacation_days)||25, active:true, created_at:new Date() });
  } catch(e) {}
  res.redirect('/admin#mitarbeiter');
});

router.post('/admin/mitarbeiter/passwort', requireAdmin, async (req, res) => {
  const hash = bcrypt.hashSync(req.body.password, 10);
  await db.users.update({ _id: req.body.uid }, { $set: { password_hash: hash } });
  res.redirect('/admin#mitarbeiter');
});

router.post('/admin/mitarbeiter/deaktivieren', requireAdmin, async (req, res) => {
  await db.users.update({ _id: req.body.uid, role: { $ne: 'admin' } }, { $set: { active: false } });
  res.redirect('/admin#mitarbeiter');
});

router.post('/admin/eintrag/loeschen', requireAdmin, async (req, res) => {
  await db.entries.remove({ _id: req.body.id });
  res.redirect('/admin');
});

router.post('/admin/abwesenheit/loeschen', requireAdmin, async (req, res) => {
  await db.absences.remove({ _id: req.body.id });
  res.redirect('/admin');
});

router.post('/admin/settings', requireAdmin, async (req, res) => {
  const fields = ['company_name','company_address','break_minutes','core_from','core_to'];
  for (const k of fields) {
    if (req.body[k] !== undefined) {
      await db.settings.update({ key:k }, { $set: { value: req.body[k] } }, { upsert:true });
    }
  }
  res.redirect('/admin#einstellungen');
});

async function adminPage(adminName, employees, allUsers, todayEntries, stamped, todayAbs, company, bm, t) {
  const liveRows = employees.map(u => {
    const entry  = todayEntries.find(e => e.user_id === u._id);
    const absence= todayAbs.find(a => a.user_id === u._id);
    let status='', statusColor='';
    if (absence) {
      status = TYPE_LABEL[absence.type]||absence.type;
      statusColor = absence.type==='sick'?'#A32D2D':'#185FA5';
    } else if (entry&&entry.stamp_in&&!entry.stamp_out) {
      status=`Eingest. ${entry.stamp_in}`; statusColor='#27500A';
    } else if (entry&&entry.stamp_in&&entry.stamp_out) {
      status=`Fertig ${entry.stamp_in}–${entry.stamp_out}`; statusColor='#555';
    } else {
      status='Nicht eingestempelt'; statusColor='#bbb';
    }
    const dot = (entry&&entry.stamp_in&&!entry.stamp_out)?'#639922':(absence?'#378ADD':'#ddd');
    return `<tr>
      <td style="padding:10px 12px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};margin-right:8px;vertical-align:middle;"></span>${u.name}</td>
      <td style="padding:10px 12px;color:#666;font-size:13px;">${u.position}</td>
      <td style="padding:10px 12px;color:${statusColor};font-size:13px;">${status}</td>
      <td style="padding:10px 12px;">
        ${entry?`<form method="POST" action="/admin/eintrag/loeschen" style="display:inline;"><input type="hidden" name="id" value="${entry._id}"><button style="font-size:11px;padding:2px 8px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;color:#A32D2D;">Löschen</button></form>`:''}
      </td>
    </tr>`;
  }).join('');

  const recentAll = await db.entries.find({}).sort({ date:-1, createdAt:-1 });
  const recentSlice = recentAll.slice(0, 30);
  const usersMap = {};
  allUsers.forEach(u => usersMap[u._id] = u.name);
  const recentRows = recentSlice.map(e => {
    const net = calcNet(e.stamp_in, e.stamp_out, bm);
    return `<tr>
      <td style="padding:7px 10px;font-size:13px;">${usersMap[e.user_id]||'—'}</td>
      <td style="padding:7px 10px;font-size:13px;">${e.date}</td>
      <td style="padding:7px 10px;font-size:13px;">${e.stamp_in||'—'}</td>
      <td style="padding:7px 10px;font-size:13px;">${e.stamp_out||'—'}</td>
      <td style="padding:7px 10px;font-size:13px;">${net?fmtMins(net):'—'}</td>
      <td style="padding:7px 10px;font-size:12px;color:#888;">${e.note||''} ${e.manual?'<span style="font-size:10px;background:#FAC775;color:#633806;padding:1px 5px;border-radius:4px;">Nachtrag</span>':''}</td>
      <td style="padding:7px 10px;"><form method="POST" action="/admin/eintrag/loeschen"><input type="hidden" name="id" value="${e._id}"><button style="font-size:11px;padding:2px 6px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;color:#A32D2D;">×</button></form></td>
    </tr>`;
  }).join('');

  const absAll = await db.absences.find({}).sort({ date_from:-1 });
  const absRows = absAll.slice(0,50).map(a => `<tr>
    <td style="padding:7px 10px;font-size:13px;">${usersMap[a.user_id]||'—'}</td>
    <td style="padding:7px 10px;"><span style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:500;${TYPE_STYLE[a.type]||''}">${TYPE_LABEL[a.type]||a.type}</span></td>
    <td style="padding:7px 10px;font-size:13px;">${fmtDate(a.date_from)}</td>
    <td style="padding:7px 10px;font-size:13px;">${fmtDate(a.date_to)}</td>
    <td style="padding:7px 10px;font-size:13px;">${workdays(a.date_from,a.date_to)}</td>
    <td style="padding:7px 10px;font-size:12px;color:#888;">${a.note||''}</td>
    <td style="padding:7px 10px;"><form method="POST" action="/admin/abwesenheit/loeschen"><input type="hidden" name="id" value="${a._id}"><button style="font-size:11px;padding:2px 6px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;color:#A32D2D;">×</button></form></td>
  </tr>`).join('');

  const empCards = employees.map(u => `
    <div style="background:#fff;border:1px solid #e8e8e4;border-radius:12px;padding:14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="width:40px;height:40px;border-radius:50%;background:#B5D4F4;color:#0C447C;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:13px;flex-shrink:0;">${u.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
      <div style="flex:1;min-width:140px;">
        <div style="font-weight:500;color:#1a1a1a;">${u.name}</div>
        <div style="font-size:12px;color:#888;">${u.position} &middot; ${u.username} &middot; ${u.weekly_hours}h/Woche &middot; ${u.vacation_days} Urlaubstage</div>
      </div>
      <form method="POST" action="/admin/mitarbeiter/passwort" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <input type="hidden" name="uid" value="${u._id}">
        <input type="password" name="password" placeholder="Neues Passwort" style="padding:7px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px;width:160px;">
        <button type="submit" style="padding:7px 12px;background:#185FA5;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;">Setzen</button>
      </form>
      <form method="POST" action="/admin/mitarbeiter/deaktivieren">
        <input type="hidden" name="uid" value="${u._id}">
        <button type="submit" onclick="return confirm('Mitarbeiter wirklich deaktivieren?')" style="padding:7px 10px;border:1px solid #ddd;border-radius:8px;font-size:12px;background:#fff;cursor:pointer;color:#A32D2D;">Deaktiv.</button>
      </form>
    </div>`).join('');

  const s = {};
  for (const k of ['company_name','company_address','break_minutes','core_from','core_to']) {
    s[k] = await getSetting(k,'');
  }

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin — Zeiterfassung</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f0;min-height:100vh;}
.topbar{background:#fff;border-bottom:1px solid #e8e8e4;padding:13px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;}
.topbar h1{font-size:16px;font-weight:600;color:#1a1a1a;}
.subnav{background:#fff;border-bottom:1px solid #e8e8e4;padding:8px 20px;overflow-x:auto;}
.nav{display:flex;gap:2px;background:#f5f5f0;border-radius:10px;padding:3px;width:fit-content;}
.nav a{padding:7px 13px;border-radius:7px;font-size:13px;text-decoration:none;color:#666;white-space:nowrap;}
.nav a:hover,.nav a.active{background:#fff;color:#1a1a1a;font-weight:500;}
.content{padding:20px;max-width:1100px;margin:0 auto;}
.section{display:none;}
.section.active{display:block;}
.card{background:#fff;border-radius:16px;border:1px solid #e8e8e4;padding:18px;margin-bottom:14px;}
.card-title{font-size:14px;font-weight:500;color:#1a1a1a;margin-bottom:12px;}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px;}
.kstat{background:#fff;border:1px solid #e8e8e4;border-radius:12px;padding:13px 14px;}
.kstat-label{font-size:11px;color:#888;margin-bottom:2px;}
.kstat-val{font-size:22px;font-weight:500;color:#1a1a1a;}
table{width:100%;border-collapse:collapse;}
th{text-align:left;padding:8px 10px;font-size:11px;color:#888;font-weight:500;border-bottom:1px solid #e8e8e4;}
tr:hover td{background:#fafaf8;}
label{display:block;font-size:12px;color:#666;margin-bottom:4px;margin-top:10px;}
input,select{padding:9px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;font-family:inherit;background:#fff;color:#1a1a1a;outline:none;}
input:focus,select:focus{border-color:#378ADD;}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.btn{padding:10px 16px;border-radius:10px;border:none;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;}
.btn-g{background:#3B6D11;color:#EAF3DE;}
.btn-b{background:#185FA5;color:#E6F1FB;}
a.mlink{display:inline-block;padding:9px 18px;background:#185FA5;color:#E6F1FB;border-radius:9px;text-decoration:none;font-size:13px;font-weight:500;}
</style>
</head>
<body>
<div class="topbar">
  <h1>Admin &middot; ${company}</h1>
  <div style="display:flex;gap:12px;align-items:center;">
    <span style="font-size:13px;color:#888;">${adminName}</span>
    <a href="/logout" style="font-size:13px;color:#888;text-decoration:none;">Abmelden</a>
  </div>
</div>
<div class="subnav">
  <div class="nav">
    <a href="#live" class="active" onclick="show('live',this)">Live</a>
    <a href="#buchungen" onclick="show('buchungen',this)">Buchungen</a>
    <a href="#abwesenheiten" onclick="show('abwesenheiten',this)">Abwesenheiten</a>
    <a href="#monat-link" onclick="show('monat-link',this)">Monatsexport</a>
    <a href="#mitarbeiter" onclick="show('mitarbeiter',this)">Mitarbeiter</a>
    <a href="#einstellungen" onclick="show('einstellungen',this)">Einstellungen</a>
  </div>
</div>
<div class="content">

  <div id="sec-live" class="section active">
    <div class="kpi">
      <div class="kstat"><div class="kstat-label">Jetzt eingestempelt</div><div class="kstat-val" style="color:#27500A;">${stamped.length}</div></div>
      <div class="kstat"><div class="kstat-label">Abwesend heute</div><div class="kstat-val" style="color:#185FA5;">${todayAbs.length}</div></div>
      <div class="kstat"><div class="kstat-label">Mitarbeiter</div><div class="kstat-val">${employees.length}</div></div>
      <div class="kstat"><div class="kstat-label">Heute</div><div class="kstat-val" style="font-size:15px;">${fmtDate(t)}</div></div>
    </div>
    <div class="card">
      <div class="card-title">Wer ist jetzt da?</div>
      <div style="overflow-x:auto;">
        <table><thead><tr><th>Mitarbeiter</th><th>Position</th><th>Status</th><th></th></tr></thead>
        <tbody>${liveRows}</tbody></table>
      </div>
    </div>
  </div>

  <div id="sec-buchungen" class="section">
    <div class="card">
      <div class="card-title">Alle Buchungen (letzte 30)</div>
      <div style="overflow-x:auto;">
        <table><thead><tr><th>Mitarbeiter</th><th>Datum</th><th>Von</th><th>Bis</th><th>Netto</th><th>Notiz</th><th></th></tr></thead>
        <tbody>${recentRows}</tbody></table>
      </div>
    </div>
  </div>

  <div id="sec-abwesenheiten" class="section">
    <div class="card">
      <div class="card-title">Alle Abwesenheiten</div>
      <div style="overflow-x:auto;">
        <table><thead><tr><th>Mitarbeiter</th><th>Art</th><th>Von</th><th>Bis</th><th>Tage</th><th>Notiz</th><th></th></tr></thead>
        <tbody>${absRows}</tbody></table>
      </div>
    </div>
  </div>

  <div id="sec-monat-link" class="section">
    <div class="card">
      <div class="card-title">Monatsexport für Buchhaltung</div>
      <p style="font-size:13px;color:#666;margin-bottom:16px;">Vollständige Monatstabelle mit Unterschriftsfeldern — direkt druckbar als PDF.</p>
      <a href="/admin/monat" class="mlink">Monatsexport öffnen &rarr;</a>
    </div>
  </div>

  <div id="sec-mitarbeiter" class="section">
    <div class="card"><div class="card-title">Mitarbeiter</div>${empCards}</div>
    <div class="card">
      <div class="card-title">Neuer Mitarbeiter</div>
      <form method="POST" action="/admin/mitarbeiter/neu">
        <div class="g2">
          <div><label>Name</label><input type="text" name="name" placeholder="Vor- und Nachname" required style="width:100%;"></div>
          <div><label>Benutzername</label><input type="text" name="username" placeholder="z.B. anna.huber" required style="width:100%;"></div>
          <div><label>Position</label><input type="text" name="position" placeholder="z.B. Tourismusmanager" style="width:100%;"></div>
          <div><label>Start-Passwort</label><input type="text" name="password" placeholder="mitarbeiter123" style="width:100%;"></div>
          <div><label>Wochenstunden</label><input type="number" name="weekly_hours" value="38.5" step="0.5" style="width:100%;"></div>
          <div><label>Urlaubstage/Jahr</label><input type="number" name="vacation_days" value="25" style="width:100%;"></div>
        </div>
        <button type="submit" class="btn btn-g" style="margin-top:14px;">Anlegen</button>
      </form>
    </div>
  </div>

  <div id="sec-einstellungen" class="section">
    <div class="card">
      <div class="card-title">Firmeneinstellungen</div>
      <form method="POST" action="/admin/settings">
        <div class="g2">
          <div><label>Firmenname</label><input type="text" name="company_name" value="${s.company_name}" style="width:100%;"></div>
          <div><label>Adresse</label><input type="text" name="company_address" value="${s.company_address}" style="width:100%;"></div>
          <div><label>Kernzeit von</label><input type="time" name="core_from" value="${s.core_from}" style="width:100%;"></div>
          <div><label>Kernzeit bis</label><input type="time" name="core_to" value="${s.core_to}" style="width:100%;"></div>
          <div><label>Pausenzeit (Minuten, wird abgezogen)</label><input type="number" name="break_minutes" value="${s.break_minutes}" style="width:100%;"></div>
        </div>
        <button type="submit" class="btn btn-b" style="margin-top:14px;">Speichern</button>
      </form>
    </div>
  </div>

</div>
<script>
function show(id,el){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
  document.getElementById('sec-'+id).classList.add('active');
  el.classList.add('active');
  return false;
}
const h=location.hash.replace('#','');
if(h){const el=document.querySelector('.nav a[href="#'+h+'"]');if(el)show(h,el);}
setInterval(()=>location.reload(),60000);
</script>
</body>
</html>`;
}

function monatSelect(users, month) {
  const opts = users.map(u=>`<option value="${u._id}">${u.name}</option>`).join('');
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Monatsexport</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f0;padding:2rem;}
.card{background:#fff;border-radius:16px;border:1px solid #e8e8e4;padding:24px;max-width:500px;margin:0 auto;}
h2{font-size:18px;font-weight:500;margin-bottom:20px;color:#1a1a1a;}label{display:block;font-size:13px;color:#666;margin-bottom:4px;margin-top:12px;}
select,input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;font-family:inherit;outline:none;}
.btn{margin-top:16px;width:100%;padding:12px;background:#185FA5;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:500;cursor:pointer;}
.back{display:inline-block;margin-bottom:16px;font-size:13px;color:#888;text-decoration:none;}</style>
</head><body>
<a href="/admin" class="back">&larr; Zurück zum Admin</a>
<div class="card"><h2>Monatsexport</h2>
<form method="GET" action="/admin/monat">
  <label>Mitarbeiter</label><select name="user">${opts}</select>
  <label>Monat</label><input type="month" name="month" value="${month}">
  <button type="submit" class="btn">Export anzeigen</button>
</form></div></body></html>`;
}

function monatPage(user, entries, absences, y, m, daysInMonth, bm, company, address, month, users) {
  let totalNet=0, workDays=0, vacDays=0, sickDays=0;
  const rows = [];
  for (let d=1; d<=daysInMonth; d++) {
    const dateStr=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow=new Date(dateStr).getDay();
    const isWE=dow===0||dow===6;
    const entry=entries.find(e=>e.date===dateStr);
    const abs=absences.find(a=>a.date_from<=dateStr&&a.date_to>=dateStr);
    let cols='', rowBg=isWE?'#f9f9f7':'#fff';
    if (abs) {
      if(abs.type==='vacation') vacDays++;
      if(abs.type==='sick') sickDays++;
      cols=`<td>—</td><td>—</td><td colspan="2" style="font-size:12px;color:${abs.type==='sick'?'#A32D2D':'#185FA5'};">${TYPE_LABEL[abs.type]||abs.type}${abs.note?' &middot; '+abs.note:''}</td>`;
    } else if (entry) {
      const net=calcNet(entry.stamp_in,entry.stamp_out,bm);
      if(net&&!isWE){totalNet+=net;workDays++;}
      cols=`<td>${entry.stamp_in||'—'}</td><td>${entry.stamp_out||'—'}</td><td>${net?fmtMins(net):'—'}</td><td style="font-size:11px;color:#888;">${entry.note||''}</td>`;
    } else {
      cols=`<td style="color:#ccc;">—</td><td style="color:#ccc;">—</td><td style="color:#ccc;">—</td><td>${isWE?'<span style="font-size:11px;color:#ccc;">Wochenende</span>':''}</td>`;
    }
    rows.push(`<tr style="background:${rowBg};"><td style="padding:4px 8px;font-size:12px;">${d}.</td><td style="padding:4px 8px;font-size:11px;color:#888;">${DAYS[dow]}</td>${cols.replace(/(<td)/g,'$1 style="padding:4px 8px;font-size:12px;"')}</tr>`);
  }
  const solMins=Math.round((user.weekly_hours/5)*workDays*60);
  const diff=totalNet-solMins;
  const diffStr=(diff>=0?'+':'-')+fmtMins(Math.abs(diff));
  const userOpts=users.map(u=>`<option value="${u._id}" ${u._id===user._id?'selected':''}>${u.name}</option>`).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monatsexport ${MONTHS[m-1]} ${y} &mdash; ${user.name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f0;padding:1.5rem;}
.noprint{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:1rem;}
.noprint select,.noprint input{padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;font-family:inherit;outline:none;background:#fff;}
.btn{padding:9px 16px;border-radius:8px;border:none;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;}
.btn-b{background:#185FA5;color:#fff;}
.btn-g{background:#fff;border:1px solid #ddd;color:#333;}
.doc{background:#fff;max-width:780px;margin:0 auto;border-radius:12px;border:1px solid #e8e8e4;padding:2rem;}
.dh{border-bottom:2px solid #1a1a1a;padding-bottom:1rem;margin-bottom:1.5rem;}
.dh-title{font-size:18px;font-weight:600;color:#1a1a1a;}
.dh-sub{font-size:13px;color:#555;margin-top:4px;}
.kpi4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:1rem;}
.k{border:1px solid #e0e0e0;border-radius:8px;padding:10px;text-align:center;}
.k-label{font-size:10px;color:#888;}
.k-val{font-size:17px;font-weight:600;color:#1a1a1a;margin-top:2px;}
table{width:100%;border-collapse:collapse;font-size:12px;}
th{text-align:left;padding:6px 8px;font-size:11px;color:#888;font-weight:500;border-bottom:2px solid #e8e8e4;}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:3rem;margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid #e8e8e4;}
.sline{border-bottom:1px solid #333;height:36px;margin-bottom:4px;}
.slabel{font-size:11px;color:#888;}
@media print{body{background:#fff;padding:0;}.noprint{display:none!important;}.doc{border:none;border-radius:0;padding:1.5cm;max-width:100%;}@page{margin:1.5cm;}}
</style>
</head>
<body>
<div class="noprint">
  <a href="/admin" style="font-size:13px;color:#888;text-decoration:none;">&larr; Admin</a>
  <form method="GET" action="/admin/monat" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
    <select name="user">${userOpts}</select>
    <input type="month" name="month" value="${month}">
    <button type="submit" class="btn btn-g">Anzeigen</button>
  </form>
  <button onclick="window.print()" class="btn btn-b">Drucken / PDF speichern</button>
</div>
<div class="doc">
  <div class="dh">
    <div class="dh-title">Zeiterfassung &mdash; ${MONTHS[m-1]} ${y}</div>
    <div class="dh-sub">${user.name} &middot; ${user.position} &middot; ${company}, ${address}</div>
  </div>
  <div class="kpi4">
    <div class="k"><div class="k-label">Nettoarbeit</div><div class="k-val">${fmtMins(totalNet)}</div></div>
    <div class="k"><div class="k-label">Arbeitstage</div><div class="k-val">${workDays}</div></div>
    <div class="k"><div class="k-label">Urlaub</div><div class="k-val">${vacDays} T</div></div>
    <div class="k"><div class="k-label">Krankenstand</div><div class="k-val">${sickDays} T</div></div>
  </div>
  <table>
    <thead><tr><th>Tag</th><th>WT</th><th>Kommt</th><th>Geht</th><th>Netto</th><th>Notiz</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
    <tfoot><tr style="border-top:2px solid #1a1a1a;">
      <td colspan="4" style="padding:8px;font-weight:600;">Gesamt</td>
      <td style="padding:8px;font-weight:600;">${fmtMins(totalNet)}</td>
      <td style="padding:8px;font-size:12px;color:${diff>=0?'#27500A':'#A32D2D'};font-weight:500;">${diffStr} Überstunden</td>
    </tr></tfoot>
  </table>
  <div class="sig">
    <div><div class="sline"></div><div class="slabel">Datum, Unterschrift Mitarbeiter/in</div></div>
    <div><div class="sline"></div><div class="slabel">Datum, Unterschrift Vorgesetzte/r</div></div>
  </div>
</div>
</body>
</html>`;
}

module.exports = router;
