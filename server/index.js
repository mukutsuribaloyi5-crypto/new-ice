require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const MongoSessionStore = require('./session-store');

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
let secret = process.env.SESSION_SECRET;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET not set - admin logins will reset on every restart.');
}
app.use(session({
  name: 'icac.sid',
  store: new MongoSessionStore(),
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: PROD, maxAge: 1000 * 60 * 60 * 8 },
}));

// ---- Helpers -------------------------------------------------------------
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const requireAdmin = (req, res, next) =>
  req.session.adminId ? next() : res.status(401).json({ error: 'Not logged in' });
const route = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const STATUSES = ['new', 'confirmed', 'completed', 'cancelled'];

async function emailBooking(booking) {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.BOOKING_EMAIL_FROM;
  if (!apiKey || !from) throw new Error('Booking email is not configured (set BREVO_API_KEY and BOOKING_EMAIL_FROM).');
  const senderMatch = from.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  const sender = senderMatch ? { name: senderMatch[1], email: senderMatch[2] } : { email: from.trim() };
  const textContent = [
    'A new booking request was submitted on the website.', '',
    `Name: ${booking.name}`, `Phone: ${booking.phone}`, `Email: ${booking.email}`,
    `Vehicle: ${booking.year} ${booking.make} ${booking.model}`,
    `Requested time: ${booking.service_date}, ${booking.service_time}`,
    '', 'Additional information:', booking.info || '(none)',
  ].join('\n');
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender, to: [{ email: 'bookings@icecoldauto.co.za' }], replyTo: { email: booking.email }, subject: `New booking request: ${booking.name} - ${booking.service_date}`, textContent }),
  });
  if (!response.ok) throw new Error(`Brevo rejected booking email (${response.status}): ${(await response.text()).slice(0, 500)}`);
}

app.get('/api/health', async (req, res) => {
  try { await db.database().command({ ping: 1 }); res.json({ status: 'ok' }); }
  catch { res.status(503).json({ status: 'unavailable' }); }
});

app.get('/api/services', route(async (req, res) => {
  const services = await db.collection('services').find({ active: 1 }, { projection: { _id: 0, id: 1, name: 1, price: 1 } }).sort({ sort_order: 1, id: 1 }).toArray();
  const packages = await db.collection('packages').find({ active: 1 }, { projection: { _id: 0, id: 1, name: 1, items: 1, price: 1 } }).sort({ sort_order: 1, id: 1 }).toArray();
  res.json({ services, packages: packages.map(p => ({ ...p, items: p.items.split('\n').map(s => s.trim()).filter(Boolean) })) });
}));

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
const futureSlots = () => {
  const now = saNow();
  return { $or: [{ date: { $gt: now.date } }, { date: now.date, start_time: { $gt: now.time } }] };
};
app.get('/api/availability', route(async (req, res) => {
  res.json(await db.collection('availability').find({ booking_id: null, ...futureSlots() }, { projection: { _id: 0, id: 1, date: 1, start_time: 1, end_time: 1 } }).sort({ date: 1, start_time: 1 }).toArray());
}));

app.post('/api/bookings', bookingLimiter, route(async (req, res) => {
  const b = req.body || {};
  const d = {
    name: str(b.name, 100), phone: str(b.phone, 30), email: str(b.email, 150),
    make: str(b.make, 50), model: str(b.model, 50), year: str(b.year, 10),
    info: str(b.info, 2000),
  };
  const slotId = Number(b.slotId);
  const required = ['name', 'phone', 'email', 'make', 'model', 'year'];
  if (required.some(k => !d[k]) || !Number.isSafeInteger(slotId) || slotId <= 0) return res.status(400).json({ error: 'Please fill in all required fields and choose a time.' });
  if (!/^\S+@\S+\.\S+$/.test(d.email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  // Both writes commit together; a racing request retries and sees the occupied slot.
  const booked = await db.transaction(async session => {
    const id = await db.nextId('bookings', session);
    const slot = await db.collection('availability').findOneAndUpdate(
      { id: slotId, booking_id: null, ...futureSlots() }, { $set: { booking_id: id } },
      { session, returnDocument: 'after' });
    if (!slot) return null;
    await db.collection('bookings').insertOne({ id, ...d, service_date: slot.date,
      service_time: `${slot.start_time} – ${slot.end_time}`, status: 'new', notes: '', created_at: new Date().toISOString() }, { session });
    return { ...d, service_date: slot.date, service_time: `${slot.start_time} - ${slot.end_time}` };
  });
  if (!booked) return res.status(409).json({ error: 'Sorry, that time has just been taken. Please choose another.' });
  let emailSent = true;
  try {
    await emailBooking(booked);
  } catch (err) {
    console.error('Booking email delivery failed:', err.message);
    emailSent = false;
  }
  res.status(201).json({ ok: true, emailSent });
}));

// ---- Admin auth ------------------------------------------------------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

app.post('/api/admin/login', loginLimiter, route(async (req, res) => {
  const username = str(req.body?.username, 50);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const row = await db.collection('admins').findOne({ username });
  if (!row || !await bcrypt.compare(password, row.password_hash)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.adminId = row.id;
    res.json({ ok: true, username: row.username });
  });
}));

app.post('/api/admin/logout', (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('icac.sid', { httpOnly: true, sameSite: 'strict', secure: PROD });
    res.json({ ok: true });
  });
});

app.get('/api/admin/me', requireAdmin, route(async (req, res) => {
  const row = await db.collection('admins').findOne({ id: req.session.adminId });
  if (!row) return res.status(401).json({ error: 'Not logged in' });
  res.json({ username: row.username });
}));

app.post('/api/admin/password', requireAdmin, route(async (req, res) => {
  const current = typeof req.body?.current === 'string' ? req.body.current : '';
  const next = typeof req.body?.next === 'string' ? req.body.next : '';
  const row = await db.collection('admins').findOne({ id: req.session.adminId });
  if (!row) return res.status(401).json({ error: 'Not logged in' });
  if (!await bcrypt.compare(current, row.password_hash)) return res.status(400).json({ error: 'Current password is wrong' });
  if (next.length < 10) return res.status(400).json({ error: 'New password must be at least 10 characters' });
  await db.collection('admins').updateOne({ id: row.id }, { $set: { password_hash: await bcrypt.hash(next, 12) } });
  res.json({ ok: true });
}));

// ---- Admin: bookings -------------------------------------------------------
app.get('/api/admin/bookings', requireAdmin, route(async (req, res) => {
  res.json(await db.collection('bookings').find(STATUSES.includes(req.query.status) ? { status: req.query.status } : {}, { projection: { _id: 0 } }).sort({ id: -1 }).toArray());
}));

app.patch('/api/admin/bookings/:id', requireAdmin, route(async (req, res) => {
  const { status, notes } = req.body || {};
  const id = Number(req.params.id);
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const result = await db.transaction(async session => {
    const booking = await db.collection('bookings').findOne({ id }, { session });
    if (!booking) return 404;
    // A cancelled reservation may already belong to another customer.
    if (booking.status === 'cancelled' && status && status !== 'cancelled') return 409;
    const update = {};
    if (status !== undefined) update.status = status;
    if (notes !== undefined) update.notes = str(notes, 2000);
    if (Object.keys(update).length) await db.collection('bookings').updateOne({ id }, { $set: update }, { session });
    if (status === 'cancelled') await db.collection('availability').updateOne({ booking_id: id }, { $set: { booking_id: null } }, { session });
    return 200;
  });
  if (result !== 200) return res.status(result).json({ error: result === 409 ? 'Cancelled bookings cannot be reopened. Create a new booking.' : 'Booking not found' });
  res.json({ ok: true });
}));

app.delete('/api/admin/bookings/:id', requireAdmin, route(async (req, res) => {
  const id = Number(req.params.id);
  await db.transaction(async session => {
    await db.collection('availability').updateOne({ booking_id: id }, { $set: { booking_id: null } }, { session });
    await db.collection('bookings').deleteOne({ id }, { session });
  });
  res.json({ ok: true });
}));



// ---- Admin: services & packages (same CRUD shape) --------------------------
function crud(table, clean) {
  const base = `/api/admin/${table}`;
  app.get(base, requireAdmin, route(async (req, res) => {
    res.json(await db.collection(table).find({}, { projection: { _id: 0 } }).sort({ sort_order: 1, id: 1 }).toArray());
  }));
  app.post(base, requireAdmin, route(async (req, res) => {
    const d = clean(req.body || {});
    if (!d) return res.status(400).json({ error: 'Please fill in all fields' });
    const id = await db.nextId(table);
    await db.collection(table).insertOne({ id, ...d });
    res.status(201).json({ id });
  }));
  app.put(`${base}/:id`, requireAdmin, route(async (req, res) => {
    const d = clean(req.body || {});
    if (!d) return res.status(400).json({ error: 'Please fill in all fields' });
    await db.collection(table).updateOne({ id: Number(req.params.id) }, { $set: d });
    res.json({ ok: true });
  }));
  app.delete(`${base}/:id`, requireAdmin, route(async (req, res) => {
    await db.collection(table).deleteOne({ id: Number(req.params.id) });
    res.json({ ok: true });
  }));
}



const order = b => Number.parseInt(b.sort_order, 10) || 0;
crud('services', b => {
  const name = str(b.name, 120), price = str(b.price, 60);
  return name && price ? { name, price, sort_order: order(b), active: b.active ? 1 : 0 } : null;
});
crud('packages', b => {
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

app.get('/api/admin/availability', requireAdmin, route(async (req, res) => {
  const rows = await db.collection('availability').aggregate([
    { $match: { date: { $gte: saNow().date } } }, { $sort: { date: 1, start_time: 1 } },
    { $lookup: { from: 'bookings', localField: 'booking_id', foreignField: 'id', as: 'booking' } },
    { $set: { customer: { $ifNull: [{ $arrayElemAt: ['$booking.name', 0] }, null] } } },
    { $project: { _id: 0, booking: 0 } }
  ]).toArray();
  res.json(rows);
}));



// Add times: a date (or date range), the days of the week, a time window and how long each slot is
app.post('/api/admin/availability', requireAdmin, route(async (req, res) => {
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

  let added = 0;
  for (let t = first; t <= last; t += DAY) {
    const day = new Date(t);
    if (!days.includes(day.getUTCDay())) continue;
    const date = day.toISOString().slice(0, 10);
    for (let m = from; m + length <= to; m += length) {
      const id = await db.nextId('availability');
      try {
        const result = await db.collection('availability').updateOne({ date, start_time: hhmm(m) },
          { $setOnInsert: { id, date, start_time: hhmm(m), end_time: hhmm(m + length), booking_id: null } }, { upsert: true });
        added += result.upsertedCount;
      } catch (err) { if (err.code !== 11000) throw err; }
    }
  }
  res.json({ added });
}));



// Remove every FREE time on one day (booked times stay)
app.delete('/api/admin/availability/day/:date', requireAdmin, route(async (req, res) => {
  if (!validDate(req.params.date)) return res.status(400).json({ error: 'Invalid date' });
  await db.collection('availability').deleteMany({ date: req.params.date, booking_id: null });
  res.json({ ok: true });
}));

// Remove one free time
app.delete('/api/admin/availability/:id', requireAdmin, route(async (req, res) => {
  const r = await db.collection('availability').deleteOne({ id: Number(req.params.id), booking_id: null });
  if (!r.deletedCount) return res.status(409).json({ error: 'That time is booked. Cancel or delete the booking first.' });
  res.json({ ok: true });
}));

// ---- Customer reviews ------------------------------------------------------
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many reviews from this connection. Please try again later.' },
});
const REVIEW_STATUSES = ['pending', 'approved', 'hidden'];

// Public: only approved reviews
app.get('/api/reviews', route(async (req, res) => {
  const reviews = await db.collection('reviews').find({ status: 'approved' }, { projection: { _id: 0, id: 1, name: 1, rating: 1, comment: 1, created_at: 1 } }).sort({ id: -1 }).limit(100).toArray();
  const [stats] = await db.collection('reviews').aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } }]).toArray();
  res.json({ count: stats?.count || 0, average: stats ? Math.round(stats.avg * 10) / 10 : 0, reviews });
}));



// Public: a new review waits for your approval
app.post('/api/reviews', reviewLimiter, route(async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.status(201).json({ ok: true });   // hidden field only bots fill in
  const name = str(b.name, 60), comment = str(b.comment, 1000);
  const rating = Number.parseInt(b.rating, 10);
  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Please choose a star rating.' });
  if (comment.length < 10) return res.status(400).json({ error: 'Please write a little more (at least 10 characters).' });
  await db.collection('reviews').insertOne({ id: await db.nextId('reviews'), name, rating, comment, status: 'pending', created_at: new Date().toISOString() });
  res.status(201).json({ ok: true });
}));

app.get('/api/admin/reviews', requireAdmin, route(async (req, res) => {
  res.json(await db.collection('reviews').aggregate([{ $set: { pending: { $eq: ['$status', 'pending'] } } }, { $sort: { pending: -1, id: -1 } }, { $project: { _id: 0, pending: 0 } }]).toArray());
}));

app.patch('/api/admin/reviews/:id', requireAdmin, route(async (req, res) => {
  const { status } = req.body || {};
  if (!REVIEW_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await db.collection('reviews').updateOne({ id: Number(req.params.id) }, { $set: { status } });
  res.json({ ok: true });
}));

app.delete('/api/admin/reviews/:id', requireAdmin, route(async (req, res) => {
  await db.collection('reviews').deleteOne({ id: Number(req.params.id) });
  res.json({ ok: true });
}));

// ---- Sales pop-up ----------------------------------------------------------
// Sales you post in Admin > Sales, as text or as a picture. Active, un-expired sales pop up when a visitor opens the site.
const cleanSale = async b => {
  const title = str(b.title, 120), ends_on = str(b.ends_on, 10);
  const kind = b.kind === 'image' ? 'image' : 'text';
  const base = { kind, title, ends_on, active: b.active ? 1 : 0, updated_at: new Date().toISOString() };
  if (!title) return { error: kind === 'image' ? 'Please enter a short name for this sale.' : 'Please enter a title and a message.' };
  if (ends_on && !validDate(ends_on)) return { error: 'Please choose a valid end date.' };
  if (kind === 'text') {
    const message = str(b.message, 1000);
    if (!message) return { error: 'Please enter a title and a message.' };
    return { data: { ...base, message, image_id: null } };
  }
  const imageId = Number(b.image_id);
  const image = Number.isSafeInteger(imageId) && await db.collection('sale_images').findOne({ id: imageId });
  if (!image) return { error: 'Please choose a picture for this sale.' };
  return { data: { ...base, message: '', image_id: imageId } };
};
const saleOut = s => ({
  id: s.id, kind: s.kind || 'text', title: s.title, message: s.message || '', ends_on: s.ends_on || '', updated_at: s.updated_at,
  image_url: s.kind === 'image' && s.image_id ? `/api/sales/image/${s.image_id}` : null,
});
async function deleteSaleImage(imageId) {
  if (!imageId) return;
  const image = await db.collection('sale_images').findOneAndDelete({ id: imageId });
  if (image) await db.bucket().delete(image.file_id).catch(() => {});
}

app.get('/api/sales', route(async (req, res) => {
  const today = saNow().date;
  const sales = await db.collection('sales').find(
    { active: 1, $or: [{ ends_on: '' }, { ends_on: { $gte: today } }] },
    { projection: { _id: 0, id: 1, kind: 1, title: 1, message: 1, ends_on: 1, updated_at: 1, image_id: 1 } }).sort({ id: -1 }).limit(5).toArray();
  res.set('Cache-Control', 'no-store').json(sales.map(saleOut));
}));

app.get('/api/admin/sales', requireAdmin, route(async (req, res) => {
  const sales = await db.collection('sales').find({}, { projection: { _id: 0 } }).sort({ id: -1 }).toArray();
  res.json(sales.map(s => ({ ...saleOut(s), active: s.active, image_id: s.image_id || null })));
}));

app.post('/api/admin/sales', requireAdmin, route(async (req, res) => {
  const { data, error } = await cleanSale(req.body || {});
  if (error) return res.status(400).json({ error });
  const id = await db.nextId('sales');
  await db.collection('sales').insertOne({ id, ...data, created_at: data.updated_at });
  res.status(201).json({ id });
}));

app.put('/api/admin/sales/:id', requireAdmin, route(async (req, res) => {
  const { data, error } = await cleanSale(req.body || {});
  if (error) return res.status(400).json({ error });
  const before = await db.collection('sales').findOneAndUpdate({ id: Number(req.params.id) }, { $set: data }, { returnDocument: 'before' });
  if (!before) return res.status(404).json({ error: 'Sale not found' });
  if (before.image_id && before.image_id !== data.image_id) await deleteSaleImage(before.image_id);   // picture was replaced or sale became text
  res.json({ ok: true });
}));

app.delete('/api/admin/sales/:id', requireAdmin, route(async (req, res) => {
  const sale = await db.collection('sales').findOneAndDelete({ id: Number(req.params.id) });
  if (sale) await deleteSaleImage(sale.image_id);
  res.json({ ok: true });
}));

// ---- Gallery (pictures and videos) -----------------------------------------
// Files are stored in MongoDB GridFS. Each upload is one file sent as the raw request body.
const startsWith = (b, text, at = 0) => b.subarray(at, at + text.length).toString('latin1') === text;
const MOV_BOXES = ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'];
const MEDIA = {
  'image/jpeg': { type: 'image', maxMB: 15, ok: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { type: 'image', maxMB: 15, ok: b => b[0] === 0x89 && startsWith(b, 'PNG', 1) },
  'image/gif': { type: 'image', maxMB: 15, ok: b => startsWith(b, 'GIF8') },
  'image/webp': { type: 'image', maxMB: 15, ok: b => startsWith(b, 'RIFF') && startsWith(b, 'WEBP', 8) },
  'video/mp4': { type: 'video', maxMB: 60, ok: b => startsWith(b, 'ftyp', 4) },
  'video/quicktime': { type: 'video', maxMB: 60, ok: b => MOV_BOXES.some(t => startsWith(b, t, 4)) },
  'video/webm': { type: 'video', maxMB: 60, ok: b => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
};
const galleryItem = g => ({ id: g.id, type: g.type, title: g.title || '', created_at: g.created_at, url: `/api/gallery/file/${g.id}` });
const listGallery = route(async (req, res) => {
  const rows = await db.collection('gallery').find({}, { projection: { _id: 0, id: 1, type: 1, title: 1, created_at: 1 } }).sort({ id: -1 }).toArray();
  res.json(rows.map(galleryItem));
});
app.get('/api/gallery', listGallery);
app.get('/api/admin/gallery', requireAdmin, listGallery);

// Streams a file, with Range support so videos can be played and skipped through.
app.get('/api/gallery/file/:id', route(async (req, res) => {
  const item = await db.collection('gallery').findOne({ id: Number(req.params.id) });
  if (!item) return res.status(404).json({ error: 'File not found' });
  const size = item.size;
  let start = 0, end = size - 1, status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.get('range') || '');
  if (range && (range[1] || range[2])) {
    if (range[1] === '') start = Math.max(size - Number(range[2]), 0);
    else { start = Number(range[1]); if (range[2] !== '') end = Math.min(Number(range[2]), size - 1); }
    if (start > end || start >= size) return res.status(416).set('Content-Range', `bytes */${size}`).end();
    status = 206;
  }
  res.status(status).set({
    'Content-Type': item.mime, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
    ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  });
  const stream = db.bucket().openDownloadStream(item.file_id, { start, end: end + 1 });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}));

app.post('/api/admin/gallery', requireAdmin, express.raw({ type: Object.keys(MEDIA), limit: '60mb' }), route(async (req, res) => {
  const mime = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const spec = MEDIA[mime];
  const buf = req.body;
  if (!spec || !Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'Unsupported file. Use JPG, PNG, WebP, GIF, MP4, WebM or MOV.' });
  if (buf.length > spec.maxMB * 1024 * 1024) return res.status(413).json({ error: `That file is too large (${spec.type}s can be up to ${spec.maxMB} MB).` });
  if (!spec.ok(buf)) return res.status(400).json({ error: 'That file does not look like a real picture or video.' });
  const fileId = await new Promise((resolve, reject) => {
    const upload = db.bucket().openUploadStream(`gallery-${Date.now()}`, { contentType: mime });
    upload.on('error', reject);
    upload.on('finish', () => resolve(upload.id));
    upload.end(buf);
  });
  try {
    const id = await db.nextId('gallery');
    await db.collection('gallery').insertOne({ id, type: spec.type, mime, size: buf.length, file_id: fileId, title: str(req.query.title, 120), created_at: new Date().toISOString() });
    res.status(201).json({ id });
  } catch (err) {
    await db.bucket().delete(fileId).catch(() => {});
    throw err;
  }
}));

app.delete('/api/admin/gallery/:id', requireAdmin, route(async (req, res) => {
  const item = await db.collection('gallery').findOneAndDelete({ id: Number(req.params.id) });
  if (item) await db.bucket().delete(item.file_id).catch(() => {});
  res.json({ ok: true });
}));

// ---- Sale pictures (the "picture" kind of sale) ----------------------------
const IMAGE_TYPES = Object.keys(MEDIA).filter(k => MEDIA[k].type === 'image');
app.post('/api/admin/sales/image', requireAdmin, express.raw({ type: IMAGE_TYPES, limit: '15mb' }), route(async (req, res) => {
  const mime = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const spec = IMAGE_TYPES.includes(mime) ? MEDIA[mime] : null;
  const buf = req.body;
  if (!spec || !Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'Unsupported file. Use a JPG, PNG, WebP or GIF picture.' });
  if (buf.length > spec.maxMB * 1024 * 1024) return res.status(413).json({ error: `That picture is too large (up to ${spec.maxMB} MB).` });
  if (!spec.ok(buf)) return res.status(400).json({ error: 'That file does not look like a real picture.' });
  const fileId = await new Promise((resolve, reject) => {
    const upload = db.bucket().openUploadStream(`sale-${Date.now()}`, { contentType: mime });
    upload.on('error', reject);
    upload.on('finish', () => resolve(upload.id));
    upload.end(buf);
  });
  try {
    const id = await db.nextId('sale_images');
    await db.collection('sale_images').insertOne({ id, mime, size: buf.length, file_id: fileId, created_at: new Date().toISOString() });
    res.status(201).json({ image_id: id });
  } catch (err) {
    await db.bucket().delete(fileId).catch(() => {});
    throw err;
  }
}));

app.get('/api/sales/image/:id', route(async (req, res) => {
  const image = await db.collection('sale_images').findOne({ id: Number(req.params.id) });
  if (!image) return res.status(404).json({ error: 'Picture not found' });
  res.set({ 'Content-Type': image.mime, 'Content-Length': image.size, 'Cache-Control': 'public, max-age=86400' });
  const stream = db.bucket().openDownloadStream(image.file_id);
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}));

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
  if (err.status === 413) return res.status(413).json({ error: 'That file is too large (pictures up to 15 MB, videos up to 60 MB).' });
  res.status(err.status || 500).json({ error: 'Something went wrong' });
});

async function start() {
  await db.connect();
  return app.listen(PORT, () => console.log(`Ice Cold Auto Aircon API listening on port ${PORT}`));
}
if (require.main === module) {
  start().catch(async err => {
    console.error('Backend startup failed:', err.message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/g, '[MongoDB URI]'));
    await db.close();
    process.exitCode = 1;
  });
}
module.exports = app;
module.exports.start = start;
