const { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const motions = [
  { id: 'a-bottom-pop', anchor: 'center' },
  { id: 'b-side-peek', anchor: 'right' },
  { id: 'c-center-hop', anchor: 'left' },
];
const frequencies = [
  { label: '3〜6分ごと', min: 180, max: 360 },
  { label: '5〜10分ごと', min: 300, max: 600 },
  { label: '10〜20分ごと', min: 600, max: 1200 },
];
const sizes = [
  { label: '小さめ', scale: 0.45 },
  { label: '標準', scale: 0.60 },
  { label: '大きめ', scale: 0.80 },
  { label: '特大', scale: 1.0 },
];

let tray;
let overlay;
let nextTimer;
let stopTimer;
let lastMotion = -1;
let lastColor;
let paused = false;
let settings = { frequency: 1, size: 1, allColors: true, colors: [] };
let availableColors = [];

function videoDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'videos')
    : path.join(__dirname, '..', 'assets', 'videos');
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    if (Number.isInteger(saved.frequency) && frequencies[saved.frequency]) settings.frequency = saved.frequency;
    if (Number.isInteger(saved.size) && sizes[saved.size]) settings.size = saved.size;
    if (Array.isArray(saved.colors)) {
      settings.colors = saved.colors.filter((id) => typeof id === 'string');
      if (typeof saved.allColors === 'boolean') settings.allColors = saved.allColors;
    } else if (typeof saved.color === 'string') {
      // Keep the user's choice from the original single-color menu.
      settings.colors = [saved.color];
      settings.allColors = false;
    }
  } catch { /* defaults on first launch */ }
}

function saveSettings() {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings));
}

function discoverColors() {
  const files = fs.existsSync(videoDir()) ? fs.readdirSync(videoDir()) : [];
  const ids = [...new Set(files.map((name) => name.match(/^(.+)-a-bottom-pop\.webm$/)?.[1]).filter(Boolean))];
  availableColors = ids.filter((id) => motions.every((motion) => files.includes(`${id}-${motion.id}.webm`)));
  settings.colors = [...new Set(settings.colors)].filter((id) => availableColors.includes(id));
  if (!settings.allColors && settings.colors.length === 0 && availableColors.length) {
    settings.colors = [availableColors.includes('agouti') ? 'agouti' : availableColors[0]];
  }
}

function selectedColors() {
  return settings.allColors ? availableColors : settings.colors;
}

function toggleColor(id) {
  if (settings.allColors) {
    settings.allColors = false;
    settings.colors = availableColors.filter((color) => color !== id);
    if (settings.colors.length === 0) settings.colors = [id];
  } else if (settings.colors.includes(id)) {
    if (settings.colors.length > 1) settings.colors = settings.colors.filter((color) => color !== id);
  } else {
    settings.colors.push(id);
  }
  saveSettings();
  refreshMenu();
}

function menu() {
  const colorNames = {
    agouti: 'アグーチ', sand: 'サンド', white: 'ホワイト', black: 'ブラック',
    blue: 'ブルー（グレー）', chocolate: 'チョコレート', lilac: 'ライラック',
    violet: 'バイオレット', agouti_pied: 'アグーチパイド', sand_pied: 'サンドパイド',
    blue_pied: 'ブルーパイド', cream_pied: 'クリームパイド', black_pied: 'ブラックパイド',
  };
  return Menu.buildFromTemplate([
    { label: '今すぐ表示', click: playNext },
    { label: paused ? '再開' : '一時停止', click: () => { paused = !paused; stop(); if (!paused) schedule(); refreshMenu(); } },
    { type: 'separator' },
    { label: '毛色', submenu: [
      { label: '全色ランダム', type: 'checkbox', checked: settings.allColors,
        click: () => {
          settings.allColors = !settings.allColors;
          if (!settings.allColors && settings.colors.length === 0) settings.colors = [...availableColors];
          saveSettings(); refreshMenu();
        } },
      { type: 'separator' },
      ...availableColors.map((id) => ({
        label: colorNames[id] || id, type: 'checkbox',
        checked: selectedColors().includes(id), click: () => toggleColor(id),
      })),
    ] },
    { label: '出現間隔', submenu: frequencies.map((item, index) => ({
      label: item.label, type: 'radio', checked: settings.frequency === index,
      click: () => { settings.frequency = index; saveSettings(); schedule(); refreshMenu(); },
    })) },
    { label: '表示サイズ', submenu: sizes.map((item, index) => ({
      label: item.label, type: 'radio', checked: settings.size === index,
      click: () => { settings.size = index; saveSettings(); refreshMenu(); },
    })) },
    { type: 'separator' },
    { label: '終了', role: 'quit' },
  ]);
}

function refreshMenu() { tray.setContextMenu(menu()); }

function stop() {
  clearTimeout(nextTimer);
  clearTimeout(stopTimer);
  nextTimer = undefined;
  stopTimer = undefined;
  if (overlay && !overlay.isDestroyed()) overlay.hide();
}

function schedule() {
  clearTimeout(nextTimer);
  if (paused || availableColors.length === 0) return;
  const range = frequencies[settings.frequency];
  const seconds = range.min + Math.random() * (range.max - range.min);
  nextTimer = setTimeout(playNext, seconds * 1000);
}

function ensureOverlay() {
  if (overlay && !overlay.isDestroyed()) return overlay;
  overlay = new BrowserWindow({
    show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    skipTaskbar: true, focusable: false, hasShadow: false, resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false,
    },
  });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') {
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlay.setFullScreenable(false);
  }
  overlay.loadFile(path.join(__dirname, 'overlay.html'));
  overlay.on('closed', () => { overlay = undefined; });
  return overlay;
}

function playNext() {
  if (availableColors.length === 0) return;
  paused = false;
  refreshMenu();
  stop();
  const choices = motions.map((_, index) => index).filter((index) => index !== lastMotion);
  lastMotion = choices[Math.floor(Math.random() * choices.length)];
  const motion = motions[lastMotion];
  const colors = selectedColors();
  const colorChoices = colors.length > 1 ? colors.filter((id) => id !== lastColor) : colors;
  const color = colorChoices[Math.floor(Math.random() * colorChoices.length)];
  lastColor = color;
  const file = path.join(videoDir(), `${color}-${motion.id}.webm`);
  if (!fs.existsSync(file)) { schedule(); return; }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.bounds;
  const window = ensureOverlay();
  window.setBounds({ x, y, width, height });
  const send = () => {
    window.webContents.send('play', { url: require('node:url').pathToFileURL(file).href,
      anchor: motion.anchor, scale: sizes[settings.size].scale });
    window.showInactive();
    // Never leave an invisible full-screen overlay alive after decoder failure.
    stopTimer = setTimeout(() => { stop(); schedule(); }, 8500);
  };
  if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send);
  else send();
}

ipcMain.on('clip-ended', () => { stop(); schedule(); });

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  loadSettings();
  discoverColors();
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icons', 'tray.png'));
  tray = new Tray(trayIcon);
  tray.setToolTip('Degu Gatekeeper');
  refreshMenu();
  setTimeout(playNext, 600);
});

app.on('window-all-closed', () => {});
app.on('before-quit', stop);
