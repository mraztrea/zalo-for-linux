const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const { register, _private } = require('../plugins/launcher-badge');
const {
  normalizeCount,
  parseTitleCount,
  discoverInstalledDesktopFiles,
  setBadgeFromDockText,
  setCount,
  setDot,
  clearBadge,
  getState,
  resetState
} = _private;

test.beforeEach(() => {
  resetState();
});

test('normalizeCount clamps to a sane badge range', () => {
  assert.equal(normalizeCount('5'), 5);
  assert.equal(normalizeCount(0), 0);
  assert.equal(normalizeCount(-3), 0);
  assert.equal(normalizeCount('not a number'), 0);
  assert.equal(normalizeCount(undefined), 0);
  assert.equal(normalizeCount(50000), 9999);
});

test('parseTitleCount recognizes the title formats Zalo is known to use', () => {
  assert.equal(parseTitleCount('(3) Zalo'), 3);
  assert.equal(parseTitleCount('Zalo (12)'), 12);
  assert.equal(parseTitleCount('5 tin nhắn'), 5);
  assert.equal(parseTitleCount('2 messages'), 2);
  assert.equal(parseTitleCount('1 message'), 1);
  assert.equal(parseTitleCount('Zalo'), null);
  assert.equal(parseTitleCount(42), null);
});

test('a dock badge that is a plain integer sets an exact count', () => {
  setBadgeFromDockText('7');
  assert.deepEqual(getState(), { mode: 'count', count: 7 });
});

test('a non-numeric dock badge (a bare "new activity" marker) degrades to a dot', () => {
  setBadgeFromDockText('•');
  assert.deepEqual(getState(), { mode: 'dot', count: 0 });
});

test('clearing the dock badge clears the state', () => {
  setCount(4);
  setBadgeFromDockText('');
  assert.deepEqual(getState(), { mode: 'none', count: 0 });
});

test('a dot signal never overrides an already-known exact count', () => {
  setCount(3);
  setDot();
  assert.deepEqual(getState(), { mode: 'count', count: 3 });
});

test('a dot signal is honored when no count is known yet', () => {
  setDot();
  assert.deepEqual(getState(), { mode: 'dot', count: 0 });
});

test('setCount(0) after a dot clears it back to none', () => {
  setDot();
  setCount(0);
  assert.deepEqual(getState(), { mode: 'none', count: 0 });
});

test('clearBadge resets both count and dot state', () => {
  setCount(9);
  clearBadge();
  assert.deepEqual(getState(), { mode: 'none', count: 0 });
});

test('discoverInstalledDesktopFiles finds the .desktop entry that launches this binary', () => {
  const originalAppImage = process.env.APPIMAGE;
  const originalDataHome = process.env.XDG_DATA_HOME;
  const originalDataDirs = process.env.XDG_DATA_DIRS;
  process.env.APPIMAGE = '/home/user/Applications/Zalo.AppImage';
  process.env.XDG_DATA_HOME = '/home/user/.local/share';
  process.env.XDG_DATA_DIRS = '/usr/share';

  const files = {
    '/home/user/.local/share/applications': ['appimagekit_deadbeef-Zalo.desktop', 'unrelated.desktop'],
    '/usr/share/applications': []
  };
  const contents = {
    '/home/user/.local/share/applications/appimagekit_deadbeef-Zalo.desktop':
      'Exec=/home/user/Applications/Zalo.AppImage %U\n',
    '/home/user/.local/share/applications/unrelated.desktop': 'Exec=/usr/bin/other-app\n'
  };

  try {
    const matches = discoverInstalledDesktopFiles(
      (dir) => files[dir] || [],
      (filePath) => {
        if (!(filePath in contents)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        return contents[filePath];
      }
    );
    assert.deepEqual(matches, ['appimagekit_deadbeef-Zalo.desktop']);
  } finally {
    if (originalAppImage === undefined) delete process.env.APPIMAGE; else process.env.APPIMAGE = originalAppImage;
    if (originalDataHome === undefined) delete process.env.XDG_DATA_HOME; else process.env.XDG_DATA_HOME = originalDataHome;
    if (originalDataDirs === undefined) delete process.env.XDG_DATA_DIRS; else process.env.XDG_DATA_DIRS = originalDataDirs;
  }
});

test('register() wires the IPC channels and the window title to the badge state', () => {
  const app = new EventEmitter();
  app.setDesktopName = () => {};
  const ipcMain = new EventEmitter();
  ipcMain.on = ipcMain.addListener.bind(ipcMain);

  register({ app, ipcMain, tray: null, iconPath: null });

  ipcMain.emit('zalo-notification-badge-count', {}, '3');
  assert.deepEqual(getState(), { mode: 'count', count: 3 });

  ipcMain.emit('zalo-notification-badge-count', {}, '0');
  assert.deepEqual(getState(), { mode: 'none', count: 0 });

  const win = new EventEmitter();
  win.getTitle = () => 'Zalo';
  app.emit('browser-window-created', {}, win);
  win.emit('page-title-updated', {}, '(9) Zalo');
  assert.deepEqual(getState(), { mode: 'count', count: 9 });
});

test('each "has unread" ping bumps a running counter, reset when the window is focused', () => {
  const app = new EventEmitter();
  app.setDesktopName = () => {};
  const ipcMain = new EventEmitter();
  ipcMain.on = ipcMain.addListener.bind(ipcMain);

  register({ app, ipcMain, tray: null, iconPath: null });

  const win = new EventEmitter();
  win.getTitle = () => 'Zalo';
  app.emit('browser-window-created', {}, win);

  ipcMain.emit('zalo-notification-has-unread', {}, true);
  assert.deepEqual(getState(), { mode: 'count', count: 1 });
  ipcMain.emit('zalo-notification-has-unread', {}, true);
  assert.deepEqual(getState(), { mode: 'count', count: 2 });

  win.emit('focus');
  assert.deepEqual(getState(), { mode: 'none', count: 0 });

  ipcMain.emit('zalo-notification-has-unread', {}, true);
  assert.deepEqual(getState(), { mode: 'count', count: 1 });
});

test('the sentinel window title also bumps the counter and is never let through to the window', () => {
  const app = new EventEmitter();
  app.setDesktopName = () => {};
  const ipcMain = new EventEmitter();
  ipcMain.on = ipcMain.addListener.bind(ipcMain);

  register({ app, ipcMain, tray: null, iconPath: null });

  const win = new EventEmitter();
  win.getTitle = () => 'Zalo';
  app.emit('browser-window-created', {}, win);

  let prevented = false;
  win.emit('page-title-updated', { preventDefault: () => { prevented = true; } }, '__ZALO_UNREAD_PING__');
  assert.equal(prevented, true);
  assert.deepEqual(getState(), { mode: 'count', count: 1 });
});

test('focusing a background helper window (Shared Worker/SQLite) does not clear the badge', () => {
  const app = new EventEmitter();
  app.setDesktopName = () => {};
  const ipcMain = new EventEmitter();
  ipcMain.on = ipcMain.addListener.bind(ipcMain);

  register({ app, ipcMain, tray: null, iconPath: null });

  const win = new EventEmitter();
  win.getTitle = () => 'Shared Worker';
  app.emit('browser-window-created', {}, win);

  ipcMain.emit('zalo-notification-has-unread', {}, true);
  assert.deepEqual(getState(), { mode: 'count', count: 1 });

  win.emit('focus');
  assert.deepEqual(getState(), { mode: 'count', count: 1 });
});
