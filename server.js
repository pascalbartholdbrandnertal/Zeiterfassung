const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'zeiterfassung-brandnertal-2024-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 1000 * 60 * 60 * 12
  }
}));

require('./db');

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/stempel'));
app.use('/', require('./routes/admin'));

app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect(req.session.role === 'admin' ? '/admin' : '/stempel');
  }
  res.redirect('/login');
});

app.listen(PORT, () => {
  console.log(`Zeiterfassung läuft auf http://localhost:${PORT}`);
  console.log(`Admin-Login: admin / admin123`);
  console.log(`Mitarbeiter-Login: paesi / mitarbeiter123`);
});
