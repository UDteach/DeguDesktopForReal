const clip = document.getElementById('clip');
clip.addEventListener('ended', () => window.degu.ended());
clip.addEventListener('error', () => window.degu.ended());
window.degu.onPlay(({ url, anchor, scale }) => {
  clip.pause();
  clip.style.width = `${scale * 100}%`;
  clip.style.left = anchor === 'center' ? `${(1 - scale) * 50}%` :
    anchor === 'right' ? `${(1 - scale) * 100}%` : '0';
  clip.src = url;
  clip.currentTime = 0;
  clip.play().catch(() => window.degu.ended());
});
