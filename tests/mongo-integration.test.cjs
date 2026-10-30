const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

test('MongoDB API, transactions, persistence, and admin sessions', { timeout: 180000 }, async t => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = 'ice_test';
  process.env.ADMIN_USER = 'test-admin';
  process.env.ADMIN_PASSWORD = 'test-password-for-mongo';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters';
  process.env.NODE_ENV = 'production';
  const db = require('../server/db');
  const app = require('../server/index');
  let server;
  let base;
  let cookie = '';
  async function listen() {
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  }
  async function request(path, method = 'GET', body, authenticated = false) {
    const response = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', 'X-Forwarded-Proto': 'https', ...(authenticated ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.headers.get('set-cookie')) {
      assert.match(response.headers.get('set-cookie'), /Secure/);
      assert.match(response.headers.get('set-cookie'), /HttpOnly/);
      assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
      cookie = response.headers.get('set-cookie').split(';')[0];
    }
    return { status: response.status, body: await response.json() };
  }
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.close();
    await mongo.stop();
  });
  await db.connect();
  await listen();

  await t.test('health, defaults, auth, and session expiration', async () => {
    assert.equal((await request('/health')).status, 200);
    const catalog = (await request('/services')).body;
    assert.equal(catalog.services.length, 10);
    assert.equal(catalog.packages.length, 3);
    assert.ok(Array.isArray(catalog.packages[0].items));
    assert.equal((await request('/admin/bookings')).status, 401);
    assert.equal((await request('/admin/login', 'POST', { username: 'test-admin', password: 'wrong' })).status, 401);
    assert.equal((await request('/admin/login', 'POST', { username: 'test-admin', password: process.env.ADMIN_PASSWORD })).status, 200);
    assert.equal((await request('/admin/me', 'GET', undefined, true)).body.username, 'test-admin');
    const row = await db.collection('web_sessions').findOne({});
    const Store = require('../server/session-store');
    const store = new Store();
    await new Promise((resolve, reject) => store.set('expired', { cookie: { expires: new Date(0) }, adminId: 1 }, err => err ? reject(err) : resolve()));
    assert.equal(await new Promise((resolve, reject) => store.get('expired', (err, value) => err ? reject(err) : resolve(value))), null);
    assert.ok(row.expires_at instanceof Date);
    const indexes = await db.collection('web_sessions').indexes();
    assert.ok(indexes.some(i => i.expireAfterSeconds === 0));
  });

  let slotId, bookingId;
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const availability = { startDate: date, endDate: date, weekdays: [0, 1, 2, 3, 4, 5, 6], from: '09:00', to: '11:00', length: 60 };
  const details = { name: 'Test Customer', phone: '0123456789', email: 'customer@example.com', make: 'Toyota', model: 'Corolla', year: '2020' };
  await t.test('availability is unique and concurrent bookings reserve only once', async () => {
    assert.equal((await request('/admin/availability', 'POST', availability, true)).body.added, 2);
    assert.equal((await request('/admin/availability', 'POST', availability, true)).body.added, 0);
    slotId = (await request('/availability')).body[0].id;
    const responses = await Promise.all(Array.from({ length: 4 }, () => request('/bookings', 'POST', { ...details, slotId })));
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 409, 409, 409]);
    assert.equal(await db.collection('bookings').countDocuments(), 1);
    assert.equal((await request('/availability')).body.length, 1);
    const slots = (await request('/admin/availability', 'GET', undefined, true)).body;
    const booked = slots.find(s => s.id === slotId);
    assert.equal(booked.customer, details.name);
    bookingId = booked.booking_id;
    assert.equal((await request(`/admin/availability/${slotId}`, 'DELETE', undefined, true)).status, 409);
    assert.equal((await request('/bookings', 'POST', { ...details, slotId: 'invalid' })).status, 400);
  });

  await t.test('failed booking transaction leaves the slot free', async () => {
    const freeSlot = (await request('/availability')).body[0];
    await assert.rejects(db.transaction(async session => {
      await db.collection('availability').updateOne({ id: freeSlot.id }, { $set: { booking_id: 9999 } }, { session });
      throw new Error('Simulated write failure');
    }), /Simulated/);
    assert.equal((await db.collection('availability').findOne({ id: freeSlot.id })).booking_id, null);
  });

  await t.test('cancellation and deletion release reservations safely', async () => {
    assert.equal((await request(`/admin/bookings/${bookingId}`, 'PATCH', { notes: 'Customer called', status: 'confirmed' }, true)).status, 200);
    assert.equal((await request('/admin/bookings?status=confirmed', 'GET', undefined, true)).body[0].notes, 'Customer called');
    assert.equal((await request(`/admin/bookings/${bookingId}`, 'PATCH', { status: 'cancelled' }, true)).status, 200);
    assert.equal((await request('/availability')).body.length, 2);
    assert.equal((await request('/bookings', 'POST', { ...details, slotId })).status, 201);
    assert.equal((await request(`/admin/bookings/${bookingId}`, 'PATCH', { status: 'confirmed' }, true)).status, 409);
    await request(`/admin/bookings/${bookingId}`, 'DELETE', undefined, true);
    // Deleting the old cancelled booking must not release the new customer's reservation.
    assert.equal((await request('/availability')).body.length, 1);
    const current = await db.collection('availability').findOne({ id: slotId });
    await request(`/admin/bookings/${current.booking_id}`, 'DELETE', undefined, true);
    assert.equal((await request('/availability')).body.length, 2);
    await request(`/admin/availability/day/${date}`, 'DELETE', undefined, true);
    assert.equal((await request('/availability')).body.length, 0);
  });

  await t.test('catalog create, update, and delete', async () => {
    for (const kind of ['services', 'packages']) {
      const body = { name: 'Custom item', price: 'R200', items: 'One\nTwo', sort_order: 0, active: true };
      const created = await request(`/admin/${kind}`, 'POST', body, true);
      assert.equal(created.status, 201);
      assert.equal((await request(`/admin/${kind}/${created.body.id}`, 'PUT', { ...body, price: 'R250' }, true)).status, 200);
      const rows = (await request(`/admin/${kind}`, 'GET', undefined, true)).body;
      assert.equal(rows.find(r => r.id === created.body.id).price, 'R250');
      await request(`/admin/${kind}/${created.body.id}`, 'DELETE', undefined, true);
      assert.ok(!(await request(`/admin/${kind}`, 'GET', undefined, true)).body.some(r => r.id === created.body.id));
    }
  });

  await t.test('reviews stay private until approved, then aggregate correctly', async () => {
    assert.equal((await request('/reviews', 'POST', { name: 'Reviewer', rating: 5, comment: 'Excellent service and friendly staff.' })).status, 201);
    assert.equal((await request('/reviews')).body.count, 0);
    const pending = (await request('/admin/reviews', 'GET', undefined, true)).body[0];
    assert.equal(pending.status, 'pending');
    await request(`/admin/reviews/${pending.id}`, 'PATCH', { status: 'approved' }, true);
    const visible = (await request('/reviews')).body;
    assert.equal(visible.count, 1);
    assert.equal(visible.average, 5);
    await request(`/admin/reviews/${pending.id}`, 'PATCH', { status: 'hidden' }, true);
    assert.equal((await request('/reviews')).body.count, 0);
    await request(`/admin/reviews/${pending.id}`, 'DELETE', undefined, true);
  });

  await t.test('database reconnect preserves sessions, passwords, and catalog deletions', async () => {
    assert.equal((await request('/admin/password', 'POST', { current: process.env.ADMIN_PASSWORD, next: 'changed-password-for-test' }, true)).status, 200);
    await db.collection('packages').deleteMany({});
    await db.close();
    await db.connect();
    assert.equal((await request('/admin/me', 'GET', undefined, true)).status, 200);
    assert.equal((await request('/services')).body.packages.length, 0);
    await request('/admin/logout', 'POST', {}, true);
    assert.equal((await request('/admin/me', 'GET', undefined, true)).status, 401);
    assert.equal((await request('/admin/login', 'POST', { username: 'test-admin', password: 'changed-password-for-test' })).status, 200);
    assert.equal((await request('/admin/login', 'POST', { username: 'test-admin', password: process.env.ADMIN_PASSWORD })).status, 401);
  });

  await t.test('database outage returns an unhealthy status', async () => {
    await db.close();
    assert.equal((await request('/health')).status, 503);
  });
});
