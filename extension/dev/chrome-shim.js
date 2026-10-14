/* YALNIZCA GELİŞTİRME / DEMO: eklentiyi yüklemeden demo OBS'de (?dev=1) çalıştırmak için chrome.* taklidi.
   Paketlenmiş eklentiye (extension.zip) GİRMEZ.
   - chrome.storage.local  -> üst pencerenin localStorage'ı ("kaDevStore:" önekiyle); onChanged tüm çerçevelere
                              BroadcastChannel ile iletilir (gerçek eklentideki gibi her çerçeve değişikliği görür).
   - chrome.runtime.sendMessage -> üst çerçevedeki "arka plan" (lib/bg-core.js KAStore.handleMessage) çağrılır.
   - arka planın notifyTop'u -> üst çerçevenin chrome.runtime.onMessage dinleyicileri.
   - chrome.runtime.getURL -> extension/ klasörünün adresi (loader.js'in konumundan). */
(function () {
  "use strict";
  if (window.__kaDevShim) return;
  window.__kaDevShim = true;
  /* test için: bu çerçevedeki yakalanmamış hatalar (window.__kaDevErrors) */
  window.__kaDevErrors = [];
  window.addEventListener("error", function (e) { window.__kaDevErrors.push(String(e.message || e)); });
  window.addEventListener("unhandledrejection", function (e) { window.__kaDevErrors.push("promise: " + String(e.reason && e.reason.message || e.reason)); });

  var TOP = window;
  try { if (window.top && window.top.location.href) TOP = window.top; } catch (e) { TOP = window; }
  var isTop = TOP === window;
  var BASE = window.__kaDevBase || new URL("../", document.currentScript ? document.currentScript.src : location.href).href;
  var PREFIX = "kaDevStore:";
  var LS = null;
  try { LS = TOP.localStorage; } catch (e) { try { LS = window.localStorage; } catch (e2) { LS = null; } }
  var mem = {};
  var storageListeners = [], msgListeners = [];
  var chan = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("ka-dev-storage") : null;

  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function read(key) {
    try { if (LS) { var v = LS.getItem(PREFIX + key); return v === null ? undefined : JSON.parse(v); } } catch (e) { /* yoksay */ }
    return clone(mem[key]);
  }
  function write(key, val) { try { if (LS) { LS.setItem(PREFIX + key, JSON.stringify(val)); return; } } catch (e) { /* yoksay */ } mem[key] = clone(val); }
  function del(key) { try { if (LS) { LS.removeItem(PREFIX + key); return; } } catch (e) { /* yoksay */ } delete mem[key]; }
  function allKeys() {
    var out = [];
    try { if (LS) { for (var i = 0; i < LS.length; i++) { var k = LS.key(i); if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length)); } return out; } } catch (e) { /* yoksay */ }
    return Object.keys(mem);
  }
  function fire(changes) {
    storageListeners.slice().forEach(function (fn) {
      try { fn(clone(changes), "local"); } catch (e) { if (window.console) console.error("[Kayıt Asistanı dev] onChanged", e); }
    });
  }
  function emit(changes) {
    if (!Object.keys(changes).length) return;
    setTimeout(function () { fire(changes); }, 0);       /* gerçek API gibi eşzamansız */
    if (chan) chan.postMessage(changes);
  }
  if (chan) chan.onmessage = function (e) { fire(e.data); };
  function done(p, cb) { if (typeof cb === "function") p.then(cb); return p; }

  var local = {
    get: function (keys, cb) {
      var out = {}, list;
      if (keys === null || keys === undefined) list = allKeys();
      else if (typeof keys === "string") list = [keys];
      else if (Array.isArray(keys)) list = keys;
      else { list = Object.keys(keys); list.forEach(function (k) { out[k] = clone(keys[k]); }); }
      list.forEach(function (k) { var v = read(k); if (v !== undefined) out[k] = v; });
      return done(Promise.resolve(out), cb);
    },
    set: function (obj, cb) {
      var changes = {};
      Object.keys(obj || {}).forEach(function (k) {
        var old = read(k); write(k, obj[k]);
        changes[k] = { oldValue: old, newValue: clone(obj[k]) };
      });
      emit(changes);
      return done(Promise.resolve(), cb);
    },
    remove: function (keys, cb) {
      var changes = {};
      (typeof keys === "string" ? [keys] : keys || []).forEach(function (k) {
        var old = read(k);
        if (old === undefined) return;
        del(k); changes[k] = { oldValue: old };
      });
      emit(changes);
      return done(Promise.resolve(), cb);
    },
    clear: function (cb) { return local.remove(allKeys(), cb); }
  };

  /* üst çerçevenin onMessage dinleyicilerine ilet (arka plan -> sekme) */
  function deliverHere(msg, sender) {
    return new Promise(function (resolve, reject) {
      if (!msgListeners.length) { reject(new Error("Could not establish connection. Receiving end does not exist.")); return; }
      var answered = false, async = false;
      function sendResponse(r) { if (!answered) { answered = true; resolve(r); } }
      msgListeners.slice().forEach(function (fn) {
        try { if (fn(clone(msg), sender, sendResponse) === true) async = true; } catch (e) { if (window.console) console.error("[Kayıt Asistanı dev] onMessage", e); }
      });
      if (!async && !answered) resolve(undefined);
    });
  }
  function waitFor(get, ms) {
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function poll() {
        var v = null;
        try { v = get(); } catch (e) { v = null; }
        if (v) resolve(v);
        else if (Date.now() - t0 > (ms || 15000)) reject(new Error("dev background not ready"));
        else setTimeout(poll, 40);
      })();
    });
  }

  /* üst çerçevede "arka plan" (service worker yerine) */
  if (isTop) {
    var api = {
      get: function (key) { return local.get(key).then(function (o) { return o[key]; }); },
      set: function (o) { return local.set(o); },
      remove: function (keys) { return local.remove(keys); },
      notifyTop: function (tabId, msg, wantReply) {
        return deliverHere(msg, { id: "dev" }).then(function (r) { return wantReply ? (r || { ok: true }) : null; },
          function () { return wantReply ? { ok: false } : null; });
      },
      activeTab: function () { return Promise.resolve(1); }
    };
    window.__kaDevBackground = {
      handle: function (msg, sender) {
        return waitFor(function () { return window.KAStore; }).then(function (S) { return S.handleMessage(msg, sender, api); });
      }
    };
  }

  function sendMessage(msg, cb) {
    var sender = { id: "dev", tab: { id: 1 }, frameId: isTop ? 0 : 1, url: location.href };
    var p = waitFor(function () { return TOP.__kaDevBackground; }).then(function (bg) { return bg.handle(clone(msg), sender); })
      .then(function (r) { return clone(r); });
    if (typeof cb === "function") p.then(cb, function () { cb(undefined); });
    return p;
  }

  var shim = {
    runtime: {
      id: "kayit-asistani-dev",
      getURL: function (p) { return BASE + String(p || "").replace(/^\//, ""); },
      sendMessage: sendMessage,
      onMessage: {
        addListener: function (fn) { msgListeners.push(fn); },
        removeListener: function (fn) { msgListeners = msgListeners.filter(function (f) { return f !== fn; }); }
      },
      getManifest: function () { return { version: "dev" }; }
    },
    storage: {
      local: local,
      onChanged: {
        addListener: function (fn) { storageListeners.push(fn); },
        removeListener: function (fn) { storageListeners = storageListeners.filter(function (f) { return f !== fn; }); }
      }
    },
    tabs: {
      create: function (o) { window.open(o && o.url, "_blank", "noopener"); return Promise.resolve({ id: 2 }); },
      query: function () { return Promise.resolve([{ id: 1, active: true }]); }
    }
  };
  try { window.chrome = shim; } catch (e) { /* yoksay */ }
  if (window.chrome !== shim) {
    try { Object.defineProperty(window, "chrome", { value: shim, configurable: true, writable: true }); }
    catch (e2) { ["runtime", "storage", "tabs"].forEach(function (k) { try { window.chrome[k] = shim[k]; } catch (e3) { /* yoksay */ } }); }
  }
})();
