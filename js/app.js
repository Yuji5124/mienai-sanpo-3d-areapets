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
const STORAGE_EVENT   = 'areapets_event';   // Step 22: AREA PETS 足あと発見状態

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
  // 歩数: 移動したら必ず +1、新セル/levelup でさらに +1 (Step 21.7)
  let stepDelta = 1;
  if (memResult === 'new')     { addPoints(2); stepDelta++; }
  if (memResult === 'levelup') { addPoints(1); stepDelta++; }
  addSteps(stepDelta);
  flashBadge('移動中...');  // checkMotif* が近傍なら上書きする
  checkMotif();
  checkMotif2();
  checkEventSpot();
  tickCompanion();
  checkSpotProximity();
  updateMapBrightness();
  updateMapStatus();
}

// ===========================
// 記憶地図（永続する足跡）
// ===========================
const MAX_MEMORY  = 80;
const MAX_LEVEL   = 5;
const CELL_RADIUS = 3;  // STEP=3 に合わせて縮小（1〜2歩ごとに新セル）

// Canvas 穴あけ方式では DOM セルは控えめな足跡グロー (Step 21.7b)
const CELL_CONFIG = [
  { size: 32,  opacity: 0.34 },
  { size: 42,  opacity: 0.40 },
  { size: 50,  opacity: 0.45 },
  { size: 58,  opacity: 0.49 },
  { size: 66,  opacity: 0.53 },
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

const EVENT_POS          = { x: 48, y: 60 };  // 公園南側エリア
const EVENT_NEAR_RADIUS  = 22;
const EVENT_CLOSE_RADIUS = 10;

let motifEl        = null;
let motifState     = 'hidden';  // 'hidden' | 'near' | 'found'
let motif2El       = null;
let motif2State    = 'hidden';
let eventSpotEl    = null;
let eventSpotState = 'hidden';  // 'hidden' | 'near' | 'close' | 'found'
let eventFound     = false;     // Step 22: true になると再発生しない
let kirokuRecords  = [];        // 保存・復元に使う記録の配列

// AREA PETS 発見時の KAKUBAKE リアクション (Step 22)
const AREAPETS_DISCOVER_REACTS = [
  'なにかいたみたい',
  '足あと、みつけた',
  'そばにいるね',
];

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

// ===========================
// AREA PETSイベント ─ 足あと (Step 22)
// ===========================
function initEventSpot() {
  const map  = document.getElementById('field-world');
  if (!map) return;
  const grid = map.querySelector('.grid-overlay');
  eventSpotEl = document.createElement('div');
  eventSpotEl.className  = 'event-spot';
  eventSpotEl.style.left = EVENT_POS.x + '%';
  eventSpotEl.style.top  = EVENT_POS.y + '%';
  map.insertBefore(eventSpotEl, grid);
}

function checkEventSpot() {
  if (eventFound) return;  // 発見済み ─ 再発生しない
  const d = dist(pos, EVENT_POS);

  if (d < EVENT_CLOSE_RADIUS) {
    discoverAreaPets();    // close 判定で初回のみ発生
  } else if (d < EVENT_NEAR_RADIUS) {
    if (eventSpotState !== 'near') {
      eventSpotState = 'near';
      eventSpotEl?.classList.remove('close');
      eventSpotEl?.classList.add('near');
    }
    flashBadge('AREA PETSの気配がします...');
  } else if (eventSpotState !== 'hidden') {
    eventSpotState = 'hidden';
    eventSpotEl?.classList.remove('near', 'close');
  }
}

// AREA PETS「足あと」─ 初回発見イベント本体
function discoverAreaPets() {
  eventFound     = true;
  eventSpotState = 'found';
  if (eventSpotEl) {
    eventSpotEl.classList.remove('near', 'close');
    eventSpotEl.classList.add('found');
  }

  // マップバッジを一時変更（badgeTimer で元に戻る）
  clearTimeout(badgeTimer);
  const badge = document.getElementById('map-badge');
  if (badge) {
    badge.textContent = 'AREA PETSの足あとを発見!';
    badgeTimer = setTimeout(() => { badge.textContent = 'エリア探索中...'; }, 3000);
  }

  showToast('AREA PETSの足あとを見つけた', '+50 pt');
  addPoints(50);
  addKirokuRecord({
    name:     'AREA PETSの足あと',
    pts:      50,
    dotClass: 'areapets',
    meta:     '見えない気配の記録',
  });

  // KAKUBAKE リアクション
  const react = AREAPETS_DISCOVER_REACTS[
    Math.floor(Math.random() * AREAPETS_DISCOVER_REACTS.length)
  ];
  showCompanionReact(react);

  // 即座に発見状態を保存（ページリロードで再発生しない）
  try { localStorage.setItem(STORAGE_EVENT, 'found'); } catch(e) {}
  saveState();
}

// ===========================
// 木場公園スポット (Step 20)
// ===========================
// スポット座標: kiba-park-bg.png の画像レイアウトに合わせて調整済み (Step 21.8)
// 画像内の主要ランドマーク概略 (0-100座標系)
//   MOT美術館:    x=12-26, y=4-14  (北園左上の大きな灰色建物)
//   テニスコート:  x=8-22,  y=24-35 (北園左側)
//   北園中央広場:  x=36-44, y=27-34 (円形路・パス)
//   冒険広場:     x=46-54, y=29-36 (北園右寄り)
//   仙台堀川:     y=43-50  (水平に走る運河)
//   南園:         x=6-62,  y=50-94
const PARK_SPOTS = [
  // MOT (東京都現代美術館) エリア ─ 建物の南側・庭園周辺
  { id: 'mot-iri',     name: 'MOT 自由の入口', x: 14, y: 15, type: 'mot',     nearR: 8  },
  { id: 'mot-asobi',   name: 'MOT 自由の遊び', x: 21, y: 18, type: 'mot',     nearR: 8  },
  { id: 'mot-taiyou',  name: 'MOT 太陽と石',   x: 27, y: 10, type: 'mot',     nearR: 8  },
  // 北園 中央〜右側のスポット
  { id: 'hakken',      name: '発見の塔',        x: 42, y: 23, type: 'magical', nearR: 9  },
  { id: 'tenshi',      name: '天使のリング',    x: 36, y: 31, type: 'magical', nearR: 8  },
  { id: 'kagayaki',    name: '輝きの塔',        x: 47, y: 29, type: 'magical', nearR: 9  },
  { id: 'kita-bouken', name: '北の冒険広場',    x: 51, y: 33, type: 'area',    nearR: 10 },
  // 北園 西側・テニスコート沿い
  { id: 'toilet-6',    name: '6号トイレ',       x: 16, y: 31, type: 'real',    nearR: 7  },
];

// 暗い fog に合わせて base を最小限に (Step 21.7)
// 近づいた時だけ発見できる演出に
const SPOT_OPACITY_CFG = {
  magical: { base: 0.01, max: 0.42 },
  mot:     { base: 0.02, max: 0.46 },
  area:    { base: 0.01, max: 0.42 },
  real:    { base: 0.02, max: 0.26 },
};

let spotNodes = {};  // id → { el, isNear }

function calcSpotOpacity(type, cellCount) {
  const cfg = SPOT_OPACITY_CFG[type] || SPOT_OPACITY_CFG.area;
  const t   = Math.min(cellCount / 55, 1);
  return +(cfg.base + (cfg.max - cfg.base) * t).toFixed(3);
}

function calcFogOpacity(cellCount) {
  // Step 21.7b: canvas 方式のため直接は使用しないが、将来のフォールバック用に維持
  const t = Math.min(cellCount / 80, 1);
  return +(0.96 - 0.32 * t).toFixed(3);
}

function updateMapBrightness() {
  const cells = memoryCells.length;
  // fog は fog-canvas が担う (Step 21.7b) — DOM park-fog の opacity 操作は不要
  PARK_SPOTS.forEach(spot => {
    const data = spotNodes[spot.id];
    if (!data || data.isNear) return;
    data.el.style.opacity = calcSpotOpacity(spot.type, cells);
  });
  renderFogCanvas();
}

// ===========================
// Canvas 霧: 丸い自然なリビール方式 (Step 21.7d)
// ランタン光のような柔らかい穴あけ。グリッド方式は廃止。
// ===========================
// level 1〜5 の記憶セル穴半径 (field-world px)
const CANVAS_HOLE_RADII = [58, 70, 82, 95, 110];
// 現在地周囲の穴半径（常時表示）
const CANVAS_POS_RADIUS = 88;

// 柔らかいランタン光のような穴を destination-out で開ける
function cutFogHole(ctx, cx, cy, r) {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0.00, 'rgba(0,0,0,1.00)');  // 中心: 完全に切り抜く
  grad.addColorStop(0.30, 'rgba(0,0,0,0.90)');  // まだ強く切り抜く
  grad.addColorStop(0.55, 'rgba(0,0,0,0.58)');  // ソフトに移行
  grad.addColorStop(0.75, 'rgba(0,0,0,0.22)');  // にじみ始め
  grad.addColorStop(0.90, 'rgba(0,0,0,0.05)');  // ほぼ霧
  grad.addColorStop(1.00, 'rgba(0,0,0,0.00)');  // 霧に溶ける
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function renderFogCanvas() {
  const canvas = document.getElementById('fog-canvas');
  if (!canvas) return;
  const field  = document.getElementById('field-world');
  if (!field)  return;

  const w = field.offsetWidth;
  const h = field.offsetHeight;
  if (w === 0 || h === 0) return;

  // キャンバスサイズを field-world の実ピクセルサイズに合わせる
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext('2d');

  // 1. 暗い霧で全体を塗りつぶす
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6, 10, 18, 0.96)';
  ctx.fillRect(0, 0, w, h);

  // 2. 記憶セルの位置に柔らかい穴を開けて背景画像を露出
  ctx.globalCompositeOperation = 'destination-out';
  memoryCells.forEach(cell => {
    const cx = (cell.x / 100) * w;
    const cy = (cell.y / 100) * h;
    const r  = CANVAS_HOLE_RADII[Math.min(cell.level - 1, 4)];
    cutFogHole(ctx, cx, cy, r);
  });

  // 3. 現在地周辺にも常に柔らかい穴を開ける（ランタンで照らす感覚）
  const px = (pos.x / 100) * w;
  const py = (pos.y / 100) * h;
  cutFogHole(ctx, px, py, CANVAS_POS_RADIUS);
}

function initSpots() {
  const map = document.getElementById('field-world');
  if (!map) return;
  const z1  = map.querySelector('.z1');

  PARK_SPOTS.forEach(spot => {
    const el         = document.createElement('div');
    el.className     = 'park-spot ' + spot.type;
    el.style.left    = spot.x + '%';
    el.style.top     = spot.y + '%';
    el.style.opacity = SPOT_OPACITY_CFG[spot.type].base;

    const label       = document.createElement('div');
    label.className   = 'park-spot-label';
    label.textContent = spot.name;
    el.appendChild(label);

    map.insertBefore(el, z1);
    spotNodes[spot.id] = { el, isNear: false };
  });
}

// フィールド座標範囲による公園内判定（デモ移動用）
// SVG 外周 rect（北 x=6..65 y=6..44、南 x=6..65 y=52..93）に対応
function isInsideFieldPark(x, y) {
  return (x >= 6 && x <= 65 && y >= 6  && y <= 44) ||   // 北園
         (x >= 6 && x <= 65 && y >= 52 && y <= 93);      // 南園
}

// MAP ステータスパネルを更新する
// gpsInPark: GPS ボタン経由のとき boolean を渡す; それ以外は undefined → field 座標で判定
function updateMapStatus(gpsInPark) {
  const coordEl  = document.getElementById('status-coords');
  const nearbyEl = document.getElementById('status-nearby');
  const parkEl   = document.getElementById('status-park');
  if (!coordEl || !nearbyEl || !parkEl) return;

  // 座標
  coordEl.textContent = `MAP  x=${pos.x.toFixed(1)}  y=${pos.y.toFixed(1)}`;

  // 近くのスポット（isNear が true のもの）
  const nearNames = PARK_SPOTS
    .filter(s => spotNodes[s.id]?.isNear)
    .map(s => s.name);
  nearbyEl.textContent = nearNames.length ? '近: ' + nearNames.join(' / ') : '';

  // 公園内判定
  const inside = gpsInPark !== undefined ? gpsInPark : isInsideFieldPark(pos.x, pos.y);
  parkEl.textContent = `公園内判定: ${inside ? 'OK' : '外'}`;
  parkEl.classList.toggle('in-park', !!inside);
}

function checkSpotProximity() {
  const cells = memoryCells.length;
  PARK_SPOTS.forEach(spot => {
    const data = spotNodes[spot.id];
    if (!data) return;
    const d = dist(pos, spot);

    if (d < spot.nearR) {
      if (!data.isNear) {
        data.isNear = true;
        data.el.style.opacity = '0.85';
        data.el.classList.add('near');
      }
    } else if (data.isNear) {
      data.isNear = false;
      data.el.classList.remove('near');
      data.el.style.opacity = calcSpotOpacity(spot.type, cells);
    }
  });
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
      '<p class="record-meta">' + (item.meta || '記憶のかけら') + '</p>' +
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
    const evt = localStorage.getItem(STORAGE_EVENT);
    if (evt === 'found') eventFound = true;
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
  initEventSpot();
  initSpots();

  // 初期スポット輝度などを即反映
  updateMapBrightness();  // 内部で renderFogCanvas() も呼ばれる
  updateMapStatus();

  // レイアウト確定後に fog-canvas を確実に描画（offsetWidth が 0 の場合のフォールバック）
  requestAnimationFrame(() => {
    renderFogCanvas();
    // フィールドのスクロールトランジションを有効化
    document.getElementById('field-world')?.classList.add('field-ready');
  });

  // ウィンドウリサイズ時に fog-canvas を再描画 (Step 21.7b)
  let _fogResizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_fogResizeTimer);
    _fogResizeTimer = setTimeout(renderFogCanvas, 150);
  });

  // 4. 発見済みならビジュアルを復元
  if (motifState  === 'found' && motifEl)  motifEl.classList.add('found');
  if (motif2State === 'found' && motif2El) motif2El.classList.add('found');
  if (eventFound  && eventSpotEl)          eventSpotEl.classList.add('found');

  // 5. D-pad バインド
  bindDpad();

  // 6. GPS確認ボタン
  document.getElementById('gps-btn')?.addEventListener('click', () => {
    const status = document.getElementById('gps-status');
    if (!status) return;

    // HTTPS チェック（localhost は開発用として許可）
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      status.textContent = 'GPSはHTTPS環境で確認してください';
      return;
    }

    if (!navigator.geolocation) {
      status.textContent = 'このブラウザは位置情報に対応していません';
      return;
    }

    status.textContent = 'GPS確認中...';

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
        updateMapStatus(inside);

        // 公園内なら記憶セルを1回刻む
        let memLine = '';
        if (inside) {
          const memResult = stampMemory(pos.x, pos.y);
          saveCells();
          if (memResult === 'new')     addPoints(2);
          if (memResult === 'levelup') addPoints(1);
          addSteps(20);
          renderFogCanvas();    // GPS 確認後も霧を更新
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
      err => {
        const MSG = {
          1: '位置情報が許可されていません',       // PERMISSION_DENIED
          2: '現在地を取得できませんでした',        // POSITION_UNAVAILABLE
          3: 'GPS取得がタイムアウトしました',       // TIMEOUT
        };
        status.textContent = MSG[err.code] ?? 'GPS確認に失敗しました';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  // 7. 開発用リセットボタン（map-header-row 内のボタンにも対応）
  document.querySelectorAll('.dev-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      [STORAGE_POINTS, STORAGE_MOTIF, STORAGE_MOTIF2,
       STORAGE_RECORDS, STORAGE_CELLS, STORAGE_POS, STORAGE_STEPS,
       STORAGE_EVENT].forEach(k => {
        try { localStorage.removeItem(k); } catch(e) {}
      });
      location.reload();
    });
  });
});
