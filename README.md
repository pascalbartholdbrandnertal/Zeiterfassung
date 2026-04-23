const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect(req.session.role === 'admin' ? '/admin' : '/stempel');
  }
  res.send(loginPage(''));
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.users.findOne({ username, active: true });
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.send(loginPage('Falscher Benutzername oder Passwort.'));
    }
    req.session.userId   = user._id;
    req.session.userName = user.name;
    req.session.role     = user.role;
    res.redirect(user.role === 'admin' ? '/admin' : '/stempel');
  } catch(e) { res.send(loginPage('Fehler: ' + e.message)); }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>Zeiterfassung — Login</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;}
.card{background:#fff;border-radius:16px;border:1px solid #e8e8e4;padding:2rem;width:100%;max-width:380px;}
.logo{text-align:center;margin-bottom:2rem;}
.logo h1{font-size:20px;font-weight:600;color:#1a1a1a;margin-bottom:4px;}
.logo p{font-size:13px;color:#888;}
label{display:block;font-size:13px;color:#555;margin-bottom:4px;margin-top:12px;}
input{width:100%;padding:12px 14px;border:1px solid #ddd;border-radius:10px;font-size:15px;outline:none;transition:border 0.2s;-webkit-appearance:none;}
input:focus{border-color:#378ADD;}
.btn{width:100%;margin-top:20px;padding:14px;background:#185FA5;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:500;cursor:pointer;}
.btn:hover{background:#0C447C;}
.error{background:#FCEBEB;color:#A32D2D;border-radius:8px;padding:10px 14px;font-size:13px;margin-top:12px;}
.hint{font-size:12px;color:#aaa;text-align:center;margin-top:16px;}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <h1>Zeiterfassung</h1>
    <p>Brandnertal Tourismus GmbH</p>
  </div>
  <form method="POST" action="/login">
    <label>Benutzername</label>
    <input type="text" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="benutzername" required>
    <label>Passwort</label>
    <input type="password" name="password" autocomplete="current-password" placeholder="••••••••" required>
    ${error ? `<div class="error">${error}</div>` : ''}
    <button type="submit" class="btn">Anmelden</button>
  </form>
  <p class="hint">Probleme beim Login? Admin kontaktieren.</p>
</div>
</body>
</html>`;
}

module.exports = router;
