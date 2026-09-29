'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DBUS_OBJECT_PATH = '/com/canonical/Unity/LauncherEntry';
const DBUS_SIGNAL = 'com.canonical.Unity.LauncherEntry.Update';
const BADGE_COLOR = '#e5342b';
// Zalo shows an incoming-message popup by loading this dedicated window
// rather than the standard Web Notification API (confirmed by the existing
// notification-privacy plugin/patch, which syncs to it by this URL too). Its
// mere appearance is itself the "something just arrived" signal: unlike
// patching Zalo's own bundled JS (tried before and reverted — it broke the
// popup itself, most likely by calling `require(...)` inside a webpack
// module whose local `require` binding is the bundler's own internal module
// loader, not Node's), watching an Electron window-lifecycle event from here
// cannot disturb whatever that bundle does to actually render the popup.
const NOTIFICATION_WINDOW_URL_PATTERN = /znotification\.html/i;
// A window whose title matches one of these never represents the chat the
// user is actually looking at, so focusing it should not clear the badge.
const BACKGROUND_WINDOW_TITLES = ['Shared Worker', 'SQLite'];

let _app = null;
let _tray = null;
let _iconDataUrl = null;
let _compositorWin = null;
let _state = { mode: 'none', count: 0 }; // mode: 'none' | 'dot' | 'count'
let _pingCount = 0;
let _gdbusAvailable = null;
let _desktopFiles = null;
let _trayBadgeSeq = 0;

// Called as early as possible (before Zalo's own bundled main.js runs), so that
// if that macOS-oriented code feature-detects `app.dock` before calling it
// (rather than branching on `process.platform`), it finds our shim and its
// badge count reaches us instead of silently going nowhere on Linux.
function init({ app }) {
  _app = app;
  if (process.platform !== 'linux') return;
  installDockShim();
}

function installDockShim() {
  if (!_app || _app.dock) return;

  _app.dock = {
    setBadge(text) { setBadgeFromDockText(text); },
    getBadge() {
      if (_state.mode === 'dot') return '•';
      if (_state.mode === 'count') return String(_state.count);
      return '';
    },
    bounce() { return -1; },
    cancelBounce() {},
    downloadFinished() {},
    setIcon() {},
    show() { return Promise.resolve(); },
    hide() {},
    isVisible() { return true; },
    setMenu() {},
    getMenu() { return null; }
  };
}

// macOS dock badges are free-form strings: a number, or any other text used
// purely as a "you have something new" marker. Only the former maps to an
// exact count; anything else degrades to a dot indicator instead of being
// dropped.
function setBadgeFromDockText(rawText) {
  if (rawText === undefined || rawText === null || rawText === '') {
    clearBadge();
    return;
  }
  const trimmed = String(rawText).trim();
  const asNumber = Number.parseInt(trimmed, 10);
  if (Number.isFinite(asNumber) && String(asNumber) === trimmed) {
    setCount(asNumber);
  } else {
    setDot();
  }
}

function register({ app, ipcMain, tray, iconPath }) {
  _app = app;
  _tray = tray || null;

  if (process.platform !== 'linux') return;

  installDockShim();
  captureTrayIcon(iconPath);

  try {
    if (app.setDesktopName) {
      app.setDesktopName('zalo');
    }
  } catch (_) {}

  ipcMain.on('zalo-notification-badge-count', (_event, rawCount) => {
    setCount(rawCount);
  });

  // Kept as a general-purpose channel for any future sender that knows
  // "something is unread" but not the exact count. We don't get an exact
  // count from it, so each ping accumulates into a running counter that
  // resets when the user focuses the window again.
  ipcMain.on('zalo-notification-has-unread', (_event, hasUnread) => {
    if (hasUnread) {
      _pingCount += 1;
      setCount(_pingCount);
    } else {
      clearBadge();
    }
  });

  app.on('browser-window-created', (_event, win) => {
    win.on('page-title-updated', (_event, title) => {
      const count = parseTitleCount(title);
      if (count !== null) setCount(count);
    });

    win.on('focus', () => {
      if (BACKGROUND_WINDOW_TITLES.includes(win.getTitle())) return;
      clearBadge();
    });

    const pingIfNotificationWindow = () => {
      try {
        if (NOTIFICATION_WINDOW_URL_PATTERN.test(win.webContents.getURL())) {
          _pingCount += 1;
          setCount(_pingCount);
        }
      } catch (_) {}
    };
    // 'show' fires every time Zalo reuses/re-shows this window for a new
    // popup; 'did-finish-load' also catches the very first one, in case it's
    // already visible by the time it finishes loading.
    win.webContents.on('did-finish-load', pingIfNotificationWindow);
    win.on('show', pingIfNotificationWindow);
  });

  app.on('before-quit', () => {
    clearBadge();
  });
}

function setCount(rawCount) {
  const count = normalizeCount(rawCount);
  applyState(count > 0 ? { mode: 'count', count } : { mode: 'none', count: 0 });
}

function setDot() {
  // An exact count is strictly more useful than a plain dot, so don't let a
  // vaguer "something is unread" signal stomp on a number we already have.
  if (_state.mode === 'count') return;
  applyState({ mode: 'dot', count: 0 });
}

function clearBadge() {
  _pingCount = 0;
  applyState({ mode: 'none', count: 0 });
}

function applyState(next) {
  if (_state.mode === next.mode && _state.count === next.count) return;
  _state = next;
  publish();
}

function publish() {
  const { mode, count } = _state;

  try {
    if (_app && _app.setBadgeCount) {
      // Electron's own Linux support only does anything under Unity, but it's
      // free to call and some environments (Electron built with libunity) do
      // honor it directly.
      _app.setBadgeCount(mode === 'count' ? count : mode === 'dot' ? 1 : 0);
    }
  } catch (_) {}

  publishUnityBadge(mode, count);
  updateTrayIcon(mode, count);
}

function publishUnityBadge(mode, count) {
  if (process.platform !== 'linux') return;
  if (_gdbusAvailable === false) return;

  const visible = mode !== 'none';
  const emittedCount = mode === 'count' ? count : mode === 'dot' ? 1 : 0;
  const payload = `{ 'count': <int64 ${emittedCount}>, 'count-visible': <${visible ? 'true' : 'false'}> }`;

  getDesktopFiles(_app).forEach((desktopFile) => {
    execFile('gdbus', [
      'emit',
      '--session',
      '--object-path',
      DBUS_OBJECT_PATH,
      '--signal',
      DBUS_SIGNAL,
      `application://${desktopFile}`,
      payload
    ], { timeout: 1000 }, (error) => {
      if (!error) {
        _gdbusAvailable = true;
        return;
      }

      if (error.code === 'ENOENT') {
        _gdbusAvailable = false;
      }
    });
  });
}

// The taskbar badge above depends on the desktop environment recognizing the
// running window as the owner of a specific .desktop file. Draws the badge
// directly onto the tray icon instead, which we fully control and which
// works the same on every desktop environment.
function captureTrayIcon(iconPath) {
  try {
    if (iconPath && fs.existsSync(iconPath)) {
      const buf = fs.readFileSync(iconPath);
      _iconDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    }
  } catch (_) {}
}

function getCompositorWindow() {
  if (_compositorWin && !_compositorWin.isDestroyed()) return _compositorWin;

  const { BrowserWindow } = require('electron');
  _compositorWin = new BrowserWindow({
    show: false,
    width: 64,
    height: 64,
    webPreferences: { sandbox: true }
  });
  _compositorWin.loadURL('about:blank').catch(() => {});
  return _compositorWin;
}

function updateTrayIcon(mode, count) {
  if (!_tray || !_iconDataUrl) return;

  const seq = ++_trayBadgeSeq;
  const showBadge = mode !== 'none';
  const label = mode === 'count' ? (count > 99 ? '99+' : String(count)) : null;

  let win;
  try {
    win = getCompositorWindow();
  } catch (_) {
    return;
  }

  win.webContents.executeJavaScript(buildTrayBadgeScript(_iconDataUrl, showBadge, label), true)
    .then((dataUrl) => {
      if (seq !== _trayBadgeSeq || !_tray || !dataUrl) return;
      const { nativeImage } = require('electron');
      const image = nativeImage.createFromDataURL(dataUrl);
      if (!image.isEmpty()) _tray.setImage(image);
    })
    .catch(() => {});
}

function buildTrayBadgeScript(baseDataUrl, showBadge, label) {
  return `(() => new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        const size = Math.max(img.naturalWidth || 0, img.naturalHeight || 0, 64);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        if (${JSON.stringify(Boolean(showBadge))}) {
          const r = size * 0.32;
          const cx = size - r * 0.9;
          const cy = r * 0.9;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = ${JSON.stringify(BADGE_COLOR)};
          ctx.fill();
          ctx.lineWidth = Math.max(1, size * 0.035);
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          const label = ${JSON.stringify(label)};
          if (label) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold ' + Math.round(r * 1.05) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, cx, cy + size * 0.01);
          }
        }
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = ${JSON.stringify(baseDataUrl)};
    } catch (e) {
      resolve(null);
    }
  }))()`;
}

function normalizeCount(rawCount) {
  const count = Number.parseInt(rawCount, 10);
  if (!Number.isFinite(count) || count < 1) return 0;
  return Math.min(count, 9999);
}

function getDesktopFiles(app) {
  if (_desktopFiles) return _desktopFiles;

  const names = [
    ...discoverInstalledDesktopFiles(),
    process.env.ZALO_DESKTOP_FILE,
    process.env.GTK_DESKTOP_FILE,
    process.env.XDG_CURRENT_DESKTOP_FILE,
    getAppImageDesktopFile(),
    app && app.isPackaged ? 'zalo.desktop' : 'electron.desktop',
    'com.zalo.linux.desktop',
    'zalo-for-linux.desktop',
    'Zalo.desktop',
    'zalo.desktop'
  ];

  _desktopFiles = unique(names.map(normalizeDesktopFile).filter(Boolean));
  return _desktopFiles;
}

// AppImages are frequently integrated by tools (AppImageLauncher, appimaged)
// under an unpredictable filename (e.g. appimagekit_<hash>-Zalo.desktop).
// The desktop environment matches the Unity Launcher DBus signal above to a
// taskbar entry by that exact filename, so guessing common names alone
// misses this very common case. Scan the standard XDG locations for any
// .desktop file whose Exec= line points at the binary we're actually
// running from.
function discoverInstalledDesktopFiles(readDirFn = fs.readdirSync, readFileFn = fs.readFileSync) {
  const target = process.env.APPIMAGE || process.execPath;
  if (!target) return [];

  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const dataDirs = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean);
  const searchDirs = unique([
    path.join(dataHome, 'applications'),
    ...dataDirs.map((dir) => path.join(dir, 'applications'))
  ]);

  const matches = [];
  for (const dir of searchDirs) {
    let entries;
    try {
      entries = readDirFn(dir);
    } catch (_) {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.desktop')) continue;
      try {
        const content = readFileFn(path.join(dir, entry), 'utf8');
        const execLine = content.split('\n').find((line) => line.startsWith('Exec='));
        if (execLine && execLine.includes(target)) {
          matches.push(entry);
        }
      } catch (_) {}
    }
  }
  return matches;
}

function getAppImageDesktopFile() {
  if (!process.env.APPIMAGE) return null;

  const appImageName = process.env.APPIMAGE.split('/').pop();
  if (!appImageName) return null;

  return appImageName
    .replace(/\.AppImage$/i, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') + '.desktop';
}

function normalizeDesktopFile(name) {
  if (!name || typeof name !== 'string') return null;

  const trimmed = name.trim();
  if (!trimmed) return null;

  const withoutPrefix = trimmed.replace(/^application:\/\//, '').split('/').pop();
  return withoutPrefix.endsWith('.desktop') ? withoutPrefix : `${withoutPrefix}.desktop`;
}

function unique(values) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function parseTitleCount(title) {
  if (typeof title !== 'string') return null;

  const patterns = [
    /^\s*\((\d+)\)/,
    /\((\d+)\)\s*$/,
    /\b(\d+)\s+(?:tin nhắn|tin nhan|message|messages|chưa đọc|chua doc)\b/i
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return normalizeCount(match[1]);
  }
  return null;
}

module.exports = {
  init,
  register,
  _private: {
    getDesktopFiles,
    discoverInstalledDesktopFiles,
    normalizeDesktopFile,
    normalizeCount,
    parseTitleCount,
    setBadgeFromDockText,
    setCount,
    setDot,
    clearBadge,
    getState: () => _state,
    getPingCount: () => _pingCount,
    resetState: () => {
      _state = { mode: 'none', count: 0 };
      _pingCount = 0;
      _desktopFiles = null;
      _gdbusAvailable = null;
      _app = null;
      _tray = null;
    }
  }
};
