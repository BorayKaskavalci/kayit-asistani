/* Kayıt Asistanı - depolama birleştirme + arka plan mesaj işleyicisi.
   Hem service worker (background.js) hem demo modundaki chrome.* taklidi kullanır.
   Veriler YALNIZCA chrome.storage.local içinde durur; hiçbir ağ isteği yapılmaz.
   Anahtarlar: "ka.data" (OBS'den toplanan veriler; yalnızca arka plan yazar), "ka.ui" (panel tercihleri). */
(function (root) {
  "use strict";
  var S = { DATA: "ka.data", UI: "ka.ui" };

  S.EXTRA_KINDS = ["attendance", "grades", "exams", "mytimetable", "acadcal"];
  S.emptyData = function () { return { v: 1, timetable: {}, lastTimetable: null, curriculum: null, offered: null, registration: null }; };

  /* Yeni toplanan veriyi mevcut kayda ekler. Dönüş: {data, summary} */
  S.merge = function (data, kind, payload, at) {
    data = data && data.v === 1 ? data : S.emptyData();
    at = at || Date.now();
    var summary = { kind: kind };
    if (kind === "timetable") {
      var key = (payload.term || "?") + "|" + (payload.program || "?");
      var tt = data.timetable[key] = data.timetable[key] || { term: payload.term, program: payload.program, years: {} };
      tt.years[payload.classYear || "?"] = { at: at, sections: payload.sections, hourRows: payload.hourRows };
      tt.at = at;
      data.lastTimetable = key;
      summary.classYear = payload.classYear; summary.sections = payload.sections.length; summary.courses = payload.courses;
      summary.years = Object.keys(tt.years).sort();
    } else if (kind === "curriculum") {
      data.curriculum = payload; data.curriculum.at = at;
      summary.items = payload.items.length;
      summary.passed = payload.items.filter(function (i) { return i.state === "passed" || i.state === "exempt"; }).length;
      summary.failed = payload.items.filter(function (i) { return i.state === "failed"; }).length;
      summary.gpa = payload.gpa;
    } else if (kind === "offered") {
      data.offered = payload; data.offered.at = at;
      summary.sections = payload.sections.length; summary.courses = payload.courses;
    } else if (kind === "registration") {
      data.registration = payload; data.registration.at = at;
      summary.rows = payload.rows.length; summary.totalEcts = payload.totalEcts; summary.limit = payload.limit;
    } else if (S.EXTRA_KINDS.indexOf(kind) >= 0) {
      /* devamsızlık, not listesi, sınav takvimi, kişisel program, akademik takvim: son hali saklanır */
      data[kind] = payload; data[kind].at = at;
      var list = payload.rows || payload.sections || [];
      summary.rows = list.length; summary.n = list.length;
    } else return { data: data, summary: null };
    return { data: data, summary: summary };
  };

  /* api: {get(key) -> Promise, set(obj) -> Promise, remove(keys) -> Promise, notifyTop(tabId, msg), activeTab() -> Promise<tabId>} */
  var chain = null;
  S.handleMessage = function (msg, sender, api) {
    if (!msg || typeof msg !== "object") return Promise.resolve(null);
    chain = (chain || Promise.resolve()).catch(function () { return null; }).then(function () {
      if (msg.type === "ka:collect") {
        return api.get(S.DATA).then(function (cur) {
          var r = S.merge(cur, msg.kind, msg.payload);
          if (!r.summary) return { ok: false };
          return api.set(obj(S.DATA, r.data)).then(function () {
            if (sender && sender.tab) api.notifyTop(sender.tab.id, { type: "ka:collected", kind: msg.kind, summary: r.summary, frameId: sender.frameId });
            return { ok: true, summary: r.summary };
          });
        });
      }
      if (msg.type === "ka:clear") {
        return api.remove([S.DATA, S.UI]).then(function () {
          if (sender && sender.tab) api.notifyTop(sender.tab.id, { type: "ka:cleared" });
          return { ok: true };
        });
      }
      if (msg.type === "ka:open-panel") {
        return api.activeTab().then(function (tabId) {
          if (tabId === null || tabId === undefined) return { ok: false };
          return api.notifyTop(tabId, { type: "ka:open", tab: msg.tab || null }, true);
        });
      }
      return null;
    });
    return chain;
  };
  function obj(k, v) { var o = {}; o[k] = v; return o; }

  root.KAStore = S;
})(typeof self !== "undefined" ? self : this);
