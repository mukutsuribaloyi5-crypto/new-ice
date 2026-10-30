const session = require('express-session');
const db = require('./db');
const expiresAt = sess => sess.cookie?.expires ? new Date(sess.cookie.expires) : new Date(Date.now() + 8 * 60 * 60 * 1000);

class MongoSessionStore extends session.Store {
  get(sid, callback) {
    db.collection('web_sessions').findOne({ _id: sid, expires_at: { $gt: new Date() } })
      .then(row => callback(null, row ? JSON.parse(row.json) : null)).catch(callback);
  }
  set(sid, sess, callback = () => {}) {
    db.collection('web_sessions').updateOne({ _id: sid },
      { $set: { json: JSON.stringify(sess), expires_at: expiresAt(sess) } }, { upsert: true })
      .then(() => callback(null)).catch(callback);
  }
  touch(sid, sess, callback = () => {}) {
    db.collection('web_sessions').updateOne({ _id: sid }, { $set: { expires_at: expiresAt(sess) } })
      .then(() => callback(null)).catch(callback);
  }
  destroy(sid, callback = () => {}) {
    db.collection('web_sessions').deleteOne({ _id: sid }).then(() => callback(null)).catch(callback);
  }
}
module.exports = MongoSessionStore;
