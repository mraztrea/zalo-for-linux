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

test('every notification build also pings the Linux badge, via ipcRenderer when available, else the window title', async () => {
  const { patchSource } = require('../scripts/patches/patch-notification-privacy');
  const source = 'class Notifier{static async createNotifyForMessages(){let E="Alice: ",f="";const e=[{text:"secret text"}];f=Notifier.createContentMessage(E,e[e.length-1]);let R=h.a.getAvatarFromConversation(t);return f}static createContentMessage(prefix,message){return prefix+message.text}};Notifier.createNotifyForMessages()';
  const patched = patchSource(source);

  const sent = [];
  await vm.runInNewContext(patched, {
    h: { a: { getAvatarFromConversation: () => null } },
    t: {},
    window: {},
    require: (mod) => {
      assert.equal(mod, 'electron');
      return { ipcRenderer: { send: (channel, value) => sent.push([channel, value]) } };
    }
  });
  assert.deepEqual(sent, [['zalo-notification-has-unread', true]]);

  const fakeDocument = { title: '' };
  await vm.runInNewContext(patched, {
    h: { a: { getAvatarFromConversation: () => null } },
    t: {},
    window: {},
    document: fakeDocument
  });
  assert.equal(fakeDocument.title, '__ZALO_UNREAD_PING__');

  // No require and no document (a worker with neither): must not throw.
  await vm.runInNewContext(patched, {
    h: { a: { getAvatarFromConversation: () => null } },
    t: {},
    window: {}
  });
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
