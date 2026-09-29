const assert = require('node:assert/strict');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const test = require('node:test');

const { createSignalEmitter, launcherEntryBody, _private } = require('../plugins/launcher-badge/dbus-emitter');

const hasDbus = spawnSync('sh', ['-c', 'command -v dbus-daemon && command -v dbus-monitor && command -v dbus-send']).status === 0;

function startBus() {
  return new Promise((resolve, reject) => {
    const daemon = spawn('dbus-daemon', ['--session', '--nofork', '--print-address=1'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    daemon.stdout.on('data', (chunk) => {
      out += chunk;
      const line = out.split('\n')[0];
      if (out.includes('\n')) resolve({ daemon, address: line.trim() });
    });
    daemon.on('error', reject);
  });
}

function waitFor(predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('timed out'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

test('bus addresses: path and abstract sockets, with the XDG runtime dir as fallback', () => {
  assert.deepEqual(
    _private.socketPathsFromEnv({ DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus', XDG_RUNTIME_DIR: '/run/user/1000' }, 1000),
    ['/run/user/1000/bus']
  );
  assert.deepEqual(
    _private.socketPathsFromEnv({ DBUS_SESSION_BUS_ADDRESS: 'unix:abstract=/tmp/dbus-abc,guid=123' }, 1000),
    ['\0/tmp/dbus-abc', '/run/user/1000/bus']
  );
  assert.deepEqual(_private.socketPathsFromEnv({}, 42), ['/run/user/42/bus']);
});

test('emits a LauncherEntry.Update that a real D-Bus peer decodes, and stays connected afterwards', { skip: !hasDbus && 'dbus-daemon not installed' }, async () => {
  const { daemon, address } = await startBus();
  const env = { DBUS_SESSION_BUS_ADDRESS: address };
  const monitor = spawn('dbus-monitor', ['--address', address, "type='signal',interface='com.canonical.Unity.LauncherEntry'"], { stdio: ['ignore', 'pipe', 'ignore'] });
  let seen = '';
  monitor.stdout.on('data', (chunk) => { seen += chunk; });

  let emitter;
  try {
    await new Promise((r) => setTimeout(r, 300));
    const ready = new Promise((resolve, reject) => {
      emitter = createSignalEmitter({ env, onReady: resolve, onFailure: () => reject(new Error('could not connect')) });
      emitter.connect();
    });
    await ready;
    emitter.emitSignal({
      path: '/com/canonical/Unity/LauncherEntry',
      iface: 'com.canonical.Unity.LauncherEntry',
      member: 'Update',
      signature: 'sa{sv}',
      body: launcherEntryBody('application://zalo.desktop', 7, true)
    });

    await waitFor(() => /boolean true/.test(seen));
    assert.match(seen, /member=Update/);
    assert.match(seen, /string "application:\/\/zalo\.desktop"/);
    assert.match(seen, /string "count"\s+variant\s+int64 7/);
    assert.match(seen, /string "count-visible"\s+variant\s+boolean true/);

    // KDE clears a badge once its sender leaves the bus: ours must still be there.
    const sender = seen.match(/sender=(:\d+\.\d+)[^\n]*member=Update/)[1];
    await new Promise((r) => setTimeout(r, 300));
    const reply = execFileSync('dbus-send', ['--session', '--print-reply', '--dest=org.freedesktop.DBus', '/org/freedesktop/DBus',
      'org.freedesktop.DBus.NameHasOwner', `string:${sender}`], { env: { ...process.env, ...env } }).toString();
    assert.match(reply, /boolean true/);
  } finally {
    if (emitter) emitter.close();
    monitor.kill();
    daemon.kill();
  }
});

test('reports failure when no session bus can be reached', async () => {
  let emitter;
  const failed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no failure reported')), 2000);
    emitter = createSignalEmitter({
      env: { DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nonexistent/bus', XDG_RUNTIME_DIR: '/nonexistent' },
      onReady: () => { clearTimeout(timer); reject(new Error('should not connect')); },
      onFailure: () => { clearTimeout(timer); resolve(); }
    });
  });
  emitter.connect();
  // Not connected yet: nothing is sent, the caller re-sends from onReady.
  assert.equal(emitter.emitSignal({ path: '/x', iface: 'a.b', member: 'C', body: Buffer.alloc(0) }), false);
  await failed;
});
