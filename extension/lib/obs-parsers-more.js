/* Kayıt Asistanı - ek OBS sayfa ayrıştırıcıları (KayitOBS'yi genişletir).
   SALT-OKUNUR; öğrenci adı/numarası OKUNMAZ. Yapı notları: research/obs/OBS-YAPI.md bölüm 6-12.
   Yeni sayfa türleri:
     attendance  - Devamsızlık Durumu      (ders_yoklama_durum.aspx)
     grades      - Not Listesi             (not_listesi_op.aspx)
     exams       - Sınav Takvimi           (sinav_takvimi.aspx)
     mytimetable - Ders Programı (kişisel) (std_time_table.aspx)
     acadcal     - Akademik Takvim         (st_akademik_takvim.aspx)
   Ayrıca üst çerçevedeki oturum sayacı: sessionLeft(doc) -> saniye | null. */
(function (root) {
  "use strict";
  var K = root.KayitCore, OBS = root.KayitOBS;
  if (!K || !OBS) return;
  var txt = OBS.txt;
  var CODE_RE = /([A-ZÇĞİÖŞÜ]{2,6})\s?(\d{3,4}[A-Z]?)/;
  var DATE_RE = /(\d{1,2})[./](\d{1,2})[./](\d{4})/;
  function selText(doc, id) {
    var el = doc.getElementById(id);
    if (!el) return "";
    if (el.tagName === "SELECT") { var o = el.options[el.selectedIndex]; return o ? txt(o) : ""; }
    return txt(el);
  }
  function termOf(doc) {
    return selText(doc, "cmbDonemler") || ((/(\d{4}\s*-\s*\d{4}\s*(?:G[üu]z|Bahar|Yaz))/i.exec(txt(doc.body)) || [])[1] || "");
  }
  function pad(n) { return ("0" + n).slice(-2); }
  /* "21.09.2026 08:30" -> "2026-09-21 08:30" (saat yoksa yalnızca tarih) */
  function isoLocal(s) {
    var d = DATE_RE.exec(String(s || ""));
    if (!d) return "";
    var out = d[3] + "-" + pad(+d[2]) + "-" + pad(+d[1]);
    var tm = /(\d{1,2})[:.](\d{2})/.exec(String(s).slice(d.index + d[0].length));
    return tm ? out + " " + pad(+tm[1]) + ":" + tm[2] : out;
  }
  function kids(el) { return Array.prototype.filter.call(el.children, function (k) { return k.tagName !== "SCRIPT"; }); }

  /* ---------------- 6) Devamsızlık ---------------- */
  /* bilgi ikonunun title'ı: "Toplam 14 Hafta (70 Saat). Teorik Toplamı 42 Saat, Devamsızlık Oranı (%30)/12 Saat. Uygulama Toplamı 28 Saat, Devamsızlık Oranı (%20)/5 Saat." */
  function parseLimit(s) {
    s = String(s || "").replace(/\s+/g, " ");
    var out = {}, m;
    if ((m = /Toplam\s*(\d+)\s*Hafta\s*\(\s*(\d+)\s*Saat\s*\)/i.exec(s))) { out.weeks = +m[1]; out.totalHours = +m[2]; }
    function part(label) {
      var re = new RegExp(label + "\\s*Toplam[ıi]?\\s*(\\d+)\\s*Saat\\s*,?\\s*Devams[ıi]zl[ıi]k\\s*Oran[ıi]\\s*\\(\\s*%\\s*(\\d+)\\s*\\)\\s*\\/\\s*(\\d+(?:[.,]\\d+)?)\\s*Saat", "i");
      var x = re.exec(s);
      return x ? { hours: +x[1], pct: +x[2], max: K.parseNum(x[3]) } : null;
    }
    out.theory = part("Teorik");
    out.practice = part("Uygulama");
    return out.weeks || out.theory || out.practice ? out : null;
  }
  function parseAttendance(doc) {
    var rows = [];
    Array.prototype.forEach.call(doc.querySelectorAll(".rpt-row"), function (row) {
      var c = kids(row), t = c.map(txt);
      var code = null;
      for (var i = 0; i < Math.min(3, t.length); i++) { var m = CODE_RE.exec(t[i]); if (m && t[i].length <= 12) { code = K.normCode(m[1] + " " + m[2]); break; } }
      if (!code) return;
      var span = row.querySelector("span.text-right"), info = row.querySelector("[id*='imgInfo'][title], a[title], [title*='Hafta']");
      var raw = span ? txt(span) : "";
      var status = "ok", used = null;
      if (/yap[ıi]lmam[ıi][sş]|girilmemi/i.test(raw)) status = "noEntry";
      else if (/zor\.?\s*yok|zorunlu\s*de[gğ]il|devam\s*zor/i.test(raw)) status = "notRequired";
      else { used = K.parseNum(raw); if (used === null) status = "noEntry"; }
      var tu = "";
      t.forEach(function (x) { if (!tu && /^\d+\s*\+\s*\d+$/.test(x)) tu = x.replace(/\s+/g, ""); });
      rows.push({ code: code, name: t[1] && !CODE_RE.test(t[1]) ? t[1] : "", tu: tu, used: used, status: status, raw: raw,
        limit: info ? parseLimit(info.getAttribute("title")) : null });
    });
    return { term: termOf(doc), rows: rows };
  }

  /* ---------------- 7) Not Listesi ---------------- */
  function examTable(scope) {
    var tables = scope.querySelectorAll("table.ex-gt, table");
    for (var i = 0; i < tables.length; i++) {
      var h = txt(tables[i].querySelector("tr"));
      if (/S[ıi]nav\s*Ad[ıi]/i.test(h) && /Not/i.test(h)) return tables[i];
    }
    return null;
  }
  function parseGrades(doc) {
    var labels = Array.prototype.slice.call(doc.querySelectorAll("[id^='rptNotListesi_lblDersKod_']"));
    var rows = [];
    labels.forEach(function (lbl) {
      var idx = lbl.id.replace(/^.*_(\d+)$/, "$1");
      var head = txt(lbl), cs = K.parseCodeSec(head), m = CODE_RE.exec(head);
      if (!cs && !m) return;
      var code = cs ? cs.code : K.normCode(m[1] + " " + m[2]);
      var nm = /\)?\s*-\s*(.+)$/.exec(head);
      /* kartın kapsamı: bu etiketi içeren ve başka bir dersin etiketini içermeyen en geniş ata */
      var scope = lbl, up = lbl.parentElement;
      while (up && up !== doc.body) {
        var others = up.querySelectorAll("[id^='rptNotListesi_lblDersKod_']");
        if (others.length > 1) break;
        scope = up; up = up.parentElement;
      }
      var exams = [], table = examTable(scope);
      if (table) {
        var hdr = Array.prototype.map.call(table.querySelector("tr").children, function (c) { return K.upperTr(txt(c)); });
        var iName = 0, iNot = 1, iDate = 2, iAvg = 3;
        hdr.forEach(function (h, i) {
          if (/SINAV/.test(h)) iName = i; else if (/^NOT$/.test(h)) iNot = i; else if (/TAR/.test(h)) iDate = i; else if (/ORT/.test(h)) iAvg = i;
        });
        Array.prototype.forEach.call(table.querySelectorAll("tr"), function (tr, ri) {
          if (ri === 0) return;
          var tds = tr.querySelectorAll("td");
          if (tds.length < 2) return;
          var name = txt(tds[iName]);
          if (!name || /not\s*(yok|girilme)/i.test(name)) return;
          exams.push({ name: name, score: K.parseNum(txt(tds[iNot])), date: isoLocal(txt(tds[iDate])), classAvg: tds[iAvg] ? K.parseNum(txt(tds[iAvg])) : null });
        });
      }
      rows.push({ idx: idx, code: code, no: cs ? cs.no : null, name: nm ? nm[1].trim() : "",
        avg: K.parseNum(selText(doc, "rptNotListesi_lblCardOrt_" + idx)), letter: selText(doc, "rptNotListesi_lblCardNot_" + idx).replace(/^Not\s*:?\s*/i, ""),
        status: selText(doc, "rptNotListesi_lblCardDurum_" + idx).replace(/^Durumu?\s*:?\s*/i, ""), exams: exams });
    });
    return { term: termOf(doc), rows: rows };
  }

  /* ---------------- 9) Sınav Takvimi (dolu hali görülemedi: genel ayrıştırıcı) ---------------- */
  var EXAM_TYPES = [[/b[üu]t[üu]nleme|make-?up|resit/i, "resit"], [/mazeret/i, "excuse"], [/final|y[ıa]r[ıi]y[ıi]l\s*sonu|d[öo]nem\s*sonu/i, "final"],
    [/ara\s*s[ıi]nav|vize|mid-?term|midterm/i, "midterm"], [/quiz|k[üu][çc][üu]k\s*s[ıi]nav/i, "quiz"]];
  /* satır metni: hücreler arasına ayraç koy (div hücrelerin textContent'i bitişik gelir: "MATH 2263DİFERANSİYEL…") */
  function rowText(el) {
    var k = kids(el);
    return k.length > 1 ? k.map(function (c) { return rowText(c); }).join(" | ") : txt(el);
  }
  function parseExams(doc) {
    var scope = doc.querySelector("[id^='rptSinavlar']:not([id$='divEmptyMessage'])");
    scope = scope && scope.parentElement ? scope.parentElement : doc.body;
    var cands = Array.prototype.slice.call(scope.querySelectorAll("tr, .rpt-row, .row, li, [id^='rptSinavlar_']"));
    var rows = [], seen = {};
    cands.forEach(function (el) {
      var s = rowText(el);
      var codes = s.match(/(?<![A-Za-zÇĞİÖŞÜ])[A-ZÇĞİÖŞÜ]{2,6}\s?\d{3,4}[A-Z]?\b/g) || [];
      var uniq = codes.map(K.normCode).filter(function (c, i, a) { return a.indexOf(c) === i; });
      if (uniq.length !== 1 || !DATE_RE.test(s)) return;
      /* aynı satırı hem dış hem iç öğede saymamak için: içinde başka aday varsa atla */
      var inner = Array.prototype.some.call(el.querySelectorAll("tr, .rpt-row, .row, li"), function (x) {
        var xs = rowText(x); return DATE_RE.test(xs) && /[A-ZÇĞİÖŞÜ]{2,6}\s?\d{3,4}/.test(xs);
      });
      if (inner) return;
      /* saatler: tarihler çıkarıldıktan sonra "HH:MM" (04.11.2026 saat sanılmasın) */
      var date = isoLocal(s), times = s.replace(/\d{1,2}[./]\d{1,2}[./]\d{4}/g, " ").match(/\b(\d{1,2}:\d{2})\b/g) || [];
      var start = times[0] ? pad(+times[0].split(/[:.]/)[0]) + ":" + times[0].split(/[:.]/)[1] : "";
      var end = times[1] ? pad(+times[1].split(/[:.]/)[0]) + ":" + times[1].split(/[:.]/)[1] : "";
      var cells = el.children.length > 1 ? kids(el).map(txt) : [];
      /* sınav türü: önce kısa hücrelerde (ders adı "Final Project" gibi yanıltmasın), sonra tüm metinde */
      function typeOf(str) { for (var i = 0; i < EXAM_TYPES.length; i++) if (EXAM_TYPES[i][0].test(str)) return EXAM_TYPES[i][1]; return null; }
      var type = null;
      cells.forEach(function (c) { if (!type && c.length <= 30) type = typeOf(c); });
      type = type || typeOf(s) || "exam";
      var room = "";
      cells.forEach(function (c) { if (!room && /^[A-ZÇĞİÖŞÜ]{1,3}[-\s]?\d{2,4}[A-Z]?(\s*[,/]\s*[A-ZÇĞİÖŞÜ]{1,3}[-\s]?\d{2,4})*$/.test(c) && !/^[A-ZÇĞİÖŞÜ]{2,6}\s\d{3,4}$/.test(c)) room = c; });
      var cs = K.parseCodeSec(s);
      var key = uniq[0] + "|" + date.slice(0, 10) + "|" + start + "|" + type;
      if (seen[key]) return;
      seen[key] = true;
      rows.push({ code: uniq[0], no: cs ? cs.no : null, date: date.slice(0, 10), start: start, end: end, type: type, room: room, text: s.slice(0, 160) });
    });
    rows.sort(function (a, b) { return (a.date + a.start) < (b.date + b.start) ? -1 : 1; });
    return { term: termOf(doc), rows: rows, empty: !rows.length };
  }

  /* ---------------- 10) Kişisel Ders Programı ---------------- */
  function parseMyTimetable(doc) {
    var table = null;
    Array.prototype.some.call(doc.querySelectorAll("table.myGridClass, table"), function (tb) {
      if (tb.querySelector("td.pivot-cell, .course-code")) { table = tb; return true; }
      return false;
    });
    var rows = [];
    if (table) {
      var trs = table.querySelectorAll("tr"), days = [];
      Array.prototype.forEach.call(trs[0].children, function (c, i) { days[i] = K.dayShort(txt(c)); });
      Array.prototype.forEach.call(trs, function (tr, ri) {
        if (ri === 0) return;
        var cells = kids(tr), hour = K.parseHourRange(txt(cells[0]));
        if (!hour) return;
        cells.forEach(function (td, ci) {
          if (ci === 0 || !days[ci]) return;
          var infos = td.querySelectorAll(".course-info");
          var list = infos.length ? Array.prototype.slice.call(infos) : (td.querySelector(".course-code") ? [td] : []);
          list.forEach(function (info) {
            var cs = K.parseCodeSec(txt(info.querySelector(".course-code")));
            if (!cs) return;
            var roomTxt = txt(info.querySelector(".course-room")), rm = /^(.*?)\s*\[(\d+)\]\s*$/.exec(roomTxt);
            rows.push({ day: days[ci], start: hour.start, end: hour.end, code: cs.code, no: cs.no, name: txt(info.querySelector(".course-name")),
              room: rm ? rm[1] : roomTxt, cap: rm ? +rm[2] : 0, instructor: txt(info.querySelector(".course-instructor")).replace(/^g[öo]sterilmiyor$/i, "") });
          });
        });
      });
    }
    var secs = K.buildSections(rows), inst = {};
    rows.forEach(function (r) { if (r.instructor && !inst[r.code + "#" + r.no]) inst[r.code + "#" + r.no] = r.instructor; });
    secs.forEach(function (s) { s.instructor = inst[s.id] || ""; });
    return { term: termOf(doc), sections: secs, hourRows: rows.length };
  }

  /* ---------------- 11) Akademik Takvim ---------------- */
  function parseAcadCal(doc) {
    var table = doc.getElementById("grd"), rows = [];
    if (table) Array.prototype.forEach.call(table.querySelectorAll("tr"), function (tr) {
      var tds = tr.querySelectorAll("td");
      if (tds.length < 3) return;
      var start = isoLocal(txt(tds[1])), end = isoLocal(txt(tds[2]));
      if (!start) return;
      rows.push({ name: txt(tds[0]), start: start, end: end || start });
    });
    return { term: termOf(doc), rows: rows };
  }

  /* ---------------- 12) Oturum sayacı ---------------- */
  function sessionLeft(doc) {
    var el = doc.getElementById("prolizSessionLeft");
    if (!el) return null;
    var m = /(\d{1,3}):(\d{2})/.exec(txt(el));
    return m ? +m[1] * 60 + +m[2] : null;
  }

  /* ---------------- sayfa türü (önce yeni türler: devamsızlık sayfası da .rpt-row kullanır) ---------------- */
  var baseDetect = OBS.detect, baseParse = OBS.parse;
  function detectMore(doc) {
    if (!doc || !doc.querySelector) return null;
    if (doc.querySelector("[id^='rptGenel_imgInfo'], [id^='rptGenel_lblDevamDurum'], #rptGenel_lblDevamDurum")) return "attendance";
    if (doc.querySelector("[id^='rptNotListesi_lblDersKod_']")) return "grades";
    if (doc.querySelector("[id^='rptTimeSlots_trSlot_']") || doc.querySelector("table.myGridClass td.pivot-cell")) return "mytimetable";
    if (doc.getElementById("cmbSinavTipi") || doc.querySelector("[id^='rptSinavlar']")) return "exams";
    if (doc.querySelector("[id^='grd_lblBasTar_']")) return "acadcal";
    return null;
  }
  OBS.detect = function (doc) { return detectMore(doc) || baseDetect(doc); };
  OBS.parse = function (doc, kind) {
    kind = kind || OBS.detect(doc);
    if (kind === "attendance") return parseAttendance(doc);
    if (kind === "grades") return parseGrades(doc);
    if (kind === "exams") return parseExams(doc);
    if (kind === "mytimetable") return parseMyTimetable(doc);
    if (kind === "acadcal") return parseAcadCal(doc);
    return baseParse(doc, kind);
  };
  OBS.parseAttendance = parseAttendance; OBS.parseGrades = parseGrades; OBS.parseExams = parseExams;
  OBS.parseMyTimetable = parseMyTimetable; OBS.parseAcadCal = parseAcadCal; OBS.parseLimit = parseLimit;
  OBS.sessionLeft = sessionLeft; OBS.isoLocal = isoLocal;
})(typeof self !== "undefined" ? self : this);
