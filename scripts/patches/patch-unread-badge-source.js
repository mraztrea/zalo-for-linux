const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const HANDLER_ANCHOR = 'const{unreadNoMute:t,convId:n,curentUnreadNoMute:a}=e.payload;this.totalCurrent=t;';
const HANDLER_PATCH = 'const{totalUnread:t,convId:n,curentUnreadNoMute:a}=e.payload;this.totalCurrent=t;';
const SNAPSHOT_MARKER = '__zaloUnreadBadgeTotal';
const SUBSCRIBER = /subcriberUnreadSrc\(\)\{setTimeout\(\(\(\)=>\{([\w$]+)\.a\.UnreadDataManager\.addEventListener\(([\w$]+)\.b\.ChangeUnreadCount,this\.handleChangeUnreadCount\)\}\),100\)\}/g;

function patchSource(source) {
  if (source.includes(SNAPSHOT_MARKER)) {
    if (!source.includes(HANDLER_PATCH)) {
      throw new Error('Unread source changed: patched handler anchor not found');
    }
    return source;
  }

  if (source.split(HANDLER_ANCHOR).length !== 2) {
    throw new Error('Unread source changed: count handler anchor not found');
  }

  const subscribers = [...source.matchAll(SUBSCRIBER)];
  if (subscribers.length !== 1) {
    throw new Error('Unread source changed: subscription anchor not found');
  }

  const withTotalUnread = source.replace(HANDLER_ANCHOR, HANDLER_PATCH);
  return withTotalUnread.replace(SUBSCRIBER, (_match, managerAlias, eventAlias) =>
    `subcriberUnreadSrc(){setTimeout((()=>{const __zaloUnreadBadgeManager=${managerAlias}.a.UnreadDataManager;__zaloUnreadBadgeManager.addEventListener(${eventAlias}.b.ChangeUnreadCount,this.handleChangeUnreadCount);const ${SNAPSHOT_MARKER}=__zaloUnreadBadgeManager.getUnreadByConvIdSync("total");this.handleChangeUnreadCount({payload:{totalUnread:${SNAPSHOT_MARKER}?${SNAPSHOT_MARKER}.smsUnreadCount:0,convId:"total",curentUnreadNoMute:0}})}),100)}`
  );
}

async function main(appDir = path.join(__dirname, '..', '..', 'app')) {
  const pcDist = path.join(appDir, 'pc-dist');
  const lazyDir = path.join(pcDist, 'lazy');
  const mainBundles = fs.existsSync(pcDist)
    ? fs.readdirSync(pcDist).filter((name) => /^compact-app-pc\..*\.js$/.test(name))
    : [];
  const lazyBundles = fs.existsSync(lazyDir)
    ? fs.readdirSync(lazyDir).filter((name) => /^default-login-main-startup-shared-worker-znotification\..*\.js$/.test(name))
    : [];

  if (!mainBundles.length) throw new Error('Unread source changed: main message bundle not found');

  const files = [
    ...mainBundles.map((name) => path.join(pcDist, name)),
    ...lazyBundles.map((name) => path.join(lazyDir, name))
  ];
  const updates = files.map((file) => {
    const before = fs.readFileSync(file, 'utf8');
    return { file, before, after: patchSource(before) };
  });

  for (const { file, before, after } of updates) {
    if (after !== before) {
      fs.writeFileSync(file, after);
      logger.dim(`Patched unread badge source: ${path.basename(file)}`);
    }
  }
}

if (require.main === module) main();

module.exports = { main, patchSource };
