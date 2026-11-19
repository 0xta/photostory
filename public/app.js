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

// ── Theme ────────────────────────────────────────────────────
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  // Update active button
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });

  // Persist to server (fire-and-forget)
  fetch(`${API}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme }),
  }).catch(() => {}); // ignore if PATCH not yet implemented
}

function initTheme() {
  // Priority: localStorage > server setting > default 'dark'
  const saved = localStorage.getItem('theme');
  const theme = saved || settings.theme || 'dark';
  setTheme(theme);
}

// ── Tabs ─────────────────────────────────────────────────────
function switchTab(tabName) {
  currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
    t.setAttribute('aria-selected', t.dataset.tab === tabName ? 'true' : 'false');
  });

  // Update views
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${tabName}`);
  });
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

// ── Init ─────────────────────────────────────────────────────
async function init() {
  // Load settings
  try {
    settings = await api('/settings');
  } catch {
    settings = {};
  }

  // Init theme
  initTheme();

  // Theme switcher buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });

  // Tab navigation
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Import button placeholder
  const importBtn = document.getElementById('btn-import');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      showToast('ฟีเจอร์นำเข้ารูปจะมาใน Phase 1B', 'info');
    });
  }

  // Update status
  await updateStatus();

  console.log('🎞️ เรื่องราว 2026 — initialized');
}

document.addEventListener('DOMContentLoaded', init);
