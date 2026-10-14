/* YALNIZCA GELİŞTİRME / DEMO: demo OBS sayfaları ?dev=1 ile açıldığında bu dosyayı yükler.
   Eklentiyi kurmadan aynı deneyimi verir:
   1) dev/chrome-shim.js (chrome.* taklidi) kurulur; üst çerçevede ayrıca lib/bg-core.js ("arka plan") yüklenir,
   2) manifest.json'daki content_scripts[0].js listesi AYNI SIRAYLA yüklenir.
   Dosya yolları bu betiğin kendi adresine göredir (…/extension/dev/loader.js -> …/extension/). */
(function () {
  "use strict";
  if (window.__kaDevLoader) return;
  window.__kaDevLoader = true;
  var me = document.currentScript;
  var src = me && me.src ? me.src : new URL("extension/dev/loader.js", location.href).href;
  var base = src.replace(/dev\/loader\.js(?:[?#].*)?$/, "");
  window.__kaDevBase = base;
  var isTop = window.top === window;
  var bust = String(Date.now());

  function load(path) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = base + path + "?v=" + bust;   /* demo güncellenince eski dosyalar önbellekten gelmesin */
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("yüklenemedi: " + path)); };
      (document.head || document.documentElement).appendChild(s);
    });
  }
  function seq(list) { return list.reduce(function (p, f) { return p.then(function () { return load(f); }); }, Promise.resolve()); }

  fetch(base + "manifest.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (m) {
    var js = (m.content_scripts && m.content_scripts[0] && m.content_scripts[0].js) || [];
    return seq(["dev/chrome-shim.js"].concat(isTop ? ["lib/bg-core.js"] : [])).then(function () { return seq(js); });
  }).catch(function (e) { if (window.console) console.error("[Kayıt Asistanı dev]", e); });
})();
