// ===========================
// みえないさんぽ3D AREAPETS
// app.js — Step 6: localStorage 保存
// ===========================

// ===========================
// localStorage キー
// ===========================
const STORAGE_POINTS  = 'areapets_points';
const STORAGE_MOTIF   = 'areapets_motif';
const STORAGE_MOTIF2  = 'areapets_motif2';
const STORAGE_RECORDS = 'areapets_records';
const STORAGE_CELLS   = 'areapets_cells';
const STORAGE_POS     = 'areapets_pos';
const STORAGE_STEPS   = 'areapets_steps';

// ===========================
// 木場公園 GPS 基準範囲（仮）
// ===========================
const PARK_BOUNDS = {
  latMax: 35.6780,   // 北端（MOT より少し北）
  latMin: 35.6650,   // 南端
  lngMin: 139.8040,  // 西端
  lngMax: 139.8130,  // 東端（運河を含む）
};

// 木場公園の矩形範囲内かどうかを判定（clamp 前の生座標で判定）
function isInsidePark(lat, lng) {
  return lat >= PARK_BOUNDS.latMin && lat <= PARK_BOUNDS.latMax &&
         lng >= PARK_BOUNDS.lngMin && lng <= PARK_BOUNDS.lngMax;
}

// GPS緯度経度 → フィールド座標 (0〜100) に変換
function gpsToField(lat, lng) {
  const x = (lng - PARK_BOUNDS.lngMin) / (PARK_BOUNDS.lngMax - PARK_BOUNDS.lngMin) * 100;
  const y = (PARK_BOUNDS.latMax - lat) / (PARK_BOUNDS.latMax - PARK_BOUNDS.latMin) * 100;
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  };
}

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
  const gain = document.querySelector('.point-gain');
  if (!el) return;
  const from = currentPoints;
  currentPoints += delta;
  checkKyoten();
  if (gain) gain.textContent = '+' + delta;
  saveState();
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
// 暫定歩数
// ===========================
let currentSteps  = 0;
let stepGainTimer = null;

function flashStepGain(delta) {
  const el = document.getElementById('step-gain');
  if (!el) return;
  el.textContent = '+' + delta + '歩';
  clearTimeout(stepGainTimer);
  stepGainTimer = setTimeout(() => { el.textContent = ''; }, 1500);
}

function addSteps(delta) {
  currentSteps += delta;
  const el = document.getElementById('step-display');
  if (el) el.textContent = currentSteps.toLocaleString();
  flashStepGain(delta);
  saveState();
}

// ===========================
// Ouchi Colon 同行
// ===========================
const COMPANION_REACTS = [
  'いい感じ',
  'なにかありそう',
  'いっしょに歩こう',
  'ここ、すきかも',
  'もう少し先へ',
  'なんかある気がする',
];

let reactTimer = null;
let moveCount  = 0;
let nextReact  = randomNextReact();

function randomNextReact() {
  return 4 + Math.floor(Math.random() * 5);  // 4〜8歩ごと
}

function showCompanionReact(msg) {
  const el = document.getElementById('companion-react');
  if (!el) return;
  el.textContent = msg;
  clearTimeout(reactTimer);
  reactTimer = setTimeout(() => { el.textContent = ''; }, 2200);
}

function tickCompanion() {
  moveCount++;
  if (moveCount >= nextReact) {
    moveCount = 0;
    nextReact = randomNextReact();
    const msg = COMPANION_REACTS[Math.floor(Math.random() * COMPANION_REACTS.length)];
    showCompanionReact(msg);
  }
}

// ===========================
// デモ移動システム
// ===========================
const STEP      = 3;
const BOUNDS    = { min: 13, max: 87 };  // 4倍フィールドの端が画面外に出ないよう制限
const MAX_TRAIL = 30;

let pos        = { x: 50, y: 50 };
let trails     = [];
let badgeTimer = null;

function clamp(v) {
  return Math.max(BOUNDS.min, Math.min(BOUNDS.max, v));
}

function renderPin() {
  const pin   = document.querySelector('.location-pin');
  const z1    = document.querySelector('.z1');
  const field = document.getElementById('field-world');
  if (pin) {
    pin.style.left = pos.x + '%';
    pin.style.top  = pos.y + '%';
  }
  if (z1) {
    z1.style.left = pos.x + '%';
    z1.style.top  = pos.y + '%';
  }
  // field-world を平行移動して現在地をマップ中央に保つ
  // left = (50 - pos.x * 4)% of map-area width
  if (field) {
    field.style.left = (50 - pos.x * 4) + '%';
    field.style.top  = (50 - pos.y * 4) + '%';
  }
}

function addTrail(x, y) {
  const map = document.getElementById('field-world');
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
  const memResult = stampMemory(pos.x, pos.y);
  addTrail(oldX, oldY);
  renderPin();
  saveCells();
  savePos();
  if (memResult === 'new')     { addPoints(2); addSteps(12); }
  if (memResult === 'levelup') { addPoints(1); addSteps(6); }
  flashBadge('移動中...');  // checkMotif* が近傍なら上書きする
  checkMotif();
  checkMotif2();
  tickCompanion();
}

// ===========================
// 記憶地図（永続する足跡）
// ===========================
const MAX_MEMORY  = 80;
const MAX_LEVEL   = 5;
const CELL_RADIUS = 3;  // STEP=3 に合わせて縮小（1〜2歩ごとに新セル）

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
    const prev = existing.level;
    existing.level = Math.min(existing.level + 1, MAX_LEVEL);
    applyLevel(existing);
    return existing.level > prev ? 'levelup' : null;
  }
  const map  = document.getElementById('field-world');
  if (!map) return null;
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
  return 'new';
}

// ===========================
// 隠れモチーフ（水の記憶）
// ===========================
const MOTIF_POS          = { x: 70, y: 30 };  // マップ右上エリア
const MOTIF_NEAR_RADIUS  = 16;
const MOTIF_TOUCH_RADIUS = 6.5;

const MOTIF2_POS          = { x: 25, y: 75 };  // マップ左下エリア
const MOTIF2_NEAR_RADIUS  = 16;
const MOTIF2_TOUCH_RADIUS = 6.5;

let motifEl       = null;
let motifState    = 'hidden';  // 'hidden' | 'near' | 'found'
let motif2El      = null;
let motif2State   = 'hidden';
let kirokuRecords = [];         // 保存・復元に使う記録の配列

function initMotif() {
  const map  = document.getElementById('field-world');
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

// ===========================
// 隠れモチーフ2（風のしるし）
// ===========================
function initMotif2() {
  const map  = document.getElementById('field-world');
  if (!map) return;
  const grid = map.querySelector('.grid-overlay');

  motif2El = document.createElement('div');
  motif2El.className  = 'motif motif-wind';
  motif2El.style.left = MOTIF2_POS.x + '%';
  motif2El.style.top  = MOTIF2_POS.y + '%';
  map.insertBefore(motif2El, grid);
}

function checkMotif2() {
  if (motif2State === 'found') return;
  const d = dist(pos, MOTIF2_POS);

  if (d < MOTIF2_TOUCH_RADIUS) {
    discoverMotif2();
  } else if (d < MOTIF2_NEAR_RADIUS) {
    if (motif2State !== 'near') {
      motif2State = 'near';
      motif2El?.classList.add('near');
    }
    flashBadge('風を感じる...');
  } else if (motif2State === 'near') {
    motif2State = 'hidden';
    motif2El?.classList.remove('near');
  }
}

function discoverMotif2() {
  motif2State = 'found';
  motif2El?.classList.remove('near');
  motif2El?.classList.add('found');

  clearTimeout(badgeTimer);
  const badge = document.getElementById('map-badge');
  if (badge) badge.textContent = 'エリア探索中...';

  showToast('風のしるしを見つけた', '+40 pt');
  addPoints(40);
  addKirokuRecord({ name: '風のしるし', pts: 40, dotClass: 'wind' });
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
    '<div class="record-icon-dot' + (item.dotClass ? ' ' + item.dotClass : '') + '"></div>' +
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
    localStorage.setItem(STORAGE_MOTIF2,  motif2State);
    localStorage.setItem(STORAGE_RECORDS, JSON.stringify(kirokuRecords));
    localStorage.setItem(STORAGE_STEPS,   JSON.stringify(currentSteps));
  } catch(e) { /* プライベートブラウズ等で失敗しても続行 */ }
}

function loadState() {
  try {
    const pts      = localStorage.getItem(STORAGE_POINTS);
    const mst      = localStorage.getItem(STORAGE_MOTIF);
    const recs     = localStorage.getItem(STORAGE_RECORDS);
    const cells    = localStorage.getItem(STORAGE_CELLS);
    const savedPos = localStorage.getItem(STORAGE_POS);

    const mst2 = localStorage.getItem(STORAGE_MOTIF2);
    if (pts      !== null) currentPoints = JSON.parse(pts);
    if (mst      !== null) motifState    = mst;
    if (mst2     !== null) motif2State   = mst2;
    if (recs     !== null) JSON.parse(recs).forEach(item => addKirokuRecord(item));
    if (cells    !== null) JSON.parse(cells).forEach(c => restoreCell(c));
    if (savedPos !== null) {
      const p = JSON.parse(savedPos);
      pos.x = p.x;
      pos.y = p.y;
    }
    const steps = localStorage.getItem(STORAGE_STEPS);
    if (steps !== null) currentSteps = JSON.parse(steps);
  } catch(e) {}
}

// ===========================
// 記憶セル・位置の保存・復元
// ===========================
function saveCells() {
  try {
    const data = memoryCells.map(c => ({ x: c.x, y: c.y, level: c.level }));
    localStorage.setItem(STORAGE_CELLS, JSON.stringify(data));
  } catch(e) {}
}

function savePos() {
  try {
    localStorage.setItem(STORAGE_POS, JSON.stringify({ x: pos.x, y: pos.y }));
  } catch(e) {}
}

function restoreCell(c) {
  const map  = document.getElementById('field-world');
  if (!map) return;
  const grid = map.querySelector('.grid-overlay');
  const el   = document.createElement('div');
  el.className   = 'memory-cell';
  el.style.left  = c.x + '%';
  el.style.top   = c.y + '%';
  const cell = { x: c.x, y: c.y, level: c.level, el };
  applyLevel(cell);
  map.insertBefore(el, grid);
  memoryCells.push(cell);
}

// ===========================
// AIDA 拠点 表示チェック
// ===========================
function checkKyoten() {
  const empty = document.getElementById('kyoten-empty');
  const base  = document.getElementById('kyoten-base');
  if (!empty || !base) return;
  if (currentPoints >= 150) {
    empty.style.display = 'none';
    base.classList.add('active');
  } else {
    empty.style.display = '';
    base.classList.remove('active');
  }
  updateNextGoal();
}

function updateNextGoal() {
  const card  = document.getElementById('kyoten-goal');
  const label = document.getElementById('goal-label');
  const bar   = document.getElementById('goal-bar');
  if (!card || !label || !bar) return;

  const BASE   = 150;
  const TARGET = 250;

  if (currentPoints < BASE) {
    card.classList.remove('active');
    return;
  }

  card.classList.add('active');

  if (currentPoints >= TARGET) {
    label.textContent = '次の変化を感じています';
    bar.style.width   = '100%';
  } else {
    const left     = TARGET - currentPoints;
    const progress = (currentPoints - BASE) / (TARGET - BASE);
    label.textContent = '次の変化まで あと ' + left + 'pt';
    bar.style.width   = (progress * 100).toFixed(1) + '%';
  }
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
  checkKyoten();

  // 2. ポイント・暫定歩数表示
  const stepEl = document.getElementById('step-display');
  if (stepEl) stepEl.textContent = currentSteps.toLocaleString();

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
  initMotif2();
  // 初期位置確定後、次フレームからフィールドのスクロールトランジションを有効化
  requestAnimationFrame(() => {
    document.getElementById('field-world')?.classList.add('field-ready');
  });

  // 4. 発見済みならモチーフに found クラスを適用
  if (motifState  === 'found' && motifEl)  motifEl.classList.add('found');
  if (motif2State === 'found' && motif2El) motif2El.classList.add('found');

  // 5. D-pad バインド
  bindDpad();

  // 6. GPS確認ボタン
  document.getElementById('gps-btn')?.addEventListener('click', () => {
    const status = document.getElementById('gps-status');
    if (!status) return;

    if (!navigator.geolocation) {
      status.textContent = '位置情報API非対応';
      return;
    }

    status.textContent = '取得中...';

    navigator.geolocation.getCurrentPosition(
      gpsPos => {
        const lat    = gpsPos.coords.latitude;
        const lng    = gpsPos.coords.longitude;
        const fld    = gpsToField(lat, lng);
        const inside = isInsidePark(lat, lng);

        // フィールド座標に現在地を反映してピンを移動
        pos.x = fld.x;
        pos.y = fld.y;
        renderPin();
        savePos();

        // 公園内なら記憶セルを1回刻む
        let memLine = '';
        if (inside) {
          const memResult = stampMemory(pos.x, pos.y);
          saveCells();
          if (memResult === 'new')     addPoints(2);
          if (memResult === 'levelup') addPoints(1);
          addSteps(20);
          memLine = '\n現在地の記憶を刻みました';
        }

        const welcomeLine = inside
          ? '<span class="gps-welcome">ようこそ木場公園へ</span>'
          : '木場公園の近くで使えます';

        status.innerHTML =
          `現在地を確認しました\n` +
          `${welcomeLine}\n` +
          `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}\n` +
          `MAP: x=${fld.x.toFixed(1)}, y=${fld.y.toFixed(1)}` +
          memLine;
      },
      _err => {
        status.textContent = '位置情報を取得できませんでした';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  // 7. 開発用リセットボタン
  document.getElementById('dev-reset')?.addEventListener('click', () => {
    [STORAGE_POINTS, STORAGE_MOTIF, STORAGE_MOTIF2,
     STORAGE_RECORDS, STORAGE_CELLS, STORAGE_POS, STORAGE_STEPS].forEach(k => {
      try { localStorage.removeItem(k); } catch(e) {}
    });
    location.reload();
  });
});
