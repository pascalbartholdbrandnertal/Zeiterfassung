const Datastore = require('nedb-promises');
const bcrypt = require('bcryptjs');
const path = require('path');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
require('fs').mkdirSync(dataDir, { recursive: true });

const db = {
  users:    Datastore.create({ filename: path.join(dataDir, 'users.db'),    autoload: true }),
  entries:  Datastore.create({ filename: path.join(dataDir, 'entries.db'),  autoload: true }),
  absences: Datastore.create({ filename: path.join(dataDir, 'absences.db'), autoload: true }),
  settings: Datastore.create({ filename: path.join(dataDir, 'settings.db'), autoload: true }),
};

async function seed() {
  const admin = await db.users.findOne({ role: 'admin' });
  if (admin) return;
  const adminHash = bcrypt.hashSync('admin123', 10);
  const empHash   = bcrypt.hashSync('mitarbeiter123', 10);
  await db.users.insert({ name:'Admin',         username:'admin',  password_hash:adminHash, role:'admin',     position:'Administrator',   weekly_hours:38.5, vacation_days:25, active:true, created_at:new Date() });
  await db.users.insert({ name:'Päsi Mäkinen',  username:'paesi',  password_hash:empHash,   role:'employee',  position:'Tourismusmanager', weekly_hours:38.5, vacation_days:25, active:true, created_at:new Date() });
  await db.users.insert({ name:'Linda Müller',   username:'linda',  password_hash:empHash,   role:'employee',  position:'Website & Online', weekly_hours:38.5, vacation_days:25, active:true, created_at:new Date() });
  await db.users.insert({ name:'Thessa Berger',  username:'thessa', password_hash:empHash,   role:'employee',  position:'Administration',   weekly_hours:38.5, vacation_days:25, active:true, created_at:new Date() });
  const defs = [
    { key:'company_name',    value:'Brandnertal Tourismus GmbH' },
    { key:'company_address', value:'Brand 34, 6708 Brand, Vorarlberg' },
    { key:'break_minutes',   value:'30' },
    { key:'core_from',       value:'08:00' },
    { key:'core_to',         value:'17:00' },
  ];
  for (const s of defs) await db.settings.insert(s);
}

seed().catch(console.error);
module.exports = db;
