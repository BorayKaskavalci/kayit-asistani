/* Kayıt Asistanı - "Mezuniyet Yol Haritası" görünümü (ortak; web uygulaması + eklenti paneli).
   Yalnızca HTML üretir; olayları barındıran sayfa işler:
     data-act="rm-fail" data-code="..."   -> "ya kalırsam?" aç/kapa (bu dönemin dersleri)
     select[data-rm="grade"]              -> beklenen not (sayı)
     select[data-rm="mode"]               -> bu dönem: önerilen / sepet-kayıt
   Stiller: roadmap.css (CSS değişkenleri: --surface, --border, --ok, --warn, --bad, --info, --accent ...) */
(function (root) {
  "use strict";
  var K = root.KayitCore;
  var GRADES = [["A", 4], ["B+", 3.3], ["B", 3], ["C+", 2.3], ["C", 2], ["C-", 1.7], ["D+", 1.3], ["D", 1]];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  /* B: KayitCore.roadmapBundle sonucu
     ctx: {t(key,vars), lang, num2(n), name(code), M, expected, mode, modes:[{v,label}]|null, failNow{} } */
  function render(B, ctx) {
    var t = ctx.t, L = function (lbl) { return lbl ? (ctx.lang === "en" ? lbl.en : lbl.tr) : ""; };
    var res = B.res, clean = B.clean, M = ctx.M, crit = {}, html = "";
    B.crit.forEach(function (c) { crit[c.code] = c.delta; });
    function stName(key) { return t("rm.st." + key); }

    /* --- başlık: en erken mezuniyet --- */
    html += '<div class="rm-hero">';
    if (res.gradIndex === null) {
      html += '<div class="rm-big bad">' + esc(t("rm.noGrad")) + '</div><p class="rm-sub">' + esc(t("rm.unplaced", { l: res.unplaced.join(", ") })) + '</p>';
    } else {
      html += '<div class="rm-kicker">' + esc(t("rm.earliest")) + '</div><div class="rm-big">' + esc(L(res.gradLabel)) +
        ' <span class="rm-terms">' + esc(t("rm.nTerms", { n: res.termsLeft })) + '</span></div>';
      if (B.anyFail && clean.gradIndex !== null) {
        var d = res.gradIndex - clean.gradIndex;
        html += '<p class="rm-delta ' + (d > 0 ? "bad" : "ok") + '">' + esc(d > 0 ? t("rm.failDelta", { n: d, g: L(clean.gradLabel) }) : t("rm.failNoDelta")) + '</p>';
      }
      if (!res.gpaOk) html += '<p class="rm-delta bad">' + esc(t("rm.gpaLow", { g: ctx.num2(res.gpaEnd) })) + '</p>';
    }
    html += '</div>';

    /* --- kontroller --- */
    html += '<div class="rm-controls"><label>' + esc(t("rm.expected")) + ' <select data-rm="grade">' + GRADES.map(function (g) {
      return '<option value="' + g[1] + '"' + (Math.abs(g[1] - ctx.expected) < 1e-6 ? " selected" : "") + '>' + g[0] + ' (' + ctx.num2(g[1]) + ')</option>';
    }).join("") + '</select></label>';
    if (ctx.modes && ctx.modes.length > 1) {
      html += '<label>' + esc(t("rm.mode")) + ' <select data-rm="mode">' + ctx.modes.map(function (m) {
        return '<option value="' + esc(m.v) + '"' + (m.v === ctx.mode ? " selected" : "") + '>' + esc(m.label) + '</option>';
      }).join("") + '</select></label>';
    }
    html += '</div>';

    /* --- GNO projeksiyonu ve hedef --- */
    if (B.proj !== null && res.terms.length) {
      var g0 = M.gpa(), st0 = M.standing();
      html += '<div class="rm-proj"><p>' + esc(t("rm.proj", { a: ctx.num2(g0), b: ctx.num2(K.trunc2(B.proj)), s: stName(B.projStanding.key), l: B.projStanding.max })) + '</p>';
      var tg = B.target;
      if (tg) {
        if (tg.already) html += '<p class="muted">' + esc(t("rm.targetAlready")) + '</p>';
        else if (!tg.feasible) html += '<p class="rm-warn">' + esc(t("rm.targetNo", { n: ctx.num2(tg.need) })) + '</p>';
        else {
          var eff = "";
          if (B.targetRes && B.targetRes.gradIndex !== null && clean.gradIndex !== null) {
            var dd = clean.gradIndex - B.targetRes.gradIndex;
            eff = dd > 0 ? t("rm.targetEffect", { g: L(B.targetRes.gradLabel), n: dd }) : t("rm.targetNoEffect");
          }
          html += '<p class="rm-target">' + esc(t("rm.target", { n: ctx.num2(Math.max(tg.need, 0)), l: tg.letter || "-", a: st0.max, b: M.rules.statuses[0].max })) + (eff ? " " + esc(eff) : "") + '</p>';
        }
        html += '<p class="muted rm-note">' + esc(t("rm.weightNote", { w: typeof M.cfg.gradedEcts === "number" ? M.cfg.gradedEcts : tg.weight - tg.ects })) + '</p>';
      }
      html += '</div>';
    }

    /* --- zaman çizelgesi --- */
    html += '<div class="rm-legend"><span><i class="k-retake"></i>' + esc(t("rm.k.retake")) + '</span><span><i class="k-compulsory"></i>' + esc(t("rm.k.compulsory")) +
      '</span><span><i class="k-elective"></i>' + esc(t("rm.k.elective")) + '</span><span><i class="k-project"></i>' + esc(t("rm.k.project")) +
      '</span><span><i class="k-crit"></i>' + esc(t("rm.k.crit")) + '</span></div>';
    html += '<div class="rm-timeline" role="list">';
    res.terms.forEach(function (term) {
      var over = term.ects > term.limit;
      html += '<div class="rm-term' + (term.index === 0 ? " now" : "") + (term.index === res.gradIndex ? " grad" : "") + '" role="listitem">' +
        '<div class="rm-term-h"><strong>' + esc(L(term.label)) + '</strong>' + (term.index === 0 ? ' <span class="rm-tag">' + esc(t("rm.now")) + '</span>' : "") +
        (term.index === res.gradIndex ? ' <span class="rm-tag grad">' + esc(t("rm.gradTag")) + '</span>' : "") + '</div>' +
        '<div class="rm-term-m ' + (over ? "bad" : "") + '">' + term.ects + ' / ' + term.limit + ' ' + esc(t("rm.ects")) + ' · ' + esc(stName(term.standing)) + '</div><div class="rm-chips">';
      term.courses.forEach(function (c) {
        var cls = "rm-chip k-" + c.kind + (crit[c.code] ? " crit" : "") + (c.fail ? " fail" : "");
        var title = c.code + " " + (ctx.name(c.code) || "") + " · " + c.ects + " " + t("rm.ects") + (crit[c.code] ? " · " + t("rm.critTip", { n: crit[c.code] }) : "");
        var inner = '<b>' + esc(c.code) + '</b><small>' + c.ects + '</small>';
        if (term.index === 0) {
          var fd = B.failDelta[c.code];
          var lab = c.fail ? t("rm.failOn") : t("rm.failOff");
          if (fd !== undefined && fd !== null) inner += '<em class="' + (fd > 0 ? "bad" : "") + '">' + esc(fd > 0 ? "+" + fd : "±0") + '</em>';
          html += '<button type="button" class="' + cls + '" data-act="rm-fail" data-code="' + esc(c.code) + '" aria-pressed="' + (c.fail ? "true" : "false") + '" title="' + esc(title + " — " + lab) + '">' + inner + '</button>';
        } else html += '<span class="' + cls + '" title="' + esc(title) + '">' + inner + '</span>';
      });
      html += '</div>';
      term.notes.forEach(function (n) { html += '<p class="rm-tnote">' + esc(t("rm.note." + n.type, { c: n.code })) + '</p>'; });
      html += '</div>';
    });
    html += '</div>';
    if (res.terms.length && res.terms[0].index === 0) html += '<p class="muted rm-note">' + esc(t("rm.failHint")) + '</p>';

    /* --- kritik yol --- */
    html += '<div class="rm-crit"><h4>' + esc(t("rm.critT")) + '</h4>';
    if (!B.crit.length) html += '<p class="muted">' + esc(t("rm.critNone")) + '</p>';
    else html += '<ul>' + B.crit.slice(0, 8).map(function (c) {
      return '<li><b>' + esc(c.code) + '</b> ' + esc(ctx.name(c.code) || "") + ' — ' + esc(t(c.term === 0 ? "rm.critNow" : "rm.critNext", { n: c.delta })) + '</li>';
    }).join("") + '</ul>';
    html += '</div>';

    /* --- doğrulama + varsayımlar --- */
    var v = B.validation;
    html += '<p class="rm-valid ' + (v.length ? "bad" : "ok") + '">' + esc(v.length ? t("rm.invalid", { n: v.length }) : t("rm.valid")) + '</p>';
    if (v.length) html += '<ul class="rm-errs">' + v.slice(0, 6).map(function (e) {
      var p = e.prereq || e.missing || (typeof e.earned === "number" ? "(" + e.earned + " " + t("rm.ects") + ")" : "");
      return '<li>' + esc(t("rm.err." + e.type, { c: e.code || "", p: p, t: res.terms[e.term] ? L(res.terms[e.term].label) : "" })) + '</li>';
    }).join("") + '</ul>';
    html += '<details class="rm-assume"><summary>' + esc(t("rm.assumeT")) + '</summary><ul>' +
      ["rm.a1", "rm.a2", "rm.a3", "rm.a4", "rm.a5", "rm.a6"].map(function (k) { return "<li>" + esc(t(k)) + "</li>"; }).join("") + '</ul></details>';
    return '<div class="rm">' + html + '</div>';
  }

  root.KayitRoadmapView = { render: render, GRADES: GRADES };
})(typeof self !== "undefined" ? self : this);
