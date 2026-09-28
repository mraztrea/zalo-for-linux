'use strict';

const DBUS_OBJECT_PATH = '/com/canonical/Unity/LauncherEntry';
const DBUS_INTERFACE = 'com.canonical.Unity.LauncherEntry';
const BADGE_REPLAY_INTERVAL_MS = 5000;

function register({ app, ipcMain, tray, iconPath, unreadIconPath, dbus: dbusModule, desktopFile }) {
  if (process.platform !== 'linux') return;

  let dbus = dbusModule;
  let bus;
  try {
    dbus = dbus || require('dbus-next');
    bus = dbus.sessionBus();
    if (bus.on) bus.on('error', (error) => console.warn('Taskbar badge D-Bus error:', error.message));
  } catch (error) {
    console.warn('Taskbar badge D-Bus unavailable:', error.message);
  }

  try {
    if (app && app.setDesktopName) app.setDesktopName('zalo');
  } catch (_) {}

  const appDesktopFile = normalizeDesktopFile(desktopFile || process.env.ZALO_DESKTOP_FILE || 'zalo.desktop');
  let lastCount = null;
  let replayTimer = null;

  const setCount = (rawCount) => {
    const count = normalizeCount(rawCount);
    if (count === lastCount) return;
    lastCount = count;

    try {
      if (app && app.setBadgeCount) app.setBadgeCount(count);
    } catch (_) {}

    try {
      if (tray) tray.setImage(count > 0 ? unreadIconPath : iconPath);
    } catch (_) {}

    if (bus && dbus) {
      publishTaskbarBadge(bus, dbus, appDesktopFile, count);
      if (count > 0 && !replayTimer) {
        replayTimer = setInterval(() => {
          if (lastCount > 0) publishTaskbarBadge(bus, dbus, appDesktopFile, lastCount);
        }, BADGE_REPLAY_INTERVAL_MS);
        replayTimer.unref?.();
      } else if (count === 0 && replayTimer) {
        clearInterval(replayTimer);
        replayTimer = null;
      }
    }
  };

  ipcMain.on('badge-count', (_event, rawCount) => setCount(rawCount));
  app.on('before-quit', () => setCount(0));
  setCount(0);

  return { setCount };
}

function publishTaskbarBadge(bus, dbus, desktopFile, count) {
  try {
    const message = new dbus.Message({
      type: dbus.MessageType.SIGNAL,
      path: DBUS_OBJECT_PATH,
      interface: DBUS_INTERFACE,
      member: 'Update',
      signature: 'sa{sv}',
      body: [
        `application://${desktopFile}`,
        {
          count: new dbus.Variant('x', BigInt(count)),
          'count-visible': new dbus.Variant('b', count > 0)
        }
      ]
    });

    Promise.resolve(bus.send(message)).catch((error) => {
      console.warn('Taskbar badge D-Bus send failed:', error.message);
    });
  } catch (error) {
    console.warn('Taskbar badge D-Bus send failed:', error.message);
  }
}

function normalizeCount(rawCount) {
  const count = Number(rawCount);
  if (!Number.isSafeInteger(count) || count < 0) return 0;
  return Math.min(count, 9999);
}

function normalizeDesktopFile(name) {
  const file = String(name || '').trim().replace(/^application:\/\//, '').split(/[\\/]/).pop();
  if (!file) return 'zalo.desktop';
  return file.endsWith('.desktop') ? file : `${file}.desktop`;
}

module.exports = {
  register,
  _private: { normalizeCount, normalizeDesktopFile, publishTaskbarBadge, BADGE_REPLAY_INTERVAL_MS }
};
