const { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const motions = [
  { id: 'a-bottom-pop', anchor: 'center' },
  { id: 'b-side-peek', anchor: 'right' },
  { id: 'c-center-hop', anchor: 'left' },
];
const frequencies = [
  { label: { ja: '3〜6分ごと', en: 'Every 3–6 minutes' }, min: 180, max: 360 },
  { label: { ja: '5〜10分ごと', en: 'Every 5–10 minutes' }, min: 300, max: 600 },
  { label: { ja: '10〜20分ごと', en: 'Every 10–20 minutes' }, min: 600, max: 1200 },
  { label: { ja: '1〜30秒ごと', en: 'Every 1–30 seconds' }, min: 1, max: 30 },
  { label: { ja: '1〜3分ごと', en: 'Every 1–3 minutes' }, min: 60, max: 180 },
];
// Keep saved frequency indices stable while showing the menu from shortest to longest.
const frequencyMenuOrder = [3, 4, 0, 1, 2];
const sizes = [
  { label: { ja: '小さめ', en: 'Small' }, scale: 0.45 },
  { label: { ja: '標準', en: 'Standard' }, scale: 0.60 },
  { label: { ja: '大きめ', en: 'Large' }, scale: 0.80 },
  { label: { ja: '特大', en: 'Extra large' }, scale: 1.0 },
];
const copy = {
  ja: {
    showNow: '今すぐ表示', resume: '再開', pause: '一時停止', colors: '毛色',
    allColors: '全色ランダム', oneColor: '1色だけ表示',
    selectedColors: '選択した毛色からランダム（複数可）',
    interval: '出現間隔', custom: 'カスタム間隔…', size: '表示サイズ', language: '言語', quit: '終了',
  },
  en: {
    showNow: 'Show now', resume: 'Resume', pause: 'Pause', colors: 'Coat color',
    allColors: 'Random from all colors', oneColor: 'One color only',
    selectedColors: 'Random from selected colors (multiple)',
    interval: 'Appearance interval', custom: 'Custom interval…', size: 'Display size', language: 'Language', quit: 'Quit',
  },
};
const colorNames = {
  agouti: { ja: 'アグーチ', en: 'Agouti' },
  sand: { ja: 'サンド', en: 'Sand' },
  white: { ja: 'ホワイト', en: 'White' },
  black: { ja: 'ブラック', en: 'Black' },
  blue: { ja: 'ブルー（グレー）', en: 'Blue (Gray)' },
  chocolate: { ja: 'チョコレート', en: 'Chocolate' },
  lilac: { ja: 'ライラック', en: 'Lilac' },
  violet: { ja: 'バイオレット', en: 'Violet' },
  agouti_pied: { ja: 'アグーチパイド', en: 'Agouti Pied' },
  sand_pied: { ja: 'サンドパイド', en: 'Sand Pied' },
  blue_pied: { ja: 'ブルーパイド', en: 'Blue Pied' },
  cream_pied: { ja: 'クリームパイド', en: 'Cream Pied' },
  black_pied: { ja: 'ブラックパイド', en: 'Black Pied' },
};

let tray;
let overlay;
let intervalWindow;
let nextTimer;
let stopTimer;
let lastMotion = -1;
let lastColor;
let paused = false;
let settings = {
  frequency: 1, customInterval: { min: 60, max: 180 }, size: 1,
  language: 'ja', allColors: true, colors: [],
};
let availableColors = [];
let migratedSettings = false;

function videoDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'videos')
    : path.join(__dirname, '..', 'assets', 'videos');
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function validInterval(value) {
  return value && Number.isInteger(value.min) && Number.isInteger(value.max) &&
    value.min >= 1 && value.max <= 86400 && value.min <= value.max;
}

function loadSettings() {
  try {
    const current = settingsPath();
    const legacy = path.join(app.getPath('appData'), 'degu-gatekeeper', 'settings.json');
    const source = fs.existsSync(current) ? current : legacy;
    const saved = JSON.parse(fs.readFileSync(source, 'utf8'));
    migratedSettings = source === legacy;
    if (Number.isInteger(saved.frequency) && frequencies[saved.frequency]) settings.frequency = saved.frequency;
    if (validInterval(saved.customInterval)) settings.customInterval = saved.customInterval;
    if (saved.frequency === 'custom' && validInterval(saved.customInterval)) settings.frequency = 'custom';
    if (Number.isInteger(saved.size) && sizes[saved.size]) settings.size = saved.size;
    if (saved.language === 'ja' || saved.language === 'en') settings.language = saved.language;
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
  settings.colors = [...new Set(settings.colors.map((id) => id === 'gray' ? 'blue' : id))]
    .filter((id) => availableColors.includes(id));
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

function selectOnlyColor(id) {
  settings.allColors = false;
  settings.colors = [id];
  saveSettings();
  refreshMenu();
}

function menu() {
  const language = settings.language;
  const t = copy[language];
  return Menu.buildFromTemplate([
    { label: t.showNow, click: playNext },
    { label: paused ? t.resume : t.pause, click: () => { paused = !paused; stop(); if (!paused) schedule(); refreshMenu(); } },
    { type: 'separator' },
    { label: t.colors, submenu: [
      { label: t.allColors, type: 'checkbox', checked: settings.allColors,
        click: () => {
          settings.allColors = !settings.allColors;
          if (!settings.allColors && settings.colors.length === 0) settings.colors = [...availableColors];
          saveSettings(); refreshMenu();
        } },
      { label: t.oneColor, submenu: availableColors.map((id) => ({
        label: colorNames[id]?.[language] || id, type: 'checkbox',
        checked: !settings.allColors && settings.colors.length === 1 && settings.colors[0] === id,
        click: () => selectOnlyColor(id),
      })) },
      { type: 'separator' },
      { label: t.selectedColors, submenu: availableColors.map((id) => ({
        label: colorNames[id]?.[language] || id, type: 'checkbox',
        checked: selectedColors().includes(id), click: () => toggleColor(id),
      })) },
    ] },
    { label: t.interval, submenu: [
      ...frequencyMenuOrder.map((index) => ({
        label: frequencies[index].label[language], type: 'radio', checked: settings.frequency === index,
        click: () => { settings.frequency = index; saveSettings(); schedule(); refreshMenu(); },
      })),
      { label: t.custom, type: 'radio', checked: settings.frequency === 'custom',
        click: () => { openIntervalWindow(); refreshMenu(); } },
    ] },
    { label: t.size, submenu: sizes.map((item, index) => ({
      label: item.label[language], type: 'radio', checked: settings.size === index,
      click: () => { settings.size = index; saveSettings(); refreshMenu(); },
    })) },
    { label: t.language, submenu: [
      { label: '日本語', type: 'radio', checked: language === 'ja',
        click: () => { settings.language = 'ja'; saveSettings(); refreshMenu(); } },
      { label: 'English', type: 'radio', checked: language === 'en',
        click: () => { settings.language = 'en'; saveSettings(); refreshMenu(); } },
    ] },
    { type: 'separator' },
    { label: t.quit, role: 'quit' },
  ]);
}

function refreshMenu() { tray.setContextMenu(menu()); }

function openIntervalWindow() {
  if (intervalWindow && !intervalWindow.isDestroyed()) {
    intervalWindow.focus();
    return;
  }
  stop();
  intervalWindow = new BrowserWindow({
    width: 420, height: 420, show: false, resizable: false, autoHideMenuBar: true,
    title: 'Degu Desktop for Real',
    webPreferences: {
      preload: path.join(__dirname, 'interval-preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  intervalWindow.loadFile(path.join(__dirname, 'interval.html'));
  intervalWindow.once('ready-to-show', () => intervalWindow.show());
  intervalWindow.on('closed', () => { intervalWindow = undefined; schedule(); });
}

ipcMain.handle('interval:get', (event) => {
  if (event.sender !== intervalWindow?.webContents) return null;
  const range = settings.frequency === 'custom'
    ? settings.customInterval : frequencies[settings.frequency];
  return { language: settings.language, min: range.min, max: range.max };
});

ipcMain.handle('interval:save', (event, value) => {
  if (event.sender !== intervalWindow?.webContents || !validInterval(value)) return false;
  settings.customInterval = { min: value.min, max: value.max };
  settings.frequency = 'custom';
  saveSettings();
  refreshMenu();
  setImmediate(() => intervalWindow?.close());
  return true;
});

function stop() {
  clearTimeout(nextTimer);
  clearTimeout(stopTimer);
  nextTimer = undefined;
  stopTimer = undefined;
  if (overlay && !overlay.isDestroyed()) overlay.hide();
}

function schedule() {
  clearTimeout(nextTimer);
  if (paused || intervalWindow || availableColors.length === 0) return;
  const range = settings.frequency === 'custom'
    ? settings.customInterval : frequencies[settings.frequency];
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
  if (migratedSettings) saveSettings();
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icons', 'tray.png'));
  tray = new Tray(trayIcon);
  tray.setToolTip('Degu Desktop for Real');
  refreshMenu();
  setTimeout(playNext, 600);
});

app.on('window-all-closed', () => {});
app.on('before-quit', stop);
