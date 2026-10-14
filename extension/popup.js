/* Kayıt Asistanı - araç çubuğu açılır penceresi: toplanan verilerin özeti, panel açma, demo, veri silme.
   Yalnızca chrome.storage.local okur/yazar; ağ isteği yapmaz. */
(function () {
  "use strict";
  var K = window.KayitCore, X = window.KayitExt, KP = window.KayitPanel;
  var DEMO_URL = "https://boraykaskavalci.github.io/kayit-asistani/demo-obs/";
  var S = { data: null, ui: {}, arm: false, msg: "" };
  var esc = KP.esc;
  var app = document.getElementById("app");

  function load() {
    chrome.storage.local.get(["ka.data", "ka.ui"]).then(function (o) {
      S.data = o["ka.data"] || null; S.ui = o["ka.ui"] || {};
      render();
    });
  }
  function render() {
    var t = KP.makeT(S.ui.lang || "tr");
    document.documentElement.lang = t.lang;
    var C = X.build(S.data, window.KAYIT_DATA || null), sum = X.summary(C);
    function row(ok, label, detail) {
      return '<li class="' + (ok ? "ok" : "miss") + '"><span class="ico" aria-hidden="true">' + (ok ? "✓" : "○") + '</span><span><b>' + esc(label) + '</b>' +
        (detail ? '<small>' + esc(detail) + '</small>' : "") + '</span><span class="sr">' + esc(t(ok ? "x.state.ok" : "x.state.miss")) + '</span></li>';
    }
    var tt = sum.timetable, cu = sum.curriculum, of = sum.offered, rg = sum.registration;
    var html = '<header><span class="logo" aria-hidden="true">KA</span><div><h1>' + esc(t("x.title")) + '</h1><p>' + esc(t("x.pop.sub")) + '</p></div>' +
      '<button type="button" class="lang" data-act="lang" aria-label="' + esc(t("hdr.langAria")) + '"><span class="' + (t.lang === "tr" ? "on" : "") + '">TR</span><span class="' + (t.lang === "en" ? "on" : "") + '">EN</span></button></header>';
    html += '<ul class="list">' +
      row(!!tt, t("x.d.tt"), tt ? t("x.pop.tt", { y: tt.years.map(function (y) { return String(y).replace(/\D+/g, "") || y; }).join(", "), n: tt.sections }) : t("x.pop.missing")) +
      row(!!cu, t("x.d.cur"), cu ? t("x.pop.cur", { g: t.num2(cu.gpa), e: cu.earned }) : t("x.pop.missing")) +
      row(!!of && !of.stale, t("x.d.off"), of ? t("x.pop.off", { c: of.courses }) : t("x.pop.missing")) +
      row(!!rg, t("x.d.reg"), rg ? t("x.pop.reg", { n: rg.rows, t: rg.total === null || rg.total === undefined ? "?" : rg.total, l: rg.limit || C.M.limit() }) : t("x.pop.missing")) + '</ul>';
    var facts = [];
    if (C.data.registration) {
      var R = X.check(C, S.ui.full || []);
      if (R) facts.push('<div class="fact ' + (R.res.errors ? "bad" : "ok") + '">' + esc(R.res.errors ? t("x.c.sumBad", { e: R.res.errors, w: R.warns }) : t("x.c.sumOk")) + '</div>');
    }
    if (C.M.hasCurriculum) {
      try {
        var res = K.planRoadmap(C.M, X.roadmapOpts(C, "suggest", null, { expected: 2 }));
        facts.push('<div class="fact">' + esc(res.gradLabel ? t("x.pop.grad", { g: res.gradLabel[t.lang], n: res.termsLeft }) : t("rm.noGrad")) + '</div>');
      } catch (e) { /* yoksay */ }
    }
    if (!tt && !cu && !rg) facts.push('<p class="hint">' + esc(t("x.pop.start")) + '</p>');
    html += facts.join("");
    html += '<div class="btns"><button type="button" class="primary" data-act="open">' + esc(t("x.pop.open")) + '</button>' +
      '<button type="button" data-act="demo">' + esc(t("x.pop.demo")) + '</button></div>';
    html += S.arm ? '<div class="confirm"><span>' + esc(t("x.clearQ")) + '</span><button type="button" class="danger" data-act="clear-yes">' + esc(t("x.clearYes")) + '</button><button type="button" data-act="clear-no">' + esc(t("x.clearNo")) + '</button></div>'
      : '<button type="button" class="link-danger" data-act="clear">' + esc(t("x.clear")) + '</button>';
    if (S.msg) html += '<p class="msg">' + esc(S.msg) + '</p>';
    html += '<footer>' + esc(t("x.pop.priv")) + '</footer>';
    app.innerHTML = html;
  }
  app.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el) return;
    var a = el.getAttribute("data-act"), t = KP.makeT(S.ui.lang || "tr");
    if (a === "lang") {
      S.ui.lang = t.lang === "tr" ? "en" : "tr";
      chrome.storage.local.set({ "ka.ui": S.ui });
      render();
    } else if (a === "open") {
      chrome.runtime.sendMessage({ type: "ka:open-panel" }).then(function (r) {
        if (r && r.ok) window.close();
        else { S.msg = t("x.pop.noTab"); render(); }
      }, function () { S.msg = t("x.pop.noTab"); render(); });
    } else if (a === "demo") {
      chrome.tabs.create({ url: DEMO_URL });
      window.close();
    } else if (a === "clear") { S.arm = true; render(); }
    else if (a === "clear-no") { S.arm = false; render(); }
    else if (a === "clear-yes") {
      S.arm = false;
      chrome.runtime.sendMessage({ type: "ka:clear" }).then(function () { S.msg = t("x.cleared"); load(); }, function () { S.msg = t("x.cleared"); load(); });
    }
  });
  chrome.storage.onChanged.addListener(function () { load(); });
  load();
})();
