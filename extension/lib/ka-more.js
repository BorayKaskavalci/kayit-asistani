/* Kayıt Asistanı - kayıt dışı OBS sorunları için saf mantık (DOM/ağ/depolama yok):
   - Devamsızlık: kullanılan / izin verilen saat, kalan saat ve "≈ N ders oturumu", NA riski
   - Not hesabı: Bologna ağırlıkları (lib/weights.js) + Not Listesi sınavları -> mevcut puan, hedef için gereken final
   - Takvim: ders/sınav/akademik takvim olayları (.ics için), "Yaklaşan" listesi
   Global ad: KayitMore. */
(function (root) {
  "use strict";
  var K = root.KayitCore;
  var M = {};
  M.DEFAULT_TARGETS = { D: 50, C: 60, B: 70, A: 80 };
  M.COMPS = ["mid", "quiz", "hw", "practice", "project", "part", "field", "pres", "other", "final"];

  /* sınav / Bologna bileşen adı -> kısa anahtar (tools/build_extension.py COMP_RULES ile aynı) */
  M.compKey = function (name) {
    var s = String(name || "").toLowerCase();
    if (/self-study|ön çalışma|teaching hours|ders süresi/.test(s)) return null;
    if (/final|yar[ıi]y[ıi]l sonu|d[öo]nem sonu/.test(s)) return "final";
    if (/mid-?term|ara s[ıi]nav|vize/.test(s)) return "mid";
    if (/quiz|k[üu][çc][üu]k s[ıi]nav/.test(s)) return "quiz";
    if (/homework|[öo]dev|assign/.test(s)) return "hw";
    if (/practice|uygulama|lab/.test(s)) return "practice";
    if (/project|proje/.test(s)) return "project";
    if (/particip|devam|kat[ıi]l/.test(s)) return "part";
    if (/field|arazi/.test(s)) return "field";
    if (/present|sunum|seminer/.test(s)) return "pres";
    return "other";
  };

  /* ================= devamsızlık ================= */
  /* Bir oturum (blok) kaç ders saati: 08:40-10:30 -> 2 (50 dk ders + 10 dk teneffüs) */
  function blockHours(sl) { return Math.max(1, Math.round((sl.end - sl.start + 10) / 60)); }
  M.sectionFor = function (C, code) {
    var d = C.data;
    if (d.mytimetable && d.mytimetable.sections) {
      var s = d.mytimetable.sections.filter(function (x) { return x.code === code; })[0];
      if (s) return s;
    }
    if (d.registration && d.registration.rows) {
      var r = d.registration.rows.filter(function (x) { return x.code === code; })[0];
      if (r && C.tt.byId[code + "#" + r.no]) return C.tt.byId[code + "#" + r.no];
    }
    var all = C.tt.byCode[code];
    return all && all.length === 1 ? all[0] : null;
  };
  M.attendance = function (C, payload) {
    var p = payload || C.data.attendance;
    if (!p || !p.rows) return null;
    var rows = p.rows.map(function (r) {
      var lim = r.limit || {}, th = lim.theory, pr = lim.practice;
      var combined = (th ? th.max : 0) + (pr ? pr.max : 0);
      /* teorik/uygulama ayrımı sayfada yok: toplam devamsızlık teorik sınırla karşılaştırılır (temkinli);
         teorik saati olmayan (yalnız uygulama) derste uygulama sınırı kullanılır */
      var primary = th && th.hours > 0 ? th.max : (pr && pr.hours > 0 ? pr.max : (combined || null));
      var o = { code: r.code, name: r.name || C.name(r.code, "tr"), tu: r.tu, used: r.used, status: r.status, raw: r.raw, theory: th, practice: pr,
        weeks: lim.weeks || null, allowed: primary, combined: combined || null };
      var sec = M.sectionFor(C, r.code);
      if (sec && sec.slots && sec.slots.length) {
        o.blockHours = Math.max.apply(null, sec.slots.map(blockHours));
        o.weekly = sec.slots.reduce(function (s, sl) { return s + blockHours(sl); }, 0);
        o.sec = sec.code + "(" + sec.no + ")";
      } else if (r.tu) {
        var tu = r.tu.split("+").map(Number);
        o.weekly = (tu[0] || 0) + (tu[1] || 0);
      }
      if (r.status !== "ok" || primary === null || primary === undefined) { o.level = r.status === "notRequired" ? "free" : "info"; return o; }
      o.remaining = primary - r.used;
      o.split = !!(th && th.hours > 0 && pr && pr.hours > 0);
      o.level = r.used > primary ? "over" : (o.remaining <= primary * 0.25 ? "warn" : "ok");
      if (o.blockHours) o.sessions = Math.max(0, Math.floor(o.remaining / o.blockHours));
      else if (o.weekly) o.weeksLeft = Math.max(0, Math.floor(o.remaining / o.weekly));
      return o;
    });
    var order = { over: 0, warn: 1, ok: 2, info: 3, free: 4 };
    rows.sort(function (a, b) { return order[a.level] - order[b.level] || (a.code < b.code ? -1 : 1); });
    return { term: p.term, at: p.at, rows: rows, over: rows.filter(function (r) { return r.level === "over"; }).length,
      warn: rows.filter(function (r) { return r.level === "warn"; }).length };
  };

  /* ================= not hesabı ================= */
  /* comps: [{key, count, pct}] ; kaynak: kullanıcı (ui.gw[kod]) > Bologna (KAYIT_WEIGHTS) */
  M.weightsFor = function (code, override) {
    var W = root.KAYIT_WEIGHTS && root.KAYIT_WEIGHTS.w ? root.KAYIT_WEIGHTS.w[code] : null, comps = [], src = W ? "bologna" : "none";
    if (W) W.forEach(function (c) { comps.push({ key: c[0], count: c[1], pct: c[2] }); });
    if (override && Object.keys(override).length) {
      src = "user";
      var by = {};
      comps.forEach(function (c) { by[c.key] = c; });
      Object.keys(override).forEach(function (k) {
        var v = override[k];
        if (v === null || v === "" || isNaN(v)) return;
        if (by[k]) by[k].pct = +v; else { by[k] = { key: k, count: 1, pct: +v }; comps.push(by[k]); }
      });
      comps = comps.filter(function (c) { return c.pct > 0 || override[c.key] === undefined; }).filter(function (c) { return c.pct > 0; });
    }
    comps.sort(function (a, b) { return M.COMPS.indexOf(a.key) - M.COMPS.indexOf(b.key); });
    return { comps: comps, src: src };
  };
  /* row: Not Listesi dersi {code, exams[{name,score,classAvg}], letter, status}; targets {D:50,...} */
  M.gradeModel = function (row, override, targets) {
    targets = targets || M.DEFAULT_TARGETS;
    var WF = M.weightsFor(row.code, override), comps = WF.comps;
    var sum = comps.reduce(function (s, c) { return s + c.pct; }, 0);
    var items = [], byKey = {};
    (row.exams || []).forEach(function (e) {
      var k = M.compKey(e.name) || "other";
      (byKey[k] = byKey[k] || []).push(e);
    });
    var current = 0, gradedW = 0, pendingW = 0, finalW = 0, classPts = 0, classW = 0, unmatched = [];
    comps.forEach(function (c) {
      /* çok sayılı bileşen (ör. 14 haftalık lab) OBS'de genelde tek toplu not olarak görünür */
      var ex = byKey[c.key] || [], n = (c.count || 1) > 4 && ex.length ? ex.length : Math.max(c.count || 1, ex.length), w = c.pct / n;
      c.n = n;
      ex.forEach(function (e) {
        var graded = typeof e.score === "number";
        items.push({ key: c.key, name: e.name, score: e.score, classAvg: e.classAvg, w: w, graded: graded, date: e.date });
        if (graded) { current += e.score * w / 100; gradedW += w; if (typeof e.classAvg === "number") { classPts += e.classAvg * w / 100; classW += w; } }
        else if (c.key === "final") finalW += w; else pendingW += w;
      });
      for (var i = ex.length; i < n; i++) {
        items.push({ key: c.key, name: null, score: null, w: w, graded: false });
        if (c.key === "final") finalW += w; else pendingW += w;
      }
    });
    Object.keys(byKey).forEach(function (k) {
      if (!comps.some(function (c) { return c.key === k; })) byKey[k].forEach(function (e) { unmatched.push(e); });
    });
    var avg = gradedW ? current / gradedW * 100 : null, classAvg = classW ? classPts / classW * 100 : null;
    var assumed = avg === null ? null : avg;
    var res = { code: row.code, comps: comps, src: WF.src, sum: sum, items: items, current: current, gradedW: gradedW, pendingW: pendingW, finalW: finalW,
      avg: avg, classAvg: classAvg, assumed: assumed, unmatched: unmatched, missing: !comps.length, finished: !!(row.letter && /ge[çc]ti|kald[ıi]|passed|failed/i.test(row.status || "")),
      needs: [] };
    res.badSum = !!comps.length && Math.abs(sum - 100) > 0.5;
    /* hedef için gereken final: diğer bekleyen kalemler şimdiki ortalamanla (yoksa hedefin kendisiyle) varsayılır */
    Object.keys(targets).forEach(function (lbl) {
      var T = +targets[lbl];
      if (isNaN(T)) return;
      var other = pendingW * ((assumed === null ? T : assumed) / 100);
      var need = finalW > 0 ? (T - current - other) / finalW * 100 : null;
      var projected = current + other + (finalW > 0 ? 0 : 0);
      res.needs.push({ label: lbl, target: T, need: need, ok: need !== null ? need <= 0 : projected >= T, impossible: need !== null && need > 100 });
    });
    res.needs.sort(function (a, b) { return a.target - b.target; });
    return res;
  };
  M.grades = function (C, ui, payload) {
    var p = payload || C.data.grades;
    if (!p || !p.rows) return null;
    ui = ui || {};
    var gw = ui.gw || {}, gt = ui.gt || M.DEFAULT_TARGETS;
    return { term: p.term, at: p.at, targets: gt, rows: p.rows.map(function (r) { var g = M.gradeModel(r, gw[r.code], gt); g.row = r; return g; }) };
  };
  /* geçme hedefi (en düşük eşik) için gereken final */
  M.passNeed = function (g) { return g.needs.length ? g.needs[0] : null; };

  /* ================= takvim ================= */
  function parseLocal(s, endOfDay) {
    var m = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(s || ""));
    if (!m) return null;
    var h = m[4] !== undefined ? +m[4] : (endOfDay ? 23 : 0), mi = m[5] !== undefined ? +m[5] : (endOfDay ? 59 : 0);
    return new Date(+m[1], +m[2] - 1, +m[3], h, mi);
  }
  M.parseLocal = parseLocal;
  var RE_START = /ara\s*s[ıi]nav.*not\s*giri/i, RE_END = /yar[ıi]y[ıi]l\s*(sonu\s*)?s[ıi]nav[ıi]?\s*not\s*giri/i, RE_STAFF = /not\s*giri[sş]/i;
  M.defaultRange = function (C) {
    var ac = C.data.acadcal && C.data.acadcal.rows ? C.data.acadcal.rows : [];
    var s = ac.filter(function (r) { return RE_START.test(r.name); })[0], e = ac.filter(function (r) { return RE_END.test(r.name); })[0];
    if (s && e) return { start: s.start.slice(0, 10), end: e.start.slice(0, 10), src: "acadcal" };
    var st = C.start || { year: new Date().getFullYear(), season: "G" };
    return st.season === "B" ? { start: (st.year + 1) + "-02-16", end: (st.year + 1) + "-05-29", src: "guess" }
      : { start: st.year + "-09-21", end: st.year + "-12-25", src: "guess" };
  };
  M.calendar = function (C, cfg) {
    cfg = cfg || {};
    var d = C.data, classes = [], src = null;
    function addSec(s) {
      (s.slots || []).forEach(function (sl) {
        classes.push({ code: s.code, no: s.no, name: C.name(s.code, cfg.lang || "tr") || s.name, room: sl.room || "", instructor: s.instructor || "", day: sl.day, start: sl.start, end: sl.end });
      });
    }
    if (d.mytimetable && d.mytimetable.sections && d.mytimetable.sections.length) { src = "mytimetable"; d.mytimetable.sections.forEach(addSec); }
    else if (d.registration && d.registration.rows && C.tt.sections.length) {
      src = "registration";
      d.registration.rows.forEach(function (r) { var s = C.tt.byId[r.code + "#" + r.no]; if (s) addSec(s); });
    }
    var exams = (d.exams && d.exams.rows ? d.exams.rows : []).map(function (e) {
      var o = {}; Object.keys(e).forEach(function (k) { o[k] = e[k]; }); o.name = C.name(e.code, cfg.lang || "tr"); return o;
    });
    var deadlines = (d.acadcal && d.acadcal.rows ? d.acadcal.rows : []).filter(function (r) { return !RE_STAFF.test(r.name) || /yay[ıi]n|ilan/i.test(r.name); });
    var def = M.defaultRange(C);
    var range = { start: cfg.start || def.start, end: cfg.end || def.end, src: cfg.start || cfg.end ? "user" : def.src };
    return { classes: classes, exams: exams, deadlines: deadlines, range: range, classSrc: src };
  };
  /* Yaklaşan: akademik takvim son tarihleri + sınavlar (now'dan sonraki 60 gün) */
  M.upcoming = function (C, now, days) {
    now = now || new Date(); days = days || 60;
    var out = [], lim = now.getTime() + days * 864e5, d = C.data;
    (d.acadcal && d.acadcal.rows ? d.acadcal.rows : []).forEach(function (r) {
      if (RE_STAFF.test(r.name) && !/yay[ıi]n|ilan/i.test(r.name)) return;
      var s = parseLocal(r.start), e = parseLocal(r.end, true) || s;
      if (!s) return;
      if (now < s && s.getTime() <= lim) out.push({ kind: "starts", name: r.name, at: s });
      else if (now >= s && now <= e) out.push({ kind: "ends", name: r.name, at: e });
    });
    (d.exams && d.exams.rows ? d.exams.rows : []).forEach(function (x) {
      var t = parseLocal(x.date + (x.start ? " " + x.start : ""));
      if (t && t >= now && t.getTime() <= lim) out.push({ kind: "exam", name: x.code, type: x.type, room: x.room, at: t });
    });
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  };
  /* kalan süre: {n, unit: "day"|"hour"|"min"} */
  M.countdown = function (at, now) {
    var ms = at - (now || new Date());
    if (ms < 0) ms = 0;
    if (ms >= 864e5) return { n: Math.floor(ms / 864e5), unit: "day" };
    if (ms >= 36e5) return { n: Math.floor(ms / 36e5), unit: "hour" };
    return { n: Math.max(1, Math.floor(ms / 6e4)), unit: "min" };
  };

  root.KayitMore = M;
})(typeof self !== "undefined" ? self : this);
