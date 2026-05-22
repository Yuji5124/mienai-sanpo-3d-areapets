// ===========================
// みえないさんぽ3D AREAPETS
// app.js — Step 6: localStorage 保存
// ===========================

// ===========================
// localStorage キー
// ===========================
const STORAGE_POINTS  = 'areapets_points';
const STORAGE_MOTIF   = 'areapets_motif';
const STORAGE_RECORDS = 'areapets_records';

// ===========================
// ナビゲーション切り替え
// ===========================
const navButtons = document.querySelectorAll('.nav-btn');
const screens    = document.querySelectorAll('.screen');

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.screen;
    navButtons.forEach(b => b.classList.remove('active'));
    screens.forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`screen-${target}`)?.classList.add('active');
  });
});

// ===========================
// ポイント管理
// ===========================
let currentPoints = 128;

function animateCounter(el, target, duration) {
  const start = performance.now();
  function step(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function addPoints(delta) {
  const el   = document.getElementById('point-display');
  if (!el) return;
  const from = currentPoints;
  currentPoints += delta;
  const to   = currentPoints;
  const t0   = performance.now();
  const dur  = 700;
  (function step(now) {
    const p = Math.min((now - t0) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  })(performance.now());
}

// ===========================
// デモ移動システム
// ===========================
const STEP      = 6;
const BOUNDS    = { min: 8, max: 92 };
const MAX_TRAIL = 30;

let pos        = { x: 50, y: 50 };
let trails     = [];
let badgeTimer = null;

function clamp(v) {
  return Math.max(BOUNDS.min, Math.min(BOUNDS.max, v));
}

function renderPin() {
  const pin = document.querySelector('.location-pin');
  const z1  = document.querySelector('.z1');
  if (pin) {
    pin.style.left = pos.x + '%';
    pin.style.top  = pos.y + '%';
  }
  if (z1) {
    z1.style.left = pos.x + '%';
    z1.style.top  = pos.y + '%';
  }
}

function addTrail(x, y) {
  const map = document.getElementById('map-area');
  if (!map) return;
  const pin = map.querySelector('.location-pin');
  const dot = document.createElement('div');
  dot.className  = 'trail-dot';
  dot.style.left = x + '%';
  dot.style.top  = y + '%';
  map.insertBefore(dot, pin);
  trails.push(dot);
  if (trails.length > MAX_TRAIL) {
    trails.shift().remove();
  }
}

function flashBadge(text) {
  const badge = document.getElementById('map-badge');
  if (!badge) return;
  badge.textContent = text;
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    badge.textContent = 'エリア探索中...';
  }, 1200);
}

function movePin(dx, dy) {
  const oldX = pos.x;
  const oldY = pos.y;
  pos.x = clamp(pos.x + dx * STEP);
  pos.y = clamp(pos.y + dy * STEP);
  stampMemory(pos.x, pos.y);
  addTrail(oldX, oldY);
  renderPin();
  flashBadge('移動中...');  // checkMotif が近傍なら上書きする
  checkMotif();
}

// ===========================
// 記憶地図（永続する足跡）
// ===========================
const MAX_MEMORY  = 80;
const MAX_LEVEL   = 5;
const CELL_RADIUS = 5.5;

const CELL_CONFIG = [
  { size: 8,  opacity: 0.13 },
  { size: 11, opacity: 0.22 },
  { size: 14, opacity: 0.33 },
  { size: 17, opacity: 0.44 },
  { size: 21, opacity: 0.54 },
];

let memoryCells = [];

function findNearbyCell(x, y) {
  return memoryCells.find(cell => {
    const dx = cell.x - x;
    const dy = cell.y - y;
    return Math.sqrt(dx * dx + dy * dy) < CELL_RADIUS;
  });
}

function applyLevel(cell) {
  const cfg = CELL_CONFIG[cell.level - 1];
  cell.el.style.width   = cfg.size + 'px';
  cell.el.style.height  = cfg.size + 'px';
  cell.el.style.opacity = cfg.opacity;
}

function stampMemory(x, y) {
  const existing = findNearbyCell(x, y);
  if (existing) {
    existing.level = Math.min(existing.level + 1, MAX_LEVEL);
    applyLevel(existing);
    return;
  }
  const map  = document.getElementById('map-area');
  if (!map) return;
  const grid = map.querySelector('.grid-overlay');
  const el   = document.createElement('div');
  el.className   = 'memory-cell';
  el.style.left  = x + '%';
  el.style.top   = y + '%';
  const cell = { x, y, level: 1, el };
  applyLevel(cell);
  map.insertBefore(el, grid);
  memoryCells.push(cell);
  if (memoryCells.length > MAX_MEMORY) {
    memoryCells.shift().el.remove();
  }
}

// ===========================
// 隠れモチーフ（水の記憶）
// ===========================
const MOTIF_POS         = { x: 70, y: 30 };  // マップ右上エリア
const MOTIF_NEAR_RADIUS = 16;   // この距離で目覚める
const MOTIF_TOUCH_RADIUS = 6.5; // この距離で発見

let motifEl       = null;
let motifState    = 'hidden';  // 'hidden' | 'near' | 'found'
let kirokuRecords = [];         // 保存・復元に使う記録の配列

function initMotif() {
  const map  = document.getElementById('map-area');
  if (!map) return;
  const grid = map.querySelector('.grid-overlay');

  motifEl = document.createElement('div');
  motifEl.className   = 'motif';
  motifEl.style.left  = MOTIF_POS.x + '%';
  motifEl.style.top   = MOTIF_POS.y + '%';
  map.insertBefore(motifEl, grid);
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function checkMotif() {
  if (motifState === 'found') return;
  const d = dist(pos, MOTIF_POS);

  if (d < MOTIF_TOUCH_RADIUS) {
    discoverMotif();
  } else if (d < MOTIF_NEAR_RADIUS) {
    if (motifState !== 'near') {
      motifState = 'near';
      motifEl?.classList.remove('found');
      motifEl?.classList.add('near');
    }
    flashBadge('何かを感じる...');
  } else if (motifState === 'near') {
    // 離れたら元に戻す
    motifState = 'hidden';
    motifEl?.classList.remove('near');
  }
}

function discoverMotif() {
  motifState = 'found';
  motifEl?.classList.remove('near');
  motifEl?.classList.add('found');

  // ステータスバッジをリセット
  clearTimeout(badgeTimer);
  const badge = document.getElementById('map-badge');
  if (badge) badge.textContent = 'エリア探索中...';

  showToast('水の記憶を見つけた', '+30 pt');
  addPoints(30);
  addKirokuRecord({ name: '水の記憶', pts: 30 });
  saveState();
}

function showToast(title, pts) {
  const toast   = document.getElementById('discovery-toast');
  const titleEl = document.getElementById('toast-title');
  const ptsEl   = document.getElementById('toast-pts');
  if (!toast || !titleEl || !ptsEl) return;

  titleEl.textContent = title;
  ptsEl.textContent   = pts;
  toast.classList.add('show');

  setTimeout(() => toast.classList.remove('show'), 3200);
}

// ===========================
// 記録画面への追加
// ===========================
function addKirokuRecord(item) {
  const empty = document.getElementById('kiroku-empty');
  const list  = document.getElementById('kiroku-list');
  if (!list) return;

  if (empty) empty.style.display = 'none';

  const card = document.createElement('div');
  card.className = 'record-card';
  card.innerHTML =
    '<div class="record-icon-dot"></div>' +
    '<div class="record-body">' +
      '<p class="record-name">' + item.name + '</p>' +
      '<p class="record-meta">記憶のかけら</p>' +
    '</div>' +
    '<span class="record-pts">+' + item.pts + ' pt</span>';
  list.appendChild(card);
  kirokuRecords.push(item);
}

// ===========================
// localStorage 保存・読み込み
// ===========================
function saveState() {
  try {
    localStorage.setItem(STORAGE_POINTS,  JSON.stringify(currentPoints));
    localStorage.setItem(STORAGE_MOTIF,   motifState);
    localStorage.setItem(STORAGE_RECORDS, JSON.stringify(kirokuRecords));
  } catch(e) { /* プライベートブラウズ等で失敗しても続行 */ }
}

function loadState() {
  try {
    const pts  = localStorage.getItem(STORAGE_POINTS);
    const mst  = localStorage.getItem(STORAGE_MOTIF);
    const recs = localStorage.getItem(STORAGE_RECORDS);

    if (pts  !== null) currentPoints = JSON.parse(pts);
    if (mst  !== null) motifState    = mst;
    // 記録は DOM 準備済みで呼ばれるので直接復元
    if (recs !== null) JSON.parse(recs).forEach(item => addKirokuRecord(item));
  } catch(e) {}
}

// ===========================
// D-pad ボタン操作
// ===========================
const DPAD_MAP = {
  'btn-up':    [0,  -1],
  'btn-down':  [0,   1],
  'btn-left':  [-1,  0],
  'btn-right': [1,   0],
};

function bindDpad() {
  Object.entries(DPAD_MAP).forEach(([id, [dx, dy]]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', e => {
      e.preventDefault();
      movePin(dx, dy);
    }, { passive: false });
    btn.addEventListener('click', () => movePin(dx, dy));
  });
}

// ===========================
// 初期化
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  // 1. 保存状態を読み込む（記録復元も含む）
  loadState();

  // 2. ポイント表示（保存済みなら直接、初回ならカウントアップ）
  const pointEl = document.getElementById('point-display');
  if (pointEl) {
    if (localStorage.getItem(STORAGE_POINTS) !== null) {
      pointEl.textContent = currentPoints;
    } else {
      animateCounter(pointEl, 128, 900);
    }
  }

  // 3. マップ初期化
  renderPin();
  initMotif();

  // 4. 発見済みならモチーフに found クラスを適用
  if (motifState === 'found' && motifEl) {
    motifEl.classList.add('found');
  }

  // 5. D-pad バインド
  bindDpad();

  // 6. 開発用リセットボタン
  document.getElementById('dev-reset')?.addEventListener('click', () => {
    [STORAGE_POINTS, STORAGE_MOTIF, STORAGE_RECORDS].forEach(k => {
      try { localStorage.removeItem(k); } catch(e) {}
    });
    location.reload();
  });
});
