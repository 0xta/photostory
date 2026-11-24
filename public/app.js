// ══════════════════════════════════════════════════════════════
// เรื่องราว 2026 — Frontend Application (Phase 1D)
// ══════════════════════════════════════════════════════════════

const API = '/api';

// ── Fixed Categories (Appendix B) ────────────────────────────
const CATEGORIES = [
  { id: 'อาหาร', color: '#F0A63C' },
  { id: 'บรรยากาศ', color: '#79C7B4' },
  { id: 'สไลด์', color: '#8FB8E8' },
  { id: 'ตัวฉัน', color: '#E56B50' },
  { id: 'เพื่อน', color: '#D98BC0' },
  { id: 'สถาปัตยกรรม', color: '#B8A6E8' },
  { id: 'อื่นๆ', color: '#8B93A3' },
];

const FRIEND_PALETTE = [
  '#E56B50', '#79C7B4', '#F0A63C', '#8FB8E8', '#D98BC0', '#B8A6E8', '#A8C97F',
];

const THAI_MONTHS_ABBR = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

// ── Application State ────────────────────────────────────────
let currentTab = 'dashboard';
let settings = {};
let allFriends = [];
let loadedPhotos = [];
let photosCurrentPage = 1;
let photosPerPage = 40;
let photosTotalCount = 0;
let activePhotoIndex = -1;
let currentEventDetail = null;
let currentFriendDetail = null;

// Map state (Phase 1E: Leaflet GPS Explorer)
let mapInstance = null;
let mapMarkersLayer = null;
let mapRadiusCircle = null;
let currentMapMode = 'photos'; // 'photos' | 'events'
let mapData = null;
let selectedMapCoord = null;

// Stories & Suggestions state (Phase 1.5A)
let allStories = [];
let currentStoryFilter = '';
let currentStoryDetail = null;
let allSuggestions = [];

// Places state (Phase 1.5B)
let allPlaces = [];
let currentPlaceFilter = '';
let currentPlaceDetail = null;

// Meals state (Phase 1.5C)
let allMeals = [];
let currentMealFilterType = '';
let currentMealFilterPlace = '';
let currentMealFilterMonth = '';
let currentMealDetail = null;

// Filter state for Photos tab (FR-601)
const photoFilters = {
  cat: '',
  person: '',
  month: '',
  gps: '',
  burst: false,
  q: '',
};

// ── API Helper ───────────────────────────────────────────────
async function api(path, opts = {}) {
  const url = `${API}${path}`;
  const options = { ...opts };
  const headers = { ...options.headers };

  if (options.body !== undefined && options.body !== null) {
    if (typeof options.body === 'object' && !(options.body instanceof FormData)) {
      options.body = JSON.stringify(options.body);
    }
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  } else {
    delete headers['Content-Type'];
  }

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Job Polling Helper ───────────────────────────────────────
function pollJob(jobId, onComplete, intervalMs = 500) {
  const pollInterval = setInterval(async () => {
    try {
      const job = await api(`/jobs/${jobId}`);
      if (job.status === 'done' || job.status === 'error') {
        clearInterval(pollInterval);
        if (typeof onComplete === 'function') {
          onComplete(job);
        }
      }
    } catch (err) {
      clearInterval(pollInterval);
      if (typeof onComplete === 'function') {
        onComplete({ status: 'error', error: err.message });
      }
    }
  }, intervalMs);
}

// ── Date Formatting Helpers (Appendix C) ─────────────────────
function formatThaiDate(ms) {
  if (!ms) return 'ไม่มีวันที่';
  const d = new Date(ms);
  const day = d.getDate();
  const mon = THAI_MONTHS_ABBR[d.getMonth()];
  const year = d.getFullYear() + 543;
  return `${day} ${mon} ${year}`;
}

function formatThaiDateShort(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = THAI_MONTHS_ABBR[d.getMonth()];
  return `${day} ${mon}`;
}

function formatTime(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatGps(lat, lon) {
  if (lat == null || lon == null) return 'ไม่มี GPS';
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}${latDir} ${Math.abs(lon).toFixed(4)}${lonDir}`;
}

// ── Toast Notification Helper ────────────────────────────────
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 50px; left: 50%; transform: translateX(-50%);
    padding: 0.6rem 1.2rem; border-radius: 8px; font-size: 0.85rem; z-index: 9999;
    background: var(--panel2); color: var(--ink); border: 1px solid var(--line);
    box-shadow: 0 4px 12px var(--shadow); animation: modalIn 0.25s ease;
    font-family: 'IBM Plex Sans Thai', sans-serif;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// ── Voice Input Helper (Web Speech API, th-TH) ────────────────
function setupVoiceInput(btnEl, targetInputEl) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    btnEl.style.opacity = '0.5';
    btnEl.title = 'เบราว์เซอร์นี้ไม่รองรับ Web Speech API';
    btnEl.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('เบราว์เซอร์นี้ไม่รองรับการพิมพ์ด้วยเสียง (แนะนำ Google Chrome)', 'info');
    });
    return;
  }

  let recognition = null;
  let isListening = false;

  btnEl.addEventListener('click', (e) => {
    e.preventDefault();
    if (isListening && recognition) {
      recognition.stop();
      return;
    }

    try {
      recognition = new SpeechRecognition();
      recognition.lang = 'th-TH';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        isListening = true;
        btnEl.classList.add('listening');
        showToast('กำลังฟัง… พูดได้เลย', 'info');
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (targetInputEl) {
          const prev = targetInputEl.value.trim();
          targetInputEl.value = prev ? `${prev} ${transcript}` : transcript;
          targetInputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          showToast('โปรดอนุญาตใช้ไมโครโฟนในเบราว์เซอร์', 'error');
        } else {
          showToast(`เกิดข้อผิดพลาดในการฟัง: ${event.error}`, 'error');
        }
      };

      recognition.onend = () => {
        isListening = false;
        btnEl.classList.remove('listening');
      };

      recognition.start();
    } catch (err) {
      console.error('Speech recognition error:', err);
      btnEl.classList.remove('listening');
      isListening = false;
    }
  });
}

// ── Theme Management ─────────────────────────────────────────
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
  if (metaColorScheme) {
    metaColorScheme.content = theme === 'light' ? 'light' : 'dark';
  }
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

// ── Tabs Navigation ──────────────────────────────────────────
function switchTab(tabName) {
  const performTabSwitch = () => {
    currentTab = tabName;

    document.querySelectorAll('.tab').forEach((t) => {
      const isActive = t.dataset.tab === tabName;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    document.querySelectorAll('.view').forEach((v) => {
      v.classList.toggle('active', v.id === `view-${tabName}`);
    });

    if (tabName === 'dashboard') loadDashboard();
    if (tabName === 'events') loadEvents();
    if (tabName === 'photos') loadPhotos();
    if (tabName === 'friends') loadFriends();
    if (tabName === 'stories') loadStories();
    if (tabName === 'places') loadPlaces();
    if (tabName === 'meals') loadMeals();
    if (tabName === 'suggestions') loadSuggestions();
    if (tabName === 'recap') loadRecap(currentRecapYear, currentRecapMonth);
    if (tabName === 'map') {
      loadMap(true);
      setTimeout(() => {
        if (mapInstance) mapInstance.invalidateSize();
      }, 150);
    }
  };

  if (document.startViewTransition) {
    document.startViewTransition(() => performTabSwitch());
  } else {
    performTabSwitch();
  }
}

// ── Status Bar Update ────────────────────────────────────────
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
  } catch {
    document.getElementById('status-text').textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์';
  }
}

// ── Dashboard View (FR-701..705) ─────────────────────────────
async function loadDashboard() {
  try {
    const data = await api('/dashboard?year=2026');
    const emptyBox = document.getElementById('dashboard-empty');
    const contentBox = document.getElementById('dashboard-content');

    if (data.totals.photos === 0) {
      emptyBox.style.display = 'block';
      contentBox.style.display = 'none';
      return;
    }

    emptyBox.style.display = 'none';
    contentBox.style.display = 'block';

    // 1. Totals cards
    document.getElementById('stat-photos').textContent = data.totals.photos;
    document.getElementById('stat-events').textContent = data.totals.events;
    document.getElementById('stat-friends').textContent = data.totals.persons;
    document.getElementById('stat-tagged-pct').textContent = `${data.totals.tagged_pct}%`;

    // 2. Monthly histogram (FR-702)
    const histContainer = document.getElementById('dashboard-histogram');
    histContainer.replaceChildren();
    const maxCount = Math.max(...data.months, 1);

    data.months.forEach((count, idx) => {
      const monthNum = idx + 1;
      const pct = Math.round((count / maxCount) * 100);
      const col = document.createElement('div');
      col.className = `histo-bar-col ${photoFilters.month === String(monthNum) ? 'active' : ''}`;
      col.innerHTML = `
        <div class="histo-tooltip">${count} รูป</div>
        <div class="histo-bar" style="height: ${Math.max(pct, 5)}%;"></div>
        <span class="histo-label">${THAI_MONTHS_ABBR[idx]}</span>
      `;
      col.addEventListener('click', () => {
        photoFilters.month = String(monthNum);
        document.getElementById('filter-month').value = String(monthNum);
        switchTab('photos');
      });
      histContainer.appendChild(col);
    });

    // 3. Review Queue (FR-704)
    document.getElementById('queue-dateless-desc').textContent = `${data.queue.dateless} รูป`;
    document.getElementById('queue-unnamed-desc').textContent = `${data.queue.unnamed} เหตุการณ์`;
    document.getElementById('queue-burst-desc').textContent = `${data.queue.burst} รูป`;

    // 4. Top friends
    const topFriendsEl = document.getElementById('dashboard-top-friends');
    topFriendsEl.replaceChildren();
    if (data.top_friends.length === 0) {
      topFriendsEl.innerHTML = '<p class="muted" style="font-size: 0.85rem;">ยังไม่มีรูปที่ติดแท็กเพื่อน</p>';
    } else {
      data.top_friends.forEach((f) => {
        const row = document.createElement('div');
        row.className = 'friend-row';
        row.innerHTML = `
          <div class="friend-avatar" style="background-color: ${f.color || '#E56B50'}">${f.name[0]}</div>
          <div style="flex: 1;">
            <div style="font-weight: 500; font-size: 0.88rem;">${f.name} ${f.nick ? `(${f.nick})` : ''}</div>
            <div class="muted" style="font-size: 0.75rem;">ถ่ายด้วยกัน ${f.photo_count} รูป</div>
          </div>
        `;
        row.addEventListener('click', () => openFriendDetail(f.id));
        topFriendsEl.appendChild(row);
      });
    }

    // 5. Recent events
    const recentEventsEl = document.getElementById('dashboard-events');
    recentEventsEl.replaceChildren();
    data.recent_events.forEach((ev) => {
      recentEventsEl.appendChild(createEventCard(ev));
    });

    // 6. On This Day (FR-1405 / AC-34)
    try {
      const otdData = await api('/on-this-day');
      const otdCard = document.getElementById('dashboard-on-this-day-card');
      const otdContent = document.getElementById('on-this-day-content');
      const otdSub = document.getElementById('on-this-day-subtitle');

      if (otdData && otdData.groups && otdData.groups.length > 0) {
        otdCard.style.display = 'block';
        otdSub.textContent = `${otdData.total_photos} รูปในวันนี้จากปีก่อนหน้า`;
        otdContent.replaceChildren();

        otdData.groups.forEach((g) => {
          const grpEl = document.createElement('div');
          grpEl.className = 'on-this-day-group';
          const evNames = g.events.map((e) => e.name).filter(Boolean).join(', ');
          grpEl.innerHTML = `
            <div class="on-this-day-header">
              <span class="on-this-day-year-badge">${g.years_ago} ปีก่อน (${g.year + 543})</span>
              <span class="on-this-day-event-name">${escapeHtml(evNames || 'ความทรงจำในวันนี้')}</span>
            </div>
            <div class="on-this-day-thumbs-strip">
              ${g.photos
                .map(
                  (p) => `
                <div class="on-this-day-thumb" onclick="openPhotoModal('${p.id}')" title="${escapeHtml(p.filename)}">
                  <img src="/api/thumbs/${p.id}" alt="${escapeHtml(p.filename)}" loading="lazy" />
                </div>
              `
                )
                .join('')}
            </div>
          `;
          otdContent.appendChild(grpEl);
        });
      } else {
        otdCard.style.display = 'none';
      }
    } catch (otdErr) {
      console.warn('Failed to load on-this-day:', otdErr);
    }

    // 7. Relationship Insights (FR-1401 / AC-32)
    try {
      const relData = await api('/insights/relationships');
      const relCard = document.getElementById('dashboard-insights-card');
      const relList = document.getElementById('dashboard-insights-list');

      const hasLapsed = relData && relData.lapsed && relData.lapsed.length > 0;
      const hasAnniv = relData && relData.anniversaries && relData.anniversaries.length > 0;

      if (hasLapsed || hasAnniv) {
        relCard.style.display = 'block';
        relList.replaceChildren();

        if (hasAnniv) {
          relData.anniversaries.forEach((a) => {
            const item = document.createElement('div');
            item.className = 'insight-item insight-item-anniversary';
            item.innerHTML = `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span>🎉</span>
                <div>
                  <strong>${escapeHtml(a.name)}</strong>
                  <span class="muted" style="font-size: 0.78rem; margin-left: 6px;">ครบรอบมิตรภาพ ${a.years} ปี (รู้จักกันเมื่อ ${formatThaiDateShort(a.first_met)})</span>
                </div>
              </div>
              <button class="btn btn-sm" onclick="openFriendDetail('${a.id}')">ดูความทรงจำ →</button>
            `;
            relList.appendChild(item);
          });
        }

        if (hasLapsed) {
          relData.lapsed.slice(0, 3).forEach((l) => {
            const item = document.createElement('div');
            item.className = 'insight-item insight-item-lapsed';
            item.innerHTML = `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span>⏳</span>
                <div>
                  <strong>${escapeHtml(l.name)}</strong>
                  <span class="muted" style="font-size: 0.78rem; margin-left: 6px;">ไม่ได้เจอกันมา ${l.months_unseen} เดือนแล้ว (เจอล่าสุด ${formatThaiDateShort(l.last_met)})</span>
                </div>
              </div>
              <button class="btn btn-sm" onclick="openFriendDetail('${l.id}')">ทักทายเพื่อน →</button>
            `;
            relList.appendChild(item);
          });
        }
      } else {
        relCard.style.display = 'none';
      }
    } catch (relErr) {
      console.warn('Failed to load relationship insights:', relErr);
    }
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

// ── Events View (FR-301..303) ────────────────────────────────
async function loadEvents() {
  try {
    const res = await api('/events');
    const container = document.getElementById('events-list');
    container.replaceChildren();

    // Check dateless photos
    const datelessRes = await api('/photos?gps=nodate&limit=1');
    const datelessTray = document.getElementById('events-dateless-tray');
    if (datelessRes.total > 0) {
      datelessTray.style.display = 'block';
      document.getElementById('dateless-tray-count').textContent = datelessRes.total;
    } else {
      datelessTray.style.display = 'none';
    }

    if (res.items.length === 0) {
      container.innerHTML = '<p class="muted">ยังไม่มีเหตุการณ์ กรุณานำเข้ารูปภาพ</p>';
      return;
    }

    let lastMonthKey = '';
    res.items.forEach((ev, idx) => {
      // Group events by Month / Year header
      let monthKey = 'nodate';
      let monthDisplay = '📅 เหตุการณ์ไม่มีวันที่ระบุ';
      if (ev.ts_start) {
        const d = new Date(ev.ts_start);
        const y = d.getFullYear() + 543;
        const m = THAI_MONTHS[d.getMonth()] || '';
        monthKey = `${d.getFullYear()}-${d.getMonth()}`;
        monthDisplay = `📅 ${m} ${y}`;
      }

      if (monthKey !== lastMonthKey) {
        lastMonthKey = monthKey;
        const countInMonth = res.items.filter((item) => {
          if (!item.ts_start && monthKey === 'nodate') return true;
          if (!item.ts_start) return false;
          const idDate = new Date(item.ts_start);
          return `${idDate.getFullYear()}-${idDate.getMonth()}` === monthKey;
        }).length;

        const headerEl = document.createElement('div');
        headerEl.className = 'event-month-header';
        headerEl.innerHTML = `
          <span class="event-month-title">${monthDisplay}</span>
          <span class="event-month-count mono">${countInMonth} เหตุการณ์</span>
        `;
        container.appendChild(headerEl);
      }

      container.appendChild(createEventCard(ev, idx + 1));
    });
  } catch (err) {
    console.error('Failed to load events:', err);
  }
}

function createEventCard(ev, index = 1) {
  const card = document.createElement('div');
  card.className = 'event-card';

  const dateText = ev.ts_start ? formatThaiDate(ev.ts_start) : 'ไม่มีวันที่';
  const placeText = ev.place ? `📍 ${ev.place}` : (ev.lat ? '📍 มีพิกัด GPS' : 'ไม่มี GPS');
  const frameText = `FR ${String(index).padStart(3, '0')}`;
  const unnamedBadge = !ev.named ? '<span class="badge-unnamed">รอตั้งชื่อ</span>' : '';

  let filmStripHtml = '<div class="film-strip">';
  for (let i = 0; i < 4; i++) {
    const thumbId = ev.cover_ids && ev.cover_ids[i];
    if (thumbId) {
      filmStripHtml += `<div class="film-thumb"><img src="/api/thumbs/${thumbId}" loading="lazy" alt="frame"></div>`;
    } else {
      filmStripHtml += '<div class="film-thumb"></div>';
    }
  }
  filmStripHtml += '</div>';

  card.innerHTML = `
    <div class="event-header">
      <div class="event-frame-badge mono">
        <span>${frameText}</span>
        ${unnamedBadge}
      </div>
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

  card.addEventListener('click', () => openEventDetail(ev.id));
  return card;
}

async function openEventDetail(eventId) {
  try {
    const ev = await api(`/events/${eventId}`);
    currentEventDetail = ev;

    document.getElementById('event-modal-title').textContent = ev.displayName;
    document.getElementById('event-edit-name').value = ev.name || '';
    document.getElementById('event-edit-place').value = ev.place || '';
    document.getElementById('event-edit-note').value = ev.note || '';

    // Stats
    const statsEl = document.getElementById('event-modal-stats');
    statsEl.innerHTML = `
      <div><span class="muted">วันที่:</span> ${ev.ts_start ? formatThaiDate(ev.ts_start) : '-'}</div>
      <div><span class="muted">เวลา:</span> ${ev.ts_start ? `${formatTime(ev.ts_start)} – ${formatTime(ev.ts_end)}` : '-'}</div>
      <div><span class="muted">พิกัด:</span> ${formatGps(ev.lat, ev.lon)}</div>
      <div><span class="muted">จำนวนรูป:</span> ${ev.photos.length} รูป</div>
    `;

    // Photos grid
    const photosEl = document.getElementById('event-modal-photos');
    photosEl.replaceChildren();
    ev.photos.forEach((p) => {
      const card = createPhotoThumbCard(p);
      card.addEventListener('click', () => openPhotoModal(p.id));
      photosEl.appendChild(card);
    });

    document.getElementById('modal-event').style.display = 'flex';
  } catch (err) {
    showToast('ไม่สามารถโหลดรายละเอียดเหตุการณ์ได้', 'error');
  }
}

// ── Photos View & Filtering (FR-401..405, 601) ────────────────
async function loadPhotos(page = photosCurrentPage) {
  photosCurrentPage = page;
  try {
    // Build query params
    const params = new URLSearchParams();
    if (photoFilters.cat) params.set('cat', photoFilters.cat);
    if (photoFilters.person) params.set('person', photoFilters.person);
    if (photoFilters.month) params.set('month', photoFilters.month);
    if (photoFilters.gps) params.set('gps', photoFilters.gps);
    if (photoFilters.burst) params.set('burst', '1');
    if (photoFilters.q) params.set('q', photoFilters.q);

    params.set('limit', String(photosPerPage));
    const offset = Math.max(0, (photosCurrentPage - 1) * photosPerPage);
    params.set('offset', String(offset));

    const res = await api(`/photos?${params.toString()}`);
    loadedPhotos = res.items;
    photosTotalCount = res.total !== undefined ? res.total : res.items.length;

    const totalPages = Math.max(1, Math.ceil(photosTotalCount / photosPerPage));
    if (photosCurrentPage > totalPages) {
      photosCurrentPage = totalPages;
    }

    const container = document.getElementById('photos-list');
    container.replaceChildren();

    const startIdx = photosTotalCount === 0 ? 0 : offset + 1;
    const endIdx = Math.min(offset + res.items.length, photosTotalCount);

    const rangeInfoEl = document.getElementById('photos-range-info');
    const totalInfoEl = document.getElementById('photos-total-info');
    const pageInfoEl = document.getElementById('photos-page-info');

    if (rangeInfoEl) rangeInfoEl.textContent = `${startIdx} - ${endIdx}`;
    if (totalInfoEl) totalInfoEl.textContent = photosTotalCount;
    if (pageInfoEl) pageInfoEl.textContent = `หน้า ${photosCurrentPage} / ${totalPages}`;

    // Update pagination buttons state
    const firstBtn = document.getElementById('btn-photos-first');
    const prevBtn = document.getElementById('btn-photos-prev');
    const nextBtn = document.getElementById('btn-photos-next');
    const lastBtn = document.getElementById('btn-photos-last');

    if (firstBtn) firstBtn.disabled = photosCurrentPage <= 1;
    if (prevBtn) prevBtn.disabled = photosCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = photosCurrentPage >= totalPages;
    if (lastBtn) lastBtn.disabled = photosCurrentPage >= totalPages;

    if (photoFilters.q) {
      const topScore =
        res.items.length > 0 && res.items[0].score
          ? ` · คะแนนสูงสุด ${Math.round(res.items[0].score * 100)}%`
          : '';
      document.getElementById('photos-filter-count').textContent = `ค้นพบ ${photosTotalCount} รูป${topScore}`;
    } else {
      document.getElementById('photos-filter-count').textContent = `ทั้งหมด ${photosTotalCount} รูป`;
    }

    if (res.items.length === 0) {
      container.innerHTML = '<p class="muted" style="grid-column: 1/-1; padding: 2rem; text-align: center;">ไม่พบรูปภาพตามเงื่อนไขที่เลือก</p>';
      return;
    }

    res.items.forEach((p, idx) => {
      const card = createPhotoThumbCard(p);
      card.addEventListener('click', () => {
        activePhotoIndex = idx;
        openPhotoModal(p.id);
      });
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load photos:', err);
  }
}

function createPhotoThumbCard(photo) {
  const card = document.createElement('div');
  card.className = 'photo-card';
  card.title = `${photo.filename} (${formatThaiDate(photo.taken_at)})`;

  const burstBadge = photo.burst ? '<span class="burst-badge">⚡ รัว</span>' : '';
  const scoreVal = photo.score !== undefined && photo.score !== null ? Number(photo.score) : 0;
  const matchType = photo.match_type || 'semantic';
  const icon = matchType === 'keyword' ? '🔍' : (matchType === 'hybrid' ? '⚡' : '✨');
  const typeLabel = matchType === 'keyword' ? 'คำค้นตรงตัว' : (matchType === 'hybrid' ? 'ผสมผสาน (คำค้น+ความหมาย)' : 'ความหมายภาพ');
  const scoreBadge =
    scoreVal > 0
      ? `<span class="score-badge" title="คะแนนความคล้าย: ${Math.round(scoreVal * 100)}% (${typeLabel})">${icon} ${Math.round(scoreVal * 100)}%</span>`
      : '';

  // Dots for categories and friends
  let dotsHtml = '<div class="photo-dots-overlay">';
  if (photo.cats && photo.cats.length > 0) {
    photo.cats.forEach((catName) => {
      const cDef = CATEGORIES.find((c) => c.id === catName);
      if (cDef) dotsHtml += `<span class="dot" style="background-color: ${cDef.color};"></span>`;
    });
  }
  dotsHtml += '</div>';

  card.innerHTML = `
    <img src="/api/thumbs/${photo.id}" loading="lazy" alt="${photo.filename}" />
    ${burstBadge}
    ${scoreBadge}
    ${dotsHtml}
  `;
  return card;
}

// ── Photo Detail Modal (FR-402) ──────────────────────────────
async function openPhotoModal(photoId) {
  try {
    const photo = await api(`/photos/${photoId}`);
    activePhotoIndex = loadedPhotos.findIndex((p) => p.id === photoId);

    document.getElementById('photo-modal-filename').textContent = photo.filename;
    const photoModalImg = document.getElementById('photo-modal-img');
    if (photoModalImg) {
      photoModalImg.src = `/api/photos/${photo.id}/view`;
      photoModalImg.onerror = () => {
        photoModalImg.src = `/api/thumbs/${photo.id}`;
      };
    }

    // Burst indicator
    const burstBadge = document.getElementById('photo-modal-burst-badge');
    burstBadge.style.display = photo.burst ? 'inline-block' : 'none';

    // Similarity Score in Modal
    const activeItem = loadedPhotos[activePhotoIndex];
    const scoreNum = photo.score ?? activeItem?.score ?? 0;
    const matchType = photo.match_type ?? activeItem?.match_type ?? 'semantic';
    const scoreBadgeEl = document.getElementById('photo-modal-score-badge');
    const scoreBoxEl = document.getElementById('photo-modal-score-box');
    const scoreTextEl = document.getElementById('photo-modal-score');

    if (scoreNum > 0) {
      const pct = Math.round(scoreNum * 100);
      const icon = matchType === 'keyword' ? '🔍' : (matchType === 'hybrid' ? '⚡' : '✨');
      const typeLabel = matchType === 'keyword' ? 'คำค้นตรงตัว (FTS)' : (matchType === 'hybrid' ? 'ผสมผสาน (คำค้น + ความหมาย AI)' : 'ความคล้ายคลึงเชิงความหมาย (AI Vector)');
      if (scoreBadgeEl) {
        scoreBadgeEl.style.display = 'inline-flex';
        scoreBadgeEl.textContent = `${icon} ${pct}%`;
      }
      if (scoreBoxEl) {
        scoreBoxEl.style.display = 'block';
        if (scoreTextEl) scoreTextEl.textContent = `${icon} ${pct}% (${typeLabel})`;
      }
    } else {
      if (scoreBadgeEl) scoreBadgeEl.style.display = 'none';
      if (scoreBoxEl) scoreBoxEl.style.display = 'none';
    }

    // EXIF
    document.getElementById('photo-modal-date').textContent = formatThaiDate(photo.taken_at);
    document.getElementById('photo-modal-time').textContent = formatTime(photo.taken_at);
    document.getElementById('photo-modal-gps').textContent = formatGps(photo.lat, photo.lon);
    document.getElementById('photo-modal-dims').textContent = photo.w && photo.h ? `${photo.w} × ${photo.h}` : '-';
    document.getElementById('photo-modal-event').textContent = photo.event ? (photo.event.name || photo.event.place || 'มีเหตุการณ์') : 'ไม่มี';

    // Date editor
    const dateInput = document.getElementById('input-edit-date');
    if (photo.taken_at) {
      const dt = new Date(photo.taken_at);
      dateInput.value = dt.toISOString().slice(0, 16);
    } else {
      dateInput.value = '';
    }

    // Note
    document.getElementById('photo-modal-note').value = photo.note || '';

    // Render category chips (FR-402)
    const catsContainer = document.getElementById('photo-modal-cats');
    catsContainer.replaceChildren();
    CATEGORIES.forEach((cat) => {
      const isSelected = photo.cats && photo.cats.includes(cat.id);
      const chip = document.createElement('span');
      chip.className = `cat-chip ${isSelected ? 'active' : ''}`;
      chip.innerHTML = `<span class="cat-dot" style="background-color: ${cat.color};"></span>${cat.id}`;
      chip.addEventListener('click', async () => {
        let newCats = [...(photo.cats || [])];
        if (newCats.includes(cat.id)) {
          newCats = newCats.filter((c) => c !== cat.id);
        } else {
          newCats.push(cat.id);
        }
        await api(`/photos/${photo.id}/cats`, {
          method: 'PUT',
          body: JSON.stringify({ cats: newCats }),
        });
        photo.cats = newCats;
        openPhotoModal(photo.id);
        loadPhotos();
      });
      catsContainer.appendChild(chip);
    });

    // Render unconfirmed face suggestion chips (FR-506 / AC-18)
    const suggestionsContainer = document.getElementById('photo-modal-face-suggestions');
    if (suggestionsContainer) {
      suggestionsContainer.replaceChildren();
      const unconfirmedFriends = (photo.friends || []).filter((f) => f.source === 'face-suggestion');
      if (unconfirmedFriends.length > 0) {
        suggestionsContainer.style.display = 'block';
        unconfirmedFriends.forEach((uf) => {
          const chip = document.createElement('div');
          chip.className = 'face-suggest-chip';
          chip.innerHTML = `
            <span>👤 ${escapeHtml(uf.name)}?</span>
            <button class="btn-chip-action btn-confirm" title="ยืนยันเพื่อนในรูป">✓</button>
            <button class="btn-chip-action btn-dismiss" title="ไม่ใช่คนนี้">✕</button>
          `;
          chip.querySelector('.btn-confirm').addEventListener('click', async (e) => {
            e.stopPropagation();
            await api(`/photos/${photo.id}/confirm-face`, {
              method: 'POST',
              body: { person_id: uf.id },
            });
            showToast(`ยืนยัน ${uf.name} ในรูปนี้แล้ว`, 'success');
            openPhotoModal(photo.id);
            loadPhotos();
            loadPersons();
          });
          chip.querySelector('.btn-dismiss').addEventListener('click', async (e) => {
            e.stopPropagation();
            await api(`/photos/${photo.id}/dismiss-face`, {
              method: 'POST',
              body: { person_id: uf.id },
            });
            showToast('ละเว้นข้อเสนอแนะแล้ว', 'info');
            openPhotoModal(photo.id);
            loadPhotos();
          });
          suggestionsContainer.appendChild(chip);
        });
      } else {
        suggestionsContainer.style.display = 'none';
      }
    }

    // Render friend chips (FR-402)
    const friendsContainer = document.getElementById('photo-modal-friends');
    friendsContainer.replaceChildren();
    const taggedPersonIds = new Set((photo.friends || []).filter((f) => f.source !== 'face-suggestion').map((f) => f.id));

    allFriends.forEach((friend) => {
      const isSelected = taggedPersonIds.has(friend.id);
      const chip = document.createElement('span');
      chip.className = `friend-chip ${isSelected ? 'active' : ''}`;
      chip.innerHTML = `<span class="cat-dot" style="background-color: ${friend.color || '#E56B50'};"></span>${friend.name}`;
      chip.addEventListener('click', async () => {
        let newPersons = Array.from(taggedPersonIds);
        if (newPersons.includes(friend.id)) {
          newPersons = newPersons.filter((id) => id !== friend.id);
        } else {
          newPersons.push(friend.id);
        }
        await api(`/photos/${photo.id}/persons`, {
          method: 'PUT',
          body: JSON.stringify({ persons: newPersons }),
        });
        openPhotoModal(photo.id);
        loadPhotos();
      });
      friendsContainer.appendChild(chip);
    });

    // Add friend button inside photo modal
    const addFriendBtn = document.createElement('button');
    addFriendBtn.className = 'btn btn-sm';
    addFriendBtn.textContent = '+ เพิ่มเพื่อน';
    addFriendBtn.addEventListener('click', () => {
      openAddFriendModal();
    });
    friendsContainer.appendChild(addFriendBtn);

    // Collections picker in photo modal (Phase 1.5A)
    const collSelect = document.getElementById('photo-select-collection');
    if (collSelect) {
      collSelect.innerHTML = '<option value="">-- เลือกเรื่องราวเพื่อเพิ่มรูปนี้ --</option>';
      allStories.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (${s.photo_count} รูป)`;
        collSelect.appendChild(opt);
      });
    }

    // Places picker in photo modal (Phase 1.5B)
    const placeSelect = document.getElementById('photo-select-place');
    if (placeSelect) {
      placeSelect.innerHTML = '<option value="">-- เลือกสถานที่เพื่อผูกรูปนี้ --</option>';
      allPlaces.forEach((pl) => {
        const opt = document.createElement('option');
        opt.value = pl.id;
        opt.textContent = `${pl.name} (${pl.photo_count} รูป)`;
        placeSelect.appendChild(opt);
      });
    }

    const placesContainer = document.getElementById('photo-modal-places-list');
    if (placesContainer) {
      placesContainer.replaceChildren();
      (photo.places || []).forEach((pl) => {
        const chip = document.createElement('span');
        chip.className = 'type-pill ' + (pl.type || 'other');
        chip.style.marginRight = '4px';
        chip.textContent = `📍 ${pl.name} (${pl.source || 'manual'})`;
        placesContainer.appendChild(chip);
      });
    }

    // Meal indicator (Phase 1.5C)
    const mealSection = document.getElementById('photo-modal-meal-section');
    const mealInfo = document.getElementById('photo-modal-meal-info');
    if (mealSection && mealInfo) {
      if (photo.meal) {
        mealSection.style.display = 'block';
        const typeTh =
          photo.meal.meal_type === 'breakfast'
            ? '🍳 เช้า'
            : photo.meal.meal_type === 'lunch'
            ? '🍲 กลางวัน'
            : photo.meal.meal_type === 'dinner'
            ? '🍷 เย็น'
            : photo.meal.meal_type === 'cafe'
            ? '☕ คาเฟ่'
            : '🍽️ อื่นๆ';
        mealInfo.innerHTML = `
          <span class="type-pill ${photo.meal.meal_type}">${typeTh}</span>
          <span style="font-size: 0.85rem; font-weight: 500;">${escapeHtml(photo.meal.place_name || 'มื้ออาหาร')}</span>
          <button class="btn btn-sm" style="margin-left: auto;" onclick="closeAllModals(); openMealDetail('${photo.meal.id}');">ดูมื้ออาหาร</button>
        `;
      } else {
        mealSection.style.display = 'none';
      }
    }

    document.getElementById('modal-photo').style.display = 'flex';
  } catch (err) {
    showToast('ไม่สามารถเปิดรูปภาพได้', 'error');
  }
}

// ── Friends View & Management (FR-501..505) ──────────────────
async function loadFriends() {
  try {
    const res = await api('/persons');
    allFriends = res.items;

    // Update filter dropdowns (Photos tab & Map tab)
    const select = document.getElementById('filter-friend');
    const mapSelect = document.getElementById('map-filter-friend');
    if (select) select.innerHTML = '<option value="">ทั้งหมด</option>';
    if (mapSelect) mapSelect.innerHTML = '<option value="">ทั้งหมด</option>';

    allFriends.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.name} ${f.nick ? `(${f.nick})` : ''}`;
      if (select) select.appendChild(opt);
      if (mapSelect) mapSelect.appendChild(opt.cloneNode(true));
    });

    const container = document.getElementById('friends-list');
    container.replaceChildren();

    if (allFriends.length === 0) {
      container.innerHTML = '<p class="muted" style="grid-column: 1/-1;">ยังไม่มีเพื่อนที่บันทึก กดปุ่ม "+ เพิ่มเพื่อนใหม่" เพื่อเริ่มต้น</p>';
      return;
    }

    allFriends.forEach((f) => {
      const card = document.createElement('div');
      card.className = 'friend-card';
      card.innerHTML = `
        <div class="friend-avatar-lg" style="background-color: ${f.color || '#E56B50'};">${f.name[0]}</div>
        <div>
          <div style="font-weight: 600; font-size: 1rem;">${f.name}</div>
          <div class="muted" style="font-size: 0.8rem;">${f.nick ? `(${f.nick})` : ''}</div>
          <div class="muted" style="font-size: 0.78rem; margin-top: 0.2rem;">ถ่ายด้วยกัน ${f.photo_count} รูป · ${f.event_count} เหตุการณ์</div>
        </div>
      `;
      card.addEventListener('click', () => openFriendDetail(f.id));
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load friends:', err);
  }
}

// ── Social Graph (FR-1403: Vanilla Canvas Simulation) ─────────
let socialGraphData = null;
let socialGraphAnimId = null;

async function loadSocialGraph() {
  const container = document.getElementById('social-graph-container');
  if (!container) return;
  container.style.display = 'block';

  try {
    const data = await api('/insights/social-graph');
    socialGraphData = data;
    initSocialGraphCanvas(data);
  } catch (err) {
    console.error('Failed to load social graph:', err);
    showToast('ไม่สามารถดึงข้อมูลแผนผังเครือข่ายเพื่อนได้', 'error');
  }
}

function initSocialGraphCanvas(data) {
  const canvas = document.getElementById('social-graph-canvas');
  const tooltip = document.getElementById('social-graph-tooltip');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  if (socialGraphAnimId) {
    cancelAnimationFrame(socialGraphAnimId);
    socialGraphAnimId = null;
  }

  const nodes = (data.nodes || []).map((n, i) => {
    const angle = (i / Math.max(1, data.nodes.length)) * Math.PI * 2;
    const r = Math.min(width, height) * 0.35;
    return {
      ...n,
      x: width / 2 + Math.cos(angle) * r + (Math.random() - 0.5) * 40,
      y: height / 2 + Math.sin(angle) * r + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
      radius: Math.max(22, Math.min(38, 18 + (n.photo_count || 1) * 2)),
    };
  });

  const nodeMap = new Map();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const edges = (data.edges || [])
    .map((e) => ({
      ...e,
      sourceNode: nodeMap.get(e.source),
      targetNode: nodeMap.get(e.target),
    }))
    .filter((e) => e.sourceNode && e.targetNode);

  let draggedNode = null;
  let hoveredNode = null;
  let hoveredEdge = null;

  function simulate() {
    // Force-directed repulsion between nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 260) {
          const force = ((260 - dist) / dist) * 0.04;
          nodes[i].vx -= dx * force;
          nodes[i].vy -= dy * force;
          nodes[j].vx += dx * force;
          nodes[j].vy += dy * force;
        }
      }
    }

    // Spring attraction along edges
    for (const e of edges) {
      const dx = e.targetNode.x - e.sourceNode.x;
      const dy = e.targetNode.y - e.sourceNode.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const targetDist = 140;
      const force = (dist - targetDist) * 0.015 * Math.min(3, 0.8 + e.weight * 0.2);
      e.sourceNode.vx += (dx / dist) * force;
      e.sourceNode.vy += (dy / dist) * force;
      e.targetNode.vx -= (dx / dist) * force;
      e.targetNode.vy -= (dy / dist) * force;
    }

    // Pull toward center and damp
    for (const n of nodes) {
      if (n === draggedNode) continue;
      n.vx += (width / 2 - n.x) * 0.005;
      n.vy += (height / 2 - n.y) * 0.005;
      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x += n.vx;
      n.y += n.vy;

      // Keep in canvas bounds
      n.x = Math.max(n.radius + 10, Math.min(width - n.radius - 10, n.x));
      n.y = Math.max(n.radius + 10, Math.min(height - n.radius - 10, n.y));
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    // Draw background subtle grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 40; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 40; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw edges
    for (const e of edges) {
      const isHovered = hoveredEdge === e;
      ctx.beginPath();
      ctx.moveTo(e.sourceNode.x, e.sourceNode.y);
      ctx.lineTo(e.targetNode.x, e.targetNode.y);
      ctx.strokeStyle = isHovered ? '#F0A63C' : 'rgba(240, 166, 60, 0.35)';
      ctx.lineWidth = Math.min(8, Math.max(2, e.weight * 2));
      ctx.stroke();

      // Draw weight badge on edge center if weight >= 2
      if (e.weight >= 2 || isHovered) {
        const mx = (e.sourceNode.x + e.targetNode.x) / 2;
        const my = (e.sourceNode.y + e.targetNode.y) / 2;
        ctx.fillStyle = isHovered ? '#F0A63C' : '#222836';
        ctx.beginPath();
        ctx.arc(mx, my, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#F0A63C';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = isHovered ? '#12151B' : '#EDE7DA';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(e.weight), mx, my);
      }
    }

    // Draw nodes
    for (const n of nodes) {
      const isHovered = hoveredNode === n;
      const color = n.color || '#79C7B4';

      // Outer glow on hover
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(240, 166, 60, 0.35)';
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.strokeStyle = isHovered ? '#FFF' : '#1A1E27';
      ctx.stroke();

      // Avatar Letter
      ctx.fillStyle = '#12151B';
      ctx.font = `bold ${Math.round(n.radius * 0.9)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.name.charAt(0), n.x, n.y);

      // Name Label below
      ctx.fillStyle = '#EDE7DA';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.name, n.x, n.y + n.radius + 14);
    }
  }

  function loop() {
    simulate();
    draw();
    socialGraphAnimId = requestAnimationFrame(loop);
  }
  loop();

  // Mouse interaction
  function getCanvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  }

  canvas.onmousedown = (evt) => {
    const pos = getCanvasPos(evt);
    for (const n of nodes) {
      const dx = pos.x - n.x;
      const dy = pos.y - n.y;
      if (Math.sqrt(dx * dx + dy * dy) <= n.radius) {
        draggedNode = n;
        break;
      }
    }
  };

  canvas.onmousemove = (evt) => {
    const pos = getCanvasPos(evt);
    if (draggedNode) {
      draggedNode.x = pos.x;
      draggedNode.y = pos.y;
      return;
    }

    // Check hovered node
    hoveredNode = null;
    for (const n of nodes) {
      const dx = pos.x - n.x;
      const dy = pos.y - n.y;
      if (Math.sqrt(dx * dx + dy * dy) <= n.radius) {
        hoveredNode = n;
        break;
      }
    }

    // Check hovered edge if no node hovered
    hoveredEdge = null;
    if (!hoveredNode) {
      for (const e of edges) {
        const d = distToSegment(pos, e.sourceNode, e.targetNode);
        if (d < 10) {
          hoveredEdge = e;
          break;
        }
      }
    }

    if (hoveredNode) {
      canvas.style.cursor = 'pointer';
      tooltip.style.display = 'block';
      tooltip.style.left = `${evt.offsetX + 15}px`;
      tooltip.style.top = `${evt.offsetY + 15}px`;
      tooltip.innerHTML = `
        <strong>${escapeHtml(hoveredNode.name)}</strong> ${hoveredNode.nick ? `(${escapeHtml(hoveredNode.nick)})` : ''}<br>
        📸 ${hoveredNode.photo_count || 0} รูปภาพ · 🎞️ ${hoveredNode.event_count || 0} เหตุการณ์<br>
        <span style="font-size:0.75rem;color:var(--accent);">คลิกเพื่อเปิดโปรไฟล์</span>
      `;
    } else if (hoveredEdge) {
      canvas.style.cursor = 'default';
      tooltip.style.display = 'block';
      tooltip.style.left = `${evt.offsetX + 15}px`;
      tooltip.style.top = `${evt.offsetY + 15}px`;
      const evList = (hoveredEdge.shared_events || [])
        .map((ev) => `• ${escapeHtml(ev.name)}`)
        .slice(0, 3)
        .join('<br>');
      tooltip.innerHTML = `
        <strong>${escapeHtml(hoveredEdge.sourceNode.name)} & ${escapeHtml(hoveredEdge.targetNode.name)}</strong><br>
        ร่วมกัน: <strong>${hoveredEdge.weight}</strong> เหตุการณ์ (${hoveredEdge.shared_photos_count} รูป)<br>
        ${evList ? `<div style="font-size:0.74rem;color:#AAA;margin-top:4px;">${evList}</div>` : ''}
      `;
    } else {
      canvas.style.cursor = 'default';
      tooltip.style.display = 'none';
    }
  };

  canvas.onmouseup = () => {
    draggedNode = null;
  };

  canvas.onclick = (evt) => {
    const pos = getCanvasPos(evt);
    for (const n of nodes) {
      const dx = pos.x - n.x;
      const dy = pos.y - n.y;
      if (Math.sqrt(dx * dx + dy * dy) <= n.radius) {
        openFriendDetail(n.id);
        break;
      }
    }
  };
}

function distToSegment(p, v, w) {
  const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
  if (l2 === 0) return Math.sqrt((p.x - v.x) * (p.x - v.x) + (p.y - v.y) * (p.y - v.y));
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = v.x + t * (w.x - v.x);
  const projY = v.y + t * (w.y - v.y);
  return Math.sqrt((p.x - projX) * (p.x - projX) + (p.y - projY) * (p.y - projY));
}

async function openFriendDetail(personId) {
  try {
    const person = await api(`/persons/${personId}`);
    currentFriendDetail = person;

    document.getElementById('friend-detail-name').textContent = person.name;
    document.getElementById('friend-detail-nick').textContent = person.nick ? `(${person.nick})` : '';
    const avatar = document.getElementById('friend-detail-avatar');
    avatar.textContent = person.name[0];
    avatar.style.backgroundColor = person.color || '#E56B50';

    // 4 Auto-stats
    document.getElementById('friend-stat-photos').textContent = person.stats.photo_count;
    document.getElementById('friend-stat-events').textContent = person.stats.event_count;
    document.getElementById('friend-stat-first').textContent = person.stats.first_met ? formatThaiDateShort(person.stats.first_met) : '-';
    document.getElementById('friend-stat-last').textContent = person.stats.last_met ? formatThaiDateShort(person.stats.last_met) : '-';

    // Timeline
    const timelineEl = document.getElementById('friend-detail-timeline');
    timelineEl.replaceChildren();
    if (person.timeline.length === 0) {
      timelineEl.innerHTML = '<p class="muted" style="font-size: 0.85rem;">ยังไม่มีประวัติการพบเจอในเหตุการณ์</p>';
    } else {
      person.timeline.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'timeline-item';
        row.innerHTML = `
          <div>
            <div class="timeline-title">${item.displayName}</div>
            <div class="timeline-date">${item.place ? `📍 ${item.place} · ` : ''}${formatThaiDate(item.ts_start)}</div>
          </div>
          <span class="mono muted" style="font-size: 0.82rem;">${item.photo_count} รูป</span>
        `;
        timelineEl.appendChild(row);
      });
    }

    // Photos
    const photosEl = document.getElementById('friend-detail-photos');
    photosEl.replaceChildren();
    person.photos.forEach((p) => {
      const card = createPhotoThumbCard(p);
      card.addEventListener('click', () => openPhotoModal(p.id));
      photosEl.appendChild(card);
    });

    document.getElementById('modal-friend-detail').style.display = 'flex';
  } catch (err) {
    showToast('ไม่สามารถเปิดข้อมูลเพื่อนได้', 'error');
  }
}

function openAddFriendModal() {
  document.getElementById('input-friend-name').value = '';
  document.getElementById('input-friend-nick').value = '';
  document.getElementById('input-friend-note').value = '';

  const picker = document.getElementById('friend-color-picker');
  picker.replaceChildren();
  let selectedColor = FRIEND_PALETTE[0];

  FRIEND_PALETTE.forEach((hex, idx) => {
    const circle = document.createElement('div');
    circle.className = `color-circle ${idx === 0 ? 'selected' : ''}`;
    circle.style.backgroundColor = hex;
    circle.addEventListener('click', () => {
      picker.querySelectorAll('.color-circle').forEach((c) => c.classList.remove('selected'));
      circle.classList.add('selected');
      selectedColor = hex;
    });
    picker.appendChild(circle);
  });

  const saveBtn = document.getElementById('btn-save-new-friend');
  saveBtn.onclick = async () => {
    const name = document.getElementById('input-friend-name').value.trim();
    if (!name) {
      showToast('กรุณาระบุชื่อเพื่อน', 'error');
      return;
    }
    const nick = document.getElementById('input-friend-nick').value.trim();
    const note = document.getElementById('input-friend-note').value.trim();

    try {
      await api('/persons', {
        method: 'POST',
        body: JSON.stringify({ name, nick, note, color: selectedColor }),
      });
      document.getElementById('modal-add-friend').style.display = 'none';
      showToast(`เพิ่ม ${name} สำเร็จ`, 'success');
      loadFriends();
      updateStatus();
    } catch (err) {
      showToast(err.message || 'ไม่สามารถเพิ่มเพื่อนได้', 'error');
    }
  };

  document.getElementById('modal-add-friend').style.display = 'flex';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Map View (Phase 1E: Leaflet.js GPS Explorer) ─────────────
function initMap() {
  if (mapInstance) return;
  const container = document.getElementById('map-container');
  if (!container) return;

  if (typeof L === 'undefined') {
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);text-align:center;padding:2rem;">
        <div>
          <div style="font-size:2rem;margin-bottom:0.5rem;">🗺️</div>
          <p><strong>ไม่สามารถโหลดระบบแผนที่ Leaflet ได้</strong></p>
          <p style="font-size:0.8rem;margin-top:0.3rem;">กรุณาเชื่อมต่ออินเทอร์เน็ตเพื่อโหลดแผนที่ OpenStreetMap ในการใช้งานครั้งแรก</p>
        </div>
      </div>
    `;
    return;
  }

  mapInstance = L.map('map-container').setView([13.7563, 100.5018], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapInstance);

  mapMarkersLayer = L.layerGroup().addTo(mapInstance);

  mapInstance.on('click', (e) => {
    findNearbyPhotos(e.latlng.lat, e.latlng.lng);
  });
}

async function loadMap(fit = false) {
  initMap();
  if (!mapInstance) return;

  if (currentMapMode === 'heatmap') {
    renderMapHeatmap(fit);
    return;
  }

  const cat = document.getElementById('map-filter-cat')?.value || '';
  const person = document.getElementById('map-filter-friend')?.value || '';
  const params = new URLSearchParams();
  if (cat) params.set('cat', cat);
  if (person) params.set('person', person);

  try {
    const res = await api('/photos/geo?' + params.toString());
    mapData = res;

    const statsEl = document.getElementById('map-stats-count');
    if (statsEl) {
      statsEl.textContent = `${res.features.length} รูป · ${res.events.length} เหตุการณ์`;
    }

    renderMapMarkers(fit);
  } catch {
    showToast('ไม่สามารถดึงข้อมูลพิกัดภาพถ่ายได้', 'error');
  }
}

async function renderMapHeatmap(fit = false) {
  if (!mapInstance || !mapMarkersLayer) return;
  mapMarkersLayer.clearLayers();

  const cat = document.getElementById('map-filter-cat')?.value || '';
  const params = new URLSearchParams();
  if (cat) params.set('cat', cat);

  try {
    const data = await api('/map?' + params.toString());

    const statsEl = document.getElementById('map-stats-count');
    if (statsEl) {
      statsEl.textContent = `${data.summary.total_gps_photos} รูป · ${data.heatmap.length} จุดความถี่`;
    }

    data.heatmap.forEach((h) => {
      // Color gradient from warm amber to fiery red-orange
      const color = h.intensity > 0.7 ? '#EF4444' : h.intensity > 0.4 ? '#F97316' : '#F0A63C';
      const radiusMeters = Math.max(160, 120 + h.count * 25);

      const circle = L.circle([h.lat, h.lon], {
        radius: radiusMeters,
        fillColor: color,
        fillOpacity: 0.35 + h.intensity * 0.45,
        color: color,
        weight: 1.5,
      });

      const popupHtml = `
        <div class="map-popup-card">
          <div class="map-popup-title" style="color:${color};">🔥 จุดความถี่สูง (${h.count} รูป)</div>
          <div class="map-popup-meta">
            <div>📍 พิกัด: ${formatGps(h.lat, h.lon)}</div>
            <div>⚡ ความหนาแน่น: ${Math.round(h.intensity * 100)}%</div>
          </div>
          <button class="btn btn-sm btn-primary" onclick="findNearbyPhotos(${h.lat}, ${h.lon})" style="width:100%;margin-top:6px;">📍 ดูรูปใกล้เคียง</button>
        </div>
      `;
      circle.bindPopup(popupHtml);
      mapMarkersLayer.addLayer(circle);
    });

    renderTopPlacesList(data.most_visited || []);

    if (fit && data.summary.bounds) {
      mapInstance.fitBounds(
        [
          [data.summary.bounds.min_lat, data.summary.bounds.min_lon],
          [data.summary.bounds.max_lat, data.summary.bounds.max_lon],
        ],
        { padding: [40, 40] }
      );
    }
  } catch (err) {
    console.error('Failed to load heatmap:', err);
    showToast('ไม่สามารถดึงข้อมูลแผนที่ความถี่ได้', 'error');
  }
}

function renderTopPlacesList(places) {
  const container = document.getElementById('map-top-places-list');
  if (!container) return;
  container.replaceChildren();

  if (!places || places.length === 0) {
    container.innerHTML =
      '<p class="muted" style="font-size:0.8rem;text-align:center;padding:1rem;">ยังไม่มีข้อมูลสถานที่ยอดฮิต</p>';
    return;
  }

  places.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'map-top-place-item';
    item.innerHTML = `
      <div class="map-top-place-rank">#${idx + 1}</div>
      <div style="flex:1;min-width:0;">
        <div class="map-top-place-title">${escapeHtml(p.name)}</div>
        <div class="map-top-place-sub">${p.event_count || 1} เหตุการณ์</div>
      </div>
      <div class="map-top-place-count">${p.photo_count} รูป</div>
    `;
    item.addEventListener('click', () => {
      if (mapInstance) {
        mapInstance.flyTo([p.lat, p.lon], 15, { duration: 1 });
        findNearbyPhotos(p.lat, p.lon);
      }
    });
    container.appendChild(item);
  });
}

function renderMapMarkers(fit = false) {
  if (!mapInstance || !mapMarkersLayer || !mapData) return;
  mapMarkersLayer.clearLayers();

  if (currentMapMode === 'photos') {
    // Cluster photos sharing identical or close coordinates (~110m grid)
    const clusterMap = new Map();

    mapData.features.forEach((f) => {
      const [lon, lat] = f.geometry.coordinates;
      const key = `${lat.toFixed(3)}_${lon.toFixed(3)}`;
      if (!clusterMap.has(key)) {
        clusterMap.set(key, { lat, lon, photos: [] });
      }
      clusterMap.get(key).photos.push(f);
    });

    clusterMap.forEach((cluster) => {
      if (cluster.photos.length === 1) {
        const f = cluster.photos[0];
        const [lon, lat] = f.geometry.coordinates;
        const icon = L.divIcon({
          className: 'custom-map-icon',
          html: `<div class="map-photo-pin" title="${escapeHtml(f.properties.filename)}"><img src="/api/thumbs/${f.properties.id}" alt="" /></div>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
          popupAnchor: [0, -20],
        });

        const marker = L.marker([lat, lon], { icon });
        const catsHtml = (f.properties.cats || [])
          .map((c) => `<span class="cat-chip active" style="font-size:0.68rem;padding:1px 6px;">${escapeHtml(c)}</span>`)
          .join(' ');

        const popupContent = `
          <div class="map-popup-card">
            <img src="/api/thumbs/${f.properties.id}" alt="${escapeHtml(f.properties.filename)}" />
            <div class="map-popup-title">${escapeHtml(f.properties.filename)}</div>
            <div class="map-popup-meta">
              <div>📅 ${formatThaiDate(f.properties.taken_at)} ${formatTime(f.properties.taken_at)}</div>
              ${f.properties.event_name ? `<div>🎞️ ${escapeHtml(f.properties.event_name)}</div>` : ''}
              ${catsHtml ? `<div style="margin-top:4px;">${catsHtml}</div>` : ''}
            </div>
            <div style="display:flex; gap:0.4rem;">
              <button class="btn btn-sm btn-primary" onclick="openPhotoModal('${f.properties.id}')" style="flex:1;">🔍 ดูรูปใหญ่</button>
              <button class="btn btn-sm" onclick="findNearbyPhotos(${lat}, ${lon})" title="ค้นหารูปใกล้จุดนี้">📍 ใกล้เคียง</button>
            </div>
          </div>
        `;
        marker.bindPopup(popupContent);
        mapMarkersLayer.addLayer(marker);
      } else {
        // Multi-photo cluster pin (Marker clustering)
        const count = cluster.photos.length;
        const icon = L.divIcon({
          className: 'custom-map-cluster-icon',
          html: `
            <div class="map-cluster-pin" title="${count} รูปภาพในบริเวณนี้">
              <span>${count}</span>
            </div>
          `,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
          popupAnchor: [0, -20],
        });

        const marker = L.marker([cluster.lat, cluster.lon], { icon });

        // Preview grid of up to 4 photos
        let thumbsGrid = '<div style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 4px; margin-bottom: 6px;">';
        cluster.photos.slice(0, 4).forEach((p) => {
          thumbsGrid += `<img src="/api/thumbs/${p.properties.id}" style="width:100%; height:55px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="openPhotoModal('${p.properties.id}')" title="คลิกเพื่อดูรูป" />`;
        });
        thumbsGrid += '</div>';

        const popupContent = `
          <div class="map-popup-card">
            ${thumbsGrid}
            <div class="map-popup-title">📍 กลุ่มภาพ ${count} รูป</div>
            <div class="map-popup-meta">
              <div>📍 พิกัด: ${formatGps(cluster.lat, cluster.lon)}</div>
            </div>
            <div style="display:flex; gap:0.4rem;">
              <button class="btn btn-sm btn-primary" onclick="mapInstance.flyTo([${cluster.lat}, ${cluster.lon}], 17, {duration: 0.8})" style="flex:1;">🔎 ซูมจุดนี้</button>
              <button class="btn btn-sm" onclick="findNearbyPhotos(${cluster.lat}, ${cluster.lon})" title="ค้นหารูปใกล้จุดนี้">📍 ใกล้เคียง</button>
            </div>
          </div>
        `;
        marker.bindPopup(popupContent);
        mapMarkersLayer.addLayer(marker);
      }
    });
  } else {
    mapData.events.forEach((e) => {
      if (e.lat == null || e.lon == null) return;
      const icon = L.divIcon({
        className: 'custom-map-icon',
        html: `<div class="map-event-pin">🎞️ ${escapeHtml(e.name || 'เหตุการณ์')} (${e.photo_count})</div>`,
        iconSize: ['auto', 'auto'],
        iconAnchor: [20, 10],
        popupAnchor: [0, -10],
      });

      const marker = L.marker([e.lat, e.lon], { icon });
      const popupContent = `
        <div class="map-popup-card">
          <div class="map-popup-title">🎞️ ${escapeHtml(e.name || 'เหตุการณ์')}</div>
          <div class="map-popup-meta">
            <div>📍 ${escapeHtml(e.place || formatGps(e.lat, e.lon))}</div>
            <div>📅 ${formatThaiDate(e.ts_start)}</div>
            <div>📸 ${e.photo_count} รูปภาพ</div>
          </div>
          <div style="display:flex; gap:0.4rem;">
            <button class="btn btn-sm btn-primary" onclick="openEventDetail('${e.id}')" style="flex:1;">ดูรายละเอียด</button>
            <button class="btn btn-sm" onclick="findNearbyPhotos(${e.lat}, ${e.lon})" title="ค้นหารูปใกล้จุดนี้">📍 ใกล้เคียง</button>
          </div>
        </div>
      `;
      marker.bindPopup(popupContent);
      mapMarkersLayer.addLayer(marker);
    });
  }

  const layers = mapMarkersLayer.getLayers();
  if (fit && layers.length > 0) {
    const group = L.featureGroup(layers);
    mapInstance.fitBounds(group.getBounds().pad(0.12));
  }
}

async function findNearbyPhotos(lat, lon) {
  if (!mapInstance) return;
  selectedMapCoord = { lat, lng: lon };
  const radius = parseFloat(document.getElementById('map-radius-select')?.value || '2');

  const labelEl = document.getElementById('nearby-radius-label');
  if (labelEl) labelEl.textContent = String(radius);

  if (mapRadiusCircle) {
    mapInstance.removeLayer(mapRadiusCircle);
  }

  mapRadiusCircle = L.circle([lat, lon], {
    radius: radius * 1000,
    color: '#F0A63C',
    fillColor: '#F0A63C',
    fillOpacity: 0.15,
    weight: 2,
  }).addTo(mapInstance);

  const panel = document.getElementById('map-nearby-panel');
  const countEl = document.getElementById('nearby-count');
  const listEl = document.getElementById('nearby-photos-list');

  panel.style.display = 'flex';
  listEl.innerHTML = '<p class="muted" style="font-size:0.8rem;text-align:center;padding:1rem;">กำลังค้นหารูปภาพ...</p>';

  try {
    const cat = document.getElementById('map-filter-cat')?.value || '';
    const person = document.getElementById('map-filter-friend')?.value || '';
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      radius_km: String(radius),
    });
    if (cat) params.set('cat', cat);
    if (person) params.set('person', person);

    const res = await api('/photos/geo?' + params.toString());
    countEl.textContent = `${res.features.length} รูป`;

    if (res.features.length === 0) {
      listEl.innerHTML = '<p class="muted" style="font-size:0.8rem;text-align:center;padding:1rem;">ไม่พบรูปภาพในรัศมีนี้</p>';
      return;
    }

    listEl.replaceChildren();
    res.features.forEach((f) => {
      const p = f.properties;
      const item = document.createElement('div');
      item.className = 'nearby-item';
      const distText = p.distance_km < 1
        ? `${Math.round(p.distance_km * 1000)} ม.`
        : `${p.distance_km} กม.`;

      item.innerHTML = `
        <img src="/api/thumbs/${p.id}" class="nearby-thumb" alt="" />
        <div class="nearby-meta">
          <span class="filename" title="${escapeHtml(p.filename)}">${escapeHtml(p.filename)}</span>
          <span class="muted" style="font-size:0.72rem;">${formatThaiDateShort(p.taken_at)} · ${formatTime(p.taken_at)}</span>
          <span class="dist-badge">ห่าง ${distText}</span>
        </div>
      `;
      item.addEventListener('click', () => openPhotoModal(p.id));
      listEl.appendChild(item);
    });
  } catch {
    listEl.innerHTML = '<p class="muted" style="font-size:0.8rem;text-align:center;padding:1rem;">เกิดข้อผิดพลาดในการค้นหา</p>';
  }
}

// Global exposure for Leaflet popup handlers
window.openPhotoModal = openPhotoModal;
window.openEventDetail = openEventDetail;
window.findNearbyPhotos = findNearbyPhotos;

// ── Stories & Collections View (Phase 1.5A, FR-1001..1006) ───
async function loadStories() {
  try {
    const url = currentStoryFilter
      ? `/collections?type=${encodeURIComponent(currentStoryFilter)}`
      : '/collections';
    const res = await api(url);
    allStories = res.items;

    const countEl = document.getElementById('stories-count');
    if (countEl) countEl.textContent = `${allStories.length} เรื่องราว`;

    const listEl = document.getElementById('stories-list');
    if (!listEl) return;

    if (allStories.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 2rem;">
          <div class="empty-icon">📖</div>
          <h3>ยังไม่มีเรื่องราว</h3>
          <p class="muted">กดปุ่ม "+ สร้างเรื่องราวใหม่" เพื่อรวมภาพตามหัวข้อ โปรเจกต์ หรือความทรงจำ</p>
        </div>
      `;
      return;
    }

    listEl.replaceChildren();
    allStories.forEach((story) => {
      const card = document.createElement('div');
      card.className = 'story-card';

      const typeLabel =
        story.type === 'place_project'
          ? '🏗️ โปรเจกต์'
          : story.type === 'topic'
          ? '📌 หัวข้อ'
          : '🎨 กำหนดเอง';

      card.innerHTML = `
        <div class="story-cover-box">
          ${
            story.cover_photo_id
              ? `<img src="/api/thumbs/${story.cover_photo_id}" alt="${escapeHtml(story.name)}" />`
              : `<div class="story-cover-placeholder">📖</div>`
          }
          <span class="story-badge-count mono">📸 ${story.photo_count} รูป</span>
        </div>
        <div class="story-info">
          <div class="flex-between">
            <span class="type-pill ${story.type}">${typeLabel}</span>
          </div>
          <h3 class="story-title" title="${escapeHtml(story.name)}">${escapeHtml(story.name)}</h3>
          ${story.note ? `<p class="story-note">${escapeHtml(story.note)}</p>` : ''}
        </div>
      `;

      card.addEventListener('click', () => openStoryDetail(story.id));
      listEl.appendChild(card);
    });
  } catch {
    showToast('ไม่สามารถโหลดเรื่องราวได้', 'error');
  }
}

async function openStoryDetail(storyId) {
  try {
    const story = await api(`/collections/${storyId}`);
    currentStoryDetail = story;

    document.getElementById('story-detail-title').textContent = story.name;
    document.getElementById('story-detail-note').textContent = story.note || '';

    const badgeEl = document.getElementById('story-detail-type-badge');
    badgeEl.className = `type-pill ${story.type}`;
    badgeEl.textContent =
      story.type === 'place_project'
        ? '🏗️ โปรเจกต์'
        : story.type === 'topic'
        ? '📌 หัวข้อ'
        : '🎨 กำหนดเอง';

    document.getElementById('story-stat-photos').textContent = String(story.photos.length);
    document.getElementById('story-stat-friends').textContent = `${(story.friends || []).length} คน`;

    if (story.date_span && story.date_span.min && story.date_span.max) {
      document.getElementById('story-stat-span').textContent =
        story.date_span.min === story.date_span.max
          ? formatThaiDateShort(story.date_span.min)
          : `${formatThaiDateShort(story.date_span.min)} – ${formatThaiDateShort(story.date_span.max)}`;
    } else {
      document.getElementById('story-stat-span').textContent = '-';
    }

    const timelineContainer = document.getElementById('story-progress-timeline-container');
    const gridContainer = document.getElementById('story-photos-grid-container');

    if (story.type === 'place_project') {
      timelineContainer.style.display = 'block';
      gridContainer.style.display = 'none';

      const timelineEl = document.getElementById('story-progress-timeline');
      if (story.photos.length === 0) {
        timelineEl.innerHTML = '<p class="muted" style="font-size:0.85rem;">ยังไม่มีรูปภาพในโปรเจกต์นี้</p>';
      } else {
        timelineEl.replaceChildren();
        story.photos.forEach((p, idx) => {
          const item = document.createElement('div');
          item.className = 'progress-timeline-item';
          item.innerHTML = `
            <img src="/api/thumbs/${p.id}" class="progress-thumb" alt="" onclick="openPhotoModal('${p.id}')" />
            <div style="flex:1; min-width:0;">
              <div style="font-weight:600; font-size:0.88rem;">ขั้นตอนที่ ${idx + 1}: ${escapeHtml(p.filename)}</div>
              <div class="muted mono" style="font-size:0.75rem;">📅 ${formatThaiDate(p.taken_at)} ${formatTime(p.taken_at)}</div>
              ${p.event_name ? `<div class="muted" style="font-size:0.75rem;">🎞️ ${escapeHtml(p.event_name)}</div>` : ''}
              ${p.note ? `<div style="font-size:0.8rem; margin-top:0.2rem;">${escapeHtml(p.note)}</div>` : ''}
            </div>
            <button class="btn btn-sm btn-danger" onclick="removePhotoFromStory('${story.id}', '${p.id}')" title="ลบออกจากเรื่องราว">✕</button>
          `;
          timelineEl.appendChild(item);
        });
      }
    } else {
      timelineContainer.style.display = 'none';
      gridContainer.style.display = 'block';

      const photosEl = document.getElementById('story-detail-photos');
      if (story.photos.length === 0) {
        photosEl.innerHTML = '<p class="muted" style="font-size:0.85rem;">ยังไม่มีรูปภาพในเรื่องราวนี้</p>';
      } else {
        photosEl.replaceChildren();
        story.photos.forEach((p) => {
          const card = document.createElement('div');
          card.className = 'photo-card';
          card.style.position = 'relative';
          card.innerHTML = `
            <img src="/api/thumbs/${p.id}" alt="${escapeHtml(p.filename)}" />
            <div class="photo-info mono">
              <span>${formatThaiDateShort(p.taken_at)}</span>
            </div>
            <button class="btn btn-sm btn-danger" style="position:absolute; top:4px; right:4px; padding:2px 6px; font-size:0.7rem; border-radius:4px;" onclick="event.stopPropagation(); removePhotoFromStory('${story.id}', '${p.id}')" title="ลบออกจากเรื่องราว">✕</button>
          `;
          card.addEventListener('click', () => openPhotoModal(p.id));
          photosEl.appendChild(card);
        });
      }
    }

    document.getElementById('modal-story-detail').style.display = 'flex';
  } catch {
    showToast('ไม่สามารถเปิดรายละเอียดเรื่องราวได้', 'error');
  }
}

async function removePhotoFromStory(storyId, photoId) {
  try {
    await api(`/collections/${storyId}/photos/${photoId}`, { method: 'DELETE' });
    showToast('ลบรูปออกจากเรื่องราวเรียบร้อย', 'info');
    openStoryDetail(storyId);
    loadStories();
  } catch {
    showToast('ไม่สามารถลบรูปออกจากเรื่องราวได้', 'error');
  }
}

// ── Suggestions Inbox (Phase 1.5A, Section 8.9 / DR10) ────────
async function loadSuggestions() {
  try {
    const res = await api('/suggestions?status=pending');
    allSuggestions = res.items;

    // Update tab badge
    const badge = document.getElementById('badge-suggestions');
    if (badge) {
      if (allSuggestions.length > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = String(allSuggestions.length);
      } else {
        badge.style.display = 'none';
      }
    }

    const listEl = document.getElementById('suggestions-list');
    if (!listEl) return;

    if (allSuggestions.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="padding: 2.5rem; text-align: center;">
          <div class="empty-icon">✨</div>
          <h3>ไม่มีข้อเสนอแนะค้างอยู่</h3>
          <p class="muted">เมื่อคุณนำเข้ารูปหรือติดแท็ก ระบบจะประมวลผลกฎในเครื่องเพื่อแนะนำเรื่องราวใหม่ๆ ให้คุณที่นี่</p>
          <button class="btn btn-sm btn-primary" onclick="scanSuggestions()" style="margin-top: 0.8rem;">🔄 ตรวจหาข้อเสนอตอนนี้</button>
        </div>
      `;
      return;
    }

    listEl.replaceChildren();
    allSuggestions.forEach((s) => {
      const card = document.createElement('div');
      card.className = 'suggestion-card';

      const p = s.payload || {};
      const icon =
        s.kind === 'face_cluster'
          ? '👤'
          : s.kind === 'collection_create'
          ? '✨'
          : s.kind === 'collection_semantic'
          ? '🧠'
          : s.kind === 'meal'
          ? '🍽️'
          : s.kind === 'place_link'
          ? '📍'
          : '📌';

      let photosPreview = '';
      if (s.kind === 'face_cluster') {
        const photoIds = Array.isArray(p.photo_ids) ? p.photo_ids : [];
        const repCropUrl = p.representative_face_id
          ? `/api/faces/${p.representative_face_id}/crop`
          : (p.cluster_id ? `/api/faces/clusters/${p.cluster_id}/crop` : '');

        photosPreview = `
          <div class="face-cluster-card-body">
            ${repCropUrl ? `
              <div class="face-crop-avatar-box" title="คลิกเพื่อขยายและตรวจดู" onclick="openFaceClusterModal('${s.id}', '${p.cluster_id}', '${escapeHtml(p.suggested_name || '')}')" style="cursor: pointer;">
                <img src="${repCropUrl}" class="face-card-crop-avatar" alt="Face Avatar" onerror="this.parentElement.style.display='none'" />
                <span class="face-crop-tag">ใบหน้าเป้าหมาย</span>
              </div>
            ` : ''}
            <div class="face-card-context-photos">
              <span class="muted" style="font-size: 0.75rem;">พบในรูปภาพตัวอย่าง (${p.photo_count || photoIds.length} รูป):</span>
              <div class="face-card-thumbs-strip">
                ${photoIds.slice(0, 4).map((pid) => `<img src="/api/thumbs/${pid}" class="face-card-thumb" title="คลิกเพื่อขยายดู" onclick="openFaceClusterModal('${s.id}', '${p.cluster_id}', '${escapeHtml(p.suggested_name || '')}')" />`).join('')}
                ${photoIds.length > 4 ? `<span class="muted mono" style="font-size: 0.75rem; margin-left: 4px;">+${photoIds.length - 4}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="face-card-actions-row">
            <input type="text" id="face-name-input-${s.id}" class="input input-sm" placeholder="พิมพ์ชื่อเพื่อน..." style="max-width: 170px;" value="" />
            <button class="btn btn-sm" onclick="openFaceClusterModal('${s.id}', '${p.cluster_id}', '${escapeHtml(p.suggested_name || '')}')">🔍 ขยายดู / ตรวจสอบ</button>
          </div>
        `;
      } else if (s.kind === 'meal' && Array.isArray(p.photo_ids) && p.photo_ids.length > 0) {
        photosPreview = `
          <div style="display: flex; gap: 4px; margin-top: 0.4rem; overflow-x: auto;">
            ${p.photo_ids.slice(0, 4).map((pid) => `<img src="/api/thumbs/${pid}" style="width: 44px; height: 44px; border-radius: 4px; object-fit: cover;" />`).join('')}
            ${p.photo_ids.length > 4 ? `<span class="muted mono" style="align-self: center; font-size: 0.75rem; margin-left: 4px;">+${p.photo_ids.length - 4}</span>` : ''}
          </div>
        `;
      } else if (p.photo_id) {
        photosPreview = `
          <div style="display: flex; gap: 8px; margin-top: 0.4rem; align-items: center;">
            <img src="/api/thumbs/${p.photo_id}" style="width: 44px; height: 44px; border-radius: 4px; object-fit: cover; border: 1px solid var(--line);" />
            ${p.similarity ? `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid #10b981; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px;">ความคล้าย ${p.similarity}%</span>` : ''}
          </div>
        `;
      }

      const title =
        p.title ||
        (s.kind === 'face_cluster'
          ? `พบกลุ่มใบหน้า "${p.suggested_name || 'เพื่อน'}" (${p.photo_count || p.face_count || 0} รูป)`
          : 'ข้อเสนอแนะ');
      const reason =
        p.reason ||
        (s.kind === 'face_cluster'
          ? `ตรวจพบใบหน้าบุคคลเดียวกันในรูปภาพ ${p.photo_count || p.face_count || 0} รูป พิมพ์ชื่อเพื่อนเพื่อเชื่อมโยงเข้าคลังรูปภาพ`
          : '');

      card.innerHTML = `
        <div class="suggestion-icon">${icon}</div>
        <div class="suggestion-content">
          <div class="suggestion-title">${escapeHtml(title)}</div>
          <div class="suggestion-reason">${escapeHtml(reason)}</div>
          ${photosPreview}
        </div>
        <div class="suggestion-actions">
          <button class="btn btn-sm btn-primary" onclick="acceptSuggestion('${s.id}')">✓ ยอมรับ</button>
          <button class="btn btn-sm" onclick="dismissSuggestion('${s.id}')">✕ ข้าม</button>
        </div>
      `;
      listEl.appendChild(card);
    });
  } catch {
    showToast('ไม่สามารถโหลดกล่องข้อเสนอได้', 'error');
  }
}

let currentClusterModalState = {
  suggId: null,
  clusterId: null,
  members: [],
  activeIndex: 0,
};

async function openFaceClusterModal(suggId, clusterId, suggestedName) {
  try {
    currentClusterModalState = {
      suggId,
      clusterId,
      members: [],
      activeIndex: 0,
    };

    const titleEl = document.getElementById('face-cluster-modal-title');
    if (titleEl) titleEl.textContent = `กลุ่มใบหน้า: ${suggestedName || 'เพื่อน'}`;

    const nameInput = document.getElementById('face-cluster-modal-name-input');
    if (nameInput) {
      nameInput.value = suggestedName || '';
      setTimeout(() => nameInput.focus(), 150);
    }

    const modal = document.getElementById('modal-face-cluster');
    if (modal) modal.style.display = 'flex';

    // Fetch cluster members
    const res = await api(`/faces/clusters/${clusterId}`);
    currentClusterModalState.members = res.members || [];

    const photoCountEl = document.getElementById('face-cluster-modal-photo-count');
    if (photoCountEl) photoCountEl.textContent = String(res.photo_count || 0);

    const faceCountEl = document.getElementById('face-cluster-modal-face-count');
    if (faceCountEl) faceCountEl.textContent = String(res.face_count || 0);

    // Set avatar crop
    const avatarEl = document.getElementById('face-cluster-modal-avatar');
    if (avatarEl && res.members.length > 0) {
      avatarEl.src = res.members[0].crop_url;
    }

    // Render thumbnail strip
    const thumbsStrip = document.getElementById('face-cluster-modal-thumbs');
    if (thumbsStrip) {
      thumbsStrip.replaceChildren();
      currentClusterModalState.members.forEach((m, idx) => {
        const img = document.createElement('img');
        img.className = `face-cluster-strip-item ${idx === 0 ? 'active' : ''}`;
        img.src = m.thumb_url;
        img.title = m.filename;
        img.addEventListener('click', () => {
          switchClusterModalPhoto(idx);
        });
        thumbsStrip.appendChild(img);
      });
    }

    // Switch to first member photo
    if (currentClusterModalState.members.length > 0) {
      switchClusterModalPhoto(0);
    }
  } catch (err) {
    console.error('Failed to open face cluster modal:', err);
    showToast('ไม่สามารถเปิดข้อมูลกลุ่มใบหน้าได้', 'error');
  }
}

function switchClusterModalPhoto(index) {
  const member = currentClusterModalState.members[index];
  if (!member) return;
  currentClusterModalState.activeIndex = index;

  // Update strip active class
  const strip = document.getElementById('face-cluster-modal-thumbs');
  if (strip) {
    const items = strip.querySelectorAll('.face-cluster-strip-item');
    items.forEach((item, i) => {
      if (i === index) item.classList.add('active');
      else item.classList.remove('active');
    });
  }

  // Update photo img & info
  const photoImg = document.getElementById('face-cluster-modal-photo-img');
  const bboxEl = document.getElementById('face-cluster-modal-bbox');
  const filenameEl = document.getElementById('face-cluster-modal-filename');
  const avatarEl = document.getElementById('face-cluster-modal-avatar');

  if (filenameEl) filenameEl.textContent = member.filename;
  if (avatarEl && member.crop_url) avatarEl.src = member.crop_url;

  if (photoImg && bboxEl) {
    photoImg.src = `/api/photos/${member.photo_id}/view`;
    photoImg.onerror = () => {
      photoImg.src = member.thumb_url;
    };

    // Position bounding box
    const bbox = member.bbox || { x: 0, y: 0, w: 0.1, h: 0.1 };
    bboxEl.style.left = `${(bbox.x * 100).toFixed(2)}%`;
    bboxEl.style.top = `${(bbox.y * 100).toFixed(2)}%`;
    bboxEl.style.width = `${(bbox.w * 100).toFixed(2)}%`;
    bboxEl.style.height = `${(bbox.h * 100).toFixed(2)}%`;
  }
}

async function acceptSuggestion(id, customName) {
  try {
    let nameVal = '';
    if (typeof customName === 'string' && customName.trim()) {
      nameVal = customName.trim();
    } else {
      const nameInput = document.getElementById(`face-name-input-${id}`);
      if (nameInput) nameVal = nameInput.value.trim();
    }
    const body = nameVal ? { person_name: nameVal } : {};
    await api(`/suggestions/${id}/accept`, {
      method: 'POST',
      body,
    });
    showToast('ยอมรับข้อเสนอเรียบร้อย', 'success');
    closeAllModals();
    loadSuggestions();
    loadStories();
    loadPlaces();
    loadMeals();
    loadPersons();
    updateStatus();
  } catch (err) {
    console.error('Accept suggestion error:', err);
    showToast(err.message || 'ไม่สามารถตอบรับข้อเสนอได้', 'error');
  }
}

async function dismissSuggestion(id) {
  try {
    await api(`/suggestions/${id}/dismiss`, { method: 'POST' });
    showToast('ข้ามข้อเสนอนี้แล้ว (จะไม่แนะนำซ้ำ)', 'info');
    loadSuggestions();
  } catch (err) {
    console.error('Dismiss suggestion error:', err);
    showToast(err.message || 'ไม่สามารถข้ามข้อเสนอได้', 'error');
  }
}

async function scanSuggestions() {
  try {
    showToast('กำลังตรวจหากฎและรูปแบบในเครื่อง...', 'info');
    const res = await api('/suggestions/scan', { method: 'POST' });
    showToast(`ตรวจพบ ${res.added} ข้อเสนอใหม่`, 'success');
    loadSuggestions();
  } catch {
    showToast('ไม่สามารถสแกนข้อเสนอได้', 'error');
  }
}

// ── Places & Project Threads (Phase 1.5B, FR-1201..1205) ─────
async function loadPlaces() {
  try {
    const url = currentPlaceFilter
      ? `/places?type=${encodeURIComponent(currentPlaceFilter)}`
      : '/places';
    const res = await api(url);
    allPlaces = res.items;

    const countEl = document.getElementById('places-count');
    if (countEl) countEl.textContent = `${allPlaces.length} สถานที่`;

    const listEl = document.getElementById('places-list');
    if (!listEl) return;

    if (allPlaces.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 2rem;">
          <div class="empty-icon">📍</div>
          <h3>ยังไม่มีสถานที่บันทึกไว้</h3>
          <p class="muted">กดปุ่ม "+ เพิ่มสถานที่ใหม่" เพื่อบันทึกพิกัดบ้าน ร้านอาหารโปรด หรือโปรเจกต์</p>
        </div>
      `;
      return;
    }

    listEl.replaceChildren();
    allPlaces.forEach((place) => {
      const card = document.createElement('div');
      card.className = 'place-card';

      const typeLabel =
        place.type === 'home'
          ? '🏠 บ้าน/ที่พัก'
          : place.type === 'project'
          ? '🏗️ โปรเจกต์'
          : place.type === 'restaurant'
          ? '🍽️ ร้านอาหาร'
          : place.type === 'visit'
          ? '🚶 แวะเยือน'
          : '📍 อื่นๆ';

      const iconPlaceholder =
        place.type === 'home'
          ? '🏠'
          : place.type === 'project'
          ? '🏗️'
          : place.type === 'restaurant'
          ? '🍽️'
          : place.type === 'visit'
          ? '🚶'
          : '📍';

      card.innerHTML = `
        <div class="place-cover-box">
          ${
            place.latest_photo_id
              ? `<img src="/api/thumbs/${place.latest_photo_id}" alt="${escapeHtml(place.name)}" />`
              : `<div class="place-cover-placeholder">${iconPlaceholder}</div>`
          }
          <span class="place-badge-count mono">📸 ${place.photo_count} รูป</span>
        </div>
        <div class="place-info">
          <div class="flex-between">
            <span class="type-pill ${place.type}">${typeLabel}</span>
            <span class="muted mono" style="font-size:0.75rem;">ไป ${place.visit_count} ครั้ง</span>
          </div>
          <h3 class="place-title" title="${escapeHtml(place.name)}">${escapeHtml(place.name)}</h3>
          ${place.note ? `<p class="place-note">${escapeHtml(place.note)}</p>` : ''}
        </div>
      `;

      card.addEventListener('click', () => openPlaceDetail(place.id));
      listEl.appendChild(card);
    });
  } catch {
    showToast('ไม่สามารถโหลดสถานที่ได้', 'error');
  }
}

async function openPlaceDetail(placeId) {
  try {
    const place = await api(`/places/${placeId}`);
    currentPlaceDetail = place;

    document.getElementById('place-detail-title').textContent = place.name;
    document.getElementById('place-detail-note').textContent = place.note || '';

    const badgeEl = document.getElementById('place-detail-type-badge');
    badgeEl.className = `type-pill ${place.type}`;
    badgeEl.textContent =
      place.type === 'home'
        ? '🏠 บ้าน/ที่พัก'
        : place.type === 'project'
        ? '🏗️ โปรเจกต์'
        : place.type === 'restaurant'
        ? '🍽️ ร้านอาหาร'
        : place.type === 'visit'
        ? '🚶 แวะเยือน'
        : '📍 อื่นๆ';

    document.getElementById('place-stat-photos').textContent = String(place.photos.length);
    document.getElementById('place-stat-visits').textContent = `${place.visit_count} ครั้ง`;
    document.getElementById('place-stat-first').textContent = formatThaiDateShort(place.first_visit);
    document.getElementById('place-stat-last').textContent = formatThaiDateShort(place.last_visit);

    document.getElementById('place-detail-gps').textContent = formatGps(place.lat, place.lon);
    document.getElementById('place-detail-radius').textContent = `${place.radius_m || 120} เมตร`;

    const friendsText = (place.friends || []).map((f) => f.name).join(', ') || 'ไม่มี';
    document.getElementById('place-detail-friends').textContent = friendsText;

    const timelineContainer = document.getElementById('place-progress-timeline-container');
    const gridContainer = document.getElementById('place-photos-grid-container');

    if (place.type === 'project') {
      timelineContainer.style.display = 'block';
      gridContainer.style.display = 'none';

      const timelineEl = document.getElementById('place-progress-timeline');
      if (place.photos.length === 0) {
        timelineEl.innerHTML = '<p class="muted" style="font-size:0.85rem;">ยังไม่มีรูปภาพในโปรเจกต์นี้</p>';
      } else {
        timelineEl.replaceChildren();
        place.photos.forEach((p, idx) => {
          const item = document.createElement('div');
          item.className = 'progress-timeline-item';
          item.innerHTML = `
            <img src="/api/thumbs/${p.id}" class="progress-thumb" alt="" onclick="openPhotoModal('${p.id}')" />
            <div style="flex:1; min-width:0;">
              <div style="font-weight:600; font-size:0.88rem;">ขั้นตอนที่ ${idx + 1}: ${escapeHtml(p.filename)}</div>
              <div class="muted mono" style="font-size:0.75rem;">📅 ${formatThaiDate(p.taken_at)} ${formatTime(p.taken_at)}</div>
              ${p.event_name ? `<div class="muted" style="font-size:0.75rem;">🎞️ ${escapeHtml(p.event_name)}</div>` : ''}
              ${p.note ? `<div style="font-size:0.8rem; margin-top:0.2rem;">${escapeHtml(p.note)}</div>` : ''}
            </div>
            <button class="btn btn-sm btn-danger" onclick="unlinkPhotoFromPlace('${place.id}', '${p.id}')" title="ยกเลิกการผูกรูป">✕</button>
          `;
          timelineEl.appendChild(item);
        });
      }
    } else {
      timelineContainer.style.display = 'none';
      gridContainer.style.display = 'block';

      const photosEl = document.getElementById('place-detail-photos');
      if (place.photos.length === 0) {
        photosEl.innerHTML = '<p class="muted" style="font-size:0.85rem;">ยังไม่มีรูปภาพที่ผูกกับสถานที่นี้</p>';
      } else {
        photosEl.replaceChildren();
        place.photos.forEach((p) => {
          const card = document.createElement('div');
          card.className = 'photo-card';
          card.style.position = 'relative';
          card.innerHTML = `
            <img src="/api/thumbs/${p.id}" alt="${escapeHtml(p.filename)}" />
            <div class="photo-info mono">
              <span>${formatThaiDateShort(p.taken_at)}</span>
            </div>
            <button class="btn btn-sm btn-danger" style="position:absolute; top:4px; right:4px; padding:2px 6px; font-size:0.7rem; border-radius:4px;" onclick="event.stopPropagation(); unlinkPhotoFromPlace('${place.id}', '${p.id}')" title="ยกเลิกการผูก">✕</button>
          `;
          card.addEventListener('click', () => openPhotoModal(p.id));
          photosEl.appendChild(card);
        });
      }
    }

    document.getElementById('modal-place-detail').style.display = 'flex';
  } catch {
    showToast('ไม่สามารถเปิดรายละเอียดสถานที่ได้', 'error');
  }
}

async function unlinkPhotoFromPlace(placeId, photoId) {
  try {
    await api(`/places/${placeId}/photos/${photoId}`, { method: 'DELETE' });
    showToast('ยกเลิกการผูกรูปกับสถานที่เรียบร้อย', 'info');
    openPlaceDetail(placeId);
    loadPlaces();
  } catch {
    showToast('ไม่สามารถยกเลิกการผูกรูปได้', 'error');
  }
}

// ── Meal Diary (Phase 1.5C, FR-1101..1106) ───────────────────
async function loadMeals() {
  try {
    const params = new URLSearchParams();
    if (currentMealFilterType) params.append('type', currentMealFilterType);
    if (currentMealFilterPlace) params.append('place', currentMealFilterPlace);
    if (currentMealFilterMonth) params.append('month', currentMealFilterMonth);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await api(`/meals${queryStr}`);
    allMeals = res.items;

    const countEl = document.getElementById('meals-count');
    if (countEl) countEl.textContent = `${allMeals.length} มื้อ`;

    // Populate filter-meal-place and select-meal-place dropdowns
    const filterPlaceEl = document.getElementById('filter-meal-place');
    const selectPlaceEl = document.getElementById('select-meal-place');

    if (filterPlaceEl && allPlaces.length > 0) {
      const currentSelected = filterPlaceEl.value;
      filterPlaceEl.innerHTML = '<option value="">ทุกร้านอาหาร</option>';
      allPlaces.forEach((pl) => {
        const opt = document.createElement('option');
        opt.value = pl.id;
        opt.textContent = `${pl.name} (${pl.meal_count || 0} มื้อ)`;
        filterPlaceEl.appendChild(opt);
      });
      filterPlaceEl.value = currentSelected;
    }

    if (selectPlaceEl && allPlaces.length > 0) {
      selectPlaceEl.innerHTML = '<option value="">-- เลือกร้านอาหารที่เคยบันทึกไว้ --</option>';
      allPlaces.forEach((pl) => {
        const opt = document.createElement('option');
        opt.value = pl.id;
        opt.textContent = pl.name;
        selectPlaceEl.appendChild(opt);
      });
    }

    const containerEl = document.getElementById('meals-container');
    if (!containerEl) return;

    if (allMeals.length === 0) {
      containerEl.innerHTML = `
        <div class="empty-state" style="padding: 2.5rem; text-align: center;">
          <div class="empty-icon">🍽️</div>
          <h3>ยังไม่มีบันทึกมื้ออาหาร</h3>
          <p class="muted">กดปุ่ม "+ บันทึกมื้ออาหาร" เพื่อเริ่มต้นไดอารี่อาหาร หรือตรวจหาข้อเสนอแนะอัตโนมัติ</p>
        </div>
      `;
      return;
    }

    // Group meals by Month & Year (FR-1104)
    const groupsByMonth = {};
    allMeals.forEach((meal) => {
      let groupKey = 'ไม่มีวันที่';
      let sortKey = 0;
      if (meal.taken_at) {
        const d = new Date(meal.taken_at);
        const y = d.getFullYear();
        const m = d.getMonth();
        groupKey = `${THAI_MONTHS_ABBR[m]} ${y + 543}`;
        sortKey = y * 100 + m;
      }
      if (!groupsByMonth[groupKey]) {
        groupsByMonth[groupKey] = { title: groupKey, sortKey, meals: [] };
      }
      groupsByMonth[groupKey].meals.push(meal);
    });

    containerEl.replaceChildren();
    const sortedGroups = Object.values(groupsByMonth).sort((a, b) => b.sortKey - a.sortKey);

    sortedGroups.forEach((group) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'meals-group';

      const heading = document.createElement('div');
      heading.className = 'meals-month-heading';
      heading.innerHTML = `<span>🗓️ ${escapeHtml(group.title)}</span> <span class="muted" style="font-size: 0.8rem; font-weight: normal;">(${group.meals.length} มื้อ)</span>`;
      groupEl.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'meals-grid';

      group.meals.forEach((meal) => {
        const card = document.createElement('div');
        card.className = 'meal-card';

        const mealTypeTh =
          meal.meal_type === 'breakfast'
            ? '🍳 เช้า'
            : meal.meal_type === 'lunch'
            ? '🍲 กลางวัน'
            : meal.meal_type === 'dinner'
            ? '🍷 เย็น'
            : meal.meal_type === 'cafe'
            ? '☕ คาเฟ่'
            : '🍽️ อื่นๆ';

        const ratingStars = meal.rating ? '⭐'.repeat(meal.rating) : '';
        const restaurantName = meal.place_name || 'ร้านอาหารไม่ระบุชื่อ';
        const dateStr = formatThaiDateShort(meal.taken_at);
        const timeStr = formatTime(meal.taken_at);

        let companionsHtml = '';
        if (meal.companions && meal.companions.length > 0) {
          companionsHtml = `
            <div class="meal-companions-row">
              <span class="muted" style="font-size: 0.75rem;">ร่วมกับ:</span>
              ${meal.companions
                .map(
                  (c) =>
                    `<span class="tag-chip" style="font-size: 0.72rem; padding: 1px 6px;"><span class="cat-dot" style="background-color: ${c.color || '#E56B50'}; width: 6px; height: 6px;"></span>${escapeHtml(c.name)}</span>`
                )
                .join('')}
            </div>
          `;
        }

        let photoStripHtml = '';
        if (meal.photos && meal.photos.length > 0) {
          photoStripHtml = `
            <div class="meal-photo-strip">
              ${meal.photos
                .map(
                  (p) =>
                    `<img class="meal-photo-thumb" src="/api/thumbs/${p.id}" alt="dish" onclick="event.stopPropagation(); openPhotoModal('${p.id}');" />`
                )
                .join('')}
            </div>
          `;
        }

        card.innerHTML = `
          <div class="meal-header-row">
            <div>
              <span class="type-pill ${meal.meal_type}" style="margin-bottom: 0.25rem;">${mealTypeTh}</span>
              <div class="meal-restaurant-name">${escapeHtml(restaurantName)}</div>
            </div>
            ${ratingStars ? `<span style="font-size: 0.85rem; color: #F0A63C;">${ratingStars}</span>` : ''}
          </div>
          <div class="meal-body">
            <div class="meal-meta-row mono">
              <span>📅 ${dateStr}</span>
              <span>⏰ ${timeStr}</span>
              <span>📸 ${meal.photo_count} รูป</span>
            </div>
            ${meal.note ? `<div class="meal-note-text">${escapeHtml(meal.note)}</div>` : ''}
            ${companionsHtml}
          </div>
          ${photoStripHtml}
        `;

        card.addEventListener('click', () => openMealDetail(meal.id));
        grid.appendChild(card);
      });

      groupEl.appendChild(grid);
      containerEl.appendChild(groupEl);
    });
  } catch {
    showToast('ไม่สามารถโหลดไดอารี่อาหารได้', 'error');
  }
}

async function openMealDetail(mealId) {
  try {
    const meal = await api(`/meals/${mealId}`);
    currentMealDetail = meal;

    document.getElementById('meal-detail-title').textContent = meal.place_name || 'ร้านอาหารไม่ระบุชื่อ';

    const typeBadge = document.getElementById('meal-detail-type-badge');
    typeBadge.className = `type-pill ${meal.meal_type}`;
    typeBadge.textContent =
      meal.meal_type === 'breakfast'
        ? '🍳 เช้า'
        : meal.meal_type === 'lunch'
        ? '🍲 กลางวัน'
        : meal.meal_type === 'dinner'
        ? '🍷 เย็น'
        : meal.meal_type === 'cafe'
        ? '☕ คาเฟ่'
        : '🍽️ อื่นๆ';

    document.getElementById('meal-detail-rating').textContent = meal.rating ? '⭐'.repeat(meal.rating) : '';
    document.getElementById('meal-detail-date').textContent = `${formatThaiDate(meal.taken_at)} ${formatTime(meal.taken_at)}`;
    document.getElementById('meal-detail-event').textContent = meal.event_name || 'ไม่มีเหตุการณ์';

    const compText = (meal.companions || []).map((c) => c.name).join(', ') || 'ไม่มี';
    document.getElementById('meal-detail-companions').textContent = compText;

    const noteEl = document.getElementById('meal-detail-note');
    if (meal.note) {
      noteEl.style.display = 'block';
      noteEl.textContent = meal.note;
    } else {
      noteEl.style.display = 'none';
    }

    document.getElementById('meal-detail-photo-count').textContent = String(meal.photos.length);

    const photosGrid = document.getElementById('meal-detail-photos');
    photosGrid.replaceChildren();
    meal.photos.forEach((photo) => {
      const card = document.createElement('div');
      card.className = 'photo-card';
      card.innerHTML = `<img src="/api/thumbs/${photo.id}" alt="${escapeHtml(photo.filename)}" />`;
      card.addEventListener('click', () => {
        closeAllModals();
        openPhotoModal(photo.id);
      });
      photosGrid.appendChild(card);
    });

    document.getElementById('modal-meal-detail').style.display = 'flex';
  } catch {
    showToast('ไม่สามารถเปิดรายละเอียดมื้ออาหารได้', 'error');
  }
}

// ── Recap View (Phase 1.5D, FR-1301..1304) ───────────────────
let currentRecapYear = 2026;
let currentRecapMonth = 11;
let currentRecapData = null;

async function loadRecap(year, month, forceFresh = false) {
  const container = document.getElementById('recap-card-container');
  if (!container) return;

  container.innerHTML = '<div class="muted" style="text-align: center; padding: 2rem;">กำลังสร้างและประมวลผลเรื่องราว...</div>';

  try {
    const url = `/recaps/${year}/${month}${forceFresh ? '?fresh=1' : ''}`;
    const recap = await api(url);
    currentRecapData = recap;

    const content = recap.content || {};
    const highlights = content.highlights || [];
    const friends = content.friends || [];
    const places = content.places || [];
    const topMeal = content.top_meal;

    let staleHtml = '';
    if (recap.stale) {
      staleHtml = `
        <div class="recap-stale-banner">
          <span>⚠️ มีรูปภาพใหม่ในช่วงเวลานี้ — แนะนำให้กดสร้างใหม่เพื่ออัปเดตเรื่องราว</span>
          <button class="btn btn-sm btn-primary" onclick="loadRecap(${year}, ${month}, true)">อัปเดตตอนนี้</button>
        </div>
      `;
    }

    let highlightsHtml = '';
    if (highlights.length > 0) {
      highlightsHtml = `
        <div class="recap-section">
          <div class="recap-section-title">⭐ ไฮไลต์ภาพคัดสรร (${highlights.length} ภาพ)</div>
          <div class="recap-highlights-grid">
            ${highlights
              .map(
                (h) => `
                <div class="recap-highlight-card" onclick="openPhotoModal('${h.id}')">
                  <img class="recap-highlight-thumb" src="/api/thumbs/${h.id}" alt="${escapeHtml(h.filename)}" loading="lazy" />
                  <div class="recap-highlight-note">${escapeHtml(h.note || h.filename)}</div>
                </div>
              `
              )
              .join('')}
          </div>
        </div>
      `;
    }

    let friendsHtml = '';
    if (friends.length > 0) {
      friendsHtml = `
        <div class="recap-section">
          <div class="recap-section-title">👥 เพื่อนที่พบเจอ</div>
          <div class="recap-badges">
            ${friends
              .map(
                (f) => `
                <span class="recap-badge" style="border-left: 3px solid ${f.color || '#E56B50'}">
                  ${escapeHtml(f.name)} <span class="muted" style="margin-left: 4px;">(${f.count})</span>
                </span>
              `
              )
              .join('')}
          </div>
        </div>
      `;
    }

    let placesHtml = '';
    if (places.length > 0) {
      placesHtml = `
        <div class="recap-section">
          <div class="recap-section-title">📍 สถานที่ที่ไปเยือน</div>
          <div class="recap-badges">
            ${places
              .map(
                (p) => `
                <span class="recap-badge">📍 ${escapeHtml(p.name)}</span>
              `
              )
              .join('')}
          </div>
        </div>
      `;
    }

    let topMealHtml = '';
    if (topMeal) {
      const ratingStars = topMeal.rating ? ' ⭐'.repeat(topMeal.rating) : '';
      topMealHtml = `
        <div class="recap-section">
          <div class="recap-section-title">🍽️ มื้อเด่นประจำช่วงเวลา</div>
          <div class="recap-top-meal">
            <div><strong>${escapeHtml(topMeal.place_name)}</strong> — ${escapeHtml(topMeal.meal_type)} ${ratingStars}</div>
            ${topMeal.note ? `<div class="muted" style="margin-top: 0.3rem; font-size: 0.88rem;">${escapeHtml(topMeal.note)}</div>` : ''}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="recap-card">
        ${staleHtml}
        <div class="recap-header-box">
          <div class="recap-headline">${escapeHtml(content.headline || 'สรุปความทรงจำ')}</div>
          <div class="recap-stats-line">${escapeHtml(content.stats_summary || '')}</div>
        </div>

        <div class="recap-narrative-box">
          ${escapeHtml(content.narrative || 'ยังไม่มีข้อมูลสำหรับช่วงเวลานี้')}
        </div>

        ${highlightsHtml}
        ${friendsHtml}
        ${placesHtml}
        ${topMealHtml}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="muted" style="text-align: center; padding: 2rem;">ไม่สามารถสร้างสรุปความทรงจำได้: ${escapeHtml(err.message || 'เกิดข้อผิดพลาด')}</div>`;
  }
}

function exportRecap(format) {
  const url = `/api/recaps/${currentRecapYear}/${currentRecapMonth}/export?format=${encodeURIComponent(format)}`;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Global exposure for event handlers
window.openStoryDetail = openStoryDetail;
window.removePhotoFromStory = removePhotoFromStory;
window.openPlaceDetail = openPlaceDetail;
window.unlinkPhotoFromPlace = unlinkPhotoFromPlace;
window.openMealDetail = openMealDetail;
window.acceptSuggestion = acceptSuggestion;
window.dismissSuggestion = dismissSuggestion;
window.scanSuggestions = scanSuggestions;
window.loadRecap = loadRecap;
window.exportRecap = exportRecap;

// ── Modals Close & Keyboard Navigation (FR-402, AC-15) ────────
function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach((m) => {
    if (m.id !== 'overlay-progress') {
      m.style.display = 'none';
    }
  });
}

// ── Init Function ────────────────────────────────────────────
async function init() {
  try {
    settings = await api('/settings');
  } catch {
    settings = {};
  }

  initTheme();

  // Tab buttons
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Theme switcher
  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });

  // ML Semantic Search Toggle Button (Phase 2, FR-603)
  const mlBtn = document.getElementById('btn-toggle-ml');
  const mlLabel = document.getElementById('label-ml-status');
  function updateMlButtonLabel() {
    const isMl = settings.ml_enabled !== '0';
    if (mlLabel) mlLabel.textContent = isMl ? 'เปิด' : 'ปิด';
    if (mlBtn) mlBtn.style.opacity = isMl ? '1' : '0.6';
  }
  updateMlButtonLabel();

  async function checkEmbedStatus() {
    try {
      const stats = await api('/embed/stats');
      if (stats.pending > 0) {
        if (mlLabel) mlLabel.textContent = `ประมวลผล (${stats.embedded_photos}/${stats.total_photos})`;
        setTimeout(checkEmbedStatus, 3000);
      } else {
        updateMlButtonLabel();
      }
    } catch {}
  }
  checkEmbedStatus();

  mlBtn?.addEventListener('click', async () => {
    const cur = settings.ml_enabled !== '0';
    const next = cur ? '0' : '1';
    try {
      await api('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ ml_enabled: next }),
      });
      settings.ml_enabled = next;
      updateMlButtonLabel();
      showToast(
        next === '1'
          ? 'เปิดการค้นหาด้วยความหมาย (Semantic Search) แล้ว'
          : 'ปิดการค้นหาด้วยความหมาย (ใช้ FTS คีย์เวิร์ดตรงเท่านั้น)',
        'info'
      );
      if (currentTab === 'photos') loadPhotos();
    } catch {
      showToast('ไม่สามารถเปลี่ยนการตั้งค่าได้', 'error');
    }
  });

  // Setup Voice Input buttons (Web Speech API th-TH)
  setupVoiceInput(document.getElementById('btn-voice-photo-note'), document.getElementById('photo-modal-note'));
  setupVoiceInput(document.getElementById('btn-voice-event-name'), document.getElementById('event-edit-name'));
  setupVoiceInput(document.getElementById('btn-voice-event-place'), document.getElementById('event-edit-place'));
  setupVoiceInput(document.getElementById('btn-voice-event-note'), document.getElementById('event-edit-note'));
  setupVoiceInput(document.getElementById('btn-voice-friend-name'), document.getElementById('input-friend-name'));
  setupVoiceInput(document.getElementById('btn-voice-friend-nick'), document.getElementById('input-friend-nick'));
  setupVoiceInput(document.getElementById('btn-voice-friend-note'), document.getElementById('input-friend-note'));
  setupVoiceInput(document.getElementById('btn-voice-story-name'), document.getElementById('input-story-name'));
  setupVoiceInput(document.getElementById('btn-voice-story-note'), document.getElementById('input-story-note'));
  setupVoiceInput(document.getElementById('btn-voice-place-name'), document.getElementById('input-place-name'));
  setupVoiceInput(document.getElementById('btn-voice-place-note'), document.getElementById('input-place-note'));
  setupVoiceInput(document.getElementById('btn-voice-meal-note'), document.getElementById('input-meal-note'));

  // Close buttons for modals
  document.getElementById('btn-close-photo-modal')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-event-modal')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-event-footer')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-friend-detail')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-friend-footer')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-add-friend')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-cancel-add-friend')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-create-story')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-cancel-create-story')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-story-detail')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-story-footer')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-create-place')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-cancel-create-place')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-place-detail')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-place-footer')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-create-meal')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-cancel-create-meal')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-meal-detail')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-meal-footer')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-import')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-cancel-import')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-face-cluster')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-face-cluster-footer')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-face-cluster-accept')?.addEventListener('click', async () => {
    if (!currentClusterModalState.suggId) return;
    const nameInput = document.getElementById('face-cluster-modal-name-input');
    const nameVal = nameInput ? nameInput.value.trim() : '';
    await acceptSuggestion(currentClusterModalState.suggId, nameVal);
  });
  document.getElementById('btn-face-cluster-dismiss')?.addEventListener('click', async () => {
    if (!currentClusterModalState.suggId) return;
    await dismissSuggestion(currentClusterModalState.suggId);
    closeAllModals();
  });

  // Backdrop click closes modals
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && backdrop.id !== 'overlay-progress') {
        closeAllModals();
      }
    });
  });

  // Prev / Next Navigation on Photo Modal
  document.getElementById('btn-photo-prev')?.addEventListener('click', () => {
    if (activePhotoIndex > 0) {
      activePhotoIndex--;
      openPhotoModal(loadedPhotos[activePhotoIndex].id);
    }
  });
  document.getElementById('btn-photo-next')?.addEventListener('click', () => {
    if (activePhotoIndex < loadedPhotos.length - 1) {
      activePhotoIndex++;
      openPhotoModal(loadedPhotos[activePhotoIndex].id);
    }
  });

  // Global Keyboard Navigation (Esc to close, Arrow keys for photo modal)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    } else if (document.getElementById('modal-photo').style.display === 'flex') {
      if (e.key === 'ArrowLeft' && activePhotoIndex > 0) {
        activePhotoIndex--;
        openPhotoModal(loadedPhotos[activePhotoIndex].id);
      } else if (e.key === 'ArrowRight' && activePhotoIndex < loadedPhotos.length - 1) {
        activePhotoIndex++;
        openPhotoModal(loadedPhotos[activePhotoIndex].id);
      }
    }
  });

  // Save Note on Photo
  document.getElementById('btn-save-photo-note')?.addEventListener('click', async () => {
    if (activePhotoIndex >= 0 && loadedPhotos[activePhotoIndex]) {
      const photoId = loadedPhotos[activePhotoIndex].id;
      const note = document.getElementById('photo-modal-note').value;
      await api(`/photos/${photoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ note }),
      });
      showToast('บันทึกโน้ตเรียบร้อย', 'success');
      loadPhotos();
    }
  });

  // Save Date on Photo
  document.getElementById('btn-save-date')?.addEventListener('click', async () => {
    if (activePhotoIndex >= 0 && loadedPhotos[activePhotoIndex]) {
      const photoId = loadedPhotos[activePhotoIndex].id;
      const dateVal = document.getElementById('input-edit-date').value;
      if (!dateVal) {
        showToast('กรุณาระบุวันที่', 'error');
        return;
      }
      const newMs = new Date(dateVal).getTime();
      await api(`/photos/${photoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ taken_at: newMs }),
      });
      showToast('ปรับปรุงวันที่และจัดกลุ่มเหตุการณ์ใหม่เรียบร้อย', 'success');
      openPhotoModal(photoId);
      loadPhotos();
      updateStatus();
    }
  });

  // Delete Photo action (FR-405)
  document.getElementById('btn-delete-photo')?.addEventListener('click', async () => {
    if (activePhotoIndex >= 0 && loadedPhotos[activePhotoIndex]) {
      const photo = loadedPhotos[activePhotoIndex];
      const ok = confirm(`ลบรูป "${photo.filename}" ออกจากคลัง?\n\n(ไฟล์ต้นฉบับในเครื่องของคุณจะไม่ถูกลบเด็ดขาด)`);
      if (ok) {
        await api(`/photos/${photo.id}`, { method: 'DELETE' });
        closeAllModals();
        showToast('ลบรูปออกจากคลังเรียบร้อย', 'info');
        loadPhotos();
        updateStatus();
      }
    }
  });

  // Save Event Details
  document.getElementById('btn-save-event')?.addEventListener('click', async () => {
    if (!currentEventDetail) return;
    const name = document.getElementById('event-edit-name').value.trim();
    const place = document.getElementById('event-edit-place').value.trim();
    const note = document.getElementById('event-edit-note').value.trim();

    await api(`/events/${currentEventDetail.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, place, note }),
    });
    closeAllModals();
    showToast('บันทึกข้อมูลเหตุการณ์เรียบร้อย', 'success');
    loadEvents();
  });

  // Delete Friend action (FR-505)
  document.getElementById('btn-delete-friend')?.addEventListener('click', async () => {
    if (!currentFriendDetail) return;
    const ok = confirm(`ต้องการลบ "${currentFriendDetail.name}" ออกจากรายชื่อเพื่อน?\n\n(รูปภาพทั้งหมดที่ถ่ายร่วมกันจะยังคงอยู่ตามเดิม)`);
    if (ok) {
      await api(`/persons/${currentFriendDetail.id}`, { method: 'DELETE' });
      closeAllModals();
      showToast(`ลบเพื่อนเรียบร้อย`, 'info');
      loadFriends();
      updateStatus();
    }
  });

  // Shared Album "X & ME" (FR-1402)
  document.getElementById('btn-friend-shared-album')?.addEventListener('click', () => {
    if (!currentFriendDetail) return;
    window.open(`/api/persons/${currentFriendDetail.id}/album/export?format=html`, '_blank');
  });

  // Add friend button
  document.getElementById('btn-add-friend')?.addEventListener('click', openAddFriendModal);

  // Social Graph toggle button (FR-1403)
  document.getElementById('btn-toggle-social-graph')?.addEventListener('click', () => {
    const container = document.getElementById('social-graph-container');
    if (!container) return;
    const isVisible = container.style.display !== 'none';
    if (isVisible) {
      container.style.display = 'none';
      if (socialGraphAnimId) {
        cancelAnimationFrame(socialGraphAnimId);
        socialGraphAnimId = null;
      }
    } else {
      loadSocialGraph();
    }
  });

  document.getElementById('btn-close-social-graph')?.addEventListener('click', () => {
    const container = document.getElementById('social-graph-container');
    if (container) container.style.display = 'none';
    if (socialGraphAnimId) {
      cancelAnimationFrame(socialGraphAnimId);
      socialGraphAnimId = null;
    }
  });

  // Scan faces button (Phase 3)
  document.getElementById('btn-scan-faces')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-scan-faces');
    const originalText = btn ? btn.textContent : '🔍 ตรวจจับใบหน้า';
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ กำลังตรวจจับใบหน้า...';
      }
      const res = await api('/faces', { method: 'POST' });
      showToast('กำลังสแกนและจัดกลุ่มใบหน้าในพื้นหลัง...', 'info');
      pollJob(res.jobId, (job) => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalText;
        }
        if (job && job.status === 'error') {
          showToast(`เกิดข้อผิดพลาดในการตรวจจับใบหน้า: ${job.error || 'ไม่ทราบสาเหตุ'}`, 'error');
        } else {
          showToast(`ตรวจจับและจัดกลุ่มใบหน้าเรียบร้อยแล้ว (พบ ${job?.added || 0} ใบหน้า)`, 'success');
          loadSuggestions();
          loadFriends();
        }
      });
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      showToast('ไม่สามารถเริ่มงานตรวจจับใบหน้าได้', 'error');
    }
  });

  // Review Queue Jump Buttons (FR-704)
  document.getElementById('btn-jump-dateless')?.addEventListener('click', () => {
    photoFilters.gps = 'nodate';
    document.getElementById('filter-gps').value = 'nodate';
    switchTab('photos');
  });
  document.getElementById('btn-jump-unnamed')?.addEventListener('click', () => {
    switchTab('events');
  });
  document.getElementById('btn-jump-burst')?.addEventListener('click', () => {
    photoFilters.burst = true;
    document.getElementById('filter-burst').checked = true;
    switchTab('photos');
  });
  document.getElementById('btn-tray-view-dateless')?.addEventListener('click', () => {
    photoFilters.gps = 'nodate';
    document.getElementById('filter-gps').value = 'nodate';
    switchTab('photos');
  });

  // Category Filter Chips in Photos View (Appendix B)
  const filterCatsContainer = document.getElementById('filter-cats');
  CATEGORIES.forEach((cat) => {
    const chip = document.createElement('span');
    chip.className = 'cat-chip';
    chip.innerHTML = `<span class="cat-dot" style="background-color: ${cat.color};"></span>${cat.id}`;
    chip.addEventListener('click', () => {
      if (photoFilters.cat === cat.id) {
        photoFilters.cat = '';
        chip.classList.remove('active');
      } else {
        photoFilters.cat = cat.id;
        filterCatsContainer.querySelectorAll('.cat-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
      }
      loadPhotos(1);
    });
    filterCatsContainer.appendChild(chip);
  });

  // Filter Dropdowns
  document.getElementById('filter-friend')?.addEventListener('change', (e) => {
    photoFilters.person = e.target.value;
    loadPhotos(1);
  });
  document.getElementById('filter-month')?.addEventListener('change', (e) => {
    photoFilters.month = e.target.value;
    loadPhotos(1);
  });
  document.getElementById('filter-gps')?.addEventListener('change', (e) => {
    photoFilters.gps = e.target.value;
    loadPhotos(1);
  });
  document.getElementById('filter-burst')?.addEventListener('change', (e) => {
    photoFilters.burst = e.target.checked;
    loadPhotos(1);
  });

  // Clear filters
  document.getElementById('btn-clear-filters')?.addEventListener('click', () => {
    photoFilters.cat = '';
    photoFilters.person = '';
    photoFilters.month = '';
    photoFilters.gps = '';
    photoFilters.burst = false;
    photoFilters.q = '';

    filterCatsContainer.querySelectorAll('.cat-chip').forEach((c) => c.classList.remove('active'));
    document.getElementById('filter-friend').value = '';
    document.getElementById('filter-month').value = '';
    document.getElementById('filter-gps').value = '';
    document.getElementById('filter-burst').checked = false;
    document.getElementById('input-global-search').value = '';
    loadPhotos(1);
  });

  // Photos pagination controls
  document.getElementById('photos-per-page')?.addEventListener('change', (e) => {
    photosPerPage = Number(e.target.value) || 40;
    loadPhotos(1);
  });

  document.getElementById('btn-photos-first')?.addEventListener('click', () => {
    if (photosCurrentPage > 1) {
      loadPhotos(1);
    }
  });

  document.getElementById('btn-photos-prev')?.addEventListener('click', () => {
    if (photosCurrentPage > 1) {
      loadPhotos(photosCurrentPage - 1);
    }
  });

  document.getElementById('btn-photos-next')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(photosTotalCount / photosPerPage));
    if (photosCurrentPage < totalPages) {
      loadPhotos(photosCurrentPage + 1);
    }
  });

  document.getElementById('btn-photos-last')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(photosTotalCount / photosPerPage));
    if (photosCurrentPage < totalPages) {
      loadPhotos(totalPages);
    }
  });

  // Global search input (debounce)
  let searchTimer = null;
  document.getElementById('input-global-search')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      photoFilters.q = e.target.value.trim();
      switchTab('photos');
    }, 350);
  });

  // Import Dialog controls
  document.querySelectorAll('.btn-open-import').forEach((b) => {
    b.addEventListener('click', () => {
      document.getElementById('modal-import').style.display = 'flex';
      document.getElementById('import-folder-path').focus();
    });
  });
  document.getElementById('btn-fill-photo')?.addEventListener('click', () => {
    document.getElementById('import-folder-path').value = 'photo';
  });
  document.getElementById('btn-fill-fixtures')?.addEventListener('click', () => {
    document.getElementById('import-folder-path').value = 'test/fixtures/photos';
  });
  document.getElementById('btn-quick-photo')?.addEventListener('click', () => {
    startImport('photo');
  });
  document.getElementById('btn-quick-fixtures')?.addEventListener('click', () => {
    startImport('test/fixtures/photos');
  });
  document.getElementById('btn-start-import')?.addEventListener('click', () => {
    const val = document.getElementById('import-folder-path').value;
    startImport(val);
  });

  // ── Data Management, Open Export & Watch Folder (Phase 5 FR-1410 & FR-1411) ──
  async function refreshWatchStatus() {
    try {
      const res = await api('/watch');
      const checkEl = document.getElementById('check-watch-enabled');
      const folderEl = document.getElementById('input-watch-folder-path');
      const badgeEl = document.getElementById('badge-watch-status');
      if (checkEl) checkEl.checked = !!res.enabled;
      if (folderEl && res.folder) folderEl.value = res.folder;
      if (badgeEl) {
        if (res.status === 'watching') {
          badgeEl.textContent = '🟢 กำลังเฝ้าดู';
          badgeEl.style.background = 'rgba(74, 222, 128, 0.2)';
          badgeEl.style.color = '#4ade80';
        } else {
          badgeEl.textContent = '⚪ ปิดอยู่';
          badgeEl.style.background = 'var(--bg-hover)';
          badgeEl.style.color = 'var(--text-muted)';
        }
      }
    } catch {}
  }

  document.getElementById('btn-open-manage-data')?.addEventListener('click', () => {
    document.getElementById('modal-manage-data').style.display = 'flex';
    refreshWatchStatus();
  });

  const closeManageDataModal = () => {
    const modal = document.getElementById('modal-manage-data');
    if (modal) modal.style.display = 'none';
  };
  document.getElementById('btn-close-manage-data')?.addEventListener('click', closeManageDataModal);
  document.getElementById('btn-close-manage-data-footer')?.addEventListener('click', closeManageDataModal);

  // Open-Format Exports (FR-1410)
  document.getElementById('btn-export-json')?.addEventListener('click', () => {
    window.open('/api/export?format=json', '_blank');
  });
  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    window.open('/api/export?format=csv', '_blank');
  });
  document.getElementById('btn-export-geojson')?.addEventListener('click', () => {
    window.open('/api/export?format=geojson', '_blank');
  });
  document.getElementById('btn-export-xmp')?.addEventListener('click', async () => {
    try {
      const statusEl = document.getElementById('xmp-export-status');
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.textContent = 'กำลังเขียนไฟล์ XMP Sidecar...';
      }
      const res = await api('/export/xmp', { method: 'POST' });
      showToast(res.message, 'success');
      if (statusEl) {
        statusEl.textContent = `✓ ${res.message}`;
      }
    } catch {
      showToast('ไม่สามารถเขียนไฟล์ XMP ได้', 'error');
    }
  });

  // Watch Folder controls (FR-1411)
  document.getElementById('btn-save-watch-settings')?.addEventListener('click', async () => {
    const enabled = document.getElementById('check-watch-enabled')?.checked || false;
    const folder = document.getElementById('input-watch-folder-path')?.value.trim() || 'photo';
    try {
      await api('/watch', {
        method: 'POST',
        body: JSON.stringify({ enabled, folder }),
      });
      refreshWatchStatus();
      showToast(enabled ? `เปิดเฝ้าดูโฟลเดอร์ "${folder}" เรียบร้อย` : 'ปิดการเฝ้าดูโฟลเดอร์เรียบร้อย', 'success');
    } catch (err) {
      showToast(err.message || 'ไม่สามารถบันทึกการตั้งค่าโฟลเดอร์ได้', 'error');
    }
  });

  document.getElementById('btn-trigger-watch-scan')?.addEventListener('click', async () => {
    try {
      showToast('กำลังตรวจสอบรูปภาพใหม่...', 'info');
      const res = await api('/watch/scan', { method: 'POST' });
      if (res.new_photos_found > 0) {
        showToast(`พบรูปภาพใหม่ ${res.new_photos_found} รูป กำลังนำเข้าสู่ระบบ...`, 'success');
        updateStatus();
      } else {
        showToast('ไม่พบรูปภาพใหม่เพิ่มเติมในโฟลเดอร์', 'info');
      }
      refreshWatchStatus();
    } catch {
      showToast('ไม่สามารถสแกนโฟลเดอร์ได้', 'error');
    }
  });

  // Database Backup & Restore (FR-801, FR-802)
  document.getElementById('btn-backup-db-json')?.addEventListener('click', () => {
    window.open('/api/backup', '_blank');
  });

  document.getElementById('btn-restore-db-json-trigger')?.addEventListener('click', () => {
    document.getElementById('file-restore-db-input')?.click();
  });

  document.getElementById('file-restore-db-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const backupData = JSON.parse(text);
      showToast('กำลังกู้คืนข้อมูล...', 'info');
      const res = await api('/restore', {
        method: 'POST',
        body: JSON.stringify(backupData),
      });
      showToast(`กู้คืนเรียบร้อย: ${res.matched_photos} รูป, ${res.events_restored} เหตุการณ์, ${res.persons_restored} เพื่อน`, 'success');
      loadDashboard();
      loadEvents();
      loadPhotos();
      loadFriends();
      updateStatus();
      closeManageDataModal();
    } catch {
      showToast('ไฟล์สำรองไม่ถูกต้องหรือไม่สามารถกู้คืนได้', 'error');
    } finally {
      e.target.value = '';
    }
  });

  // Recluster button
  document.getElementById('btn-recluster')?.addEventListener('click', async () => {
    try {
      showToast('กำลังจัดกลุ่มเหตุการณ์ใหม่...', 'info');
      const res = await api('/recluster', { method: 'POST' });
      showToast(`จัดกลุ่มเรียบร้อย: ${res.events} เหตุการณ์ จาก ${res.photos} รูป`, 'success');
      loadEvents();
      updateStatus();
    } catch {
      showToast('ไม่สามารถจัดกลุ่มใหม่ได้', 'error');
    }
  });

  // Map toolbar controls (Phase 1E & Phase 5 FR-1406)
  document.getElementById('btn-map-mode-photos')?.addEventListener('click', () => {
    currentMapMode = 'photos';
    document.getElementById('btn-map-mode-photos')?.classList.add('active');
    document.getElementById('btn-map-mode-events')?.classList.remove('active');
    document.getElementById('btn-map-mode-heatmap')?.classList.remove('active');
    renderMapMarkers();
  });
  document.getElementById('btn-map-mode-events')?.addEventListener('click', () => {
    currentMapMode = 'events';
    document.getElementById('btn-map-mode-events')?.classList.add('active');
    document.getElementById('btn-map-mode-photos')?.classList.remove('active');
    document.getElementById('btn-map-mode-heatmap')?.classList.remove('active');
    renderMapMarkers();
  });
  document.getElementById('btn-map-mode-heatmap')?.addEventListener('click', () => {
    currentMapMode = 'heatmap';
    document.getElementById('btn-map-mode-heatmap')?.classList.add('active');
    document.getElementById('btn-map-mode-photos')?.classList.remove('active');
    document.getElementById('btn-map-mode-events')?.classList.remove('active');
    renderMapHeatmap(false);
  });
  document.getElementById('btn-toggle-map-places')?.addEventListener('click', () => {
    const panel = document.getElementById('map-places-panel');
    if (!panel) return;
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
      api('/map').then((data) => renderTopPlacesList(data.most_visited || []));
    }
  });
  document.getElementById('btn-close-map-places')?.addEventListener('click', () => {
    const panel = document.getElementById('map-places-panel');
    if (panel) panel.style.display = 'none';
  });
  document.getElementById('map-filter-cat')?.addEventListener('change', () => loadMap());
  document.getElementById('map-filter-friend')?.addEventListener('change', () => loadMap());
  document.getElementById('map-radius-select')?.addEventListener('change', () => {
    if (selectedMapCoord) {
      findNearbyPhotos(selectedMapCoord.lat, selectedMapCoord.lng);
    }
  });
  document.getElementById('btn-map-fit-bounds')?.addEventListener('click', () => {
    if (mapInstance && mapMarkersLayer && mapMarkersLayer.getLayers().length > 0) {
      const group = L.featureGroup(mapMarkersLayer.getLayers());
      mapInstance.fitBounds(group.getBounds().pad(0.12));
    }
  });
  document.getElementById('btn-close-nearby')?.addEventListener('click', () => {
    const panel = document.getElementById('map-nearby-panel');
    if (panel) panel.style.display = 'none';
    if (mapRadiusCircle && mapInstance) {
      mapInstance.removeLayer(mapRadiusCircle);
      mapRadiusCircle = null;
    }
    selectedMapCoord = null;
  });

  // Stories & Collections controls (Phase 1.5A)
  document.getElementById('btn-create-story')?.addEventListener('click', () => {
    document.getElementById('input-story-name').value = '';
    document.getElementById('input-story-note').value = '';
    document.getElementById('select-story-type').value = 'topic';
    document.getElementById('modal-create-story').style.display = 'flex';
  });

  document.getElementById('btn-save-new-story')?.addEventListener('click', async () => {
    const name = document.getElementById('input-story-name').value.trim();
    if (!name) {
      showToast('กรุณาระบุชื่อเรื่องราว', 'error');
      return;
    }
    const type = document.getElementById('select-story-type').value;
    const note = document.getElementById('input-story-note').value.trim();

    try {
      await api('/collections', {
        method: 'POST',
        body: JSON.stringify({ name, type, note }),
      });
      document.getElementById('modal-create-story').style.display = 'none';
      showToast(`สร้างเรื่องราว "${name}" เรียบร้อย`, 'success');
      loadStories();
    } catch (err) {
      showToast(err.message || 'ไม่สามารถสร้างเรื่องราวได้', 'error');
    }
  });

  document.getElementById('btn-delete-story')?.addEventListener('click', async () => {
    if (!currentStoryDetail) return;
    if (!confirm(`ต้องการลบเรื่องราว "${currentStoryDetail.name}" หรือไม่?\n(รูปภาพทั้งหมดในเครื่องจะไม่ถูกลบ)`)) {
      return;
    }
    try {
      await api(`/collections/${currentStoryDetail.id}`, { method: 'DELETE' });
      document.getElementById('modal-story-detail').style.display = 'none';
      showToast('ลบเรื่องราวเรียบร้อย (รูปภาพไม่ถูกลบ)', 'info');
      loadStories();
    } catch {
      showToast('ไม่สามารถลบเรื่องราวได้', 'error');
    }
  });

  // Story type filter buttons
  document.querySelectorAll('[data-story-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-story-type]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentStoryFilter = btn.dataset.storyType;
      loadStories();
    });
  });

  // Add active photo to story button
  document.getElementById('btn-add-photo-to-story')?.addEventListener('click', async () => {
    const collId = document.getElementById('photo-select-collection')?.value;
    if (!collId) {
      showToast('กรุณาเลือกเรื่องราวก่อน', 'error');
      return;
    }
    const currentPhoto = loadedPhotos[activePhotoIndex];
    if (!currentPhoto) return;
    try {
      await api(`/collections/${collId}/photos`, {
        method: 'POST',
        body: JSON.stringify({ photo_ids: [currentPhoto.id] }),
      });
      showToast('เพิ่มรูปเข้าเรื่องราวสำเร็จ', 'success');
      loadStories();
    } catch {
      showToast('ไม่สามารถเพิ่มรูปเข้าเรื่องราวได้', 'error');
    }
  });

  // Places controls (Phase 1.5B)
  document.getElementById('btn-create-place')?.addEventListener('click', () => {
    document.getElementById('input-place-name').value = '';
    document.getElementById('select-place-type').value = 'project';
    document.getElementById('input-place-lat').value = '';
    document.getElementById('input-place-lon').value = '';
    document.getElementById('input-place-radius').value = '120';
    document.getElementById('input-place-note').value = '';
    document.getElementById('modal-create-place').style.display = 'flex';
  });

  document.getElementById('btn-save-new-place')?.addEventListener('click', async () => {
    const name = document.getElementById('input-place-name').value.trim();
    if (!name) {
      showToast('กรุณาระบุชื่อสถานที่', 'error');
      return;
    }
    const type = document.getElementById('select-place-type').value;
    const latVal = document.getElementById('input-place-lat').value.trim();
    const lonVal = document.getElementById('input-place-lon').value.trim();
    const radiusVal = document.getElementById('input-place-radius').value.trim();
    const note = document.getElementById('input-place-note').value.trim();

    const lat = latVal ? parseFloat(latVal) : null;
    const lon = lonVal ? parseFloat(lonVal) : null;
    const radius_m = radiusVal ? parseInt(radiusVal, 10) : 120;

    try {
      await api('/places', {
        method: 'POST',
        body: JSON.stringify({ name, type, lat, lon, radius_m, note }),
      });
      document.getElementById('modal-create-place').style.display = 'none';
      showToast(`สร้างสถานที่ "${name}" เรียบร้อย`, 'success');
      loadPlaces();
    } catch (err) {
      showToast(err.message || 'ไม่สามารถสร้างสถานที่ได้', 'error');
    }
  });

  document.getElementById('btn-delete-place')?.addEventListener('click', async () => {
    if (!currentPlaceDetail) return;
    if (!confirm(`ต้องการลบสถานที่ "${currentPlaceDetail.name}" หรือไม่?\n(รูปภาพทั้งหมดในเครื่องจะไม่ถูกลบ)`)) {
      return;
    }
    try {
      await api(`/places/${currentPlaceDetail.id}`, { method: 'DELETE' });
      document.getElementById('modal-place-detail').style.display = 'none';
      showToast('ลบสถานที่เรียบร้อย (รูปภาพไม่ถูกลบ)', 'info');
      loadPlaces();
    } catch {
      showToast('ไม่สามารถลบสถานที่ได้', 'error');
    }
  });

  // Place type filter buttons
  document.querySelectorAll('[data-place-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-place-type]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentPlaceFilter = btn.dataset.placeType;
      loadPlaces();
    });
  });

  // Add active photo to place button
  document.getElementById('btn-add-photo-to-place')?.addEventListener('click', async () => {
    const placeId = document.getElementById('photo-select-place')?.value;
    if (!placeId) {
      showToast('กรุณาเลือกสถานที่ก่อน', 'error');
      return;
    }
    const currentPhoto = loadedPhotos[activePhotoIndex];
    if (!currentPhoto) return;
    try {
      await api(`/places/${placeId}/photos`, {
        method: 'POST',
        body: JSON.stringify({ photo_ids: [currentPhoto.id] }),
      });
      showToast('ผูกรูปเข้ากับสถานที่สำเร็จ', 'success');
      loadPlaces();
      openPhotoModal(currentPhoto.id);
    } catch {
      showToast('ไม่สามารถผูกรูปเข้ากับสถานที่ได้', 'error');
    }
  });

  // Meal controls (Phase 1.5C)
  document.getElementById('btn-create-meal')?.addEventListener('click', () => {
    document.getElementById('select-meal-type').value = 'lunch';
    document.getElementById('select-meal-rating').value = '';
    document.getElementById('select-meal-place').value = '';
    document.getElementById('input-meal-new-restaurant').value = '';
    document.getElementById('input-meal-date').value = new Date().toISOString().slice(0, 16);
    document.getElementById('input-meal-note').value = '';
    document.getElementById('modal-create-meal').style.display = 'flex';
  });

  document.getElementById('btn-save-new-meal')?.addEventListener('click', async () => {
    const meal_type = document.getElementById('select-meal-type').value;
    const place_id = document.getElementById('select-meal-place').value || null;
    const restaurant_name = document.getElementById('input-meal-new-restaurant').value.trim() || undefined;
    const dateVal = document.getElementById('input-meal-date').value;
    const ratingVal = document.getElementById('select-meal-rating').value;
    const note = document.getElementById('input-meal-note').value.trim();

    const taken_at = dateVal ? new Date(dateVal).getTime() : Date.now();
    const rating = ratingVal ? parseInt(ratingVal, 10) : null;

    try {
      await api('/meals', {
        method: 'POST',
        body: JSON.stringify({
          meal_type,
          place_id,
          restaurant_name,
          taken_at,
          rating,
          note,
        }),
      });
      document.getElementById('modal-create-meal').style.display = 'none';
      showToast('บันทึกมื้ออาหารเรียบร้อย', 'success');
      loadMeals();
      updateStatus();
    } catch (err) {
      showToast(err.message || 'ไม่สามารถบันทึกมื้ออาหารได้', 'error');
    }
  });

  document.getElementById('btn-delete-meal')?.addEventListener('click', async () => {
    if (!currentMealDetail) return;
    if (!confirm('ต้องการลบมื้ออาหารนี้หรือไม่?\n(รูปภาพทั้งหมดในเครื่องจะไม่ถูกลบ)')) {
      return;
    }
    try {
      await api(`/meals/${currentMealDetail.id}`, { method: 'DELETE' });
      document.getElementById('modal-meal-detail').style.display = 'none';
      showToast('ลบมื้ออาหารเรียบร้อย (รูปภาพไม่ถูกลบ)', 'info');
      loadMeals();
      updateStatus();
    } catch {
      showToast('ไม่สามารถลบมื้ออาหารได้', 'error');
    }
  });

  // Meal type filter buttons
  document.querySelectorAll('[data-meal-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-meal-type]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentMealFilterType = btn.dataset.mealType;
      loadMeals();
    });
  });

  document.getElementById('filter-meal-place')?.addEventListener('change', (e) => {
    currentMealFilterPlace = e.target.value;
    loadMeals();
  });

  document.getElementById('filter-meal-month')?.addEventListener('change', (e) => {
    currentMealFilterMonth = e.target.value;
    loadMeals();
  });

  // Suggestions controls (Phase 1.5A)
  document.getElementById('btn-scan-suggestions')?.addEventListener('click', scanSuggestions);

  // Recap View controls (Phase 1.5D)
  const recapYearSelect = document.getElementById('recap-select-year');
  const recapMonthSelect = document.getElementById('recap-select-month');
  if (recapYearSelect) {
    recapYearSelect.value = String(currentRecapYear);
    recapYearSelect.addEventListener('change', (e) => {
      currentRecapYear = Number(e.target.value);
      loadRecap(currentRecapYear, currentRecapMonth);
    });
  }
  if (recapMonthSelect) {
    recapMonthSelect.value = String(currentRecapMonth);
    recapMonthSelect.addEventListener('change', (e) => {
      currentRecapMonth = Number(e.target.value);
      loadRecap(currentRecapYear, currentRecapMonth);
    });
  }
  document.getElementById('btn-recap-regenerate')?.addEventListener('click', () => {
    loadRecap(currentRecapYear, currentRecapMonth, true);
  });
  const exportBtn = document.getElementById('btn-recap-export-menu');
  const exportDropdown = document.getElementById('recap-export-dropdown');
  if (exportBtn && exportDropdown) {
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDropdown.style.display = exportDropdown.style.display === 'none' ? 'flex' : 'none';
    });
    document.addEventListener('click', () => {
      exportDropdown.style.display = 'none';
    });
    exportDropdown.querySelectorAll('.dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        exportDropdown.style.display = 'none';
        const format = item.dataset.export;
        exportRecap(format);
      });
    });
  }

  // Initial load
  await updateStatus();
  await loadFriends();
  await loadStories();
  await loadPlaces();
  await loadMeals();
  await loadSuggestions();
  await loadDashboard();

  console.log('🎞️ เรื่องราว 2026 (Phase 1D Core) — ready');
}

// ── Ingest Job Poller ─────────────────────────────────────────
async function startImport(folderPath) {
  if (!folderPath || !folderPath.trim()) {
    showToast('กรุณาระบุที่อยู่โฟลเดอร์', 'error');
    return;
  }
  closeAllModals();

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
              updateStatus();
              loadFriends();
              if (currentTab === 'photos') {
                loadPhotos();
              } else if (currentTab === 'events') {
                loadEvents();
              } else {
                loadDashboard();
              }
            } else {
              showToast(`เกิดข้อผิดพลาด: ${job.error || 'ไม่สามารถนำเข้าได้'}`, 'error');
            }
          }, 600);
        }
      } catch {
        clearInterval(pollInterval);
        overlay.style.display = 'none';
      }
    }, 400);
  } catch (err) {
    overlay.style.display = 'none';
    showToast(err.message || 'ไม่สามารถเริ่มนำเข้ารูปได้', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
