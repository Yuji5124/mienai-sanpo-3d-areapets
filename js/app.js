// ===========================
// みえないさんぽ3D AREAPETS
// app.js — Step 2: デモ移動
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
const STEP      = 6;   // 1回の移動量（%）
const BOUNDS    = { min: 8, max: 92 };
const MAX_TRAIL = 30;  // 軌跡ドットの上限

let pos    = { x: 50, y: 50 };
let trails = [];
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

// 軌跡ドットを追加
function addTrail(x, y) {
  const map = document.getElementById('map-area');
  if (!map) return;
  const dot = document.createElement('div');
  dot.className = 'trail-dot';
  dot.style.left = x + '%';
  dot.style.top  = y + '%';
  map.appendChild(dot);
  trails.push(dot);
  if (trails.length > MAX_TRAIL) {
    trails.shift().remove();
  }
}

// ステータスバッジを一時的に変更
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
  addTrail(pos.x, pos.y);
  pos.x = clamp(pos.x + dx * STEP);
  pos.y = clamp(pos.y + dy * STEP);
  renderPin();
  flashBadge('移動中...');
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

    // タッチ優先（preventDefault でダブルタップズームも防ぐ）
    btn.addEventListener('touchstart', e => {
      e.preventDefault();
      movePin(dx, dy);
    }, { passive: false });

    // マウス・キーボード用フォールバック
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
