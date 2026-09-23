const demo = document.querySelector('.desktop');
const video = document.getElementById('demo-video');
const webp = document.getElementById('demo-webp');
const controls = document.getElementById('demo-controls');
const buttons = [...controls.querySelectorAll('button')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const useWebp = /AppleWebKit/i.test(navigator.userAgent) &&
  !/(Chrome|Chromium|Edg|OPR)\//i.test(navigator.userAgent);
let nextTimer;

function currentButton() {
  return buttons.find(button => button.getAttribute('aria-pressed') === 'true');
}

function selectButton(button) {
  for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
  video.setAttribute('aria-label', `アグーチカラーのデグーの動き：${button.dataset.label}`);
}

function playSelected(button) {
  clearTimeout(nextTimer);
  selectButton(button);
  const path = `assets/demo/${button.dataset.demo}`;
  if (useWebp) {
    webp.src = path.replace(/\.webm$/, '.webp');
  } else {
    if (!video.src.endsWith(path)) video.src = path;
    video.currentTime = 0;
    video.play().catch(() => demo.classList.remove('demo-playing'));
  }
}

function playNext() {
  const current = buttons.indexOf(currentButton());
  playSelected(buttons[(current + 1) % buttons.length]);
}

function scheduleNextWebp() {
  clearTimeout(nextTimer);
  if (!reducedMotion.matches) nextTimer = setTimeout(playNext, 4000);
}

function showFallback() {
  clearTimeout(nextTimer);
  demo.classList.remove('demo-playing', 'demo-ready', 'demo-webp');
  controls.hidden = true;
}

if (useWebp) {
  webp.addEventListener('load', () => {
    demo.classList.add('demo-webp', 'demo-playing');
    controls.hidden = false;
    scheduleNextWebp();
  });
  webp.addEventListener('error', () => {
    if (webp.hasAttribute('src')) showFallback();
  });
  if (!reducedMotion.matches) playSelected(currentButton());
  else controls.hidden = false;
} else if (video.canPlayType('video/webm; codecs="vp9"')) {
  video.addEventListener('loadeddata', () => {
    demo.classList.add('demo-ready');
    controls.hidden = false;
    if (!reducedMotion.matches) video.play().catch(() => {});
  });
  video.addEventListener('playing', () => demo.classList.add('demo-playing'));
  video.addEventListener('ended', () => {
    demo.classList.remove('demo-playing');
    if (!reducedMotion.matches) playNext();
  });
  video.addEventListener('error', showFallback);
  video.src = `assets/demo/${currentButton().dataset.demo}`;
  video.load();
  if (!reducedMotion.matches) video.play().catch(() => {});
} else {
  showFallback();
}

for (const button of buttons) button.addEventListener('click', () => playSelected(button));
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    clearTimeout(nextTimer);
    video.pause();
    webp.removeAttribute('src');
    demo.classList.remove('demo-playing', 'demo-webp');
  } else {
    playSelected(currentButton());
  }
});
