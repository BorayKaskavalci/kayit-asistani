/* Kayıt Asistanı - iCalendar (.ics, RFC 5545) üretici. Saf mantık; ağ yok.
   - Satır sonu CRLF, 75 oktetten uzun satırlar katlanır (devam satırı tek boşlukla başlar; UTF-8 karakter bölünmez).
   - Saatler Europe/Istanbul (TZID + VTIMEZONE; 2016'dan beri sabit UTC+3, yaz saati yok).
   - Haftalık dersler: RRULE:FREQ=WEEKLY;UNTIL=<UTC>, sınavlar: VALARM (1 gün + 1 saat önce), son tarihler: tüm gün.
   Global ad: KayitICS. */
(function (root) {
  "use strict";
  var TZ = "Europe/Istanbul", OFFSET_MIN = 180;
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = "0" + n; return n; }
  function esc(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function utf8len(ch) { var c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  /* RFC 5545 3.1: 75 oktet (CRLF hariç); devam satırının baştaki boşluğu da sayılır */
  function fold(line) {
    var out = [], cur = "", len = 0, limit = 75;
    Array.from(line).forEach(function (ch) {
      var l = utf8len(ch);
      if (len + l > limit) { out.push(cur); cur = " "; len = 1; }
      cur += ch; len += l;
    });
    out.push(cur);
    return out.join("\r\n");
  }
  /* "2026-09-21" -> {y,m,d}; tarih aritmetiği UTC üzerinde (yerel saat dilimi kaymasın) */
  function ymd(s) { var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  function addDays(p, n) { var t = new Date(Date.UTC(p.y, p.m - 1, p.d + n)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
  function dow(p) { return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }   /* 0=Pazar */
  function dstr(p) { return pad(p.y, 4) + pad(p.m) + pad(p.d); }
  function cmp(a, b) { return dstr(a) < dstr(b) ? -1 : dstr(a) > dstr(b) ? 1 : 0; }
  function local(p, min) { return dstr(p) + "T" + pad(Math.floor(min / 60)) + pad(min % 60) + "00"; }
  /* yerel (İstanbul) tarih+dakika -> UTC damgası */
  function utc(p, min) {
    var t = new Date(Date.UTC(p.y, p.m - 1, p.d, 0, min - OFFSET_MIN, 0));
    return pad(t.getUTCFullYear(), 4) + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate()) + "T" + pad(t.getUTCHours()) + pad(t.getUTCMinutes()) + pad(t.getUTCSeconds()) + "Z";
  }
  function stamp(now) {
    var t = now || new Date();
    return pad(t.getUTCFullYear(), 4) + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate()) + "T" + pad(t.getUTCHours()) + pad(t.getUTCMinutes()) + pad(t.getUTCSeconds()) + "Z";
  }
  function uid(s) {
    var h = 5381; s = String(s);
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36) + "-" + s.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40) + "@kayit-asistani";
  }
  var DAY_IDX = { "Pzt": 1, "Sal": 2, "Çar": 3, "Per": 4, "Cum": 5, "Cmt": 6, "Paz": 0 };

  /* opt = {name, classes:[{code,no,name,room,instructor,day,start,end}], exams:[{code,name,date,start,end,type,room}],
            deadlines:[{name,start,end}] (yyyy-mm-dd[ HH:MM]), range:{start,end} (yyyy-mm-dd), alarms:true, now:Date,
            labels:{exam(type), examDesc, deadline, classDesc}} */
  function build(opt) {
    var L = [], dt = stamp(opt.now), lab = opt.labels || {};
    function push(s) { L.push(fold(s)); }
    push("BEGIN:VCALENDAR");
    push("VERSION:2.0");
    push("PRODID:-//Kayit Asistani//OBS Takvim//TR");
    push("CALSCALE:GREGORIAN");
    push("METHOD:PUBLISH");
    push("X-WR-CALNAME:" + esc(opt.name || "Kayıt Asistanı"));
    push("X-WR-TIMEZONE:" + TZ);
    push("BEGIN:VTIMEZONE"); push("TZID:" + TZ); push("BEGIN:STANDARD"); push("DTSTART:19700101T000000");
    push("TZOFFSETFROM:+0300"); push("TZOFFSETTO:+0300"); push("TZNAME:+03"); push("END:STANDARD"); push("END:VTIMEZONE");
    var rs = ymd(opt.range && opt.range.start), re = ymd(opt.range && opt.range.end);
    var count = { classes: 0, exams: 0, deadlines: 0 };
    if (rs && re && cmp(rs, re) <= 0) (opt.classes || []).forEach(function (c) {
      var want = DAY_IDX[c.day];
      if (want === undefined) return;
      var first = addDays(rs, (want - dow(rs) + 7) % 7);
      if (cmp(first, re) > 0) return;
      push("BEGIN:VEVENT");
      push("UID:" + uid("class|" + c.code + "|" + c.no + "|" + c.day + "|" + c.start + "|" + dstr(rs)));
      push("DTSTAMP:" + dt);
      push("DTSTART;TZID=" + TZ + ":" + local(first, c.start));
      push("DTEND;TZID=" + TZ + ":" + local(first, c.end));
      push("RRULE:FREQ=WEEKLY;UNTIL=" + utc(re, 23 * 60 + 59) .replace(/00Z$/, "59Z"));
      push("SUMMARY:" + esc(c.code + (c.no ? "(" + c.no + ")" : "") + (c.name ? " " + c.name : "")));
      if (c.room) push("LOCATION:" + esc(c.room));
      push("DESCRIPTION:" + esc([lab.classDesc || "", c.instructor || ""].filter(Boolean).join("\n")));
      push("CATEGORIES:" + esc(lab.classCat || "Ders"));
      push("END:VEVENT");
      count.classes++;
    });
    (opt.exams || []).forEach(function (e) {
      var d = ymd(e.date);
      if (!d) return;
      var title = (lab.exam ? lab.exam(e.type) + ": " : "") + e.code + (e.name ? " " + e.name : "");
      push("BEGIN:VEVENT");
      push("UID:" + uid("exam|" + e.code + "|" + e.date + "|" + (e.start || "") + "|" + e.type));
      push("DTSTAMP:" + dt);
      var sm = /(\d{2}):(\d{2})/.exec(e.start || "");
      if (sm) {
        var s = +sm[1] * 60 + +sm[2], em = /(\d{2}):(\d{2})/.exec(e.end || ""), en = em ? +em[1] * 60 + +em[2] : s + 120;
        if (en <= s) en = s + 120;
        push("DTSTART;TZID=" + TZ + ":" + local(d, s));
        push("DTEND;TZID=" + TZ + ":" + local(d, Math.min(en, 23 * 60 + 59)));
      } else {
        push("DTSTART;VALUE=DATE:" + dstr(d));
        push("DTEND;VALUE=DATE:" + dstr(addDays(d, 1)));
      }
      push("SUMMARY:" + esc(title));
      if (e.room) push("LOCATION:" + esc(e.room));
      if (e.text) push("DESCRIPTION:" + esc(e.text));
      push("CATEGORIES:" + esc(lab.examCat || "Sınav"));
      if (opt.alarms !== false) {
        [["-P1D", lab.alarmDay || "Yarın sınav"], ["-PT1H", lab.alarmHour || "1 saat sonra sınav"]].forEach(function (a) {
          push("BEGIN:VALARM"); push("ACTION:DISPLAY"); push("TRIGGER:" + a[0]); push("DESCRIPTION:" + esc(a[1] + ": " + title)); push("END:VALARM");
        });
      }
      push("END:VEVENT");
      count.exams++;
    });
    (opt.deadlines || []).forEach(function (x) {
      var a = ymd(x.start), b = ymd(x.end) || a;
      if (!a) return;
      if (cmp(b, a) < 0) b = a;
      push("BEGIN:VEVENT");
      push("UID:" + uid("deadline|" + x.name + "|" + x.start));
      push("DTSTAMP:" + dt);
      push("DTSTART;VALUE=DATE:" + dstr(a));
      push("DTEND;VALUE=DATE:" + dstr(addDays(b, 1)));
      push("SUMMARY:" + esc(x.name));
      push("TRANSP:TRANSPARENT");
      push("CATEGORIES:" + esc(lab.deadlineCat || "Akademik takvim"));
      push("END:VEVENT");
      count.deadlines++;
    });
    push("END:VCALENDAR");
    return { text: L.join("\r\n") + "\r\n", count: count };
  }

  root.KayitICS = { build: build, fold: fold, esc: esc, utc: utc, ymd: ymd, addDays: addDays };
})(typeof self !== "undefined" ? self : this);
