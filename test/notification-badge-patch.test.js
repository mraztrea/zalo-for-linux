const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const privacy = require('../scripts/patches/patch-notification-privacy');
const badge = require('../scripts/patches/patch-notification-badge');

// Same shape as the builder the privacy test uses.
const BUILDER = 'class Notifier{static async createNotifyForMessages(){let E="Alice: ",f="";const e=[{text:"secret text"}];f=Notifier.createContentMessage(E,e[e.length-1]);let R=h.a.getAvatarFromConversation(t);return f}static createContentMessage(prefix,message){return prefix+message.text}};Notifier.createNotifyForMessages()';

function fakeWindow() {
  const events = [];
  return { events, dispatchEvent: (event) => { events.push(event.type); return true; } };
}

function run(source, globals) {
  return vm.runInNewContext(source, {
    h: { a: { getAvatarFromConversation: () => null } },
    t: {},
    Event: class { constructor(type) { this.type = type; } },
    ...globals
  });
}

test('the badge ping leaves message-content hiding exactly as it was', async () => {
  const patched = badge.patchBundleSource(privacy.patchSource(BUILDER));
  for (const hidden of [false, true, undefined]) {
    const window = { __zaloHideMessageContent: hidden, ...fakeWindow() };
    const expected = hidden === false ? 'Alice: secret text' : 'Alice: Bạn có tin nhắn mới';
    assert.equal(await run(patched, { window }), expected);
    assert.deepEqual(window.events, [badge.EVENT]);
  }
});

test('patch order does not matter', async () => {
  const patched = privacy.patchSource(badge.patchBundleSource(BUILDER));
  const window = { __zaloHideMessageContent: true, ...fakeWindow() };
  assert.equal(await run(patched, { window }), 'Alice: Bạn có tin nhắn mới');
  assert.deepEqual(window.events, [badge.EVENT]);
});

test('the ping never uses require or touches document.title', async () => {
  const patched = badge.patchBundleSource(BUILDER);
  const document = { title: 'Zalo' };
  let requireCalled = false;
  const window = fakeWindow();
  await run(patched, { window, document, require: () => { requireCalled = true; } });
  assert.equal(document.title, 'Zalo');
  assert.equal(requireCalled, false);
});

test('in a worker (no window) or a window without dispatchEvent, the builder still works', async () => {
  const patched = badge.patchBundleSource(BUILDER);
  assert.equal(await run(patched, {}), 'Alice: secret text');
  assert.equal(await run(patched, { window: {} }), 'Alice: secret text');
  assert.equal(await run(patched, { window: { dispatchEvent: () => { throw new Error('boom'); } } }), 'Alice: secret text');
});

test('patching twice is a no-op, and a bundle without the builder is left alone', () => {
  const once = badge.patchBundleSource(BUILDER);
  assert.equal(badge.patchBundleSource(once), once);
  assert.equal(badge.patchBundleSource('var unrelated=1;'), null);
});

test('the preload relay forwards the event as the badge IPC message', () => {
  const listeners = {};
  const sent = [];
  const window = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  const require = (mod) => {
    assert.equal(mod, 'electron');
    return { ipcRenderer: { send: (channel, value) => sent.push([channel, value]) } };
  };
  // A preload that ends in an IIFE without a semicolon: the relay must not
  // turn into a call on its result.
  const preload = '(function(){globalThis.loaded=true})()';
  const context = { window, require, globalThis: {} };
  vm.runInNewContext(badge.patchPreloadSource(preload), context);
  listeners[badge.EVENT]();
  assert.deepEqual(sent, [[badge.IPC_CHANNEL, true]]);
  assert.equal(badge.patchPreloadSource(badge.patchPreloadSource(preload)), badge.patchPreloadSource(preload));
});

test('main() wires bundles and preloads, and only warns when anchors are missing', async () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-badge-patch-'));
  try {
    fs.mkdirSync(path.join(appDir, 'pc-dist', 'lazy'), { recursive: true });
    fs.mkdirSync(path.join(appDir, 'main-dist'), { recursive: true });
    const bundle = path.join(appDir, 'pc-dist', 'lazy', 'default-login-main-startup-shared-worker-znotification.abc.js');
    const preload = path.join(appDir, 'main-dist', 'preload-noti.js');
    fs.writeFileSync(bundle, BUILDER);
    fs.writeFileSync(preload, 'void 0;');

    await badge.main(appDir);
    assert.ok(fs.readFileSync(bundle, 'utf8').includes(badge.EVENT));
    assert.ok(fs.readFileSync(preload, 'utf8').includes(badge.IPC_CHANNEL));

    fs.writeFileSync(bundle, 'var changedByZalo=1;');
    await assert.doesNotReject(badge.main(appDir));
  } finally {
    fs.rmSync(appDir, { recursive: true, force: true });
  }
});
