'use strict';

// Minimal D-Bus session-bus client that can only emit signals.
//
// Why not `gdbus emit`: KDE Plasma's task manager remembers which bus
// connection sent a com.canonical.Unity.LauncherEntry.Update signal and
// clears that badge as soon as the connection goes away. `gdbus emit` is a
// process that exits right after sending, so on KDE the badge was cleared
// within milliseconds and never visible. Keeping one connection open for the
// lifetime of Zalo keeps the badge up until we change or clear it.

const net = require('net');

const TYPE_METHOD_CALL = 1;
const TYPE_SIGNAL = 4;
const RECONNECT_DELAY_MS = 5000;

class Writer {
  constructor() {
    this.buf = Buffer.alloc(256);
    this.off = 0;
  }

  ensure(n) {
    if (this.off + n <= this.buf.length) return;
    const next = Buffer.alloc(Math.max(this.buf.length * 2, this.off + n));
    this.buf.copy(next, 0, 0, this.off);
    this.buf = next;
  }

  align(n) {
    const pad = (n - (this.off % n)) % n;
    this.ensure(pad);
    this.buf.fill(0, this.off, this.off + pad);
    this.off += pad;
  }

  byte(v) {
    this.ensure(1);
    this.buf[this.off++] = v;
  }

  uint32(v) {
    this.align(4);
    this.ensure(4);
    this.buf.writeUInt32LE(v, this.off);
    this.off += 4;
  }

  int64(v) {
    this.align(8);
    this.ensure(8);
    this.buf.writeBigInt64LE(BigInt(v), this.off);
    this.off += 8;
  }

  bool(v) {
    this.uint32(v ? 1 : 0);
  }

  string(s) {
    const bytes = Buffer.from(s, 'utf8');
    this.uint32(bytes.length);
    this.ensure(bytes.length + 1);
    bytes.copy(this.buf, this.off);
    this.off += bytes.length;
    this.buf[this.off++] = 0;
  }

  signature(s) {
    const bytes = Buffer.from(s, 'ascii');
    this.byte(bytes.length);
    this.ensure(bytes.length + 1);
    bytes.copy(this.buf, this.off);
    this.off += bytes.length;
    this.buf[this.off++] = 0;
  }

  // D-Bus array: uint32 byte length, padding to the element alignment (not
  // counted in the length), then the elements.
  array(elementAlign, writeElements) {
    this.uint32(0);
    const lengthAt = this.off - 4;
    this.align(elementAlign);
    const start = this.off;
    writeElements();
    this.buf.writeUInt32LE(this.off - start, lengthAt);
  }

  toBuffer() {
    return Buffer.from(this.buf.subarray(0, this.off));
  }
}

function buildMessage({ type, serial, path, iface, member, destination, signature, body }) {
  const bodyBuf = body || Buffer.alloc(0);
  const h = new Writer();
  h.byte(0x6c); // 'l': little-endian
  h.byte(type);
  h.byte(0);
  h.byte(1); // protocol version
  h.uint32(bodyBuf.length);
  h.uint32(serial);
  h.array(8, () => {
    const field = (code, sig, write) => {
      h.align(8);
      h.byte(code);
      h.signature(sig);
      write();
    };
    if (path) field(1, 'o', () => h.string(path));
    if (iface) field(2, 's', () => h.string(iface));
    if (member) field(3, 's', () => h.string(member));
    if (destination) field(6, 's', () => h.string(destination));
    if (signature) field(8, 'g', () => h.signature(signature));
  });
  h.align(8);
  return Buffer.concat([h.toBuffer(), bodyBuf]);
}

// Body of com.canonical.Unity.LauncherEntry.Update, signature "sa{sv}".
function launcherEntryBody(appUri, count, countVisible) {
  const b = new Writer();
  b.string(appUri);
  b.array(8, () => {
    b.align(8);
    b.string('count');
    b.signature('x');
    b.int64(count);
    b.align(8);
    b.string('count-visible');
    b.signature('b');
    b.bool(countVisible);
  });
  return b.toBuffer();
}

// Returns socket paths to try, in order. Abstract sockets get the leading NUL
// Node expects.
function socketPathsFromEnv(env = process.env, uid = process.getuid ? process.getuid() : 0) {
  const paths = [];
  for (const address of String(env.DBUS_SESSION_BUS_ADDRESS || '').split(';')) {
    const match = address.match(/^unix:(.*)$/);
    if (!match) continue;
    const params = {};
    for (const pair of match[1].split(',')) {
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      let value = pair.slice(eq + 1);
      try { value = decodeURIComponent(value); } catch (_) {}
      params[pair.slice(0, eq)] = value;
    }
    if (params.path) paths.push(params.path);
    else if (params.abstract) paths.push(`\0${params.abstract}`);
  }
  const runtimeDir = env.XDG_RUNTIME_DIR || `/run/user/${uid}`;
  const fallback = `${runtimeDir}/bus`;
  if (!paths.includes(fallback)) paths.push(fallback);
  return paths;
}

function createSignalEmitter({
  env = process.env,
  uid = process.getuid ? process.getuid() : 0,
  onReady = () => {},
  onFailure = () => {}
} = {}) {
  let socket = null;
  let state = 'idle'; // idle | connecting | ready
  let serial = 0;
  let lastAttempt = 0;
  let closed = false;

  function nextSerial() {
    serial = (serial % 0xfffffffe) + 1;
    return serial;
  }

  function reset() {
    if (socket) {
      socket.removeAllListeners();
      socket.on('error', () => {});
      socket.destroy();
    }
    socket = null;
    state = 'idle';
  }

  function tryPath(paths, index) {
    if (closed) return;
    if (index >= paths.length) {
      reset();
      onFailure();
      return;
    }

    let authBuffer = '';
    const s = net.createConnection(paths[index]);
    socket = s;
    s.unref();

    s.on('connect', () => {
      const hexUid = Buffer.from(String(uid), 'ascii').toString('hex');
      s.write(`\0AUTH EXTERNAL ${hexUid}\r\n`);
    });

    s.on('data', (chunk) => {
      if (state === 'ready') return; // replies and NameAcquired: not needed
      authBuffer += chunk.toString('latin1');
      const lineEnd = authBuffer.indexOf('\r\n');
      if (lineEnd < 0) return;
      const line = authBuffer.slice(0, lineEnd);
      if (!line.startsWith('OK ')) {
        s.destroy();
        return;
      }
      s.write('BEGIN\r\n');
      s.write(buildMessage({
        type: TYPE_METHOD_CALL,
        serial: nextSerial(),
        path: '/org/freedesktop/DBus',
        iface: 'org.freedesktop.DBus',
        member: 'Hello',
        destination: 'org.freedesktop.DBus'
      }));
      state = 'ready';
      onReady();
    });

    const fail = () => {
      if (socket !== s) return;
      const wasReady = state === 'ready';
      reset();
      if (wasReady) onFailure();
      else tryPath(paths, index + 1);
    };
    s.on('error', fail);
    s.on('close', fail);
  }

  function connect() {
    if (closed || state !== 'idle') return;
    const now = Date.now();
    if (now - lastAttempt < RECONNECT_DELAY_MS) return;
    lastAttempt = now;
    state = 'connecting';
    tryPath(socketPathsFromEnv(env, uid), 0);
  }

  // Emits when connected; otherwise starts connecting and returns false.
  // Callers re-send their current state from onReady.
  function emitSignal({ path, iface, member, signature, body }) {
    if (state !== 'ready' || !socket) {
      connect();
      return false;
    }
    socket.write(buildMessage({ type: TYPE_SIGNAL, serial: nextSerial(), path, iface, member, signature, body }));
    return true;
  }

  function close() {
    closed = true;
    reset();
  }

  return {
    connect,
    emitSignal,
    close,
    isReady: () => state === 'ready'
  };
}

module.exports = {
  createSignalEmitter,
  launcherEntryBody,
  _private: { buildMessage, socketPathsFromEnv, Writer }
};
