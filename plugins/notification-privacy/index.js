const fs = require('fs');
const path = require('path');
const { FLAG: SENDER_FLAG, PAGE_SCRIPT } = require('./sender-privacy');

// The settings menu (inject-menu.js) asks for a toggle by briefly setting one
// of these as the page title.
const TOGGLES = {
  ZALO_TOGGLE_NOTIFICATION_PRIVACY: 'hideMessageContent',
  ZALO_TOGGLE_NOTIFICATION_SENDER: 'hideSender'
};

function register({ app, BrowserWindow }) {
  const statePath = path.join(app.getPath('userData'), 'notification-privacy.json');
  const menuScript = fs.readFileSync(path.join(__dirname, 'inject-menu.js'), 'utf8');
  const state = { hideMessageContent: false, hideSender: false };
  try {
    const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    state.hideMessageContent = saved.hideMessageContent === true;
    state.hideSender = saved.hideSender === true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Cannot read notification privacy setting:', error);
      state.hideMessageContent = true;
      state.hideSender = true;
    }
  }

  function sync(win) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.executeJavaScript(
      `window.__zaloHideMessageContent=${state.hideMessageContent};window.${SENDER_FLAG}=${state.hideSender};window.dispatchEvent(new Event('zalo-privacy-changed'));`,
      true
    ).catch((error) => console.error('Cannot sync notification privacy setting:', error));
  }

  app.on('browser-window-created', (_event, win) => {
    win.on('page-title-updated', (event, title) => {
      const key = TOGGLES[title];
      if (!key || !win.webContents.getURL().includes('/pc-dist/index.html')) return;
      event.preventDefault();
      const next = { ...state, [key]: !state[key] };
      try {
        fs.mkdirSync(path.dirname(statePath), { recursive: true });
        fs.writeFileSync(statePath + '.tmp', JSON.stringify(next), { mode: 0o600 });
        fs.renameSync(statePath + '.tmp', statePath);
        Object.assign(state, next);
        BrowserWindow.getAllWindows().forEach(sync);
      } catch (error) {
        console.error('Cannot save notification privacy setting:', error);
      }
    });

    win.webContents.on('dom-ready', () => {
      // Normally already installed from the preload; this covers windows
      // whose preload was not patched. Guarded against double-wrapping.
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.executeJavaScript(PAGE_SCRIPT, true).catch(() => {});
      }
      sync(win);
      if (win.webContents.getURL().includes('/pc-dist/index.html')) {
        win.webContents.executeJavaScript(menuScript, true).catch((error) =>
          console.error('Cannot add notification privacy setting:', error)
        );
      }
    });
  });
}

module.exports = { register };
