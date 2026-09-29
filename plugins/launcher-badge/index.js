'use strict';

// Unread badge on the taskbar entry and the tray icon.
//
// Signal: scripts/patches/patch-notification-badge.js makes Zalo's own
// notification builder (Notifier.createNotifyForMessages) dispatch a DOM
// event that a relay appended to Zalo's preload scripts forwards here as the
// UNREAD_CHANNEL IPC message. Each one is "one more message arrived"; there is
// no exact unread total, so pings accumulate until the user focuses Zalo.
//
// Output:
//  - taskbar: com.canonical.Unity.LauncherEntry.Update over a D-Bus
//    connection kept open for Zalo's lifetime (see dbus-emitter.js for why a
//    one-shot `gdbus emit` never shows on KDE). Falls back to `gdbus emit`
//    only when the session bus can't be reached directly.
//  - tray: the count drawn onto the tray icon (badge-image.js).

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSignalEmitter, launcherEntryBody } = require('./dbus-emitter');
const { renderBadgedIcon } = require('./badge-image');

const UNREAD_CHANNEL = 'zalo-notification-has-unread';
const DBUS_OBJECT_PATH = '/com/canonical/Unity/LauncherEntry';
const DBUS_INTERFACE = 'com.canonical.Unity.LauncherEntry';
// The same message can be built in more than one Zalo window; pings from a
// different window this close together are treated as the same message.
const CROSS_WINDOW_DEDUP_MS = 1500;
// Re-announce a non-zero badge now and then, so it comes back if plasmashell
// (or another dock) restarts and forgets it.
const REFRESH_MS = 60000;
// Hidden windows Zalo uses as background processes, and its notification
// popup: none of them means the user is looking at their chats.
const BACKGROUND_WINDOW_TITLES = ['Shared Worker', 'SQLite'];
const NOTIFICATION_WINDOW_URL = /znotification\.html/i;

let _app = null;
let _BrowserWindow = null;
let _nativeImage = null;
let _tray = null;
let _iconPath = null;
let _bus = null;
let _count = 0;
let _lastPing = { senderId: null, at: 0 };
let _desktopFiles = null;
let _gdbusAvailable = null;
let _refreshTimer = null;

function register({ app, ipcMain, BrowserWindow, nativeImage, tray, iconPath, createBus = createSignalEmitter }) {
  if (process.platform !== 'linux') return;

  _app = app;
  _BrowserWindow = BrowserWindow || null;
  _nativeImage = nativeImage || null;
  _tray = tray || null;
  _iconPath = iconPath || null;

  try {
    if (app.setDesktopName) app.setDesktopName('zalo');
  } catch (_) {}

  _bus = createBus({
    onReady: () => publishLauncherEntry(),
    onFailure: () => publishLauncherEntryWithGdbus()
  });
  _bus.connect();

  ipcMain.on(UNREAD_CHANNEL, (event) => {
    onUnreadPing(event && event.sender ? event.sender.id : null);
  });

  app.on('browser-window-created', (_event, win) => {
    win.on('focus', () => {
      if (isUserFacing(win)) clearBadge();
    });
  });

  app.on('before-quit', () => {
    clearBadge();
  });

  _refreshTimer = setInterval(() => {
    if (_count > 0) publishLauncherEntry();
  }, REFRESH_MS);
  if (_refreshTimer.unref) _refreshTimer.unref();
}

function onUnreadPing(senderId, now = Date.now()) {
  const duplicate = senderId !== _lastPing.senderId && now - _lastPing.at < CROSS_WINDOW_DEDUP_MS;
  if (duplicate) return;
  _lastPing = { senderId, at: now };

  // Zalo is in front of the user: nothing is waiting to be noticed.
  if (isZaloFocused()) return;

  setCount(_count + 1);
}

function isUserFacing(win) {
  try {
    if (win.isDestroyed && win.isDestroyed()) return false;
    if (BACKGROUND_WINDOW_TITLES.includes(win.getTitle())) return false;
    const url = win.webContents && win.webContents.getURL ? win.webContents.getURL() : '';
    return !NOTIFICATION_WINDOW_URL.test(url);
  } catch (_) {
    return false;
  }
}

function isZaloFocused() {
  try {
    const focused = _BrowserWindow && _BrowserWindow.getFocusedWindow();
    return Boolean(focused && isUserFacing(focused) && (!focused.isVisible || focused.isVisible()));
  } catch (_) {
    return false;
  }
}

function clearBadge() {
  setCount(0);
}

function setCount(count) {
  const next = Math.max(0, Math.min(Number.isFinite(count) ? Math.floor(count) : 0, 9999));
  if (next === _count) return;
  _count = next;

  try {
    // Only does anything under Unity, but costs nothing elsewhere.
    if (_app && _app.setBadgeCount) _app.setBadgeCount(_count);
  } catch (_) {}

  publishLauncherEntry();
  updateTrayIcon();
}

function publishLauncherEntry() {
  if (!_bus) return;
  const body = (uri) => launcherEntryBody(uri, _count, _count > 0);
  getDesktopFiles(_app).forEach((desktopFile) => {
    _bus.emitSignal({
      path: DBUS_OBJECT_PATH,
      iface: DBUS_INTERFACE,
      member: 'Update',
      signature: 'sa{sv}',
      body: body(`application://${desktopFile}`)
    });
  });
}

function publishLauncherEntryWithGdbus() {
  if (_gdbusAvailable === false) return;
  const payload = `{ 'count': <int64 ${_count}>, 'count-visible': <${_count > 0 ? 'true' : 'false'}> }`;
  getDesktopFiles(_app).forEach((desktopFile) => {
    execFile('gdbus', [
      'emit', '--session',
      '--object-path', DBUS_OBJECT_PATH,
      '--signal', `${DBUS_INTERFACE}.Update`,
      `application://${desktopFile}`,
      payload
    ], { timeout: 1000 }, (error) => {
      if (error && error.code === 'ENOENT') _gdbusAvailable = false;
    });
  });
}

function updateTrayIcon() {
  if (!_tray || !_iconPath) return;
  // main.js destroys the tray on quit before our own before-quit handler runs.
  if (_tray.isDestroyed && _tray.isDestroyed()) return;
  try {
    if (_count === 0) {
      _tray.setImage(_iconPath);
      return;
    }
    const image = _nativeImage && renderBadgedIcon(_nativeImage, _iconPath, _count);
    if (image && !image.isEmpty()) _tray.setImage(image);
  } catch (error) {
    console.error('Cannot update tray badge:', error);
  }
}

// The taskbar only shows the badge when the D-Bus signal names the exact
// .desktop file the running window belongs to. Prefer the installed entries
// that actually launch this binary (e.g. /usr/share/applications/zalo.desktop
// for the .deb, appimagekit_<hash>-Zalo.desktop for an integrated AppImage);
// guess common names only when none is found.
function getDesktopFiles(app) {
  if (_desktopFiles) return _desktopFiles;

  const overrides = [process.env.ZALO_DESKTOP_FILE];
  const discovered = discoverInstalledDesktopFiles();
  const guesses = discovered.length ? [] : [
    getAppImageDesktopFile(),
    app && app.isPackaged ? 'zalo.desktop' : 'electron.desktop',
    'zalo.desktop'
  ];

  _desktopFiles = unique([...overrides, ...discovered, ...guesses].map(normalizeDesktopFile).filter(Boolean));
  return _desktopFiles;
}

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
        if (execLine && execLine.includes(target)) matches.push(entry);
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

module.exports = {
  register,
  UNREAD_CHANNEL,
  _private: {
    onUnreadPing,
    clearBadge,
    setCount,
    getCount: () => _count,
    getDesktopFiles,
    discoverInstalledDesktopFiles,
    normalizeDesktopFile,
    resetState: () => {
      if (_bus) _bus.close();
      if (_refreshTimer) clearInterval(_refreshTimer);
      _app = null;
      _BrowserWindow = null;
      _nativeImage = null;
      _tray = null;
      _iconPath = null;
      _bus = null;
      _count = 0;
      _lastPing = { senderId: null, at: 0 };
      _desktopFiles = null;
      _gdbusAvailable = null;
      _refreshTimer = null;
    }
  }
};
