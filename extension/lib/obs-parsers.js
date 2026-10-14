/* Kayıt Asistanı - OBS (Proliz OİBS) sayfa ayrıştırıcıları.
   SALT-OKUNUR: yalnızca verilen Document'ı okur; tıklamaz, form göndermez, ağ isteği yapmaz.
   KİŞİSEL VERİ: öğrenci adı / numarası OKUNMAZ; yalnızca ders, not ve sayısal özetler alınır.
   Seçiciler: research/obs/OBS-YAPI.md (gerçek OBS sayfa yapısı). Global ad: KayitOBS. */
(function (root) {
  "use strict";
  var K = root.KayitCore;

  function txt(el) { return el ? String(el.textContent || "").replace(/ /g, " ").replace(/\s+/g, " ").trim() : ""; }
  function selText(doc, id) {
    var el = doc.getElementById(id);
    if (!el) return "";
    if (el.tagName === "SELECT") { var o = el.options[el.selectedIndex]; return o ? txt(o) : ""; }
    return txt(el);
  }
  function foldKey(s) {
    return K.upperTr(String(s || "")).replace(/[İI]/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G").replace(/Ü/g, "U")
      .replace(/Ö/g, "O").replace(/Ç/g, "C").replace(/[^A-Z0-9/+]/g, "");
  }
  /* tablo başlıklarından sütun indeksi: {"SAAT":0, "DERSKODU":1, ...} */
  function headerIndex(table) {
    var map = {}, tr = table.querySelector("tr");
    if (!tr) return map;
    Array.prototype.forEach.call(tr.children, function (c, i) { var k = foldKey(txt(c)); if (k && map[k] === undefined) map[k] = i; });
    return map;
  }
  function cellBy(tds, hdr, keys, label) {
    for (var i = 0; i < tds.length; i++) {
      var dl = tds[i].getAttribute && tds[i].getAttribute("data-label");
      if (dl && label && foldKey(dl) === foldKey(label)) return tds[i];
    }
    for (var k = 0; k < keys.length; k++) if (hdr[keys[k]] !== undefined && tds[hdr[keys[k]]]) return tds[hdr[keys[k]]];
    return null;
  }
  var CODE_RE = /^([A-ZÇĞİÖŞÜ]{2,6})\s?(\d{3,4}[A-Z]?)$/;
  var GRADE_RE = /^(A|A-|B\+|B|B-|C\+|C|C-|D\+|D|F|AA|BA|BB|CB|CC|DC|DD|FD|FF|U|S|P|NA|W|DZ|YZ|M|MU|MUAF|EX|G|YT)$/;

  /* ------------------------------------------------------------------ */
  /* Sayfa türü: DOM'a bakılarak (URL'den bağımsız; demo sayfalarında da çalışır) */
  function detect(doc) {
    if (!doc || !doc.getElementById) return null;
    if (doc.getElementById("grdDersKayit")) return "registration";
    if (doc.getElementById("cmbSinif") || doc.querySelector("table.tt-dep-layout")) {
      for (var d = 0; d < 7; d++) if (doc.getElementById("grd" + d)) return "timetable";
    }
    if (doc.querySelector('[id^="rptDers_dataRowDiv_"]')) return "curriculum";
    if (doc.querySelector(".rpt-panel .rpt-row")) return "offered";
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* 1) Bölüm Ders Programı - std_time_table_dep.aspx: grd0..grd6, satır = 1 ders saati */
  function parseTimetable(doc) {
    var rows = [], raw = 0;
    for (var d = 0; d < 7; d++) {
      var table = doc.getElementById("grd" + d);
      if (!table) continue;
      var hdr = headerIndex(table);
      Array.prototype.forEach.call(table.querySelectorAll("tr"), function (tr) {
        var tds = tr.querySelectorAll("td");
        if (tds.length < 3) return;
        var hour = K.parseHourRange(txt(cellBy(tds, hdr, ["SAAT"], "Saat") || tds[0]));
        var cs = K.parseCodeSec(txt(cellBy(tds, hdr, ["DERSKODU"], "Ders Kodu") || tds[1]));
        if (!hour || !cs) return;
        raw++;
        var roomTxt = txt(cellBy(tds, hdr, ["DERSLIK"], "Derslik") || tds[3]);
        var rm = /^(.*?)\s*\[(\d+)\]\s*$/.exec(roomTxt);
        rows.push({ day: K.DAYS[d], start: hour.start, end: hour.end, code: cs.code, no: cs.no,
          name: txt(cellBy(tds, hdr, ["DERSADI"], "Ders Adı") || tds[2]), room: rm ? rm[1] : roomTxt, cap: rm ? parseInt(rm[2], 10) : 0 });
      });
    }
    var sections = K.buildSections(rows);
    return { term: selText(doc, "cmbDonemler"), program: selText(doc, "cmbProgram"), classYear: selText(doc, "cmbSinif"),
      hourRows: raw, sections: sections, courses: uniq(sections.map(function (s) { return s.code; })).length };
  }
  function uniq(a) { var o = [], seen = {}; a.forEach(function (x) { if (!seen[x]) { seen[x] = 1; o.push(x); } }); return o; }

  /* ------------------------------------------------------------------ */
  /* 2) Müfredat Durum - ogrenci_mufredat_ders.aspx */
  function halfCells(el) {
    if (!el) return [];
    var kids = Array.prototype.filter.call(el.children, function (k) { return k.tagName !== "SCRIPT"; });
    if (kids.length === 1 && kids[0].children.length > 1) return halfCells(kids[0]);
    return kids;
  }
  function semesterFromHeader(s) {
    var m = /(\d)\s*\.\s*S[ıiI]n[ıiI]f\s*[-–]?\s*(G[üu]z|Bahar)/i.exec(s || "");
    return m ? (parseInt(m[1], 10) - 1) * 2 + (/bahar/i.test(m[2]) ? 2 : 1) : null;
  }
  function groupHeaderText(group) {
    var el = group, guard = 0;
    while (el && guard++ < 6) {
      var prev = el.previousElementSibling;
      while (prev) {
        var t = txt(prev);
        if (semesterFromHeader(t)) return t;
        if (prev.classList && prev.classList.contains("mufredat-group-body")) break;
        prev = prev.previousElementSibling;
      }
      el = el.parentElement;
      if (el && el.classList && el.classList.contains("mufredat-group-body")) continue;
    }
    var own = group.firstElementChild ? txt(group.firstElementChild) : "";
    return semesterFromHeader(own) ? own : "";
  }
  function parseCurriculum(doc) {
    var sum = [selText(doc, "lblToplamKrediAKTSBilgileri"), selText(doc, "lblToplamKrediAKTSBilgileriSag"), selText(doc, "lblToplamKrediAKTSDisiBilgileri")].join(" / ");
    function grab(re) { var m = re.exec(sum); return m ? K.parseNum(m[1]) : null; }
    var earnedM = /Ba[sş]ar[ıi]l[ıi]\s*Olunan\s*Kredi\s*:?\s*[\d.,]+\s*AKTS\s*:?\s*([\d.,]+)/i.exec(sum);
    var out = {
      program: selText(doc, "lblFakProgAd"), curriculumName: selText(doc, "lblMufredatAd"),
      gpa: grab(/Genel\s*Not\s*Ort[a-zı.]*\s*:?\s*([\d.,]+)/i),
      takenEcts: grab(/Al[ıi]nan\s*AKTS\s*:?\s*([\d.,]+)/i),
      classYear: grab(/[ÖO][ğg]renci\s*S[ıi]n[ıi]f[ıi]\s*:?\s*(\d+)/i),
      earnedEcts: earnedM ? K.parseNum(earnedM[1]) : null,
      items: []
    };
    var groups = doc.querySelectorAll(".mufredat-group-body");
    var containers = groups.length ? Array.prototype.slice.call(groups) : [doc];
    containers.forEach(function (g, gi) {
      var head = g === doc ? "" : groupHeaderText(g);
      var sem = semesterFromHeader(head) || (g === doc ? null : gi + 1);
      Array.prototype.forEach.call(g.querySelectorAll('[id^="rptDers_dataRowDiv_"]'), function (row) {
        var halves = Array.prototype.filter.call(row.children, function (k) { return k.tagName !== "SCRIPT"; });
        var L = halfCells(halves[0]), R = halfCells(halves[1]);
        var codeEl = row.querySelector('[id^="rptDers_lblDersKod_"]');
        var code = K.normCode(codeEl ? txt(codeEl) : txt(L[0]));
        if (!code) return;
        var lt = L.map(txt), zsI = -1;
        for (var i = 1; i < lt.length; i++) if (/^[ZS]$/.test(lt[i])) { zsI = i; break; }
        var nums = lt.slice(zsI >= 0 ? zsI + 1 : 2).map(K.parseNum).filter(function (n) { return n !== null; });
        var item = { code: code, name: lt[1] || "", zs: zsI >= 0 ? lt[zsI] : "", credits: nums.length > 1 ? nums[0] : null,
          ects: nums.length ? nums[nums.length - 1] : 0, semester: sem, semLabel: head, taken: null, state: "none" };
        /* sağ yarı: alınan ders */
        var rt = R.map(txt), taken = { term: "", code: "", name: "", grade: "" };
        rt.forEach(function (s, idx) {
          if (!taken.term && /^\[?\d{2}-\d{2}[A-ZÇĞİÖŞÜ]?\]?$/.test(s)) { taken.term = s.replace(/[\[\]]/g, ""); return; }
          var nc = K.normCode(s);
          if (!taken.code && CODE_RE.test(nc)) { taken.code = nc; taken.name = rt[idx + 1] || ""; return; }
        });
        var gradeEl = halves[1] ? halves[1].querySelector(".harf, .grade, [id*='lblHarf'], [id*='Harf']") : null;
        var gtxt = gradeEl ? K.upperTr(txt(gradeEl)) : "";
        if (!GRADE_RE.test(gtxt)) {
          gtxt = "";
          for (var j = rt.length - 1; j >= 0; j--) { var u = K.upperTr(rt[j]).replace(/[^A-Z+\-]/g, ""); if (u && GRADE_RE.test(u) && rt[j].length <= 5 && !CODE_RE.test(rt[j])) { gtxt = u; break; } }
        }
        taken.grade = gtxt;
        var ok = halves[1] && halves[1].querySelector(".fa-check-circle, .text-success");
        var warn = halves[1] && halves[1].querySelector(".fa-exclamation-triangle, .text-danger");
        var color = ((row.className || "") + " " + (row.getAttribute("style") || "")).toLowerCase();
        if (taken.code || taken.grade || taken.term) {
          item.taken = taken;
          var cls = K.gradeClass(taken.grade);
          if (cls === "pass") item.state = "passed";
          else if (cls === "exempt") item.state = "exempt";
          else if (cls === "fail") item.state = "failed";
          else if (/muaf|info|mavi|blue/.test(color)) item.state = "exempt";
          else if (ok && !warn) item.state = "passed";
          else item.state = "ongoing";
        }
        out.items.push(item);
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 3) Açılan Bölüm Dersleri - program_dersleri.aspx (div-repeater) */
  function parseOffered(doc) {
    var list = [];
    Array.prototype.forEach.call(doc.querySelectorAll(".rpt-panel .rpt-row"), function (row) {
      var c = halfCells(row), t = c.map(txt);
      var no = parseInt(t[0], 10), code = K.normCode(t[1] || "");
      if (!isFinite(no) || !CODE_RE.test(code)) return;
      var zEl = c[6];
      var req = !!(zEl && (zEl.querySelector("i, .fa-check, .fa-check-circle, input:checked") || /✓|✔/.test(txt(zEl))));
      list.push({ no: no, code: code, name: t[2] || "", classYear: K.parseNum(t[3]), t: K.parseNum(t[4]), ul: t[5] || "", required: req,
        credits: K.parseNum(t[7]), ects: K.parseNum(t[8]) || 0 });
    });
    var term = selText(doc, "cmbDonemler") || ((/(\d{4}\s*-\s*\d{4}\s*(?:G[üu]z|Bahar))/i.exec(txt(doc.body)) || [])[1] || "");
    return { term: term, sections: list, courses: uniq(list.map(function (s) { return s.code; })).length };
  }

  /* ------------------------------------------------------------------ */
  /* 4) Ders Kayıt özeti - ders_kayit_ozet.aspx: table#grdDersKayit + table#Table5 ("AKTS : 32/40") */
  function parseRegistration(doc) {
    var table = doc.getElementById("grdDersKayit"), rows = [];
    if (table) {
      var hdr = headerIndex(table);
      Array.prototype.forEach.call(table.querySelectorAll("tr"), function (tr, ri) {
        var tds = tr.querySelectorAll("td");
        if (tds.length < 7) return;
        function col(keys, fb) { var i; for (var k = 0; k < keys.length; k++) if ((i = hdr[keys[k]]) !== undefined) return txt(tds[i]); return fb !== undefined ? txt(tds[fb]) : ""; }
        var code = K.normCode(col(["DERSKODU"], 1));
        if (!CODE_RE.test(code)) return;
        rows.push({ tr: ri, no: parseInt(col(["SB", "SB."], 0), 10) || 1, code: code, name: col(["DERSADI"], 2), zs: col(["Z/S"], 3), tu: col(["T+U"], 4),
          credits: K.parseNum(col(["KRD"], 5)), ects: K.parseNum(col(["AKTS"], 6)) || 0, classYear: K.parseNum(col(["SNF"], 7)),
          alis: col(["ALIS"], 8), reason: col(["AC.NEDEN", "ACNEDEN"], 9) });
      });
    }
    var t5 = txt(doc.getElementById("Table5")), m = /AKTS\s*:?\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/i.exec(t5);
    var info = {}, bar = doc.getElementById("tblOgrInfoBar");
    if (bar) {
      var cells = Array.prototype.map.call(bar.querySelectorAll("td, th"), txt);
      for (var i = 0; i < cells.length - 1; i++) {
        var key = foldKey(cells[i]);
        if (/^SINIF:?$/.test(key) && info.classYear === undefined) info.classYear = K.parseNum(cells[i + 1]);
        if (/GENELORTALAMA|GNO/.test(key) && info.gpa === undefined) info.gpa = K.parseNum(cells[i + 1]);
        if (/^MUFREDAT/.test(key) && !info.curriculum) info.curriculum = cells[i + 1];
        if (/FAKULTE.*PROGRAM/.test(key) && !info.program) info.program = cells[i + 1];
      }
    }
    var term = ((/(\d{4}\s*-\s*\d{4}\s*(?:G[üu]z|Bahar))/i.exec(txt(doc.body)) || [])[1] || "");
    return { rows: rows, totalEcts: m ? K.parseNum(m[1]) : null, limit: m ? K.parseNum(m[2]) : null,
      credits: K.parseNum((/Kredi\s*:?\s*([\d.,]+)/i.exec(t5) || [])[1]), info: info, term: term };
  }

  function parse(doc, kind) {
    kind = kind || detect(doc);
    if (kind === "timetable") return parseTimetable(doc);
    if (kind === "curriculum") return parseCurriculum(doc);
    if (kind === "offered") return parseOffered(doc);
    if (kind === "registration") return parseRegistration(doc);
    return null;
  }

  root.KayitOBS = { detect: detect, parse: parse, parseTimetable: parseTimetable, parseCurriculum: parseCurriculum,
    parseOffered: parseOffered, parseRegistration: parseRegistration, semesterFromHeader: semesterFromHeader, txt: txt };
})(typeof self !== "undefined" ? self : this);
