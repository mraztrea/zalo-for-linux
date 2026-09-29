const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { PAGE_SCRIPT } = require('../../plugins/notification-privacy/sender-privacy');

// Installs the "hide sender" Notification wrapper from Zalo's preloads, so it
// is in place before any page script runs (even one that keeps its own
// reference to window.Notification). webFrame.executeJavaScript runs it in
// the page's world with or without context isolation. The plugin re-installs
// it on dom-ready as a fallback, so a missing preload never fails the build.

const MARKER = '// --- Zalo Linux notification sender privacy ---';
// Leading ";" so this can't be parsed as a call on the preload's last expression.
const BLOCK = `
${MARKER}
;(function () {
  try { require("electron").webFrame.executeJavaScript(${JSON.stringify(PAGE_SCRIPT)}); } catch (_) {}
})();
`;

const PRELOADS = ['preload-render.js', 'preload-noti.js', 'preload-shared-worker.js', 'preload-sqlite.js', 'compact-app-preload.js'];

// The wrapper only reaches notifications created in a page. Say so loudly if
// Zalo's main process creates any itself: those would still show the sender.
function mainProcessCreatesNotifications(source) {
  return /new [\w$.]*Notification\(/.test(source);
}

function patchPreloadSource(source) {
  if (source.includes(MARKER)) return source;
  return source.trimEnd() + '\n' + BLOCK;
}

async function main(appDir = path.join(__dirname, '..', '..', 'app')) {
  let patched = 0;
  for (const name of PRELOADS) {
    const file = path.join(appDir, 'main-dist', name);
    if (!fs.existsSync(file)) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = patchPreloadSource(before);
    if (after !== before) fs.writeFileSync(file, after);
    patched++;
  }
  const mainJs = path.join(appDir, 'main-dist', 'main.js');
  if (fs.existsSync(mainJs) && mainProcessCreatesNotifications(fs.readFileSync(mainJs, 'utf8'))) {
    logger.warn('Notification sender privacy: main-dist/main.js creates notifications itself; those will still show the sender');
  }

  if (!patched) {
    logger.warn('Notification sender privacy: no preload found, relying on the dom-ready fallback');
    return;
  }
  logger.dim(`Notification sender privacy installed in ${patched} preload(s)`);
}

if (require.main === module) main();

module.exports = { main, patchPreloadSource, mainProcessCreatesNotifications };
