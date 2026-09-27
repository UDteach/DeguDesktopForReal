function effectFor(motion) {
  if (motion.id === 'a-bottom-pop') return 'bottom';
  if (motion.id === 'b-side-peek') return 'pop';
  return 'hop';
}

function inspectFrame(video, requireAlpha = true) {
  if (!video.videoWidth || !video.videoHeight) return false;
  const width = 160;
  const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    if (!requireAlpha) return { backgroundColor: `rgb(${pixels[0]}, ${pixels[1]}, ${pixels[2]})` };
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 245) return { backgroundColor: null };
    }
  } catch { return requireAlpha ? false : { backgroundColor: null }; }
  return false;
}

export function createRenderer(stage, {
  onEnded = () => {}, onError = () => {}, onFormat = () => {}, allowOpaqueVideo = false,
} = {}) {
  let generation = 0;
  let video = null;
  let loadingTimer = null;
  let watchdog = null;
  let preferMp4 = false;

  function releaseVideo() {
    if (!video) return;
    const media = video;
    video = null;
    media.pause();
    media.removeAttribute('src');
    media.load();
    media.remove();
  }

  function clear() {
    generation += 1;
    clearTimeout(loadingTimer);
    clearTimeout(watchdog);
    loadingTimer = null;
    watchdog = null;
    releaseVideo();
    stage.replaceChildren();
  }

  function play({ variant, motion, sizePx, side, area, opacity, renderer = 'auto' }) {
    clear();
    const current = generation;
    let complete = false;
    let fallbackStarted = false;
    let mp4Attempted = false;
    const finish = (result = 'finished') => {
      if (current !== generation || complete) return;
      complete = true;
      clearTimeout(loadingTimer);
      clearTimeout(watchdog);
      loadingTimer = null;
      watchdog = null;
      onEnded(result);
    };

    const stageWidth = Math.max(1, stage.clientWidth);
    const stageHeight = Math.max(1, stage.clientHeight);
    const areaWidth = stageWidth * area.width / 100;
    const areaHeight = stageHeight * area.height / 100;
    const frameHeight = Math.max(1, Math.min(sizePx * stageHeight / 1080, areaHeight * 0.9, areaWidth * 0.9 * 9 / 16));
    const frameWidth = frameHeight * 16 / 9;
    const effect = effectFor(motion);
    const location = side === 'random' ? (Math.random() < 0.5 ? 'left' : 'right') : side;

    const clip = document.createElement('div');
    clip.className = 'obs-area';
    Object.assign(clip.style, {
      left: `${area.x}%`, top: `${area.y}%`, width: `${area.width}%`, height: `${area.height}%`,
      opacity: String(opacity / 100),
    });
    const actor = document.createElement('div');
    actor.className = `obs-actor obs-${effect}`;
    actor.style.width = `${frameWidth}px`;
    actor.style.height = `${frameHeight}px`;
    if (effect === 'bottom') {
      const percent = location === 'left' ? 25 : 75;
      actor.style.left = `${percent}%`;
      actor.style.transform = 'translateX(-50%)';
    } else {
      actor.style[location] = '0';
      // The side-peek clip enters from its right edge. Mirror it at the left edge.
      if (effect === 'pop' && location === 'left') actor.style.transform = 'scaleX(-1)';
      if (effect === 'hop' && location === 'right') actor.style.transform = 'scaleX(-1)';
    }
    clip.append(actor);
    stage.append(clip);

    // Allow both video formats to load (up to five seconds each) before a four-second PNG.
    watchdog = setTimeout(() => finish('timeout'), allowOpaqueVideo ? 18000 : 12000);

    function showImage(reason) {
      if (current !== generation || complete || fallbackStarted) return;
      fallbackStarted = true;
      clearTimeout(loadingTimer);
      loadingTimer = null;
      releaseVideo();
      if (reason) onError(reason);
      const image = document.createElement('img');
      image.className = 'obs-media obs-image';
      image.alt = '';
      image.decoding = 'async';
      image.addEventListener('load', () => {
        if (current !== generation || complete) return;
        onFormat({ format: 'png', error: reason });
        // A layout read restarts the animation after rapid source changes.
        void image.offsetWidth;
        image.classList.add('is-playing');
      }, { once: true });
      image.addEventListener('error', () => finish('failed'), { once: true });
      image.addEventListener('animationend', () => finish(), { once: true });
      actor.append(image);
      image.src = new URL(variant.image, document.baseURI).href;
    }

    if (renderer === 'png') {
      showImage();
      return;
    }
    function playVideo(url, format) {
      clearTimeout(loadingTimer);
      releaseVideo();
      const media = document.createElement('video');
      video = media;
      if (format === 'mp4') mp4Attempted = true;
      media.className = 'obs-media obs-video';
      media.dataset.format = format;
      media.muted = true;
      media.defaultMuted = true;
      media.playsInline = true;
      media.preload = 'auto';
      function failed(reason) {
        if (current !== generation || complete || video !== media) return;
        if (allowOpaqueVideo && motion.fallbackVideo && !mp4Attempted) {
          if (reason === 'video-alpha') preferMp4 = true;
          playVideo(motion.fallbackVideo, 'mp4');
        } else showImage(reason);
      }
      media.addEventListener('loadeddata', () => {
        if (current !== generation || complete || video !== media) return;
        const frame = inspectFrame(media, format === 'webm');
        if (!frame) { failed('video-alpha'); return; }
        Promise.resolve(media.play()).then(() => {
          if (current !== generation || complete || video !== media) return;
          clearTimeout(loadingTimer);
          loadingTimer = null;
          onFormat({ format, backgroundColor: frame.backgroundColor });
          void media.offsetWidth;
          media.classList.add('is-playing');
        }).catch(() => failed('video-play'));
      }, { once: true });
      media.addEventListener('error', () => failed('video-error'), { once: true });
      media.addEventListener('ended', () => { if (video === media) finish(); }, { once: true });
      actor.append(media);
      loadingTimer = setTimeout(() => failed('video-timeout'), 5000);
      media.src = new URL(url, document.baseURI).href;
      media.load();
    }
    if (preferMp4 && allowOpaqueVideo && motion.fallbackVideo) playVideo(motion.fallbackVideo, 'mp4');
    else playVideo(motion.video, 'webm');
  }

  return { play, stop: clear, destroy: clear };
}
