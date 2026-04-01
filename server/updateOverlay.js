export const UPDATE_OVERLAY_SCRIPT = `
(function() {
  'use strict';

  var POLL_INTERVAL = 60 * 60 * 1000; // re-check every hour
  var state = { update: null, dismissed: false };

  function createStyles() {
    var style = document.createElement('style');
    style.textContent = [
      '#lt-update-banner {',
      '  position: fixed; top: 0; left: 0; right: 0; z-index: 99999;',
      '  background: linear-gradient(135deg, #0e7490 0%, #155e75 100%);',
      '  color: #fff; padding: 10px 20px;',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);',
      '  transform: translateY(-100%); transition: transform 0.3s ease;',
      '}',
      '#lt-update-banner.lt-visible { transform: translateY(0); }',
      '#lt-update-banner .lt-update-text { flex: 1; }',
      '#lt-update-banner .lt-update-notes { opacity: 0.8; margin-left: 12px; font-size: 12px; }',
      '#lt-update-banner button {',
      '  border: none; border-radius: 4px; padding: 6px 14px; cursor: pointer;',
      '  font-size: 12px; font-weight: 600; margin-left: 8px;',
      '}',
      '#lt-update-banner .lt-btn-apply {',
      '  background: #fff; color: #155e75;',
      '}',
      '#lt-update-banner .lt-btn-apply:hover { background: #e0f2fe; }',
      '#lt-update-banner .lt-btn-dismiss {',
      '  background: rgba(255,255,255,0.15); color: #fff;',
      '}',
      '#lt-update-banner .lt-btn-dismiss:hover { background: rgba(255,255,255,0.25); }',
      '#lt-update-banner .lt-btn-applying {',
      '  background: rgba(255,255,255,0.2); color: #fff; cursor: wait;',
      '}',
      '#lt-version-badge {',
      '  position: fixed; bottom: 8px; right: 12px; z-index: 99998;',
      '  font-family: "IBM Plex Mono", monospace; font-size: 11px;',
      '  color: rgba(255,255,255,0.25); pointer-events: none;',
      '  user-select: none;',
      '}',
      '#lt-settings-update {',
      '  background: rgba(6, 182, 212, 0.08); border: 1px solid rgba(6, 182, 212, 0.2);',
      '  border-radius: 8px; padding: 16px; margin-bottom: 16px;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '}',
      '#lt-settings-update h4 {',
      '  font-size: 11px; font-weight: 700; color: #22d3ee;',
      '  letter-spacing: 0.05em; margin: 0 0 10px 0; text-transform: uppercase;',
      '}',
      '#lt-settings-update .lt-ver-row {',
      '  display: flex; align-items: center; gap: 12px;',
      '  font-size: 13px; color: rgba(255,255,255,0.7); margin-bottom: 8px;',
      '}',
      '#lt-settings-update .lt-ver-label { font-weight: 600; color: rgba(255,255,255,0.9); }',
      '#lt-settings-update .lt-check-btn {',
      '  background: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.3);',
      '  color: #22d3ee; padding: 6px 14px; border-radius: 4px;',
      '  font-size: 12px; font-weight: 600; cursor: pointer;',
      '}',
      '#lt-settings-update .lt-check-btn:hover {',
      '  background: rgba(6, 182, 212, 0.25);',
      '}',
      '#lt-settings-update .lt-check-btn:disabled {',
      '  opacity: 0.5; cursor: not-allowed;',
      '}',
      '#lt-settings-update .lt-status-msg {',
      '  font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 6px;',
      '}',
      '#lt-app-logo {',
      '  width: 64px; height: 64px; border-radius: 14px;',
      '  object-fit: contain; flex-shrink: 0;',
      '  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4));',
      '}',
      '#lt-logo-header {',
      '  display: flex; align-items: center; gap: 14px;',
      '  padding: 16px 0 8px 0;',
      '}',
      '#lt-logo-header .lt-logo-title {',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  font-size: 18px; font-weight: 700; color: rgba(255,255,255,0.9);',
      '  letter-spacing: -0.01em; line-height: 1.2;',
      '}',
      '#lt-logo-header .lt-logo-subtitle {',
      '  font-family: "IBM Plex Mono", monospace;',
      '  font-size: 11px; color: rgba(255,255,255,0.35);',
      '  margin-top: 2px;',
      '}',
    ].join('\\n');
    document.head.appendChild(style);
  }

  function createBanner() {
    var banner = document.getElementById('lt-update-banner');
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'lt-update-banner';
    document.body.appendChild(banner);
    return banner;
  }

  function showBanner(data) {
    if (state.dismissed) return;
    var banner = createBanner();
    var notes = data.manifest && data.manifest.notes ? data.manifest.notes : '';
    banner.innerHTML =
      '<span class="lt-update-text">' +
        '<strong>Update available: v' + escHtml(data.availableVersion) + '</strong>' +
        (notes ? '<span class="lt-update-notes">' + escHtml(notes) + '</span>' : '') +
      '</span>' +
      '<button class="lt-btn-apply" onclick="window.__ltApplyUpdate()">Download &amp; Install</button>' +
      '<button class="lt-btn-dismiss" onclick="window.__ltDismissBanner()">Dismiss</button>';
    requestAnimationFrame(function() {
      banner.classList.add('lt-visible');
    });
  }

  function hideBanner() {
    var banner = document.getElementById('lt-update-banner');
    if (banner) {
      banner.classList.remove('lt-visible');
      setTimeout(function() { banner.remove(); }, 300);
    }
  }

  function showApplying() {
    var banner = createBanner();
    banner.innerHTML =
      '<span class="lt-update-text"><strong>Installing update\u2026</strong> Please wait.</span>' +
      '<button class="lt-btn-applying" disabled>Installing\u2026</button>';
    banner.classList.add('lt-visible');
  }

  function showRestart() {
    var banner = createBanner();
    banner.innerHTML =
      '<span class="lt-update-text"><strong>Update installed!</strong> Please restart the application to use the new version.</span>' +
      '<button class="lt-btn-apply" onclick="location.reload()">Reload Now</button>';
    banner.classList.add('lt-visible');
  }

  function showError(msg) {
    var banner = createBanner();
    banner.innerHTML =
      '<span class="lt-update-text"><strong>Update failed:</strong> ' + escHtml(msg) + '</span>' +
      '<button class="lt-btn-dismiss" onclick="window.__ltDismissBanner()">Dismiss</button>';
    banner.classList.add('lt-visible');
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function createVersionBadge(version) {
    var badge = document.getElementById('lt-version-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'lt-version-badge';
      document.body.appendChild(badge);
    }
    badge.textContent = 'v' + version;
  }

  function injectSettingsWidget(version, statusText) {
    var existing = document.getElementById('lt-settings-update');
    if (existing) existing.remove();

    var targets = document.querySelectorAll('[data-loc*="Settings.tsx"]');
    if (targets.length === 0) return;

    var settingsContainer = null;
    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      if (el.tagName === 'DIV' && el.children.length > 2) {
        settingsContainer = el;
        break;
      }
    }
    if (!settingsContainer) {
      settingsContainer = targets[0].closest('div[class*="space-y"]') || targets[0].parentElement;
    }
    if (!settingsContainer) return;

    var widget = document.createElement('div');
    widget.id = 'lt-settings-update';
    widget.innerHTML =
      '<h4>App Version &amp; Updates</h4>' +
      '<div class="lt-ver-row">' +
        '<span class="lt-ver-label">Current Version:</span>' +
        '<span>v' + escHtml(version) + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<button class="lt-check-btn" id="lt-check-btn">Check for Updates</button>' +
        '<span class="lt-status-msg" id="lt-settings-status">' + (statusText || '') + '</span>' +
      '</div>';

    settingsContainer.insertBefore(widget, settingsContainer.firstChild);

    document.getElementById('lt-check-btn').addEventListener('click', function() {
      var btn = this;
      var statusEl = document.getElementById('lt-settings-status');
      btn.disabled = true;
      btn.textContent = 'Checking\u2026';
      statusEl.textContent = '';

      fetch('/api/update/check')
        .then(function(r) { return r.json(); })
        .then(function(d) {
          btn.disabled = false;
          btn.textContent = 'Check for Updates';
          if (d.status === 'available') {
            statusEl.textContent = 'Update available: v' + d.availableVersion;
            statusEl.style.color = '#22d3ee';
            state.update = d;
            state.dismissed = false;
            showBanner(d);
          } else if (d.status === 'up-to-date') {
            statusEl.textContent = 'You are on the latest version.';
            statusEl.style.color = 'rgba(255,255,255,0.5)';
          } else if (d.error) {
            statusEl.textContent = 'Error: ' + d.error;
            statusEl.style.color = '#f87171';
          }
        })
        .catch(function(err) {
          btn.disabled = false;
          btn.textContent = 'Check for Updates';
          statusEl.textContent = 'Network error';
          statusEl.style.color = '#f87171';
        });
    });
  }

  window.__ltDismissBanner = function() {
    state.dismissed = true;
    hideBanner();
  };

  window.__ltApplyUpdate = function() {
    showApplying();
    fetch('/api/update/apply', { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.status === 'restart-required') {
          showRestart();
        } else if (d.error) {
          showError(d.error);
        }
      })
      .catch(function(err) {
        showError(err.message || 'Network error');
      });
  };

  function checkAndRender() {
    fetch('/api/update/check')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        state.update = d;
        createVersionBadge(d.currentVersion || '?.?.?');
        updateLogoVersion();
        if (d.status === 'available') {
          showBanner(d);
        }
      })
      .catch(function() {});
  }

  var settingsObserver = null;
  function watchForSettings() {
    if (settingsObserver) return;
    var lastVersion = null;

    function tryInject() {
      var targets = document.querySelectorAll('[data-loc*="Settings.tsx"]');
      if (targets.length > 0 && state.update && state.update.currentVersion) {
        if (lastVersion !== state.update.currentVersion) {
          lastVersion = state.update.currentVersion;
        }
        var statusText = '';
        if (state.update.status === 'available') {
          statusText = 'Update available: v' + state.update.availableVersion;
        } else if (state.update.status === 'up-to-date') {
          statusText = 'Up to date';
        }
        injectSettingsWidget(state.update.currentVersion, statusText);
      } else {
        var existing = document.getElementById('lt-settings-update');
        if (existing) existing.remove();
      }
    }

    settingsObserver = new MutationObserver(function() {
      requestAnimationFrame(tryInject);
    });
    settingsObserver.observe(document.body, { childList: true, subtree: true });
  }

  function setFavicon() {
    var existing = document.querySelector('link[rel="icon"]');
    if (existing) existing.remove();
    var link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = '/ltg-logo.png';
    document.head.appendChild(link);
  }

  function injectLogo() {
    if (document.getElementById('lt-logo-header')) return;

    var root = document.getElementById('root');
    if (!root || !root.firstElementChild) return;

    var appShell = root.firstElementChild;
    var sidebar = appShell.querySelector('nav, aside, [class*="sidebar"], [class*="Sidebar"]');
    var target = sidebar || appShell;

    var header = document.createElement('div');
    header.id = 'lt-logo-header';
    header.innerHTML =
      '<img id="lt-app-logo" src="/ltg-logo.png" alt="LTG" />' +
      '<div>' +
        '<div class="lt-logo-title">Lower Thirds<br>Generator</div>' +
        '<div class="lt-logo-subtitle" id="lt-logo-version"></div>' +
      '</div>';

    if (target.firstChild) {
      target.insertBefore(header, target.firstChild);
    } else {
      target.appendChild(header);
    }
  }

  function updateLogoVersion() {
    var el = document.getElementById('lt-logo-version');
    if (el && state.update && state.update.currentVersion) {
      el.textContent = 'v' + state.update.currentVersion;
    }
  }

  var logoObserver = null;
  function watchForApp() {
    if (logoObserver) return;
    function tryLogo() {
      var root = document.getElementById('root');
      if (root && root.firstElementChild) {
        injectLogo();
        updateLogoVersion();
      }
    }
    logoObserver = new MutationObserver(function() {
      requestAnimationFrame(tryLogo);
    });
    logoObserver.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
    tryLogo();
  }

  function init() {
    createStyles();
    setFavicon();
    checkAndRender();
    watchForSettings();
    watchForApp();
    setInterval(checkAndRender, POLL_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
