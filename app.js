/* Kayıt Asistanı - uygulama mantığı.
   Katalog, kural ve öğrenci verisi: data.js (window.KAYIT_DATA).
   Arayüz metinleri: i18n.js (window.KAYIT_I18N, TR + EN). Ağ isteği yapılmaz. */
(function () {
  "use strict";

  var D = window.KAYIT_DATA, I = window.KAYIT_I18N, R = D.rules, RL = R.limit;
  /* Ortak kural motoru (Chrome eklentisiyle paylaşılır): extension/lib/kayit-core.js */
  var K = window.KayitCore, RV = window.KayitRoadmapView;
  var DAYS = R.timetable.days;
  var KEY = "kayitAsistani.v3", LANG_KEY = "kayitAsistani.lang";
  var TABS = ["home", "plan", "status", "flow", "reg", "att", "grades", "cal", "grad", "about"];
  var MO = window.KayitMore, ICS = window.KayitICS, CU = D.current || null;
  var MAX_SOL = 600, NODE_CAP = 250000, KEEP = 50, PAGE = 6;

  /* ---------- dil / yardımcılar ---------- */
  var LANG = "tr";
  try { var sv = window.localStorage.getItem(LANG_KEY); if (sv === "tr" || sv === "en") LANG = sv; } catch (e) { /* yoksay */ }
  function t(key, v) {
    var d = I[LANG] || I.tr, s = d[key];
    if (s === undefined) s = I.tr[key];
    if (s === undefined) return key;
    if (v) s = s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined ? v[k] : m; });
    return s;
  }
  function L(o) { return o && typeof o === "object" ? (o[LANG] || o.tr) : o; }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function fold(s) {
    return String(s).toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
      .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
  }
  function toMin(x) { var p = x.split(":"); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function fmt(m) { return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); }
  /* TR: Türkçe ünlü uyumuna göre "13:40'ta" */
  function atTime(m) {
    if (LANG !== "tr") return fmt(m);
    var sfx = { 0: "da", 10: "da", 20: "de", 30: "ta", 40: "ta", 50: "de" }[m % 60] || "da";
    return fmt(m) + "'" + sfx;
  }
  function num2(n) { return n.toFixed(2).replace(".", LANG === "tr" ? "," : "."); }
  function locale() { return LANG === "tr" ? "tr-TR" : "en-GB"; }
  function instr(name) {
    if (LANG === "tr") return name;
    I.titles.forEach(function (p) { name = name.replace(p[0], p[1]); });
    return name;
  }
  function cname(c) { return LANG === "en" ? c.nameEn : c.nameTr; }
  function dayShort(d) { return t("day." + d); }
  function dayLong(d) { return t("dayl." + d); }
  function unitName() { return t("unit." + RL.unit); }
  function cu(c) { return RL.unit === "credits" ? c.credits : c.ects; }
  function secCode(s) { return s.code + "-" + s.no; }
  function slotText(sl) { return dayShort(sl.day) + " " + fmt(sl.start) + "-" + fmt(sl.end); }
  function timesList(s) { return s.slots.length ? s.slots.map(slotText).join(", ") : t("sec.noTimes"); }

  /* ---------- katalog indeksleri ---------- */
  var byCode = {}, secById = {};
  D.courses.forEach(function (c) {
    byCode[c.code] = c;
    c.sections.forEach(function (s) {
      s.id = c.code + "#" + s.no; s.code = c.code;
      s.slots = s.times.map(function (x) {
        var m = /^(\S+)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(x);
        return { day: m[1], start: toMin(m[2]), end: toMin(m[3]) };
      });
      secById[s.id] = s;
    });
  });
  var extra = D.requirements.requiredExtra || {};
  function courseName(code) { return byCode[code] ? cname(byCode[code]) : (extra[code] ? L(extra[code].name) : ""); }
  function ectsOf(code) { return byCode[code] ? byCode[code].ects : (extra[code] ? extra[code].ects : 0); }
  function isOffered(c) { return c.sections.length > 0; }

  /* ---------- öğrenci: notlar, GNO, statü ---------- */
  var attempts = {}, passed = {};
  D.student.completed.forEach(function (r) {
    (attempts[r.code] = attempts[r.code] || []).push(r);
    if (R.passingGrades.indexOf(r.grade) >= 0) passed[r.code] = r;
  });
  function lastAttempt(code) { var a = attempts[code]; return a ? a[a.length - 1] : null; }
  function isPassed(code) { return !!passed[code]; }
  function gradeOf(code) { var a = lastAttempt(code); return a ? a.grade : ""; }
  /* m.21(6): tekrarlanan derslerde son not GNO'ya girer */
  function gpa() {
    var pts = 0, ects = 0;
    Object.keys(attempts).forEach(function (code) {
      var g = gradeOf(code), p = R.gradePoints[g], e = ectsOf(code);
      if (p === undefined) return;
      pts += p * e; ects += e;
    });
    if (!ects) return 0;
    var f = Math.pow(10, R.gpaDecimals);
    return Math.floor(pts / ects * f + 1e-9) / f;   /* kesme */
  }
  function earnedEcts() { var n = 0; Object.keys(passed).forEach(function (c) { n += ectsOf(c); }); return n; }
  function standing() {
    if (D.student.completedSemesters < RL.statusFromCompletedSemesters) {
      return { key: "first", label: { tr: "İlk yıl (statü uygulanmaz)", en: "First year (standing not applied)" }, max: RL.firstYearMax, prioritize: false };
    }
    var g = gpa(), list = RL.statuses.slice().sort(function (a, b) { return b.minGpa - a.minGpa; });
    for (var i = 0; i < list.length; i++) if (g >= list[i].minGpa) return list[i];
    return list[list.length - 1];
  }
  function retakeKind(code) {
    if (!attempts[code]) return null;
    if (!passed[code]) return "failed";
    return R.improvableGrades.indexOf(gradeOf(code)) >= 0 ? "improve" : null;
  }
  function isFRetake(code) { return !!attempts[code] && !passed[code] && R.retakeOverlapGrades.indexOf(gradeOf(code)) >= 0; }
  function isFirstTime(code) { return !attempts[code]; }

  /* ---------- durum (localStorage) ---------- */
  function defaultState() {
    return { cart: [], fullIds: [], scenario: "", introDismissed: false, limitOverride: null, tab: "home", sv: "elig", regDate: "",
      prefs: { days: true, early: false, gaps: true, free: "" },
      rm: { expected: 2, fail: {}, mode: "" }, gx: {}, gtarget: "D",
      flow: { status: "draft", studentNote: "", advisorNote: "", submittedAt: null, decidedAt: null } };
  }
  var isFresh = false;
  function load() {
    var s = defaultState();
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) isFresh = true;
      if (raw) {
        var p = JSON.parse(raw);
        if (Array.isArray(p.cart)) s.cart = p.cart.filter(function (id) { return secById[id]; });
        if (typeof p.scenario === "string") s.scenario = p.scenario;
        if (p.introDismissed === true) s.introDismissed = true;
        if (Array.isArray(p.fullIds)) s.fullIds = p.fullIds.filter(function (id) { return secById[id]; });
        if (typeof p.limitOverride === "number") s.limitOverride = p.limitOverride;
        if (TABS.indexOf(p.tab) >= 0) s.tab = p.tab;
        if (["elig", "cart", "browse"].indexOf(p.sv) >= 0) s.sv = p.sv;
        if (typeof p.regDate === "string") s.regDate = p.regDate;
        if (p.prefs && typeof p.prefs === "object") for (var k in s.prefs) if (p.prefs[k] !== undefined) s.prefs[k] = p.prefs[k];
        if (p.flow && typeof p.flow === "object") for (var f in s.flow) if (p.flow[f] !== undefined) s.flow[f] = p.flow[f];
        if (p.gx && typeof p.gx === "object") s.gx = p.gx;
        if (typeof p.gtarget === "string") s.gtarget = p.gtarget;
        if (p.rm && typeof p.rm === "object") {
          if (typeof p.rm.expected === "number") s.rm.expected = p.rm.expected;
          if (p.rm.fail && typeof p.rm.fail === "object") s.rm.fail = p.rm.fail;
          if (p.rm.mode === "suggest" || p.rm.mode === "cart") s.rm.mode = p.rm.mode;
        }
      }
    } catch (e) { /* localStorage yok/engelli */ }
    return s;
  }
  var state = load();
  function save() { try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* yoksay */ } }

  var previewId = null, autoProposal = null, autoShown = PAGE, regTimer = null;

  /* ---------- sepet ---------- */
  function cartSections() { return state.cart.map(function (id) { return secById[id]; }).filter(Boolean); }
  function inCart(id) { return state.cart.indexOf(id) >= 0; }
  function cartHasCourse(code) { return cartSections().some(function (s) { return s.code === code; }); }
  function cartTotals() {
    var u = 0, e = 0;
    cartSections().forEach(function (s) { u += cu(byCode[s.code]); e += byCode[s.code].ects; });
    return { units: u, ects: e, count: state.cart.length };
  }
  function limitAuto() { return standing().max; }
  function limitNow() { return state.limitOverride !== null ? state.limitOverride : limitAuto(); }

  function afterCartChange(msg, keepScenario) {
    autoProposal = null; autoShown = PAGE;
    if (!keepScenario) state.scenario = "";
    var reset = state.flow.status !== "draft";
    if (reset) state.flow = { status: "draft", studentNote: state.flow.studentNote, advisorNote: "", submittedAt: null, decidedAt: null };
    save(); renderAll();
    if (msg) toast(msg + (reset ? " " + t("toast.flowReset") : ""));
  }
  function addSection(id) {
    var s = secById[id]; if (!s) return;
    state.cart = state.cart.filter(function (x) { return secById[x].code !== s.code; });
    state.cart.push(id);
    afterCartChange(t("toast.added", { c: s.code, n: s.no }) + (quota(s).level === "full" ? " " + t("toast.addedFull") : ""));
  }
  function removeSection(id) {
    var s = secById[id];
    state.cart = state.cart.filter(function (x) { return x !== id; });
    afterCartChange(s ? t("toast.removed", { c: s.code }) : "");
  }

  /* ---------- çakışma (m.29: tekrar dersi istisnası dahil) ---------- */
  function overlapsOf(a, b) { return K.overlaps(a, b); }
  /* soft: F/U'lu tekrar dersi ile ilk kez alınan ders arasındaki çakışma (izinli) */
  function isSoft(a, b) {
    return (isFRetake(a.code) && isFirstTime(b.code)) || (isFRetake(b.code) && isFirstTime(a.code));
  }
  function pairHard(a, b) { return overlapsOf(a, b).length > 0 && !isSoft(a, b); }
  function pairSoft(a, b) { return overlapsOf(a, b).length > 0 && isSoft(a, b); }
  function findConflicts(secs) { return K.findConflicts(secs, isSoft); }
  function conflictMessage(cf) {
    var o = cf.overlaps[0];
    var m = t(cf.soft ? "conflict.soft" : "conflict.hard", { a: cf.a.code, b: cf.b.code, day: dayLong(o.day), time: atTime(o.start) });
    if (cf.overlaps.length > 1) m += " " + t("conflict.more", { n: cf.overlaps.length - 1 });
    return m;
  }
  function conflictsWithCart(sec) {
    var out = [];
    cartSections().forEach(function (c) {
      if (c.code === sec.code) return;
      var o = overlapsOf(sec, c);
      if (o.length) out.push({ a: sec, b: c, overlaps: o, soft: isSoft(sec, c) });
    });
    return out;
  }

  /* ---------- ön koşul ---------- */
  function prereqStatus(course) {
    var list = course.prereq.map(function (code) {
      var st;
      if (passed[code]) st = "ok"; else if (attempts[code]) st = "failed";
      else if (cartHasCourse(code)) st = "concurrent"; else st = "missing";
      return { code: code, name: courseName(code), state: st, grade: gradeOf(code), retaking: cartHasCourse(code) };
    });
    /* özel şart (ör. ME 4910): en az X AKTS + belirli yarıyılların zorunlu dersleri geçilmiş */
    var sp = R.specialPrereqs && R.specialPrereqs[course.code];
    if (sp) {
      var e = earnedEcts();
      var miss = D.courses.filter(function (c) { return c.type === "zorunlu" && sp.requiredSemesters.indexOf(c.semester) >= 0 && !passed[c.code]; }).map(function (c) { return c.code; });
      list.push({ code: course.code, special: true, state: e >= sp.minEcts && !miss.length ? "ok" : "missing", e: e, m: sp.minEcts, miss: miss, sems: sp.requiredSemesters[0] + "-" + sp.requiredSemesters[sp.requiredSemesters.length - 1], name: "", grade: "", retaking: false });
    }
    return list;
  }
  function prereqOk(course) { return prereqStatus(course).every(function (p) { return p.state === "ok"; }); }
  function prereqText(p) {
    if (p.special) return t(p.state === "ok" ? "prereq.special.ok" : "prereq.special.no", { e: p.e, m: p.m, s: p.sems, l: p.miss.length ? p.miss.join(", ") : "-" });
    var v = { c: p.code, n: p.name, g: p.grade };
    if (p.state === "ok") return t("prereq.ok", v);
    if (p.state === "failed") return t(p.retaking ? "prereq.failedRetake" : "prereq.failed", v);
    if (p.state === "concurrent") return t("prereq.concurrent", v);
    return t("prereq.missing", v);
  }
  function dependents(code) { return D.courses.filter(function (c) { return c.prereq.indexOf(code) >= 0; }).map(function (c) { return c.code; }); }
  function dependentsDeep(code) {
    var seen = {}, q = dependents(code), out = [];
    while (q.length) { var c = q.shift(); if (seen[c]) continue; seen[c] = true; out.push(c); dependents(c).forEach(function (d) { q.push(d); }); }
    return out;
  }

  /* ---------- kontenjan ---------- */
  function quota(s) {
    var marked = isMarkedFull(s), left = marked ? 0 : s.capacity - s.enrolled;
    var low = Math.max(R.quota.lowAbsolute, Math.ceil(s.capacity * R.quota.lowRatio));
    var level = left <= 0 ? "full" : (left <= low ? "low" : "ok");
    return { left: left, level: level, pct: marked ? 100 : Math.min(100, Math.round(s.enrolled / s.capacity * 100)), marked: marked,
      label: marked ? t("q.manualFull") : level === "full" ? t("q.full") : t(level === "low" ? "q.low" : "q.ok", { n: left }) };
  }
  function quotaBar(s) {
    var q = quota(s);
    return '<div class="quota q-' + q.level + '"><div class="qbar" role="img" aria-label="' + esc(q.label) + '"><span style="width:' + q.pct + '%"></span></div>' +
      '<span class="qtxt" title="' + esc(t("q.simTitle")) + '">' + esc(q.label) + ' <small>' + (q.marked ? "" : s.enrolled + '/' + s.capacity + " " + esc(t("q.sim"))) + '</small></span></div>';
  }
  function isMarkedFull(s) { return state.fullIds.indexOf(s.id) >= 0; }
  function hasSpace(s) { return s.enrolled < s.capacity && !isMarkedFull(s); }
  function fillRatio(s) { return isMarkedFull(s) ? 1 : s.enrolled / s.capacity; }
  /* aynı dersin, sepetin geri kalanıyla (sert) çakışmayan ve yeri olan diğer şubeleri; en boş olan önce */
  function alternatives(sec) {
    var others = cartSections().filter(function (c) { return c.code !== sec.code; });
    return byCode[sec.code].sections.filter(function (s) {
      return s.id !== sec.id && hasSpace(s) && !others.some(function (o) { return pairHard(s, o); });
    }).sort(function (a, b) { return fillRatio(a) - fillRatio(b); });
  }

  /* ---------- kontroller ---------- */
  function runChecks() {
    var secs = cartSections(), items = [], tot = cartTotals(), limit = limitNow(), st = standing();
    function add(key, status, lines) { items.push({ key: key, title: t("chk." + key), status: status, lines: lines || [] }); }

    add("cart", secs.length ? "ok" : "error", secs.length ? [t("chk.cart.line", { n: tot.count, u: tot.units, unit: unitName() })] : [t("chk.cart.empty")]);

    var cf = findConflicts(secs), hard = cf.filter(function (c) { return !c.soft; }), soft = cf.filter(function (c) { return c.soft; });
    add("conflict", hard.length ? "error" : (soft.length ? "warn" : "ok"),
      hard.map(conflictMessage).concat(soft.map(function (c) { return conflictMessage(c) + " - " + t("conflict.softNote"); })));

    var pl = [];
    secs.forEach(function (s) {
      prereqStatus(byCode[s.code]).forEach(function (p) { if (p.state !== "ok") pl.push(t("chk.prereq.line", { c: s.code, text: prereqText(p) })); });
    });
    add("prereq", pl.length ? "error" : "ok", pl);

    var qE = [], qW = [];
    secs.forEach(function (s) {
      var q = quota(s);
      if (q.level === "full") qE.push(t(alternatives(s).length ? "chk.quota.fullAlt" : "chk.quota.full", { c: s.code, n: s.no }));
      else if (q.level === "low") qW.push(t("chk.quota.low", { c: s.code, n: s.no, k: q.left }));
    });
    add("quota", qE.length ? "error" : (qW.length ? "warn" : "ok"), qE.concat(qW));

    var over = tot.units - limit;
    add("limit", over > 0 ? "error" : "ok", [t("chk.limit.line", { u: tot.units, l: limit, unit: unitName(), s: L(st.label) }) + (over > 0 ? " - " + t("chk.limit.over", { o: over }) : "")]);

    if (secs.length && tot.units < RL.min && tot.units <= limit) add("min", "warn", [t("chk.min.line", { u: tot.units, m: RL.min, unit: unitName() })]);

    var fr = D.courses.filter(function (c) { return c.type === "zorunlu" && attempts[c.code] && !passed[c.code] && isOffered(c) && !cartHasCourse(c.code); });
    if (fr.length) {
      var anySpace = fr.filter(function (c) { return c.sections.some(hasSpace); });
      add("failedReq", anySpace.length ? "error" : "warn", fr.map(function (c) {
        return t(c.sections.some(hasSpace) ? "chk.failedReq.line" : "chk.failedReq.full", { c: c.code, g: gradeOf(c.code), p: st.prioritize ? t("chk.failedReq.prob") : "" });
      }));
    }

    var rep = secs.filter(function (s) { return passed[s.code]; });
    if (rep.length) add("repeat", "warn", rep.map(function (s) {
      return t(retakeKind(s.code) === "improve" ? "chk.repeat.improve" : "chk.repeat.line", { c: s.code, g: gradeOf(s.code) });
    }));

    var errors = items.filter(function (i) { return i.status === "error"; }).length;
    var warns = items.filter(function (i) { return i.status === "warn"; }).length;
    return { items: items, errors: errors, warns: warns };
  }

  /* ---------- uygunluk ("alabileceğim dersler") ---------- */
  function eligibility(c) {
    var rk = retakeKind(c.code), reasons = [];
    if (passed[c.code] && rk !== "improve") return { status: "passed", reasons: [t("elig.passed", { g: gradeOf(c.code) })] };
    var ps = prereqStatus(c).filter(function (p) { return p.state !== "ok"; });
    if (ps.length) {
      ps.forEach(function (p) {
        var txt = prereqText(p), pc = byCode[p.code];
        if (pc && !p.special && p.state !== "concurrent" && !prereqOk(pc)) txt += " " + t("elig.chain");
        reasons.push(txt);
      });
      return { status: "blocked", reasons: reasons };
    }
    if (!isOffered(c)) return { status: "closed", reasons: [t("elig.closed")] };
    if (!c.sections.some(hasSpace)) return { status: "full", reasons: [t("elig.full")] };
    if (rk === "failed") return { status: "retake", reasons: [t("elig.retake", { g: gradeOf(c.code) })] };
    if (rk === "improve") return { status: "improve", reasons: [t("elig.improve", { g: gradeOf(c.code) })] };
    return { status: "ok", reasons: [] };
  }

  /* ---------- mezuniyet ---------- */
  function gradStats() {
    var req = D.requirements;
    var rows = req.required.map(function (code) {
      var st;
      if (passed[code]) st = "done"; else if (cartHasCourse(code)) st = attempts[code] ? "retake" : "cart";
      else if (attempts[code]) st = "failed"; else st = "todo";
      return { code: code, name: courseName(code), ects: ectsOf(code), state: st, grade: gradeOf(code), offered: byCode[code] ? isOffered(byCode[code]) : false };
    });
    var reqEarned = 0, reqCart = 0;
    rows.forEach(function (r) { if (r.state === "done") reqEarned += r.ects; else if (r.state === "cart" || r.state === "retake") reqCart += r.ects; });
    var elec = req.electives.map(function (e) {
      var earned = 0, inC = 0, list = [], cl = [];
      D.courses.forEach(function (c) {
        if (c.type !== "seçmeli" || c.cat !== e.key) return;
        if (passed[c.code]) { earned += c.ects; list.push(c.code + " (" + gradeOf(c.code) + ")"); }
        else if (cartHasCourse(c.code)) { inC += c.ects; cl.push(c.code); }
      });
      return { key: e.key, name: L(e.name), need: e.ects, earned: earned, cart: inC, list: list, cartList: cl };
    });
    var effE = reqEarned, effC = reqCart;
    elec.forEach(function (e) {
      var ce = Math.min(e.earned, e.need);
      effE += ce; effC += Math.max(0, Math.min(e.need - ce, e.cart));
    });
    var total = req.totalEcts;
    return { rows: rows, elec: elec, earned: effE, cart: effC, total: total,
      remainingAfter: Math.max(0, total - effE - effC),
      failed: Object.keys(attempts).filter(function (c) { return !passed[c]; }) };
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    if (!msg) return; var el = $("toast");
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 4200);
  }

  /* ---------- ortak HTML ---------- */
  function badge(cls, text) { return '<span class="badge b-' + cls + '">' + esc(text) + '</span>'; }
  function courseMeta(c) {
    return esc(t("meta.line", { e: c.ects, tul: c.tul.join("+"), s: c.semester })) + " " +
      badge(c.type === "zorunlu" ? "req" : "elec", t(c.type === "zorunlu" ? "type.req" : "type.elec")) +
      (c.demoCourse ? " " + badge("demo", t("badge.sample")) : "");
  }
  function courseBadges(c) {
    var out = [], rk = retakeKind(c.code);
    if (rk === "failed") out.push(badge("bad", t("badge.retake", { g: gradeOf(c.code) })));
    else if (passed[c.code]) out.push(badge("info", t("badge.passed", { g: gradeOf(c.code) })) + (rk === "improve" ? " " + badge("warn", t("badge.improvable")) : ""));
    var pst = prereqStatus(c);
    if (pst.length) {
      var miss = pst.filter(function (p) { return p.state !== "ok"; });
      out.push(miss.length ? badge("bad", t("badge.prereqNo", { l: miss.map(function (m) { return m.special ? t("badge.special") : m.code; }).join(", ") })) : badge("ok", t("badge.prereqOk")));
    } else out.push(badge("neutral", t("badge.noPrereq")));
    if (!isOffered(c)) out.push(badge("neutral", t("badge.closed")));
    return out.join(" ");
  }
  function timesHtml(s) {
    return s.slots.length ? s.slots.map(function (sl) { return '<span class="time">' + esc(slotText(sl)) + '</span>'; }).join("") : '<span class="time">' + esc(t("sec.noTimes")) + '</span>';
  }
  function sectionRow(s) {
    var here = inCart(s.id), cf = here ? [] : conflictsWithCart(s), q = quota(s);
    var btn = here
      ? '<button type="button" class="btn small danger" data-act="remove" data-sec="' + esc(s.id) + '">' + esc(t("btn.remove")) + '</button>'
      : '<button type="button" class="btn small ' + (q.level === "full" ? "ghost" : "primary") + '" data-act="add" data-sec="' + esc(s.id) + '">' +
        esc(t(q.level === "full" ? "btn.addFull" : (cartHasCourse(s.code) ? "btn.swap" : "btn.add"))) + '</button>';
    var warn = "";
    var hard = cf.filter(function (c) { return !c.soft; }), soft = cf.filter(function (c) { return c.soft; });
    var desc = function (c) { return c.b.code + " (" + dayLong(c.overlaps[0].day) + " " + fmt(c.overlaps[0].start) + ")"; };
    if (hard.length) warn += '<div class="sec-warn">' + esc(t("sec.conflicts", { l: hard.map(desc).join(", ") })) + '</div>';
    if (soft.length) warn += '<div class="sec-warn soft">' + esc(t("sec.softConflicts", { l: soft.map(desc).join(", ") })) + '</div>';
    return '<li class="sec-row' + (here ? " in-cart" : "") + '" data-sec-row="' + esc(s.id) + '">' +
      '<div class="sec-info"><div class="sec-top"><strong>' + esc(t("sec.label", { n: s.no })) + '</strong></div>' +
      '<div class="sec-times">' + timesHtml(s) + (s.room ? '<span class="room">' + esc(s.room) + '</span>' : "") + '</div>' + warn + '</div>' +
      quotaBar(s) + '<div class="sec-act">' + btn + '<button type="button" class="btn small ghost" data-act="toggle-full" data-sec="' + esc(s.id) + '" aria-pressed="' + (q.marked ? "true" : "false") + '">' + esc(t(q.marked ? "btn.unmarkFull" : "btn.markFull")) + '</button></div></li>';
  }
  function sectionsHtml(c) {
    if (!c.sections.length) return '<p class="muted small closed-note">' + esc(t("sec.closed")) + '</p>';
    return '<ul class="sections">' + c.sections.map(sectionRow).join("") + '</ul>';
  }
  function prereqSampleNote(c) { return c.prereq.length && c.prereqVerified === false ? '<p class="muted small sample-note">' + esc(t("prereq.sample")) + '</p>' : ""; }

  /* =========================================================
     SEKME 1: Ders seç & program
     ========================================================= */
  function filteredCourses() {
    var q = fold($("fQ").value.trim()), type = $("fType").value, sem = $("fSem").value;
    var avail = $("fAvail").checked, elig = $("fElig").checked, hide = $("fHidePassed").checked, open = $("fOpen").checked;
    return D.courses.filter(function (c) {
      if (type && c.type !== type) return false;
      if (sem && String(c.semester) !== sem) return false;
      if (open && !isOffered(c)) return false;
      if (hide && passed[c.code] && retakeKind(c.code) !== "improve") return false;
      if (avail && !c.sections.some(hasSpace)) return false;
      if (elig && eligibility(c).status !== "ok" && eligibility(c).status !== "retake" && eligibility(c).status !== "improve") return false;
      if (q) {
        var hay = fold(c.code + " " + c.nameTr + " " + c.nameEn);
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort(function (a, b) {
      function grp(c) {
        if (retakeKind(c.code) === "failed") return 0;
        var st = eligibility(c).status;
        return isOffered(c) && (st === "ok" || st === "improve") ? 1 : 2;
      }
      var ga = grp(a), gb = grp(b);
      if (ga !== gb) return ga - gb;
      if (ga === 1) return a.semester - b.semester || (a.code < b.code ? -1 : 1);
      return ga === 0 ? (isOffered(b) - isOffered(a) || (a.code < b.code ? -1 : 1)) : (a.semester - b.semester || (a.code < b.code ? -1 : 1));
    });
  }
  function renderCourseList() {
    var list = filteredCourses();
    $("resultCount").textContent = t("list.count", { n: list.length, total: D.courses.length });
    if (!list.length) {
      $("courseList").innerHTML = '<div class="empty"><strong>' + esc(t("list.emptyT")) + '</strong><p>' + esc(t("list.emptyP")) + '</p>' +
        '<button type="button" class="btn small" data-act="clear-filters">' + esc(t("btn.clearFilters")) + '</button></div>';
      return;
    }
    $("courseList").innerHTML = list.map(function (c) {
      return '<article class="card course' + (cartHasCourse(c.code) ? " in-cart" : "") + '">' +
        '<div class="course-head"><div><span class="code">' + esc(c.code) + '</span><h3>' + esc(cname(c)) + '</h3></div>' +
        '<div class="course-meta">' + courseMeta(c) + '</div></div>' +
        '<div class="badges">' + courseBadges(c) + '</div>' +
        (c.note ? '<p class="muted small">' + esc(L(c.note)) + '</p>' : "") + prereqSampleNote(c) + sectionsHtml(c) + '</article>';
    }).join("");
  }

  function renderCartPanel() {
    var secs = cartSections(), tot = cartTotals(), limit = limitNow(), st = standing(), u = unitName();
    $("limitAuto").textContent = t("limit.auto", { g: num2(gpa()), s: L(st.label), m: st.max, unit: u });
    $("limitEcts").value = state.limitOverride !== null ? state.limitOverride : "";
    $("limitEcts").placeholder = String(st.max);
    $("scenarioSel").value = state.scenario;
    $("limitLabel").textContent = t("limit.label", { unit: u });
    if (!secs.length) {
      $("cartPanel").innerHTML = '<div class="empty small-empty"><strong>' + esc(t("cart.emptyT")) + '</strong><p>' + esc(t("cart.emptyP")) + '</p></div>';
      return;
    }
    var pct = Math.min(100, Math.round(tot.units / limit * 100)), over = tot.units > limit, cf = findConflicts(secs);
    var hard = cf.filter(function (c) { return !c.soft; }), soft = cf.filter(function (c) { return c.soft; });
    var html = '<ul class="cart-list">' + secs.map(function (s) {
      var c = byCode[s.code];
      return '<li><div><strong>' + esc(s.code) + '</strong> ' + esc(cname(c)) + ' <span class="muted">· ' + esc(t("sec.label", { n: s.no })) + ' · ' + c.ects + ' ' + esc(t("unit.ects")) + '</span>' +
        '<div class="sec-times">' + timesHtml(s) + '</div></div>' +
        '<button type="button" class="icon-btn" data-act="remove" data-sec="' + esc(s.id) + '" aria-label="' + esc(t("cart.removeAria", { c: s.code })) + '">&times;</button></li>';
    }).join("") + '</ul>';
    html += '<div class="totals"><div class="totals-row"><span><strong>' + tot.units + '</strong> / ' + limit + ' ' + esc(u) + '</span><span class="muted">' + esc(t("cart.courses", { n: tot.count })) + '</span></div>' +
      '<div class="progress ' + (over ? "over" : "") + '"><span style="width:' + pct + '%"></span></div>' +
      (over ? '<p class="alert bad">' + esc(t("cart.over", { u: tot.units, l: limit, o: tot.units - limit, unit: u })) + '</p>' :
        (tot.units > limit - 3 ? '<p class="alert warn">' + esc(t("cart.near", { r: limit - tot.units, unit: u })) + '</p>' : "")) + '</div>';
    if (hard.length) html += '<div class="alert bad" role="alert"><strong>' + esc(t("cart.conflictsT")) + '</strong><ul>' + hard.map(function (c) { return "<li>" + esc(conflictMessage(c)) + ".</li>"; }).join("") + '</ul><span class="small">' + esc(t("cart.conflictTip")) + '</span></div>';
    if (soft.length) html += '<div class="alert warn"><strong>' + esc(t("cart.softT")) + '</strong><ul>' + soft.map(function (c) { return "<li>" + esc(conflictMessage(c)) + ".</li>"; }).join("") + '</ul><span class="small">' + esc(t("conflict.softNote")) + '</span></div>';
    if (!hard.length && !soft.length) html += '<p class="alert ok">' + esc(t("cart.noConflict")) + '</p>';
    $("cartPanel").innerHTML = html;
  }

  /* ---- zaman çizelgesi (tam ve mini) ---- */
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
  function hue(code) { var h = 0; for (var i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360; return h; }
  /* items: [{sec, kind}] kind: ok|conflict|soft|preview|preview-bad */
  function ttHtml(items, mini) {
    var gs = toMin(R.timetable.start), ge = toMin(R.timetable.end), span = ge - gs;
    var perDay = {}; DAYS.forEach(function (d) { perDay[d] = []; });
    items.forEach(function (it) {
      it.sec.slots.forEach(function (sl) {
        if (perDay[sl.day]) perDay[sl.day].push({ sec: it.sec, start: Math.max(sl.start, gs), end: Math.min(sl.end, ge), kind: it.kind });
      });
    });
    var hours = "";
    for (var m = gs; m < ge; m += 60) hours += '<div class="tt-hour" style="top:' + ((m - gs) / span * 100) + '%">' + fmt(m) + '</div>';
    var cols = DAYS.map(function (d) {
      var blocks = layoutDay(perDay[d]).map(function (b) {
        var top = (b.start - gs) / span * 100, h = (b.end - b.start) / span * 100, w = 100 / b.lanes, left = b.lane * w, c = byCode[b.sec.code];
        var title = b.sec.code + " " + cname(c) + " - " + t("sec.label", { n: b.sec.no }) + " (" + fmt(b.start) + "-" + fmt(b.end) + ", " + b.sec.room + ")";
        return '<div class="tt-block k-' + b.kind + '" style="--h:' + hue(b.sec.code) + ';top:' + top + '%;height:' + h + '%;left:calc(' + left + '% + 1px);width:calc(' + w + '% - 2px)" title="' + esc(title) + '" role="img" aria-label="' + esc(dayLong(d) + " " + title) + '">' +
          '<strong>' + esc(b.sec.code) + '</strong>' + (mini ? "" : '<span>' + esc(cname(c)) + '</span><em>' + fmt(b.start) + ' · ' + esc(b.sec.room) + '</em>') + '</div>';
      }).join("");
      return '<div class="tt-day"><div class="tt-dayname">' + esc(mini ? dayShort(d) : dayLong(d)) + '</div><div class="tt-col">' + blocks + '</div></div>';
    }).join("");
    return '<div class="tt' + (mini ? " mini" : "") + '"' + '><div class="tt-timecol"><div class="tt-dayname">&nbsp;</div><div class="tt-col">' + hours + '</div></div>' + cols + '</div>';
  }
  function cartItems(secs) {
    var cf = findConflicts(secs), hard = {}, soft = {};
    cf.forEach(function (c) { var m = c.soft ? soft : hard; m[c.a.id] = true; m[c.b.id] = true; });
    return secs.map(function (s) { return { sec: s, kind: hard[s.id] ? "conflict" : (soft[s.id] ? "soft" : "ok") }; });
  }
  function renderTimetable() {
    var secs = cartSections(), items = cartItems(secs);
    var preview = previewId && secById[previewId] && !inCart(previewId) ? secById[previewId] : null;
    if (preview) {
      var hardP = conflictsWithCart(preview).filter(function (c) { return !c.soft; }).length > 0;
      items.push({ sec: preview, kind: hardP ? "preview-bad" : "preview" });
    }
    $("timetable").innerHTML = ttHtml(items, false) + (secs.length ? "" : '<p class="muted small center">' + esc(t("tt.empty")) + '</p>');
  }

  /* ---- çözücü: tüm çakışmasız kombinasyonlar + tercihler ---- */
  function enumerate(options) { return K.enumerate(options, pairHard, { maxSol: MAX_SOL, nodeCap: NODE_CAP }); }
  function comboStats(combo) {
    return K.comboStats(combo, { gridStart: toMin(R.timetable.start), freeDay: state.prefs.free, fillRatio: fillRatio, pairSoft: pairSoft });
  }
  function rank(sols) { return K.rank(sols, comboStats, state.prefs); }
  function autoSchedule() {
    var cur = cartSections();
    if (!cur.length) { autoProposal = { error: "auto.errEmpty" }; renderAuto(); return; }
    var full = [];
    var options = cur.map(function (s) {
      var ok = byCode[s.code].sections.filter(hasSpace);
      if (!ok.length) { full.push(s.code); return [s]; }
      return ok;
    });
    var res = enumerate(options);
    if (!res.sols.length) {
      var pairs = [];
      for (var i = 0; i < cur.length; i++) for (var j = i + 1; j < cur.length; j++) {
        var possible = options[i].some(function (a) { return options[j].some(function (b) { return !pairHard(a, b); }); });
        if (!possible) pairs.push(cur[i].code + " / " + cur[j].code);
      }
      autoProposal = { error: "auto.errNone", pairs: pairs }; renderAuto(); return;
    }
    var list = rank(res.sols).slice(0, KEEP);
    autoProposal = { list: list, total: res.sols.length, capped: res.capped, full: full };
    autoShown = PAGE; renderAuto();
  }
  function renderAuto() {
    var el = $("autoResult"), p = autoProposal;
    if (!p) { el.innerHTML = ""; return; }
    if (p.error) {
      el.innerHTML = '<div class="alert bad">' + esc(t(p.error)) + (p.pairs && p.pairs.length ? " " + esc(t("auto.errPairs", { l: p.pairs.join("; ") })) : "") + '</div>';
      return;
    }
    var curIds = state.cart.slice().sort().join("|");
    var shown = p.list.slice(0, autoShown);
    var html = '<div class="auto-head"><strong>' + esc(t("auto.found", { n: p.total + (p.capped ? "+" : "") })) + '</strong><span class="muted small"> ' + esc(t("auto.showing", { a: shown.length, b: p.list.length })) + '</span></div>' +
      (p.full.length ? '<p class="alert warn small">' + esc(t("auto.fullNote", { l: p.full.join(", ") })) + '</p>' : "") + '<div class="auto-grid">';
    shown.forEach(function (r, idx) {
      var same = r.combo.map(function (s) { return s.id; }).sort().join("|") === curIds, st = r.stats;
      html += '<div class="auto-card' + (idx === 0 ? " best" : "") + '"><div class="auto-top"><strong>#' + (idx + 1) + '</strong>' + (idx === 0 ? " " + badge("ok", t("auto.best")) : "") + (same ? " " + badge("info", t("auto.current")) : "") + '</div>' +
        ttHtml(r.combo.map(function (s) { return { sec: s, kind: "ok" }; }), true) +
        '<div class="tags"><span>' + esc(t("auto.tagDays", { n: st.days })) + '</span><span>' + esc(t("auto.tagGap", { h: (Math.round(st.gap / 6) / 10).toString().replace(".", LANG === "tr" ? "," : ".") })) + '</span>' +
        (st.earliest !== null ? '<span>' + esc(t("auto.tagEarliest", { t: fmt(st.earliest) })) + '</span>' : "") +
        (state.prefs.free ? '<span class="' + (st.free ? "tag-bad" : "tag-ok") + '">' + esc(t(st.free ? "auto.tagFreeNo" : "auto.tagFreeYes", { d: dayShort(state.prefs.free) })) + '</span>' : "") +
        (st.soft ? '<span class="tag-warn">' + esc(t("auto.tagSoft")) + '</span>' : "") + '</div>' +
        '<div class="small muted auto-secs">' + r.combo.map(function (s) { return esc(secCode(s)); }).join(" · ") + '</div>' +
        (same ? "" : '<button type="button" class="btn small primary" data-act="auto-apply" data-idx="' + idx + '">' + esc(t("auto.apply")) + '</button>') + '</div>';
    });
    html += '</div><div class="btn-row">' + (autoShown < p.list.length ? '<button type="button" class="btn small" data-act="auto-more">' + esc(t("auto.more")) + '</button>' : "") +
      '<button type="button" class="btn small ghost" data-act="auto-dismiss">' + esc(t("btn.close")) + '</button></div>';
    el.innerHTML = html;
  }
  function syncPrefs() {
    $("prefDays").checked = !!state.prefs.days; $("prefEarly").checked = !!state.prefs.early;
    $("prefGaps").checked = !!state.prefs.gaps; $("prefFree").value = state.prefs.free || "";
  }

  /* =========================================================
     SEKME 2: ön koşul, kontenjan, alabileceğim dersler
     ========================================================= */
  function prereqListHtml(c) {
    if (!prereqStatus(c).length) return '<p class="muted small">' + esc(t("prereq.none")) + '</p>';
    return '<ul class="prereq">' + prereqStatus(c).map(function (p) {
      return '<li class="p-' + p.state + '"><span class="mark" aria-hidden="true">' + (p.state === "ok" ? "&#10003;" : "&#10007;") + '</span><span>' + esc(prereqText(p)) + '</span></li>';
    }).join("") + '</ul>' + prereqSampleNote(c);
  }
  function hintsHtml(c) {
    var dn = dependents(c.code), deep = dependentsDeep(c.code);
    var out = '<div class="hint-box">';
    var list = function (a) { return a.slice(0, 5).join(", ") + (a.length > 5 ? " " + t("hint.more", { n: a.length - 5 }) : ""); };
    if (!dn.length) out += '<p class="hint">' + esc(t("hint.leaf")) + '</p>';
    else out += '<p class="hint"><strong>' + esc(t("hint.passT")) + '</strong> ' + esc(t("hint.pass", { l: list(dn) })) + '</p>' +
      '<p class="hint"><strong>' + esc(t("hint.failT")) + '</strong> ' + esc(t("hint.fail", { l: list(deep), n: deep.length })) + '</p>';
    out += '<p class="hint"><strong>' + esc(t("hint.takeT")) + '</strong> ' + esc(t(c.type === "zorunlu" ? "hint.takeReq" : "hint.takeElec")) + '</p>';
    if (retakeKind(c.code) === "failed") out += '<p class="hint">' + esc(t("hint.mustRetake")) + '</p>';
    return out + '</div>';
  }
  function cartStatusCard(s) {
    var c = byCode[s.code], q = quota(s), alts = alternatives(s), cf = conflictsWithCart(s);
    var altHtml = "";
    if (alts.length) altHtml = '<details' + (q.level !== "ok" || cf.length ? " open" : "") + '><summary>' + esc(t("alt.summary", { n: alts.length })) + '</summary><ul class="sections">' + alts.map(sectionRow).join("") + '</ul></details>';
    else if (q.level !== "ok") altHtml = '<p class="alert bad small">' + esc(t("alt.none")) + '</p>';
    return '<article class="card course in-cart"><div class="course-head"><div><span class="code">' + esc(c.code) + '</span><h3>' + esc(cname(c)) + ' <span class="muted">· ' + esc(t("sec.label", { n: s.no })) + '</span></h3></div><div class="course-meta">' + courseMeta(c) + '</div></div>' +
      '<div class="two-col"><div><h4>' + esc(t("h.prereq")) + '</h4>' + (prereqOk(c) ? badge("ok", t("badge.prereqOk")) : badge("bad", t("badge.prereqNoShort"))) + prereqListHtml(c) + '</div>' +
      '<div><h4>' + esc(t("h.quota")) + '</h4>' + quotaBar(s) + '<p class="muted small">' + esc(timesList(s)) + (s.room ? ' · ' + esc(s.room) : '') + '</p>' +
      (cf.length ? '<p class="alert ' + (cf.some(function (x) { return !x.soft; }) ? "bad" : "warn") + ' small">' + esc(cf.map(conflictMessage).join("; ")) + '</p>' : "") + '</div></div>' + altHtml + hintsHtml(c) + '</article>';
  }
  function browseCard(c) {
    return '<article class="card course"><div class="course-head"><div><span class="code">' + esc(c.code) + '</span><h3>' + esc(cname(c)) + '</h3></div><div class="course-meta">' + courseMeta(c) + '</div></div>' +
      '<div class="badges">' + courseBadges(c) + '</div><div class="two-col"><div><h4>' + esc(t("h.prereq")) + '</h4>' + prereqListHtml(c) + '</div><div><h4>' + esc(t("h.sections")) + '</h4>' + sectionsHtml(c) + '</div></div>' + hintsHtml(c) + '</article>';
  }
  function resolveBrowse() {
    var v = $("browseQ").value.trim(); if (!v) return null;
    var code = v.split(" - ")[0].trim().toUpperCase();
    if (byCode[code]) return byCode[code];
    var f = fold(v);
    return D.courses.filter(function (c) { return fold(c.code + " " + c.nameTr + " " + c.nameEn).indexOf(f) >= 0; })[0] || null;
  }
  function eligCard(c, e) {
    var addable = c.sections.filter(hasSpace);
    var btn = cartHasCourse(c.code) ? badge("ok", t("badge.inCart"))
      : (addable.length && (e.status === "ok" || e.status === "retake" || e.status === "improve")
        ? '<button type="button" class="btn small primary" data-act="add-first" data-code="' + esc(c.code) + '">' + esc(t("btn.add")) + '</button>' : "");
    var tag = e.status === "retake" ? badge("bad", t("elig.tagRetake")) : (e.status === "improve" ? badge("warn", t("elig.tagImprove")) : "");
    var best = addable.slice().sort(function (a, b) { return fillRatio(a) - fillRatio(b); })[0];
    return '<li class="elig-item es-' + e.status + '"><div class="elig-main"><div><span class="code">' + esc(c.code) + '</span> <strong>' + esc(cname(c)) + '</strong> ' + tag + (c.demoCourse ? " " + badge("demo", t("badge.sample")) : "") + '</div>' +
      '<div class="small muted">' + esc(t("meta.line", { e: c.ects, tul: c.tul.join("+"), s: c.semester })) + (best && (e.status === "ok" || e.status === "retake" || e.status === "improve") ? " · " + esc(t("elig.spots", { n: best.capacity - best.enrolled, s: best.no })) : "") + '</div>' +
      (e.reasons.length ? '<ul class="reasons">' + e.reasons.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + '</ul>' : "") + '</div><div class="elig-act">' + btn + '</div></li>';
  }
  function renderEligible() {
    var rows = D.courses.map(function (c) { return { c: c, e: eligibility(c) }; });
    var groups = { retake: [], ok: [], improve: [], full: [], blocked: [], closed: [], passed: [] };
    rows.forEach(function (r) { groups[r.e.status].push(r); });
    function by(a, b) { return a.c.semester - b.c.semester || (a.c.code < b.c.code ? -1 : 1); }
    var okReq = groups.ok.filter(function (r) { return r.c.type === "zorunlu"; }).sort(by);
    var okElec = groups.ok.filter(function (r) { return r.c.type !== "zorunlu"; }).sort(by);
    var tot = cartTotals(), limit = limitNow(), st = standing(), u = unitName();
    var html = '<div class="card elig-sum"><div class="stat-line"><span><strong>' + (groups.retake.length + okReq.length + okElec.length + groups.improve.length) + '</strong> ' + esc(t("elig.canTake")) + '</span>' +
      '<span><strong>' + groups.retake.length + '</strong> ' + esc(t("elig.retakeN")) + '</span><span><strong>' + groups.blocked.length + '</strong> ' + esc(t("elig.blockedN")) + '</span></div>' +
      '<p class="small">' + esc(t("elig.limitInfo", { u: tot.units, l: limit, r: Math.max(0, limit - tot.units), unit: u, g: num2(gpa()), s: L(st.label) })) + '</p>' +
      (st.prioritize ? '<p class="alert warn small">' + esc(t("elig.prioritize")) + '</p>' : "") +
      (groups.retake.length ? '<button type="button" class="btn small primary" data-act="add-retakes">' + esc(t("elig.addRetakes")) + '</button>' : "") + '</div>';
    function group(title, hint, arr, open) {
      if (!arr.length) return "";
      return '<details class="elig-group"' + (open ? " open" : "") + '><summary><strong>' + esc(title) + '</strong> <span class="count">' + arr.length + '</span></summary>' +
        (hint ? '<p class="muted small">' + esc(hint) + '</p>' : "") + '<ul class="elig-list">' + arr.map(function (r) { return eligCard(r.c, r.e); }).join("") + '</ul></details>';
    }
    html += group(t("elig.g.retake"), t("elig.g.retakeH"), groups.retake.sort(by), true);
    html += group(t("elig.g.req"), t("elig.g.reqH"), okReq, true);
    html += group(t("elig.g.elec"), t("elig.g.elecH"), okElec, true);
    html += group(t("elig.g.improve"), t("elig.g.improveH"), groups.improve.sort(by), false);
    html += group(t("elig.g.full"), t("elig.g.fullH"), groups.full.sort(by), false);
    html += group(t("elig.g.blocked"), t("elig.g.blockedH"), groups.blocked.sort(by), false);
    html += group(t("elig.g.closed"), t("elig.g.closedH"), groups.closed.sort(by), false);
    html += group(t("elig.g.passed"), "", groups.passed.sort(by), false);
    $("svElig").innerHTML = html;
  }
  function renderStatus() {
    ["elig", "cart", "browse"].forEach(function (v) {
      $("sv-" + v).hidden = state.sv !== v;
      var b = document.querySelector('[data-sv="' + v + '"]');
      b.classList.toggle("active", state.sv === v); b.setAttribute("aria-pressed", state.sv === v ? "true" : "false");
    });
    renderEligible();
    var secs = cartSections();
    $("svCart").innerHTML = secs.length ? secs.map(cartStatusCard).join("") :
      '<div class="empty"><strong>' + esc(t("cart.emptyT")) + '</strong><p>' + esc(t("status.emptyP")) + '</p><button type="button" class="btn small primary" data-act="goto-plan">' + esc(t("btn.gotoPlan")) + '</button></div>';
    var c = resolveBrowse();
    $("browseResult").innerHTML = c ? browseCard(c) : ($("browseQ").value.trim() ? '<div class="empty small-empty"><strong>' + esc(t("browse.notFound")) + '</strong><p>' + esc(t("browse.notFoundP")) + '</p></div>' : "");
  }

  /* =========================================================
     SEKME 3: Mezuniyet
     ========================================================= */
  function stackBar(earned, cart, total) {
    var a = Math.min(100, earned / total * 100), b = Math.min(100 - a, cart / total * 100);
    return '<div class="progress stack" role="img" aria-label="' + esc(t("grad.barAria", { e: earned, c: cart, t: total })) + '"><span class="seg-done" style="width:' + a + '%"></span><span class="seg-cart" style="width:' + b + '%"></span></div>';
  }
  /* ---- Mezuniyet yol haritası (ortak motor: KayitCore.planRoadmap) ---- */
  function rmModel() {
    var kn = K.knowledgeFromData(D), items = K.itemsFromKnowledge(kn), rec = {}, slotsBy = {}, W = 0;
    items.forEach(function (it) {
      if (it.slot) { (slotsBy[it.group] = slotsBy[it.group] || []).push(it); return; }
      var a = lastAttempt(it.code); if (!a) return;
      rec[it.code] = { state: passed[it.code] ? "passed" : (R.failGrades.indexOf(a.grade) >= 0 ? "failed" : "ongoing"), grade: a.grade, term: a.term };
    });
    D.courses.forEach(function (c) {
      if (c.type !== "seçmeli" || !passed[c.code]) return;
      var sl = (slotsBy[c.cat] || []).shift();
      if (sl) rec[sl.code] = { state: "passed", grade: gradeOf(c.code), takenCode: c.code };
    });
    Object.keys(attempts).forEach(function (code) { if (R.gradePoints[gradeOf(code)] !== undefined) W += ectsOf(code); });
    return K.createModel({ items: items, record: rec, gpa: gpa(), gradedEcts: W, earnedEcts: earnedEcts(), completedSemesters: D.student.completedSemesters,
      rules: { statuses: RL.statuses, statusFromCompletedSemesters: RL.statusFromCompletedSemesters, firstYearMax: RL.firstYearMax, totalEcts: R.graduation.totalEcts, minGpa: R.graduation.minGpa },
      special: R.specialPrereqs || {}, project: kn.project, limitOverride: state.limitOverride });
  }
  function rmMode() { return state.rm.mode || (state.cart.length ? "cart" : "suggest"); }
  function rmBundle(mode) {
    var M = rmModel(), offered = {};
    D.courses.forEach(function (c) { if (isOffered(c)) offered[c.code] = true; });
    var codes = []; cartSections().forEach(function (s) { if (codes.indexOf(s.code) < 0) codes.push(s.code); });
    var opts = { start: K.parseTerm(D.meta.term.tr) || { year: 2026, season: "G" }, offeredNow: offered, expected: state.rm.expected,
      failNow: {}, fixedTerm0: mode === "cart" && codes.length ? codes : null };
    return { M: M, B: K.roadmapBundle(M, opts) };
  }
  function roadmapHtml() {
    if (!K || !RV) return "";
    var M = rmModel(), offered = {}, mode = rmMode();
    D.courses.forEach(function (c) { if (isOffered(c)) offered[c.code] = true; });
    var codes = []; cartSections().forEach(function (s) { if (codes.indexOf(s.code) < 0) codes.push(s.code); });
    var opts = { start: K.parseTerm(D.meta.term.tr) || { year: 2026, season: "G" }, offeredNow: offered, expected: state.rm.expected,
      failNow: state.rm.fail, fixedTerm0: mode === "cart" && codes.length ? codes : null };
    var B = K.roadmapBundle(M, opts);
    var nameOf = function (code) { var it = M.item(code); return courseName(code) || (it ? (LANG === "en" ? it.nameEn : it.name) : ""); };
    return '<div class="card roadmap-card"><h3>' + esc(t("rm.title")) + '</h3><p class="muted small">' + esc(t("rm.intro")) + '</p>' +
      RV.render(B, { t: t, lang: LANG, num2: num2, name: nameOf, M: M, expected: state.rm.expected, mode: mode,
        modes: [{ v: "suggest", label: t("rm.mode.suggest") }, { v: "cart", label: t("rm.mode.cart") }] }) + '</div>';
  }
  function renderGrad() {
    var g = gradStats(), st = standing(), gp = gpa(), min = R.graduation.minGpa;
    var doneCount = g.rows.filter(function (r) { return r.state === "done"; }).length;
    var pct = Math.round(g.earned / g.total * 100), pctAfter = Math.round((g.earned + g.cart) / g.total * 100);
    var semLeft = Math.ceil(g.remainingAfter / R.typicalSemesterEcts);
    var html = '<div class="intro"><h2>' + esc(t("grad.title")) + '</h2><p class="muted">' + esc(t("grad.intro", { d: L(D.meta.department) || D.meta.department })) + '</p></div>';
    html += '<div class="stat-grid">' +
      '<div class="card stat"><span class="stat-n">' + g.earned + '<small> / ' + g.total + '</small></span><span class="muted">' + esc(t("grad.statEcts", { p: pct })) + '</span></div>' +
      '<div class="card stat ' + (gp < min ? "stat-bad" : "") + '"><span class="stat-n">' + num2(gp) + '</span><span class="muted">' + esc(t("grad.statGpa", { s: L(st.label) })) + '</span></div>' +
      '<div class="card stat"><span class="stat-n">' + doneCount + '<small> / ' + g.rows.length + '</small></span><span class="muted">' + esc(t("grad.statReq")) + '</span></div>' +
      '<div class="card stat ' + (g.failed.length ? "stat-bad" : "") + '"><span class="stat-n">' + g.failed.length + '</span><span class="muted">' + esc(t("grad.statFailed")) + '</span></div></div>';
    html += roadmapHtml();
    html += '<div class="card"><h3>' + esc(t("grad.overall")) + '</h3>' + stackBar(g.earned, g.cart, g.total) +
      '<div class="legend"><span><i class="lg lg-done"></i> ' + esc(t("grad.lgDone", { n: g.earned })) + '</span><span><i class="lg lg-cartseg"></i> ' + esc(t("grad.lgCart", { n: g.cart })) + '</span><span><i class="lg lg-rest"></i> ' + esc(t("grad.lgRest", { n: g.remainingAfter })) + '</span></div>' +
      '<p class="small ' + (gp < min ? "alert bad" : "muted") + '">' + esc(t(gp < min ? "grad.gpaBad" : "grad.gpaOk", { g: num2(gp), m: num2(min), tot: R.graduation.totalEcts })) + '</p></div>';
    html += '<div class="card projection"><h3>' + esc(t("grad.projT")) + '</h3>';
    if (!state.cart.length) html += '<p class="muted">' + esc(t("grad.projEmpty")) + '</p>';
    else html += '<p>' + t("grad.proj", { a: g.earned + g.cart, t: g.total, p: pctAfter, r: g.remainingAfter }) + '</p><p class="muted">' + t("grad.projSem", { n: R.typicalSemesterEcts, s: semLeft }) + '</p>';
    html += '</div>';
    if (g.failed.length) {
      html += '<div class="card alert-card"><h3>' + esc(t("grad.failT")) + '</h3><p class="muted small">' + esc(t("grad.failP")) + '</p><ul class="fail-list">' + g.failed.map(function (c) {
        var deep = dependentsDeep(c), crs = byCode[c], inC = cartHasCourse(c);
        return '<li><div><strong>' + esc(c) + '</strong> ' + esc(courseName(c)) + ' ' + badge("bad", gradeOf(c)) + (inC ? " " + badge("ok", t("badge.inCart")) : "") +
          (deep.length ? '<div class="small muted">' + esc(t("grad.blocks", { l: deep.slice(0, 6).join(", ") + (deep.length > 6 ? " +" + (deep.length - 6) : "") })) + '</div>' : "") + '</div>' +
          (crs && isOffered(crs) && !inC ? '<button type="button" class="btn small primary" data-act="add-first" data-code="' + esc(c) + '">' + esc(t("btn.add")) + '</button>' : "") + '</li>';
      }).join("") + '</ul></div>';
    }
    var labels = { done: ["ok", "grad.s.done"], failed: ["bad", "grad.s.failed"], retake: ["warn", "grad.s.retake"], cart: ["info", "grad.s.cart"], todo: ["neutral", "grad.s.todo"] };
    html += '<div class="card"><h3>' + esc(t("grad.reqT")) + '</h3><div class="req-grid">' + g.rows.map(function (r) {
      var l = labels[r.state];
      return '<div class="req req-' + r.state + '"><div><strong>' + esc(r.code) + '</strong> ' + esc(r.name) + '<div class="small muted">' + r.ects + ' ' + esc(t("unit.ects")) + (r.grade ? " · " + esc(r.grade) : "") + (r.offered ? "" : " · " + esc(t("grad.notOffered"))) + '</div></div>' + badge(l[0], t(l[1])) + '</div>';
    }).join("") + '</div></div>';
    html += '<div class="card"><h3>' + esc(t("grad.elecT")) + '</h3><p class="muted small">' + esc(t("grad.elecNote")) + '</p>' + g.elec.map(function (e) {
      var short = Math.max(0, e.need - e.earned - e.cart);
      return '<div class="elec"><div class="totals-row"><strong>' + esc(e.name) + '</strong><span>' + Math.min(e.earned, e.need) + ' / ' + e.need + ' ' + esc(t("unit.ects")) + (e.cart ? ' <span class="muted">' + esc(t("grad.inCartN", { n: e.cart })) + '</span>' : "") + '</span></div>' +
        stackBar(Math.min(e.earned, e.need), Math.min(e.cart, Math.max(0, e.need - e.earned)), e.need) +
        '<p class="small muted">' + esc(e.list.length ? t("grad.doneList", { l: e.list.join(", ") }) : t("grad.noneDone")) + (e.cartList.length ? " · " + esc(t("grad.cartList", { l: e.cartList.join(", ") })) : "") +
        (short ? " · " + esc(t("grad.short", { n: short })) : (e.earned >= e.need ? " · " + esc(t("grad.catDone")) : "")) + '</p></div>';
    }).join("") + '</div>';
    $("gradView").innerHTML = html;
  }

  /* =========================================================
     SEKME 4: Danışman onayı
     ========================================================= */
  var STEP_KEYS = ["flow.s1", "flow.s2", "flow.s3", "flow.s4", "flow.s5"];
  function buildSummary(checks) {
    var secs = cartSections(), tot = cartTotals(), stu = D.student, f = state.flow, N = [];
    N.push(t("sum.dear", { a: stu.advisor })); N.push("");
    N.push(t("sum.intro", { n: stu.name, no: stu.no, d: D.meta.department, term: L(D.meta.term) })); N.push("");
    N.push(t("sum.courses", { c: tot.count, u: tot.units, l: limitNow(), unit: unitName() }));
    if (!secs.length) N.push("  " + t("sum.none"));
    secs.forEach(function (s, i) {
      N.push("  " + (i + 1) + ". " + s.code + " - " + cname(byCode[s.code]) + " (" + t("sec.label", { n: s.no }) + ") | " + timesList(s) + " | " + byCode[s.code].ects + " " + t("unit.ects"));
    });
    N.push(""); N.push(t("sum.checks"));
    checks.items.forEach(function (it) {
      var tag = t(it.status === "ok" ? "sum.ok" : (it.status === "warn" ? "sum.warn" : "sum.err"));
      N.push("  - [" + tag + "] " + it.title + (it.status === "ok" ? "" : ": " + it.lines.join("; ")));
    });
    if (f.studentNote && f.studentNote.trim()) { N.push(""); N.push(t("sum.note", { n: f.studentNote.trim() })); }
    N.push(""); N.push(t("sum.close")); N.push(t("sum.regards")); N.push(stu.name);
    return N.join("\n");
  }
  function renderFlow() {
    var f = state.flow, checks = runChecks(), hasCart = state.cart.length > 0, noErr = checks.errors === 0;
    var cur, done = [false, false, false, false, false], finalCls = "";
    if (f.status === "draft") { done[0] = hasCart; done[1] = hasCart && noErr; cur = !done[0] ? 0 : (!done[1] ? 1 : 2); }
    else if (f.status === "pending") { done[0] = done[1] = done[2] = true; cur = 3; }
    else { done[0] = done[1] = done[2] = done[3] = done[4] = true; cur = 4; finalCls = f.status === "approved" ? "final-ok" : "final-bad"; }
    var labels = STEP_KEYS.map(function (k) { return t(k); });
    if (f.status === "approved") labels[4] = t("flow.approved"); else if (f.status === "rejected") labels[4] = t("flow.rejected");
    var html = '<div class="intro"><h2>' + esc(t("flow.title")) + '</h2><p class="muted">' + esc(t("flow.intro")) + '</p></div>';
    html += '<ol class="stepper">' + labels.map(function (l, i) {
      var cls = done[i] && i !== cur ? "done" : (i === cur ? "current" : "");
      if (i === 1 && hasCart && !noErr && f.status === "draft") cls = "error";
      if (i === 4 && finalCls) cls = finalCls;
      return '<li class="' + cls + '"' + (i === cur ? ' aria-current="step"' : "") + '><span class="step-dot">' + (cls === "done" || cls === "final-ok" ? "&#10003;" : (cls === "final-bad" || cls === "error" ? "!" : i + 1)) + '</span><span class="step-label">' + esc(l) + '</span></li>';
    }).join("") + '</ol>';
    var noteQ = f.advisorNote ? t("flow.advisorNote", { n: esc(f.advisorNote) }) : t("flow.noNote");
    if (f.status === "approved") html += '<div class="alert ok big"><strong>' + esc(t("flow.okT")) + '</strong> ' + noteQ + ' ' + esc(t("flow.okP")) + '</div>';
    if (f.status === "rejected") html += '<div class="alert bad big"><strong>' + esc(t("flow.noT")) + '</strong> ' + noteQ + ' ' + esc(t("flow.noP")) + '</div>';
    if (f.status === "pending") html += '<div class="alert info big"><strong>' + esc(t("flow.pendT")) + '</strong> ' + esc(t("flow.pendP", { d: new Date(f.submittedAt).toLocaleString(locale()), a: D.student.advisor })) + '</div>';

    html += '<div class="flow-grid"><div class="card"><h3>' + esc(t("flow.checklist")) + '</h3><ul class="checklist">' + checks.items.map(function (it) {
      var icon = it.status === "ok" ? "&#10003;" : (it.status === "warn" ? "!" : "&#10007;");
      return '<li class="c-' + it.status + '"><span class="mark" aria-hidden="true">' + icon + '</span><div><strong>' + esc(it.title) + '</strong>' +
        (it.lines.length ? '<ul>' + it.lines.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + '</ul>' : "") + '</div></li>';
    }).join("") + '</ul>' +
      (checks.errors ? '<p class="alert bad">' + esc(t("flow.blocking", { n: checks.errors })) + '</p>' : '<p class="alert ok">' + esc(t("flow.noBlocking")) + (checks.warns ? " " + esc(t("flow.warnsN", { n: checks.warns })) : "") + '</p>') + '</div>';

    html += '<div class="card"><h3>' + esc(t("flow.msgT")) + '</h3>' +
      '<label class="field"><span>' + esc(t("flow.noteLbl")) + '</span><textarea id="studentNote" rows="2" placeholder="' + esc(t("flow.notePh")) + '"' + (f.status !== "draft" ? " disabled" : "") + '>' + esc(f.studentNote) + '</textarea></label>' +
      '<label class="field"><span>' + esc(t("flow.sumLbl")) + '</span><textarea id="summaryText" rows="12" readonly>' + esc(buildSummary(checks)) + '</textarea></label>' +
      '<div class="btn-row"><button type="button" class="btn" data-act="copy-summary">' + esc(t("flow.copy")) + '</button>' +
      (f.status === "draft" ? '<button type="button" class="btn primary" data-act="submit"' + (hasCart && noErr ? "" : " disabled") + '>' + esc(t("flow.submit")) + '</button>' : '<button type="button" class="btn ghost" data-act="flow-reset">' + esc(t("flow.backDraft")) + '</button>') + '</div>' +
      (f.status === "draft" && !(hasCart && noErr) ? '<p class="muted small">' + esc(t("flow.submitHint")) + '</p>' : "") + '</div></div>';
    if (f.status === "pending") {
      html += '<div class="card sim"><h3>' + esc(t("flow.simT")) + '</h3><p class="muted small">' + esc(t("flow.simP")) + '</p>' +
        '<label class="field"><span>' + esc(t("flow.advLbl")) + '</span><textarea id="advisorNote" rows="2" placeholder="' + esc(t("flow.advPh")) + '"></textarea></label>' +
        '<div class="btn-row"><button type="button" class="btn ok" data-act="approve">' + esc(t("flow.btnApprove")) + '</button><button type="button" class="btn danger" data-act="reject">' + esc(t("flow.btnReject")) + '</button></div></div>';
    }
    $("flowView").innerHTML = html;
  }

  /* =========================================================
     SEKME 5: Kayıt günü planı
     ========================================================= */
  function altCourses(sec) {
    var c = byCode[sec.code];
    if (c.type !== "seçmeli") return [];
    var others = cartSections().filter(function (x) { return x.code !== c.code; });
    return D.courses.filter(function (x) {
      return x.code !== c.code && x.type === "seçmeli" && x.cat === c.cat && !passed[x.code] && !cartHasCourse(x.code) && prereqOk(x) &&
        x.sections.some(function (s) { return hasSpace(s) && !others.some(function (o) { return pairHard(s, o); }); });
    }).slice(0, 3);
  }
  /* Plan B/C (ortak motor): aynı dersin daha önce kullanılmamış ve yeri olan şubeleriyle en çok yeni şube içeren kombinasyon */
  var planEnv = { sectionsOf: function (code) { return byCode[code].sections; }, hasSpace: function (s) { return hasSpace(s); },
    pairHard: function (a, b) { return pairHard(a, b); }, rank: function (sols) { return rank(sols); } };
  function bestPlan(A, excl, skipCode) { return K.bestPlan(A, excl, skipCode, planEnv); }
  /* Yedek plan neden üretilemedi? Engelleyen dersleri ve somut çözümleri bul */
  function diagnose(A, excl, key) {
    var blocked = [], single = [], drops = [];
    A.forEach(function (s) {
      var open = byCode[s.code].sections.filter(function (x) { return hasSpace(x) && excl.indexOf(x.id) < 0; });
      if (!open.length) single.push(s.code);
      else if (!alternatives(s).some(function (x) { return excl.indexOf(x.id) < 0; })) blocked.push(s.code);
    });
    var order = A.slice().sort(function (a, b) { return (blocked.indexOf(b.code) >= 0) - (blocked.indexOf(a.code) >= 0); });
    order.forEach(function (s) {
      if (drops.length < 3 && bestPlan(A, excl, s.code)) drops.push({ code: s.code, secId: s.id, alts: altCourses(s) });
    });
    return { key: key, blocked: blocked, single: single, nothing: single.length === A.length, drops: drops };
  }
  function planVariants(withDiag) {
    var A = cartSections(), fails = [];
    if (!A.length) return { plans: [], fails: [] };
    var plans = [{ key: "A", secs: A.slice().sort(function (a, b) { return a.code < b.code ? -1 : 1; }) }];
    var excl = A.map(function (s) { return s.id; });
    ["B", "C"].forEach(function (key) {
      if (plans.length < (key === "B" ? 1 : 2)) { fails.push({ key: key, after: true }); return; }
      var res = bestPlan(A, excl);
      if (!res) { fails.push(withDiag === false ? { key: key } : diagnose(A, excl, key)); return; }
      plans.push({ key: key, secs: res.r.combo, diff: res.diff.length });
      res.diff.forEach(function (x) { excl.push(x.id); });
    });
    return { plans: plans, fails: fails };
  }
  function failCard(f) {
    var h = '<div class="card plan-card fail"><div class="auto-top"><strong>' + esc(t("reg.noPlanT", { k: f.key })) + '</strong></div>';
    if (f.after) return h + '<p class="small muted">' + esc(t("reg.afterB")) + '</p></div>';
    var li = [];
    if (f.nothing) li.push(t("reg.nothingToVary"));
    f.blocked.forEach(function (c) { li.push(t("reg.blockedCourse", { c: c })); });
    if (!f.nothing && f.single.length) li.push(t("reg.noOther", { c: f.single.join(", ") }));
    h += '<ul class="reasons">' + li.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ul>';
    if (f.drops.length) {
      h += '<p class="small"><strong>' + esc(t("reg.fixT")) + '</strong></p>';
      f.drops.forEach(function (d) {
        h += '<div class="fix"><span class="small">' + esc(t("reg.fixDrop", { c: d.code, k: f.key })) + (d.alts.length ? " " + esc(t("reg.fixAlt", { l: d.alts.map(function (x) { return x.code + " " + cname(x); }).join("; ") })) : "") + '</span> ' +
          '<button type="button" class="btn small no-print" data-act="remove" data-sec="' + esc(d.secId) + '">' + esc(t("reg.fixBtn", { c: d.code })) + '</button></div>';
      });
    } else h += '<p class="small">' + esc(t("reg.fixNone")) + '</p>';
    return h + '</div>';
  }
  function entryOrder() {
    return cartSections().slice().sort(function (a, b) {
      var fa = fillRatio(a), fb = fillRatio(b);
      return fb - fa || (a.capacity - a.enrolled) - (b.capacity - b.enrolled);
    });
  }
  function ruleLine(s) {
    var alts = alternatives(s), ac = altCourses(s), parts = [];
    var an = alts.map(function (a) { return t("reg.backupSec", { n: a.no, code: secCode(a), tm: timesList(a), k: a.capacity - a.enrolled }); });
    if (an.length) parts.push(t(quota(s).level === "full" ? "reg.isFull" : "reg.ifFull", { c: secCode(s) }) + " " + an.join(" → ") + ".");
    else parts.push(t("reg.noBackup", { c: secCode(s) }));
    if (ac.length) parts.push(t("reg.altCourse", { l: ac.map(function (x) { return x.code + " " + cname(x); }).join("; ") }));
    else if (byCode[s.code].type === "zorunlu") parts.push(t("reg.reqFallback"));
    return parts.join(" ");
  }
  function planText() {
    var stu = D.student, N = [], plans = planVariants(false).plans, order = entryOrder();
    N.push(t("reg.txtTitle", { n: stu.name, no: stu.no, term: L(D.meta.term) }));
    if (state.regDate) N.push(t("reg.txtDate", { d: new Date(state.regDate).toLocaleString(locale()) }));
    N.push(""); N.push(t("reg.txtOrder"));
    order.forEach(function (s, i) { N.push((i + 1) + ") " + secCode(s) + "  " + cname(byCode[s.code]) + "  [" + timesList(s) + "]"); N.push("     " + ruleLine(s)); });
    plans.slice(1).forEach(function (p) {
      N.push(""); N.push(t("reg.txtPlan", { k: p.key }));
      p.secs.forEach(function (s) { N.push("  - " + secCode(s) + "  " + cname(byCode[s.code]) + "  [" + timesList(s) + "]"); });
    });
    return N.join("\n");
  }
  function countdownText() {
    if (!state.regDate) return t("reg.cdNone");
    var diff = new Date(state.regDate).getTime() - Date.now();
    if (isNaN(diff)) return t("reg.cdNone");
    if (diff <= 0) return t("reg.cdPast");
    var m = Math.floor(diff / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return t("reg.cd", { d: d, h: h, m: m % 60 });
  }
  function updateCountdown() { var el = $("countdown"); if (el) el.textContent = countdownText(); }
  function renderReg() {
    var secs = cartSections(), stu = D.student;
    var html = '<div class="intro"><h2>' + esc(t("reg.title")) + '</h2><p class="muted">' + esc(t("reg.intro")) + '</p></div>';
    html += '<div class="card reg-top"><label class="field"><span>' + esc(t("reg.dateLbl")) + '</span><input type="datetime-local" id="regDate" value="' + esc(state.regDate) + '"></label>' +
      '<div class="countdown" id="countdown" aria-live="off">' + esc(countdownText()) + '</div>' +
      '<div class="btn-row no-print"><button type="button" class="btn" data-act="copy-plan">' + esc(t("reg.copy")) + '</button><button type="button" class="btn primary" data-act="print">' + esc(t("reg.print")) + '</button></div>' +
      '<p class="muted small no-print">' + esc(t("reg.offline")) + '</p></div>';
    html += '<div class="print-only print-head"><strong>' + esc(t("app.name")) + '</strong> - ' + esc(stu.name) + ' (' + esc(stu.no) + ') - ' + esc(L(D.meta.term)) + '<br><small>' + esc(t("demo.short")) + '</small></div>';
    if (!secs.length) {
      html += '<div class="empty"><strong>' + esc(t("reg.emptyT")) + '</strong><p>' + esc(t("reg.emptyP")) + '</p><button type="button" class="btn small primary" data-act="goto-plan">' + esc(t("btn.gotoPlan")) + '</button></div>';
      $("regView").innerHTML = html; return;
    }
    var checks = runChecks();
    if (checks.errors) html += '<div class="alert bad"><strong>' + esc(t("reg.planIssues", { n: checks.errors })) + '</strong> ' + esc(t("reg.planIssuesP")) + '</div>';
    var order = entryOrder();
    html += '<div class="card"><h3>' + esc(t("reg.orderT")) + '</h3><p class="muted small">' + esc(t("reg.orderP")) + '</p><ol class="entry-list">' + order.map(function (s) {
      var c = byCode[s.code], q = quota(s);
      return '<li><div class="entry-main"><span class="entry-code">' + esc(secCode(s)) + '</span> <strong>' + esc(cname(c)) + '</strong> <span class="muted small">' + esc(timesList(s)) + '</span> ' + badge(q.level === "ok" ? "ok" : (q.level === "low" ? "warn" : "bad"), q.label) + '</div>' +
        '<div class="entry-rule">' + esc(ruleLine(s)) + '</div>' +
        '<div class="entry-act no-print">' + (q.level === "full" && alternatives(s).length ? '<button type="button" class="btn small primary" data-act="swap-backup" data-sec="' + esc(s.id) + '">' + esc(t("reg.swapBackup", { code: secCode(alternatives(s)[0]) })) + '</button>' : "") +
        '<button type="button" class="btn small ghost" data-act="toggle-full" data-sec="' + esc(s.id) + '">' + esc(t(q.marked ? "btn.unmarkFull" : "reg.simFull")) + '</button></div></li>';
    }).join("") + '</ol></div>';
    var pv = planVariants(), plans = pv.plans;
    html += '<h3 class="section-h">' + esc(t("reg.plansT")) + '</h3><div class="plan-grid">' + plans.map(function (p, idx) {
      var tot = 0; p.secs.forEach(function (s) { tot += cu(byCode[s.code]); });
      return '<div class="card plan-card"><div class="auto-top"><strong>' + esc(t("reg.plan", { k: p.key })) + '</strong> ' + badge(p.key === "A" ? "ok" : "info", p.key === "A" ? t("reg.planMain") : t("reg.planBackup")) + '<span class="muted small"> ' + tot + ' ' + esc(unitName()) + '</span></div>' +
        ttHtml(cartItems(p.secs), true) +
        '<ul class="plan-secs">' + p.secs.map(function (s) { return '<li><span class="entry-code">' + esc(secCode(s)) + '</span> ' + esc(cname(byCode[s.code])) + '<div class="muted small">' + esc(timesList(s)) + '</div></li>'; }).join("") + '</ul>' +
        (p.key !== "A" ? '<button type="button" class="btn small no-print" data-act="apply-plan" data-idx="' + idx + '">' + esc(t("reg.applyPlan")) + '</button>' : "") + '</div>';
    }).join("") + pv.fails.map(failCard).join("") + '</div>';
    regPlans = plans;
    $("regView").innerHTML = html;
  }
  var regPlans = [];

  /* =========================================================
     Kurallar paneli, başlık, genel render
     ========================================================= */
  function renderRules() {
    var html = '<p>' + esc(t("rules.srcLead")) + ' <a href="' + esc(R.source.url) + '" target="_blank" rel="noopener">' + esc(L(R.source)) + '</a></p>' +
      '<h3>' + esc(t("rules.srcT")) + '</h3><ul class="rule-list">' + R.sources.map(function (x) { return '<li><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(L(x)) + '</a></li>'; }).join("") + '</ul>' +
      '<ul class="rule-list">' + R.info.map(function (r) { return '<li><span class="ref">' + esc(r.ref) + '</span> ' + esc(L(r)) + '</li>'; }).join("") + '</ul>' +
      '<h3>' + esc(t("rules.yourT")) + '</h3><p>' + esc(t("rules.your", { g: num2(gpa()), s: L(standing().label), m: standing().max, unit: unitName() })) + '</p>' +
      '<h3>' + esc(t("rules.caveatT")) + '</h3><ul class="rule-list">' +
      ["rules.c1", "rules.c2", "rules.c3", "rules.c4", "rules.c5"].map(function (k) { return "<li>" + esc(t(k)) + "</li>"; }).join("") + '</ul>';
    $("rulesBody").innerHTML = html;
  }
  function renderHeader() {
    var tot = cartTotals(), limit = limitNow(), s = D.student;
    $("studentChip").innerHTML = '<strong>' + esc(s.name) + '</strong><span>' + esc(s.no) + ' · ' + esc(t("hdr.gpa")) + ' ' + num2(gpa()) + '</span>';
    $("cartPill").innerHTML = esc(t("hdr.cart")) + ': <strong>' + tot.count + '</strong> · <strong>' + tot.units + '</strong>/' + limit + ' ' + esc(unitName());
    $("cartPill").className = "cart-pill" + (tot.units > limit ? " over" : "");
    $("flowDot").hidden = state.flow.status !== "pending";
    var on = LANG === "tr" ? 0 : 1;
    Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function (b) { b.children[0].classList.toggle("on", on === 0); b.children[1].classList.toggle("on", on === 1); });
    var ad = attData(); $("attDot").hidden = !ad || !(ad.over + ad.warn);
  }
  function applyStatic() {
    document.documentElement.lang = LANG;
    document.title = "YaşarOBS+ - " + t("app.subtitle");
    $("loginNo").textContent = D.student.name + " · " + D.student.no; $("loginProg").textContent = D.meta.university + " · " + D.meta.department;
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-ph]"), function (el) { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-aria]"), function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
    $("demoNote").textContent = t("demo.note", { u: D.meta.university, d: D.meta.department, term: L(D.meta.term) });
    var grp = D.meta.group.filter(function (g) { return !/^Üye \d/.test(g); });
    $("footGroup").textContent = grp.length ? t("foot.group") + " " + grp.join(" · ") : "";
    var cur = $("fSem").value, o = '<option value="">' + esc(t("opt.all")) + '</option>', sems = {};
    D.courses.forEach(function (c) { sems[c.semester] = true; });
    Object.keys(sems).sort(function (a, b) { return a - b; }).forEach(function (s) { o += '<option value="' + s + '">' + esc(t("opt.sem", { n: s })) + '</option>'; });
    $("fSem").innerHTML = o; $("fSem").value = cur;
    var curT = $("fType").value;
    $("fType").innerHTML = '<option value="">' + esc(t("opt.all")) + '</option><option value="zorunlu">' + esc(t("type.req")) + '</option><option value="seçmeli">' + esc(t("type.elec")) + '</option>';
    $("fType").value = curT;
    var fr = '<option value="">' + esc(t("pref.freeNone")) + '</option>' + DAYS.map(function (d) { return '<option value="' + d + '">' + esc(dayLong(d)) + '</option>'; }).join("");
    $("prefFree").innerHTML = fr; syncPrefs();
    $("courseOptions").innerHTML = D.courses.map(function (c) { return '<option value="' + esc(c.code + " - " + cname(c)) + '"></option>'; }).join("");
    $("scenarioSel").innerHTML = ["", "balanced", "problem", "empty"].map(function (k) { return '<option value="' + k + '">' + esc(t(k ? "sc." + k : "sc.custom")) + '</option>'; }).join("");
    renderRules(); renderIntro();
  }
  function renderIntro() { $("introCard").hidden = !!state.introDismissed; }
  function renderAll() {
    renderHeader(); renderCourseList(); renderCartPanel(); renderTimetable(); renderAuto(); renderStatus(); renderGrad(); renderFlow(); renderReg(); renderRules(); renderHome(); renderAtt(); renderGrades(); renderCal(); renderAbout();
  }
  function setTab(tab, focus) {
    if (TABS.indexOf(tab) < 0) tab = "plan";
    state.tab = tab; save();
    TABS.forEach(function (n) {
      $("tab-" + n).hidden = n !== tab;
      var b = $("t-" + n); if (n === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); b.classList.toggle("active", n === tab);
    });
    try { if (location.hash !== "#" + tab) history.replaceState(null, "", "#" + tab); } catch (e) { /* yoksay */ }
    if (focus) $("t-" + tab).focus();
    window.scrollTo(0, 0);
  }

  /* Senaryolar (data.js: scenarios). "Dengeli dönem": seçilen derslerin çakışmasız şubelerini bulur ve
     Plan A/B/C'nin üçünü de üretebilen kombinasyonu tercih eder. */
  function buildBalanced(codes) {
    var courses = codes.filter(function (c) { return byCode[c] && isOffered(byCode[c]); });
    var options = courses.map(function (c) {
      var ok = byCode[c].sections.filter(hasSpace);
      return ok.length ? ok : byCode[c].sections;
    });
    var ranked = rank(enumerate(options).sols).slice(0, 80);
    if (!ranked.length) return [];
    var keep = state.cart, pick = ranked[0];
    for (var i = 0; i < ranked.length; i++) {
      state.cart = ranked[i].combo.map(function (s) { return s.id; });
      if (planVariants(false).plans.length >= 3) { pick = ranked[i]; break; }
    }
    state.cart = keep;
    return pick.combo.map(function (s) { return s.id; });
  }
  function applyScenario(key, silent) {
    var sc = D.scenarios || {};
    if (key === "balanced" && sc.balanced) state.cart = buildBalanced(sc.balanced.codes);
    else if (key === "problem" && sc.problem) state.cart = sc.problem.sections.filter(function (id) { return secById[id]; });
    else if (key === "empty") state.cart = [];
    else return;
    state.fullIds = []; state.scenario = key;
    afterCartChange(silent ? "" : t("toast.scenario", { n: t("sc." + key) }), true);
  }
  function addFirstAvailable(code) {
    var c = byCode[code]; if (!c || !c.sections.length) return;
    var pick = c.sections.filter(function (s) { return hasSpace(s) && !conflictsWithCart(s).filter(function (x) { return !x.soft; }).length; })[0] ||
      c.sections.filter(hasSpace)[0] || c.sections[0];
    addSection(pick.id);
  }
  function addRetakes() {
    var added = 0;
    D.courses.forEach(function (c) {
      if (retakeKind(c.code) === "failed" && isOffered(c) && !cartHasCourse(c.code) && c.sections.some(hasSpace) && prereqOk(c)) {
        var pick = c.sections.filter(function (s) { return hasSpace(s) && !conflictsWithCart(s).filter(function (x) { return !x.soft; }).length; })[0] || c.sections.filter(hasSpace)[0];
        state.cart = state.cart.filter(function (x) { return secById[x].code !== c.code; }); state.cart.push(pick.id); added++;
      }
    });
    afterCartChange(added ? t("toast.retakes", { n: added }) : t("toast.noRetakes"));
  }
  function copyText(text) {
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta);
      try { ta.focus(); ta.select(); toast(document.execCommand("copy") ? t("toast.copied") : t("toast.copyFail")); } catch (e) { toast(t("toast.copyFail")); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(t("toast.copied")); }, fallback);
    else fallback();
  }

  /* =========================================================
     YaşarOBS+ : giriş, Ana Sayfa, Devamsızlık, Notlar, Takvim, OBS'den farkı
     ========================================================= */
  var CUR = [];
  var LOGIN_KEY = "yasarObsPlus.login";
  function loggedIn() { try { return window.sessionStorage.getItem(LOGIN_KEY) === "1"; } catch (e) { return true; } }
  function setLogin(on, initial) {
    try { if (on) window.sessionStorage.setItem(LOGIN_KEY, "1"); else window.sessionStorage.removeItem(LOGIN_KEY); } catch (e) { /* yoksay */ }
    $("login").hidden = !!on; $("appShell").hidden = !on;
    if (on && !initial) { setTab("home"); }
    if (!on) setTimeout(function () { $("loginBtn").focus(); }, 0);
  }
  function nowDate() { return new Date(); }
  function pdate(s, eod) { return MO.parseLocal(s, eod); }
  function dshort(d) { return d.toLocaleDateString(locale(), { day: "numeric", month: "short" }); }
  function dlong(d, wd) { return d.toLocaleDateString(locale(), { weekday: wd || "short", day: "numeric", month: "long" }); }
  function inDays(d) {
    var a = new Date(nowDate()); a.setHours(0, 0, 0, 0); var b = new Date(d); b.setHours(0, 0, 0, 0);
    var n = Math.round((b - a) / 864e5);
    return n === 0 ? t("x.today") : n === 1 ? t("x.tomorrow") : n > 0 ? t("x.inDays", { n: n }) : t("x.daysAgo", { n: -n });
  }
  function curSecByCode(code) { return CUR.filter(function (s) { return s.code === code; })[0] || null; }

  /* ---- devamsızlık (m.29(2): teorik %70, uygulama %80 devam zorunlu) ---- */
  function attData() {
    if (!CU) return null;
    var W = CU.weeks, rows = Object.keys(CU.attendance).map(function (code) {
      var c = byCode[code], u = CU.attendance[code], T = c.tul[0], P = c.tul[1];
      function part(hours, ratio, used) {
        if (!hours) return null;
        var allow = Math.floor(hours * W * ratio), left = allow - used;
        return { hours: hours, allow: allow, used: used, left: left, weeks: Math.floor(Math.max(0, left) / hours),
          level: used > allow ? "over" : (left < hours || left <= allow * 0.25 ? "warn" : "ok") };
      }
      var th = part(T, CU.absence.theory, u.t), pr = part(P, CU.absence.practice, u.u);
      var lv = [th, pr].filter(Boolean).map(function (x) { return x.level; });
      var level = lv.indexOf("over") >= 0 ? "over" : lv.indexOf("warn") >= 0 ? "warn" : "ok";
      return { code: code, name: courseName(code), th: th, pr: pr, level: level, retake: isFRetake(code) };
    });
    var ord = { over: 0, warn: 1, ok: 2 };
    rows.sort(function (a, b) { return ord[a.level] - ord[b.level] || (a.code < b.code ? -1 : 1); });
    return { rows: rows, over: rows.filter(function (r) { return r.level === "over"; }).length, warn: rows.filter(function (r) { return r.level === "warn"; }).length };
  }
  function attPartHtml(lbl, p) {
    if (!p) return '<div class="att-part none"><span class="muted small">' + esc(lbl) + ': ' + esc(t("att.none")) + '</span></div>';
    var pct = p.allow ? Math.min(100, p.used / p.allow * 100) : 100;
    var msg = p.level === "over" ? t("att.overMsg") : p.left === 0 ? t("att.zeroMsg") : (p.weeks ? t("att.leftMsg", { n: p.left, w: p.weeks }) : t("att.leftLess", { n: p.left }));
    return '<div class="att-part"><div class="totals-row"><span>' + esc(lbl) + '</span><strong>' + p.used + ' / ' + p.allow + ' ' + esc(t("att.hrs")) + '</strong></div>' +
      '<div class="progress ' + (p.level === "over" ? "over" : "") + '"><span class="lvl-' + p.level + '" style="width:' + pct + '%"></span></div>' +
      '<p class="small ' + (p.level === "ok" ? "muted" : "t-" + p.level) + '">' + esc(msg) + '</p></div>';
  }
  function renderAtt() {
    var A = attData(); if (!A) { $("attView").innerHTML = ""; return; }
    var html = '<div class="intro"><h2>' + esc(t("att.title")) + '</h2><p class="muted">' + esc(t("att.intro", { w: CU.weeks })) + '</p></div>';
    if (A.over || A.warn) html += '<p class="alert ' + (A.over ? "bad" : "warn") + ' big">' + esc(A.over ? t("att.summary", { o: A.over, w: A.warn }) : t("att.summaryW", { w: A.warn })) + '</p>';
    else html += '<p class="alert ok big">' + esc(t("att.allOk")) + '</p>';
    html += '<div class="att-grid">' + A.rows.map(function (r) {
      var lb = { over: ["bad", "att.b.over"], warn: ["warn", "att.b.warn"], ok: ["ok", "att.b.ok"] }[r.level], c = byCode[r.code];
      return '<div class="card att-card lvl-' + r.level + '"><div class="card-head"><div><strong>' + esc(r.code) + '</strong> <span>' + esc(r.name) + '</span><div class="small muted">T+U ' + c.tul[0] + '+' + c.tul[1] + ' · ' + c.ects + ' ' + esc(t("unit.ects")) + '</div></div>' + badge(lb[0], t(lb[1])) + '</div>' +
        attPartHtml(t("att.theory"), r.th) + attPartHtml(t("att.practice"), r.pr) +
        (r.retake ? '<p class="small muted">' + esc(t("att.retakeNote")) + '</p>' : "") + '</div>';
    }).join("") + '</div>';
    html += '<div class="card"><h3>' + esc(t("att.howT")) + '</h3><ul class="rule-list small"><li>' + esc(t("att.how1")) + '</li><li>' + esc(t("att.how2")) + '</li><li>' + esc(t("att.how3")) + '</li></ul></div>';
    $("attView").innerHTML = html;
  }

  /* ---- notlar: Bologna ağırlıkları + girilmiş sınavlar -> finalden gereken ---- */
  var TARGETS = { D: 50, C: 60, B: 70, A: 80 };
  function gradeData(code) {
    var exams = (CU.grades[code] || []).slice(), pred = state.gx[code];
    if (typeof pred === "number") exams.push({ name: "Midterm", score: pred, predicted: true });
    var g = MO.gradeModel({ code: code, exams: exams }, null, TARGETS);
    g.pred = pred; g.need = g.needs.filter(function (n) { return n.label === state.gtarget; })[0] || g.needs[0];
    return g;
  }
  var COMP_LBL = { mid: "g.c.mid", quiz: "g.c.quiz", hw: "g.c.hw", practice: "g.c.practice", project: "g.c.project", part: "g.c.part", final: "g.c.final", other: "g.c.other", field: "g.c.other", pres: "g.c.other" };
  function needText(n, g) {
    if (!n) return "";
    if (n.need === null) return t("g.noFinal");
    if (n.impossible) return t("g.impossible", { l: n.label, n: Math.ceil(n.need) });
    if (n.need <= 0) return t("g.already", { l: n.label });
    return t("g.need", { l: n.label, n: Math.ceil(n.need) });
  }
  function renderGrades() {
    if (!CU) { $("gradesView").innerHTML = ""; return; }
    var html = '<div class="intro"><h2>' + esc(t("g.title")) + '</h2><p class="muted">' + esc(t("g.intro")) + '</p></div>';
    html += '<div class="card g-ctrl"><label class="field inline"><span>' + esc(t("g.target")) + '</span><select id="gTarget">' + Object.keys(TARGETS).map(function (k) {
      return '<option value="' + k + '"' + (state.gtarget === k ? " selected" : "") + '>' + k + ' (≥ ' + TARGETS[k] + ')</option>';
    }).join("") + '</select></label><span class="muted small">' + esc(t("g.targetNote")) + '</span></div>';
    html += '<div class="g-grid">' + Object.keys(CU.grades).map(function (code) {
      var g = gradeData(code), c = byCode[code];
      var h = '<div class="card g-card"><div class="card-head"><div><strong>' + esc(code) + '</strong> ' + esc(courseName(code)) + '<div class="small muted">' + c.ects + ' ' + esc(t("unit.ects")) + (isFRetake(code) ? ' · ' + esc(t("g.retake")) : "") + '</div></div>';
      if (g.missing) return h + '</div><p class="muted small">' + esc(t("g.noWeights")) + '</p></div>';
      var lvl = !g.need ? "ok" : g.need.impossible ? "bad" : g.need.need > 70 ? "warn" : "ok";
      h += badge(lvl === "bad" ? "bad" : lvl === "warn" ? "warn" : "ok", needText(g.need, g)) + '</div>';
      h += '<table class="g-table"><thead><tr><th>' + esc(t("g.th.item")) + '</th><th>' + esc(t("g.th.w")) + '</th><th>' + esc(t("g.th.score")) + '</th><th>' + esc(t("g.th.avg")) + '</th></tr></thead><tbody>' +
        g.items.map(function (it) {
          var nm = it.name ? (it.name === "Midterm" && g.pred !== undefined ? t("g.predMid") : it.name) : t(COMP_LBL[it.key] || "g.c.other");
          return '<tr class="' + (it.graded ? "" : "pending") + '"><td>' + esc(nm) + '</td><td>%' + (Math.round(it.w * 10) / 10) + '</td><td>' + (it.graded ? '<strong>' + it.score + '</strong>' : '<span class="muted">-</span>') + '</td><td>' + (typeof it.classAvg === "number" ? it.classAvg : '<span class="muted">-</span>') + '</td></tr>';
        }).join("") + '</tbody></table>';
      h += g.gradedW === 0 ? '<p class="small muted">' + esc(t("g.nothing")) + '</p>' : '<p class="small">' + t("g.now", { p: num2(g.current), w: Math.round(g.gradedW), a: g.avg === null ? "-" : Math.round(g.avg) }) + '</p>';
      var hasMid = g.comps.some(function (x) { return x.key === "mid"; }), midDone = (CU.grades[code] || []).some(function (e) { return MO.compKey(e.name) === "mid"; });
      if (hasMid && !midDone) h += '<label class="field inline small g-whatif"><span>' + esc(t("g.whatif")) + '</span><input type="number" min="0" max="100" step="1" inputmode="numeric" data-gx="' + esc(code) + '" value="' + (g.pred !== undefined ? g.pred : "") + '" placeholder="' + esc(t("g.whatifPh")) + '">' +
        (g.pred !== undefined ? '<button type="button" class="linklike" data-act="gx-clear" data-code="' + esc(code) + '">' + esc(t("g.clear")) + '</button>' : "") + '</label>';
      h += '<div class="g-needs">' + g.needs.map(function (n) {
        var cls = n.need === null ? "" : n.impossible ? "bad" : n.need <= 0 ? "ok" : n.need > 70 ? "warn" : "";
        return '<span class="g-need ' + cls + '"><b>' + n.label + '</b> ' + (n.need === null ? "-" : n.impossible ? "✕" : n.need <= 0 ? "✓" : Math.ceil(n.need)) + '</span>';
      }).join("") + '</div><p class="tiny muted">' + esc(t("g.needsLbl")) + '</p>';
      return h + '</div>';
    }).join("") + '</div>';
    html += '<p class="muted small">' + esc(t("g.src")) + '</p>';
    $("gradesView").innerHTML = html;
  }

  /* ---- takvim ---- */
  function examLbl(type) { return t("exam." + type); }
  function calEvents() {
    var ev = [];
    CU.acadcal.forEach(function (r) {
      var s = pdate(r.start), e = pdate(r.end, true);
      ev.push({ kind: "dl", name: L(r), start: s, end: e, single: r.start === r.end });
    });
    CU.exams.forEach(function (x) {
      var s = pdate(x.date + " " + x.start);
      ev.push({ kind: "exam", name: examLbl(x.type) + ": " + x.code + " " + courseName(x.code), start: s, end: s, room: x.room, time: x.start + "-" + x.end, type: x.type });
    });
    ev.sort(function (a, b) { return a.start - b.start; });
    return ev;
  }
  function upcoming(limitDays) {
    var now = nowDate(), lim = now.getTime() + (limitDays || 60) * 864e5;
    return calEvents().filter(function (e) {
      if (e.kind === "dl" && e.start <= now && e.end >= now) { e.ongoing = true; return true; }
      return e.start >= now && e.start.getTime() <= lim;
    }).map(function (e) {
      var at = e.ongoing ? e.end : e.start;
      return { ev: e, at: at, txt: e.ongoing ? t("cal.endsIn", { d: inDays(at) }) : inDays(at) };
    });
  }
  function evRow(u) {
    var e = u.ev;
    return '<li class="ev ev-' + e.kind + (e.ongoing ? " ongoing" : "") + '"><span class="ev-date"><b>' + esc(dshort(u.at)) + '</b><small>' + esc(u.txt) + '</small></span><span class="ev-main"><strong>' + esc(e.name) + '</strong>' +
      (e.kind === "exam" ? '<small class="muted">' + esc(e.time + " · " + e.room) + '</small>' : (e.single ? "" : '<small class="muted">' + esc(dshort(e.start) + " - " + dshort(e.end)) + '</small>')) + '</span></li>';
  }
  function downloadICS() {
    var classes = [];
    CUR.forEach(function (s) { s.slots.forEach(function (sl) { classes.push({ code: s.code, no: s.no, name: courseName(s.code), room: s.room, day: sl.day, start: sl.start, end: sl.end }); }); });
    var r = ICS.build({ name: "YaşarOBS+ " + L(D.meta.term), classes: classes, range: { start: "2026-09-21", end: "2026-12-25" },
      exams: CU.exams.map(function (x) { return { code: x.code, name: courseName(x.code), date: x.date, start: x.start, end: x.end, type: x.type, room: x.room }; }),
      deadlines: CU.acadcal.map(function (x) { return { name: L(x), start: x.start, end: x.end }; }),
      labels: { exam: examLbl, classDesc: "YaşarOBS+", alarmDay: t("cal.alarmDay"), alarmHour: t("cal.alarmHour"), classCat: t("cal.catClass"), examCat: t("cal.catExam"), deadlineCat: t("cal.catDl") } });
    var blob = new Blob([r.text], { type: "text/calendar;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "yasarobs-plus-2026-guz.ics"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast(t("cal.done", { c: r.count.classes, e: r.count.exams, d: r.count.deadlines }));
  }
  function renderCal() {
    if (!CU) { $("calView").innerHTML = ""; return; }
    var up = upcoming(120), all = calEvents();
    var html = '<div class="intro"><h2>' + esc(t("cal.title")) + '</h2><p class="muted">' + esc(t("cal.intro")) + '</p></div>';
    html += '<div class="cal-layout"><div><div class="card"><div class="card-head"><h3>' + esc(t("cal.upT")) + '</h3><button type="button" class="btn primary small" data-act="ics">&#128197; ' + esc(t("cal.ics")) + '</button></div>' +
      '<ul class="ev-list">' + up.map(evRow).join("") + '</ul><p class="muted small">' + esc(t("cal.icsNote")) + '</p></div>';
    html += '<div class="card"><h3>' + esc(t("cal.examT")) + '</h3><table class="g-table"><thead><tr><th>' + esc(t("cal.th.date")) + '</th><th>' + esc(t("cal.th.course")) + '</th><th>' + esc(t("cal.th.type")) + '</th><th>' + esc(t("cal.th.room")) + '</th></tr></thead><tbody>' +
      all.filter(function (e) { return e.kind === "exam"; }).map(function (e) {
        return '<tr><td>' + esc(dlong(e.start)) + ' <span class="muted">' + esc(e.time) + '</span></td><td>' + esc(e.name.split(": ")[1]) + '</td><td>' + esc(examLbl(e.type)) + '</td><td>' + esc(e.room) + '</td></tr>';
      }).join("") + '</tbody></table><p class="muted tiny">' + esc(t("cal.sample")) + '</p></div></div>';
    html += '<div><div class="card"><h3>' + esc(t("cal.weekT")) + '</h3><div class="tt-scroll">' + ttHtml(CUR.map(function (s) { return { sec: s, kind: "ok" }; }), false) + '</div></div></div></div>';
    $("calView").innerHTML = html;
  }

  /* ---- Ana Sayfa ---- */
  function renderHome() {
    if (!CU || !CUR) { $("homeView").innerHTML = ""; return; }
    var st = standing(), gp = gpa(), earned = earnedEcts(), tot = R.graduation.totalEcts, rb = null;
    try { rb = rmBundle("suggest"); } catch (e) { rb = null; }
    var grad = rb && rb.B.res.gradIndex !== null ? L(rb.B.res.gradLabel) : "-";
    var todo = [];
    var chk = runChecks();
    if (state.cart.length) todo.push({ lv: chk.errors ? "bad" : chk.warns ? "warn" : "ok", txt: chk.errors ? t("home.t.cart", { e: chk.errors, w: chk.warns }) : chk.warns ? t("home.t.cartW", { w: chk.warns }) : t("home.t.cartOk"), tab: "flow" });
    var fr = D.courses.filter(function (c) { return c.type === "zorunlu" && attempts[c.code] && !passed[c.code]; }).map(function (c) { return c.code; });
    if (fr.length) todo.push({ lv: "warn", txt: t("home.t.failed", { l: fr.join(", ") }), tab: "grad" });
    var A = attData();
    A.rows.filter(function (r) { return r.level !== "ok"; }).forEach(function (r) {
      var p = r.th && r.th.level !== "ok" ? r.th : r.pr;
      todo.push({ lv: r.level === "over" ? "bad" : "warn", txt: r.level === "over" ? t("home.t.attOver", { c: r.code }) : (p.left > 0 ? t("home.t.att", { c: r.code, n: p.left }) : t("home.t.attZero", { c: r.code })), tab: "att" });
    });
    Object.keys(CU.grades).forEach(function (code) {
      var g = gradeData(code), n = g.needs[0];
      if (n && n.need !== null && (n.impossible || n.need > 60)) todo.push({ lv: n.impossible ? "bad" : "warn", txt: t("home.t.grade", { c: code, n: Math.ceil(n.need) }), tab: "grades" });
    });
    var up = upcoming(45);
    if (up.length) todo.push({ lv: "info", txt: t("home.t.next", { n: up[0].ev.name, d: up[0].txt }), tab: "cal" });
    var html = '<div class="home-hello"><div><h2>' + esc(t("home.hello", { n: D.student.name })) + '</h2><p class="muted">' + esc(D.meta.department + " · " + L(D.meta.term) + " · " + t("home.advisor") + ": " + D.student.advisor) + '</p></div>' +
      '<span class="muted small">' + esc(dlong(nowDate(), "long")) + '</span></div>';
    html += '<div class="stat-grid">' +
      '<button type="button" class="card stat tile" data-act="goto" data-tab="grad"><span class="muted small">' + esc(t("home.s.gpa")) + '</span><span class="stat-n ' + (gp < 2 ? "t-bad" : "") + '">' + num2(gp) + '</span><span class="small muted">' + esc(L(st.label)) + '</span></button>' +
      '<button type="button" class="card stat tile" data-act="goto" data-tab="grad"><span class="muted small">' + esc(t("home.s.ects")) + '</span><span class="stat-n">' + earned + '<small> / ' + tot + '</small></span><div class="progress"><span style="width:' + Math.round(earned / tot * 100) + '%"></span></div></button>' +
      '<button type="button" class="card stat tile" data-act="goto" data-tab="plan"><span class="muted small">' + esc(t("home.s.limit")) + '</span><span class="stat-n">' + limitNow() + '<small> ' + esc(unitName()) + '</small></span><span class="small muted">' + esc(t("home.s.limitNote")) + '</span></button>' +
      '<button type="button" class="card stat tile" data-act="goto" data-tab="grad"><span class="muted small">' + esc(t("home.s.grad")) + '</span><span class="stat-n sm">' + esc(grad) + '</span><span class="small muted">' + esc(rb ? t("home.s.gradNote", { n: rb.B.res.termsLeft }) : "") + '</span></button></div>';
    html += '<div class="home-grid"><div class="card"><h3>' + esc(t("home.todoT")) + '</h3><p class="muted small">' + esc(t("home.todoP")) + '</p><ul class="todo">' + todo.map(function (x) {
      return '<li class="todo-' + x.lv + '"><span class="dot" aria-hidden="true"></span><span>' + esc(x.txt) + '</span><button type="button" class="btn small ghost" data-act="goto" data-tab="' + x.tab + '">' + esc(t("home.open")) + ' &rarr;</button></li>';
    }).join("") + '</ul></div>';
    html += '<div class="card"><div class="card-head"><h3>' + esc(t("home.weekT")) + '</h3><button type="button" class="btn small ghost" data-act="goto" data-tab="cal">' + esc(t("home.cal")) + '</button></div>' +
      ttHtml(CUR.map(function (s) { return { sec: s, kind: "ok" }; }), true) +
      '<ul class="ev-list compact">' + up.slice(0, 4).map(evRow).join("") + '</ul></div></div>';
    $("homeView").innerHTML = html;
  }

  /* ---- OBS'den farkı ---- */
  var DIFF = [
    ["d.conf", "plan"], ["d.pre", "status"], ["d.quota", "plan"], ["d.limit", "plan"], ["d.adv", "flow"], ["d.day", "reg"],
    ["d.grad", "grad"], ["d.att", "att"], ["d.grade", "grades"], ["d.cal", "cal"], ["d.home", "home"], ["d.lang", "home"]
  ];
  function renderAbout() {
    var html = '<div class="intro"><h2>' + esc(t("ab.title")) + '</h2><p class="muted">' + esc(t("ab.intro")) + '</p></div>';
    html += '<div class="card"><table class="diff"><thead><tr><th>' + esc(t("ab.th.p")) + '</th><th>' + esc(t("ab.th.obs")) + '</th><th>YaşarOBS+</th></tr></thead><tbody>' + DIFF.map(function (d) {
      return '<tr><th scope="row">' + esc(t(d[0] + ".p")) + '</th><td>' + esc(t(d[0] + ".o")) + '</td><td>' + esc(t(d[0] + ".n")) + ' <button type="button" class="linklike" data-act="goto" data-tab="' + d[1] + '">' + esc(t("ab.try")) + '</button></td></tr>';
    }).join("") + '</tbody></table></div>';
    html += '<div class="ab-grid"><div class="card"><h3>' + esc(t("ab.dataT")) + '</h3><ul class="rule-list small">' + R.sources.map(function (s) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(L(s)) + '</a></li>'; }).join("") +
      '<li><a href="' + esc(R.source.url) + '" target="_blank" rel="noopener">' + esc(L(R.source)) + '</a></li><li>' + esc(t("ab.bologna")) + '</li></ul><p class="small muted">' + esc(t("ab.fake")) + '</p></div>';
    html += '<div class="card"><h3>' + esc(t("ab.howT")) + '</h3><ul class="rule-list small"><li>' + esc(t("ab.h1")) + '</li><li>' + esc(t("ab.h2")) + '</li><li>' + esc(t("ab.h3")) + '</li><li>' + esc(t("ab.h4")) + '</li></ul></div>';
    html += '<div class="card"><h3>' + esc(t("ab.extT")) + '</h3><p class="small">' + esc(t("ab.ext")) + '</p><div class="btn-row"><a class="btn small primary" href="demo-obs/?dev=1">' + esc(t("ab.extDemo")) + '</a><a class="btn small ghost" href="extension.zip" download>' + esc(t("ab.extDl")) + '</a></div></div></div>';
    $("aboutView").innerHTML = html;
  }

  /* ---------- olaylar ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]"); if (!el) return;
    var act = el.getAttribute("data-act"), sid = el.getAttribute("data-sec"), idx = parseInt(el.getAttribute("data-idx"), 10);
    switch (act) {
      case "add": addSection(sid); break;
      case "remove": removeSection(sid); break;
      case "add-first": addFirstAvailable(el.getAttribute("data-code")); break;
      case "add-retakes": addRetakes(); break;
      case "intro-close": state.introDismissed = true; save(); renderIntro(); break;
      case "goto-plan": setTab("plan"); break;
      case "goto": setTab(el.getAttribute("data-tab")); break;
      case "login": setLogin(true); break;
      case "logout": setLogin(false); break;
      case "ics": downloadICS(); break;
      case "gx-clear": delete state.gx[el.getAttribute("data-code")]; save(); renderGrades(); renderHome(); break;
      case "rm-fail": {
        var fc = el.getAttribute("data-code");
        if (state.rm.fail[fc]) delete state.rm.fail[fc]; else state.rm.fail[fc] = true;
        save(); renderGrad(); break;
      }
      case "clear-cart": if (!state.cart.length) { toast(t("toast.cartEmpty")); break; } state.cart = []; afterCartChange(t("toast.cleared")); break;
      case "clear-filters":
        $("fQ").value = ""; $("fType").value = ""; $("fSem").value = "";
        $("fAvail").checked = $("fElig").checked = $("fOpen").checked = false; $("fHidePassed").checked = true; renderCourseList(); break;
      case "limit-auto": state.limitOverride = null; save(); renderAll(); toast(t("toast.limitAuto")); break;
      case "auto": autoSchedule(); break;
      case "auto-more": autoShown += PAGE; renderAuto(); break;
      case "auto-apply": if (autoProposal && autoProposal.list && autoProposal.list[idx]) { state.cart = autoProposal.list[idx].combo.map(function (s) { return s.id; }); afterCartChange(t("toast.applied")); } break;
      case "auto-dismiss": autoProposal = null; renderAuto(); break;
      case "apply-plan": if (regPlans[idx]) { state.cart = regPlans[idx].secs.map(function (s) { return s.id; }); afterCartChange(t("toast.applied")); } break;
      case "toggle-full": {
        var i0 = state.fullIds.indexOf(sid);
        if (i0 >= 0) state.fullIds.splice(i0, 1); else state.fullIds.push(sid);
        autoProposal = null; save(); renderAll();
        toast(t(i0 >= 0 ? "toast.unmarked" : "toast.marked", { c: secCode(secById[sid]) })); break;
      }
      case "swap-backup": {
        var al = alternatives(secById[sid]);
        if (al.length) addSection(al[0].id); break;
      }
      case "copy-summary": copyText($("summaryText").value); break;
      case "copy-plan": copyText(planText()); break;
      case "print": window.print(); break;
      case "submit": state.flow.status = "pending"; state.flow.submittedAt = new Date().toISOString(); state.flow.advisorNote = ""; save(); renderAll(); toast(t("toast.sent")); break;
      case "approve": case "reject": {
        var n = $("advisorNote"); state.flow.advisorNote = n ? n.value.trim() : "";
        state.flow.status = act === "approve" ? "approved" : "rejected"; state.flow.decidedAt = new Date().toISOString(); save(); renderAll(); break;
      }
      case "flow-reset": state.flow = { status: "draft", studentNote: state.flow.studentNote, advisorNote: "", submittedAt: null, decidedAt: null }; save(); renderAll(); break;
      case "sv": state.sv = el.getAttribute("data-v"); save(); renderStatus(); break;
      case "rules-open": if ($("rulesDlg").showModal) $("rulesDlg").showModal(); else $("rulesDlg").setAttribute("open", ""); break;
      case "rules-close": if ($("rulesDlg").close) $("rulesDlg").close(); else $("rulesDlg").removeAttribute("open"); break;
      case "lang":
        LANG = LANG === "tr" ? "en" : "tr";
        try { window.localStorage.setItem(LANG_KEY, LANG); } catch (err) { /* yoksay */ }
        applyStatic(); renderAll(); break;
      case "reset-all":
        if (window.confirm(t("confirm.reset"))) {
          try { window.localStorage.removeItem(KEY); } catch (err) { /* yoksay */ }
          state = defaultState(); autoProposal = null; previewId = null; syncPrefs(); renderAll(); setTab("plan"); toast(t("toast.reset"));
        } break;
    }
  });
  function setPreview(id) { if (previewId !== id) { previewId = id; renderTimetable(); } }
  document.addEventListener("mouseover", function (e) { var r = e.target.closest("[data-sec-row]"); setPreview(r ? r.getAttribute("data-sec-row") : null); });
  document.addEventListener("focusin", function (e) { var r = e.target.closest("[data-sec-row]"); if (r) setPreview(r.getAttribute("data-sec-row")); });
  document.addEventListener("focusout", function (e) { if (e.target.closest("[data-sec-row]")) setPreview(null); });

  ["fQ", "fType", "fSem", "fAvail", "fElig", "fHidePassed", "fOpen"].forEach(function (id) { $(id).addEventListener(id === "fQ" ? "input" : "change", renderCourseList); });
  $("scenarioSel").addEventListener("change", function () { if (this.value) applyScenario(this.value); });
  $("limitEcts").addEventListener("change", function () {
    var v = parseInt(this.value, 10); state.limitOverride = isFinite(v) && v > 0 ? v : null; save(); renderAll();
  });
  ["prefDays", "prefEarly", "prefGaps", "prefFree"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      state.prefs.days = $("prefDays").checked; state.prefs.early = $("prefEarly").checked; state.prefs.gaps = $("prefGaps").checked; state.prefs.free = $("prefFree").value;
      save(); if (autoProposal && autoProposal.list) autoSchedule(); renderReg();
    });
  });
  $("browseQ").addEventListener("input", function () { $("browseResult").innerHTML = ""; renderStatus(); });
  document.addEventListener("input", function (e) {
    if (e.target.id === "studentNote") { state.flow.studentNote = e.target.value; save(); $("summaryText").value = buildSummary(runChecks()); }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "regDate") { state.regDate = e.target.value; save(); updateCountdown(); }
    var rmk = e.target.getAttribute && e.target.getAttribute("data-rm");
    if (e.target.getAttribute && e.target.getAttribute("data-gx")) {
      var gc = e.target.getAttribute("data-gx"), gv = parseFloat(e.target.value);
      if (isFinite(gv) && gv >= 0 && gv <= 100) state.gx[gc] = gv; else delete state.gx[gc];
      save(); renderGrades(); renderHome();
    }
    if (e.target.id === "gTarget") { state.gtarget = e.target.value; save(); renderGrades(); renderHome(); }
    if (rmk === "grade") { state.rm.expected = parseFloat(e.target.value) || 2; save(); renderGrad(); }
    if (rmk === "mode") { state.rm.mode = e.target.value; state.rm.fail = {}; save(); renderGrad(); }
  });
  $("cartPill").addEventListener("click", function () { setTab("plan"); });
  var tabsRow = document.querySelector(".tabs-row");
  tabsRow.addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) setTab(b.getAttribute("data-tab")); });
  tabsRow.addEventListener("keydown", function (e) {
    var i = TABS.indexOf(state.tab), n = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = TABS[(i + 1) % TABS.length]; else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = TABS[(i + TABS.length - 1) % TABS.length];
    else if (e.key === "Home") n = TABS[0]; else if (e.key === "End") n = TABS[TABS.length - 1];
    if (n) { setTab(n, true); e.preventDefault(); }
  });

  /* ---------- başlangıç ---------- */
  CUR = buildBalanced(Object.keys(CU ? CU.attendance : {})).map(function (id) { return secById[id]; });
  applyStatic();
  if (isFresh) { state.tab = "home"; applyScenario("balanced", true); } else renderAll();
  var h0 = (location.hash || "").slice(1);
  setTab(TABS.indexOf(h0) >= 0 ? h0 : state.tab);
  window.addEventListener("hashchange", function () { var h = location.hash.slice(1); if (TABS.indexOf(h) >= 0 && h !== state.tab) setTab(h); });
  setLogin(/[?&]login=1/.test(location.search) ? true : loggedIn(), true);
  regTimer = setInterval(updateCountdown, 30000);
})();
