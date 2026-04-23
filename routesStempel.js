const express = require('express');
const db = require('./db');
const { requireLogin } = require('./middlewareAuth');
const router = express.Router();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function nowTime() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}
function calcNet(inT, outT, breakMins) {
  if (!inT || !outT) return 0;
  const [ih,im] = inT.split(':').map(Number);
  const [oh,om] = outT.split(':').map(Number);
  const mins = (oh*60+om) - (ih*60+im);
  return Math.max(0, mins - breakMins);
}
function fmtEntry(e, breakMins) {
  if (!e.stamp_in) return '—';
  if (!e.stamp_out) return `seit ${e.stamp_in}`;
  const net = calcNet(e.stamp_in, e.stamp_out, breakMins);
  return `${Math.floor(net/60)}h ${String(net%60).padStart(2,'0')}min`;
}

router.get('/stempel', requireLogin, async (req, res) => {
  try {
    const uid = req.session.userId;
    const t   = todayStr();
    const settingDoc = await db.settings.findOne({ key: 'break_minutes' });
    const breakMins  = parseInt(settingDoc?.value || '30');

    const entry = await db.entries.findOne({ user_id: uid, date: t, stamp_out: { $exists: false } });
    const isIn  = !!(entry && entry.stamp_in);

    const allEntries = await db.entries.find({ user_id: uid }).sort({ date: -1, createdAt: -1 });
    const recent     = allEntries.slice(0, 12);

    const todayAbs = await db.absences.findOne({ user_id: uid, date_from: { $lte: t }, date_to: { $gte: t } });

    const user = await db.users.findOne({ _id: uid });
    const vacTotal = user?.vacation_days || 25;

    const year = t.slice(0, 4);
    const allVac = await db.absences.find({ user_id: uid, type: 'vacation' });
    let vacUsed = 0;
    allVac.forEach(a => { if (a.date_from.startsWith(year)) vacUsed += workdays(a.date_from, a.date_to); });

    const monthStart = t.slice(0, 7) + '-01';
    const monthEntries = allEntries.filter(e => e.date >= monthStart && e.date <= t);
    let monthMins = 0;
    monthEntries.forEach(e => { monthMins += calcNet(e.stamp_in, e.stamp_out, breakMins); });

    res.send(stempelPage(req.session.userName, isIn, entry, recent, breakMins, vacUsed, vacTotal, monthMins));
  } catch(e) { res.status(500).send('Fehler: ' + e.message); }
});

router.post('/stempel/ein', requireLogin, async (req, res) => {
  try {
    const uid = req.session.userId;
    const t   = todayStr();
    const existing = await db.entries.findOne({ user_id: uid, date: t, stamp_out: { $exists: false } });
    if (!existing) {
      await db.entries.insert({ user_id: uid, date: t, stamp_in: nowTime(), note: req.body.note || '', manual: false, createdAt: new Date() });
    }
    res.redirect('/stempel');
  } catch(e) { res.redirect('/stempel'); }
});

router.post('/stempel/aus', requireLogin, async (req, res) => {
  try {
    const uid = req.session.userId;
    const t   = todayStr();
    const entry = await db.entries.findOne({ user_id: uid, date: t, stamp_out: { $exists: false } });
    if (entry) {
      await db.entries.update({ _id: entry._id }, { $set: { stamp_out: nowTime() } });
    }
    res.redirect('/stempel');
  } catch(e) { res.redirect('/stempel'); }
});

router.post('/stempel/nachtrag', requireLogin, async (req, res) => {
  try {
    const uid = req.session.userId;
    const { date, stamp_in, stamp_out, note } = req.body;
    if (!date || !stamp_in || !stamp_out) return res.redirect('/stempel');
    await db.entries.insert({ user_id: uid, date, stamp_in, stamp_out, note: note || '', manual: true, createdAt: new Date() });
    res.redirect('/stempel');
  } catch(e) { res.redirect('/stempel'); }
});

router.post('/abwesenheit/neu', requireLogin, async (req, res) => {
  try {
    const uid = req.session.userId;
    const { type, date_from, date_to, note } = req.body;
    if (!type || !date_from || !date_to) return res.redirect('/stempel');
    await db.absences.insert({ user_id: uid, type, date_from, date_to, note: note || '', created_by: uid, createdAt: new Date() });
    res.redirect('/stempel');
  } catch(e) { res.redirect('/stempel'); }
});

function workdays(from, to) {
  let count = 0, cur = new Date(from), end = new Date(to);
  while (cur <= end) { const d = cur.getDay(); if (d > 0 && d < 6) count++; cur.setDate(cur.getDate() + 1); }
  return count;
}

function stempelPage(name, isIn, entry, recent, breakMins, vacUsed, vacTotal, monthMins) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const mh = Math.floor(monthMins / 60);
  const mm = monthMins % 60;
  const vacRem = Math.max(0, vacTotal - vacUsed);

  const recentHtml = recent.map(e => {
    const dur = fmtEntry(e, breakMins);
    const manual = e.manual ? ' <span style="font-size:10px;background:#FAC775;color:#633806;padding:1px 5px;border-radius:4px;">Nachtrag</span>' : '';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0ec;">
      <div>
        <div style="font-size:13px;font-weight:500;color:#1a1a1a;">${e.date}${manual}</div>
        <div style="font-size:12px;color:#888;">${e.stamp_in||'—'} – ${e.stamp_out||'...'} ${e.note ? '· '+e.note : ''}</div>
      </div>
      <div style="font-size:13px;color:#555;white-space:nowrap;margin-left:8px;">${dur}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>Zeiterfassung</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f0;padding-bottom:2rem;}
.topbar{background:#fff;border-bottom:1px solid #e8e8e4;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;}
.topbar-name{font-size:15px;font-weight:500;color:#1a1a1a;}
.topbar-sub{font-size:12px;color:#888;}
.avatar{width:36px;height:36px;border-radius:50%;background:#B5D4F4;color:#0C447C;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:500;flex-shrink:0;}
.content{padding:14px;}
.clock-card{background:#fff;border-radius:16px;border:1px solid #e8e8e4;padding:22px 16px;text-align:center;margin-bottom:12px;}
.clock{font-size:50px;font-weight:300;color:#1a1a1a;font-variant-numeric:tabular-nums;letter-spacing:-2px;}
.clock-date{font-size:13px;color:#888;margin-top:4px;margin-bottom:18px;}
.status-badge{display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:5px 14px;border-radius:20px;margin-bottom:18px;}
.status-in{background:#EAF3DE;color:#27500A;}
.status-out{background:#F1EFE8;color:#5F5E5A;}
.stamp-btn{width:128px;height:128px;border-radius:50%;border:none;font-size:15px;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;margin:0 auto;-webkit-tap-highlight-color:transparent;}
.stamp-btn:active{opacity:0.85;}
.btn-in{background:#C0DD97;color:#27500A;}
.btn-out{background:#F5C4B3;color:#712B13;}
.stamp-icon{font-size:28px;}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;}
.stat{background:#fff;border-radius:12px;border:1px solid #e8e8e4;padding:12px 14px;}
.stat-label{font-size:11px;color:#888;margin-bottom:3px;}
.stat-val{font-size:20px;font-weight:500;color:#1a1a1a;}
.stat-sub{font-size:11px;color:#aaa;margin-top:1px;}
.sec-title{font-size:13px;font-weight:500;color:#555;margin:14px 0 7px;}
.card{background:#fff;border-radius:16px;border:1px solid #e8e8e4;padding:16px;margin-bottom:12px;}
label{display:block;font-size:12px;color:#666;margin-bottom:3px;margin-top:10px;}
label:first-child{margin-top:0;}
input,select{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;font-family:inherit;background:#fff;color:#1a1a1a;-webkit-appearance:none;}
input:focus,select:focus{border-color:#378ADD;}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.sbtn{width:100%;margin-top:12px;padding:12px;border-radius:10px;border:none;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;}
.s-green{background:#3B6D11;color:#EAF3DE;}
.s-blue{background:#185FA5;color:#E6F1FB;}
</style>
</head>
<body>
<div class="topbar">
  <div>
    <div class="topbar-name">${name}</div>
    <div class="topbar-sub">Mitarbeiter</div>
  </div>
  <div style="display:flex;gap:10px;align-items:center;">
    <a href="/logout" style="font-size:12px;color:#888;text-decoration:none;">Abmelden</a>
    <div class="avatar">${initials}</div>
  </div>
</div>
<div class="content">
  <div class="clock-card">
    <div class="clock" id="clk">--:--:--</div>
    <div class="clock-date" id="cdt"></div>
    <div class="status-badge ${isIn ? 'status-in' : 'status-out'}">
      ${isIn ? '&#9679; Eingestempelt seit ' + (entry?.stamp_in||'') : '&#9679; Nicht eingestempelt'}
    </div><br>
    <form method="POST" action="/stempel/${isIn ? 'aus' : 'ein'}">
      <button type="submit" class="stamp-btn ${isIn ? 'btn-out' : 'btn-in'}">
        <span class="stamp-icon">${isIn ? '&#8593;' : '&#8595;'}</span>
        <span>${isIn ? 'Ausstempeln' : 'Einstempeln'}</span>
      </button>
    </form>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="stat-label">Dieser Monat</div>
      <div class="stat-val">${mh}h ${String(mm).padStart(2,'0')}m</div>
      <div class="stat-sub">Nettoarbeitszeit</div>
    </div>
    <div class="stat">
      <div class="stat-label">Urlaub übrig</div>
      <div class="stat-val">${vacRem}</div>
      <div class="stat-sub">von ${vacTotal} Tagen</div>
    </div>
  </div>

  <div class="sec-title">Zeit nachträglich eintragen</div>
  <div class="card">
    <form method="POST" action="/stempel/nachtrag">
      <label>Datum</label>
      <input type="date" name="date" required>
      <div class="row2">
        <div><label>Von</label><input type="time" name="stamp_in" required></div>
        <div><label>Bis</label><input type="time" name="stamp_out" required></div>
      </div>
      <label>Notiz (optional)</label>
      <input type="text" name="note" placeholder="z.B. Homeoffice, Außentermin">
      <button type="submit" class="sbtn s-green">Eintragen</button>
    </form>
  </div>

  <div class="sec-title">Abwesenheit melden</div>
  <div class="card">
    <form method="POST" action="/abwesenheit/neu">
      <label>Art</label>
      <select name="type">
        <option value="vacation">Urlaub</option>
        <option value="sick">Krankenstand</option>
        <option value="other">Zeitausgleich / Sonstiges</option>
      </select>
      <div class="row2">
        <div><label>Von</label><input type="date" name="date_from" required></div>
        <div><label>Bis</label><input type="date" name="date_to" required></div>
      </div>
      <label>Anmerkung (optional)</label>
      <input type="text" name="note" placeholder="z.B. Arztbestätigung vorhanden">
      <button type="submit" class="sbtn s-blue">Melden</button>
    </form>
  </div>

  <div class="sec-title">Letzte Buchungen</div>
  <div class="card">
    ${recentHtml || '<p style="font-size:13px;color:#888;text-align:center;padding:8px 0;">Noch keine Buchungen.</p>'}
  </div>
</div>
<script>
const days=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const months=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
function tick(){
  const n=new Date();
  const p=x=>String(x).padStart(2,'0');
  document.getElementById('clk').textContent=p(n.getHours())+':'+p(n.getMinutes())+':'+p(n.getSeconds());
  document.getElementById('cdt').textContent=days[n.getDay()]+', '+n.getDate()+'. '+months[n.getMonth()]+' '+n.getFullYear();
}
tick();setInterval(tick,1000);
</script>
</body>
</html>`;
}

module.exports = router;
