const demo = document.querySelector('.desktop');
const video = document.getElementById('demo-video');
const controls = document.getElementById('demo-controls');
const buttons = [...controls.querySelectorAll('button')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let ready = false;

function selectButton(button) {
  for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
  video.setAttribute('aria-label', `アグーチカラーのデグーの動き：${button.dataset.label}`);
}

function playSelected(button) {
  selectButton(button);
  const next = `assets/demo/${button.dataset.demo}`;
  if (!video.src.endsWith(next)) video.src = next;
  video.currentTime = 0;
  video.play().catch(() => demo.classList.remove('demo-playing'));
}

function activateDemo() {
  if (ready) return;
  if (!video.canPlayType('video/webm; codecs="vp9"')) return;
  ready = true;
  demo.classList.add('demo-ready');
  controls.hidden = false;
  if (!reducedMotion.matches) video.play().catch(() => {});
}

video.addEventListener('loadeddata', activateDemo);

video.addEventListener('playing', () => demo.classList.add('demo-playing'));
video.addEventListener('ended', () => {
  demo.classList.remove('demo-playing');
  if (!reducedMotion.matches) {
    const current = buttons.findIndex(button => button.getAttribute('aria-pressed') === 'true');
    playSelected(buttons[(current + 1) % buttons.length]);
  }
});
video.addEventListener('error', () => {
  demo.classList.remove('demo-playing', 'demo-ready');
  controls.hidden = true;
});
for (const button of buttons) button.addEventListener('click', () => playSelected(button));
if (video.readyState >= 2) activateDemo();
