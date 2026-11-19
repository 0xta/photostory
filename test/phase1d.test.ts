// test/phase1d.test.ts — Phase 1D Frontend Verification Test Suite
process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import app from '../server/index.js';

console.log('🧪 Starting Phase 1D Verification Tests (Frontend & Themes)...\n');

async function runTests() {
  await app.ready();

  // ── 1. Static Asset Serving ─────────────────────────────────
  console.log('Test 1: Static assets served correctly by Fastify');
  const indexRes = await app.inject({ method: 'GET', url: '/' });
  assert.strictEqual(indexRes.statusCode, 200);
  assert.match(indexRes.headers['content-type'] || '', /text\/html/);
  assert(indexRes.body.includes('<!DOCTYPE html>'));
  assert(indexRes.body.includes('เรื่องราว 2026'));

  const cssRes = await app.inject({ method: 'GET', url: '/style.css' });
  assert.strictEqual(cssRes.statusCode, 200);
  assert.match(cssRes.headers['content-type'] || '', /text\/css/);
  assert(cssRes.body.includes('--bg:'));
  assert(cssRes.body.includes('[data-theme="light"]'));
  assert(cssRes.body.includes('[data-theme="warm"]'));

  const jsRes = await app.inject({ method: 'GET', url: '/app.js' });
  assert.strictEqual(jsRes.statusCode, 200);
  assert.match(jsRes.headers['content-type'] || '', /application\/javascript|text\/javascript/);
  assert(jsRes.body.includes('CATEGORIES'));
  assert(jsRes.body.includes('switchTab'));
  console.log('  ✔ Static assets served with correct Content-Type (HTML, CSS, JS)');

  // ── 2. Theme Definitions & Styling Rules ────────────────────
  console.log('Test 2: Three Visual Themes in style.css');
  const cssContent = fs.readFileSync(path.resolve('public/style.css'), 'utf-8');
  assert(cssContent.includes('[data-theme="light"]'), 'Must include light theme styles');
  assert(cssContent.includes('[data-theme="warm"]'), 'Must include warm theme styles');
  assert(cssContent.includes(':root') || cssContent.includes('[data-theme="dark"]'), 'Must include dark theme styles');
  assert(cssContent.includes('micPulse'), 'Must include micPulse animation for voice input');
  assert(cssContent.includes('@media'), 'Must include responsive media queries');
  console.log('  ✔ All 3 themes (Light, Warm, Dark) and animation keyframes verified');

  // ── 3. HTML Structural Elements & Modals ────────────────────
  console.log('Test 3: HTML Structure & View Modals');
  const htmlContent = fs.readFileSync(path.resolve('public/index.html'), 'utf-8');

  // Tabs
  assert(htmlContent.includes('data-tab="dashboard"'));
  assert(htmlContent.includes('data-tab="events"'));
  assert(htmlContent.includes('data-tab="photos"'));
  assert(htmlContent.includes('data-tab="friends"'));
  assert(htmlContent.includes('data-tab="map"'));

  // Dashboard components
  assert(htmlContent.includes('id="stat-photos"'));
  assert(htmlContent.includes('id="stat-events"'));
  assert(htmlContent.includes('id="stat-friends"'));
  assert(htmlContent.includes('id="stat-tagged-pct"'));
  assert(htmlContent.includes('id="dashboard-histogram"'));
  assert(htmlContent.includes('id="dashboard-queue"'));
  assert(htmlContent.includes('id="btn-jump-dateless"'));
  assert(htmlContent.includes('id="btn-jump-unnamed"'));
  assert(htmlContent.includes('id="btn-jump-burst"'));

  // Events View
  assert(htmlContent.includes('id="events-dateless-tray"'));
  assert(htmlContent.includes('id="events-list"'));
  assert(htmlContent.includes('id="btn-recluster"'));

  // Photos View & Filters
  assert(htmlContent.includes('id="filter-cats"'));
  assert(htmlContent.includes('id="filter-friend"'));
  assert(htmlContent.includes('id="filter-month"'));
  assert(htmlContent.includes('id="filter-gps"'));
  assert(htmlContent.includes('id="filter-burst"'));
  assert(htmlContent.includes('id="photos-list"'));

  // Friends View
  assert(htmlContent.includes('id="friends-list"'));
  assert(htmlContent.includes('id="btn-add-friend"'));

  // Modals
  assert(htmlContent.includes('id="modal-photo"'));
  assert(htmlContent.includes('id="modal-event"'));
  assert(htmlContent.includes('id="modal-friend-detail"'));
  assert(htmlContent.includes('id="modal-add-friend"'));
  assert(htmlContent.includes('id="modal-import"'));
  assert(htmlContent.includes('id="overlay-progress"'));

  // Thai Voice input buttons
  assert(htmlContent.includes('id="btn-voice-photo-note"'));
  assert(htmlContent.includes('id="btn-voice-event-name"'));
  assert(htmlContent.includes('id="btn-voice-event-place"'));
  assert(htmlContent.includes('id="btn-voice-event-note"'));
  assert(htmlContent.includes('id="btn-voice-friend-name"'));
  console.log('  ✔ All required views, controls, modals, and voice buttons present in HTML');

  // ── 4. Frontend Logic Verification (app.js) ─────────────────
  console.log('Test 4: Frontend Logic (Categories, Speech, Nav)');
  const jsContent = fs.readFileSync(path.resolve('public/app.js'), 'utf-8');

  // Appendix B categories
  const expectedCategories = ['อาหาร', 'บรรยากาศ', 'สไลด์', 'ตัวฉัน', 'เพื่อน', 'สถาปัตยกรรม', 'อื่นๆ'];
  for (const cat of expectedCategories) {
    assert(jsContent.includes(cat), `Category '${cat}' must be defined in app.js`);
  }

  // Appendix C Thai month abbreviations
  const expectedMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  for (const mon of expectedMonths) {
    assert(jsContent.includes(mon), `Month '${mon}' must be defined in app.js`);
  }

  // Keyboard navigation & speech support
  assert(jsContent.includes('keydown'), 'Must listen to keyboard navigation events');
  assert(jsContent.includes('ArrowLeft') && jsContent.includes('ArrowRight'), 'Must support prev/next photo navigation');
  assert(jsContent.includes('Escape'), 'Must support Escape key to close modals');
  assert(jsContent.includes('webkitSpeechRecognition') || jsContent.includes('SpeechRecognition'), 'Must support Web Speech API');
  console.log('  ✔ Categories, Thai month formats, Speech API fallback, and keyboard navigation verified');

  console.log('\n========================================================');
  console.log('🎉 PHASE 1D VERIFICATION PASSED SUCCESSFULLY');
  console.log('========================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Phase 1D Verification Failed:', err);
  process.exit(1);
});
