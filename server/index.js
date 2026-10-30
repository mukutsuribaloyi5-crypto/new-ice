require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const SQLiteSessionStore = require('./session-store');

const PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || (PROD ? 3000 : 3001));
const app = express();
if (PROD) app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'upgrade-insecure-requests': null,
    },
  },
}));
app.use(express.json({ limit: '50kb' }));

// Every state-changing API call must carry this header. Browsers can't add it
// to a cross-site form post, so together with SameSite cookies it blocks CSRF.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'fetch') {
    return res.status(400).json({ error: 'Bad request' });
  }
  next();
});

if (PROD && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Production requires SESSION_SECRET with at least 32 characters.');
}
if (PROD && !db.prepare('SELECT 1 FROM admins').get() && !process.env.ADMIN_PASSWORD) {
  throw new Error('Production first run requires ADMIN_PASSWORD in the environment.');
}
let secret = process.env.SESSION_SECRET;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET not set - admin logins will reset on every restart.');
}
app.use(session({
  name: 'icac.sid',
  store: new SQLiteSessionStore(),
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: PROD, maxAge: 1000 * 60 * 60 * 8 },
}));

// ---- First-run admin account -------------------------------------------
if (!db.prepare('SELECT 1 FROM admins').get()) {
  const user = process.env.ADMIN_USER || 'admin';
  const generated = !process.env.ADMIN_PASSWORD;
  const pass = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)')
    .run(user, bcrypt.hashSync(pass, 12));
  console.log(`Admin account created. Username: ${user}`);
  if (generated) console.log(`Temporary password: ${pass}  (change it under Account after logging in)`);
}

// ---- Helpers -------------------------------------------------------------
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const requireAdmin = (req, res, next) =>
  req.session.adminId ? next() : res.status(401).json({ error: 'Not logged in' });
const STATUSES = ['new', 'confirmed', 'completed', 'cancelled'];

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ---- Public API ------------------------------------------------------------
app.get('/api/services', (req, res) => {
  const services = db.prepare(
    'SELECT id, name, price FROM services WHERE active = 1 ORDER BY sort_order, id').all();
  const packages = db.prepare(
    'SELECT id, name, items, price FROM packages WHERE active = 1 ORDER BY sort_order, id').all()
    .map(p => ({ ...p, items: p.items.split('\n').map(s => s.trim()).filter(Boolean) }));
  res.json({ services, packages });
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please call or WhatsApp us instead.' },
});

// ---- Availability helpers (times are South African time) ---------------------
const TZ = 'Africa/Johannesburg';
const saNow = () => {
  const d = new Date();
  return {
    date: d.toLocaleDateString('en-CA', { timeZone: TZ }),                                      // YYYY-MM-DD
    time: d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),  // HH:MM
  };
};

// Public: the free times customers can choose from
app.get('/api/availability', (req, res) => {
  const now = saNow();
  const rows = db.prepare(`SELECT id, date, start_time, end_time FROM availability
    WHERE booking_id IS NULL AND (date > @d OR (date = @d AND start_time > @t))
    ORDER BY date, start_time`).all({ d: now.date, t: now.time });
  res.json(rows);
});

app.post('/api/bookings', bookingLimiter, (req, res) => {
  const b = req.body || {};
  const d = {
    name: str(b.name, 100), phone: str(b.phone, 30), email: str(b.email, 150),
    make: str(b.make, 50), model: str(b.model, 50), year: str(b.year, 10),
    info: str(b.info, 2000),
  };
  const slotId = Number.parseInt(b.slotId, 10);
  const required = ['name', 'phone', 'email', 'make', 'model', 'year'];
  if (required.some(k => !d[k]) || !slotId) return res.status(400).json({ error: 'Please fill in all required fields and choose a time.' });
  if (!/^\S+@\S+\.\S+$/.test(d.email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  // Reserve the time and save the booking together, so two people can't get the same time
  const book = db.transaction(() => {
    const slot = db.prepare('SELECT * FROM availability WHERE id = ? AND booking_id IS NULL').get(slotId);
    if (!slot) return false;
    const now = saNow();
    if (slot.date < now.date || (slot.date === now.date && slot.start_time <= now.time)) return false;
    const info = db.prepare(`INSERT INTO bookings (name, phone, email, make, model, year, service_date, service_time, info)
                VALUES (@name, @phone, @email, @make, @model, @year, @service_date, @service_time, @info)`)
      .run({ ...d, service_date: slot.date, service_time: `${slot.start_time} – ${slot.end_time}` });
    db.prepare('UPDATE availability SET booking_id = ? WHERE id = ?').run(Number(info.lastInsertRowid), slot.id);
    return true;
  });
  if (!book()) return res.status(409).json({ error: 'Sorry, that time has just been taken. Please choose another.' });
  res.status(201).json({ ok: true });
});

// ---- Admin auth ------------------------------------------------------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const username = str(req.body?.username, 50);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const row = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.adminId = row.id;
    res.json({ ok: true, username: row.username });
  });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT username FROM admins WHERE id = ?').get(req.session.adminId);
  res.json({ username: row.username });
});

app.post('/api/admin/password', requireAdmin, (req, res) => {
  const current = typeof req.body?.current === 'string' ? req.body.current : '';
  const next = typeof req.body?.next === 'string' ? req.body.next : '';
  const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
  if (!bcrypt.compareSync(current, row.password_hash)) return res.status(400).json({ error: 'Current password is wrong' });
  if (next.length < 10) return res.status(400).json({ error: 'New password must be at least 10 characters' });
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 12), row.id);
  res.json({ ok: true });
});

// ---- Admin: bookings -------------------------------------------------------
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const s = req.query.status;
  const rows = STATUSES.includes(s)
    ? db.prepare('SELECT * FROM bookings WHERE status = ? ORDER BY id DESC').all(s)
    : db.prepare('SELECT * FROM bookings ORDER BY id DESC').all();
  res.json(rows);
});

app.patch('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const { status, notes } = req.body || {};
  const id = Number(req.params.id);
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE bookings SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?')
    .run(status ?? null, notes === undefined ? null : str(notes, 2000), id);
  // A cancelled booking gives its time back so someone else can book it
  if (status === 'cancelled') db.prepare('UPDATE availability SET booking_id = NULL WHERE booking_id = ?').run(id);
  res.json({ ok: true });
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE availability SET booking_id = NULL WHERE booking_id = ?').run(id);
  db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---- Admin: services & packages (same CRUD shape) --------------------------
function crud(table, cols, clean) {
  const base = `/api/admin/${table}`;
  const list = cols.join(', ');
  const named = cols.map(c => '@' + c).join(', ');
  const setters = cols.map(c => `${c} = @${c}`).join(', ');

  app.get(base, requireAdmin, (req, res) =>
    res.json(db.prepare(`SELECT * FROM ${table} ORDER BY sort_order, id`).all()));

  app.post(base, requireAdmin, (req, res) => {
    const d = clean(req.body || {});
    if (!d) return res.status(400).json({ error: 'Please fill in all fields' });
    const info = db.prepare(`INSERT INTO ${table} (${list}) VALUES (${named})`).run(d);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  app.put(`${base}/:id`, requireAdmin, (req, res) => {
    const d = clean(req.body || {});
    if (!d) return res.status(400).json({ error: 'Please fill in all fields' });
    db.prepare(`UPDATE ${table} SET ${setters} WHERE id = @id`).run({ ...d, id: Number(req.params.id) });
    res.json({ ok: true });
  });

  app.delete(`${base}/:id`, requireAdmin, (req, res) => {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  });
}

const order = b => Number.parseInt(b.sort_order, 10) || 0;
crud('services', ['name', 'price', 'sort_order', 'active'], b => {
  const name = str(b.name, 120), price = str(b.price, 60);
  return name && price ? { name, price, sort_order: order(b), active: b.active ? 1 : 0 } : null;
});
crud('packages', ['name', 'items', 'price', 'sort_order', 'active'], b => {
  const name = str(b.name, 120), items = str(b.items, 1000), price = str(b.price, 60);
  return name && items && price ? { name, items, price, sort_order: order(b), active: b.active ? 1 : 0 } : null;
});

// ---- Admin: availability ---------------------------------------------------
const validDate = s => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const toMin = t => { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hhmm = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
const DAY = 86400000;

app.get('/api/admin/availability', requireAdmin, (req, res) => {
  res.json(db.prepare(`SELECT a.id, a.date, a.start_time, a.end_time, a.booking_id, b.name AS customer
    FROM availability a LEFT JOIN bookings b ON b.id = a.booking_id
    WHERE a.date >= ? ORDER BY a.date, a.start_time`).all(saNow().date));
});

// Add times: a date (or date range), the days of the week, a time window and how long each slot is
app.post('/api/admin/availability', requireAdmin, (req, res) => {
  const b = req.body || {};
  const startDate = str(b.startDate, 10);
  const endDate = str(b.endDate, 10) || startDate;
  const from = toMin(str(b.from, 5)), to = toMin(str(b.to, 5));
  const length = Number.parseInt(b.length, 10);
  const days = Array.isArray(b.weekdays) ? b.weekdays.map(Number).filter(n => n >= 0 && n <= 6) : [];

  if (!validDate(startDate) || !validDate(endDate)) return res.status(400).json({ error: 'Please choose valid dates.' });
  if (endDate < startDate) return res.status(400).json({ error: 'The end date must be on or after the start date.' });
  if (startDate < saNow().date) return res.status(400).json({ error: "You can't add times in the past." });
  if (from === null || to === null || to <= from) return res.status(400).json({ error: 'Please enter a start time and a later end time.' });
  if (!(length >= 15 && length <= 720)) return res.status(400).json({ error: 'Please choose how long each time slot is.' });
  if (!days.length) return res.status(400).json({ error: 'Pick at least one day of the week.' });
  const first = Date.parse(startDate + 'T00:00:00Z'), last = Date.parse(endDate + 'T00:00:00Z');
  if ((last - first) / DAY > 92) return res.status(400).json({ error: 'Please add three months or less at a time.' });

  const ins = db.prepare('INSERT OR IGNORE INTO availability (date, start_time, end_time) VALUES (?, ?, ?)');
  let added = 0;
  db.transaction(() => {
    for (let t = first; t <= last; t += DAY) {
      const day = new Date(t);
      if (!days.includes(day.getUTCDay())) continue;
      const date = day.toISOString().slice(0, 10);
      for (let m = from; m + length <= to; m += length) added += ins.run(date, hhmm(m), hhmm(m + length)).changes;
    }
  })();
  res.json({ added });
});

// Remove every FREE time on one day (booked times stay)
app.delete('/api/admin/availability/day/:date', requireAdmin, (req, res) => {
  if (!validDate(req.params.date)) return res.status(400).json({ error: 'Invalid date' });
  db.prepare('DELETE FROM availability WHERE date = ? AND booking_id IS NULL').run(req.params.date);
  res.json({ ok: true });
});

// Remove one free time
app.delete('/api/admin/availability/:id', requireAdmin, (req, res) => {
  const r = db.prepare('DELETE FROM availability WHERE id = ? AND booking_id IS NULL').run(Number(req.params.id));
  if (!r.changes) return res.status(409).json({ error: 'That time is booked. Cancel or delete the booking first.' });
  res.json({ ok: true });
});

// ---- Customer reviews ------------------------------------------------------
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many reviews from this connection. Please try again later.' },
});
const REVIEW_STATUSES = ['pending', 'approved', 'hidden'];

// Public: only approved reviews
app.get('/api/reviews', (req, res) => {
  const reviews = db.prepare(`SELECT id, name, rating, comment, created_at FROM reviews
    WHERE status = 'approved' ORDER BY id DESC LIMIT 100`).all();
  const stats = db.prepare("SELECT COUNT(*) AS count, AVG(rating) AS avg FROM reviews WHERE status = 'approved'").get();
  res.json({ count: stats.count, average: stats.count ? Math.round(stats.avg * 10) / 10 : 0, reviews });
});

// Public: a new review waits for your approval
app.post('/api/reviews', reviewLimiter, (req, res) => {
  const b = req.body || {};
  if (b.website) return res.status(201).json({ ok: true });   // hidden field only bots fill in
  const name = str(b.name, 60), comment = str(b.comment, 1000);
  const rating = Number.parseInt(b.rating, 10);
  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Please choose a star rating.' });
  if (comment.length < 10) return res.status(400).json({ error: 'Please write a little more (at least 10 characters).' });
  db.prepare('INSERT INTO reviews (name, rating, comment) VALUES (?, ?, ?)').run(name, rating, comment);
  res.status(201).json({ ok: true });
});

app.get('/api/admin/reviews', requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM reviews ORDER BY (status = 'pending') DESC, id DESC").all());
});

app.patch('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!REVIEW_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  res.json({ ok: true });
});

app.delete('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM reviews WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---- React production build ------------------------------------------------
// Development: Vite runs on :5173 and forwards /api to this Express server.
// Production: Express serves Vite's compiled assets from dist/ on the same origin.
const dist = path.join(__dirname, '..', 'dist');
const fs = require('fs');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { index: false }));
  // Existing links from the original HTML website remain usable.
  const oldPaths = {
    '/HOME.html': '/', '/About.html': '/about', '/Contact.html': '/contact',
    '/services.html': '/services', '/Reviews.html': '/reviews', '/FAQ.html': '/faq',
  };
  for (const [oldPath, newPath] of Object.entries(oldPaths)) {
    app.get(oldPath, (req, res) => res.redirect(301, newPath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));
  }
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API endpoint not found' });
    if (!req.accepts('html')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  console.warn('No dist/ build found. For local development open http://localhost:5173 or run npm run build.');
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));
}
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: 'Something went wrong' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Ice Cold Auto Aircon API on http://localhost:${PORT}  (admin: /admin)`));
}
module.exports = app;
