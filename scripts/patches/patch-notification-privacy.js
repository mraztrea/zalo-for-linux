const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const MARKER = '__zaloHideMessageContent';

// createNotifyForMessages() is the one confirmed place in Zalo's own bundled
// code that runs for every incoming message notification, in every bundle
// that builds one (main window, workers, the dedicated znotification
// window) — regardless of whether the OS ends up showing a popup for it. It
// has no reliable ipcRenderer access (some of these bundles are workers), so
// this pings the main process through whichever channel is actually
// available: ipcRenderer if Node integration reaches this context, else the
// same "sentinel window title" trick used elsewhere in this codebase, which
// plugins/launcher-badge/index.js watches for on every window.
const BADGE_PING = 'try{if(typeof require==="function"){require("electron").ipcRenderer.send("zalo-notification-has-unread",true)}else if(typeof document!=="undefined"){document.title="__ZALO_UNREAD_PING__"}}catch(e){}';

function patchSource(source) {
  const start = source.indexOf('static async createNotifyForMessages(');
  const end = source.indexOf('static createContentMessage(', start);
  if (start < 0 || end < 0) throw new Error('Notification source changed: message builder not found');

  const method = source.slice(start, end);
  if (method.includes(MARKER)) return source;
  const content = method.match(/([\w$]+)=[\w$]+\.createContentMessage\(([\w$]+),e\[e\.length-1\]\)/);
  const avatar = /let [\w$]+=h\.a\.getAvatarFromConversation\(t\)/;
  if (!content || !avatar.test(method)) throw new Error('Notification source changed: message content anchor not found');

  const hidden = `${BADGE_PING};(typeof window==="undefined"||window.${MARKER}!==false)&&(${content[1]}=${content[2]}+"Bạn có tin nhắn mới");`;
  return source.slice(0, start) + method.replace(avatar, hidden + '$&') + source.slice(end);
}

async function main(appDir = path.join(__dirname, '..', '..', 'app')) {
  const pcDist = path.join(appDir, 'pc-dist');
  const candidates = [pcDist, path.join(pcDist, 'lazy')].flatMap((dir) =>
    fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) =>
      /^(?:compact-app-pc|search-worker|sync-v2-sub-worker|default-login-main-startup-shared-worker-znotification)\..*\.js$/.test(name)
    ).map((name) => path.join(dir, name)) : []
  );
  if (!candidates.length) throw new Error('Notification source changed: message bundles not found');

  const updates = candidates.map((file) => {
    const before = fs.readFileSync(file, 'utf8');
    return { file, before, after: patchSource(before) };
  });
  for (const { file, before, after } of updates) {
    if (after !== before) {
      fs.writeFileSync(file, after);
      logger.dim(`Patched message notification privacy: ${path.basename(file)}`);
    }
  }
}

if (require.main === module) main();

module.exports = { main, patchSource };
