// ══════════════════════════════════════════════════════════════
// เรื่องราว 2026 — Frontend App
// ══════════════════════════════════════════════════════════════

const API = '/api';

// ── State ────────────────────────────────────────────────────
let currentTab = 'dashboard';
let settings = {};

// ── API helpers ──────────────────────────────────────────────
async function api(path, opts = {}) {
  const url = `${API}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Thai Date Helper ─────────────────────────────────────────
const THAI_MONTHS_ABBR = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function formatThaiDate(ms) {
  if (!ms) return 'ไม่มีวันที่';
  const d = new Date(ms);
  const day = d.getDate();
  const mon = THAI_MONTHS_ABBR[d.getMonth()];
  const year = d.getFullYear() + 543;
  return `${day} ${mon} ${year}`;
}

// ── Theme ────────────────────────────────────────────────────
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });

  fetch(`${API}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme }),
  }).catch(() => {});
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  const theme = saved || settings.theme || 'dark';
  setTheme(theme);
}

// ── Tabs ─────────────────────────────────────────────────────
function switchTab(tabName) {
  currentTab = tabName;

  document.querySelectorAll('.tab').forEach((t) => {
    const isActive = t.dataset.tab === tabName;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('active', v.id === `view-${tabName}`);
  });

  // Reload data for active view
  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'events') loadEvents();
  if (tabName === 'photos') loadPhotos();
}

// ── Status bar ───────────────────────────────────────────────
async function updateStatus() {
  try {
    const health = await api('/health');
    const { photos, events, persons } = health.counts;
    const statusEl = document.getElementById('status-counts');
    if (photos > 0) {
      statusEl.textContent = `${photos} รูป · ${events} เหตุการณ์ · ${persons} เพื่อน`;
    } else {
      statusEl.textContent = '';
    }
  } catch (e) {
    document.getElementById('status-text').textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์';
  }
}

// ── Toast notifications ──────────────────────────────────────
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
    padding: 0.6rem 1.2rem; border-radius: 8px; font-size: 0.85rem; z-index: 9999;
    background: var(--panel2); color: var(--ink); border: 1px solid var(--line);
    box-shadow: 0 4px 12px var(--shadow); animation: toastIn 0.3s ease;
    font-family: 'IBM Plex Sans Thai', sans-serif;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Import Modal & Flow ──────────────────────────────────────
function openImportModal(defaultPath = '') {
  const modal = document.getElementById('modal-import');
  const input = document.getElementById('import-folder-path');
  if (defaultPath) input.value = defaultPath;
  modal.style.display = 'flex';
  input.focus();
}

function closeImportModal() {
  document.getElementById('modal-import').style.display = 'none';
}

async function startImport(folderPath) {
  if (!folderPath || !folderPath.trim()) {
    showToast('กรุณาระบุที่อยู่โฟลเดอร์', 'error');
    return;
  }

  closeImportModal();

  // Show progress overlay
  const overlay = document.getElementById('overlay-progress');
  const fill = document.getElementById('progress-fill');
  const statusEl = document.getElementById('progress-status');
  const progAdded = document.getElementById('prog-added');
  const progSkipped = document.getElementById('prog-skipped');
  const progDateless = document.getElementById('prog-dateless');

  overlay.style.display = 'flex';
  fill.style.width = '0%';
  statusEl.textContent = 'กำลังเริ่มงาน...';
  progAdded.textContent = '0';
  progSkipped.textContent = '0';
  progDateless.textContent = '0';

  try {
    const res = await api('/import', {
      method: 'POST',
      body: JSON.stringify({ folder: folderPath.trim() }),
    });

    const jobId = res.jobId;

    // Poll job progress
    const pollInterval = setInterval(async () => {
      try {
        const job = await api(`/jobs/${jobId}`);
        const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
        fill.style.width = `${pct}%`;
        statusEl.textContent = job.current
          ? `กำลังอ่าน: ${job.current} (${job.processed}/${job.total})`
          : 'กำลังจัดกลุ่มเหตุการณ์...';
        progAdded.textContent = String(job.added);
        progSkipped.textContent = String(job.skippedDup);
        progDateless.textContent = String(job.dateless);

        if (job.status === 'done' || job.status === 'error') {
          clearInterval(pollInterval);
          setTimeout(() => {
            overlay.style.display = 'none';
            if (job.status === 'done') {
              showToast(`นำเข้าสำเร็จ! เพิ่ม ${job.added} รูป (ข้ามรูปซ้ำ ${job.skippedDup})`, 'success');
              refreshAllData();
            } else {
              showToast(`เกิดข้อผิดพลาด: ${job.error || 'ไม่สามารถนำเข้าได้'}`, 'error');
            }
          }, 600);
        }
      } catch (pollErr) {
        clearInterval(pollInterval);
        overlay.style.display = 'none';
        showToast('เกิดข้อผิดพลาดในการตรวจสอบสถานะ', 'error');
      }
    }, 400);
  } catch (err) {
    overlay.style.display = 'none';
    showToast(err.message || 'ไม่สามารถเริ่มนำเข้ารูปได้', 'error');
  }
}

// ── Data Renderers ───────────────────────────────────────────
async function refreshAllData() {
  await updateStatus();
  if (currentTab === 'dashboard') loadDashboard();
  if (currentTab === 'events') loadEvents();
  if (currentTab === 'photos') loadPhotos();
}

async function loadDashboard() {
  try {
    const health = await api('/health');
    const { photos, events, persons } = health.counts;

    const emptyBox = document.getElementById('dashboard-empty');
    const contentBox = document.getElementById('dashboard-content');

    if (photos === 0) {
      emptyBox.style.display = 'block';
      contentBox.style.display = 'none';
      return;
    }

    emptyBox.style.display = 'none';
    contentBox.style.display = 'block';

    document.getElementById('stat-photos').textContent = photos;
    document.getElementById('stat-events').textContent = events;
    document.getElementById('stat-friends').textContent = persons;

    // Load recent events
    const evData = await api('/events');
    const container = document.getElementById('dashboard-events');
    container.innerHTML = '';

    const recent = evData.items.slice(0, 3);
    for (const ev of recent) {
      container.appendChild(createEventCard(ev));
    }
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

async function loadEvents() {
  try {
    const res = await api('/events');
    const container = document.getElementById('events-list');
    container.innerHTML = '';

    if (res.items.length === 0) {
      container.innerHTML = '<p class="muted">ยังไม่มีเหตุการณ์ กรุณานำเข้ารูปภาพ</p>';
      return;
    }

    for (const ev of res.items) {
      container.appendChild(createEventCard(ev));
    }
  } catch (err) {
    console.error('Failed to load events:', err);
  }
}

function createEventCard(ev) {
  const card = document.createElement('div');
  card.className = 'event-card';

  const dateText = ev.ts_start ? formatThaiDate(ev.ts_start) : 'ไม่มีวันที่';
  const placeText = ev.place ? `📍 ${ev.place}` : (ev.lat ? '📍 มีพิกัด GPS' : 'ไม่มี GPS');

  let filmStripHtml = '<div class="film-strip">';
  for (let i = 0; i < 4; i++) {
    const thumbId = ev.cover_ids && ev.cover_ids[i];
    if (thumbId) {
      filmStripHtml += `<div class="film-thumb"><img src="/api/thumbs/${thumbId}" loading="lazy" alt="frame"></div>`;
    } else {
      filmStripHtml += `<div class="film-thumb"></div>`;
    }
  }
  filmStripHtml += '</div>';

  card.innerHTML = `
    <div class="event-header">
      <div class="event-name">${ev.displayName || 'เหตุการณ์'}</div>
      <div class="event-meta">
        <span>${dateText}</span>
        <span>·</span>
        <span>${placeText}</span>
      </div>
    </div>
    ${filmStripHtml}
    <div class="event-footer">
      <span>${ev.photo_count} รูป</span>
      <span>${ev.friend_count > 0 ? `👥 ${ev.friend_count} เพื่อน` : ''}</span>
    </div>
  `;

  return card;
}

async function loadPhotos() {
  try {
    const res = await api('/photos?limit=120');
    const container = document.getElementById('photos-list');
    const countLabel = document.getElementById('photos-count-label');
    container.innerHTML = '';
    countLabel.textContent = `${res.total} รูป`;

    if (res.items.length === 0) {
      container.innerHTML = '<p class="muted">ยังไม่มีรูปภาพในคลัง</p>';
      return;
    }

    for (const photo of res.items) {
      const card = document.createElement('div');
      card.className = 'photo-card';
      card.title = `${photo.filename} (${formatThaiDate(photo.taken_at)})`;

      const burstBadge = photo.burst ? '<span class="burst-badge">⚡ รัว</span>' : '';
      card.innerHTML = `
        <img src="/api/thumbs/${photo.id}" loading="lazy" alt="${photo.filename}">
        ${burstBadge}
      `;
      container.appendChild(card);
    }
  } catch (err) {
    console.error('Failed to load photos:', err);
  }
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  try {
    settings = await api('/settings');
  } catch {
    settings = {};
  }

  initTheme();

  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Import button handlers
  document.querySelectorAll('.btn-open-import, #btn-header-import').forEach((btn) => {
    btn.addEventListener('click', () => openImportModal());
  });

  document.getElementById('btn-close-import')?.addEventListener('click', closeImportModal);
  document.getElementById('btn-cancel-import')?.addEventListener('click', closeImportModal);

  // Quick fixtures buttons
  document.getElementById('btn-quick-fixtures')?.addEventListener('click', () => {
    startImport('test/fixtures/photos');
  });

  document.getElementById('btn-fill-fixtures')?.addEventListener('click', () => {
    document.getElementById('import-folder-path').value = 'test/fixtures/photos';
  });

  document.getElementById('btn-start-import')?.addEventListener('click', () => {
    const pathVal = document.getElementById('import-folder-path').value;
    startImport(pathVal);
  });

  // Recluster button
  document.getElementById('btn-recluster')?.addEventListener('click', async () => {
    try {
      showToast('กำลังจัดกลุ่มเหตุการณ์ใหม่...', 'info');
      const res = await api('/recluster', { method: 'POST' });
      showToast(`จัดกลุ่มเรียบร้อย: ${res.events} เหตุการณ์ จาก ${res.photos} รูป`, 'success');
      refreshAllData();
    } catch (err) {
      showToast('ไม่สามารถจัดกลุ่มใหม่ได้', 'error');
    }
  });

  // Initial data load
  await refreshAllData();

  console.log('🎞️ เรื่องราว 2026 — initialized and ready');
}

document.addEventListener('DOMContentLoaded', init);
