(function () {
  if (window.__zaloNotificationPrivacyMenuInstalled) return;
  window.__zaloNotificationPrivacyMenuInstalled = true;

  const id = 'zalo-notification-privacy-setting-item';

  function render() {
    const item = document.getElementById(id);
    if (!item) return;
    const enabled = !!window.__zaloHideMessageContent;
    item.setAttribute('aria-checked', String(enabled));
    item.querySelector('.zalo-notification-privacy-check').hidden = !enabled;
  }

  function toggle() {
    const previousTitle = document.title;
    document.title = 'ZALO_TOGGLE_NOTIFICATION_PRIVACY';
    setTimeout(function () { document.title = previousTitle; }, 100);
  }

  function addMenuItem() {
    if (document.getElementById(id)) return;
    const containers = document.querySelectorAll('#setting .setting-menu');
    if (!containers.length) return;
    const container = containers[containers.length - 1];
    const reference = container.querySelector('.setting-menu__item');
    const item = document.createElement('div');
    item.id = id;
    item.className = reference ? reference.className : 'setting-menu__item';
    item.setAttribute('role', 'menuitemcheckbox');
    item.setAttribute('tabindex', '0');
    item.title = 'Ẩn phần xem trước tin nhắn trong thông báo của hệ điều hành';
    item.innerHTML = '<div class="setting-menu__wrapper-content truncate">'
      + '<div class="setting-menu__icon" style="display:flex;align-items:center;justify-content:center">🔒</div>'
      + '<p class="setting-menu__name truncate">Ẩn nội dung tin nhắn trong thông báo</p>'
      + '<span class="zalo-notification-privacy-check" aria-hidden="true">✓</span></div>';
    item.addEventListener('click', toggle);
    item.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
    });
    container.appendChild(item);
    render();
  }

  window.addEventListener('zalo-privacy-changed', render);
  addMenuItem();
  let updateQueued = false;
  function scheduleUpdate() {
    if (updateQueued) return;
    updateQueued = true;
    requestAnimationFrame(function () {
      updateQueued = false;
      addMenuItem();
    });
  }
  const observer = new MutationObserver(function (mutations) {
    for (const mutation of mutations) {
      const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      if (target && target.closest && target.closest('#setting .setting-menu')) {
        scheduleUpdate();
        return;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if ((node.matches && node.matches('#setting, #setting .setting-menu')) ||
            (node.querySelector && node.querySelector('#setting .setting-menu'))) {
          scheduleUpdate();
          return;
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
