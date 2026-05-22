// ===========================
// みえないさんぽ3D AREAPETS
// app.js — デモ用最小実装
// ===========================

// --- ナビゲーション切り替え ---
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

// --- ポイントカウンターアニメーション ---
function animateCounter(el, target, duration) {
  const start     = performance.now();
  const startVal  = 0;

  function step(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // イーズアウト
    const eased    = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(startVal + (target - startVal) * eased);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', () => {
  const pointEl = document.getElementById('point-display');
  if (pointEl) animateCounter(pointEl, 128, 900);
});
