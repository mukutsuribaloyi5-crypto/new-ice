// No network dependencies required for structural checks.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = name => fs.readFileSync(path.join(root, name), 'utf8');
test('React mount, pages, and admin exist', () => {
  assert.match(file('client/src/main.jsx'), /createRoot/);
  for (const page of ['Home','About','Contact','Services','FAQ','Reviews','Admin']) assert.ok(fs.existsSync(path.join(root, `client/src/pages/${page}.jsx`)));
});
test('Node backend retains booking and admin API endpoints', () => {
  const src = file('server/index.js');
  for (const endpoint of ['/api/bookings','/api/availability','/api/reviews','/api/admin/login']) assert.ok(src.includes(endpoint));
  assert.match(src, /express\.static\(dist/);
});
test('private files are excluded from published package', () => {
  assert.ok(!fs.existsSync(path.join(root, '.env')));
  assert.ok(!fs.existsSync(path.join(root, 'data', 'data.db')));
});
