(function () {
  if (window.__zaloNotificationPrivacyMenuInstalled) return;
  window.__zaloNotificationPrivacyMenuInstalled = true;

  const items = [
    {
      id: 'zalo-notification-privacy-setting-item',
      flag: '__zaloHideMessageContent',
      toggleTitle: 'ZALO_TOGGLE_NOTIFICATION_PRIVACY',
      icon: '🔒',
      label: 'Ẩn nội dung tin nhắn trong thông báo',
      tooltip: 'Ẩn phần xem trước tin nhắn trong thông báo của hệ điều hành'
    },
    {
      id: 'zalo-notification-sender-setting-item',
      flag: '__zaloHideSender',
      toggleTitle: 'ZALO_TOGGLE_NOTIFICATION_SENDER',
      icon: '👤',
      label: 'Ẩn tên người gửi trong thông báo',
      tooltip: 'Thông báo chỉ hiện "Zalo – Bạn có tin nhắn mới": không tên, không ảnh đại diện, không nội dung'
    }
  ];

  function render() {
    for (const spec of items) {
      const item = document.getElementById(spec.id);
      if (!item) continue;
      const enabled = !!window[spec.flag];
      item.setAttribute('aria-checked', String(enabled));
      item.querySelector('.zalo-notification-privacy-check').hidden = !enabled;
    }
  }

  function toggle(spec) {
    const previousTitle = document.title;
    document.title = spec.toggleTitle;
    setTimeout(function () { document.title = previousTitle; }, 100);
  }

  function addMenuItems() {
    const containers = document.querySelectorAll('#setting .setting-menu');
    if (!containers.length) return;
    const container = containers[containers.length - 1];
    const reference = container.querySelector('.setting-menu__item');
    let added = false;
    for (const spec of items) {
      if (document.getElementById(spec.id)) continue;
      const item = document.createElement('div');
      item.id = spec.id;
      item.className = reference ? reference.className : 'setting-menu__item';
      item.setAttribute('role', 'menuitemcheckbox');
      item.setAttribute('tabindex', '0');
      item.title = spec.tooltip;
      item.innerHTML = '<div class="setting-menu__wrapper-content truncate">'
        + '<div class="setting-menu__icon" style="display:flex;align-items:center;justify-content:center">' + spec.icon + '</div>'
        + '<p class="setting-menu__name truncate">' + spec.label + '</p>'
        + '<span class="zalo-notification-privacy-check" aria-hidden="true">✓</span></div>';
      item.addEventListener('click', function () { toggle(spec); });
      item.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(spec); }
      });
      container.appendChild(item);
      added = true;
    }
    if (added) render();
  }

  window.addEventListener('zalo-privacy-changed', render);
  addMenuItems();
  let updateQueued = false;
  function scheduleUpdate() {
    if (updateQueued) return;
    updateQueued = true;
    requestAnimationFrame(function () {
      updateQueued = false;
      addMenuItems();
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
