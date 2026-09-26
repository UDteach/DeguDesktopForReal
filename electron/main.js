const { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { defaultModes, validModes, pomodoroPhase } = require('./modes');
const { validSizeIndex, sizeIndexFor, validDisplayTarget, displaysForTarget } = require('./appearance');

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
    interval: '出現間隔', custom: 'カスタム間隔…', size: '表示サイズ',
    baseSize: '全体の基本サイズ', colorSize: '毛色ごと', inheritSize: '全体の基本サイズを使う',
    clearSizes: '個別設定を消して全体に統一',
    monitor: 'デグーの表示先', monitorCursor: 'カーソルのあるモニタ', monitorPrimary: 'メインモニタ',
    monitorAll: 'すべてのモニタ', monitorName: 'モニタ', monitorMain: 'メイン',
    monitorMissing: '選択中のモニタは未接続（メインに表示）',
    pomodoro: 'ポモドーロ', showTimer: '残り時間を画面に表示', chaos: 'デグー大発生モード',
    enabled: 'オン', configureModes: 'モードの設定…',
    focus: '集中', break: '休憩', longBreak: '長い休憩', minutesLeft: '残り{n}分',
    language: '言語', quit: '終了',
  },
  en: {
    showNow: 'Show now', resume: 'Resume', pause: 'Pause', colors: 'Coat color',
    allColors: 'Random from all colors', oneColor: 'One color only',
    selectedColors: 'Random from selected colors (multiple)',
    interval: 'Appearance interval', custom: 'Custom interval…', size: 'Display size',
    baseSize: 'Default size for all', colorSize: 'By coat color', inheritSize: 'Use default size',
    clearSizes: 'Clear overrides and use one size',
    monitor: 'Degu display', monitorCursor: 'Monitor with cursor', monitorPrimary: 'Primary monitor',
    monitorAll: 'All monitors', monitorName: 'Monitor', monitorMain: 'Primary',
    monitorMissing: 'Selected monitor disconnected (using primary)',
    pomodoro: 'Pomodoro', showTimer: 'Show remaining time on screen', chaos: 'Degu swarm mode',
    enabled: 'On', configureModes: 'Mode settings…',
    focus: 'Focus', break: 'Break', longBreak: 'Long break', minutesLeft: '{n} min left',
    language: 'Language', quit: 'Quit',
  },
};
const colorNames = {
  agouti: { ja: 'アグーチ', en: 'Agouti' },
  sand: { ja: 'サンド', en: 'Sand' },
  yellow_sand: { ja: 'イエローサンド', en: 'Yellow Sand' },
  cream: { ja: 'クリーム', en: 'Cream' },
  white: { ja: 'ホワイト', en: 'White' },
  black: { ja: 'ブラック', en: 'Black' },
  blue: { ja: 'ブルー（グレー）', en: 'Blue (Gray)' },
  chocolate: { ja: 'チョコレート', en: 'Chocolate' },
  lilac: { ja: 'ライラック', en: 'Lilac' },
  violet: { ja: 'バイオレット', en: 'Violet' },
  agouti_pied: { ja: 'アグーチパイド', en: 'Agouti Pied' },
  sand_pied: { ja: 'サンドパイド', en: 'Sand Pied' },
  blue_pied: { ja: 'ブルーパイド', en: 'Blue Pied' },
  violet_pied: { ja: 'バイオレットパイド', en: 'Violet Pied' },
  cream_pied: { ja: 'クリームパイド', en: 'Cream Pied' },
  black_pied: { ja: 'ブラックパイド', en: 'Black Pied' },
};

let tray;
const overlays = new Map();
const readyOverlays = new Set();
const pendingOverlays = new Set();
let timerWindow;
let intervalWindow;
let modesWindow;
let nextTimer;
let stopTimer;
let runtimeTicker;
let lastMenuStatus = '';
let playbackEpoch = 0;
let lastAllowed = false;
let lastMotion = -1;
let lastColor;
let paused = false;
let settings = {
  frequency: 1, customInterval: { min: 60, max: 180 }, size: 1,
  sizeByColor: {}, displayTarget: 'cursor',
  language: 'ja', allColors: true, colors: [], modes: structuredClone(defaultModes),
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
    if (validSizeIndex(saved.size)) settings.size = saved.size;
    if (saved.sizeByColor && typeof saved.sizeByColor === 'object' && !Array.isArray(saved.sizeByColor)) {
      for (const id of Object.keys(colorNames)) {
        if (validSizeIndex(saved.sizeByColor[id])) settings.sizeByColor[id] = saved.sizeByColor[id];
      }
    }
    if (validDisplayTarget(saved.displayTarget)) settings.displayTarget = saved.displayTarget;
    if (saved.language === 'ja' || saved.language === 'en') settings.language = saved.language;
    if (validModes(saved.modes)) settings.modes = saved.modes;
    if (settings.modes.pomodoro.enabled && !settings.modes.pomodoro.startedAt) {
      settings.modes.pomodoro.startedAt = Date.now();
    }
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

function sizeOptions(language, color) {
  const current = settings.sizeByColor[color];
  const choose = (index) => {
    if (validSizeIndex(index)) settings.sizeByColor[color] = index;
    else delete settings.sizeByColor[color];
    saveSettings();
    refreshMenu();
  };
  return [
    { label: copy[language].inheritSize, type: 'radio', checked: !validSizeIndex(current),
      click: () => choose(undefined) },
    ...sizes.map((item, index) => ({
      label: item.label[language], type: 'radio', checked: current === index, click: () => choose(index),
    })),
  ];
}

function monitorMenu(language) {
  const t = copy[language];
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  const target = settings.displayTarget;
  const options = [
    { label: t.monitorCursor, type: 'radio', checked: target === 'cursor', click: () => setDisplayTarget('cursor') },
    { label: t.monitorPrimary, type: 'radio', checked: target === 'primary', click: () => setDisplayTarget('primary') },
    { label: t.monitorAll, type: 'radio', checked: target === 'all', click: () => setDisplayTarget('all') },
    { type: 'separator' },
    ...displays.map((display, index) => ({
      label: `${index + 1}. ${display.label || `${t.monitorName} ${index + 1}`}${display.id === primaryId ? ` (${t.monitorMain})` : ''}`,
      type: 'radio', checked: target === `display:${display.id}`,
      click: () => setDisplayTarget(`display:${display.id}`),
    })),
  ];
  if (target.startsWith('display:') && !displays.some((display) => target === `display:${display.id}`)) {
    options.push({ label: t.monitorMissing, type: 'radio', checked: true, enabled: false });
  }
  return options;
}

function setDisplayTarget(target) {
  settings.displayTarget = target;
  saveSettings();
  stop();
  schedule();
  refreshMenu();
}

function pomodoroStatus(language) {
  const phase = pomodoroPhase(settings.modes.pomodoro);
  if (!phase) return null;
  const t = copy[language];
  const name = t[phase.kind];
  const remaining = t.minutesLeft.replace('{n}', String(Math.ceil(phase.remainingMs / 60000)));
  return `${name} ${phase.round}/4 · ${remaining}`;
}

function togglePomodoro() {
  const pomodoro = settings.modes.pomodoro;
  pomodoro.enabled = !pomodoro.enabled;
  pomodoro.startedAt = pomodoro.enabled ? Date.now() : null;
  saveSettings();
  reconcileRuntime();
}

function toggleShowTimer() {
  settings.modes.showTimer = !settings.modes.showTimer;
  saveSettings();
  syncTimerWindow();
  refreshMenu();
}

function toggleChaos() {
  settings.modes.chaos = !settings.modes.chaos;
  saveSettings();
  stop();
  if (canAutoPlay()) playNext();
  refreshMenu();
}

function menu() {
  const language = settings.language;
  const t = copy[language];
  return Menu.buildFromTemplate([
    { label: t.showNow, click: () => playNext(true) },
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
    { label: t.size, submenu: [
      { label: t.baseSize, submenu: sizes.map((item, index) => ({
        label: item.label[language], type: 'radio', checked: settings.size === index,
        click: () => { settings.size = index; saveSettings(); refreshMenu(); },
      })) },
      { label: t.colorSize, submenu: availableColors.map((id) => ({
        label: colorNames[id]?.[language] || id, submenu: sizeOptions(language, id),
      })) },
      { type: 'separator' },
      { label: t.clearSizes, enabled: Object.keys(settings.sizeByColor).length > 0,
        click: () => { settings.sizeByColor = {}; saveSettings(); refreshMenu(); } },
    ] },
    { label: t.monitor, submenu: monitorMenu(language) },
    { type: 'separator' },
    { label: t.pomodoro, submenu: [
      { label: t.enabled, type: 'checkbox', checked: settings.modes.pomodoro.enabled, click: togglePomodoro },
      { label: t.showTimer, type: 'checkbox', checked: settings.modes.showTimer, click: toggleShowTimer },
      ...(settings.modes.pomodoro.enabled ? [{ label: pomodoroStatus(language), enabled: false }] : []),
    ] },
    { label: t.chaos, type: 'checkbox', checked: settings.modes.chaos, click: toggleChaos },
    { label: t.configureModes, click: openModesWindow },
    { type: 'separator' },
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
  intervalWindow.on('closed', () => { intervalWindow = undefined; reconcileRuntime(); });
  reconcileRuntime();
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

function openModesWindow() {
  if (modesWindow && !modesWindow.isDestroyed()) {
    modesWindow.focus();
    return;
  }
  stop();
  modesWindow = new BrowserWindow({
    width: 500, height: 600, show: false, resizable: false, autoHideMenuBar: true,
    title: 'Degu Desktop for Real',
    webPreferences: {
      preload: path.join(__dirname, 'modes-preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  modesWindow.loadFile(path.join(__dirname, 'modes.html'));
  modesWindow.once('ready-to-show', () => modesWindow.show());
  modesWindow.on('closed', () => { modesWindow = undefined; reconcileRuntime(); });
  reconcileRuntime();
}

ipcMain.handle('modes:get', (event) => {
  if (event.sender !== modesWindow?.webContents) return null;
  return { language: settings.language, modes: settings.modes };
});

ipcMain.handle('modes:save', (event, value) => {
  if (event.sender !== modesWindow?.webContents || !value || typeof value !== 'object') return false;
  const candidate = {
    pomodoro: { ...value.pomodoro, startedAt: null },
    showTimer: value.showTimer,
    chaos: value.chaos,
  };
  if (!validModes(candidate)) return false;
  const old = settings.modes.pomodoro;
  const next = candidate.pomodoro;
  const sameTimer = old.enabled && next.enabled &&
    old.focus === next.focus && old.shortBreak === next.shortBreak && old.longBreak === next.longBreak;
  next.startedAt = next.enabled ? (sameTimer ? old.startedAt : Date.now()) : null;
  settings.modes = candidate;
  saveSettings();
  refreshMenu();
  const window = modesWindow;
  setImmediate(() => { if (window && !window.isDestroyed()) window.close(); });
  return true;
});

function stop() {
  playbackEpoch += 1;
  clearTimeout(nextTimer);
  clearTimeout(stopTimer);
  nextTimer = undefined;
  stopTimer = undefined;
  pendingOverlays.clear();
  for (const window of overlays.values()) {
    if (!window.isDestroyed()) {
      window.webContents.send('stop');
      window.hide();
    }
  }
}

function canAutoPlay() {
  const phase = pomodoroPhase(settings.modes.pomodoro);
  return !paused && !intervalWindow && !modesWindow && availableColors.length > 0 &&
    (!phase || phase.kind !== 'focus');
}

function reconcileRuntime() {
  const allowed = canAutoPlay();
  const changed = allowed !== lastAllowed;
  if (changed) {
    lastAllowed = allowed;
    stop();
    if (allowed) playNext();
  }
  const status = pomodoroStatus(settings.language) || '';
  if (changed || status !== lastMenuStatus) refreshMenu();
  lastMenuStatus = status;
  syncTimerWindow();
}

function syncTimerWindow() {
  const phase = pomodoroPhase(settings.modes.pomodoro);
  if (!settings.modes.showTimer || !phase) {
    if (timerWindow && !timerWindow.isDestroyed()) timerWindow.hide();
    return;
  }
  if (!timerWindow || timerWindow.isDestroyed()) {
    timerWindow = new BrowserWindow({
      width: 190, height: 64, show: false, frame: false, transparent: true,
      backgroundColor: '#00000000', skipTaskbar: true, focusable: false,
      hasShadow: false, resizable: false,
      webPreferences: {
        preload: path.join(__dirname, 'timer-preload.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    });
    timerWindow.setIgnoreMouseEvents(true, { forward: true });
    timerWindow.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') {
      timerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      timerWindow.setFullScreenable(false);
    }
    timerWindow.loadFile(path.join(__dirname, 'timer.html'));
    timerWindow.webContents.once('did-finish-load', syncTimerWindow);
    timerWindow.on('closed', () => { timerWindow = undefined; });
    return;
  }
  if (timerWindow.webContents.isLoading()) return;
  const display = screen.getPrimaryDisplay();
  const area = display.workArea || display.bounds;
  timerWindow.setBounds({ x: area.x + area.width - 206, y: area.y + 14, width: 190, height: 64 });
  const totalSeconds = Math.ceil(phase.remainingMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  timerWindow.webContents.send('timer:update', {
    label: `${copy[settings.language][phase.kind]} ${phase.round}/4`,
    time: `${minutes}:${seconds}`, kind: phase.kind,
  });
  timerWindow.showInactive();
}

function schedule() {
  clearTimeout(nextTimer);
  if (!canAutoPlay()) return;
  const range = settings.frequency === 'custom'
    ? settings.customInterval : frequencies[settings.frequency];
  const seconds = settings.modes.chaos ? 1 + Math.random() * 3 :
    range.min + Math.random() * (range.max - range.min);
  nextTimer = setTimeout(playNext, seconds * 1000);
}

function ensureOverlay(display) {
  const existing = overlays.get(display.id);
  if (existing && !existing.isDestroyed()) return existing;
  const window = new BrowserWindow({
    show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    skipTaskbar: true, focusable: false, hasShadow: false, resizable: false,
    // Keep macOS from moving the full-screen overlay below the menu bar.
    enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false,
    },
  });
  overlays.set(display.id, window);
  window.setIgnoreMouseEvents(true, { forward: true });
  window.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setFullScreenable(false);
  }
  const contentsId = window.webContents.id;
  window.webContents.once('did-finish-load', () => readyOverlays.add(contentsId));
  window.loadFile(path.join(__dirname, 'overlay.html'));
  window.on('closed', () => {
    if (overlays.get(display.id) === window) overlays.delete(display.id);
    readyOverlays.delete(contentsId);
    if (pendingOverlays.delete(contentsId) && pendingOverlays.size === 0) {
      stop();
      schedule();
    }
  });
  return window;
}

function selectedDisplays() {
  const primaryId = screen.getPrimaryDisplay().id;
  let cursorId = primaryId;
  if (settings.displayTarget === 'cursor') {
    try { cursorId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id; }
    catch { /* Fall back to the primary display if the cursor cannot be read. */ }
  }
  return displaysForTarget(settings.displayTarget, screen.getAllDisplays(), primaryId, cursorId);
}

function playNext(manual = false) {
  if (availableColors.length === 0 || (!manual && !canAutoPlay())) return;
  if (manual) {
    paused = false;
    lastAllowed = canAutoPlay();
    refreshMenu();
  }
  stop();
  const epoch = playbackEpoch;
  const colors = selectedColors();
  const usedColors = new Set();
  const placements = settings.modes.chaos
    ? [
      { motion: motions[0], anchor: 'left', bottom: 0 },
      { motion: motions[0], anchor: 'right', bottom: 0 },
      { motion: motions[1], anchor: 'left', bottom: 0.47, flip: true },
      { motion: motions[1], anchor: 'right', bottom: 0.47 },
      { motion: motions[2], anchor: 'center', bottom: 0.22 },
    ]
    : [{ bottom: 0 }];
  const clips = placements.map((position) => {
    const motionChoices = motions.map((_, index) => index).filter((index) => index !== lastMotion);
    const motion = position.motion || motions[motionChoices[Math.floor(Math.random() * motionChoices.length)]];
    lastMotion = motions.indexOf(motion);
    let choices = colors.filter((id) => id !== lastColor && !usedColors.has(id));
    if (choices.length === 0) choices = colors.filter((id) => id !== lastColor);
    if (choices.length === 0) choices = colors;
    const color = choices[Math.floor(Math.random() * choices.length)];
    usedColors.add(color);
    lastColor = color;
    const baseScale = sizes[sizeIndexFor(settings, color)].scale;
    const scale = settings.modes.chaos ? Math.min(0.48, Math.max(0.34, baseScale * 0.72)) : baseScale;
    const file = path.join(videoDir(), `${color}-${motion.id}.webm`);
    const anchor = position.anchor || motion.anchor;
    const left = anchor === 'center' ? (1 - scale) / 2 : anchor === 'right' ? 1 - scale : 0;
    return { url: require('node:url').pathToFileURL(file).href,
      left, bottom: position.bottom, scale, flip: Boolean(position.flip) };
  });
  const displays = selectedDisplays();
  if (!displays.length) { schedule(); return; }
  const windows = displays.map((display) => {
    const window = ensureOverlay(display);
    window.setBounds(display.bounds);
    pendingOverlays.add(window.webContents.id);
    return window;
  });
  let started = false;
  const finish = () => { if (epoch === playbackEpoch) { stop(); schedule(); } };
  const send = () => {
    if (started || epoch !== playbackEpoch || windows.some((window) => window.isDestroyed())) return;
    if (!windows.every((window) => readyOverlays.has(window.webContents.id))) return;
    started = true;
    for (const window of windows) {
      window.webContents.send('play', { clips, playbackId: epoch });
      window.showInactive();
    }
    // Never leave an invisible full-screen overlay alive after decoder failure.
    clearTimeout(stopTimer);
    stopTimer = setTimeout(finish, 8500);
  };
  stopTimer = setTimeout(finish, 8500);
  for (const window of windows) {
    if (!readyOverlays.has(window.webContents.id)) window.webContents.once('did-finish-load', send);
  }
  send();
}

ipcMain.on('clip-ended', (event, playbackId) => {
  if (playbackId !== playbackEpoch || !pendingOverlays.delete(event.sender.id)) return;
  if (pendingOverlays.size === 0) { stop(); schedule(); }
});

function handleDisplayChange() {
  stop();
  const displays = screen.getAllDisplays();
  for (const [id, window] of overlays) {
    if (window.isDestroyed()) continue;
    const display = displays.find((item) => item.id === id);
    if (display) window.setBounds(display.bounds);
    else window.destroy();
  }
  syncTimerWindow();
  refreshMenu();
  schedule();
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  loadSettings();
  discoverColors();
  if (migratedSettings) saveSettings();
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icons', 'tray.png'));
  tray = new Tray(trayIcon);
  tray.setToolTip('Degu Desktop for Real');
  refreshMenu();
  screen.on('display-added', handleDisplayChange);
  screen.on('display-removed', handleDisplayChange);
  screen.on('display-metrics-changed', handleDisplayChange);
  lastAllowed = canAutoPlay();
  syncTimerWindow();
  runtimeTicker = setInterval(reconcileRuntime, 1000);
  if (lastAllowed) setTimeout(playNext, 600);
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  clearInterval(runtimeTicker);
  stop();
  if (timerWindow && !timerWindow.isDestroyed()) timerWindow.close();
});
