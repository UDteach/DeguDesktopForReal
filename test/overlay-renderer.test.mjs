import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../shared/overlay/renderer.mjs';

const baseURI = 'https://example.test/DeguDesktopForReal/try/';
const absolute = (path) => new URL(path, baseURI).href;
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

function appearance(coat = 'blue_pied') {
  return {
    variant: { id: coat, image: `../assets/colors/${coat}.png` },
    motion: {
      id: 'b-side-peek',
      video: `../assets/obs-videos/${coat}-b-side-peek.webm`,
      fallbackVideo: `../assets/trial-videos/${coat}-b-side-peek.mp4`,
    },
    sizePx: 360, side: 'left', opacity: 100,
    area: { x: 0, y: 0, width: 100, height: 100 },
  };
}

// Events and play() settle only when a test delivers them, including after removal.
// Canvas supplies one representative pixel; it does not emulate video decoding.
function harness(t, options = {}) {
  const requests = [];
  const elements = [];
  const ended = [];
  const formats = [];
  const errors = [];
  class Element extends EventTarget {
    constructor(tag) {
      super();
      this.tag = tag;
      this.children = [];
      this.style = {};
      this.dataset = {};
      this.classList = new Set();
      this.clientWidth = 960;
      this.clientHeight = 540;
      this.videoWidth = 1920;
      this.videoHeight = 1080;
      this.alpha = 0;
      this.playCalls = 0;
    }
    set src(value) { this.url = value; requests.push(value); }
    get src() { return this.url; }
    append(child) { child.parent = this; this.children.push(child); }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
    replaceChildren() { for (const child of [...this.children]) child.remove(); }
    removeAttribute(name) { if (name === 'src') this.url = undefined; }
    load() {}
    pause() {}
    play() { this.playCalls += 1; this.pendingPlay = Promise.withResolvers(); return this.pendingPlay.promise; }
    fire(type) { this.dispatchEvent(new Event(type)); }
    getContext() {
      let frame;
      return {
        drawImage(media) { frame = media; },
        getImageData: () => ({ data: new Uint8ClampedArray([22, 33, 44, frame.alpha]) }),
      };
    }
  }
  const originalDocument = globalThis.document;
  globalThis.document = {
    baseURI,
    createElement(tag) { const element = new Element(tag); elements.push(element); return element; },
  };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = new Element('stage');
  const renderer = createRenderer(stage, {
    onEnded: (result) => ended.push(result), onFormat: (format) => formats.push(format),
    onError: (reason) => errors.push(reason), ...options,
  });
  t.after(() => {
    renderer.destroy();
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });
  return {
    renderer, stage, requests, ended, formats, errors,
    latest: (tag) => elements.findLast((element) => element.tag === tag),
  };
}

for (const failure of ['decode error', 'opaque WebM frame', 'play rejection']) {
  test(`browser ${failure} falls back to the same motion in MP4, then PNG`, async (t) => {
    const h = harness(t, { allowOpaqueVideo: true });
    const choice = appearance();
    h.renderer.play(choice);
    const webm = h.latest('video');
    if (failure === 'decode error') webm.fire('error');
    else {
      if (failure === 'opaque WebM frame') webm.alpha = 255;
      webm.fire('loadeddata');
      if (failure === 'play rejection') {
        webm.pendingPlay.reject(new Error('Playback blocked'));
        await settle();
      }
    }
    assert.deepEqual(h.requests, [absolute(choice.motion.video), absolute(choice.motion.fallbackVideo)]);
    h.latest('video').fire('error');
    assert.deepEqual(h.requests, [
      absolute(choice.motion.video), absolute(choice.motion.fallbackVideo), absolute(choice.variant.image),
    ]);
    const png = h.latest('img');
    png.fire('load');
    assert.equal(h.formats.at(-1).format, 'png');
    assert.deepEqual(h.ended, []);
    png.fire('animationend');
    assert.deepEqual(h.ended, ['finished']);
  });
}

test('browser can play an opaque MP4 without replacing it with an image', async (t) => {
  const h = harness(t, { allowOpaqueVideo: true });
  h.renderer.play(appearance());
  h.latest('video').fire('error');
  const mp4 = h.latest('video');
  mp4.alpha = 255;
  mp4.fire('loadeddata');
  assert.equal(mp4.playCalls, 1);
  mp4.pendingPlay.resolve();
  await settle();
  assert.deepEqual(h.formats, [{ format: 'mp4', backgroundColor: 'rgb(22, 33, 44)' }]);
  assert.equal(h.latest('img'), undefined);
  mp4.fire('ended');
  assert.deepEqual(h.ended, ['finished']);
});

for (const [name, options] of [['default renderer', {}], ['explicit OBS mode', { allowOpaqueVideo: false }]]) {
  test(`${name} rejects opaque WebM without requesting MP4`, (t) => {
    const h = harness(t, options);
    const choice = appearance();
    h.renderer.play(choice);
    const webm = h.latest('video');
    webm.alpha = 255;
    webm.fire('loadeddata');
    assert.equal(webm.playCalls, 0, 'OBS must not show an opaque video rectangle');
    assert.deepEqual(h.requests, [absolute(choice.motion.video), absolute(choice.variant.image)]);
    assert.equal(h.latest('img').parent !== null, true);
  });
}

for (const action of ['stop', 'change coat']) {
  for (const late of ['loadeddata', 'play rejection', 'play resolution']) {
    test(`${action} ignores stale ${late}, error, and ended events`, async (t) => {
      const h = harness(t, { allowOpaqueVideo: true });
      h.renderer.play(appearance());
      const stale = h.latest('video');
      if (late !== 'loadeddata') stale.fire('loadeddata');
      if (action === 'stop') h.renderer.stop();
      else h.renderer.play(appearance('sand'));
      const requestsBefore = [...h.requests];
      if (late === 'play rejection') stale.pendingPlay.reject(new Error('Old play was interrupted'));
      if (late === 'play resolution') stale.pendingPlay.resolve();
      await settle();
      stale.fire('loadeddata');
      stale.fire('error');
      stale.fire('ended');
      assert.deepEqual(h.requests, requestsBefore, 'an old event must not request fallback media');
      assert.deepEqual(h.formats, []);
      assert.deepEqual(h.errors, []);
      assert.deepEqual(h.ended, []);
      if (late === 'loadeddata') assert.equal(stale.playCalls, 0);
      if (action === 'stop') {
        t.mock.timers.tick(20000);
        assert.deepEqual(h.requests, requestsBefore, 'stopping also cancels pending fallback timers');
        assert.deepEqual(h.ended, []);
        assert.equal(h.stage.children.length, 0);
      } else {
        const active = h.latest('video');
        assert.equal(active.src, absolute(appearance('sand').motion.video));
        active.fire('loadeddata');
        active.pendingPlay.resolve();
        await settle();
        assert.equal(h.formats.at(-1).format, 'webm');
        active.fire('ended');
        assert.deepEqual(h.ended, ['finished'], 'the selected coat can still finish normally');
      }
    });
  }
}

test('a late WebM play rejection cannot interrupt the MP4 already replacing it', async (t) => {
  const h = harness(t, { allowOpaqueVideo: true });
  h.renderer.play(appearance());
  const webm = h.latest('video');
  webm.fire('loadeddata');
  webm.fire('error');
  const mp4 = h.latest('video');
  webm.pendingPlay.reject(new Error('Old format was released'));
  await settle();
  webm.fire('ended');
  assert.equal(h.latest('video'), mp4);
  assert.equal(h.requests.length, 2);
  assert.equal(h.latest('img'), undefined);
  assert.deepEqual(h.ended, []);
  mp4.alpha = 255;
  mp4.fire('loadeddata');
  mp4.pendingPlay.resolve();
  await settle();
  assert.equal(h.formats.at(-1).format, 'mp4');
});

test('two video load timeouts leave enough time for the four-second PNG animation', (t) => {
  const h = harness(t, { allowOpaqueVideo: true });
  const choice = appearance();
  h.renderer.play(choice);
  t.mock.timers.tick(5000);
  assert.equal(h.requests.at(-1), absolute(choice.motion.fallbackVideo));
  t.mock.timers.tick(5000);
  assert.equal(h.requests.at(-1), absolute(choice.variant.image));
  const png = h.latest('img');
  png.fire('load');
  t.mock.timers.tick(4000);
  assert.deepEqual(h.ended, [], 'the watchdog must allow both five-second loads plus the PNG animation');
  png.fire('animationend');
  assert.deepEqual(h.ended, ['finished']);
  t.mock.timers.tick(20000);
  assert.deepEqual(h.ended, ['finished'], 'completion cancels the watchdog');
});
