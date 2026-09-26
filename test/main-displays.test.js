const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const primaryDisplay = {
  id: 1, label: 'Built-in Retina', scaleFactor: 2,
  bounds: { x: 0, y: 0, width: 1440, height: 900 },
  workArea: { x: 0, y: 24, width: 1440, height: 876 },
};
const externalDisplay = {
  id: 22, label: 'Left Portrait', scaleFactor: 1,
  bounds: { x: -1200, y: -240, width: 1200, height: 1920 },
  workArea: { x: -1200, y: -240, width: 1200, height: 1920 },
};

// Run the real main process against two independently loading renderers. Timers
// only advance explicitly, so a stale renderer cannot silently start another run.
function harness(t, savedSettings = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'degu-main-displays-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify(savedSettings));
  const windows = [];
  const timers = new Map();
  const pendingLoads = [];
  const ipc = new EventEmitter();
  const handlers = new Map();
  const screen = new EventEmitter();
  let displays = structuredClone([primaryDisplay, externalDisplay]);
  let menu;
  let sequence = 0;
  let windowSequence = 0;
  screen.getAllDisplays = () => displays;
  screen.getPrimaryDisplay = () => displays.find((display) => display.id === 1) || displays[0];
  screen.getCursorScreenPoint = () => ({ x: -100, y: 100 });
  screen.getDisplayNearestPoint = () => displays.find((display) => display.id === 22) || screen.getPrimaryDisplay();

  class FakeWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.sent = [];
      this.visible = false;
      this.destroyed = false;
      this.hideCount = 0;
      this.showCount = 0;
      this.loading = true;
      this.webContents = new EventEmitter();
      this.webContents.id = ++windowSequence;
      this.webContents.isLoading = () => this.loading;
      this.webContents.isDestroyed = () => this.destroyed;
      this.webContents.send = (channel, payload) => {
        assert.equal(this.destroyed, false, 'must not send to a destroyed renderer');
        this.sent.push({ channel, payload: structuredClone(payload) });
      };
      windows.push(this);
    }
    loadFile(file) { this.file = file; pendingLoads.push(this); }
    isDestroyed() { return this.destroyed; }
    close() { this.destroy(); }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.visible = false;
      this.emit('closed');
    }
    focus() {}
    show() { this.showInactive(); }
    showInactive() { this.visible = true; this.showCount += 1; }
    hide() { this.visible = false; this.hideCount += 1; }
    setBounds(bounds) { this.bounds = structuredClone(bounds); }
    setIgnoreMouseEvents() {}
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    setFullScreenable() {}
  }
  class FakeTray {
    setContextMenu(value) { menu = value; }
    setToolTip() {}
  }
  const electron = {
    app: {
      isPackaged: false,
      getPath: () => userData,
      whenReady: () => ({ then: (callback) => callback() }),
      dock: { hide() {} },
      on() {},
    },
    BrowserWindow: FakeWindow,
    Menu: { buildFromTemplate: (template) => template },
    Tray: FakeTray,
    nativeImage: { createFromPath: () => ({}) },
    screen,
    ipcMain: Object.assign(ipc, { handle: (name, callback) => handlers.set(name, callback) }),
  };
  const videoDirectory = path.join(root, 'assets', 'videos');
  const videoFiles = ['agouti', 'blue', 'sand'].flatMap((color) =>
    ['a-bottom-pop', 'b-side-peek', 'c-center-hop'].map((motion) => `${color}-${motion}.webm`));
  const fakeFs = {
    ...fs,
    existsSync: (file) => file === videoDirectory || fs.existsSync(file),
    readdirSync: (file, ...args) => file === videoDirectory ? videoFiles : fs.readdirSync(file, ...args),
  };
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0.2;
  const context = {
    require: (name) => name === 'electron' ? electron : name === 'node:fs' ? fakeFs :
      name.startsWith('./') ? require(path.join(root, 'electron', name)) : require(name),
    __dirname: path.join(root, 'electron'),
    process: { platform: 'darwin', resourcesPath: '' },
    setTimeout: (callback, delay) => {
      const id = ++sequence;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: () => ++sequence,
    clearInterval() {},
    setImmediate: (callback) => queueMicrotask(callback),
    structuredClone, console, Math: deterministicMath,
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8'), context);

  const item = (...labels) => {
    let entries = menu;
    let found;
    for (const label of labels) {
      found = entries.find((entry) => entry.label === label);
      assert.ok(found, `menu item ${labels.join(' > ')} exists`);
      entries = found.submenu;
    }
    return found;
  };
  const completeLoads = async (onlyWindow) => {
    // loadFile never emits in its own call stack, as in Electron.
    await Promise.resolve();
    const completing = onlyWindow ? [onlyWindow] : [...pendingLoads];
    for (const window of completing) {
      const index = pendingLoads.indexOf(window);
      assert.ok(index >= 0, 'renderer has a pending load');
      pendingLoads.splice(index, 1);
      if (window.destroyed) continue;
      window.loading = false;
      window.webContents.emit('did-finish-load');
      window.emit('ready-to-show');
    }
    await Promise.resolve();
  };
  const fireStartup = () => {
    const startup = [...timers].find(([, timer]) => timer.delay === 600);
    assert.ok(startup, 'startup appearance is scheduled');
    timers.delete(startup[0]);
    startup[1].callback();
  };
  return {
    item, completeLoads, fireStartup,
    start: async () => { fireStartup(); await completeLoads(); },
    overlays: () => windows.filter((window) => path.basename(window.file || '') === 'overlay.html'),
    active: () => windows.filter((window) => window.visible && !window.destroyed),
    playback: (window) => window.sent.filter((message) => message.channel === 'play').at(-1)?.payload,
    end: (window, playbackId) => ipc.emit('clip-ended', { sender: window.webContents }, playbackId),
    unknownEnd: (playbackId) => ipc.emit('clip-ended', { sender: { id: 9999 } }, playbackId),
    scheduledRuns: () => [...timers.values()].filter((timer) => timer.callback.name === 'playNext'),
    saved: () => JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')),
    changeDisplays: (next, event, display, metrics) => {
      displays = structuredClone(next);
      screen.emit(event, {}, display, metrics);
    },
  };
}

test('all monitors use the same playback while preserving each display bounds and completion', async (t) => {
  const h = harness(t, { displayTarget: 'all' });
  h.fireStartup();
  const [primary, external] = h.overlays();
  assert.equal(h.overlays().length, 2);
  assert.equal(h.playback(primary), undefined, 'wait for the first renderer to load');
  assert.equal(h.playback(external), undefined, 'wait for the second renderer to load');
  await h.completeLoads(primary);
  assert.equal(h.playback(primary), undefined, 'the faster renderer waits for the other display');
  assert.equal(h.active().length, 0);
  await h.completeLoads();
  assert.deepEqual(primary.bounds, primaryDisplay.bounds);
  assert.deepEqual(external.bounds, externalDisplay.bounds);
  const playback = h.playback(primary);
  assert.ok(Number.isInteger(playback.playbackId));
  assert.deepEqual(h.playback(external), playback, 'motion, coat and playback id match across monitors');
  assert.equal(h.active().length, 2);

  const externalHideCount = external.hideCount;
  h.end(primary, playback.playbackId);
  assert.equal(external.hideCount, externalHideCount, 'one completed video does not stop the other monitor');
  assert.equal(external.visible, true);
  assert.equal(h.scheduledRuns().length, 0, 'wait for every monitor before scheduling');
  h.end(primary, playback.playbackId);
  assert.equal(h.scheduledRuns().length, 0, 'duplicate completion is ignored');
  h.end(external, playback.playbackId);
  assert.equal(h.active().length, 0);
  assert.equal(h.scheduledRuns().length, 1);
});

test('old or unrelated renderer completions cannot interrupt a newer multi-monitor playback', async (t) => {
  const h = harness(t, { displayTarget: 'all' });
  await h.start();
  const [primary, external] = h.overlays();
  const oldId = h.playback(primary).playbackId;
  h.item('今すぐ表示').click();
  const currentId = h.playback(primary).playbackId;
  assert.notEqual(currentId, oldId);
  const hideCounts = [primary.hideCount, external.hideCount];
  h.end(primary, oldId);
  h.end(external, oldId);
  h.unknownEnd(currentId);
  assert.deepEqual([primary.hideCount, external.hideCount], hideCounts);
  assert.equal(h.active().length, 2);
  assert.equal(h.scheduledRuns().length, 0);
  h.end(primary, currentId);
  assert.equal(h.scheduledRuns().length, 0);
  h.end(external, currentId);
  assert.equal(h.scheduledRuns().length, 1);
});

test('pausing while renderers load cancels both queued appearances', async (t) => {
  const h = harness(t, { displayTarget: 'all' });
  h.fireStartup();
  h.item('一時停止').click();
  await h.completeLoads();
  assert.equal(h.overlays().length, 2);
  assert.ok(h.overlays().every((window) => h.playback(window) === undefined));
  assert.ok(h.overlays().every((window) => window.showCount === 0));
  assert.equal(h.scheduledRuns().length, 0);
});

test('a disconnected chosen monitor falls back to primary and is restored when reconnected', async (t) => {
  const h = harness(t, { displayTarget: 'display:22' });
  await h.start();
  const originalExternal = h.active()[0];
  const originalId = h.playback(originalExternal).playbackId;
  assert.deepEqual(originalExternal.bounds, externalDisplay.bounds);
  h.changeDisplays([primaryDisplay], 'display-removed', externalDisplay);
  assert.equal(originalExternal.destroyed, true);
  assert.equal(h.saved().displayTarget, 'display:22', 'remember the choice while unplugged');

  h.item('今すぐ表示').click();
  await h.completeLoads();
  const fallback = h.active()[0];
  assert.deepEqual(fallback.bounds, primaryDisplay.bounds);
  h.end(originalExternal, originalId);
  assert.equal(fallback.visible, true, 'disconnected renderer completion is ignored');
  assert.equal(h.saved().displayTarget, 'display:22');

  h.changeDisplays([primaryDisplay, externalDisplay], 'display-added', externalDisplay);
  h.item('今すぐ表示').click();
  await h.completeLoads();
  assert.equal(h.active().length, 1);
  assert.deepEqual(h.active()[0].bounds, externalDisplay.bounds);
  assert.equal(h.saved().displayTarget, 'display:22');
  assert.ok(h.item('デグーの表示先').submenu.some((entry) => entry.label?.includes('Left Portrait')));

  const rotated = {
    ...externalDisplay,
    bounds: { x: -1920, y: -200, width: 1920, height: 1200 },
  };
  h.changeDisplays([primaryDisplay, rotated], 'display-metrics-changed', rotated, ['bounds']);
  h.item('今すぐ表示').click();
  await h.completeLoads();
  assert.deepEqual(h.active()[0].bounds, rotated.bounds);
});

test('display menu persists cursor, primary, all and numbered monitor selections', async (t) => {
  const h = harness(t);
  await h.start();
  assert.deepEqual(h.active()[0].bounds, externalDisplay.bounds);
  for (const [label, target] of [
    ['メインモニタ', 'primary'], ['すべてのモニタ', 'all'], ['カーソルのあるモニタ', 'cursor'],
  ]) {
    h.item('デグーの表示先', label).click();
    assert.equal(h.saved().displayTarget, target);
    assert.equal(h.item('デグーの表示先', label).checked, true);
    assert.equal(h.active().length, 0, 'changing the target stops the old placement');
  }
  const externalItem = h.item('デグーの表示先').submenu.find((entry) => entry.label?.includes('Left Portrait'));
  assert.ok(externalItem);
  assert.match(externalItem.label, /2/);
  externalItem.click();
  assert.equal(h.saved().displayTarget, 'display:22');
});

test('per-coat sizes persist independently, inherit the base size and can be reset together', async (t) => {
  const h = harness(t, { allColors: false, colors: ['agouti'] });
  await h.start();
  h.item('表示サイズ', '毛色ごと', 'アグーチ', '特大').click();
  h.item('表示サイズ', '全体の基本サイズ', '小さめ').click();
  assert.equal(h.saved().size, 0);
  assert.equal(h.saved().sizeByColor.agouti, 3);
  h.item('今すぐ表示').click();
  assert.equal(h.playback(h.active()[0]).clips[0].scale, 1);

  h.item('毛色', '1色だけ表示', 'ブルー（グレー）').click();
  h.item('今すぐ表示').click();
  assert.equal(h.playback(h.active()[0]).clips[0].scale, 0.45, 'unset coat inherits the new base size');
  h.item('表示サイズ', '毛色ごと', 'アグーチ', '全体の基本サイズを使う').click();
  assert.equal(h.saved().sizeByColor.agouti, undefined);
  h.item('表示サイズ', '毛色ごと', 'アグーチ', '特大').click();
  h.item('表示サイズ', '毛色ごと', 'サンド', '大きめ').click();
  h.item('表示サイズ', '個別設定を消して全体に統一').click();
  assert.deepEqual(h.saved().sizeByColor, {});
  assert.equal(h.saved().size, 0);
});

test('swarm uses each coat size when placing clips against screen edges', async (t) => {
  const h = harness(t, { displayTarget: 'all', size: 1, sizeByColor: { agouti: 0, sand: 3 } });
  await h.start();
  h.item('デグー大発生モード').click();
  const [primary, external] = h.active();
  const clips = h.playback(primary).clips;
  assert.equal(clips.length, 5);
  assert.deepEqual(h.playback(external), h.playback(primary));
  const expectedScales = { agouti: 0.34, blue: 0.6 * 0.72, sand: 0.48 };
  const seenColors = new Set();
  for (const clip of clips) {
    const color = path.basename(new URL(clip.url).pathname).split('-')[0];
    seenColors.add(color);
    assert.equal(clip.scale, expectedScales[color], `${color} uses its own scale`);
    assert.ok(clip.left >= 0 && clip.left + clip.scale <= 1);
  }
  assert.deepEqual([...seenColors].sort(), ['agouti', 'blue', 'sand']);
  assert.equal(clips[0].left, 0);
  assert.equal(clips[0].bottom, 0);
  assert.equal(clips[1].left, 1 - clips[1].scale);
  assert.equal(clips[1].bottom, 0);
  assert.equal(clips[2].left, 0);
  assert.equal(clips[2].flip, true);
  assert.equal(clips[3].left, 1 - clips[3].scale);
  assert.equal(clips[3].flip, false);
  assert.equal(clips[4].left, (1 - clips[4].scale) / 2);
});
