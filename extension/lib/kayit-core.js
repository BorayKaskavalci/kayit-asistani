/* =====================================================================
   Kayıt Asistanı - ORTAK KURAL MOTORU (saf mantık; DOM, ağ, depolama yok)
   ---------------------------------------------------------------------
   Hem web uygulaması (kayit-asistani/index.html) hem Chrome eklentisi
   (kayit-asistani/extension) bu dosyayı kullanır. Global ad: KayitCore.

   İçerik
   - Yardımcılar: saat, gün adları, ders kodu normalleştirme, harf notları
   - Ders programı: saatlik OBS satırlarını şube bloklarına birleştirme
   - Çakışma (Yaşar m.29(4): F/U'lu tekrar dersi ilk kez alınan dersle çakışabilir)
   - Çözücü: çakışmasız kombinasyonlar, tercih puanı, Plan B/C
   - Öğrenci modeli: geçti/kaldı, GNO, statü ve AKTS limiti, ön koşul + özel şart (ME 4910)
   - Kayıt kontrolü (OBS ders kayıt özeti için)
   - Mezuniyet yol haritası: dönem dönem en erken mezuniyet planı, kritik yol,
     "ya kalırsam?" ve GNO hedefi
   ===================================================================== */
(function (root) {
  "use strict";
  var K = {};

  /* ---------------- yardımcılar ---------------- */
  K.DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  K.DAY_FROM_LONG = { "PAZARTESİ": "Pzt", "SALI": "Sal", "ÇARŞAMBA": "Çar", "PERŞEMBE": "Per", "CUMA": "Cum", "CUMARTESİ": "Cmt", "PAZAR": "Paz" };
  K.toMin = function (x) { var p = String(x).split(":"); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); };
  K.fmt = function (m) { return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); };
  K.upperTr = function (s) { return String(s).replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase(); };
  K.dayShort = function (s) {
    if (K.DAYS.indexOf(s) >= 0) return s;
    return K.DAY_FROM_LONG[K.upperTr(String(s).trim())] || null;
  };
  /* "me4910" / "ME  4910" -> "ME 4910" */
  K.normCode = function (s) {
    var x = K.upperTr(String(s || "").replace(/ /g, " ").trim()).replace(/\s+/g, " ");
    return x.replace(/^([A-ZÇĞİÖŞÜ]{2,6})\s?(\d{3,4}[A-Z]?)$/, "$1 $2");
  };
  /* "MATH 2263(3)" -> {code:"MATH 2263", no:3} */
  K.parseCodeSec = function (s) {
    var m = /([A-ZÇĞİÖŞÜa-z]{2,6})\s*(\d{3,4}[A-Z]?)\s*\(\s*(\d+)\s*\)/.exec(String(s || ""));
    return m ? { code: K.normCode(m[1] + " " + m[2]), no: parseInt(m[3], 10) } : null;
  };
  K.parseHourRange = function (s) {
    var m = /(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})/.exec(String(s || ""));
    return m ? { start: K.toMin(m[1].replace(".", ":")), end: K.toMin(m[2].replace(".", ":")) } : null;
  };
  K.parseNum = function (s) {
    var m = /-?\d+(?:[.,]\d+)?/.exec(String(s || ""));
    return m ? parseFloat(m[0].replace(",", ".")) : null;
  };
  /* GNO: m.21(5) 2 basamağa kesme */
  K.trunc2 = function (x) { return Math.floor(x * 100 + 1e-9) / 100; };

  /* ---------------- harf notları ---------------- */
  /* Yaşar (A..F) + eski 4'lük ölçek (AA..FF) + Proliz özel harfleri */
  K.GRADE_POINTS = { "A": 4, "A-": 3.7, "B+": 3.3, "B": 3, "B-": 2.7, "C+": 2.3, "C": 2, "C-": 1.7, "D+": 1.3, "D": 1, "F": 0,
    "AA": 4, "BA": 3.5, "BB": 3, "CB": 2.5, "CC": 2, "DC": 1.5, "DD": 1, "FD": 0.5, "FF": 0, "NA": 0, "DZ": 0 };
  K.PASS_GRADES = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "AA", "BA", "BB", "CB", "CC", "DC", "DD", "S", "P", "G", "YT"];
  K.FAIL_GRADES = ["F", "FF", "FD", "U", "NA", "W", "DZ", "YZ", "K"];
  K.EXEMPT_GRADES = ["M", "MU", "MUAF", "EX", "MF"];
  K.IMPROVABLE = ["C-", "D+", "D", "DC", "DD"];
  K.RETAKE_OVERLAP = ["F", "U", "FF"];
  K.gradeClass = function (g) {
    g = K.upperTr(String(g || "").trim());
    if (!g) return "";
    if (K.PASS_GRADES.indexOf(g) >= 0) return "pass";
    if (K.FAIL_GRADES.indexOf(g) >= 0) return "fail";
    if (K.EXEMPT_GRADES.indexOf(g) >= 0) return "exempt";
    return "";
  };
  /* sayısal ortalamaya en yakın (üstündeki) Yaşar harfi */
  K.letterAtLeast = function (p) {
    var order = ["D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A"];
    for (var i = 0; i < order.length; i++) if (K.GRADE_POINTS[order[i]] >= p - 1e-9) return order[i];
    return null;
  };

  /* ---------------- ders programı ---------------- */
  /* rows: [{day, start, end, code, no, name, room, cap}] (her satır = 1 ders saati)
     -> şubeler [{id, code, no, name, slots[{day,start,end,room}], rooms[], cap}]
     Aynı şubenin aynı gündeki ardışık saatleri (arada <= 15 dk teneffüs) tek blok olur. */
  K.buildSections = function (rows) {
    var by = {}, order = [];
    rows.forEach(function (r) {
      if (!r || !r.code || !r.day || r.start == null) return;
      var id = r.code + "#" + r.no;
      if (!by[id]) { by[id] = { id: id, code: r.code, no: r.no, name: r.name || "", hours: [], rooms: [], cap: 0 }; order.push(id); }
      var s = by[id];
      if (r.room && s.rooms.indexOf(r.room) < 0) s.rooms.push(r.room);
      if (r.cap && r.cap > s.cap) s.cap = r.cap;
      if (!s.name && r.name) s.name = r.name;
      if (!s.hours.some(function (h) { return h.day === r.day && h.start === r.start && h.end === r.end; }))
        s.hours.push({ day: r.day, start: r.start, end: r.end, room: r.room || "" });
    });
    return order.map(function (id) {
      var s = by[id], slots = [];
      s.hours.sort(function (a, b) { return K.DAYS.indexOf(a.day) - K.DAYS.indexOf(b.day) || a.start - b.start; });
      s.hours.forEach(function (h) {
        var last = slots[slots.length - 1];
        if (last && last.day === h.day && h.start - last.end <= 15 && h.start >= last.start) {
          last.end = Math.max(last.end, h.end);
          if (h.room && last.room.split(" · ").indexOf(h.room) < 0) last.room += (last.room ? " · " : "") + h.room;
        } else slots.push({ day: h.day, start: h.start, end: h.end, room: h.room });
      });
      return { id: id, code: s.code, no: s.no, name: s.name, slots: slots, rooms: s.rooms, cap: s.cap };
    });
  };

  /* ---------------- çakışma ---------------- */
  K.overlaps = function (a, b) {
    var out = [];
    a.slots.forEach(function (x) {
      b.slots.forEach(function (y) {
        if (x.day === y.day && x.start < y.end && y.start < x.end) out.push({ day: x.day, start: Math.max(x.start, y.start), end: Math.min(x.end, y.end) });
      });
    });
    return out;
  };
  /* softFn(a, b): izinli (tekrar dersi) çakışma mı? */
  K.findConflicts = function (secs, softFn) {
    var res = [];
    for (var i = 0; i < secs.length; i++) for (var j = i + 1; j < secs.length; j++) {
      if (secs[i].code === secs[j].code) continue;
      var o = K.overlaps(secs[i], secs[j]);
      if (o.length) res.push({ a: secs[i], b: secs[j], overlaps: o, soft: !!(softFn && softFn(secs[i], secs[j])) });
    }
    return res;
  };

  /* ---------------- çözücü ---------------- */
  /* options: her ders için aday şubeler; hardFn(a,b): birlikte alınamaz mı */
  K.enumerate = function (options, hardFn, lim) {
    lim = lim || {};
    var MAX = lim.maxSol || 600, CAP = lim.nodeCap || 250000;
    var order = options.map(function (_, i) { return i; }).sort(function (a, b) { return options[a].length - options[b].length; });
    var sols = [], nodes = 0, chosen = [];
    (function bt(k) {
      if (sols.length >= MAX || nodes > CAP) return;
      nodes++;
      if (k === order.length) { sols.push(chosen.slice()); return; }
      var opts = options[order[k]];
      for (var i = 0; i < opts.length; i++) {
        var s = opts[i], ok = true;
        for (var j = 0; j < chosen.length; j++) if (hardFn(chosen[j], s)) { ok = false; break; }
        if (ok) { chosen.push(s); bt(k + 1); chosen.pop(); }
      }
    })(0);
    return { sols: sols, capped: sols.length >= MAX || nodes > CAP };
  };
  /* o: {gridStart (dk), freeDay, fillRatio(s), pairSoft(a,b)} */
  K.comboStats = function (combo, o) {
    var gs = o.gridStart, days = {}, gap = 0, early = 0, free = 0, fill = 0, softN = 0, earliest = 99999;
    combo.forEach(function (s) {
      fill += o.fillRatio ? o.fillRatio(s) : 0;
      s.slots.forEach(function (sl) {
        (days[sl.day] = days[sl.day] || []).push(sl);
        if (sl.start <= gs) early++;
        if (sl.start < earliest) earliest = sl.start;
        if (o.freeDay && sl.day === o.freeDay) free++;
      });
    });
    Object.keys(days).forEach(function (d) {
      var a = days[d].slice().sort(function (x, y) { return x.start - y.start; });
      for (var i = 1; i < a.length; i++) if (a[i].start > a[i - 1].end) gap += a[i].start - a[i - 1].end;
    });
    if (o.pairSoft) for (var i = 0; i < combo.length; i++) for (var j = i + 1; j < combo.length; j++) if (o.pairSoft(combo[i], combo[j])) softN++;
    return { days: Object.keys(days).length, gap: gap, early: early, free: free, fill: fill, soft: softN, earliest: earliest === 99999 ? null : earliest };
  };
  /* tercih puanı (küçük = iyi): en az gün, 08:40 yok, az boşluk, boş gün, izinli çakışma cezası */
  K.comboScore = function (st, p) {
    return st.days * (p.days ? 150 : 15) + st.gap * (p.gaps ? 1 : 0.1) + st.early * (p.early ? 1000 : 0) +
      st.free * (p.free ? 1000 : 0) + st.soft * 500 + st.fill * 5;
  };
  K.rank = function (sols, statsFn, prefs) {
    var list = sols.map(function (combo) {
      var st = statsFn(combo);
      return { combo: combo.slice().sort(function (a, b) { return a.code < b.code ? -1 : 1; }), stats: st, score: K.comboScore(st, prefs) };
    });
    list.sort(function (a, b) { return a.score - b.score; });
    return list;
  };
  /* Plan B/C: aynı derslerin daha önce kullanılmamış ve yeri olan şubeleri.
     env: {sectionsOf(code), hasSpace(s), pairHard(a,b), rank(sols)} */
  K.planOptions = function (A, excl, skipCode, env) {
    return A.filter(function (s) { return s.code !== skipCode; }).map(function (s) {
      var pool = env.sectionsOf(s.code).filter(function (x) { return env.hasSpace(x) && excl.indexOf(x.id) < 0; });
      return pool.concat([s]);   /* uygun yedek yoksa dersi Plan A'daki şubesiyle tut */
    });
  };
  K.bestPlan = function (A, excl, skipCode, env) {
    var ranked = env.rank(K.enumerate(K.planOptions(A, excl, skipCode, env), env.pairHard).sols), best = null;
    for (var i = 0; i < ranked.length; i++) {
      var diff = ranked[i].combo.filter(function (x) { return excl.indexOf(x.id) < 0; });
      if (diff.length && (!best || diff.length > best.diff.length)) best = { r: ranked[i], diff: diff };
    }
    return best;
  };
  K.planVariants = function (A, env) {
    if (!A.length) return { plans: [], fails: [] };
    var plans = [{ key: "A", secs: A.slice().sort(function (a, b) { return a.code < b.code ? -1 : 1; }) }], fails = [];
    var excl = A.map(function (s) { return s.id; });
    ["B", "C"].forEach(function (key) {
      if (plans.length < (key === "B" ? 1 : 2)) { fails.push({ key: key, after: true }); return; }
      var res = K.bestPlan(A, excl, null, env);
      if (!res) { fails.push({ key: key }); return; }
      plans.push({ key: key, secs: res.r.combo, diff: res.diff.length });
      res.diff.forEach(function (x) { excl.push(x.id); });
    });
    return { plans: plans, fails: fails };
  };
  /* aynı dersin, diğer seçilenlerle sert çakışmayan ve yeri olan diğer şubeleri */
  K.alternatives = function (sec, others, env) {
    return env.sectionsOf(sec.code).filter(function (s) {
      return s.id !== sec.id && env.hasSpace(s) && !others.some(function (o) { return o.code !== sec.code && env.pairHard(s, o); });
    });
  };

  /* =====================================================================
     ÖĞRENCİ MODELİ
     cfg = {
       items: [{code, name, nameEn, ects, semester, compulsory, slot, prereq[], delivery}],   müfredat
       record: {kod: {state:"passed"|"failed"|"ongoing"|"exempt", grade, term, takenCode}},
       alias: {alınanKod: müfredatKodu}  (eşdeğer dersler: SE 1115 -> ENGR 1115)
       gpa, gradedEcts, earnedEcts, completedSemesters,
       rules: {statuses:[{key,minGpa,max,prioritizeFailedRequired}], statusFromCompletedSemesters, firstYearMax, totalEcts, minGpa},
       special: {"ME 4910": {minEcts, requiredSemesters:[1..4]}},
       limitOverride: OBS'den okunan limit (Table5) veya null,
       project: ["ME 4910","ME 4920","ME 4830"]
     }
     ===================================================================== */
  K.DEFAULT_RULES = {
    statuses: [{ key: "basarili", minGpa: 2.0, max: 40 }, { key: "sinamali", minGpa: 0, max: 32, prioritizeFailedRequired: true }],
    statusFromCompletedSemesters: 2, firstYearMax: 30, totalEcts: 240, minGpa: 2.0
  };
  K.createModel = function (cfg) {
    var M = { cfg: cfg }, rules = cfg.rules || K.DEFAULT_RULES, items = cfg.items || [], rec = cfg.record || {}, alias = cfg.alias || {};
    var byCode = {};
    items.forEach(function (it) { byCode[it.code] = it; });
    M.items = items; M.byCode = byCode; M.rules = rules;
    M.key = function (code) { return byCode[code] ? code : (alias[code] || code); };
    M.item = function (code) { return byCode[M.key(code)] || null; };
    M.rec = function (code) { return rec[M.key(code)] || null; };
    M.passed = function (code) { var r = M.rec(code); return !!r && (r.state === "passed" || r.state === "exempt"); };
    M.failed = function (code) { var r = M.rec(code); return !!r && r.state === "failed"; };
    M.ongoing = function (code) { var r = M.rec(code); return !!r && r.state === "ongoing"; };
    M.attempted = function (code) { var r = M.rec(code); return !!r && r.state !== "ongoing" && !!r.state; };
    M.grade = function (code) { var r = M.rec(code); return r ? (r.grade || "") : ""; };
    M.isFRetake = function (code) { return M.failed(code) && K.RETAKE_OVERLAP.indexOf(K.upperTr(M.grade(code))) >= 0; };
    M.isFirstTime = function (code) { var r = M.rec(code); return !r || !r.state || r.state === "ongoing"; };
    M.improvable = function (code) { return M.passed(code) && K.IMPROVABLE.indexOf(K.upperTr(M.grade(code))) >= 0; };
    /* izinli çakışma (m.29(4)): biri F/U'lu tekrar, diğeri ilk kez alınan ders */
    M.isSoft = function (a, b) {
      var ca = a.code || a, cb = b.code || b;
      return (M.isFRetake(ca) && M.isFirstTime(cb)) || (M.isFRetake(cb) && M.isFirstTime(ca));
    };
    M.earned = function () {
      if (typeof cfg.earnedEcts === "number") return cfg.earnedEcts;
      var n = 0; items.forEach(function (it) { if (M.passed(it.code)) n += it.ects || 0; }); return n;
    };
    M.gpa = function () { return typeof cfg.gpa === "number" ? cfg.gpa : null; };
    M.completedSemesters = function () { return cfg.completedSemesters || 0; };
    M.standingFor = function (g, completed) {
      if (completed < rules.statusFromCompletedSemesters) return { key: "first", max: rules.firstYearMax };
      if (g === null || g === undefined) return { key: "unknown", max: rules.statuses[0].max };
      var list = rules.statuses.slice().sort(function (a, b) { return b.minGpa - a.minGpa; });
      g = K.trunc2(g);
      for (var i = 0; i < list.length; i++) if (g >= list[i].minGpa) return list[i];
      return list[list.length - 1];
    };
    M.standing = function () { return M.standingFor(M.gpa(), M.completedSemesters()); };
    M.limit = function () { return cfg.limitOverride || M.standing().max; };
    M.limitSource = function () { return cfg.limitOverride ? "obs" : "rule"; };
    M.prereqsOf = function (code) { var it = M.item(code); return it && it.prereq ? it.prereq : []; };
    M.dependents = function (code) { return items.filter(function (c) { return (c.prereq || []).indexOf(code) >= 0; }).map(function (c) { return c.code; }); };
    M.specialMissing = function (code, passedFn, earned) {
      var sp = cfg.special && cfg.special[code];
      if (!sp) return null;
      passedFn = passedFn || M.passed; earned = earned === undefined ? M.earned() : earned;
      var miss = items.filter(function (c) { return c.compulsory && !c.slot && sp.requiredSemesters.indexOf(c.semester) >= 0 && !passedFn(c.code); }).map(function (c) { return c.code; });
      return { ok: earned >= sp.minEcts && !miss.length, e: earned, m: sp.minEcts, miss: miss,
        sems: sp.requiredSemesters[0] + "-" + sp.requiredSemesters[sp.requiredSemesters.length - 1] };
    };
    /* selected: bu dönem seçilen kodlar (aynı dönemde alınan ön koşul sayılmaz ama bilgi olarak gösterilir) */
    M.prereqStatus = function (code, selected) {
      selected = selected || {};
      var list = M.prereqsOf(code).map(function (p) {
        var st = M.passed(p) ? "ok" : (M.failed(p) ? "failed" : (selected[p] ? "concurrent" : (M.ongoing(p) ? "ongoing" : "missing")));
        return { code: p, state: st, grade: M.grade(p), retaking: !!selected[p] };
      });
      var sp = M.specialMissing(code);
      if (sp) list.push({ code: code, special: true, state: sp.ok ? "ok" : "missing", e: sp.e, m: sp.m, miss: sp.miss, sems: sp.sems });
      return list;
    };
    M.prereqOk = function (code) { return M.prereqStatus(code).every(function (p) { return p.state === "ok"; }); };
    /* durum: passed | blocked | closed | retake | improve | ok */
    M.eligibility = function (code, offered) {
      if (M.passed(code) && !M.improvable(code)) return { status: "passed" };
      var bad = M.prereqStatus(code).filter(function (p) { return p.state !== "ok"; });
      if (bad.length) return { status: "blocked", reasons: bad };
      if (!offered) return { status: "closed" };
      if (M.failed(code)) return { status: "retake" };
      if (M.improvable(code)) return { status: "improve" };
      return { status: "ok" };
    };
    M.failedCompulsory = function () { return items.filter(function (c) { return c.compulsory && !c.slot && M.failed(c.code); }).map(function (c) { return c.code; }); };
    return M;
  };

  /* =====================================================================
     KAYIT KONTROLÜ (OBS "Ders Kayıt" özetindeki kayıtlı dersler)
     rows: [{code, no, ects, alis, name}]
     env: {sectionFor(code,no), offeredCodes{}, limit, totalEcts}
     ===================================================================== */
  K.checkRegistration = function (M, rows, env) {
    var out = rows.map(function (r, i) { return { index: i, code: r.code, no: r.no, issues: [] }; });
    var secs = [], selected = {}, obsRetake = {};
    rows.forEach(function (r, i) {
      selected[M.key(r.code)] = true;
      /* OBS "Alış: Alttan" diyorsa ama müfredatta yalnızca bu dönemki alış görünüyorsa (eski not yok),
         OBS'nin işaretine güvenilir: tekrar dersi sayılır (m.29/4 çakışma istisnası; NA ise geçerli değildir) */
      if (/alttan/i.test(r.alis || "") && !M.passed(r.code) && !M.failed(r.code)) obsRetake[r.code] = true;
      var s = env.sectionFor ? env.sectionFor(r.code, r.no) : null;
      if (s) secs.push({ sec: s, i: i }); else if (env.sectionFor && !r.noTime) out[i].issues.push({ type: "noTime", level: "info" });
    });
    /* çakışma */
    for (var a = 0; a < secs.length; a++) for (var b = a + 1; b < secs.length; b++) {
      if (secs[a].sec.code === secs[b].sec.code) continue;
      var o = K.overlaps(secs[a].sec, secs[b].sec);
      if (!o.length) continue;
      var ca = secs[a].sec.code, cb = secs[b].sec.code;
      var soft = M.isSoft(ca, cb) || (obsRetake[ca] && !obsRetake[cb] && M.isFirstTime(cb)) || (obsRetake[cb] && !obsRetake[ca] && M.isFirstTime(ca));
      out[secs[a].i].issues.push({ type: soft ? "conflictSoft" : "conflict", level: soft ? "warn" : "error", other: secs[b].sec.code, otherNo: secs[b].sec.no, at: o[0] });
      out[secs[b].i].issues.push({ type: soft ? "conflictSoft" : "conflict", level: soft ? "warn" : "error", other: secs[a].sec.code, otherNo: secs[a].sec.no, at: o[0] });
    }
    /* ön koşul + özel şart, tekrar/alttan mantığı */
    rows.forEach(function (r, i) {
      M.prereqStatus(r.code, selected).forEach(function (p) {
        if (p.state === "ok") return;
        if (p.special) {
          /* müfredatta hiç alınmamış görünen (eski müfredat eşdeğeri / intibak olabilir) veya şu an tekrar alınan
             dersler yüzünden eksikse ve AKTS yeterliyse: kesin hata değil, danışmanla teyit edilecek uyarı */
          var untaken = (p.miss || []).filter(function (c) { var r = M.rec(c); return !r || !r.state || r.state === "none"; });
          var ongoing = (p.miss || []).filter(function (c) { return M.ongoing(c) || !!obsRetake[c] || !!selected[M.key(c)]; });
          var soft = p.e >= p.m && (p.miss || []).length > 0 && untaken.length + ongoing.length >= p.miss.length;
          out[i].issues.push({ type: "special", level: soft ? "warn" : "error", p: p, untaken: untaken, ongoing: ongoing, soft: soft });
        } else out[i].issues.push({ type: "prereq", level: "error", p: p });
      });
      var alttan = /alttan/i.test(r.alis || "");
      if (M.passed(r.code) && !M.improvable(r.code)) out[i].issues.push({ type: "repeat", level: "warn", grade: M.grade(r.code) });
      else if (M.improvable(r.code)) out[i].issues.push({ type: "improve", level: "info", grade: M.grade(r.code) });
      else if (M.failed(r.code) && !alttan) out[i].issues.push({ type: "retakeNotMarked", level: "info", grade: M.grade(r.code) });
      else if (alttan && !M.failed(r.code) && !M.passed(r.code)) out[i].issues.push({ type: "alttanUnknown", level: "info" });
      if (M.failed(r.code) || obsRetake[r.code]) out[i].retake = true;
    });
    var global = [];
    var total = 0; rows.forEach(function (r) { total += r.ects || 0; });
    if (typeof env.totalEcts === "number") total = env.totalEcts;
    var limit = env.limit || M.limit();
    if (total > limit) global.push({ type: "limit", level: "error", total: total, limit: limit });
    else global.push({ type: "limitOk", level: "ok", total: total, limit: limit });
    /* açılan ama kayıtta olmayan zorunlu tekrar (m.26: açıldığı ilk dönemde alınmalı) */
    M.failedCompulsory().forEach(function (code) {
      if (selected[code]) return;
      if (env.offeredCodes && env.offeredCodes[code]) global.push({ type: "missingRetake", level: "error", code: code, grade: M.grade(code), prob: M.standing().prioritizeFailedRequired });
    });
    out.forEach(function (o) {
      o.level = o.issues.some(function (x) { return x.level === "error"; }) ? "error" : (o.issues.some(function (x) { return x.level === "warn"; }) ? "warn" : "ok");
    });
    var errors = out.filter(function (o) { return o.level === "error"; }).length + global.filter(function (g) { return g.level === "error"; }).length;
    return { rows: out, global: global, total: total, limit: limit, errors: errors };
  };

  /* =====================================================================
     MEZUNİYET YOL HARİTASI
     Açgözlü (greedy) topolojik dönem planı; öncelik: zorunlu tekrar > kritik yolu
     en uzun zorunlu ders > müfredat yarıyılı > seçmeli yuvası. Sonra doğrulanır.
     Varsayımlar (arayüzde açıklanır):
     - Tek yarıyıl dersleri Güz'de, çift yarıyıl dersleri Bahar'da açılır. Bu dönemin
       OBS ders programı biliniyorsa o dönemde (ve sonraki aynı adlı dönemlerde) programdaki
       dersler de açılmış sayılır.
     - Bir dönemde alınan ders dönem sonunda geçilmiş sayılır ("kalırsam" işaretlenmedikçe).
     - Ön koşul önceki bir dönemde geçilmiş olmalı. ME 4910 özel şartı dönem başında kontrol edilir.
     - Dönem AKTS limiti, dönem başındaki tahmini GNO'ya göre (sınamalı 32 / başarılı 40).
     - Seçmeli yuvaları her iki dönemde alınabilir. Hiçbir ders müfredat yarıyılından
       en fazla `lookahead` (2) yarıyıl önce alınmaz (tekrar dersleri hariç).
     ===================================================================== */
  K.termLabel = function (startYear, season, k) {
    var idx = (season === "B" ? 1 : 0) + k, y = startYear + Math.floor(idx / 2), s = idx % 2 === 0 ? "G" : "B";
    return { year: y, season: s, tr: y + "-" + (y + 1) + " " + (s === "G" ? "Güz" : "Bahar"), en: y + "-" + String(y + 1).slice(-2) + " " + (s === "G" ? "Fall" : "Spring") };
  };
  /* "2026-2027 Güz" -> {year:2026, season:"G"} */
  K.parseTerm = function (s) {
    var m = /(\d{4})\s*-\s*(\d{4})\s*(G[üu]z|Bahar|Yaz|Fall|Spring)/i.exec(String(s || ""));
    if (!m) return null;
    return { year: parseInt(m[1], 10), season: /bahar|spring/i.test(m[3]) ? "B" : "G" };
  };
  /* bağımlılık yüksekliği (kritik yol uzunluğu): ders + ardından gelen en uzun zincir */
  K.chainHeights = function (M) {
    var memo = {}, sp = M.cfg.special || {};
    var deps = {};
    M.items.forEach(function (c) {
      (c.prereq || []).forEach(function (p) { (deps[p] = deps[p] || []).push(c.code); });
      if (sp[c.code]) M.items.forEach(function (x) {
        if (x.compulsory && !x.slot && sp[c.code].requiredSemesters.indexOf(x.semester) >= 0 && x.code !== c.code) (deps[x.code] = deps[x.code] || []).push(c.code);
      });
    });
    function h(code, stack) {
      if (memo[code] !== undefined) return memo[code];
      if (stack[code]) return 1;
      stack[code] = true;
      var best = 0; (deps[code] || []).forEach(function (d) { best = Math.max(best, h(d, stack)); });
      stack[code] = false;
      return (memo[code] = 1 + best);
    }
    var out = {}; M.items.forEach(function (c) { out[c.code] = h(c.code, {}); });
    return out;
  };

  /* opts = {
       start: {year, season}, offeredNow: {kod:true} | null, expected: 2.0, term0Expected: null,
       failNow: {kod:true}, fixedTerm0: [kod] | null, forceTerm0: [kod], notBefore: {kod: dönemIndeksi},
       lookahead: 2, maxTerms: 14
     } */
  K.planRoadmap = function (M, opts) {
    opts = opts || {};
    var items = M.items, rules = M.rules, sp = M.cfg.special || {};
    var start = opts.start || { year: 2026, season: "G" };
    var expected = typeof opts.expected === "number" ? opts.expected : 2.0;
    var look = typeof opts.lookahead === "number" ? opts.lookahead : 2;
    var maxTerms = opts.maxTerms || 14, notBefore = opts.notBefore || {}, failNow = opts.failNow || {};
    var heights = opts.heights || K.chainHeights(M);
    var passed = {}, failed = {}, lastPts = {};
    items.forEach(function (c) {
      if (M.passed(c.code)) passed[c.code] = true;
      else if (M.failed(c.code)) failed[c.code] = true;
      var gp = K.GRADE_POINTS[K.upperTr(M.grade(c.code))];
      if (gp !== undefined && M.rec(c.code) && M.rec(c.code).state !== "ongoing") lastPts[c.code] = gp;
    });
    var earned = M.earned();
    var gpa0 = M.gpa();
    var W = typeof M.cfg.gradedEcts === "number" ? M.cfg.gradedEcts : earned;
    var P = gpa0 !== null ? gpa0 * W : 2.0 * W;
    var remaining = items.filter(function (c) { return !passed[c.code]; });
    var completed0 = M.completedSemesters();
    var terms = [], unplaced = [], idle = 0;

    function seasonOK(c, season, k) {
      if (c.slot) return true;
      if (k === 0 && opts.offeredNow) return !!opts.offeredNow[c.code] || (!!c.delivery && (c.semester % 2 === 1) === (season === "G"));
      if (opts.offeredNow && season === start.season && opts.offeredNow[c.code]) return true;
      return (c.semester % 2 === 1) === (season === "G");
    }
    function prereqOK(c, earnedNow) {
      if ((c.prereq || []).some(function (p) { return !passed[p] && M.byCode[p]; })) return false;
      if (sp[c.code]) {
        var s = sp[c.code];
        if (earnedNow < s.minEcts) return false;
        if (items.some(function (x) { return x.compulsory && !x.slot && s.requiredSemesters.indexOf(x.semester) >= 0 && !passed[x.code]; })) return false;
      }
      return true;
    }
    function kindOf(c) {
      if (failed[c.code] && c.compulsory) return "retake";
      if ((M.cfg.project || []).indexOf(c.code) >= 0) return "project";
      return c.slot || !c.compulsory ? "elective" : "compulsory";
    }

    for (var k = 0; k < maxTerms && remaining.length; k++) {
      var lbl = K.termLabel(start.year, start.season, k);
      var completed = completed0 + k, studentSem = completed + 1;
      var gNow = W > 0 ? P / W : gpa0;
      var st = M.standingFor(gNow, completed);
      var limit = k === 0 && M.cfg.limitOverride ? M.cfg.limitOverride : st.max;
      var chosen = [], total = 0, notes = [];
      var avail = remaining.filter(function (c) {
        if (notBefore[c.code] !== undefined && k < notBefore[c.code]) return false;
        if (!seasonOK(c, lbl.season, k)) return false;
        if (!prereqOK(c, earned)) return false;
        if (!failed[c.code] && c.semester && c.semester > studentSem + look) return false;
        return true;
      });
      if (k === 0 && opts.fixedTerm0) {
        opts.fixedTerm0.forEach(function (code) {
          var c = M.item(code);
          if (!c || passed[c.code] || chosen.indexOf(c) >= 0) return;
          if (avail.indexOf(c) < 0) notes.push({ type: "fixedInvalid", code: c.code });
          chosen.push(c); total += c.ects || 0;
        });
      } else {
        if (k === 0 && opts.forceTerm0) opts.forceTerm0.forEach(function (code) {
          var c = M.item(code); if (c && !passed[c.code] && chosen.indexOf(c) < 0) { chosen.push(c); total += c.ects || 0; }
        });
        avail.slice().sort(function (a, b) {
          var ra = failed[a.code] && a.compulsory ? 1 : 0, rb = failed[b.code] && b.compulsory ? 1 : 0;
          if (ra !== rb) return rb - ra;
          var sa = a.slot ? 1 : 0, sb = b.slot ? 1 : 0;
          if (sa !== sb) return sa - sb;
          return (heights[b.code] || 1) - (heights[a.code] || 1) || (a.semester || 99) - (b.semester || 99) || (a.code < b.code ? -1 : 1);
        }).forEach(function (c) {
          if (chosen.indexOf(c) >= 0) return;
          if (total + (c.ects || 0) <= limit) { chosen.push(c); total += c.ects || 0; }
          else if (failed[c.code] && c.compulsory) notes.push({ type: "retakeNoRoom", code: c.code });
        });
      }
      var gStart = gNow;
      var pts = k === 0 && typeof opts.term0Expected === "number" ? opts.term0Expected : expected;
      var courses = chosen.map(function (c) {
        var fail = k === 0 && !!failNow[c.code];
        return { code: c.code, ects: c.ects || 0, kind: kindOf(c), fail: fail, slot: !!c.slot, semester: c.semester };
      });
      /* dönem sonu */
      chosen.forEach(function (c) {
        var e = c.ects || 0, fail = k === 0 && !!failNow[c.code];
        if (lastPts[c.code] !== undefined) { W -= e; P -= lastPts[c.code] * e; }
        W += e; P += (fail ? 0 : pts) * e; lastPts[c.code] = fail ? 0 : pts;
        if (fail) { failed[c.code] = true; }
        else { passed[c.code] = true; delete failed[c.code]; earned += e; }
      });
      remaining = remaining.filter(function (c) { return !passed[c.code]; });
      terms.push({ index: k, label: lbl, courses: courses, ects: total, limit: limit, standing: st.key, gpaStart: gStart, gpaEnd: W > 0 ? P / W : null, notes: notes, earnedEnd: earned });
      if (!chosen.length) { idle++; if (idle >= 4) break; } else idle = 0;
    }
    remaining.forEach(function (c) { unplaced.push(c.code); });
    while (terms.length && !terms[terms.length - 1].courses.length) terms.pop();
    var gradIndex = unplaced.length ? null : terms.length - 1;
    var gpaEnd = W > 0 ? P / W : null;
    return {
      terms: terms, gradIndex: gradIndex, gradLabel: gradIndex === null ? null : terms[gradIndex].label,
      termsLeft: gradIndex === null ? null : gradIndex + 1, unplaced: unplaced, earnedEnd: earned,
      gpaEnd: gpaEnd, gpaOk: gpaEnd === null || K.trunc2(gpaEnd) >= (rules.minGpa || 2.0),
      totalOk: earned >= (rules.totalEcts || 240), heights: heights
    };
  };

  /* plan doğrulama: ön koşul önceki dönemde geçilmiş mi, limit aşılmış mı, dönem uygun mu */
  K.validateRoadmap = function (M, res, opts) {
    opts = opts || {};
    var errs = [], passedAt = {}, sp = M.cfg.special || {}, earned = M.earned();
    M.items.forEach(function (c) { if (M.passed(c.code)) passedAt[c.code] = -1; });
    res.terms.forEach(function (t) {
      if (t.ects > t.limit && !(t.index === 0 && opts.fixedTerm0)) errs.push({ type: "limit", term: t.index, ects: t.ects, limit: t.limit });
      t.courses.forEach(function (c) {
        var it = M.item(c.code);
        (it.prereq || []).forEach(function (p) {
          if (!M.byCode[p]) return;
          if (!(passedAt[p] !== undefined && passedAt[p] < t.index)) errs.push({ type: "prereq", term: t.index, code: c.code, prereq: p });
        });
        if (sp[c.code]) {
          if (earned < sp[c.code].minEcts) errs.push({ type: "special", term: t.index, code: c.code, earned: earned });
          M.items.forEach(function (x) {
            if (x.compulsory && !x.slot && sp[c.code].requiredSemesters.indexOf(x.semester) >= 0 && !(passedAt[x.code] !== undefined && passedAt[x.code] < t.index))
              errs.push({ type: "special", term: t.index, code: c.code, missing: x.code });
          });
        }
        if (!it.slot && !(t.index === 0 && opts.offeredNow) && !(opts.offeredNow && t.label.season === (opts.start || {}).season && opts.offeredNow[c.code]) &&
          (it.semester % 2 === 1) !== (t.label.season === "G")) errs.push({ type: "season", term: t.index, code: c.code });
      });
      t.courses.forEach(function (c) { if (!c.fail) { if (passedAt[c.code] === undefined) passedAt[c.code] = t.index; } });
      earned = t.earnedEnd;
    });
    return errs;
  };

  /* kritik yol: dersi bir dönem geciktirince mezuniyet kayıyor mu? */
  K.criticalCourses = function (M, opts, base, maxTerm) {
    base = base || K.planRoadmap(M, opts);
    if (base.gradIndex === null) return [];
    var out = [], lim = typeof maxTerm === "number" ? maxTerm : 1;
    base.terms.forEach(function (t) {
      if (t.index > lim) return;
      t.courses.forEach(function (c) {
        if (c.fail) return;
        var o = {}; for (var k in opts) o[k] = opts[k];
        o.notBefore = {}; for (var n in (opts.notBefore || {})) o.notBefore[n] = opts.notBefore[n];
        o.notBefore[c.code] = t.index + 1;
        o.heights = base.heights;
        if (t.index === 0) {
          if (o.fixedTerm0) o.fixedTerm0 = o.fixedTerm0.filter(function (x) { return x !== c.code; });
          if (o.forceTerm0) o.forceTerm0 = o.forceTerm0.filter(function (x) { return x !== c.code; });
        }
        var r = K.planRoadmap(M, o);
        var d = r.gradIndex === null ? 99 : r.gradIndex - base.gradIndex;
        if (d > 0) out.push({ code: c.code, term: t.index, delta: d });
      });
    });
    out.sort(function (a, b) { return b.delta - a.delta || a.term - b.term || (a.code < b.code ? -1 : 1); });
    return out;
  };

  /* GNO hedefi: bu dönemin dersleriyle GNO'yu target'a çıkarmak için gereken ortalama */
  K.gpaTarget = function (M, termCodes, target) {
    target = target || 2.0;
    var g = M.gpa(); if (g === null) return null;
    var W = typeof M.cfg.gradedEcts === "number" ? M.cfg.gradedEcts : M.earned(), P = g * W, E = 0;
    termCodes.forEach(function (code) {
      var it = M.item(code), e = it ? it.ects || 0 : 0;
      var gp = K.GRADE_POINTS[K.upperTr(M.grade(code))];
      if (gp !== undefined && M.attempted(code)) { W -= e; P -= gp * e; }
      E += e;
    });
    if (!E) return null;
    var need = (target * (W + E) - P) / E;
    return { need: need, feasible: need <= 4.0 + 1e-9, already: K.trunc2(g) >= target, letter: need <= 0 ? "D" : K.letterAtLeast(Math.max(need, 1)), ects: E, weight: W + E };
  };
  /* bu dönem sonu GNO tahmini */
  K.projectGpa = function (M, termCodes, points, fails) {
    var g = M.gpa(); if (g === null) return null;
    fails = fails || {};
    var W = typeof M.cfg.gradedEcts === "number" ? M.cfg.gradedEcts : M.earned(), P = g * W;
    termCodes.forEach(function (code) {
      var it = M.item(code), e = it ? it.ects || 0 : 0;
      var gp = K.GRADE_POINTS[K.upperTr(M.grade(code))];
      if (gp !== undefined && M.attempted(code)) { W -= e; P -= gp * e; }
      W += e; P += (fails[code] ? 0 : points) * e;
    });
    return W > 0 ? P / W : g;
  };

  /* Yol haritası sekmesinin tüm hesapları tek seferde:
     plan, "kalırsam"sız temel plan, ders başına "kalırsam" farkı, kritik yol, GNO hedefi ve etkisi */
  K.roadmapBundle = function (M, opts) {
    function copy(o, extra) { var r = {}, k; for (k in o) r[k] = o[k]; for (k in (extra || {})) r[k] = extra[k]; return r; }
    var anyFail = Object.keys(opts.failNow || {}).some(function (k) { return opts.failNow[k]; });
    var clean = K.planRoadmap(M, copy(opts, { failNow: {} }));
    var res = anyFail ? K.planRoadmap(M, opts) : clean;
    var term0 = res.terms[0] && res.terms[0].index === 0 ? res.terms[0].courses.map(function (c) { return c.code; }) : [];
    var cleanTerm0 = clean.terms[0] && clean.terms[0].index === 0 ? clean.terms[0].courses.map(function (c) { return c.code; }) : [];
    var failDelta = {};
    cleanTerm0.forEach(function (code) {
      var f = {}; f[code] = true;
      var r = K.planRoadmap(M, copy(opts, { failNow: f, heights: clean.heights }));
      failDelta[code] = clean.gradIndex === null || r.gradIndex === null ? null : r.gradIndex - clean.gradIndex;
    });
    var crit = K.criticalCourses(M, copy(opts, { failNow: {} }), clean, 1).filter(function (c) { var it = M.item(c.code); return it && !it.slot; });
    var validation = K.validateRoadmap(M, res, opts);
    var exp = typeof opts.expected === "number" ? opts.expected : 2.0;
    var target = K.gpaTarget(M, term0, (M.rules && M.rules.statuses && M.rules.statuses[0].minGpa) || 2.0), targetRes = null;
    if (target && !target.already && target.feasible && target.need > exp) targetRes = K.planRoadmap(M, copy(opts, { term0Expected: Math.max(target.need, 0) }));
    var proj = K.projectGpa(M, term0, typeof opts.term0Expected === "number" ? opts.term0Expected : exp, opts.failNow);
    return { res: res, clean: clean, failDelta: failDelta, crit: crit, validation: validation, target: target, targetRes: targetRes,
      proj: proj, projStanding: proj === null ? null : M.standingFor(proj, M.completedSemesters() + 1), anyFail: anyFail };
  };

  /* ---------- web uygulaması verisinden (data.js) bilgi paketi ---------- */
  /* D = window.KAYIT_DATA. Ön koşullar, özel şartlar, İngilizce adlar, seçmeli yuvaları. */
  K.knowledgeFromData = function (D) {
    var kn = { prereq: {}, names: {}, delivery: {}, ects: {}, semester: {}, type: {}, special: (D.rules && D.rules.specialPrereqs) || {},
      slots: (D.requirements && D.requirements.electiveSlots) || [], required: (D.requirements && D.requirements.required) || [],
      project: (D.requirements && D.requirements.project) || [] };
    (D.courses || []).forEach(function (c) {
      kn.prereq[c.code] = c.prereq || [];
      kn.names[c.code] = { tr: c.nameTr, en: c.nameEn };
      if (c.delivery) kn.delivery[c.code] = c.delivery;
      kn.ects[c.code] = c.ects; kn.semester[c.code] = c.semester; kn.type[c.code] = c.type;
    });
    return kn;
  };
  /* bilgi paketinden müfredat kalemleri (OBS müfredatı yokken / web uygulamasında) */
  K.itemsFromKnowledge = function (kn) {
    var items = kn.required.map(function (code) {
      return { code: code, name: kn.names[code] ? kn.names[code].tr : code, nameEn: kn.names[code] ? kn.names[code].en : code,
        ects: kn.ects[code] || 0, semester: kn.semester[code] || 0, compulsory: true, slot: false, prereq: kn.prereq[code] || [], delivery: kn.delivery[code] || "" };
    });
    kn.slots.forEach(function (s) {
      items.push({ code: s.code, name: s.tr, nameEn: s.en, ects: s.ects, semester: s.semester, compulsory: false, slot: true, group: s.group, prereq: [] });
    });
    return items;
  };

  root.KayitCore = K;
})(typeof self !== "undefined" ? self : this);
