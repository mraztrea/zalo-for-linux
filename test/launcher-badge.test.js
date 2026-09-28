const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const { register, _private } = require('../plugins/launcher-badge');
const { patchSource } = require('../scripts/patches/patch-unread-badge-source');

test('unread badge updates the tray and clears when unread count reaches zero', () => {
  const app = new EventEmitter();
  const ipcMain = new EventEmitter();
  const badgeCounts = [];
  const badgeSignals = [];
  let sessionBusCalls = 0;
  const tray = {
    image: null,
    updates: 0,
    setImage(image) {
      this.image = image;
      this.updates++;
    }
  };
  const bus = {
    send(message) {
      badgeSignals.push(message);
      return Promise.resolve();
    }
  };
  const dbus = {
    MessageType: { SIGNAL: 'signal' },
    Message: class { constructor(fields) { Object.assign(this, fields); } },
    Variant: class { constructor(signature, value) { this.signature = signature; this.value = value; } },
    sessionBus() {
      sessionBusCalls++;
      return bus;
    }
  };
  const normalIcon = '/icons/zalo.png';
  const unreadIcon = '/icons/zalo-unread.png';
  app.setBadgeCount = (count) => badgeCounts.push(count);

  register({ app, ipcMain, tray, iconPath: normalIcon, unreadIconPath: unreadIcon, dbus });
  assert.equal(tray.image, normalIcon);
  assert.equal(sessionBusCalls, 1);

  ipcMain.emit('badge-count', {}, 3);
  assert.equal(tray.image, unreadIcon);
  assert.equal(badgeCounts.at(-1), 3);
  assert.equal(badgeSignals.at(-1).body[0], 'application://zalo.desktop');
  assert.equal(badgeSignals.at(-1).path, '/com/canonical/Unity/LauncherEntry');
  assert.equal(badgeSignals.at(-1).interface, 'com.canonical.Unity.LauncherEntry');
  assert.equal(badgeSignals.at(-1).member, 'Update');
  assert.equal(badgeSignals.at(-1).signature, 'sa{sv}');
  assert.equal(badgeSignals.at(-1).body[1].count.value, 3n);
  assert.equal(badgeSignals.at(-1).body[1]['count-visible'].value, true);
  assert.equal(_private.normalizeCount(-1), 0);
  assert.equal(_private.normalizeCount(3.5), 0);
  assert.equal(_private.normalizeCount(12000), 9999);
  assert.equal(_private.normalizeDesktopFile('/usr/share/applications/zalo.desktop'), 'zalo.desktop');

  const updates = tray.updates;
  const signals = badgeSignals.length;
  ipcMain.emit('badge-count', {}, 3);
  assert.equal(tray.updates, updates);
  assert.equal(badgeSignals.length, signals);

  ipcMain.emit('badge-count', {}, 0);
  assert.equal(tray.image, normalIcon);
  assert.equal(badgeCounts.at(-1), 0);
  assert.equal(badgeSignals.at(-1).body[1]['count-visible'].value, false);

  ipcMain.emit('badge-count', {}, 4);
  app.emit('before-quit');
  assert.equal(tray.image, normalIcon);
  assert.equal(badgeCounts.at(-1), 0);
});

test('replays an active taskbar badge and stops replaying after clear', () => {
  const app = new EventEmitter();
  const ipcMain = new EventEmitter();
  const signals = [];
  const bus = { send: (message) => signals.push(message) };
  const dbus = {
    MessageType: { SIGNAL: 'signal' },
    Message: class { constructor(fields) { Object.assign(this, fields); } },
    Variant: class { constructor(signature, value) { this.signature = signature; this.value = value; } },
    sessionBus: () => bus
  };
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  let replayTimer;
  let clearedTimer;

  global.setInterval = (callback, interval) => {
    replayTimer = { callback, interval, unref() {} };
    return replayTimer;
  };
  global.clearInterval = (timer) => { clearedTimer = timer; };

  try {
    register({ app, ipcMain, dbus, desktopFile: 'zalo.desktop' });
    ipcMain.emit('badge-count', {}, 2);
    assert.equal(replayTimer.interval, _private.BADGE_REPLAY_INTERVAL_MS);

    replayTimer.callback();
    assert.equal(signals.at(-1).body[1].count.value, 2n);

    ipcMain.emit('badge-count', {}, 0);
    assert.equal(clearedTimer, replayTimer);
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test('renderer patch uses total unread and replays the loaded total after subscribing', () => {
  const source = 'subcriberUnreadSrc(){setTimeout((()=>{o.a.UnreadDataManager.addEventListener(c.b.ChangeUnreadCount,this.handleChangeUnreadCount)}),100)}handleChangeUnreadCount(e){const{unreadNoMute:t,convId:n,curentUnreadNoMute:a}=e.payload;this.totalCurrent=t;const i=r.default.enable_busy_mode?this.user_mode:s.USER_MODE.AVAILABLE,o=d.n.getDidLogOut(),l=u.a.getWindow(n);"1"===this.windowId?this.setCount(o?0:t,i,!l):this.windowId===n&&this.setCount(o?0:a,i,!!a)}';

  const patched = patchSource(source);
  assert.match(patched, /const\{totalUnread:t,convId:n,curentUnreadNoMute:a\}=e\.payload/);
  assert.match(patched, /getUnreadByConvIdSync\("total"\)/);
  assert.match(patched, /this\.handleChangeUnreadCount\(\{payload:\{totalUnread:__zaloUnreadBadgeTotal\?__zaloUnreadBadgeTotal\.smsUnreadCount/);
  assert.equal(patchSource(patched), patched);
});

test('renderer patch fails when the upstream unread anchors change', () => {
  assert.throws(() => patchSource('no unread handler here'), /Unread source changed/);
});
