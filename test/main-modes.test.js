const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

test('tray switches Pomodoro, countdown visibility, and swarm playback', () => {
  const root = path.join(__dirname, '..');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'degu-main-modes-'));
  const handlers = new Map();
  const windows = [];
  let currentMenu;

  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.events = new Map();
      this.sent = [];
      this.hideCount = 0;
      this.contentEvents = new Map();
      this.webContents = {
        isLoading: () => false,
        send: (channel, payload) => this.sent.push({ channel, payload }),
        once: (event, callback) => this.contentEvents.set(event, callback),
      };
      windows.push(this);
    }
    loadFile() {}
    once(event, callback) { this.events.set(event, callback); }
    on(event, callback) { this.events.set(event, callback); }
    close() { this.events.get('closed')?.(); }
    isDestroyed() { return false; }
    focus() {}
    show() {}
    hide() { this.hideCount += 1; }
    showInactive() {}
    setBounds() {}
    setIgnoreMouseEvents() {}
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    setFullScreenable() {}
  }
  class FakeTray {
    setContextMenu(value) { currentMenu = value; }
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
    screen: {
      getCursorScreenPoint: () => ({ x: 1, y: 1 }),
      getDisplayNearestPoint: () => ({ bounds: { x: 0, y: 0, width: 1440, height: 900 } }),
      getPrimaryDisplay: () => ({ workArea: { x: 0, y: 24, width: 1440, height: 876 } }),
    },
    ipcMain: { handle: (key, callback) => handlers.set(key, callback), on() {} },
  };
  const context = {
    require: (name) => name === 'electron' ? electron :
      name === './modes' ? require('../electron/modes') : require(name),
    __dirname: path.join(root, 'electron'), process: { platform: 'darwin', resourcesPath: '' },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    setImmediate: (callback) => callback(), structuredClone, console,
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8'), context);
  const item = (label) => currentMenu.find((entry) => entry.label === label);
  const saved = () => JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));

  item('ポモドーロ').submenu[0].click();
  assert.equal(saved().modes.pomodoro.enabled, true);
  assert.equal(typeof saved().modes.pomodoro.startedAt, 'number');
  assert.equal(windows.length, 0);

  item('ポモドーロ').submenu[1].click();
  const timer = windows.find((window) => window.options.width === 190);
  timer.contentEvents.get('did-finish-load')();
  assert.equal(saved().modes.showTimer, true);
  assert.equal(timer.sent.at(-1).channel, 'timer:update');
  assert.match(timer.sent.at(-1).payload.time, /^\d+:\d{2}$/);
  item('ポモドーロ').submenu[1].click();
  assert.equal(saved().modes.showTimer, false);
  assert.equal(timer.hideCount > 0, true);

  item('ポモドーロ').submenu[0].click();
  assert.equal(saved().modes.pomodoro.enabled, false);
  const overlay = windows.find((window) => window.options.frame === false && window !== timer);
  assert.equal(overlay.sent.at(-1).channel, 'play');
  assert.equal(overlay.sent.at(-1).payload.clips.length, 1);

  item('デグー大発生モード').click();
  assert.equal(saved().modes.chaos, true);
  const swarm = overlay.sent.at(-1).payload.clips;
  assert.equal(swarm.length, 5);
  const bottomPops = swarm.filter((clip) => clip.url.includes('-a-bottom-pop.webm'));
  const sidePeeks = swarm.filter((clip) => clip.url.includes('-b-side-peek.webm'));
  const centerHops = swarm.filter((clip) => clip.url.includes('-c-center-hop.webm'));
  assert.equal(bottomPops.length, 2);
  assert.equal(sidePeeks.length, 2);
  assert.equal(centerHops.length, 1);
  assert.ok(bottomPops.every((clip) => clip.bottom === 0));
  assert.equal(sidePeeks[0].left, 0);
  assert.equal(sidePeeks[0].flip, true);
  assert.equal(sidePeeks[1].left, 1 - sidePeeks[1].scale);
  assert.equal(sidePeeks[1].flip, false);

  item('モードの設定…').click();
  const dialog = windows.at(-1);
  const value = {
    pomodoro: { enabled: true, focus: 25, shortBreak: 5, longBreak: 15 },
    showTimer: false, chaos: true,
  };
  assert.equal(handlers.get('modes:get')({ sender: dialog.webContents }).language, 'ja');
  assert.equal(handlers.get('modes:save')({ sender: {} }, value), false);
  assert.equal(handlers.get('modes:save')({ sender: dialog.webContents }, {
    ...value, pomodoro: { ...value.pomodoro, focus: 0 },
  }), false);
  const playsBefore = overlay.sent.filter((entry) => entry.channel === 'play').length;
  assert.equal(handlers.get('modes:save')({ sender: dialog.webContents }, value), true);
  assert.equal(saved().modes.pomodoro.enabled, true);
  assert.equal(overlay.sent.filter((entry) => entry.channel === 'play').length, playsBefore);
  item('今すぐ表示').click();
  assert.equal(overlay.sent.filter((entry) => entry.channel === 'play').length, playsBefore + 1);
  item('言語').submenu[1].click();
  assert.equal(currentMenu.find((entry) => entry.label === 'Pomodoro').submenu[1].label, 'Show remaining time on screen');
  assert.equal(currentMenu.some((entry) => entry.label === 'Degu swarm mode'), true);
  fs.rmSync(userData, { recursive: true, force: true });
});
