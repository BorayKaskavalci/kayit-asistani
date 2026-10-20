/* Kayıt Asistanı - içerik betiği (OBS'nin HER çerçevesinde çalışır; all_frames).
   1) Bu çerçevede tanınan bir OBS sayfası varsa (ders programı, müfredat durumu, açılan dersler, ders kayıt)
      sayfayı SALT-OKUNUR ayrıştırır ve arka plana gönderir ({type:"ka:collect"}).
      OBS'ye istek atmaz, tıklamaz, form değeri değiştirmez (OBS paralel oturuma izin vermez).
   2) Ders kayıt çerçevesinde (table#grdDersKayit) sorunlu satırlara ZARARSIZ işaret ekler:
      satırın sol kenarına renk + son hücreye küçük bir rozet (title ile açıklama) + tablo üstüne özet şerit.
      Eklenen her öğe data-ka özniteliği taşır ve her yeniden çizimde önce kaldırılır.
   3) Üst çerçevede (window.top === window) yan paneli kurar (lib/panel.js) ve arka plan mesajlarını dinler. */
(function () {
  "use strict";
  if (window.__kaContent) return;
  window.__kaContent = true;
  var OBS = window.KayitOBS, X = window.KayitExt, KP = window.KayitPanel, MO = window.KayitMore;
  if (!OBS || !X || !KP || typeof chrome === "undefined" || !chrome.runtime || !chrome.storage) return;

  /* 0) YaşarOBS+ köprüsü: eklentinin kendi sitesinde (demo OBS dışı) panel kurulmaz; yalnızca sayfa İSTERSE
     toplanan OBS verisi aynı sayfaya verilir (window.postMessage, yalnız aynı köken). Ağ isteği yoktur. */
  var isSite = (/^https:\/\/boraykaskavalci\.github\.io\/kayit-asistani\//.test(location.href) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(location.href)) &&
    !/\/demo-obs\//.test(location.pathname) && !/\/extension\//.test(location.pathname);
  if (isSite) {
    if (window.top !== window) return;
    window.addEventListener("message", function (e) {
      if (e.source !== window || !e.data || e.data.type !== "yobs:request") return;
      chrome.storage.local.get("ka.data").then(function (o) {
        window.postMessage({ type: "yobs:data", data: o["ka.data"] || null, version: chrome.runtime.getManifest().version }, location.origin);
      }).catch(function () { window.postMessage({ type: "yobs:data", data: null }, location.origin); });
    });
    window.postMessage({ type: "yobs:hello", version: chrome.runtime.getManifest().version }, location.origin);
    return;
  }

  /* Demo sayfası ?dev=1 ile açıldıysa sayfanın kendi geliştirici yükleyicisi (extension/dev/loader.js) çalışır;
     yüklü gerçek eklenti ikinci bir panel açmasın diye çekilir. */
  var devPage = false;
  try { devPage = /[?&]dev=1(&|$)/.test(location.search) || /[?&]dev=1(&|$)/.test(window.top.location.search); } catch (e) { devPage = false; }
  if (devPage && !window.__kaDevShim) return;

  var isTop = window.top === window;
  var lastSig = "", lastKind = null, lastPayload = null, regPayload = null, moT = null, decoT = null;
  var COLORS = { error: "#c92a2a", warn: "#b35c00", info: "#1864ab" };

  function send(msg) {
    try { return Promise.resolve(chrome.runtime.sendMessage(msg)).catch(function () { return null; }); }
    catch (e) { return Promise.resolve(null); }   /* eklenti yeniden yüklendiyse bağlam geçersiz */
  }

  /* ---------------- 1) toplama ---------------- */
  function collect() {
    var kind = OBS.detect(document);
    if (!kind) return;
    var payload = null;
    try { payload = OBS.parse(document, kind); } catch (e) { return; }
    if (!payload) return;
    var sig = kind + "|" + JSON.stringify(payload);
    if (sig === lastSig) return;
    lastSig = sig;
    lastKind = kind; lastPayload = payload;
    if (kind === "registration") regPayload = payload;
    if (kind === "registration" || kind === "attendance" || kind === "grades") decorate();
    send({ type: "ka:collect", kind: kind, payload: payload });
  }
  function isOurs(n) {
    var el = n && (n.nodeType === 1 ? n : n.parentElement);
    return !!(el && el.closest && el.closest("[data-ka]"));
  }
  /* UpdatePanel / dinamik içerik için: kendi eklediğimiz öğeler dışındaki değişikliklerde yeniden ayrıştır */
  var mo = new MutationObserver(function (recs) {
    var foreign = recs.some(function (r) {
      if (isOurs(r.target)) return false;
      var nodes = Array.prototype.slice.call(r.addedNodes).concat(Array.prototype.slice.call(r.removedNodes));
      return nodes.some(function (n) { return !isOurs(n); });
    });
    if (!foreign) return;
    clearTimeout(moT);
    moT = setTimeout(collect, 700);
  });

  /* ---------------- 2) kayıt tablosu işaretleme ---------------- */
  function decorate() { clearTimeout(decoT); decoT = setTimeout(doDecorate, 120); }
  function doDecorate() {
    if (!lastPayload || ["registration", "attendance", "grades"].indexOf(lastKind) < 0) return;
    chrome.storage.local.get(["ka.data", "ka.ui"]).then(function (o) {
      var stored = o["ka.data"] && o["ka.data"].v === 1 ? o["ka.data"] : X.emptyData(), data = {};
      Object.keys(stored).forEach(function (k) { data[k] = stored[k]; });
      data[lastKind] = lastPayload;             /* bu sayfanın en güncel hali */
      var ui = o["ka.ui"] || {};
      var C = X.build(data, window.KAYIT_DATA || null), t = KP.makeT(ui.lang || "tr");
      if (lastKind === "registration") {
        var table = document.getElementById("grdDersKayit"), R = X.check(C, ui.full || []);
        if (table && R) paint(table, R, C, t);
      } else if (lastKind === "attendance" && MO) paintAttendance(MO.attendance(C, lastPayload), t);
      else if (lastKind === "grades" && MO) paintGrades(MO.grades(C, ui, lastPayload), t);
    }).catch(function () { /* yoksay */ });
  }
  function pillEl(text, col, title) {
    var b = document.createElement("span");
    b.setAttribute("data-ka", "badge");
    b.setAttribute("role", "button");
    b.tabIndex = 0;
    b.textContent = text;
    if (title) b.title = title;
    b.style.cssText = "display:inline-block;margin:2px 0 2px 6px;padding:1px 8px;border-radius:999px;font:600 11px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
      "color:#fff;background:" + col + ";cursor:pointer;white-space:nowrap;vertical-align:middle;letter-spacing:0;text-transform:none;";
    return b;
  }
  function n1(x, t) { return (Math.round(x * 10) / 10).toString().replace(".", t.lang === "tr" ? "," : "."); }
  /* Devamsızlık sayfası: her ders satırının devamsızlık hücresine kalan saat rozeti */
  function paintAttendance(A, t) {
    undecorate();
    if (!A) return;
    var by = {};
    A.rows.forEach(function (r) { by[r.code] = r; });
    Array.prototype.forEach.call(document.querySelectorAll(".rpt-row"), function (row) {
      var codeEl = Array.prototype.filter.call(row.children, function (c) { return /^[A-ZÇĞİÖŞÜ]{2,6}\s?\d{3,4}[A-Z]?$/.test(OBS.txt(c)); })[0];
      var r = codeEl ? by[window.KayitCore.normCode(OBS.txt(codeEl))] : null;
      if (!r || r.level === "free") return;
      var col = { over: COLORS.error, warn: COLORS.warn, ok: "#1a7f4b", info: COLORS.info }[r.level];
      var text = r.level === "over" ? t("x.a.badgeOver") : (r.remaining !== undefined ? t("x.a.badgeLeft", { h: n1(r.remaining, t) }) : (r.allowed ? t("x.a.badgeAllowed", { a: n1(r.allowed, t) }) : t("x.a.lvl.info")));
      var tip = t("x.title") + "\n" + (r.remaining !== undefined ? t("x.a.usedOf", { u: n1(r.used, t), a: n1(r.allowed, t) }) + "\n" : "") +
        (r.sessions !== undefined && r.level !== "over" ? t("x.a.sessions", { n: r.sessions, b: r.blockHours }) + "\n" : "") + (r.level === "over" ? t("x.a.over", { o: n1(r.used - r.allowed, t) }) + "\n" : "") + t("x.badgeTip");
      var b = pillEl(text, col, tip);
      b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); send({ type: "ka:open-panel", tab: "attend" }); });
      var span = row.querySelector("span.text-right");
      (span && span.parentNode ? span.parentNode : row).appendChild(b);
      if (r.level === "over" || r.level === "warn") keepStyle(row, "box-shadow:inset 4px 0 0 " + col + ";");
    });
  }
  /* Not listesi: her ders kartının başlığına "Finalden >= NN gerekli (tahmini)" rozeti */
  function paintGrades(G, t) {
    undecorate();
    if (!G) return;
    G.rows.forEach(function (g) {
      var lbl = document.getElementById("rptNotListesi_lblDersKod_" + g.row.idx);
      if (!lbl || g.finished || g.missing || g.badSum || !(g.finalW > 0)) return;
      var n = MO.passNeed(g);
      if (!n) return;
      var text = n.ok ? t("x.g2.badgeOk") : (n.impossible ? t("x.g2.badgeNo") : t("x.g2.badgeNeed", { n: Math.ceil(n.need) }));
      var col = n.ok ? "#1a7f4b" : (n.impossible ? COLORS.error : (n.need > 80 ? COLORS.warn : COLORS.info));
      var b = pillEl(text, col, t("x.title") + "\n" + t("x.g2.badgeTip", { p: n.target }) + "\n" + t("x.badgeTip"));
      b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); send({ type: "ka:open-panel", tab: "grades" }); });
      lbl.parentNode.insertBefore(b, lbl.nextSibling);
    });
  }
  function keepStyle(el, css) {
    if (!el.hasAttribute("data-ka-orig")) el.setAttribute("data-ka-orig", el.getAttribute("style") || "");
    var orig = el.getAttribute("data-ka-orig");
    el.setAttribute("style", (orig ? orig.replace(/;?\s*$/, ";") : "") + css);
  }
  function undecorate() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-ka="badge"], [data-ka="banner"]'), function (n) { n.parentNode.removeChild(n); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-ka-orig]"), function (el) {
      var o = el.getAttribute("data-ka-orig");
      if (o) el.setAttribute("style", o); else el.removeAttribute("style");
      el.removeAttribute("data-ka-orig");
    });
  }
  function openCheck(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    send({ type: "ka:open-panel", tab: "check" });
  }
  function paint(table, R, C, t) {
    undecorate();
    var trs = table.querySelectorAll("tr"), marked = 0;
    R.res.rows.forEach(function (r, i) {
      var reg = R.regRows[i], tr = reg ? trs[reg.tr] : null;
      var issues = r.issues.filter(function (is) { return is.type !== "noTime" || R.hasTT; });
      if (!tr || !issues.length) return;
      var lvl = r.level === "ok" ? "info" : r.level, col = COLORS[lvl];
      marked++;
      keepStyle(tr, "border-left:4px solid " + col + ";");
      var tds = tr.querySelectorAll("td");
      if (tds[0]) keepStyle(tds[0], "box-shadow:inset 4px 0 0 " + col + ";");
      var b = document.createElement("span");
      b.setAttribute("data-ka", "badge");
      b.setAttribute("role", "button");
      b.tabIndex = 0;
      b.textContent = (lvl === "error" ? "✖ " : (lvl === "warn" ? "! " : "i ")) + t("x.badge." + lvl, { n: issues.length });
      b.title = t("x.title") + "\n" + issues.map(function (is) { return "• " + KP.issueText(is, C, t, reg); }).join("\n") + "\n\n" + t("x.badgeTip");
      b.style.cssText = "display:inline-block;margin:2px 0 2px 6px;padding:1px 8px;border-radius:999px;font:600 11px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
        "color:#fff;background:" + col + ";cursor:pointer;white-space:nowrap;vertical-align:middle;letter-spacing:0;text-transform:none;";
      b.addEventListener("click", openCheck);
      b.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") openCheck(e); });
      (tds[tds.length - 1] || tr).appendChild(b);
    });
    /* tablo üstü özet şerit (dönem geneli: limit, eksik tekrar dersi) */
    var res = R.res, glob = res.global.filter(function (g) { return g.level === "error"; });
    var ban = document.createElement("div");
    ban.setAttribute("data-ka", "banner");
    ban.setAttribute("role", "note");
    var bad = res.errors > 0, col = bad ? COLORS.error : (R.warns ? COLORS.warn : "#1a7f4b");
    ban.style.cssText = "margin:6px 0 8px;padding:8px 12px;border-radius:8px;border:1px solid " + col + ";border-left:5px solid " + col + ";background:#fff;color:#1b2033;" +
      "font:13px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;text-align:left;";
    var h = document.createElement("strong");
    h.textContent = t("x.title") + ": " + (bad ? t("x.c.sumBad", { e: res.errors, w: R.warns }) : (R.warns ? t("x.c.sumWarn", { w: R.warns }) : t("x.c.sumOk")));
    h.style.color = col;
    ban.appendChild(h);
    var line = document.createElement("div");
    line.textContent = t("x.c.ects", { t: res.total, l: res.limit }) + (marked ? " · " + t("x.bannerMarked", { n: marked }) : "");
    ban.appendChild(line);
    if (glob.length) {
      var ul = document.createElement("ul");
      ul.style.cssText = "margin:4px 0 0;padding-left:18px;";
      glob.forEach(function (g) { var li = document.createElement("li"); li.textContent = KP.globalText(g, C, t); ul.appendChild(li); });
      ban.appendChild(ul);
    }
    var a = document.createElement("button");
    a.type = "button";
    a.textContent = t("x.bannerOpen");
    a.style.cssText = "margin-top:6px;font:600 12px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding:6px 10px;border-radius:6px;border:1px solid " + col + ";background:" + col + ";color:#fff;cursor:pointer;";
    a.addEventListener("click", openCheck);
    ban.appendChild(a);
    table.parentNode.insertBefore(ban, table);
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area && area !== "local") return;
    if (lastPayload && (changes["ka.data"] || changes["ka.ui"])) decorate();
  });

  /* ---------------- 3) üst çerçeve: panel ---------------- */
  if (isTop) {
    var panel = null;
    var ensurePanel = function () { if (!panel) panel = KP.mount(); return panel; };
    if (document.getElementById("IFRAME1") || OBS.detect(document)) ensurePanel();
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg || typeof msg.type !== "string" || msg.type.indexOf("ka:") !== 0) return false;
      if (msg.type === "ka:open") ensurePanel().open(msg.tab);
      else if (msg.type === "ka:collected") ensurePanel().onCollected(msg);
      else if (msg.type === "ka:cleared") { if (panel) panel.reload(); }
      else return false;
      sendResponse({ ok: true });
      return false;
    });
    /* OBS oturum sayacı (span#prolizSessionLeft "MM:SS"): yalnızca okunur; 5 dk kala panel uyarı gösterir */
    setInterval(function () {
      var sec = OBS.sessionLeft ? OBS.sessionLeft(document) : null;
      if (sec !== null) ensurePanel().session(sec);
    }, 5000);
  }

  collect();
  try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) { /* yoksay */ }
})();
