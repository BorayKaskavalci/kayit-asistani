/* Kayıt Asistanı - eklenti MODEL katmanı (saf mantık; DOM, ağ, depolama yok).
   OBS'den toplanan verileri ("ka.data") ortak kural motorunun (KayitCore) girdilerine çevirir:
   - birleşik ders programı (tüm sınıf sayfaları, aynı dönem, şube tekilleştirme)
   - öğrenci modeli (OBS Müfredat Durum + data.js bilgi paketi; yalnızca Makine Müh. için ön koşul bilgisi)
   - kayıt kontrolü, alabileceğim dersler, plan (A/B/C), kayıt günü listesi, yol haritası seçenekleri
   Hem panel (üst çerçeve), hem OBS tablo işaretleme (kayıt çerçevesi), hem popup, hem testler kullanır.
   Global ad: KayitExt. */
(function (root) {
  "use strict";
  var K = root.KayitCore;
  var X = {};
  var CODE_RE = /^([A-ZÇĞİÖŞÜ]{2,6})\s?(\d{3,4}[A-Z]?)$/;
  X.GRID = { start: 520, end: 1110 };   /* 08:40 - 18:30 */
  X.DEFAULT_PREFS = { days: false, early: false, gaps: true, free: false };

  function fold(s) {
    return K.upperTr(String(s || "")).replace(/[İI]/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G").replace(/Ü/g, "U")
      .replace(/Ö/g, "O").replace(/Ç/g, "C");
  }
  X.fold = fold;
  function termKey(s) { var p = K.parseTerm(s); return p ? p.year * 2 + (p.season === "B" ? 1 : 0) : -1; }
  X.termKey = termKey;
  function setOf(arr) { var o = {}; (arr || []).forEach(function (x) { o[x] = true; }); return o; }
  X.emptyData = function () { return { v: 1, timetable: {}, lastTimetable: null, curriculum: null, offered: null, registration: null }; };

  /* ---------------- program / dönem ---------------- */
  /* Öncelik: müfredat (öğrencinin kendi programı) > kayıt bilgi satırı > ders programı */
  X.programText = function (data) {
    var c = data.curriculum, r = data.registration, out = "";
    if (c && (c.program || c.curriculumName)) out = (c.program || "") + " " + (c.curriculumName || "");
    else if (r && r.info && (r.info.program || r.info.curriculum)) out = (r.info.program || "") + " " + (r.info.curriculum || "");
    else Object.keys(data.timetable || {}).some(function (k) { out = data.timetable[k].program || ""; return !!out; });
    return out.trim();
  };
  /* Bilgi paketi (data.js) yalnızca Yaşar Makine Mühendisliği için var */
  X.isME = function (data) { return /MAKIN[EA]\s*MUHENDIS|MECHANICAL\s*ENG/.test(fold(X.programText(data))); };

  /* En yeni dönem: toplanan ders programı, kayıt ve açılan ders sayfalarındaki dönem metinlerinden */
  X.currentTerm = function (data) {
    var best = "", bk = -1;
    function see(s) { var k = termKey(s); if (k > bk) { bk = k; best = String(s).trim(); } }
    Object.keys(data.timetable || {}).forEach(function (k) { see(data.timetable[k].term); });
    if (data.registration) see(data.registration.term);
    if (data.offered) see(data.offered.term);
    return best;
  };
  /* Dönem bilinmiyorsa tarihten tahmin: Ağustos-Ocak = Güz, Şubat-Temmuz = Bahar */
  X.guessStart = function (now) {
    now = now || new Date();
    var m = now.getMonth(), y = now.getFullYear();
    if (m >= 7) return { year: y, season: "G" };
    if (m === 0) return { year: y - 1, season: "G" };
    return { year: y - 1, season: "B" };
  };

  /* ---------------- ders programı birleştirme ---------------- */
  /* Aynı dönemin tüm sınıf sayfalarındaki şubeleri tek listede toplar; aynı şube (ör. MATH 2230(1)
     hem 2. hem 3. sınıf sayfasında) tek kez sayılır, saatleri birleşir. */
  X.mergeTimetable = function (data, term) {
    var tk = termKey(term), rows = [], years = {}, programs = [], at = 0, keys = [];
    Object.keys(data.timetable || {}).forEach(function (key) {
      var tt = data.timetable[key];
      if (tk >= 0 && termKey(tt.term) !== tk) return;
      keys.push(key);
      if (tt.program && programs.indexOf(tt.program) < 0) programs.push(tt.program);
      Object.keys(tt.years || {}).forEach(function (y) {
        var yr = tt.years[y];
        years[y] = Math.max(years[y] || 0, yr.at || 0); at = Math.max(at, yr.at || 0);
        (yr.sections || []).forEach(function (s) {
          if (!s.slots || !s.slots.length) rows.push({ day: null, code: s.code, no: s.no, name: s.name });
          s.slots.forEach(function (sl) {
            rows.push({ day: sl.day, start: sl.start, end: sl.end, code: s.code, no: s.no, name: s.name, room: sl.room, cap: s.cap });
          });
        });
      });
    });
    var sections = K.buildSections(rows), byCode = {}, byId = {};
    sections.forEach(function (s) { byId[s.id] = s; (byCode[s.code] = byCode[s.code] || []).push(s); });
    Object.keys(byCode).forEach(function (c) { byCode[c].sort(function (a, b) { return a.no - b.no; }); });
    var yl = Object.keys(years).sort(function (a, b) { return (parseInt(a, 10) || 99) - (parseInt(b, 10) || 99); });
    return { sections: sections, byCode: byCode, byId: byId, years: yl, yearAt: years, programs: programs, at: at, keys: keys,
      courses: Object.keys(byCode).length };
  };
  X.offeredIndex = function (off, term) {
    var o = { list: [], byCode: {}, codes: [], at: off ? off.at : 0, term: off ? off.term : "" };
    if (!off || !off.sections) return o;
    if (term && off.term && termKey(off.term) >= 0 && termKey(off.term) !== termKey(term)) { o.stale = true; return o; }
    off.sections.forEach(function (s) {
      if (!o.byCode[s.code]) { o.byCode[s.code] = []; o.codes.push(s.code); }
      o.byCode[s.code].push(s); o.list.push(s);
    });
    return o;
  };

  /* ---------------- öğrenci modeli ---------------- */
  /* Varsayım (README'de belgeli): tamamlanan yarıyıl ≈ (sınıf-1)*2 + (dönem Bahar ise 1).
     Sınıf bilinmiyorsa: notu kesinleşmiş derslerin alındığı farklı dönem sayısı. */
  X.completedSemesters = function (classYear, start, terms) {
    if (classYear && classYear > 0) return Math.max(0, (classYear - 1) * 2 + (start && start.season === "B" ? 1 : 0));
    return Object.keys(terms || {}).length;
  };
  X.buildModel = function (data, D, meta) {
    meta = meta || {};
    var cur = data.curriculum, reg = data.registration, kn = meta.kn || null;
    var items = [], record = {}, alias = {}, seen = {}, graded = 0, earnedSum = 0, terms = {}, total = 0;
    (cur && cur.items ? cur.items : []).forEach(function (it) {
      var code = it.code;
      if (!code || seen[code]) return;
      seen[code] = true;
      var slot = !CODE_RE.test(code);
      var kname = kn && kn.names[code];
      var item = {
        code: code, name: kname ? kname.tr : (it.name || code), nameEn: kname ? kname.en : (it.name || code),
        ects: it.ects || (kn && kn.ects[code]) || 0, semester: it.semester || (kn && kn.semester[code]) || 0,
        compulsory: it.zs ? it.zs === "Z" : !slot, slot: slot, prereq: kn && kn.prereq[code] ? kn.prereq[code].slice() : [],
        delivery: kn && kn.delivery[code] ? kn.delivery[code] : ""
      };
      items.push(item); total += item.ects;
      if (it.state && it.state !== "none") {
        var tk = it.taken || {};
        record[code] = { state: it.state, grade: K.upperTr(tk.grade || ""), term: tk.term || "", takenCode: tk.code || "" };
        if (tk.code && tk.code !== code && !seen[tk.code]) alias[tk.code] = code;
        if ((it.state === "passed" || it.state === "failed") && K.GRADE_POINTS[K.upperTr(tk.grade || "")] !== undefined) graded += item.ects;
        if (it.state === "passed" || it.state === "exempt") earnedSum += item.ects;
        if (it.state !== "ongoing" && tk.term) terms[tk.term] = true;
      }
    });
    var info = reg && reg.info ? reg.info : {};
    var gpa = cur && typeof cur.gpa === "number" ? cur.gpa : (typeof info.gpa === "number" ? info.gpa : null);
    var classYear = (cur && cur.classYear) || info.classYear || null;
    var completed = X.completedSemesters(classYear, meta.start, terms);
    var R = D && D.rules ? D.rules : null;
    var rules = R && R.limit ? { statuses: R.limit.statuses, statusFromCompletedSemesters: R.limit.statusFromCompletedSemesters,
      firstYearMax: R.limit.firstYearMax, totalEcts: (meta.me && R.graduation && R.graduation.totalEcts) || (total >= 120 ? total : 240),
      minGpa: (R.graduation && R.graduation.minGpa) || 2.0 } : K.DEFAULT_RULES;
    var M = K.createModel({
      items: items, record: record, alias: alias, gpa: gpa, gradedEcts: graded,
      earnedEcts: cur && typeof cur.earnedEcts === "number" ? cur.earnedEcts : earnedSum,
      completedSemesters: completed, rules: rules,
      special: meta.me && kn ? kn.special : {}, project: meta.me && kn ? kn.project : [],
      limitOverride: reg && reg.limit ? reg.limit : null
    });
    M.classYear = classYear; M.hasCurriculum = items.length > 0;
    return M;
  };

  /* ---------------- bağlam: tüm hesaplar tek yerde ---------------- */
  X.build = function (data, D) {
    data = data && data.v === 1 ? data : X.emptyData();
    var C = { data: data, D: D || null };
    C.term = X.currentTerm(data);
    C.start = K.parseTerm(C.term) || X.guessStart();
    C.termKnown = !!K.parseTerm(C.term);
    C.isME = X.isME(data);
    C.kn = C.isME && D ? K.knowledgeFromData(D) : null;
    C.tt = X.mergeTimetable(data, C.term);
    C.off = X.offeredIndex(data.offered, C.term);
    C.offeredNow = {};
    Object.keys(C.tt.byCode).forEach(function (c) { C.offeredNow[c] = true; });
    C.off.codes.forEach(function (c) { C.offeredNow[c] = true; });
    C.hasOffered = Object.keys(C.offeredNow).length > 0;
    C.M = X.buildModel(data, D, { kn: C.kn, me: C.isME, start: C.start });
    var pseudo = {};
    /* ders programında saati olmayan ama açılan derslerde görünen dersler: saatsiz şube */
    C.sectionsOf = function (code) {
      if (C.tt.byCode[code]) return C.tt.byCode[code];
      if (!C.off.byCode[code]) return [];
      if (!pseudo[code]) pseudo[code] = C.off.byCode[code].map(function (o) {
        return { id: code + "#" + o.no, code: code, no: o.no, name: o.name, slots: [], rooms: [], cap: 0, noTime: true };
      }).sort(function (a, b) { return a.no - b.no; });
      return pseudo[code];
    };
    C.secById = function (id) {
      if (C.tt.byId[id]) return C.tt.byId[id];
      var code = String(id).split("#")[0];
      return C.sectionsOf(code).filter(function (s) { return s.id === id; })[0] || null;
    };
    C.pairSoft = function (a, b) { return K.overlaps(a, b).length > 0 && C.M.isSoft(a.code, b.code); };
    C.pairHard = function (a, b) { return a.code !== b.code && K.overlaps(a, b).length > 0 && !C.M.isSoft(a.code, b.code); };
    C.name = function (code, lang) {
      var it = C.M.item(code);
      if (it && !it.slot) return lang === "en" ? it.nameEn : it.name;
      /* data.js'teki "Bölüm Seçmeli (KOD)" yer tutucuları yerine OBS'nin gerçek ders adı tercih edilir */
      var kn = C.kn && C.kn.names[code], placeholder = kn && /^B[öo]l[üu]m Se[çc]meli/i.test(kn.tr || "");
      if (kn && !placeholder) return lang === "en" ? kn.en : kn.tr;
      var s = C.off.byCode[code] || C.tt.byCode[code];
      if (s && s[0] && s[0].name) return s[0].name;
      if (kn) return lang === "en" ? kn.en : kn.tr;
      return it ? (lang === "en" ? it.nameEn : it.name) : "";
    };
    C.ects = function (code) {
      var it = C.M.item(code);
      if (it && !it.slot && it.ects) return it.ects;
      if (C.off.byCode[code] && C.off.byCode[code][0].ects) return C.off.byCode[code][0].ects;
      if (C.kn && C.kn.ects[code]) return C.kn.ects[code];
      var r = C.data.registration && C.data.registration.rows ? C.data.registration.rows.filter(function (x) { return x.code === code; })[0] : null;
      return r ? r.ects || 0 : 0;
    };
    return C;
  };

  /* ---------------- toplanan veri özeti (Durum sekmesi, popup) ---------------- */
  X.summary = function (C) {
    var d = C.data, s = { term: C.term, program: X.programText(d), isME: C.isME };
    s.timetable = C.tt.sections.length || C.tt.years.length ? { years: C.tt.years, sections: C.tt.sections.length, courses: C.tt.courses, at: C.tt.at, programs: C.tt.programs } : null;
    if (d.curriculum) {
      var it = d.curriculum.items || [];
      s.curriculum = { gpa: d.curriculum.gpa, earned: C.M.earned(), classYear: C.M.classYear, items: it.length, at: d.curriculum.at,
        passed: it.filter(function (i) { return i.state === "passed" || i.state === "exempt"; }).length,
        failed: it.filter(function (i) { return i.state === "failed"; }).length,
        ongoing: it.filter(function (i) { return i.state === "ongoing"; }).length,
        name: d.curriculum.curriculumName || d.curriculum.program || "" };
    } else s.curriculum = null;
    s.offered = d.offered ? { courses: C.off.codes.length, sections: C.off.list.length, at: d.offered.at, term: d.offered.term, stale: !!C.off.stale } : null;
    s.registration = d.registration ? { rows: d.registration.rows.length, total: d.registration.totalEcts, limit: d.registration.limit, at: d.registration.at, term: d.registration.term } : null;
    return s;
  };

  /* ---------------- kayıt kontrolü ---------------- */
  X.check = function (C, fullIds) {
    var reg = C.data.registration;
    if (!reg || !reg.rows) return null;
    var full = setOf(fullIds), hasTT = C.tt.sections.length > 0;
    var rows = reg.rows.map(function (r) {
      return { code: r.code, no: r.no, ects: r.ects, alis: r.alis, name: r.name, noTime: !C.tt.byCode[r.code] };
    });
    var env = {
      sectionFor: hasTT ? function (code, no) { return C.tt.byId[code + "#" + no] || null; } : null,
      offeredCodes: C.offeredNow,
      limit: reg.limit || C.M.limit(),
      totalEcts: typeof reg.totalEcts === "number" ? reg.totalEcts : undefined
    };
    var res = K.checkRegistration(C.M, rows, env);
    var secs = rows.map(function (r) { return env.sectionFor ? env.sectionFor(r.code, r.no) : null; });
    var aenv = { sectionsOf: C.sectionsOf, hasSpace: function (s) { return !full[s.id]; }, pairHard: C.pairHard };
    var alts = {};
    res.rows.forEach(function (r, i) {
      if (!secs[i] || !r.issues.some(function (x) { return x.type === "conflict"; })) return;
      var others = secs.filter(function (s, j) { return s && j !== i; });
      alts[i] = K.alternatives(secs[i], others, aenv);
    });
    var noTime = rows.filter(function (r, i) { return hasTT && r.noTime && !secs[i]; }).map(function (r) { return r.code; });
    var warns = res.rows.filter(function (o) { return o.level === "warn"; }).length;
    return { res: res, rows: rows, regRows: reg.rows, secs: secs, alts: alts, noTime: noTime, hasTT: hasTT, warns: warns,
      hasCurriculum: C.M.hasCurriculum };
  };

  /* ---------------- alabileceğim dersler ---------------- */
  X.eligible = function (C) {
    var M = C.M, g = { retake: [], req: [], elec: [], improve: [], blocked: [], closed: [], passed: [] };
    function entry(code, e, it) {
      return { code: code, e: e, name: C.name(code, "tr"), ects: C.ects(code), semester: it ? it.semester : null,
        compulsory: it ? it.compulsory : false, sections: C.sectionsOf(code).length };
    }
    M.items.forEach(function (it) {
      if (it.slot) return;
      var e = M.eligibility(it.code, !!C.offeredNow[it.code]), x = entry(it.code, e, it);
      if (e.status === "retake") (it.compulsory ? g.retake : g.req).push(x);
      else if (e.status === "ok") (it.compulsory ? g.req : g.elec).push(x);
      else g[e.status].push(x);
    });
    /* müfredatta kodu olmayan ama bölümün açtığı dersler: seçmeli adayları */
    var known = {};
    M.items.forEach(function (it) { known[it.code] = true; });
    C.off.codes.forEach(function (code) {
      if (known[code] || M.byCode[M.key(code)]) return;
      var e = M.eligibility(code, true);
      g[e.status === "passed" ? "passed" : (e.status === "blocked" ? "blocked" : "elec")].push(entry(code, e, null));
    });
    function by(a, b) { return (a.semester || 99) - (b.semester || 99) || (a.code < b.code ? -1 : 1); }
    Object.keys(g).forEach(function (k) { g[k].sort(by); });
    var slots = M.items.filter(function (it) { return it.slot && !M.passed(it.code); }).length;
    return { groups: g, openSlots: slots };
  };

  /* ---------------- plan ---------------- */
  X.statsFn = function (C, prefs) {
    return function (combo) {
      return K.comboStats(combo, { gridStart: X.GRID.start, freeDay: prefs.free ? "Cum" : null, fillRatio: null, pairSoft: C.pairSoft });
    };
  };
  function timeSig(combo) {
    return combo.map(function (s) { return s.slots.map(function (x) { return x.day + x.start + "-" + x.end; }).join(","); }).sort().join("|");
  }
  /* codes: sepet (ders kodları); fullIds: "dolu" işaretli şubeler */
  X.plan = function (C, codes, fullIds, prefs, lim) {
    prefs = prefs || X.DEFAULT_PREFS;
    var full = setOf(fullIds), out = { notOffered: [], allFull: [], timeless: [], codes: [], options: [], ects: 0 };
    (codes || []).forEach(function (code) {
      out.ects += C.ects(code);
      var all = C.sectionsOf(code);
      if (!all.length) { out.notOffered.push(code); return; }
      var av = all.filter(function (s) { return !full[s.id]; });
      if (!av.length) { out.allFull.push(code); return; }
      if (all.every(function (s) { return !s.slots.length; })) out.timeless.push(code);
      out.codes.push(code); out.options.push(av);
    });
    var en = out.options.length ? K.enumerate(out.options, C.pairHard, { maxSol: (lim && lim.maxSol) || 600, nodeCap: (lim && lim.nodeCap) || 250000 }) : { sols: [], capped: false };
    out.capped = en.capped;
    out.count = en.sols.length;
    var ranked = K.rank(en.sols, X.statsFn(C, prefs), prefs), seen = {}, top = [];
    ranked.forEach(function (r) { var k = timeSig(r.combo); if (!seen[k]) { seen[k] = true; top.push(r); } });
    out.ranked = top;
    out.distinct = top.length;
    /* çözüm yoksa: her şubesi birbiriyle çakışan ders çiftleri */
    out.blocking = [];
    if (!en.sols.length && out.options.length > 1) {
      for (var i = 0; i < out.options.length; i++) for (var j = i + 1; j < out.options.length; j++) {
        var allClash = out.options[i].every(function (a) { return out.options[j].every(function (b) { return C.pairHard(a, b); }); });
        if (allClash) out.blocking.push([out.codes[i], out.codes[j]]);
      }
    }
    return out;
  };
  X.variants = function (C, A, fullIds, prefs) {
    prefs = prefs || X.DEFAULT_PREFS;
    var full = setOf(fullIds), sf = X.statsFn(C, prefs);
    var env = { sectionsOf: C.sectionsOf, hasSpace: function (s) { return !full[s.id]; }, pairHard: C.pairHard,
      rank: function (sols) { return K.rank(sols, sf, prefs); } };
    return K.planVariants(A, env);
  };
  /* Kayıt günü giriş sırası: önce tekrar (F) dersleri, sonra yedeği az olan (dolma riski yüksek) dersler.
     Her ders için "doluysa" seçenekleri: Plan A'nın geri kalanıyla uyumlu diğer şubeler, yoksa Plan B/C şubesi. */
  X.entryList = function (C, A, V, fullIds) {
    var full = setOf(fullIds);
    var env = { sectionsOf: C.sectionsOf, hasSpace: function (s) { return !full[s.id]; }, pairHard: C.pairHard };
    var list = A.map(function (s) {
      var others = A.filter(function (o) { return o.id !== s.id; });
      var alts = K.alternatives(s, others, env);
      var b = null, c = null;
      (V && V.plans ? V.plans : []).forEach(function (p) {
        var x = p.secs.filter(function (y) { return y.code === s.code; })[0];
        if (x && x.id !== s.id) { if (p.key === "B" && !b) b = x; if (p.key === "C" && !c) c = x; }
      });
      return { sec: s, retake: C.M.failed(s.code), alts: alts, planB: b, planC: c, pool: C.sectionsOf(s.code).length };
    });
    list.sort(function (a, b) { return (b.retake ? 1 : 0) - (a.retake ? 1 : 0) || a.alts.length - b.alts.length || a.pool - b.pool || (a.sec.code < b.sec.code ? -1 : 1); });
    return list;
  };

  /* ---------------- yol haritası ---------------- */
  /* Kayıt/plan kodlarını müfredat kalemlerine eşler; müfredatta olmayan seçmeli -> boş seçmeli yuvası */
  X.mapToCurriculum = function (C, codes) {
    var M = C.M, out = [], used = {};
    var freeSlots = M.items.filter(function (it) { return it.slot && !M.passed(it.code); })
      .sort(function (a, b) { return (a.semester || 99) - (b.semester || 99); });
    (codes || []).forEach(function (code) {
      var it = M.item(code);
      if (it) { if (out.indexOf(it.code) < 0) out.push(it.code); return; }
      var sl = freeSlots.filter(function (x) { return !used[x.code]; })[0];
      if (sl) { used[sl.code] = true; out.push(sl.code); }
    });
    return out;
  };
  X.roadmapOpts = function (C, mode, planCodes, rm) {
    rm = rm || {};
    var codes = null;
    if (mode === "reg" && C.data.registration) codes = X.mapToCurriculum(C, C.data.registration.rows.map(function (r) { return r.code; }));
    else if (mode === "plan" && planCodes && planCodes.length) codes = X.mapToCurriculum(C, planCodes);
    return { start: C.start, offeredNow: C.hasOffered ? C.offeredNow : null, expected: typeof rm.expected === "number" ? rm.expected : 2,
      failNow: rm.fail || {}, fixedTerm0: codes && codes.length ? codes : null };
  };

  root.KayitExt = X;
})(typeof self !== "undefined" ? self : this);
