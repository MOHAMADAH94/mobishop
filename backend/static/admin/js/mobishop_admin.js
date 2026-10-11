(function () {
  'use strict';

  document.documentElement.classList.add('mobishop-admin');

  function ensureRtl() {
    var lang = (document.documentElement.lang || '').toLowerCase();
    if (lang.indexOf('ar') === 0 || document.body.classList.contains('rtl')) {
      document.documentElement.setAttribute('dir', 'rtl');
    }
  }

  function enhanceSelects(root) {
    var scope = root || document;
    var selects = scope.querySelectorAll('select');
    selects.forEach(function (el) {
      if (el.dataset.mobishopSelectReady === '1') return;
      el.dataset.mobishopSelectReady = '1';
      el.classList.add('mobishop-select');
      el.addEventListener('focus', function () {
        el.style.outline = 'none';
      });
    });
  }

  function enhanceNavFilter() {
    var navFilter = document.getElementById('nav-filter');
    if (navFilter && !navFilter.getAttribute('placeholder')) {
      navFilter.setAttribute('placeholder', 'بحث في القوائم…');
    }
  }

  function boot() {
    ensureRtl();
    enhanceNavFilter();
    enhanceSelects(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('formset:added', function (e) {
    enhanceSelects(e.target || document);
  });

  if (window.MutationObserver) {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) enhanceSelects(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
