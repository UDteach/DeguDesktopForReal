let clips = [];
let generation = 0;

function clearClips() {
  generation += 1;
  for (const clip of clips) {
    clip.pause();
    clip.removeAttribute('src');
    clip.load();
    clip.remove();
  }
  clips = [];
}

window.degu.onStop(clearClips);
window.degu.onPlay(({ clips: items, playbackId }) => {
  clearClips();
  const current = generation;
  let remaining = items.length;
  if (remaining === 0) { window.degu.ended(playbackId); return; }
  for (const item of items) {
    const clip = document.createElement('video');
    let completed = false;
    const finished = () => {
      if (current !== generation || completed) return;
      completed = true;
      remaining -= 1;
      if (remaining === 0) window.degu.ended(playbackId);
    };
    clip.muted = true;
    clip.playsInline = true;
    clip.style.width = `${item.scale * 100}%`;
    clip.style.left = `${item.left * 100}%`;
    clip.style.bottom = `${item.bottom * 100}%`;
    if (item.flip) clip.style.transform = 'scaleX(-1)';
    clip.addEventListener('ended', finished, { once: true });
    clip.addEventListener('error', finished, { once: true });
    clip.src = item.url;
    document.body.append(clip);
    clips.push(clip);
    clip.play().catch(finished);
  }
});
