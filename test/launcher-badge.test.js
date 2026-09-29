const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const { register, UNREAD_CHANNEL, _private } = require('../plugins/launcher-badge');
const { onUnreadPing, getCount, discoverInstalledDesktopFiles, resetState } = _private;

test.afterEach(() => {
  resetState();
});

function makeWindow(title, url = 'file:///zalo/pc-dist/index.html') {
  const win = new EventEmitter();
  win.getTitle = () => title;
  win.isDestroyed = () => false;
  win.isVisible = () => true;
  win.webContents = { getURL: () => url };
  return win;
}

function setup({ focused = null, tray = null, nativeImage = null, iconPath = null } = {}) {
  const app = new EventEmitter();
  app.setDesktopName = () => {};
  const badgeCounts = [];
  app.setBadgeCount = (n) => badgeCounts.push(n);
  const ipcMain = new EventEmitter();
  const state = { focused };
  const BrowserWindow = { getFocusedWindow: () => state.focused };
  const signals = [];
  const createBus = () => ({
    connect() {},
    emitSignal(signal) { signals.push(signal); return true; },
    close() {},
    isReady: () => true
  });
  register({ app, ipcMain, BrowserWindow, nativeImage, tray, iconPath, createBus });
  const ping = (senderId = 1) => ipcMain.emit(UNREAD_CHANNEL, { sender: { id: senderId } }, true);
  return { app, ipcMain, state, ping, badgeCounts, signals };
}

test('the taskbar gets a Unity LauncherEntry update for every change, including the clear', () => {
  const { app, ping, signals } = setup();
  const win = makeWindow('Zalo');
  app.emit('browser-window-created', {}, win);
  ping();
  win.emit('focus');
  assert.ok(signals.length >= 2);
  for (const s of signals) {
    assert.equal(s.path, '/com/canonical/Unity/LauncherEntry');
    assert.equal(s.iface, 'com.canonical.Unity.LauncherEntry');
    assert.equal(s.member, 'Update');
    assert.equal(s.signature, 'sa{sv}');
  }
  const { launcherEntryBody } = require('../plugins/launcher-badge/dbus-emitter');
  const uriOf = (s) => s.body.subarray(4, 4 + s.body.readUInt32LE(0)).toString();
  const first = signals[0];
  const last = signals[signals.length - 1];
  assert.match(uriOf(first), /^application:\/\/.+\.desktop$/);
  assert.deepEqual(first.body, launcherEntryBody(uriOf(first), 1, true));
  assert.deepEqual(last.body, launcherEntryBody(uriOf(last), 0, false));
});

test('each notification ping adds one to the badge while Zalo is in the background', () => {
  const { ping, badgeCounts } = setup();
  ping();
  assert.equal(getCount(), 1);
  // Same window, a moment later: a genuinely new message.
  ping();
  assert.equal(getCount(), 2);
  assert.deepEqual(badgeCounts, [1, 2]);
});

test('focusing a Zalo chat window clears the badge', () => {
  const { app, ping } = setup();
  const win = makeWindow('Zalo');
  app.emit('browser-window-created', {}, win);
  ping();
  ping();
  win.emit('focus');
  assert.equal(getCount(), 0);
  ping();
  assert.equal(getCount(), 1);
});

test('focusing a background helper or the notification popup does not clear the badge', () => {
  const { app, ping } = setup();
  const worker = makeWindow('Shared Worker');
  const popup = makeWindow('Zalo', 'file:///zalo/pc-dist/znotification.html');
  app.emit('browser-window-created', {}, worker);
  app.emit('browser-window-created', {}, popup);
  ping();
  worker.emit('focus');
  popup.emit('focus');
  assert.equal(getCount(), 1);
});

test('no badge is added while the user is already looking at Zalo', () => {
  const { state, ping } = setup();
  state.focused = makeWindow('Zalo');
  ping();
  assert.equal(getCount(), 0);
  state.focused = null;
  ping();
  assert.equal(getCount(), 1);
});

test('the same message built in two windows at once counts once', () => {
  setup();
  onUnreadPing(1, 10000);
  onUnreadPing(2, 10200);
  assert.equal(getCount(), 1);
  onUnreadPing(2, 20000);
  assert.equal(getCount(), 2);
});

test('the tray icon gets the badged image, and the original icon back when cleared', () => {
  const images = [];
  const tray = { setImage: (img) => images.push(img) };
  const rendered = { isEmpty: () => false, tag: 'badged' };
  const nativeImage = {
    createFromPath: () => ({
      isEmpty: () => false,
      resize: () => ({ toBitmap: () => Buffer.alloc(64 * 64 * 4) })
    }),
    createFromBitmap: (buf, opts) => {
      assert.equal(buf.length, 64 * 64 * 4);
      assert.deepEqual(opts, { width: 64, height: 64 });
      return rendered;
    }
  };
  const { app, ping } = setup({ tray, nativeImage, iconPath: '/icons/zalo.png' });
  const win = makeWindow('Zalo');
  app.emit('browser-window-created', {}, win);
  ping();
  assert.equal(images[0], rendered);
  win.emit('focus');
  assert.equal(images[1], '/icons/zalo.png');
});

test('clearing on quit after main.js destroyed the tray does not touch it', () => {
  let touched = false;
  const tray = { isDestroyed: () => true, setImage: () => { touched = true; } };
  const { app, ping } = setup({ tray, nativeImage: null, iconPath: '/icons/zalo.png' });
  ping();
  app.emit('before-quit');
  assert.equal(getCount(), 0);
  assert.equal(touched, false);
});

test('a tray rendering failure never breaks the badge count', () => {
  const tray = { setImage: () => { throw new Error('tray gone'); } };
  const nativeImage = { createFromPath: () => { throw new Error('bad icon'); } };
  const original = console.error;
  console.error = () => {};
  try {
    const { ping } = setup({ tray, nativeImage, iconPath: '/icons/zalo.png' });
    ping();
    assert.equal(getCount(), 1);
  } finally {
    console.error = original;
  }
});

test('discoverInstalledDesktopFiles finds the .desktop entry that launches this binary', () => {
  const saved = { APPIMAGE: process.env.APPIMAGE, XDG_DATA_HOME: process.env.XDG_DATA_HOME, XDG_DATA_DIRS: process.env.XDG_DATA_DIRS };
  process.env.APPIMAGE = '/home/user/Applications/Zalo.AppImage';
  process.env.XDG_DATA_HOME = '/home/user/.local/share';
  process.env.XDG_DATA_DIRS = '/usr/share';
  const files = {
    '/home/user/.local/share/applications': ['appimagekit_deadbeef-Zalo.desktop', 'unrelated.desktop'],
    '/usr/share/applications': []
  };
  const contents = {
    '/home/user/.local/share/applications/appimagekit_deadbeef-Zalo.desktop': 'Exec=/home/user/Applications/Zalo.AppImage %U\n',
    '/home/user/.local/share/applications/unrelated.desktop': 'Exec=/usr/bin/other-app\n'
  };
  try {
    const matches = discoverInstalledDesktopFiles(
      (dir) => files[dir] || [],
      (file) => {
        if (!(file in contents)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        return contents[file];
      }
    );
    assert.deepEqual(matches, ['appimagekit_deadbeef-Zalo.desktop']);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
