'use strict';

// "Hide sender" option: every notification becomes title "Zalo", body
// GENERIC_BODY, with no avatar. The sender's name lives in the notification
// title (and the avatar in its icon), which Zalo builds somewhere its
// minified bundles don't expose a stable anchor for, so PAGE_SCRIPT works at
// the display layer instead: it wraps window.Notification in the page
// (installed early from Zalo's preloads by patch-notification-sender.js, and
// again on dom-ready as a fallback) and reads window.__zaloHideSender at
// construction time.
//
// Main-process notifications can't be covered the same way: Electron's
// Notification export is a non-configurable getter and show/title/body are
// per-instance properties, so neither the class nor its prototype can be
// wrapped. patch-notification-sender.js warns at build time if Zalo's main
// process ever starts creating notifications itself.

const FLAG = '__zaloHideSender';
const GENERIC_TITLE = 'Zalo';
const GENERIC_BODY = 'Bạn có tin nhắn mới';

const PAGE_SCRIPT = `(function () {
  if (typeof window === "undefined" || window.__zaloSenderPrivacyInstalled || typeof window.Notification !== "function") return;
  window.__zaloSenderPrivacyInstalled = true;
  var Original = window.Notification;
  var proxy = new Proxy(Original, {
    construct: function (target, args, newTarget) {
      if (window.${FLAG} === true) {
        var options = Object.assign({}, args[1] || {});
        options.body = ${JSON.stringify(GENERIC_BODY)};
        delete options.icon;
        delete options.image;
        delete options.badge;
        args = [${JSON.stringify(GENERIC_TITLE)}, options];
      }
      return Reflect.construct(target, args, newTarget === proxy ? target : newTarget);
    }
  });
  window.Notification = proxy;
})();`;

module.exports = { FLAG, GENERIC_TITLE, GENERIC_BODY, PAGE_SCRIPT };
