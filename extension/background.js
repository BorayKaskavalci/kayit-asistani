/* Kayıt Asistanı - service worker (Manifest V3).
   Görevi: çerçevelerden gelen ayrıştırılmış OBS verisini chrome.storage.local'a sırayla yazmak ve
   üst çerçevedeki panele "veri alındı" bildirmek. OBS'ye veya başka bir yere ağ isteği YAPMAZ. */
importScripts("lib/bg-core.js");

var api = {
  get: function (key) { return chrome.storage.local.get(key).then(function (o) { return o[key]; }); },
  set: function (o) { return chrome.storage.local.set(o); },
  remove: function (keys) { return chrome.storage.local.remove(keys); },
  notifyTop: function (tabId, msg, wantReply) {
    return chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }).then(function (r) { return wantReply ? (r || { ok: true }) : null; },
      function () { return wantReply ? { ok: false } : null; });
  },
  activeTab: function () {
    return chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) { return tabs && tabs[0] ? tabs[0].id : null; });
  }
};

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || typeof msg.type !== "string" || msg.type.indexOf("ka:") !== 0) return false;
  self.KAStore.handleMessage(msg, sender, api).then(function (r) { sendResponse(r); }, function (e) { sendResponse({ ok: false, error: String(e) }); });
  return true;   /* yanıt eşzamansız */
});
