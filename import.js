/* YaşarOBS+ - GERÇEK VERİ İÇE AKTARMA.
   OBS'nin öğrenciye açık bir API'si yok. Gerçek veri iki yoldan gelir; ikisi de aynı biçimi üretir
   (Kayıt Asistanı eklentisinin "ka.data" deposu, extension/lib/bg-core.js):
     1) Eklenti köprüsü: eklenti OBS sayfalarını okur, bu sayfada window.postMessage ile verir (yobs:request -> yobs:data)
     2) Dosya yükleme: OBS'den kaydedilmiş .html sayfaları (aynı ayrıştırıcılarla, tarayıcıda) veya dışa aktarılmış .json
   convert() bu veriyi uygulamanın veri modeline (data.js şeması) çevirir; window.KAYIT_DATA app.js'ten ÖNCE değiştirilir.
   Hiçbir veri bir sunucuya gönderilmez: her şey bu tarayıcının localStorage'ında durur. Global ad: YOBSImport. */
(function () {
  "use strict";
  var IMP_KEY = "yasarObsPlus.import", MAN_KEY = "yasarObsPlus.manualPassed";
  var BASE = window.KAYIT_DATA, K = window.KayitCore;

  function ls(get, key, val) {
    try { if (get) return window.localStorage.getItem(key); if (val === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, val); }
    catch (e) { return null; }
    return null;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hm(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function titleTr(s) {
    return String(s || "").toLocaleLowerCase("tr-TR").replace(/(^|[\s(\-\/])(\S)/g, function (m, a, b) { return a + b.toLocaleUpperCase("tr-TR"); })
      .replace(/\b(Ve|İle|İçin|Ii|Iii|Iv)\b/g, function (w) { return { "Ve": "ve", "İle": "ile", "İçin": "için", "Ii": "II", "Iii": "III", "Iv": "IV" }[w]; });
  }
  var REAL_CODE = /^[A-ZÇĞİÖŞÜ]{2,6} \d{3,4}[A-Z]?$/;
  function manualList() { try { var a = JSON.parse(ls(true, MAN_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }

  function convert(d, base) {
    base = base || BASE;
    var byBase = {}; base.courses.forEach(function (c) { byBase[c.code] = c; });
    var tt = d.timetable && d.lastTimetable ? d.timetable[d.lastTimetable] : null;
    var cur = d.curriculum || { items: [] }, reg = d.registration || null;
    var term = (tt && tt.term) || (reg && reg.term) || (d.offered && d.offered.term) || base.meta.term.tr;
    var termEn = term.replace(/G[üu]z/i, "Fall").replace(/Bahar/i, "Spring");

    /* --- şubeler (Bölüm Ders Programı, tüm sınıflar + kişisel program) --- */
    var secMap = {}, seen = {};
    function addSec(s) {
      if (!s || !s.code || !s.slots || seen[s.code + "#" + s.no]) return;
      seen[s.code + "#" + s.no] = true;
      (secMap[s.code] = secMap[s.code] || []).push({ no: s.no || 1, times: s.slots.map(function (sl) { return sl.day + " " + hm(sl.start) + "-" + hm(sl.end); }),
        room: (s.rooms || []).join(" · "), capacity: s.cap || 0, enrolled: 0, real: true });
    }
    if (tt) Object.keys(tt.years || {}).forEach(function (y) { (tt.years[y].sections || []).forEach(addSec); });
    if (d.mytimetable && d.mytimetable.sections) d.mytimetable.sections.forEach(addSec);

    /* --- dersler + gereksinimler (Müfredat Durum) --- */
    var courses = [], byCode = {}, required = [], slots = [], completed = [], ongoing = {};
    function course(code, o) {
      if (byCode[code]) return byCode[code];
      var b = byBase[code] || null, cr = o.credits || (b ? b.credits : 0);
      var c = { code: code, nameTr: o.name ? titleTr(o.name) : (b ? b.nameTr : code), nameEn: b ? b.nameEn : (o.name ? titleTr(o.name) : code),
        tul: b ? b.tul : [Math.round(cr) || 0, 0, 0], ects: o.ects || (b ? b.ects : 0), credits: cr, type: o.type || "zorunlu",
        semester: o.semester || (b ? b.semester : 0), prereq: b ? b.prereq.slice() : [], prereqVerified: !!b, sections: secMap[code] || [] };
      if (o.cat) c.cat = o.cat;
      if (b && b.delivery) c.delivery = b.delivery;
      if (b && b.note) c.note = b.note;
      if (!c.sections.length && b && b.delivery && b.sections.length) c.sections = b.sections.map(function (s) { return { no: s.no, times: [], room: s.room, capacity: s.capacity, enrolled: s.enrolled }; });
      byCode[code] = c; courses.push(c);
      return c;
    }
    function record(code, taken, state) {
      if (!taken) return;
      if (state === "ongoing" || !taken.grade) { ongoing[code] = true; return; }
      completed.push({ code: code, grade: state === "exempt" ? "MUAF" : taken.grade, term: taken.term || "" });
    }
    (cur.items || []).forEach(function (it) {
      var isSlot = it.zs === "S" || !REAL_CODE.test(it.code);
      if (!isSlot) {
        course(it.code, { name: it.name, ects: it.ects, credits: it.credits, semester: it.semester, type: "zorunlu" });
        if (required.indexOf(it.code) < 0) required.push(it.code);
        record(it.code, it.taken, it.state);
      } else {
        var group = /UNV|[ÜU]N[İI]VERS[İI]TE|UNIV/i.test(it.code + " " + it.name) ? "univ" : "bolum";
        slots.push({ code: it.code, group: group, semester: it.semester || 0, ects: it.ects || 0, tr: titleTr(it.name), en: titleTr(it.name) });
        if (it.taken && it.taken.code && REAL_CODE.test(it.taken.code)) {
          course(it.taken.code, { name: it.taken.name, ects: it.ects, credits: it.credits, semester: it.semester, type: "seçmeli", cat: group });
          record(it.taken.code, it.taken, it.state);
        }
      }
    });
    /* bu dönem açılan ama müfredatta olmayan dersler (seçmeli adayları) */
    ((d.offered && d.offered.sections) || []).forEach(function (o) {
      if (!byCode[o.code]) course(o.code, { name: o.name, ects: o.ects, credits: o.credits, semester: o.classYear ? o.classYear * 2 - 1 : 0, type: o.required ? "zorunlu" : "seçmeli", cat: "bolum" });
    });
    /* kayıtlı dersler (her ihtimale karşı) */
    ((reg && reg.rows) || []).forEach(function (r) {
      if (!byCode[r.code]) course(r.code, { name: r.name, ects: r.ects, credits: r.credits, type: r.zs === "S" ? "seçmeli" : "zorunlu", cat: "bolum" });
    });
    /* elle "eşdeğerle / muafiyetle geçtim" işaretlenenler */
    var man = manualList();
    man.forEach(function (code) {
      if (!byCode[code]) return;
      completed = completed.filter(function (x) { return x.code !== code; });
      completed.push({ code: code, grade: "MUAF", term: "eşdeğer", manual: true });
      delete ongoing[code];
    });

    function sumSlots(g) { return slots.filter(function (s) { return s.group === g; }); }
    var electives = [];
    [["bolum", "Bölüm seçmelileri", "Department electives"], ["univ", "Üniversite seçmelileri", "University electives"]].forEach(function (g) {
      var list = sumSlots(g[0]);
      if (!list.length) return;
      var e = list.reduce(function (s, x) { return s + x.ects; }, 0);
      electives.push({ key: g[0], name: { tr: g[1] + " (" + list.length + " ders, " + e + " AKTS)", en: g[2] + " (" + list.length + " courses, " + e + " ECTS)" }, ects: e, slots: list.length });
    });

    /* --- kurallar: Yaşar yönetmeliği aynı; bölüme özel şart yalnızca Makine için --- */
    var rules = JSON.parse(JSON.stringify(base.rules));
    ["MUAF", "S", "P", "EX"].forEach(function (g) { if (rules.passingGrades.indexOf(g) < 0) rules.passingGrades.push(g); });
    if (rules.failGrades.indexOf("W") < 0) rules.failGrades.push("W");
    var isME = !!byCode["ME 4910"] && !!byCode["ME 2210"];
    if (!isME) rules.specialPrereqs = {};
    rules.days = rules.timetable.days;
    var usesSat = Object.keys(secMap).some(function (c) { return secMap[c].some(function (s) { return s.times.some(function (t) { return /^(Cmt|Paz) /.test(t); }); }); });
    if (usesSat && rules.timetable.days.indexOf("Cmt") < 0) rules.timetable.days = rules.timetable.days.concat(["Cmt"]);

    /* --- öğrenci (ad / numara OKUNMAZ) --- */
    var cy = cur.classYear || (reg && reg.info && reg.info.classYear) || 1;
    var spring = /bahar/i.test(term);
    var student = { name: "Benim verim", nameEn: "My data", no: "", advisor: "", completedSemesters: Math.max(0, (cy - 1) * 2 + (spring ? 1 : 0)),
      completed: completed, gpa: typeof cur.gpa === "number" ? cur.gpa : (reg && reg.info && typeof reg.info.gpa === "number" ? reg.info.gpa : null),
      earnedEcts: typeof cur.earnedEcts === "number" ? cur.earnedEcts : null, manualCount: man.length };

    /* --- bu dönem: kayıt, devamsızlık, notlar, sınavlar, akademik takvim --- */
    var regSecs = [];
    ((reg && reg.rows) || []).forEach(function (r) {
      var c = byCode[r.code]; if (!c) return;
      var s = c.sections.filter(function (x) { return x.no === r.no; })[0] || (c.sections.length === 1 ? c.sections[0] : null);
      /* ders programı yüklenmediyse: kayıtlı şube saatsiz olarak eklenir (devamsızlık / not / AKTS yine çalışır) */
      if (!s) { s = { no: r.no || 1, times: [], room: "", capacity: 0, enrolled: 0, real: true }; c.sections.push(s); }
      if (s) regSecs.push(r.code + "#" + s.no);
    });
    if (!regSecs.length && d.mytimetable && d.mytimetable.sections) d.mytimetable.sections.forEach(function (s) { if (byCode[s.code]) regSecs.push(s.code + "#" + s.no); });
    var att = {};
    ((d.attendance && d.attendance.rows) || []).forEach(function (r) {
      if (!byCode[r.code] || r.status !== "ok") return;
      var th = r.limit && r.limit.theory, pr = r.limit && r.limit.practice;
      /* OBS toplam devamsızlık saatini verir (teorik/uygulama ayrımı yok): temkinli olarak teorik sınırla karşılaştırılır */
      att[r.code] = { t: r.used || 0, allowT: th && th.hours ? th.max : (pr ? pr.max : null), hoursT: th && th.hours ? th.hours / ((r.limit.weeks) || 14) : null, single: true };
    });
    var grades = {};
    ((d.grades && d.grades.rows) || []).forEach(function (r) {
      if (!byCode[r.code]) return;
      grades[r.code] = (r.exams || []).filter(function (e) { return e && e.name; }).map(function (e) { return { name: e.name, score: e.score, classAvg: e.classAvg, date: e.date }; });
    });
    var TYPE = { midterm: "mid", mid: "mid", final: "final", makeup: "makeup", but: "makeup", resit: "makeup", quiz: "quiz" };
    var exams = ((d.exams && d.exams.rows) || []).filter(function (x) { return x.date; }).map(function (x) {
      return { code: x.code, type: TYPE[x.type] || x.type || "mid", date: x.date, start: x.start || "", end: x.end || "", room: x.room || "" };
    });
    var acad = ((d.acadcal && d.acadcal.rows) || []).filter(function (r) { return r.start; }).map(function (r) { return { tr: r.name, en: r.name, start: r.start, end: r.end || r.start }; });
    var today = new Date(), iso = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());

    var out = {
      imported: { at: d.importedAt || Date.now(), program: cur.program || (tt && tt.program) || "", curriculum: cur.curriculumName || "", isME: isME,
        counts: { courses: courses.length, completed: completed.length, sections: Object.keys(seen).length, registered: regSecs.length,
          attendance: Object.keys(att).length, grades: Object.keys(grades).length, exams: exams.length, acad: acad.length } },
      meta: { university: base.meta.university, faculty: "", department: titleTr(cur.program || (tt && tt.program) || base.meta.department), term: { tr: term, en: termEn }, group: [] },
      rules: rules,
      scenarios: { balanced: { codes: regSecs.map(function (id) { return id.split("#")[0]; }) }, problem: base.scenarios.problem, mine: { sections: regSecs } },
      current: { today: iso, weeks: 14, absence: base.current.absence, attendance: att, grades: grades, exams: exams, acadcal: acad, sections: regSecs },
      courses: courses,
      student: student,
      requirements: { totalEcts: base.requirements.totalEcts, required: required, requiredExtra: {}, electives: electives, electiveSlots: slots,
        project: required.filter(function (c) { return /49[12]0|4830|STAJ|INTERN/i.test(c + " " + (byCode[c] ? byCode[c].nameTr : "")); }) }
    };
    if (!out.scenarios.problem || !out.scenarios.problem.sections.every(function (id) { var p = id.split("#"); return byCode[p[0]] && byCode[p[0]].sections.some(function (s) { return String(s.no) === p[1]; }); })) delete out.scenarios.problem;
    return out;
  }

  /* --- kaydedilmiş OBS .html sayfalarından ka.data üret (eklentiyle aynı ayrıştırıcılar) --- */
  function fromHtmlFiles(files) {
    var OBS = window.KayitOBS, S = window.KAStore;
    return Promise.all(Array.prototype.map.call(files, function (f) {
      return f.text().then(function (t) { return { name: f.name, text: t }; });
    })).then(function (list) {
      var data = null, log = [];
      list.forEach(function (x) {
        if (/\.json$/i.test(x.name) || /^\s*\{/.test(x.text)) {
          try { var j = JSON.parse(x.text); var dd = j && j.v === 1 ? j : (j && j.data && j.data.v === 1 ? j.data : null);
            if (dd) { data = mergeAll(data, dd); log.push({ file: x.name, kind: "json" }); return; } } catch (e) { /* devam */ }
          log.push({ file: x.name, kind: null }); return;
        }
        var doc = new DOMParser().parseFromString(x.text, "text/html"), kind = OBS.detect(doc), payload = null;
        if (kind) { try { payload = OBS.parse(doc, kind); } catch (e) { payload = null; } }
        if (!payload) { log.push({ file: x.name, kind: null }); return; }
        data = S.merge(data, kind, payload).data;
        log.push({ file: x.name, kind: kind });
      });
      return { data: data, log: log };
    });
  }
  function mergeAll(a, b) {
    if (!a) return b;
    Object.keys(b).forEach(function (k) {
      if (k === "timetable") { a.timetable = a.timetable || {}; Object.keys(b.timetable || {}).forEach(function (t) { a.timetable[t] = b.timetable[t]; }); }
      else if (b[k] !== null && b[k] !== undefined) a[k] = b[k];
    });
    return a;
  }
  function valid(d) { return !!(d && d.v === 1 && (d.curriculum || d.registration || d.lastTimetable)); }
  function save(d) { d.importedAt = Date.now(); ls(false, IMP_KEY, JSON.stringify(d)); }
  function clear() { ls(false, IMP_KEY, null); ls(false, MAN_KEY, null); }
  function raw() { try { var d = JSON.parse(ls(true, IMP_KEY) || "null"); return valid(d) ? d : null; } catch (e) { return null; } }
  function toggleManual(code) {
    var a = manualList(), i = a.indexOf(code);
    if (i >= 0) a.splice(i, 1); else a.push(code);
    ls(false, MAN_KEY, JSON.stringify(a));
    return i < 0;
  }

  var active = false, error = null, r = raw();
  if (r) {
    try { window.KAYIT_DATA = convert(r, BASE); active = true; }
    catch (e) { error = String(e && e.message || e); window.KAYIT_DATA = BASE; }
  }
  window.YOBSImport = { IMP_KEY: IMP_KEY, MAN_KEY: MAN_KEY, convert: convert, fromHtmlFiles: fromHtmlFiles, valid: valid, save: save, clear: clear,
    raw: raw, active: active, error: error, base: BASE, manual: manualList, toggleManual: toggleManual };
})();
