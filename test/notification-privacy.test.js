const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('message notifications hide their text only when the option is enabled', async () => {
  const { patchSource } = require('../scripts/patches/patch-notification-privacy');
  const source = 'class Notifier{static async createNotifyForMessages(){let E="Alice: ",f="";const e=[{text:"secret text"}];f=Notifier.createContentMessage(E,e[e.length-1]);let R=h.a.getAvatarFromConversation(t);return f}static createContentMessage(prefix,message){return prefix+message.text}};Notifier.createNotifyForMessages()';
  const patched = patchSource(source);
  const run = (enabled) => vm.runInNewContext(patched, {
    h: { a: { getAvatarFromConversation: () => null } },
    t: {},
    window: { __zaloHideMessageContent: enabled }
  });

  assert.equal(await run(false), 'Alice: secret text');
  assert.equal(await run(true), 'Alice: Bạn có tin nhắn mới');
  assert.equal(await run(undefined), 'Alice: Bạn có tin nhắn mới');
  assert.throws(() => patchSource('class Notifier{}'), /notification source changed/i);
});

test('the privacy choice persists and reaches every Zalo window', () => {
  const { register } = require('../plugins/notification-privacy');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-notification-privacy-'));
  try {
    const app = new EventEmitter();
    app.getPath = () => userData;
    const windows = [];
    const BrowserWindow = { getAllWindows: () => windows };
    const registerWindow = (url) => {
      const win = new EventEmitter();
      win.isDestroyed = () => false;
      const state = { __zaloHideMessageContent: null, dispatchEvent() {} };
      win.webContents = new EventEmitter();
      win.webContents.getURL = () => url;
      win.webContents.isDestroyed = () => false;
      win.webContents.executeJavaScript = (script) => {
        if (script.startsWith('window.__zaloHideMessageContent=')) vm.runInNewContext(script, { window: state, Event: class {} });
        return Promise.resolve();
      };
      windows.push(win);
      app.emit('browser-window-created', {}, win);
      win.webContents.emit('dom-ready');
      return { win, state };
    };

    register({ app, BrowserWindow });
    const main = registerWindow('file:///zalo/pc-dist/index.html');
    const notification = registerWindow('file:///zalo/pc-dist/znotification.html');
    assert.equal(main.state.__zaloHideMessageContent, false);
    assert.equal(notification.state.__zaloHideMessageContent, false);

    main.win.emit('page-title-updated', { preventDefault() {} }, 'ZALO_TOGGLE_NOTIFICATION_PRIVACY');
    assert.equal(JSON.parse(fs.readFileSync(path.join(userData, 'notification-privacy.json'))).hideMessageContent, true);
    assert.equal(main.state.__zaloHideMessageContent, true);
    assert.equal(notification.state.__zaloHideMessageContent, true);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

const senderPrivacy = require('../plugins/notification-privacy/sender-privacy');

function pageWithNotification() {
  class FakeNotification {
    constructor(title, options = {}) {
      this.title = title;
      this.body = options.body;
      this.icon = options.icon;
      this.tag = options.tag;
    }
  }
  FakeNotification.permission = 'granted';
  const window = { Notification: FakeNotification };
  vm.runInNewContext(senderPrivacy.PAGE_SCRIPT, { window, Proxy, Reflect, Object });
  return { window, FakeNotification };
}

test('hide sender: page notifications become "Zalo – Bạn có tin nhắn mới" with no avatar, only when enabled', () => {
  const { window, FakeNotification } = pageWithNotification();
  const shown = new window.Notification('Alice', { body: 'secret text', icon: 'avatar.png', tag: 'conv-1' });
  assert.equal(shown.title, 'Alice');
  assert.equal(shown.body, 'secret text');

  window.__zaloHideSender = true;
  const hidden = new window.Notification('Alice', { body: 'Alice: secret text', icon: 'avatar.png', tag: 'conv-1' });
  assert.equal(hidden.title, 'Zalo');
  assert.equal(hidden.body, 'Bạn có tin nhắn mới');
  assert.equal(hidden.icon, undefined);
  assert.equal(hidden.tag, 'conv-1');
  assert.ok(hidden instanceof window.Notification);
  assert.ok(hidden instanceof FakeNotification);
  assert.equal(window.Notification.permission, 'granted');

  // Installing twice must not wrap twice.
  const wrapped = window.Notification;
  vm.runInNewContext(senderPrivacy.PAGE_SCRIPT, { window, Proxy, Reflect, Object });
  assert.equal(window.Notification, wrapped);
});


test('hide sender: the choice persists separately from hide content and reaches every window', () => {
  const { register } = require('../plugins/notification-privacy');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-notification-sender-'));
  try {
    const app = new EventEmitter();
    app.getPath = () => userData;
    const windows = [];
    const BrowserWindow = { getAllWindows: () => windows };
    const win = new EventEmitter();
    win.isDestroyed = () => false;
    const state = { dispatchEvent() {} };
    win.webContents = new EventEmitter();
    win.webContents.getURL = () => 'file:///zalo/pc-dist/index.html';
    win.webContents.isDestroyed = () => false;
    win.webContents.executeJavaScript = (script) => {
      if (script.startsWith('window.__zaloHideMessageContent=')) vm.runInNewContext(script, { window: state, Event: class {} });
      return Promise.resolve();
    };
    windows.push(win);

    register({ app, BrowserWindow });
    app.emit('browser-window-created', {}, win);
    win.webContents.emit('dom-ready');
    assert.equal(state.__zaloHideSender, false);

    win.emit('page-title-updated', { preventDefault() {} }, 'ZALO_TOGGLE_NOTIFICATION_SENDER');
    const saved = JSON.parse(fs.readFileSync(path.join(userData, 'notification-privacy.json')));
    assert.deepEqual(saved, { hideMessageContent: false, hideSender: true });
    assert.equal(state.__zaloHideSender, true);
    assert.equal(state.__zaloHideMessageContent, false);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('hide sender: preload block runs the wrapper through webFrame and is idempotent', () => {
  const { patchPreloadSource } = require('../scripts/patches/patch-notification-sender');
  const ran = [];
  const preload = '(function(){globalThis.loaded=true})()';
  const patched = patchPreloadSource(preload);
  vm.runInNewContext(patched, {
    globalThis: {},
    require: () => ({ webFrame: { executeJavaScript: (code) => ran.push(code) } })
  });
  assert.deepEqual(ran, [senderPrivacy.PAGE_SCRIPT]);
  assert.equal(patchPreloadSource(patched), patched);
});

test('hide sender: the build flags a Zalo main process that creates notifications itself', () => {
  const { mainProcessCreatesNotifications } = require('../scripts/patches/patch-notification-sender');
  assert.equal(mainProcessCreatesNotifications('const n=new r.Notification({title:t});n.show()'), true);
  assert.equal(mainProcessCreatesNotifications('new Notification({title:t})'), true);
  assert.equal(mainProcessCreatesNotifications('r.Notification.isSupported()'), false);
});
