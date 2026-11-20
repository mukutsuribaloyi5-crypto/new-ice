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
test('private files are excluded from Git and Docker builds', () => {
  const { execFileSync } = require('node:child_process');
  for (const name of ['.env', 'data/data.db', '.local-run/dev.stdout.log']) {
    assert.equal(execFileSync('git', ['check-ignore', name], { cwd: root, encoding: 'utf8' }).trim().replaceAll('\\', '/'), name);
  }
  for (const name of ['.env', 'data', '.local-run']) assert.ok(file('.dockerignore').split(/\r?\n/).includes(name));
});
test('sales pop-up and gallery endpoints, pages and menu link exist', () => {
  const src = file('server/index.js');
  for (const endpoint of ['/api/sales', '/api/admin/sales', '/api/gallery', '/api/gallery/file/:id', '/api/admin/gallery']) assert.ok(src.includes(endpoint), endpoint);
  assert.match(src, /app\.post\('\/api\/admin\/gallery', requireAdmin/);   // uploads are admin-only
  assert.ok(fs.existsSync(path.join(root, 'client/src/pages/Gallery.jsx')));
  assert.ok(fs.existsSync(path.join(root, 'client/src/components/SalesPopup.jsx')));
  const layout = file('client/src/components/SiteLayout.jsx');
  assert.match(layout, /\['\/gallery', 'Gallery'\]/);
  assert.match(layout, /<SalesPopup/);
  assert.match(layout, /src="\/logo\.jpeg"/);
  assert.match(file('client/src/pages/Admin.jsx'), /src="\/logo\.jpeg"/);
  assert.ok(fs.existsSync(path.join(root, 'client/public/logo.jpeg')));
});
