/** ui.js — chrome that belongs to no single panel: the language switcher, the
 * out-of-window clamp notice, and the styled replacement for native <select>.
 *
 * NOT the time readout. This module once formatted the time bar into #tc-date /
 * #tc-time, but no such elements exist — the selected event's date is written by
 * atlas.js's shu'er strip, and astronomical → historical year conversion lives in
 * atlas.js displayYear(), which reads the atlas.year.bce/ce keys and so works in
 * all seven locales. The formatters here rendered English month names regardless
 * of locale and reached nothing.
 */

const UI = (() => {
  'use strict';

  // Endonyms for the switcher: every language names itself, in its own script, so
  // the list is readable to the reader looking for their own row. zh-Hant is
  // therefore written 繁體 in traditional characters, not 繁体 in simplified.
  const LANG_NAMES = {
    'zh-Hans': '简体中文',
    'zh-Hant': '繁體中文',
    en: 'English',
    fr: 'Français',
    es: 'Español',
    it: 'Italiano',
    ja: '日本語',
  };

  // ---- Out-of-window notice ----
  // TimeState.onRangeClamp fires whenever a requested time is redirected onto
  // the service-window boundary (−3000…1999). Surface a brief notice so the
  // reader understands why the clock landed on the edge. Text is read fresh
  // from i18n each time (survives a mid-session locale switch); the fade timer
  // is single-shot and restarts on repeated clamps.
  let _clampTimer = null;
  function _showClampHint() {
    const el = document.getElementById('range-clamp-hint');
    if (!el) return;
    el.textContent = typeof I18n !== 'undefined' && I18n.t ? I18n.t('time.clamped_to_range') : '';
    el.hidden = false;
    // Reflow between removing and re-adding .show so a repeat clamp re-triggers
    // the CSS fade-in from the top rather than freezing mid-transition.
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    if (_clampTimer) clearTimeout(_clampTimer);
    _clampTimer = setTimeout(() => {
      el.classList.remove('show');
      _clampTimer = setTimeout(() => {
        el.hidden = true;
      }, 400);
    }, 2800);
  }

  // ---- Language switcher (i18n.js is already vendored; this is just the UI) ----
  function populateLangDropdown() {
    if (typeof I18n === 'undefined') return;
    const sel = document.getElementById('lang-select');
    if (!sel) return;
    const cur = I18n.getLocale();
    sel.innerHTML = '';
    I18n.SUPPORTED.forEach((loc) => {
      const opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = LANG_NAMES[loc] || loc;
      if (loc === cur) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function _wireLang() {
    if (typeof I18n === 'undefined') return;
    const sel = document.getElementById('lang-select');
    populateLangDropdown();
    if (sel) sel.addEventListener('change', () => I18n.setLocale(sel.value));
    // Re-render keyed DOM + dropdown on every switch.
    I18n.subscribe(() => {
      I18n.applyDOM();
      populateLangDropdown();
    });
  }

  // Replace each .iconselect's native OS popup with a styled custom panel.
  // The hidden <select> is kept as the event hub; basemaps.js / ui.js wire
  // 'change' on it unchanged. MutationObserver re-syncs the list when
  // populateLayerSelect() re-fills it (e.g. after OHM late-registers).
  function wrapIconSelect(container) {
    const sel = container.querySelector('select');
    if (!sel || container.dataset.wrapped) return;
    container.dataset.wrapped = '1';
    sel.style.display = 'none';
    container.setAttribute('tabindex', '0');

    const panel = document.createElement('ul');
    panel.className = 'isel-panel';
    panel.setAttribute('role', 'listbox');
    panel.hidden = true;
    container.appendChild(panel);

    function syncPanel() {
      panel.innerHTML = '';
      Array.from(sel.options).forEach((opt) => {
        const li = document.createElement('li');
        li.className = 'isel-item';
        li.setAttribute('role', 'option');
        if (opt.selected) li.setAttribute('aria-selected', 'true');
        li.textContent = opt.textContent;
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          panel.hidden = true;
          container.classList.remove('isel-open');
          panel.querySelectorAll('[aria-selected]').forEach((el) => el.removeAttribute('aria-selected'));
          li.setAttribute('aria-selected', 'true');
        });
        panel.appendChild(li);
      });
    }

    syncPanel();
    new MutationObserver(syncPanel).observe(sel, { childList: true });

    container.addEventListener('click', (e) => {
      if (e.target === sel) return; // skip synthetic click bubbled from <label>→<select>
      const opening = panel.hidden;
      document.querySelectorAll('.isel-panel').forEach((p) => {
        p.hidden = true;
      });
      document.querySelectorAll('.iconselect').forEach((c) => c.classList.remove('isel-open'));
      if (opening) {
        panel.hidden = false;
        container.classList.add('isel-open');
      }
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        panel.hidden = true;
        container.classList.remove('isel-open');
      }
    });

    container.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        panel.hidden = true;
        container.classList.remove('isel-open');
      } else if (e.key === 'Enter' || e.key === ' ') {
        container.click();
        e.preventDefault();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (panel.hidden) {
          panel.hidden = false;
          container.classList.add('isel-open');
        }
        const items = [...panel.querySelectorAll('.isel-item')];
        const cur = panel.querySelector('[aria-selected="true"]');
        const idx = cur ? items.indexOf(cur) : -1;
        const next = e.key === 'ArrowDown' ? items[idx + 1] || items[0] : items[idx - 1] || items[items.length - 1];
        if (next) next.click();
        e.preventDefault();
      }
    });
  }

  function init() {
    try {
      TimeState.setTimezone('UTC');
    } catch (e) {
      /* noop */
    }
    _wireLang();
    if (TimeState.onRangeClamp) TimeState.onRangeClamp(_showClampHint);
    document.querySelectorAll('.iconselect').forEach(wrapIconSelect);
  }

  return { init, populateLangDropdown };
})();
window.UI = UI;
