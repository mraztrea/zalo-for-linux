const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Feeds plugins/launcher-badge: one ping per incoming-message notification.
//
// Two halves, each kept to what is known to be safe in its context:
//
// 1. Inside Zalo's page bundles, Notifier.createNotifyForMessages() (the
//    builder patch-notification-privacy.js already anchors on) only dispatches
//    a DOM event. Those bundles reach Node through Zalo's own `$znode` bridge,
//    not `require`, so nothing here may call `require`. A previous attempt
//    also changed `document.title` to signal the main process; that touched
//    state Zalo's windows own and was dropped.
//
// 2. A relay appended to the end of Zalo's preload scripts (the same
//    technique patch-auto-theme.js uses on preload-render.js) listens for that
//    event and sends the IPC message. Preloads always have `require`, and DOM
//    events reach preload listeners whether or not context isolation is on.
//
// Missing anchors only disable the badge: they must never fail the build.

const EVENT = 'zalo-linux-unread';
const IPC_CHANNEL = 'zalo-notification-has-unread';
// Doubles as the idempotency marker in patched bundles.
const CATCH_NAME = '__zaloLinuxUnreadPing';
const PING = `try{typeof window!=="undefined"&&typeof window.dispatchEvent==="function"&&window.dispatchEvent(new Event("${EVENT}"))}catch(${CATCH_NAME}){};`;

const RELAY_MARKER = '// --- Zalo Linux unread badge relay ---';
// Leading ";" so the relay can't be parsed as a call on whatever expression
// the preload ends with.
const RELAY = `
${RELAY_MARKER}
;(function () {
  try {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    var ipcRenderer = require("electron").ipcRenderer;
    window.addEventListener("${EVENT}", function () {
      try { ipcRenderer.send("${IPC_CHANNEL}", true); } catch (_) {}
    });
  } catch (_) {}
})();
`;

const BUNDLE_NAME = /^(?:compact-app-pc|search-worker|sync-v2-sub-worker|default-login-main-startup-shared-worker-znotification)\..*\.js$/;
// Every preload patch-pasting-img.js confirms exists: whichever window ends up
// building the notification, its preload carries the relay.
const PRELOADS = ['preload-render.js', 'preload-noti.js', 'preload-shared-worker.js', 'preload-sqlite.js', 'compact-app-preload.js'];

// Returns the patched source, the source unchanged if already patched, or
// null if this bundle has no notification builder to patch.
function patchBundleSource(source) {
  if (source.includes(CATCH_NAME)) return source;
  const start = source.indexOf('static async createNotifyForMessages(');
  if (start < 0) return null;
  const end = source.indexOf('static createContentMessage(', start);
  if (end < 0) return null;
  const method = source.slice(start, end);
  const anchor = /let [\w$]+=h\.a\.getAvatarFromConversation\(t\)/;
  if (!anchor.test(method)) return null;
  return source.slice(0, start) + method.replace(anchor, PING + '$&') + source.slice(end);
}

function patchPreloadSource(source) {
  if (source.includes(RELAY_MARKER)) return source;
  return source.trimEnd() + '\n' + RELAY;
}

async function main(appDir = path.join(__dirname, '..', '..', 'app')) {
  const pcDist = path.join(appDir, 'pc-dist');
  const bundles = [pcDist, path.join(pcDist, 'lazy')].flatMap((dir) =>
    fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => BUNDLE_NAME.test(name)).map((name) => path.join(dir, name)) : []
  );

  let bundlesPatched = 0;
  for (const file of bundles) {
    const before = fs.readFileSync(file, 'utf8');
    const after = patchBundleSource(before);
    if (after === null) continue;
    if (after !== before) fs.writeFileSync(file, after);
    bundlesPatched++;
  }

  let preloadsPatched = 0;
  for (const name of PRELOADS) {
    const file = path.join(appDir, 'main-dist', name);
    if (!fs.existsSync(file)) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = patchPreloadSource(before);
    if (after !== before) fs.writeFileSync(file, after);
    preloadsPatched++;
  }

  if (!bundlesPatched || !preloadsPatched) {
    logger.warn(`Unread badge not wired (notification builders: ${bundlesPatched}, preloads: ${preloadsPatched}); the badge will stay empty`);
    return;
  }
  logger.dim(`Wired unread badge: ${bundlesPatched} notification builder(s), ${preloadsPatched} preload(s)`);
}

if (require.main === module) main();

module.exports = { main, patchBundleSource, patchPreloadSource, EVENT, IPC_CHANNEL };
