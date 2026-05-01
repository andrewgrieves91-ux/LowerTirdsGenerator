// decklink-overlay.client.js
//
// Server-injected client overlay that bridges the renderer's Live page
// "screen selector" dropdowns to the native DeckLink output exposed by
// electron/decklinkOutput.cjs.
//
// The renderer ships as a pre-built minified bundle. The companion patch
// `patches/patch-live-decklink-selector.cjs` injects a small number of
// hooks into Live.tsx's selector + popup logic; this file owns the
// runtime state behind those hooks.
//
// Hooks the patch installs:
//
//   le.map((V,ye)=>...)
//     → (le.concat(window.__ltDecklinkOutputs||[])).map((V,ye)=>...)
//   le[De] (Feed 1 popup) / le[Ie] (Filter 1 popup)
//     → (le.concat(window.__ltDecklinkOutputs||[]))[De|Ie]
//   onValueChange:V=>Ce(parseInt(V)) (Feed 1)
//     → onValueChange:V=>{var __ltN=parseInt(V);Ce(__ltN);
//          if(window.__ltDecklinkOnSelect)
//            window.__ltDecklinkOnSelect('feed1',__ltN,le.length);}
//   …same for Ie/He → 'filter1'.
//
// What this file does:
//
//   • Polls ltElectron.decklink.enumerate() (and listens to
//     onDevicesChanged) to keep window.__ltDecklinkOutputs current.
//   • Tracks the currently-selected DeckLink output per source in
//     window.__ltDecklinkSelected.
//   • Monkey-patches window.open so that when the page does
//     window.open('/feed1', 'feed1', …) and a DeckLink output is the
//     currently-selected target for that source, we intercept and call
//     ltElectron.decklink.start(deviceId, source) instead. We return a
//     stub window object so the page's existing closed-flag polling
//     loop sees the output as "open" and lights the green Pop Out
//     tally.

(function () {
  'use strict';

  // Bail cleanly if not running under Electron — DeckLink only works in the
  // packaged desktop app.
  if (typeof window === 'undefined') return;
  if (!window.ltElectron || !window.ltElectron.decklink) return;
  if (window.__ltDecklinkOverlayInstalled) return;
  window.__ltDecklinkOverlayInstalled = true;

  var SOURCES = ['feed1', 'filter1'];

  // Public state read by the patched bundle.
  // Each entry must be shaped to satisfy the existing renderer code which
  // template-literals `left=${ye.left},top=${ye.top},width=${ye.width},height=${ye.height}`
  // when calling window.open. We supply zero values so the resulting
  // features string is well-formed; window.open is intercepted before the
  // window is actually created.
  window.__ltDecklinkOutputs = [];
  window.__ltDecklinkSelected = { feed1: null, filter1: null };

  // Internal: stub window objects we returned to the page from window.open.
  // Keyed by source so we can flip .closed=true if the device disappears
  // and the page's setInterval polling can light the tally back to default.
  var stubs = { feed1: null, filter1: null };

  function makeStub(source, deviceId) {
    var s = {
      closed: false,
      __decklink: { source: source, deviceId: deviceId },
      close: function () {
        if (s.closed) return;
        s.closed = true;
        try {
          window.ltElectron.decklink.stop(deviceId).catch(function () {});
        } catch (_e) {}
        if (stubs[source] === s) stubs[source] = null;
      },
      focus: function () {},
      blur: function () {},
      postMessage: function () {},
      addEventListener: function () {},
      removeEventListener: function () {},
      // The page reads .opener occasionally; null is safe.
      opener: null,
    };
    return s;
  }

  function refreshOutputs(devices) {
    if (!Array.isArray(devices)) devices = [];
    var out = [];
    for (var i = 0; i < devices.length; i++) {
      var d = devices[i];
      if (!d || !d.supportsOutput) continue;
      var label = 'DeckLink Out ' + (i + 1);
      if (d.displayName) {
        // Friendlier label: prefer "DeckLink Duo (1)" → "DeckLink Out 1"
        // when the SDK display name encodes a sub-device index, otherwise
        // fall back to the device's own display name.
        var m = /\(([0-9]+)\)\s*$/.exec(d.displayName);
        label = m ? 'DeckLink Out ' + m[1] : d.displayName;
      }
      out.push({
        label: label,
        deviceId: d.deviceId,
        modelName: d.modelName || '',
        isDeckLink: true,
        left: 0, top: 0, width: 0, height: 0,
      });
    }
    window.__ltDecklinkOutputs = out;

    // If our stubs reference a deviceId that no longer exists, mark them
    // closed so the page's polling tally turns off.
    var present = {};
    for (var j = 0; j < out.length; j++) present[out[j].deviceId] = true;
    SOURCES.forEach(function (src) {
      if (window.__ltDecklinkSelected[src] && !present[window.__ltDecklinkSelected[src]]) {
        window.__ltDecklinkSelected[src] = null;
      }
      if (stubs[src] && !present[stubs[src].__decklink.deviceId]) {
        stubs[src].closed = true;
        stubs[src] = null;
      }
    });
  }

  // The bundle's patched onValueChange calls into here. `idx` is the
  // index in the merged `[…le, …__ltDecklinkOutputs]` array; if it's >=
  // `displayCount` it points at a DeckLink entry.
  window.__ltDecklinkOnSelect = function (source, idx, displayCount) {
    if (SOURCES.indexOf(source) === -1) return;
    if (typeof idx !== 'number' || isNaN(idx)) idx = 0;
    if (typeof displayCount !== 'number' || displayCount < 0) displayCount = 0;
    if (idx >= displayCount) {
      var dlIdx = idx - displayCount;
      var dl = (window.__ltDecklinkOutputs || [])[dlIdx];
      window.__ltDecklinkSelected[source] = dl ? dl.deviceId : null;
    } else {
      window.__ltDecklinkSelected[source] = null;
    }
  };

  // Monkey-patch window.open so the existing ls()/Sn() code paths route
  // to DeckLink without us having to re-author them.
  var origOpen = window.open.bind(window);
  window.open = function (url, target, features) {
    try {
      var source = null;
      if (url === '/feed1' || target === 'feed1' || target === 'lt-popout-feed1') source = 'feed1';
      else if (url === '/filter1' || target === 'filter1' || target === 'lt-popout-filter1') source = 'filter1';

      if (source) {
        var deviceId = window.__ltDecklinkSelected[source];
        if (deviceId) {
          // Close any prior stub for this source (the user clicked Pop
          // Out twice or switched targets without going through Close All).
          if (stubs[source] && !stubs[source].closed) {
            try { stubs[source].close(); } catch (_e) {}
          }
          var stub = makeStub(source, deviceId);
          stubs[source] = stub;
          // Fire-and-forget the start call; if it fails we mark the stub
          // closed so the page's tally never lights up.
          window.ltElectron.decklink.start(deviceId, source).then(function (res) {
            if (!res || !res.ok) {
              if (stubs[source] === stub) stubs[source] = null;
              stub.closed = true;
              console.error('[decklink-overlay] start failed:', res && res.error);
            } else {
              console.log('[decklink-overlay] started ' + source + ' -> ' + deviceId);
            }
          }).catch(function (err) {
            if (stubs[source] === stub) stubs[source] = null;
            stub.closed = true;
            console.error('[decklink-overlay] start error:', err);
          });
          return stub;
        }
      }
    } catch (err) {
      console.error('[decklink-overlay] window.open hook error:', err);
    }
    return origOpen.apply(window, arguments);
  };

  // Initial enumerate + ongoing change feed.
  function initialPoll() {
    try {
      window.ltElectron.decklink.enumerate().then(refreshOutputs).catch(function () {});
    } catch (_e) {}
  }
  initialPoll();

  try {
    window.ltElectron.decklink.onDevicesChanged(function (devices) {
      refreshOutputs(devices);
    });
  } catch (_e) {}

  // Belt-and-braces re-poll every 5 s in case the IPC event was missed
  // during a page-route change.
  setInterval(initialPoll, 5000);
})();
