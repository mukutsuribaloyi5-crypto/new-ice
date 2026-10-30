const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = path.resolve(process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'data.db'));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  items TEXT NOT NULL,          -- one item per line
  price TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  name TEXT, phone TEXT, email TEXT,
  make TEXT, model TEXT, year TEXT,
  service_date TEXT, info TEXT,
  status TEXT DEFAULT 'new',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Times you are available. The website lets customers pick from these.
db.exec(`
CREATE TABLE IF NOT EXISTS availability (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  start_time TEXT NOT NULL,    -- HH:MM (24 hour)
  end_time TEXT NOT NULL,
  booking_id INTEGER,          -- filled in when a customer books this time
  UNIQUE (date, start_time)
);
`);
// Customer reviews (they wait for your approval before showing on the website)
db.exec(`
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | hidden
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);
// Older databases need the new time column on bookings
if (!db.prepare('PRAGMA table_info(bookings)').all().some(c => c.name === 'service_time')) {
  db.exec("ALTER TABLE bookings ADD COLUMN service_time TEXT DEFAULT ''");
}

// Seed the price list and packages from the original website (first run only)
if (!db.prepare('SELECT 1 FROM services').get()) {
  const services = [
    ['Car Aircon Gas Refill (R134a)', 'R350 – R650'],
    ['Aircon Diagnostics / Pressure Check', 'R150 – R350'],
    ['Leak Detection', 'R250 – R500'],
    ['Aircon Cleaning & Sanitizing', 'R200 – R450'],
    ['Compressor Check', 'R250 – R500'],
    ['Minor Aircon Repairs', 'From R350+'],
    ['Pipe / Hose Inspection', 'R150 – R300'],
    ['Full Aircon Service Package', 'R650 – R1,500'],
    ['Mobile Call-Out Fee (Distance Dependent)', 'R100 – R500'],
    ['Workshop Inspection Quote', 'From R100'],
  ];
  const ins = db.prepare('INSERT INTO services (name, price, sort_order) VALUES (?, ?, ?)');
  services.forEach(([n, p], i) => ins.run(n, p, i));
}
if (!db.prepare('SELECT 1 FROM packages').get()) {
  const packages = [
    ['Basic Cooling Package', 'Gas Refill\nPressure Check', 'R550'],
    ['Premium Cooling Package', 'Gas Refill\nDiagnostics\nLeak Detection\nCleaning & Sanitizing', 'R950'],
    ['VIP Full Service Package', 'Full Diagnostics\nRefill\nCleaning\nMinor Repairs\nSystem Performance Check', 'R1,500+'],
  ];
  const ins = db.prepare('INSERT INTO packages (name, items, price, sort_order) VALUES (?, ?, ?, ?)');
  packages.forEach(([n, it, p], i) => ins.run(n, it, p, i));
}

module.exports = db;
