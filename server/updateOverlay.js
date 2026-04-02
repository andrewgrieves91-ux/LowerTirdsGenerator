export const UPDATE_OVERLAY_SCRIPT = `
(function() {
  'use strict';

  var POLL_INTERVAL = 60 * 60 * 1000;
  var state = { update: null, dismissed: false };

  function compareVersions(a, b) {
    var pa = a.replace(/^v/, '').split('.').map(Number);
    var pb = b.replace(/^v/, '').split('.').map(Number);
    for (var i = 0; i < 3; i++) {
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
  }

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
      '#lt-update-banner a.lt-btn-download, #lt-update-banner button {',
      '  border: none; border-radius: 4px; padding: 6px 14px; cursor: pointer;',
      '  font-size: 12px; font-weight: 600; margin-left: 8px; text-decoration: none; display: inline-block;',
      '}',
      '#lt-update-banner .lt-btn-download {',
      '  background: #fff; color: #155e75;',
      '}',
      '#lt-update-banner .lt-btn-download:hover { background: #e0f2fe; }',
      '#lt-update-banner .lt-btn-dismiss {',
      '  background: rgba(255,255,255,0.15); color: #fff;',
      '}',
      '#lt-update-banner .lt-btn-dismiss:hover { background: rgba(255,255,255,0.25); }',
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
      '#lt-home-logo {',
      '  width: 80px; height: 80px; border-radius: 16px;',
      '  object-fit: contain;',
      '  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4));',
      '  margin-bottom: 4px;',
      '}',
      '.lt-home-link {',
      '  color: inherit; text-decoration: none; cursor: pointer;',
      '}',
      '.lt-home-link:hover { opacity: 0.8; }',
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

  function showBanner(version, notes, downloadUrl) {
    if (state.dismissed) return;
    var banner = createBanner();
    banner.innerHTML =
      '<span class="lt-update-text">' +
        '<strong>Update available: v' + escHtml(version) + '</strong>' +
        (notes ? '<span class="lt-update-notes">' + escHtml(notes) + '</span>' : '') +
      '</span>' +
      '<a class="lt-btn-download" href="' + escAttr(downloadUrl) + '" target="_blank" rel="noopener">Download</a>' +
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

  function escAttr(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
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

  function checkForUpdate() {
    var localVersion = window.__LT_VERSION;
    var updateUrl = window.__LT_UPDATE_URL;

    if (!localVersion || !updateUrl) return Promise.resolve(null);

    return fetch(updateUrl, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    })
    .then(function(r) {
      if (!r.ok) throw new Error('GitHub API returned ' + r.status);
      return r.json();
    })
    .then(function(release) {
      var remoteVersion = (release.tag_name || '').replace(/^v/, '');
      var notes = release.body || '';
      var assets = release.assets || [];
      var asset = null;
      for (var i = 0; i < assets.length; i++) {
        if (assets[i].name.indexOf('.zip') !== -1) { asset = assets[i]; break; }
      }
      var downloadUrl = asset ? asset.browser_download_url : release.html_url;

      return {
        currentVersion: localVersion,
        remoteVersion: remoteVersion,
        notes: notes,
        downloadUrl: downloadUrl,
        hasUpdate: compareVersions(remoteVersion, localVersion) > 0
      };
    });
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
      btn.textContent = 'Checking\\u2026';
      statusEl.textContent = '';

      checkForUpdate()
        .then(function(d) {
          btn.disabled = false;
          btn.textContent = 'Check for Updates';
          if (!d) {
            statusEl.textContent = 'Update URL not configured.';
            statusEl.style.color = '#f87171';
            return;
          }
          if (d.hasUpdate) {
            statusEl.innerHTML = 'Update available: v' + escHtml(d.remoteVersion) +
              ' &mdash; <a href="' + escAttr(d.downloadUrl) + '" target="_blank" rel="noopener" style="color:#22d3ee">Download</a>';
            statusEl.style.color = '#22d3ee';
            state.update = d;
            state.dismissed = false;
            showBanner(d.remoteVersion, d.notes, d.downloadUrl);
          } else {
            statusEl.textContent = 'You are on the latest version.';
            statusEl.style.color = 'rgba(255,255,255,0.5)';
          }
        })
        .catch(function(err) {
          btn.disabled = false;
          btn.textContent = 'Check for Updates';
          statusEl.textContent = 'Network error: ' + (err.message || 'unknown');
          statusEl.style.color = '#f87171';
        });
    });
  }

  window.__ltDismissBanner = function() {
    state.dismissed = true;
    hideBanner();
  };

  function checkAndRender() {
    var localVersion = window.__LT_VERSION || '?.?.?';
    createVersionBadge(localVersion);

    checkForUpdate()
      .then(function(d) {
        if (d) {
          state.update = d;
          if (d.hasUpdate) {
            showBanner(d.remoteVersion, d.notes, d.downloadUrl);
          }
        }
      })
      .catch(function() {});
  }

  var settingsObserver = null;
  function watchForSettings() {
    if (settingsObserver) return;

    function tryInject() {
      var targets = document.querySelectorAll('[data-loc*="Settings.tsx"]');
      if (targets.length > 0) {
        if (document.getElementById('lt-settings-update')) return;
        var version = window.__LT_VERSION || '?.?.?';
        var statusText = '';
        if (state.update && state.update.hasUpdate) {
          statusText = 'Update available: v' + state.update.remoteVersion;
        }
        injectSettingsWidget(version, statusText);
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

  function isHomePage() {
    var p = location.pathname;
    return p === '/' || p === '';
  }

  function customizeHomePage() {
    if (!isHomePage()) return;
    if (document.getElementById('lt-home-logo')) return;

    var betaEl = document.querySelector('[data-loc*="StartPage.tsx:145"]');
    if (!betaEl) return;

    var version = window.__LT_VERSION || '';
    betaEl.textContent = version ? 'v' + version : '';

    var logo = document.createElement('img');
    logo.id = 'lt-home-logo';
    logo.src = '/ltg-logo.png';
    logo.alt = 'LTG';
    betaEl.parentNode.insertBefore(logo, betaEl);

    var h1 = betaEl.parentNode.querySelector('h1');
    if (h1) {
      h1.textContent = 'Lower Thirds Generator';
      var subtitle = h1.nextElementSibling;
      if (subtitle && subtitle.tagName === 'P' && /graphics\\s*generator/i.test(subtitle.textContent)) {
        subtitle.remove();
      }
    }
  }

  function makeHeaderClickable() {
    if (isHomePage()) return;
    if (document.querySelector('.lt-home-link')) return;

    var allH1 = document.querySelectorAll('h1');
    for (var i = 0; i < allH1.length; i++) {
      var h1 = allH1[i];
      if (/LOWER\\s*THIRDS\\s*GENERATOR/i.test(h1.textContent)) {
        var link = document.createElement('a');
        link.href = '/';
        link.title = 'Home Page';
        link.className = 'lt-home-link';
        while (h1.firstChild) {
          link.appendChild(h1.firstChild);
        }
        h1.appendChild(link);
        break;
      }
    }
  }

  function removeStaleInjections() {
    if (!isHomePage()) {
      var logo = document.getElementById('lt-home-logo');
      if (logo) logo.remove();
    }
    if (isHomePage()) {
      var link = document.querySelector('.lt-home-link');
      if (link) {
        var h1 = link.parentNode;
        while (link.firstChild) { h1.appendChild(link.firstChild); }
        link.remove();
      }
    }
  }

  var pageObserver = null;
  function watchForPageChanges() {
    if (pageObserver) return;

    function applyPageUI() {
      var root = document.getElementById('root');
      if (!root || !root.firstElementChild) return;
      removeStaleInjections();
      customizeHomePage();
      makeHeaderClickable();
    }

    pageObserver = new MutationObserver(function() {
      requestAnimationFrame(applyPageUI);
    });
    pageObserver.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
    applyPageUI();
  }

  function init() {
    createStyles();
    setFavicon();
    setTimeout(checkAndRender, 3000);
    watchForSettings();
    watchForPageChanges();
    setInterval(checkAndRender, POLL_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
