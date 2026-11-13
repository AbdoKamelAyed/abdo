/* ABDO public site script.
 * Everything here is an enhancement: the site is fully readable and navigable without it.
 *   1. Light / dark / system theme toggle (remembered in localStorage when available).
 *   2. Collapsible navigation on small screens.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var STORAGE_KEY = 'abdo-theme';

  function readPreference() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch (error) {
      return 'system'; // storage blocked (private mode, strict settings): behave as "system"
    }
  }

  function savePreference(value) {
    try {
      if (value === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, value);
    } catch (error) { /* not persisted; the choice still applies to this page view */ }
  }

  function applyTheme(value) {
    if (value === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', value);
  }

  var toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    var label = toggle.querySelector('[data-theme-label]');
    var order = ['system', 'light', 'dark'];
    var current = readPreference();

    var render = function () {
      label.textContent = toggle.getAttribute('data-label-' + current);
    };

    render();
    toggle.addEventListener('click', function () {
      current = order[(order.indexOf(current) + 1) % order.length];
      applyTheme(current);
      savePreference(current);
      render();
    });
  }

  var nav = document.getElementById('site-nav');
  var navButton = document.querySelector('.nav-toggle');
  if (nav && navButton) {
    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      navButton.setAttribute('aria-expanded', String(open));
    };

    navButton.addEventListener('click', function () {
      setOpen(!nav.classList.contains('is-open'));
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        setOpen(false);
        navButton.focus();
      }
    });
  }
})();
