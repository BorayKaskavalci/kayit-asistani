/* Kayıt Asistanı - OBS içindeki yan panel (yalnızca ÜST çerçevede kurulur).
   Shadow DOM içinde çalışır: OBS'nin stilleri panele, panelin stilleri OBS'ye sızmaz.
   OBS sayfasına dokunmaz, form göndermez, ağ isteği yapmaz (yalnızca eklentinin kendi CSS dosyalarını okur).
   Sekmeler: Durum · Kontrol · Alabileceklerim · Planla · Yol Haritası.
   Global ad: KayitPanel (metin yardımcıları kayıt çerçevesindeki işaretlemede de kullanılır). */
(function (root) {
  "use strict";
  var K = root.KayitCore, X = root.KayitExt, RV = root.KayitRoadmapView, MO = root.KayitMore, ICS = root.KayitICS;
  var UI_KEY = "ka.ui", DATA_KEY = "ka.data";
  var TABS = ["status", "check", "elig", "plan", "roadmap", "attend", "grades", "cal"];
  var WEEK = ["Pzt", "Sal", "Çar", "Per", "Cum"];

  /* ================= metin yardımcıları (her çerçevede kullanılabilir) ================= */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function makeT(lang) {
    var PI = root.KayitPanelI18N || { tr: {}, en: {} }, I = root.KAYIT_I18N || { tr: {}, en: {} };
    lang = lang === "en" ? "en" : "tr";
    var t = function (key, v) {
      var s = PI[lang] && PI[lang][key];
      if (s === undefined) s = I[lang] && I[lang][key];
      if (s === undefined) s = PI.tr && PI.tr[key];
      if (s === undefined) s = I.tr && I.tr[key];
      if (s === undefined) return key;
      if (v) s = s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined && v[k] !== null ? v[k] : m; });
      return s;
    };
    t.lang = lang;
    t.num2 = function (n) { return n === null || n === undefined || isNaN(n) ? "-" : K.trunc2(n).toFixed(2).replace(".", lang === "tr" ? "," : "."); };
    t.day = function (d) { return t("day." + d); };
    t.dayL = function (d) { return t("dayl." + d); };
    t.slot = function (sl) { return t.day(sl.day) + " " + K.fmt(sl.start) + "–" + K.fmt(sl.end); };
    t.times = function (s) { return s && s.slots && s.slots.length ? s.slots.map(t.slot).join(", ") : t("x.noTime"); };
    t.when = function (ms) {
      if (!ms) return "";
      try { return new Date(ms).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
      catch (e) { return new Date(ms).toISOString().slice(0, 16).replace("T", " "); }
    };
    return t;
  }
  function secLabel(s) { return s.code + "(" + s.no + ")"; }

  /* kayıt kontrolü sorunu -> okunur cümle */
  function issueText(is, C, t, row) {
    var p = is.p || {};
    switch (is.type) {
      case "conflict":
      case "conflictSoft":
        return t(is.type === "conflict" ? "x.iss.conflict" : "x.iss.conflictSoft", { o: is.other + "(" + is.otherNo + ")",
          d: t.dayL(is.at.day), h: K.fmt(is.at.start) + "–" + K.fmt(is.at.end) });
      case "prereq":
        var key = { failed: p.retaking ? "x.iss.prereqFailedRetake" : "x.iss.prereqFailed", missing: "x.iss.prereqMissing",
          concurrent: "x.iss.prereqConcurrent", ongoing: "x.iss.prereqOngoing" }[p.state] || "x.iss.prereqMissing";
        return t(key, { p: p.code, n: C ? C.name(p.code, t.lang) : "", g: p.grade || "-" });
      case "special":
        return t("x.iss.special", { c: row ? row.code : "", m: p.m, e: p.e, s: p.sems }) +
          (p.e < p.m ? " " + t("x.iss.specialEcts", { k: p.m - p.e }) : "") +
          (p.miss && p.miss.length ? " " + t("x.iss.specialMiss", { l: p.miss.join(", ") }) : "") +
          (is.soft && is.untaken && is.untaken.length ? " " + t("x.iss.specialUntaken", { l: is.untaken.join(", ") }) : "") +
          (is.soft && is.ongoing && is.ongoing.length ? " " + t("x.iss.specialOngoing", { l: is.ongoing.join(", ") }) : "");
      case "repeat": return t("x.iss.repeat", { g: is.grade || "-" });
      case "improve": return t("x.iss.improve", { g: is.grade || "-" });
      case "retakeNotMarked": return t("x.iss.retakeNotMarked", { g: is.grade || "-" });
      case "alttanUnknown": return t("x.iss.alttanUnknown");
      case "noTime": return t("x.iss.noTime");
      default: return is.type;
    }
  }
  function globalText(g, C, t) {
    if (g.type === "limit") return t("x.g.limit", { t: g.total, l: g.limit, o: g.total - g.limit });
    if (g.type === "limitOk") return t("x.g.limitOk", { t: g.total, l: g.limit });
    if (g.type === "missingRetake") return t("x.g.missingRetake", { c: g.code, n: C ? C.name(g.code, t.lang) : "", g: g.grade || "F", p: g.prob ? t("x.g.prob") : "" });
    return g.type;
  }
  function limitSource(C, t) {
    if (C.data.registration && C.data.registration.limit) return t("x.limitObs");
    var st = C.M.standing();
    return t("x.limitRule", { s: t("rm.st." + st.key) });
  }

  /* ================= haftalık mini ızgara ================= */
  function hue(code) { var h = 0; for (var i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360; return h; }
  function layoutDay(blocks) {
    blocks.sort(function (a, b) { return a.start - b.start || a.end - b.end; });
    var cluster = [], cEnd = -1;
    function flush() {
      var lanes = [];
      cluster.forEach(function (b) {
        var l = -1;
        for (var i = 0; i < lanes.length; i++) if (lanes[i] <= b.start) { l = i; break; }
        if (l < 0) { l = lanes.length; lanes.push(0); }
        lanes[l] = b.end; b.lane = l;
      });
      cluster.forEach(function (b) { b.lanes = lanes.length; });
      cluster = [];
    }
    blocks.forEach(function (b) {
      if (cluster.length && b.start >= cEnd) { flush(); cEnd = -1; }
      cluster.push(b); cEnd = Math.max(cEnd, b.end);
    });
    if (cluster.length) flush();
    return blocks;
  }
  function miniGrid(secs, C, t, opts) {
    opts = opts || {};
    var gs = X.GRID.start, ge = X.GRID.end, span = ge - gs, days = WEEK.slice(), soft = {}, hard = {};
    for (var i = 0; i < secs.length; i++) for (var j = i + 1; j < secs.length; j++) {
      if (secs[i].code === secs[j].code || !K.overlaps(secs[i], secs[j]).length) continue;
      var m = C.M.isSoft(secs[i].code, secs[j].code) ? soft : hard;
      m[secs[i].id] = true; m[secs[j].id] = true;
    }
    secs.forEach(function (s) { s.slots.forEach(function (sl) { if (days.indexOf(sl.day) < 0) days.push(sl.day); }); });
    days.sort(function (a, b) { return K.DAYS.indexOf(a) - K.DAYS.indexOf(b); });
    var per = {}; days.forEach(function (d) { per[d] = []; });
    secs.forEach(function (s) {
      s.slots.forEach(function (sl) {
        var st = Math.max(sl.start, gs), en = Math.min(sl.end, ge);
        if (en <= st) return;
        per[sl.day].push({ sec: s, start: st, end: en, sl: sl });
      });
    });
    var cols = days.map(function (d) {
      var blocks = layoutDay(per[d]).map(function (b) {
        var top = (b.start - gs) / span * 100, h = (b.end - b.start) / span * 100, w = 100 / b.lanes, left = b.lane * w;
        var kind = hard[b.sec.id] ? " hard" : (soft[b.sec.id] ? " soft" : "");
        var title = secLabel(b.sec) + " · " + t.dayL(d) + " " + K.fmt(b.sl.start) + "–" + K.fmt(b.sl.end) + (b.sl.room ? " · " + b.sl.room : "") +
          (soft[b.sec.id] ? " · " + t("x.softShort") : "") + (hard[b.sec.id] ? " · " + t("x.hardShort") : "");
        return '<div class="ka-blk' + kind + '" style="--h:' + hue(b.sec.code) + ';top:' + top.toFixed(2) + '%;height:' + h.toFixed(2) + '%;left:calc(' + left + '% + 1px);width:calc(' + w + '% - 2px)" title="' + esc(title) + '">' +
          '<b>' + esc(opts.big ? b.sec.code.replace(" ", "\u00a0") : (b.sec.code.split(" ")[1] || b.sec.code)) + '</b>' + (opts.big ? '<i>' + esc(K.fmt(b.sl.start)) + '</i>' : "") + '</div>';
      }).join("");
      return '<div class="ka-gday"><div class="ka-gdn">' + esc(t.day(d)) + '</div><div class="ka-gcol">' + blocks + '</div></div>';
    }).join("");
    var timeless = secs.filter(function (s) { return !s.slots.length; });
    return '<div class="ka-grid' + (opts.big ? " big" : "") + '" style="--cols:' + days.length + '" role="img" aria-label="' + esc(t("x.gridAria", { l: secs.map(secLabel).join(", ") })) + '">' +
      '<div class="ka-gtime"><div class="ka-gdn">&nbsp;</div><div class="ka-gcol"><span style="top:0">08:40</span><span style="top:' + ((760 - gs) / span * 100).toFixed(1) + '%">12:40</span><span style="top:' + ((1000 - gs) / span * 100).toFixed(1) + '%">16:40</span></div></div>' +
      cols + '</div>' + (timeless.length ? '<p class="ka-small ka-muted">' + esc(t("x.timeless", { l: timeless.map(secLabel).join(", ") })) + '</p>' : "");
  }

  /* ================= panel ================= */
  function defaultsUI(lang) {
    return { v: 1, open: false, tab: "status", lang: lang || "tr", cart: [], full: [], prefs: { days: false, early: false, gaps: true, free: false },
      pick: null, rm: { expected: 2, fail: {}, mode: "" }, showPassed: false, q: "",
      gw: {}, gt: { D: 50, C: 60, B: 70, A: 80 }, cal: { start: "", end: "", alarms: true } };
  }
  function normUI(u, lang) {
    var d = defaultsUI(lang);
    if (!u || typeof u !== "object") return d;
    Object.keys(d).forEach(function (k) { if (u[k] !== undefined && u[k] !== null) d[k] = u[k]; });
    if (TABS.indexOf(d.tab) < 0) d.tab = "status";
    if (!Array.isArray(d.cart)) d.cart = [];
    if (!Array.isArray(d.full)) d.full = [];
    d.prefs = { days: !!(u.prefs && u.prefs.days), early: !!(u.prefs && u.prefs.early), gaps: u.prefs ? !!u.prefs.gaps : true, free: !!(u.prefs && u.prefs.free) };
    d.rm = { expected: u.rm && typeof u.rm.expected === "number" ? u.rm.expected : 2, fail: (u.rm && u.rm.fail) || {}, mode: (u.rm && u.rm.mode) || "" };
    d.lang = d.lang === "en" ? "en" : "tr";
    if (!d.gw || typeof d.gw !== "object") d.gw = {};
    if (!d.gt || typeof d.gt !== "object") d.gt = { D: 50, C: 60, B: 70, A: 80 };
    d.cal = { start: (u.cal && u.cal.start) || "", end: (u.cal && u.cal.end) || "", alarms: !(u.cal && u.cal.alarms === false) };
    return d;
  }

  function mount() {
    if (root.__kaPanel) return root.__kaPanel;
    var st = chrome.storage.local;
    var navLang = (navigator.language || "tr").toLowerCase().indexOf("tr") === 0 ? "tr" : (/^en/.test((navigator.language || "").toLowerCase()) ? "en" : "tr");
    var P = { ui: defaultsUI(navLang), data: X.emptyData(), C: null, cache: {}, ready: false, pending: {}, clearArm: false, scroll: {} };
    var t = makeT(P.ui.lang);

    var host = document.createElement("div");
    host.setAttribute("data-ka", "host");
    host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000;visibility:hidden;";
    var sr = host.attachShadow({ mode: "open" });
    (document.body || document.documentElement).appendChild(host);
    sr.innerHTML = '<style id="ka-css"></style><button type="button" class="ka-launch" data-act="toggle"></button>' +
      '<aside class="ka-panel" hidden><header class="ka-head"></header><nav class="ka-tabs" role="tablist"></nav><div class="ka-body" role="tabpanel" tabindex="-1"></div>' +
      '<footer class="ka-foot"></footer></aside><div class="ka-toast" role="status" aria-live="polite" hidden></div>';
    var $ = function (sel) { return sr.querySelector(sel); };

    /* CSS: eklenti dosyalarından (web_accessible_resources) okunur ve shadow root'a gömülür */
    var cssFiles = ["panel.css", "lib/roadmap.css"];
    Promise.all(cssFiles.map(function (f) {
      return fetch(chrome.runtime.getURL(f), { cache: "no-cache" }).then(function (r) { return r.ok ? r.text() : ""; }, function () { return ""; });
    })).then(function (parts) {
      $("#ka-css").textContent = parts.join("\n");
      host.style.visibility = "visible";
    });

    /* ---------- depolama ---------- */
    function saveUI() {
      clearTimeout(P.saveTimer);
      P.saveTimer = setTimeout(function () {
        var json = JSON.stringify(P.ui);
        P.pending[json] = true;
        var o = {}; o[UI_KEY] = JSON.parse(json);
        try { st.set(o); } catch (e) { /* bağlam geçersiz (eklenti yeniden yüklendi) */ }
      }, 120);
    }
    function setData(d) {
      P.data = d && d.v === 1 ? d : X.emptyData();
      P.C = null; P.cache = {};
    }
    function ctx() {
      if (!P.C) P.C = X.build(P.data, root.KAYIT_DATA || null);
      return P.C;
    }
    st.get([DATA_KEY, UI_KEY]).then(function (o) {
      setData(o[DATA_KEY]);
      P.ui = normUI(o[UI_KEY], navLang);
      t = makeT(P.ui.lang);
      P.ready = true;
      render();
    }, function () { P.ready = true; render(); });

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area && area !== "local") return;
      if (changes[DATA_KEY]) { setData(changes[DATA_KEY].newValue); schedule(); }
      if (changes[UI_KEY]) {
        var nv = changes[UI_KEY].newValue, json = nv ? JSON.stringify(nv) : "";
        if (json && P.pending[json]) { delete P.pending[json]; }
        else if (!nv) { var open = P.ui.open; P.ui = defaultsUI(P.ui.lang); P.ui.open = open; t = makeT(P.ui.lang); schedule(); }
        else { P.ui = normUI(nv, P.ui.lang); t = makeT(P.ui.lang); schedule(); }
      }
    });
    function schedule() { clearTimeout(P.rt); P.rt = setTimeout(render, 60); }

    /* ---------- hesap önbelleği ---------- */
    function memo(key, fn) { if (!(key in P.cache)) P.cache[key] = fn(); return P.cache[key]; }
    function checkRes() { return memo("check|" + P.ui.full.join(","), function () { return X.check(ctx(), P.ui.full); }); }
    function planRes() {
      var C = ctx();
      return memo("plan|" + P.ui.cart.join(",") + "|" + P.ui.full.join(",") + "|" + JSON.stringify(P.ui.prefs), function () {
        return X.plan(C, P.ui.cart, P.ui.full, P.ui.prefs);
      });
    }
    function planA() {
      var pr = planRes(), C = ctx();
      if (!pr.ranked.length) return [];
      var pick = (P.ui.pick || []).map(C.secById).filter(Boolean);
      var ok = pick.length === pr.codes.length && pr.codes.every(function (c) { return pick.filter(function (s) { return s.code === c; }).length === 1; }) &&
        pick.every(function (s) { return P.ui.full.indexOf(s.id) < 0; });
      if (ok) for (var i = 0; i < pick.length && ok; i++) for (var j = i + 1; j < pick.length; j++) if (C.pairHard(pick[i], pick[j])) { ok = false; break; }
      return ok ? pick.slice().sort(function (a, b) { return a.code < b.code ? -1 : 1; }) : pr.ranked[0].combo;
    }

    /* ---------- render ---------- */
    function render() {
      if (!P.ready) return;
      var C = ctx(), u = P.ui;
      var panel = $(".ka-panel"), launch = $(".ka-launch");
      var chk = C.data.registration ? checkRes() : null;
      var att = C.data.attendance ? memo("att", function () { return MO.attendance(C); }) : null;
      var errs = (chk ? chk.res.errors : 0) + (att ? att.over : 0);
      launch.innerHTML = '<span class="ka-logo" aria-hidden="true">KA</span><span class="ka-launch-t">' + esc(t("x.launch")) + '</span>' +
        (errs ? '<span class="ka-launch-badge" aria-label="' + esc(t("x.errorsN", { n: errs })) + '">' + errs + '</span>' : "");
      launch.setAttribute("aria-expanded", u.open ? "true" : "false");
      launch.setAttribute("title", t("x.launchTip"));
      launch.hidden = !!u.open;
      panel.hidden = !u.open;
      if (!u.open) return;
      panel.setAttribute("aria-label", t("x.title"));
      var sub = [C.term, C.isME ? t("x.progME") : (X.programText(C.data) || "")].filter(Boolean).join(" · ");
      $(".ka-head").innerHTML = '<div class="ka-brand"><span class="ka-logo" aria-hidden="true">KA</span><div><strong>' + esc(t("x.title")) + '</strong><small>' + esc(sub || t("x.sub")) + '</small></div></div>' +
        '<div class="ka-head-r"><button type="button" class="ka-lang" data-act="lang" aria-label="' + esc(t("hdr.langAria")) + '"><span class="' + (u.lang === "tr" ? "on" : "") + '">TR</span><span class="' + (u.lang === "en" ? "on" : "") + '">EN</span></button>' +
        '<button type="button" class="ka-x" data-act="close" aria-label="' + esc(t("x.close")) + '" title="' + esc(t("x.close")) + '">&times;</button></div>';
      $(".ka-tabs").innerHTML = TABS.map(function (k) {
        var dot = (k === "check" && chk && chk.res.errors) || (k === "attend" && att && (att.over || att.warn)) ? '<i class="ka-dot" aria-hidden="true"></i>' : "";
        return '<button type="button" role="tab" class="ka-tab' + (u.tab === k ? " on" : "") + '" data-act="tab" data-tab="' + k + '" aria-selected="' + (u.tab === k) + '">' + esc(t("x.tab." + k)) + dot + '</button>';
      }).join("");
      var body = $(".ka-body"), prevTab = body.getAttribute("data-tab");
      if (prevTab) P.scroll[prevTab] = body.scrollTop;
      var html;
      try {
        html = ({ status: renderStatus, check: renderCheck, elig: renderElig, plan: renderPlan, roadmap: renderRoadmap,
          attend: renderAttend, grades: renderGrades, cal: renderCal })[u.tab](C);
      } catch (e) {
        html = '<div class="ka-card ka-alert bad"><strong>' + esc(t("x.renderErr")) + '</strong><p class="ka-small">' + esc(String(e && e.message || e)) + '</p></div>';
        if (root.console) root.console.warn("[Kayıt Asistanı]", e);
      }
      body.innerHTML = html;
      body.setAttribute("data-tab", u.tab);
      body.scrollTop = prevTab === u.tab ? (P.scroll[u.tab] || 0) : 0;
      if (u.tab === "elig" && u.q) applyFilter();
      var on = $(".ka-tab.on");
      if (on && on.scrollIntoView) { var nav = $(".ka-tabs"); if (on.offsetLeft < nav.scrollLeft || on.offsetLeft + on.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = on.offsetLeft - 8; }
      $(".ka-foot").innerHTML = '<span>' + esc(t("x.foot")) + '</span>';
    }

    function card(inner, cls) { return '<section class="ka-card' + (cls ? " " + cls : "") + '">' + inner + '</section>'; }
    function empty(title, text, btns) {
      return '<div class="ka-empty"><strong>' + esc(title) + '</strong><p>' + esc(text) + '</p>' + (btns || "") + '</div>';
    }
    function btn(act, label, extra, cls) {
      return '<button type="button" class="ka-btn' + (cls ? " " + cls : "") + '" data-act="' + act + '"' + (extra || "") + '>' + esc(label) + '</button>';
    }
    function pill(cls, text) { return '<span class="ka-pill ' + cls + '">' + esc(text) + '</span>'; }

    /* ---------- 1) Durum ---------- */
    function renderStatus(C) {
      var S = X.summary(C), html = "";
      function item(state, title, lines, how) {
        var ico = state === "ok" ? "✓" : (state === "warn" ? "!" : "○");
        return '<li class="ka-ci ' + state + '"><span class="ka-ico" aria-hidden="true">' + ico + '</span><div><strong>' + esc(title) + '</strong>' +
          lines.filter(Boolean).map(function (l) { return '<div class="ka-small">' + l + '</div>'; }).join("") +
          (how ? '<div class="ka-how">' + esc(how) + '</div>' : "") + '</div><span class="ka-sr">' + esc(t("x.state." + state)) + '</span></li>';
      }
      var tt = S.timetable, list = "";
      if (tt) {
        var missY = ["1", "2", "3", "4"].filter(function (y) { return !tt.years.some(function (v) { return String(v).replace(/\D+/g, "") === y; }); });
        var yrs = tt.years.map(function (y) { return String(y).replace(/\D+/g, "") || y; }).join(", ");
        list += item(missY.length ? "warn" : "ok", t("x.d.tt"), [
          esc(t("x.d.ttLine", { y: yrs, n: tt.sections, c: tt.courses })),
          esc((C.term || "") + (tt.programs.length ? " · " + tt.programs.join(", ") : "")),
          '<span class="ka-muted">' + esc(t("x.d.updated", { w: t.when(tt.at) })) + '</span>'
        ], missY.length ? t("x.d.ttMiss", { l: missY.join(", ") }) : "");
      } else list += item("miss", t("x.d.tt"), [esc(t("x.d.ttWhy"))], t("x.d.ttHow"));
      var cu = S.curriculum;
      if (cu) list += item("ok", t("x.d.cur"), [
        esc(t("x.d.curLine", { g: t.num2(cu.gpa), e: cu.earned, y: cu.classYear || "?" })),
        esc(t("x.d.curLine2", { p: cu.passed, f: cu.failed, o: cu.ongoing, n: cu.items })),
        cu.name ? '<span class="ka-muted">' + esc(cu.name) + '</span>' : "",
        '<span class="ka-muted">' + esc(t("x.d.updated", { w: t.when(cu.at) })) + '</span>'
      ]);
      else list += item("miss", t("x.d.cur"), [esc(t("x.d.curWhy"))], t("x.d.curHow"));
      var of = S.offered;
      if (of && !of.stale) list += item("ok", t("x.d.off"), [esc(t("x.d.offLine", { c: of.courses, n: of.sections })), '<span class="ka-muted">' + esc(t("x.d.updated", { w: t.when(of.at) })) + '</span>']);
      else if (of && of.stale) list += item("warn", t("x.d.off"), [esc(t("x.d.offStale", { t: of.term }))], t("x.d.offHow"));
      else list += item("miss", t("x.d.off"), [esc(t("x.d.offWhy"))], t("x.d.offHow"));
      var rg = S.registration;
      if (rg) list += item("ok", t("x.d.reg"), [
        esc(t("x.d.regLine", { n: rg.rows, t: rg.total === null || rg.total === undefined ? "?" : rg.total, l: rg.limit || C.M.limit() })),
        '<span class="ka-muted">' + esc(t("x.d.updated", { w: t.when(rg.at) })) + '</span>'
      ]);
      else list += item("miss", t("x.d.reg"), [esc(t("x.d.regWhy"))], t("x.d.regHow"));
      html += card('<h3>' + esc(t("x.d.title")) + '</h3><p class="ka-small ka-muted">' + esc(t("x.d.intro")) + '</p><ul class="ka-checklist">' + list + '</ul>');

      /* yaklaşan son tarihler + sınavlar */
      var up = MO.upcoming(C, new Date(), 60);
      if (up.length) html = card('<h3>' + esc(t("x.u.title")) + '</h3><ul class="ka-up">' + up.slice(0, 5).map(function (x) {
        var cd = MO.countdown(x.at), when = t("x.u.in." + cd.unit, { n: cd.n });
        var what = x.kind === "exam" ? t("x.exam." + (x.type || "exam")) + ": " + x.name + (x.room ? " · " + x.room : "") : x.name;
        var verb = x.kind === "ends" ? t("x.u.ends", { w: when }) : (x.kind === "starts" ? t("x.u.starts", { w: when }) : t("x.u.exam", { w: when }));
        return '<li class="' + (x.kind === "ends" && cd.unit !== "day" || cd.n <= 3 ? "soon" : "") + '"><b>' + esc(what) + '</b><span>' + esc(verb) + ' · ' + esc(t.when(x.at.getTime())) + '</span></li>';
      }).join("") + '</ul>', "ka-upc") + html;

      /* diğer OBS sayfaları (isteğe bağlı) */
      var opt = [["attendance", "attend"], ["grades", "grades"], ["mytimetable", "cal"], ["exams", "cal"], ["acadcal", "cal"]].map(function (x) {
        var d = C.data[x[0]], n = d ? (d.rows || d.sections || []).length : 0;
        return item(d ? "ok" : "miss", t("x.d.k." + x[0]), [d ? esc(t("x.d.kn", { n: n })) + ' · <span class="ka-muted">' + esc(t("x.d.updated", { w: t.when(d.at) })) + '</span>' : esc(t("x.d.kw." + x[0]))], d ? "" : t("x.d.kh." + x[0]));
      }).join("");
      html += card('<h3>' + esc(t("x.d.moreT")) + '</h3><p class="ka-small ka-muted">' + esc(t("x.d.moreP")) + '</p><ul class="ka-checklist">' + opt + '</ul>');

      /* bilgi paketi */
      var kn = C.isME ? t("x.d.knME") : (S.program ? t("x.d.knOther", { p: S.program }) : t("x.d.knUnknown"));
      html += card('<h3>' + esc(t("x.d.knT")) + '</h3><p class="ka-small">' + esc(kn) + '</p>' +
        (C.M.hasCurriculum ? '<p class="ka-small ka-muted">' + esc(t("x.d.assume", { n: C.M.completedSemesters(), s: t("rm.st." + C.M.standing().key), l: C.M.limit() })) + '</p>' : ""));

      /* sonraki adım */
      var next = [];
      if (C.data.registration) next.push(btn("tab", t("x.d.goCheck"), ' data-tab="check"', "primary"));
      if (C.M.hasCurriculum) next.push(btn("tab", t("x.d.goElig"), ' data-tab="elig"'));
      if (C.M.hasCurriculum) next.push(btn("tab", t("x.d.goRoad"), ' data-tab="roadmap"'));
      if (C.M.hasCurriculum || C.data.registration) next.push(btn("open-site", t("x.d.openSite"), "", "primary"));
      if (next.length) html += card('<h3>' + esc(t("x.d.nextT")) + '</h3><div class="ka-btns">' + next.join("") + '</div>');

      /* gizlilik */
      html += card('<h3>' + esc(t("x.priv.t")) + '</h3><ul class="ka-small ka-plain"><li>' + esc(t("x.priv.1")) + '</li><li>' + esc(t("x.priv.2")) + '</li><li>' + esc(t("x.priv.3")) + '</li></ul>' +
        (P.clearArm ? '<div class="ka-confirm"><span>' + esc(t("x.clearQ")) + '</span>' + btn("clear-yes", t("x.clearYes"), "", "danger") + btn("clear-no", t("x.clearNo")) + '</div>'
          : btn("clear", t("x.clear"), "", "danger-ghost")), "ka-priv");
      return html;
    }

    /* ---------- 2) Kontrol ---------- */
    function renderCheck(C) {
      if (!C.data.registration) return empty(t("x.c.emptyT"), t("x.c.emptyP"), '<p class="ka-how">' + esc(t("x.d.regHow")) + '</p>');
      var R = checkRes(), res = R.res, html = "";
      var errRows = res.rows.filter(function (r) { return r.level === "error"; }).length;
      var lim = res.global.filter(function (g) { return g.type === "limit" || g.type === "limitOk"; })[0];
      var over = lim && lim.type === "limit";
      html += '<div class="ka-sum ' + (res.errors ? "bad" : (R.warns ? "warn" : "ok")) + '"><div class="ka-sum-n">' +
        (res.errors ? esc(t("x.c.sumBad", { e: res.errors, w: R.warns })) : (R.warns ? esc(t("x.c.sumWarn", { w: R.warns })) : esc(t("x.c.sumOk")))) + '</div>' +
        '<div class="ka-meter' + (over ? " over" : "") + '" role="img" aria-label="' + esc(t("x.c.ectsAria", { t: res.total, l: res.limit })) + '"><span style="width:' + Math.min(100, res.total / Math.max(1, res.limit) * 100).toFixed(1) + '%"></span></div>' +
        '<div class="ka-small">' + esc(t("x.c.ects", { t: res.total, l: res.limit })) + ' <span class="ka-muted">' + esc(limitSource(C, t)) + '</span></div>' +
        (errRows || R.warns ? '<div class="ka-small ka-muted">' + esc(t("x.c.marked")) + '</div>' : "") + '</div>';

      /* veri eksikleri */
      var gaps = [];
      if (!R.hasTT) gaps.push(t("x.c.noTT"));
      if (!R.hasCurriculum) gaps.push(t("x.c.noCur"));
      else if (!C.isME) gaps.push(t("x.c.noKn"));
      if (R.noTime.length) gaps.push(t("x.c.noTimeList", { l: R.noTime.join(", ") }));
      if (gaps.length) html += '<div class="ka-alert info ka-small"><ul class="ka-plain">' + gaps.map(function (g) { return "<li>" + esc(g) + "</li>"; }).join("") + '</ul></div>';

      /* dönem geneli */
      var glob = res.global.filter(function (g) { return g.type !== "limitOk"; });
      if (glob.length) html += card('<h3>' + esc(t("x.c.globalT")) + '</h3><ul class="ka-issues">' + glob.map(function (g) {
        var add = g.type === "missingRetake" && P.ui.cart.indexOf(g.code) < 0 ? " " + btn("cart-add", t("x.addPlan"), ' data-code="' + esc(g.code) + '"', "mini") : "";
        return '<li class="' + g.level + '">' + esc(globalText(g, C, t)) + add + '</li>';
      }).join("") + '</ul>');

      /* ders ders */
      var bad = [], fine = [];
      res.rows.forEach(function (r, i) {
        var reg = R.regRows[i], sec = R.secs[i];
        var meaningful = r.issues.filter(function (x) { return x.type !== "noTime" || R.hasTT; });
        if (!meaningful.length) { fine.push(reg); return; }
        var lvl = r.level === "ok" ? "info" : r.level;
        var h = '<div class="ka-row lvl-' + lvl + '"><div class="ka-row-h"><b>' + esc(reg.code + "(" + reg.no + ")") + '</b> <span class="ka-rn">' + esc(C.name(reg.code, t.lang) || reg.name) + '</span>' +
          pill(lvl, t("x.lvl." + lvl)) + '</div><div class="ka-small ka-muted">' + esc(t("x.c.rowMeta", { e: reg.ects, a: reg.alis || "-" })) + (sec ? " · " + esc(t.times(sec)) : "") + '</div>' +
          '<ul class="ka-issues">' + meaningful.map(function (is) { return '<li class="' + is.level + '">' + esc(issueText(is, C, t, reg)) + '</li>'; }).join("") + '</ul>';
        if (R.alts[i]) {
          h += R.alts[i].length ? '<div class="ka-alt"><span>' + esc(t("x.c.altT")) + '</span> ' + R.alts[i].slice(0, 4).map(function (s) {
            return '<span class="ka-chip"><b>' + esc(secLabel(s)) + '</b> ' + esc(t.times(s)) + '</span>';
          }).join(" ") + '</div>' : '<div class="ka-alt none">' + esc(t("x.c.altNone")) + '</div>';
        }
        bad.push(h + '</div>');
      });
      if (bad.length) html += card('<h3>' + esc(t("x.c.rowsT", { n: bad.length })) + '</h3>' + bad.join(""));
      if (fine.length) html += card('<h3>' + esc(t("x.c.fineT", { n: fine.length })) + '</h3><p class="ka-small">' + fine.map(function (r) {
        return '<span class="ka-chip ok">' + esc(r.code + "(" + r.no + ")") + '</span>';
      }).join(" ") + '</p>');
      html += '<div class="ka-btns">' + btn("cart-import-reg", t("x.c.toPlan"), "", "primary") + btn("tab", t("x.c.toRoad"), ' data-tab="roadmap"') + '</div>';
      html += '<p class="ka-small ka-muted">' + esc(t("x.c.disclaimer")) + '</p>';
      return html;
    }

    /* ---------- 3) Alabileceklerim ---------- */
    function eligItem(x, C) {
      var inCart = P.ui.cart.indexOf(x.code) >= 0, st = x.e.status;
      var tag = st === "retake" ? pill("error", t("x.e.tagRetake")) : (st === "improve" ? pill("warn", t("x.e.tagImprove")) : (st === "passed" ? pill("ok", (C.M.grade(x.code) || t("x.e.passed"))) : ""));
      var can = st === "ok" || st === "retake" || st === "improve";
      var reasons = "";
      if (st === "blocked") reasons = '<ul class="ka-reasons">' + x.e.reasons.map(function (p) {
        return '<li>' + esc(issueText(p.special ? { type: "special", p: p } : { type: "prereq", p: p }, C, t, { code: x.code })) + '</li>';
      }).join("") + '</ul>';
      var meta = [x.ects ? t("x.e.ects", { e: x.ects }) : "", x.semester ? t("x.e.sem", { s: x.semester }) : "", C.offeredNow[x.code] ? t("x.e.secs", { n: x.sections }) : t("x.e.notOffered")].filter(Boolean).join(" · ");
      var action = inCart ? btn("cart-remove", t("x.inPlan"), ' data-code="' + esc(x.code) + '" aria-pressed="true"', "mini on")
        : (can && x.sections ? btn("cart-add", t("x.addPlan"), ' data-code="' + esc(x.code) + '"', "mini") : "");
      return '<li class="ka-ei es-' + st + '" data-q="' + esc(X.fold(x.code + " " + C.name(x.code, "tr") + " " + C.name(x.code, "en"))) + '"><div><b>' + esc(x.code) + '</b> ' + esc(C.name(x.code, t.lang)) + ' ' + tag +
        '<div class="ka-small ka-muted">' + esc(meta) + '</div>' + reasons + '</div><div class="ka-ea">' + action + '</div></li>';
    }
    function renderElig(C) {
      var html = '<div class="ka-search"><input type="search" data-q-input placeholder="' + esc(t("x.e.searchPh")) + '" aria-label="' + esc(t("x.e.searchPh")) + '" value="' + esc(P.ui.q || "") + '"></div>';
      if (!C.hasOffered) html += '<div class="ka-alert info ka-small">' + esc(t("x.e.noOffered")) + ' <span class="ka-how">' + esc(t("x.d.ttHow")) + '</span></div>';
      if (!C.M.hasCurriculum) {
        html += '<div class="ka-alert warn ka-small">' + esc(t("x.e.noCur")) + ' <span class="ka-how">' + esc(t("x.d.curHow")) + '</span></div>';
        var codes = Object.keys(C.offeredNow).sort();
        if (!codes.length) return html;
        return html + '<ul class="ka-elist" data-elist>' + codes.map(function (code) {
          return eligItem({ code: code, e: { status: "ok" }, ects: C.ects(code), semester: null, sections: C.sectionsOf(code).length }, C);
        }).join("") + '</ul>';
      }
      var E = memo("elig", function () { return X.eligible(C); }), g = E.groups;
      var canN = g.retake.length + g.req.length + g.elec.length + g.improve.length;
      var cartE = P.ui.cart.reduce(function (s, c) { return s + C.ects(c); }, 0), lim = C.M.limit();
      html += '<div class="ka-sum ' + (cartE > lim ? "bad" : "info") + '"><div class="ka-stats"><span><b>' + canN + '</b> ' + esc(t("x.e.can")) + '</span><span><b>' + g.retake.length + '</b> ' + esc(t("x.e.retakeN")) + '</span><span><b>' + g.blocked.length + '</b> ' + esc(t("x.e.blockedN")) + '</span></div>' +
        '<div class="ka-small">' + esc(t("x.e.cartLine", { n: P.ui.cart.length, e: cartE, l: lim, s: t("rm.st." + C.M.standing().key) })) + '</div>' +
        (C.M.standing().prioritizeFailedRequired && g.retake.length ? '<div class="ka-small ka-warn-t">' + esc(t("elig.prioritize")) + '</div>' : "") +
        '<div class="ka-btns">' + (g.retake.length ? btn("cart-add-retakes", t("x.e.addRetakes"), "", "primary") : "") +
        (C.data.registration ? btn("cart-import-reg", t("x.e.importReg")) : "") + (P.ui.cart.length ? btn("tab", t("x.e.toPlan"), ' data-tab="plan"') : "") + '</div></div>';
      function group(key, title, hint, arr, open) {
        if (!arr.length) return "";
        return '<details class="ka-group"' + (open ? " open" : "") + '><summary><b>' + esc(title) + '</b> <span class="ka-count">' + arr.length + '</span></summary>' +
          (hint ? '<p class="ka-small ka-muted">' + esc(hint) + '</p>' : "") + '<ul class="ka-elist">' + arr.map(function (x) { return eligItem(x, C); }).join("") + '</ul></details>';
      }
      var lists = group("retake", t("x.e.g.retake"), t("x.e.g.retakeH"), g.retake, true) +
        group("req", t("x.e.g.req"), t("x.e.g.reqH"), g.req, true) +
        group("elec", t("x.e.g.elec"), t("x.e.g.elecH", { n: E.openSlots }), g.elec, true) +
        group("improve", t("x.e.g.improve"), t("x.e.g.improveH"), g.improve, false) +
        group("blocked", t("x.e.g.blocked"), t("x.e.g.blockedH"), g.blocked, false) +
        group("closed", t("x.e.g.closed"), t("x.e.g.closedH"), g.closed, false) +
        (P.ui.showPassed ? group("passed", t("x.e.g.passed"), "", g.passed, true) : "");
      html += '<div data-elist>' + lists + '</div>';
      html += '<label class="ka-check ka-small"><input type="checkbox" data-act-change="show-passed"' + (P.ui.showPassed ? " checked" : "") + '> ' + esc(t("x.e.showPassed", { n: g.passed.length })) + '</label>';
      return html;
    }
    function applyFilter() {
      var q = X.fold(P.ui.q || "").trim();
      Array.prototype.forEach.call(sr.querySelectorAll(".ka-ei"), function (li) {
        li.hidden = !!q && (li.getAttribute("data-q") || "").indexOf(q) < 0;
      });
      Array.prototype.forEach.call(sr.querySelectorAll(".ka-group"), function (d) {
        var vis = d.querySelectorAll(".ka-ei:not([hidden])").length;
        d.hidden = !!q && !vis;
        if (q && vis) d.open = true;
      });
    }

    /* ---------- 4) Planla ---------- */
    function statLine(st) {
      return t("x.p.stats", { d: st.days, g: Math.round(st.gap / 6) / 10, e: st.early }) + (st.free ? " · " + t("x.p.statFri", { n: st.free }) : "") + (st.soft ? " · " + t("x.p.statSoft", { n: st.soft }) : "");
    }
    function renderPlan(C) {
      var u = P.ui, html = "";
      if (!C.hasOffered) html += '<div class="ka-alert warn ka-small">' + esc(t("x.p.noTT")) + ' <span class="ka-how">' + esc(t("x.d.ttHow")) + '</span></div>';
      var lim = C.M.limit(), tot = u.cart.reduce(function (s, c) { return s + C.ects(c); }, 0);
      html += card('<div class="ka-cart-h"><h3>' + esc(t("x.p.cartT")) + '</h3><span class="ka-small ' + (tot > lim ? "ka-bad-t" : "ka-muted") + '">' + esc(t("x.p.cartE", { e: tot, l: lim })) + '</span></div>' +
        (u.cart.length ? '<div class="ka-chips">' + u.cart.map(function (c) {
          return '<span class="ka-chip' + (C.M.failed(c) ? " bad" : "") + '"><b>' + esc(c) + '</b> <small>' + C.ects(c) + '</small><button type="button" class="ka-chip-x" data-act="cart-remove" data-code="' + esc(c) + '" aria-label="' + esc(t("x.p.remove", { c: c })) + '">&times;</button></span>';
        }).join("") + '</div><div class="ka-btns">' + btn("tab", t("x.p.addMore"), ' data-tab="elig"') + btn("cart-clear", t("x.p.clearCart"), "", "ghost") + '</div>'
          : '<p class="ka-small ka-muted">' + esc(t("x.p.emptyP")) + '</p><div class="ka-btns">' + btn("tab", t("x.p.goElig"), ' data-tab="elig"', "primary") +
            (C.data.registration ? btn("cart-import-reg", t("x.e.importReg")) : "") + '</div>'));
      if (!u.cart.length) return html;
      if (tot > lim) html += '<div class="ka-alert bad ka-small">' + esc(t("x.p.over", { e: tot, l: lim, o: tot - lim })) + '</div>';

      /* tercihler */
      html += '<div class="ka-prefs" role="group" aria-label="' + esc(t("x.p.prefsT")) + '">' + ["days", "early", "gaps", "free"].map(function (k) {
        return '<label class="ka-toggle' + (u.prefs[k] ? " on" : "") + '"><input type="checkbox" data-pref="' + k + '"' + (u.prefs[k] ? " checked" : "") + '> ' + esc(t("x.p.pref." + k)) + '</label>';
      }).join("") + '</div>';

      var pr = planRes();
      var warn = [];
      if (pr.notOffered.length) warn.push(t("x.p.notOffered", { l: pr.notOffered.join(", ") }));
      if (pr.allFull.length) warn.push(t("x.p.allFull", { l: pr.allFull.join(", ") }));
      if (pr.timeless.length) warn.push(t("x.p.timelessW", { l: pr.timeless.join(", ") }));
      if (pr.capped) warn.push(t("x.p.capped"));
      if (warn.length) html += '<div class="ka-alert warn ka-small"><ul class="ka-plain">' + warn.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + '</ul></div>';
      if (!pr.ranked.length) {
        if (!pr.codes.length) return html;
        html += '<div class="ka-alert bad"><strong>' + esc(t("x.p.noSol")) + '</strong>' + (pr.blocking.length ? '<ul class="ka-plain ka-small">' + pr.blocking.map(function (b) {
          return '<li>' + esc(t("x.p.blocking", { a: b[0], b: b[1] })) + '</li>';
        }).join("") + '</ul>' : "") + '<p class="ka-small">' + esc(t("x.p.noSolTip")) + '</p></div>';
        return html + fullListHtml(C);
      }
      var A = planA(), aKey = A.map(function (s) { return s.id; }).sort().join(",");
      html += '<h3 class="ka-h3">' + esc(t("x.p.optsT", { n: pr.distinct, c: pr.count })) + '</h3><div class="ka-opts">' + pr.ranked.slice(0, 3).map(function (r, i) {
        var key = r.combo.map(function (s) { return s.id; }).sort().join(","), on = key === aKey;
        return '<div class="ka-opt' + (on ? " on" : "") + '"><div class="ka-opt-h"><b>' + esc(t("x.p.optN", { n: i + 1 })) + '</b>' + (on ? pill("ok", t("x.p.isA")) : btn("plan-pick", t("x.p.makeA"), ' data-i="' + i + '"', "mini")) + '</div>' +
          miniGrid(r.combo, C, t) + '<div class="ka-small ka-muted">' + esc(statLine(r.stats)) + '</div></div>';
      }).join("") + '</div>';

      /* Plan A ayrıntı + Dolu */
      var V = memo("var|" + aKey + "|" + u.full.join(",") + "|" + JSON.stringify(u.prefs), function () { return X.variants(C, A, u.full, u.prefs); });
      html += card('<h3>' + esc(t("x.p.planA")) + '</h3>' + miniGrid(A, C, t, { big: true }) + '<ul class="ka-secs">' + A.map(function (s) {
        return '<li><div><b>' + esc(secLabel(s)) + '</b> <span class="ka-muted ka-small">' + esc(C.name(s.code, t.lang)) + '</span><div class="ka-small">' + esc(t.times(s)) + (s.rooms && s.rooms.length ? " · " + esc(s.rooms.join(", ")) : "") + '</div></div>' +
          '<label class="ka-full"><input type="checkbox" data-full="' + esc(s.id) + '"> ' + esc(t("x.p.full")) + '</label></li>';
      }).join("") + '</ul><p class="ka-small ka-muted">' + esc(t("x.p.fullHint")) + '</p>', "ka-plan-a");
      ["B", "C"].forEach(function (k) {
        var p = V.plans.filter(function (x) { return x.key === k; })[0];
        if (!p) { html += card('<h3>' + esc(t("x.p.plan" + k)) + '</h3><p class="ka-small ka-muted">' + esc(t("x.p.noVariant")) + '</p>', "ka-plan-v"); return; }
        var aIds = A.map(function (s) { return s.id; });
        html += card('<h3>' + esc(t("x.p.plan" + k)) + ' <span class="ka-small ka-muted">' + esc(t("x.p.diff", { n: p.diff })) + '</span></h3><div class="ka-chips">' + p.secs.map(function (s) {
          var changed = aIds.indexOf(s.id) < 0;
          return '<span class="ka-chip' + (changed ? " chg" : "") + '" title="' + esc(t.times(s)) + '"><b>' + esc(secLabel(s)) + '</b>' + (changed ? ' <small>' + esc(t.times(s)) + '</small>' : "") + '</span>';
        }).join(" ") + '</div>', "ka-plan-v");
      });

      /* kayıt günü listesi */
      var L = X.entryList(C, A, V, u.full), text = entryText(C, L, V);
      html += card('<h3>' + esc(t("x.p.listT")) + '</h3><p class="ka-small ka-muted">' + esc(t("x.p.listP")) + '</p><ol class="ka-entry">' + L.map(function (e) {
        var fb = e.alts.length ? t("x.p.ifFullAlt", { l: e.alts.slice(0, 3).map(secLabel).join(" / ") })
          : (e.planB ? t("x.p.ifFullB", { s: secLabel(e.planB) }) : (e.planC ? t("x.p.ifFullC", { s: secLabel(e.planC) }) : t("x.p.ifFullNone")));
        return '<li><b>' + esc(secLabel(e.sec)) + '</b>' + (e.retake ? " " + pill("error", t("x.e.tagRetake")) : "") + '<div class="ka-small">' + esc(fb) + '</div></li>';
      }).join("") + '</ol><div class="ka-btns">' + btn("copy", t("x.p.copy"), "", "primary") + '</div><textarea class="ka-copy-src" readonly aria-hidden="true" tabindex="-1">' + esc(text) + '</textarea>');
      html += fullListHtml(C);
      return html;
    }
    function fullListHtml(C) {
      if (!P.ui.full.length) return "";
      return '<div class="ka-alert info ka-small"><b>' + esc(t("x.p.fullListT")) + '</b> ' + P.ui.full.map(function (id) {
        var s = C.secById(id);
        return '<span class="ka-chip">' + esc(s ? secLabel(s) : id) + '<button type="button" class="ka-chip-x" data-act="unfull" data-id="' + esc(id) + '" aria-label="' + esc(t("x.p.unfull")) + '">&times;</button></span>';
      }).join(" ") + '</div>';
    }
    function entryText(C, L, V) {
      var lines = [t("x.p.txtTitle", { t: C.term || "" }), "", t("x.p.txtA")];
      L.forEach(function (e, i) {
        var fb = e.alts.length ? t("x.p.ifFullAlt", { l: e.alts.slice(0, 3).map(secLabel).join(" / ") })
          : (e.planB ? t("x.p.ifFullB", { s: secLabel(e.planB) }) : (e.planC ? t("x.p.ifFullC", { s: secLabel(e.planC) }) : t("x.p.ifFullNone")));
        var s = e.sec;
        lines.push((i + 1) + ". " + secLabel(s) + "  [" + t.times(s) + "]  → " + fb);
      });
      V.plans.forEach(function (p) {
        if (p.key === "A") return;
        lines.push(""); lines.push(t("x.p.plan" + p.key) + ": " + p.secs.map(secLabel).join(", "));
      });
      lines.push(""); lines.push(t("x.p.txtNote"));
      return lines.join("\n");
    }

    /* ---------- 5) Yol Haritası ---------- */
    function renderRoadmap(C) {
      if (!C.M.hasCurriculum) return empty(t("x.r.emptyT"), t("x.r.emptyP"), '<p class="ka-how">' + esc(t("x.d.curHow")) + '</p>');
      var u = P.ui, modes = [{ v: "suggest", label: t("rm.mode.suggest") }];
      if (C.data.registration) modes.push({ v: "reg", label: t("rm.mode.reg") });
      if (u.cart.length) modes.push({ v: "plan", label: t("rm.mode.plan") });
      /* varsayılan: önerilen (geçerli) plan; kayıt/plan modları "ya böyle kalırsa?" karşılaştırması için */
      var mode = u.rm.mode && modes.some(function (m) { return m.v === u.rm.mode; }) ? u.rm.mode : "suggest";
      var planCodes = mode === "plan" ? (planRes().ranked.length ? planA().map(function (s) { return s.code; }) : u.cart) : null;
      var opts = X.roadmapOpts(C, mode, planCodes, u.rm);
      var B = memo("rm|" + mode + "|" + JSON.stringify(opts.fixedTerm0) + "|" + opts.expected + "|" + JSON.stringify(u.rm.fail), function () { return K.roadmapBundle(C.M, opts); });
      var html = '<p class="ka-small ka-muted">' + esc(t("rm.intro")) + '</p>';
      if (!C.isME) html += '<div class="ka-alert info ka-small">' + esc(t("x.r.noKn")) + '</div>';
      if (!C.termKnown) html += '<div class="ka-alert info ka-small">' + esc(t("x.r.termGuess", { t: K.termLabel(C.start.year, C.start.season, 0)[t.lang] })) + '</div>';
      html += RV.render(B, { t: t, lang: t.lang, num2: t.num2, name: function (code) { return C.name(code, t.lang); }, M: C.M,
        expected: opts.expected, mode: mode, modes: modes, failNow: u.rm.fail });
      return html;
    }

    /* ---------- 6) Devamsızlık ---------- */
    function n1(x) { return x === null || x === undefined ? "-" : (Math.round(x * 10) / 10).toString().replace(".", t.lang === "tr" ? "," : "."); }
    function renderAttend(C) {
      if (!C.data.attendance) return empty(t("x.a.emptyT"), t("x.a.emptyP"), '<p class="ka-how">' + esc(t("x.d.kh.attendance")) + '</p>');
      var A = memo("att", function () { return MO.attendance(C); }), html = "";
      html += '<div class="ka-sum ' + (A.over ? "bad" : (A.warn ? "warn" : "ok")) + '"><div class="ka-sum-n">' +
        esc(A.over ? t("x.a.sumOver", { n: A.over, w: A.warn }) : (A.warn ? t("x.a.sumWarn", { n: A.warn }) : t("x.a.sumOk"))) + '</div>' +
        '<div class="ka-small ka-muted">' + esc(t("x.a.marked")) + '</div></div>';
      html += card(A.rows.map(function (r) {
        var lvl = { over: "error", warn: "warn", ok: "ok", info: "info", free: "info" }[r.level];
        var h = '<div class="ka-row lvl-' + (lvl === "ok" ? "ok" : lvl) + '"><div class="ka-row-h"><b>' + esc(r.code) + '</b> <span class="ka-rn">' + esc(C.name(r.code, t.lang) || r.name) + '</span>' +
          pill(lvl, t("x.a.lvl." + r.level)) + '</div>';
        if (r.level === "free") return h + '<div class="ka-small">' + esc(t("x.a.free")) + '</div></div>';
        if (r.allowed !== null && r.allowed !== undefined && r.status === "ok") {
          h += '<div class="ka-meter' + (r.level === "over" ? " over" : (r.level === "warn" ? " warn" : "")) + '" role="img" aria-label="' + esc(t("x.a.usedOf", { u: n1(r.used), a: n1(r.allowed) })) + '"><span style="width:' +
            Math.min(100, r.used / Math.max(1, r.allowed) * 100).toFixed(1) + '%"></span></div>';
          h += '<div class="ka-small"><b>' + esc(t("x.a.usedOf", { u: n1(r.used), a: n1(r.allowed) })) + '</b>' + (r.theory && r.theory.hours > 0 ? ' <span class="ka-muted">' + esc(t("x.a.theory", { p: r.theory.pct, h: r.theory.hours })) + '</span>' : "") + '</div>';
          if (r.level === "over") h += '<div class="ka-small ka-bad-t">' + esc(t("x.a.over", { o: n1(r.used - r.allowed) })) + '</div>' +
            (r.split && r.combined && r.used <= r.combined ? '<div class="ka-small ka-muted">' + esc(t("x.a.splitNote", { c: n1(r.combined) })) + '</div>' : "");
          else h += '<div class="ka-small">' + esc(t("x.a.left", { h: n1(r.remaining) })) +
            (r.sessions !== undefined ? " " + esc(t(r.sessions ? "x.a.sessions" : "x.a.sessions0", { n: r.sessions, b: r.blockHours })) : (r.weeksLeft !== undefined ? " " + esc(t("x.a.weeks", { n: r.weeksLeft })) : "")) + '</div>';
        } else if (r.status === "noEntry") {
          h += '<div class="ka-small">' + esc(t("x.a.noEntry")) + (r.allowed ? " " + esc(t("x.a.allowed", { a: n1(r.allowed) })) + (r.blockHours ? " " + esc(t("x.a.sessionsAll", { n: Math.floor(r.allowed / r.blockHours), b: r.blockHours })) : "") : "") + '</div>';
        } else h += '<div class="ka-small ka-muted">' + esc(t("x.a.noLimit", { r: r.raw || "-" })) + '</div>';
        if (r.practice) h += '<div class="ka-small ka-muted">' + esc(t("x.a.practice", { m: n1(r.practice.max), p: r.practice.pct, h: r.practice.hours })) + (r.combined ? " · " + esc(t("x.a.combined", { c: n1(r.combined) })) : "") + '</div>';
        if (r.sec) h += '<div class="ka-small ka-muted">' + esc(t("x.a.secInfo", { s: r.sec, w: r.weekly })) + '</div>';
        return h + '</div>';
      }).join(""));
      html += '<div class="ka-alert info ka-small"><b>' + esc(t("x.a.ruleT")) + '</b> ' + esc(t("x.a.rule")) + '</div>';
      return html;
    }

    /* ---------- 7) Not hesabı ---------- */
    function renderGrades(C) {
      if (!C.data.grades) return empty(t("x.g2.emptyT"), t("x.g2.emptyP"), '<p class="ka-how">' + esc(t("x.d.kh.grades")) + '</p>');
      var G = MO.grades(C, P.ui), u = P.ui, html = "";
      html += card('<h3>' + esc(t("x.g2.targetsT")) + '</h3><div class="ka-targets">' + Object.keys(u.gt).map(function (k) {
        return '<label>' + esc(t("x.g2.t." + k)) + ' ≥ <input type="number" min="0" max="100" step="1" data-gt="' + esc(k) + '" value="' + esc(u.gt[k]) + '"></label>';
      }).join("") + '</div><p class="ka-small ka-muted">' + esc(t("x.g2.relNote")) + '</p>');
      G.rows.forEach(function (g) {
        var r = g.row, h = '<div class="ka-row-h"><b>' + esc(r.code + (r.no ? "(" + r.no + ")" : "")) + '</b> <span class="ka-rn">' + esc(C.name(r.code, t.lang) || r.name) + '</span>' +
          (g.finished ? pill(/kald|fail/i.test(r.status) ? "error" : "ok", (r.letter || "") + " · " + r.status) : "") + '</div>';
        h += '<div class="ka-small ka-muted">' + esc(t("x.g2.src." + g.src)) + '</div>';
        /* bileşen tablosu */
        var keys = g.comps.map(function (c) { return c.key; });
        g.unmatched.forEach(function (e) { var k = MO.compKey(e.name) || "other"; if (keys.indexOf(k) < 0) keys.push(k); });
        if (keys.indexOf("final") < 0) keys.push("final");
        /* Bologna ağırlığı yoksa sık bileşenleri boş giriş olarak göster */
        if (g.src !== "bologna" || g.missing) ["mid", "quiz", "hw", "project"].forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
        keys.sort(function (a, b) { return MO.COMPS.indexOf(a) - MO.COMPS.indexOf(b); });
        h += '<table class="ka-gt"><thead><tr><th>' + esc(t("x.g2.comp")) + '</th><th>' + esc(t("x.g2.weight")) + '</th><th>' + esc(t("x.g2.score")) + '</th><th>' + esc(t("x.g2.cls")) + '</th></tr></thead><tbody>' +
          keys.map(function (k) {
            var c = g.comps.filter(function (x) { return x.key === k; })[0], its = g.items.filter(function (x) { return x.key === k; });
            if (!c) its = g.unmatched.filter(function (e) { return (MO.compKey(e.name) || "other") === k; }).map(function (e) { return { score: e.score, classAvg: e.classAvg, graded: typeof e.score === "number" }; });
            var sc = its.length ? its.map(function (x) { return x.graded ? n1(x.score) : "—"; }).join(" / ") : "—";
            var ca = its.filter(function (x) { return typeof x.classAvg === "number"; }).map(function (x) { return n1(x.classAvg); }).join(" / ") || "—";
            return '<tr><td>' + esc(t("x.comp." + k)) + (c && c.n > 1 ? ' <small>×' + c.n + '</small>' : "") + (c && c.count > 4 && c.n !== c.count ? ' <small>(' + esc(t("x.g2.agg", { n: c.count })) + ')</small>' : "") + '</td><td><input type="number" min="0" max="100" step="1" data-gw="' + esc(r.code + "|" + k) + '" value="' + (c ? esc(c.pct) : "") + '" aria-label="' + esc(t("x.g2.weightAria", { c: r.code, k: t("x.comp." + k) })) + '">%</td><td>' + esc(sc) + '</td><td class="ka-muted">' + esc(ca) + '</td></tr>';
          }).join("") + '</tbody></table>';
        if (g.missing) h += '<div class="ka-alert warn ka-small">' + esc(t("x.g2.missing")) + '</div>';
        else if (g.badSum) h += '<div class="ka-alert warn ka-small">' + esc(t("x.g2.badSum", { s: n1(g.sum) })) + '</div>';
        if (!g.missing && !g.badSum) {
          h += '<div class="ka-small">' + esc(t("x.g2.now", { p: n1(g.current), w: n1(g.gradedW) })) + (g.avg !== null ? " " + esc(t("x.g2.avg", { a: n1(g.avg) })) : "") +
            (g.classAvg !== null ? " " + esc(t("x.g2.clsAvg", { a: n1(g.classAvg) })) : "") + '</div>';
          if (!g.finished && g.finalW > 0) {
            h += '<ul class="ka-needs">' + g.needs.map(function (n) {
              var cls = n.ok ? "ok" : (n.impossible ? "bad" : (n.need > 80 ? "warn" : ""));
              var msg = n.ok ? t("x.g2.needOk") : (n.impossible ? t("x.g2.needNo", { n: n1(n.need) }) : t("x.g2.need", { n: Math.ceil(n.need) }));
              return '<li class="' + cls + '"><b>' + esc(t("x.g2.t." + n.label)) + ' (≥ ' + esc(n.target) + ')</b> ' + esc(msg) + '</li>';
            }).join("") + '</ul><p class="ka-small ka-muted">' + esc(t("x.g2.assume", { f: n1(g.finalW), o: n1(g.pendingW) })) + '</p>';
          } else if (!g.finished) h += '<div class="ka-small ka-muted">' + esc(t("x.g2.noFinal")) + '</div>';
        }
        html += card(h, "ka-gcard");
      });
      html += '<p class="ka-small ka-muted">' + esc(t("x.g2.disclaimer")) + '</p>';
      return html;
    }

    /* ---------- 8) Takvim ---------- */
    function calData(C) { var c = P.ui.cal; return MO.calendar(C, { start: c.start, end: c.end, lang: t.lang }); }
    function renderCal(C) {
      var d = C.data, cal = calData(C), u = P.ui, html = "";
      if (!cal.classes.length && !cal.exams.length && !cal.deadlines.length)
        return empty(t("x.k.emptyT"), t("x.k.emptyP"), '<p class="ka-how">' + esc(t("x.d.kh.mytimetable")) + '</p><p class="ka-how">' + esc(t("x.d.kh.exams")) + '</p><p class="ka-how">' + esc(t("x.d.kh.acadcal")) + '</p>');
      html += card('<h3>' + esc(t("x.k.rangeT")) + '</h3><div class="ka-range"><label>' + esc(t("x.k.start")) + ' <input type="date" data-cal="start" value="' + esc(cal.range.start) + '"></label>' +
        '<label>' + esc(t("x.k.end")) + ' <input type="date" data-cal="end" value="' + esc(cal.range.end) + '"></label></div>' +
        '<p class="ka-small ka-muted">' + esc(t("x.k.range." + cal.range.src)) + '</p>' +
        '<label class="ka-check ka-small"><input type="checkbox" data-cal="alarms"' + (u.cal.alarms !== false ? " checked" : "") + '> ' + esc(t("x.k.alarms")) + '</label>');
      var weekly = {};
      cal.classes.forEach(function (c) { (weekly[c.code + "(" + c.no + ")"] = weekly[c.code + "(" + c.no + ")"] || []).push(t.day(c.day) + " " + K.fmt(c.start) + "–" + K.fmt(c.end)); });
      html += card('<h3>' + esc(t("x.k.classesT", { n: Object.keys(weekly).length })) + '</h3>' + (Object.keys(weekly).length ?
        '<ul class="ka-plain ka-small">' + Object.keys(weekly).sort().map(function (k) { return '<li><b>' + esc(k) + '</b> ' + esc(weekly[k].join(", ")) + '</li>'; }).join("") + '</ul>' +
        '<p class="ka-small ka-muted">' + esc(t("x.k.src." + cal.classSrc)) + '</p>' : '<p class="ka-small ka-muted">' + esc(t("x.k.noClasses")) + '</p>'));
      html += card('<h3>' + esc(t("x.k.examsT", { n: cal.exams.length })) + '</h3>' + (cal.exams.length ? '<ul class="ka-plain ka-small">' + cal.exams.map(function (e) {
        return '<li><b>' + esc(e.code) + '</b> ' + esc(t("x.exam." + e.type)) + ' · ' + esc(e.date.split("-").reverse().join(".")) + (e.start ? " " + esc(e.start) + (e.end ? "–" + esc(e.end) : "") : "") + (e.room ? " · " + esc(e.room) : "") + '</li>';
      }).join("") + '</ul>' : '<p class="ka-small ka-muted">' + esc(d.exams ? t("x.k.examsEmpty") : t("x.d.kw.exams")) + '</p>'));
      html += card('<h3>' + esc(t("x.k.deadT", { n: cal.deadlines.length })) + '</h3>' + (cal.deadlines.length ? '<ul class="ka-plain ka-small">' + cal.deadlines.map(function (x) {
        return '<li><b>' + esc(x.name) + '</b> ' + esc(x.start.slice(0, 10).split("-").reverse().join(".")) + (x.end && x.end.slice(0, 10) !== x.start.slice(0, 10) ? " – " + esc(x.end.slice(0, 10).split("-").reverse().join(".")) : "") + '</li>';
      }).join("") + '</ul>' : '<p class="ka-small ka-muted">' + esc(t("x.d.kw.acadcal")) + '</p>'));
      html += '<div class="ka-btns">' + btn("ics", t("x.k.download"), "", "primary") + '</div><p class="ka-small ka-muted">' + esc(t("x.k.how")) + '</p>';
      return html;
    }
    function downloadICS(C) {
      var cal = calData(C);
      var r = ICS.build({ name: t("x.k.calName", { t: C.term || "" }), classes: cal.classes, exams: cal.exams, deadlines: cal.deadlines, range: cal.range,
        alarms: P.ui.cal.alarms !== false, labels: { exam: function (ty) { return t("x.exam." + ty); }, classDesc: t("x.k.classDesc"), alarmDay: t("x.k.alarmDay"),
          alarmHour: t("x.k.alarmHour"), classCat: t("x.k.catClass"), examCat: t("x.k.catExam"), deadlineCat: t("x.k.catDead") } });
      P.lastICS = r.text;
      var blob = new Blob([r.text], { type: "text/calendar;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = "kayit-asistani-" + (C.term || "takvim").toLowerCase().replace(/ı/g, "i").replace(/ü/g, "u").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".ics";
      sr.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 1500);
      toast(t("x.k.done", { c: r.count.classes, e: r.count.exams, d: r.count.deadlines }));
    }

    /* ---------- olaylar ---------- */
    function toast(msg, kind, ms) {
      var el = $(".ka-toast");
      el.textContent = msg; el.hidden = false;
      el.className = "ka-toast" + (kind ? " " + kind : "");
      clearTimeout(P.toastT); P.toastT = setTimeout(function () { el.hidden = true; }, ms || 2600);
    }
    function addToCart(codes) {
      var n = 0;
      codes.forEach(function (c) { if (P.ui.cart.indexOf(c) < 0) { P.ui.cart.push(c); n++; } });
      return n;
    }
    function copyText(text) {
      function fallback() {
        var ta = sr.querySelector(".ka-copy-src");
        if (!ta) return false;
        ta.removeAttribute("aria-hidden"); ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        ta.setAttribute("aria-hidden", "true");
        return ok;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(t("x.copied")); }, function () { toast(fallback() ? t("x.copied") : t("x.copyFail")); });
      } else toast(fallback() ? t("x.copied") : t("x.copyFail"));
    }
    function act(a, el) {
      var u = P.ui, C = ctx();
      switch (a) {
        case "toggle": u.open = !u.open; break;
        case "close": u.open = false; break;
        case "tab": u.tab = el.getAttribute("data-tab"); u.open = true; break;
        case "lang": u.lang = u.lang === "tr" ? "en" : "tr"; t = makeT(u.lang); break;
        case "open-site": window.open("https://boraykaskavalci.github.io/kayit-asistani/?import=ext", "_blank", "noopener"); return;
        case "clear": P.clearArm = true; render(); return;
        case "clear-no": P.clearArm = false; render(); return;
        case "clear-yes":
          P.clearArm = false;
          chrome.runtime.sendMessage({ type: "ka:clear" }).then(function () { toast(t("x.cleared")); }, function () {
            st.remove([DATA_KEY, UI_KEY]).then(function () { toast(t("x.cleared")); });
          });
          return;
        case "cart-add": addToCart([el.getAttribute("data-code")]); toast(t("x.added", { c: el.getAttribute("data-code") })); break;
        case "cart-remove": u.cart = u.cart.filter(function (c) { return c !== el.getAttribute("data-code"); }); break;
        case "cart-clear": u.cart = []; u.pick = null; break;
        case "cart-add-retakes": {
          var E = X.eligible(C), n = addToCart(E.groups.retake.filter(function (x) { return x.sections; }).map(function (x) { return x.code; }));
          toast(t("x.addedN", { n: n })); break;
        }
        case "cart-import-reg": {
          var regCodes = (C.data.registration ? C.data.registration.rows : []).map(function (r) { return r.code; });
          u.cart = []; addToCart(regCodes);
          u.pick = (C.data.registration ? C.data.registration.rows : []).map(function (r) { return r.code + "#" + r.no; });
          u.tab = "plan"; toast(t("x.imported", { n: regCodes.length })); break;
        }
        case "plan-pick": {
          var r = planRes().ranked[parseInt(el.getAttribute("data-i"), 10)];
          if (r) u.pick = r.combo.map(function (s) { return s.id; });
          break;
        }
        case "unfull": u.full = u.full.filter(function (id) { return id !== el.getAttribute("data-id"); }); P.cache = {}; break;
        case "ics": downloadICS(C); return;
        case "copy": copyText((sr.querySelector(".ka-copy-src") || {}).value || ""); return;
        case "rm-fail": {
          var code = el.getAttribute("data-code");
          if (u.rm.fail[code]) delete u.rm.fail[code]; else u.rm.fail[code] = true;
          break;
        }
        default: return;
      }
      saveUI(); render();
    }
    sr.addEventListener("click", function (e) {
      var el = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!el || !sr.contains(el)) return;
      e.preventDefault();
      act(el.getAttribute("data-act"), el);
    });
    sr.addEventListener("change", function (e) {
      var el = e.target, u = P.ui;
      if (el.hasAttribute("data-pref")) { u.prefs[el.getAttribute("data-pref")] = el.checked; u.pick = null; }
      else if (el.hasAttribute("data-full")) {
        var id = el.getAttribute("data-full");
        if (el.checked && u.full.indexOf(id) < 0) u.full.push(id);
        if (!el.checked) u.full = u.full.filter(function (x) { return x !== id; });
        toast(t("x.p.replanned"));
      } else if (el.getAttribute("data-act-change") === "show-passed") u.showPassed = el.checked;
      else if (el.getAttribute("data-rm") === "grade") u.rm.expected = parseFloat(el.value) || 2;
      else if (el.getAttribute("data-rm") === "mode") { u.rm.mode = el.value; u.rm.fail = {}; }
      else if (el.hasAttribute("data-gw")) {
        var gk = el.getAttribute("data-gw").split("|"), code = gk[0], comp = gk[1];
        u.gw[code] = u.gw[code] || {};
        u.gw[code][comp] = el.value === "" ? null : Math.max(0, Math.min(100, parseFloat(el.value) || 0));
      } else if (el.hasAttribute("data-gt")) { var v = parseFloat(el.value); if (!isNaN(v)) u.gt[el.getAttribute("data-gt")] = Math.max(0, Math.min(100, v)); }
      else if (el.hasAttribute("data-cal")) {
        var ck = el.getAttribute("data-cal");
        if (ck === "alarms") u.cal.alarms = el.checked; else u.cal[ck] = el.value;
      }
      else return;
      saveUI(); render();
    });
    sr.addEventListener("input", function (e) {
      if (!e.target.hasAttribute("data-q-input")) return;
      P.ui.q = e.target.value; applyFilter();
      clearTimeout(P.qT); P.qT = setTimeout(saveUI, 400);
    });
    sr.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && P.ui.open) { P.ui.open = false; saveUI(); render(); var l = $(".ka-launch"); if (l) l.focus(); }
    });
    P.open = function (tab) {
      if (tab && TABS.indexOf(tab) >= 0) P.ui.tab = tab;
      P.ui.open = true; saveUI(); render();
    };
    P.onCollected = function (msg) {
      if (msg && msg.kind === "registration") {
        var flag = "ka.autoKontrol";
        var seen = false;
        try { seen = root.sessionStorage.getItem(flag) === "1"; root.sessionStorage.setItem(flag, "1"); } catch (e) { seen = !!P.autoSeen; }
        P.autoSeen = true;
        if (!seen) { P.ui.open = true; P.ui.tab = "check"; saveUI(); }
      }
      if (msg && msg.summary && P.ui.open) {
        var s = msg.summary, k = msg.kind;
        toast(t("x.got." + k, { y: s.classYear || "", n: s.sections || s.rows || s.items || 0 }));
      }
      schedule();
    };
    P.reload = function () {
      st.get([DATA_KEY, UI_KEY]).then(function (o) { setData(o[DATA_KEY]); P.ui = normUI(o[UI_KEY], P.ui.lang); P.ui.open = true; t = makeT(P.ui.lang); render(); });
    };
    /* OBS oturum sayacı: 5 dk kala bir kez uyar (hiçbir şeye tıklamaz, oturumu uzatmaz) */
    P.session = function (sec) {
      if (sec === null || sec === undefined) return;
      if (sec > 300) { P.sessWarned = false; return; }
      if (P.sessWarned || sec <= 0) return;
      P.sessWarned = true;
      toast(t("x.sess", { m: Math.max(1, Math.ceil(sec / 60)) }), "warn", 12000);
    };
    P.host = host; P.root = sr;
    P.state = function () { return P; };
    root.__kaPanel = P;
    return P;
  }

  root.KayitPanel = { mount: mount, makeT: makeT, issueText: issueText, globalText: globalText, miniGrid: miniGrid, esc: esc };
})(typeof self !== "undefined" ? self : this);
