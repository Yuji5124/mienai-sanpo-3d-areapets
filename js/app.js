// ===========================
// みえないさんぽ3D AREAPETS
// app.js — Step 3: 記憶地図
// ===========================

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
// ポイントカウンターアニメーション
// ===========================
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

// 現在地ドット＋グローを描画
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

// 一時軌跡（5秒でフェードアウト）
function addTrail(x, y) {
  const map = document.getElementById('map-area');
  if (!map) return;
  const pin = map.querySelector('.location-pin');
  const dot = document.createElement('div');
  dot.className  = 'trail-dot';
  dot.style.left = x + '%';
  dot.style.top  = y + '%';
  map.insertBefore(dot, pin);   // 現在地ドットの下のレイヤーに挿入
  trails.push(dot);
  if (trails.length > MAX_TRAIL) {
    trails.shift().remove();
  }
}

// ステータスバッジの一時変更
function flashBadge(text) {
  const badge = document.getElementById('map-badge');
  if (!badge) return;
  badge.textContent = text;
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    badge.textContent = 'エリア探索中...';
  }, 1200);
}

// 方向に移動
function movePin(dx, dy) {
  const oldX = pos.x;
  const oldY = pos.y;
  pos.x = clamp(pos.x + dx * STEP);
  pos.y = clamp(pos.y + dy * STEP);
  stampMemory(pos.x, pos.y);  // 到達した場所に記憶を刻む
  addTrail(oldX, oldY);        // 出発した場所に一時軌跡
  renderPin();
  flashBadge('移動中...');
}

// ===========================
// 記憶地図（永続する足跡）
// ===========================
const MAX_MEMORY  = 80;    // セルの最大数
const MAX_LEVEL   = 5;     // 1セルの最大輝度レベル
const CELL_RADIUS = 5.5;   // 近傍判定の半径（%）

// レベル別の大きさ・明度
const CELL_CONFIG = [
  { size: 8,  opacity: 0.13 },  // lv1 初訪問 — うっすら残る痕跡
  { size: 11, opacity: 0.22 },  // lv2
  { size: 14, opacity: 0.33 },  // lv3
  { size: 17, opacity: 0.44 },  // lv4
  { size: 21, opacity: 0.54 },  // lv5 よく通る場所 — じんわり光る
];

let memoryCells = [];

// 近くにセルがあれば返す
function findNearbyCell(x, y) {
  return memoryCells.find(cell => {
    const dx = cell.x - x;
    const dy = cell.y - y;
    return Math.sqrt(dx * dx + dy * dy) < CELL_RADIUS;
  });
}

// セルにレベルを適用
function applyLevel(cell) {
  const cfg = CELL_CONFIG[cell.level - 1];
  cell.el.style.width   = cfg.size + 'px';
  cell.el.style.height  = cfg.size + 'px';
  cell.el.style.opacity = cfg.opacity;
}

// 記憶セルを押し込む（既存セルならレベルアップ、なければ新規生成）
function stampMemory(x, y) {
  const existing = findNearbyCell(x, y);
  if (existing) {
    existing.level = Math.min(existing.level + 1, MAX_LEVEL);
    applyLevel(existing);
    return;
  }

  const map  = document.getElementById('map-area');
  if (!map) return;
  const grid = map.querySelector('.grid-overlay'); // グリッドより奥のレイヤーに挿入

  const el = document.createElement('div');
  el.className   = 'memory-cell';
  el.style.left  = x + '%';
  el.style.top   = y + '%';

  const cell = { x, y, level: 1, el };
  applyLevel(cell);

  map.insertBefore(el, grid);
  memoryCells.push(cell);

  // 上限を超えたら最も古いセルを除去
  if (memoryCells.length > MAX_MEMORY) {
    memoryCells.shift().el.remove();
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
  const pointEl = document.getElementById('point-display');
  if (pointEl) animateCounter(pointEl, 128, 900);
  renderPin();
  bindDpad();
});
