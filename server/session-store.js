// Persistent Express session store in the same SQLite database as business data.
// Avoids MemoryStore in production, where sessions would be lost on restart.
const session = require('express-session');
const db = require('./db');

class SQLiteSessionStore extends session.Store {
  constructor() {
    super();
    db.exec(`CREATE TABLE IF NOT EXISTS web_sessions (
      sid TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
    this.select = db.prepare('SELECT json, expires_at FROM web_sessions WHERE sid = ?');
    this.insert = db.prepare('INSERT INTO web_sessions (sid, json, expires_at) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET json = excluded.json, expires_at = excluded.expires_at');
    this.delete = db.prepare('DELETE FROM web_sessions WHERE sid = ?');
    this.cleanup = db.prepare('DELETE FROM web_sessions WHERE expires_at <= ?');
    this.refresh = db.prepare('UPDATE web_sessions SET expires_at = ? WHERE sid = ?');
    this.cleanup.run(Date.now());
    this.timer = setInterval(() => this.cleanup.run(Date.now()), 60 * 60 * 1000);
    this.timer.unref?.();
  }
  get(sid, callback) {
    try {
      const row = this.select.get(sid);
      if (!row || row.expires_at <= Date.now()) {
        if (row) this.delete.run(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.json));
    } catch (err) { callback(err); }
  }
  set(sid, sess, callback) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 8 * 60 * 60 * 1000;
      this.insert.run(sid, JSON.stringify(sess), expires);
      callback?.(null);
    } catch (err) { callback?.(err); }
  }
  touch(sid, sess, callback) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 8 * 60 * 60 * 1000;
      this.refresh.run(expires, sid);
      callback?.(null);
    } catch (err) { callback?.(err); }
  }
  destroy(sid, callback) {
    try { this.delete.run(sid); callback?.(null); }
    catch (err) { callback?.(err); }
  }
}
module.exports = SQLiteSessionStore;
