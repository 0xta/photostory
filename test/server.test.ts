// test/server.test.ts — HTTP integration test
import assert from 'node:assert/strict';
import app from '../server/index.js';

console.log('🧪 Starting Server HTTP Integration tests...\n');

// Wait for Fastify ready
await app.ready();

// 1. Test GET /api/health
const healthRes = await app.inject({
  method: 'GET',
  url: '/api/health',
});
assert.equal(healthRes.statusCode, 200);
const health = JSON.parse(healthRes.body);
assert.equal(health.status, 'ok');
assert.equal(health.phase, '1A');
console.log('✓ GET /api/health: 200 OK ->', healthRes.body);

// 2. Test GET /api/settings
const settingsRes = await app.inject({
  method: 'GET',
  url: '/api/settings',
});
assert.equal(settingsRes.statusCode, 200);
const settings = JSON.parse(settingsRes.body);
assert.ok(settings.theme, 'Should have theme setting');
console.log('✓ GET /api/settings: 200 OK, theme =', settings.theme);

// 3. Test PATCH /api/settings (theme switching)
const patchRes = await app.inject({
  method: 'PATCH',
  url: '/api/settings',
  payload: { theme: 'warm' },
});
assert.equal(patchRes.statusCode, 200);
const patched = JSON.parse(patchRes.body);
assert.equal(patched.theme, 'warm');
console.log('✓ PATCH /api/settings (theme -> warm): 200 OK');

// Switch back to dark
await app.inject({
  method: 'PATCH',
  url: '/api/settings',
  payload: { theme: 'dark' },
});

// 4. Test GET / (serves index.html)
const indexRes = await app.inject({
  method: 'GET',
  url: '/',
});
assert.equal(indexRes.statusCode, 200);
assert.ok(indexRes.body.includes('เรื่องราว 2026'), 'Should contain app title');
assert.ok(indexRes.body.includes('data-theme="dark"'), 'Should contain theme attribute');
console.log('✓ GET /: 200 OK, index.html served properly');

// 5. Test GET /style.css
const cssRes = await app.inject({
  method: 'GET',
  url: '/style.css',
});
assert.equal(cssRes.statusCode, 200);
assert.ok(cssRes.body.includes('[data-theme="warm"]'), 'Should contain warm theme styles');
assert.ok(cssRes.body.includes('[data-theme="light"]'), 'Should contain light theme styles');
assert.ok(cssRes.body.includes('[data-theme="dark"]'), 'Should contain dark theme styles');
console.log('✓ GET /style.css: 200 OK, all 3 themes included in stylesheet');

await app.close();
console.log('\n🎉 All Server HTTP integration tests PASSED!\n');
