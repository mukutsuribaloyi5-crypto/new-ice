const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const seeds = require('./seeds');
let client;
let database;
let connecting;

function collection(name) {
  if (!database) throw new Error('MongoDB is not connected');
  return database.collection(name);
}
async function nextId(name, session) {
  const counter = await collection('counters').findOneAndUpdate(
    { _id: name }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after', session });
  return counter.value;
}
async function transaction(work) {
  return client.withSession(session => session.withTransaction(() => work(session), {
    readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary',
  }));
}
async function initialize() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Set your MongoDB Atlas connection string in the environment.');
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  database = client.db(process.env.MONGODB_DB || 'ice_cold');
  // Fail early on standalone MongoDB: bookings require replica-set transactions (Atlas supports these).
  const hello = await database.command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('MongoDB must be a replica set or Atlas cluster to support booking transactions.');
  for (const name of ['admins', 'services', 'packages', 'bookings', 'availability', 'reviews']) {
    await collection(name).createIndex({ id: 1 }, { unique: true });
  }
  await collection('admins').createIndex({ username: 1 }, { unique: true });
  await collection('availability').createIndex({ date: 1, start_time: 1 }, { unique: true });
  await collection('availability').createIndex({ booking_id: 1 });
  await collection('reviews').createIndex({ status: 1, id: -1 });
  await collection('web_sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  // Seed once, atomically. Deleting every catalog item does not recreate it on restart.
  await transaction(async session => {
    if (await collection('metadata').findOne({ _id: 'initialized' }, { session })) return;
    if (!await collection('admins').findOne({}, { session })) {
      const username = process.env.ADMIN_USER || 'admin';
      const password = process.env.ADMIN_PASSWORD;
      if (!password || password.startsWith('replace-with-')) throw new Error('Set ADMIN_PASSWORD to a unique password before the first MongoDB startup.');
      await collection('admins').insertOne({ id: await nextId('admins', session), username,
        password_hash: await bcrypt.hash(password, 12) }, { session });
    }
    for (const name of ['services', 'packages']) {
      if (await collection(name).findOne({}, { session })) continue;
      for (const [index, values] of seeds[name].entries()) {
        const [title, second, third] = values;
        const item = name === 'services' ? { name: title, price: second } : { name: title, items: second, price: third };
        await collection(name).insertOne({ id: await nextId(name, session), ...item, sort_order: index, active: 1 }, { session });
      }
    }
    await collection('metadata').insertOne({ _id: 'initialized' }, { session });
  });
}
async function connect() {
  if (!connecting) connecting = initialize().catch(async err => { await close(); throw err; });
  return connecting;
}
async function close() {
  if (client) await client.close();
  client = undefined;
  database = undefined;
  connecting = undefined;
}
module.exports = { connect, close, collection, nextId, transaction, database: () => {
  if (!database) throw new Error('MongoDB is not connected');
  return database;
} };
