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

// ── Application State ────────────────────────────────────────
let currentTab = 'dashboard';
let settings = {};
let allFriends = [];
let loadedPhotos = [];
let activePhotoIndex = -1;
let currentEventDetail = null;
let currentFriendDetail = null;

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
    histContainer.innerHTML = '';
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
    topFriendsEl.innerHTML = '';
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
    recentEventsEl.innerHTML = '';
    data.recent_events.forEach((ev) => {
      recentEventsEl.appendChild(createEventCard(ev));
    });
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

// ── Events View (FR-301..303) ────────────────────────────────
async function loadEvents() {
  try {
    const res = await api('/events');
    const container = document.getElementById('events-list');
    container.innerHTML = '';

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

    res.items.forEach((ev, idx) => {
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
    photosEl.innerHTML = '';
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
async function loadPhotos() {
  try {
    // Build query params
    const params = new URLSearchParams();
    if (photoFilters.cat) params.set('cat', photoFilters.cat);
    if (photoFilters.person) params.set('person', photoFilters.person);
    if (photoFilters.month) params.set('month', photoFilters.month);
    if (photoFilters.gps) params.set('gps', photoFilters.gps);
    if (photoFilters.burst) params.set('burst', '1');
    if (photoFilters.q) params.set('q', photoFilters.q);
    params.set('limit', '200');

    const res = await api(`/photos?${params.toString()}`);
    loadedPhotos = res.items;

    const container = document.getElementById('photos-list');
    container.innerHTML = '';
    document.getElementById('photos-filter-count').textContent = `แสดง ${res.items.length} จาก ${res.total} รูป`;

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
    document.getElementById('photo-modal-img').src = `/api/thumbs/${photo.id}`;

    // Burst indicator
    const burstBadge = document.getElementById('photo-modal-burst-badge');
    burstBadge.style.display = photo.burst ? 'inline-block' : 'none';

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
    catsContainer.innerHTML = '';
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

    // Render friend chips (FR-402)
    const friendsContainer = document.getElementById('photo-modal-friends');
    friendsContainer.innerHTML = '';
    const taggedPersonIds = new Set((photo.friends || []).map((f) => f.id));

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

    // Update filter dropdown
    const select = document.getElementById('filter-friend');
    select.innerHTML = '<option value="">ทั้งหมด</option>';
    allFriends.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.name} ${f.nick ? `(${f.nick})` : ''}`;
      select.appendChild(opt);
    });

    const container = document.getElementById('friends-list');
    container.innerHTML = '';

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
    timelineEl.innerHTML = '';
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
    photosEl.innerHTML = '';
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
  picker.innerHTML = '';
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

  // Setup Voice Input buttons (Web Speech API th-TH)
  setupVoiceInput(document.getElementById('btn-voice-photo-note'), document.getElementById('photo-modal-note'));
  setupVoiceInput(document.getElementById('btn-voice-event-name'), document.getElementById('event-edit-name'));
  setupVoiceInput(document.getElementById('btn-voice-event-place'), document.getElementById('event-edit-place'));
  setupVoiceInput(document.getElementById('btn-voice-event-note'), document.getElementById('event-edit-note'));
  setupVoiceInput(document.getElementById('btn-voice-friend-name'), document.getElementById('input-friend-name'));
  setupVoiceInput(document.getElementById('btn-voice-friend-nick'), document.getElementById('input-friend-nick'));
  setupVoiceInput(document.getElementById('btn-voice-friend-note'), document.getElementById('input-friend-note'));

  // Close buttons for modals
  document.getElementById('btn-close-photo-modal')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-event-modal')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-event-footer')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-friend-detail')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-friend-footer')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-add-friend')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-cancel-add-friend')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-import')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-cancel-import')?.addEventListener('click', closeAllModals);

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

  // Add friend button
  document.getElementById('btn-add-friend')?.addEventListener('click', openAddFriendModal);

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
      loadPhotos();
    });
    filterCatsContainer.appendChild(chip);
  });

  // Filter Dropdowns
  document.getElementById('filter-friend')?.addEventListener('change', (e) => {
    photoFilters.person = e.target.value;
    loadPhotos();
  });
  document.getElementById('filter-month')?.addEventListener('change', (e) => {
    photoFilters.month = e.target.value;
    loadPhotos();
  });
  document.getElementById('filter-gps')?.addEventListener('change', (e) => {
    photoFilters.gps = e.target.value;
    loadPhotos();
  });
  document.getElementById('filter-burst')?.addEventListener('change', (e) => {
    photoFilters.burst = e.target.checked;
    loadPhotos();
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
    loadPhotos();
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

  // Initial load
  await updateStatus();
  await loadFriends();
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
