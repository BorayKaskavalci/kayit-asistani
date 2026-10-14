"""Chrome eklentisini paketler (yalnızca Python 3 standart kitaplığı).

Kullanım (depo kökünden veya herhangi bir yerden):
    python3 kayit-asistani/tools/build_extension.py

Yaptıkları:
1. Web uygulamasının veri/metin dosyalarını eklentiye kopyalar:
       kayit-asistani/data.js -> kayit-asistani/extension/lib/data.js
       kayit-asistani/i18n.js -> kayit-asistani/extension/lib/i18n.js
   (Eklenti dosyaları eklenti klasörünün içinde olmak zorundadır; kaynak tek yerde tutulur.)
   research/obs/bologna-weights.json varsa (herkese açık Bologna "Değerlendirme Ölçütleri")
   sadeleştirip extension/lib/weights.js olarak yazar (window.KAYIT_WEIGHTS).
2. manifest.json'u JSON olarak doğrular; manifestte adı geçen her dosyanın var olduğunu denetler.
3. kayit-asistani/extension.zip dosyasını yazar: yalnızca extension/ klasörünün İÇERİĞİ
   (dev/ ve tests/ klasörleri ile gizli dosyalar hariç). Zip kökünde manifest.json bulunur.
"""
import json
import os
import shutil
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)                      # kayit-asistani/
EXT = os.path.join(APP, "extension")
ZIP = os.path.join(APP, "extension.zip")
EXCLUDE_DIRS = {"dev", "tests", "__pycache__"}


def fail(msg):
    print("HATA: " + msg, file=sys.stderr)
    sys.exit(1)


def copy_shared():
    for name in ("data.js", "i18n.js"):
        src, dst = os.path.join(APP, name), os.path.join(EXT, "lib", name)
        if not os.path.isfile(src):
            fail("bulunamadı: " + src)
        shutil.copyfile(src, dst)
        print("kopyalandı: %s -> extension/lib/%s" % (name, name))


# Bologna bileşen adı -> kısa anahtar (Not Listesi'ndeki sınav adlarıyla aynı eşleme: lib/ka-more.js compKey)
COMP_RULES = [
    (r"final|yar[ıi]y[ıi]l sonu", "final"),
    (r"mid-?term|ara s[ıi]nav", "mid"),
    (r"quiz|k[üu][çc][üu]k s[ıi]nav", "quiz"),
    (r"homework|[öo]dev", "hw"),
    (r"practice|uygulama", "practice"),
    (r"project|proje", "project"),
    (r"particip|devam", "part"),
    (r"field|arazi", "field"),
    (r"present|sunum|seminer", "pres"),
    (r"other|di[gğ]er|staj", "other"),
]
SKIP_RULES = r"self-study|ön çalışma|teaching hours|ders süresi"


def comp_key(name):
    import re
    low = name.lower()
    if re.search(SKIP_RULES, low):
        return None
    for pat, key in COMP_RULES:
        if re.search(pat, low):
            return key
    return "other"


def write_weights():
    src = os.path.join(os.path.dirname(APP), "research", "obs", "bologna-weights.json")
    dst = os.path.join(EXT, "lib", "weights.js")
    if not os.path.isfile(src):
        if not os.path.isfile(dst):
            fail("ne research/obs/bologna-weights.json ne de extension/lib/weights.js var")
        print("atlandı: bologna-weights.json yok, mevcut lib/weights.js kullanılıyor")
        return
    with open(src, encoding="utf-8") as f:
        raw = json.load(f)
    out = {}
    for code, comps in sorted((raw.get("weights") or {}).items()):
        if not comps:
            continue
        merged = {}
        order = []
        for c in comps:
            key = comp_key(c.get("name", ""))
            if key is None or not c.get("pct"):
                continue
            if key not in merged:
                merged[key] = [key, 0, 0]
                order.append(key)
            merged[key][1] += int(c.get("count") or 1)
            merged[key][2] += c["pct"]
        if merged:
            out[code] = [merged[k] for k in order]
    body = json.dumps({"source": raw.get("source", ""), "fetched": raw.get("fetched", ""), "w": out}, ensure_ascii=False, separators=(",", ":"))
    with open(dst, "w", encoding="utf-8") as f:
        f.write("/* OTOMATİK ÜRETİLDİ (tools/build_extension.py) - elle düzenlemeyin.\n"
                "   Kaynak: herkese açık OBS Bologna ders sayfaları, \"Değerlendirme Ölçütleri\" (research/obs/bologna-weights.json).\n"
                "   w[kod] = [[bileşen, adet, toplam yüzde], ...]; bileşen: final, mid, quiz, hw, practice, project, part, field, pres, other */\n")
        f.write("(function (root) { root.KAYIT_WEIGHTS = " + body + "; })(typeof self !== \"undefined\" ? self : this);\n")
    print("yazıldı: extension/lib/weights.js (%d ders)" % len(out))


def manifest_files(m):
    files = []
    for size, p in (m.get("icons") or {}).items():
        files.append(p)
    action = m.get("action") or {}
    if action.get("default_popup"):
        files.append(action["default_popup"])
    for p in (action.get("default_icon") or {}).values():
        files.append(p)
    bg = m.get("background") or {}
    if bg.get("service_worker"):
        files.append(bg["service_worker"])
    for cs in m.get("content_scripts") or []:
        files.extend(cs.get("js") or [])
        files.extend(cs.get("css") or [])
    for war in m.get("web_accessible_resources") or []:
        files.extend(war.get("resources") or [])
    return files


def validate():
    path = os.path.join(EXT, "manifest.json")
    try:
        with open(path, encoding="utf-8") as f:
            m = json.load(f)
    except (OSError, ValueError) as e:
        fail("manifest.json okunamadı / geçersiz JSON: %s" % e)
    if m.get("manifest_version") != 3:
        fail("manifest_version 3 olmalı")
    for key in ("name", "version", "description"):
        if not m.get(key):
            fail("manifestte '%s' eksik" % key)
    if len(m["description"]) > 132:
        fail("description en fazla 132 karakter olmalı (%d)" % len(m["description"]))
    missing = [p for p in manifest_files(m) if not os.path.isfile(os.path.join(EXT, p))]
    if missing:
        fail("manifestte adı geçen dosyalar yok: " + ", ".join(missing))
    # service worker'ın importScripts ile yüklediği dosyalar
    with open(os.path.join(EXT, m["background"]["service_worker"]), encoding="utf-8") as f:
        sw = f.read()
    import re
    for p in re.findall(r'importScripts\(\s*"([^"]+)"', sw):
        if not os.path.isfile(os.path.join(EXT, p)):
            fail("service worker'ın yüklediği dosya yok: " + p)
    print("manifest.json geçerli: %s %s (izinler: %s)" % (m["name"], m["version"], ", ".join(m.get("permissions") or [])))
    return m


def build_zip():
    count = 0
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for dirpath, dirnames, filenames in os.walk(EXT):
            rel_dir = os.path.relpath(dirpath, EXT)
            dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDE_DIRS and not d.startswith("."))
            for fn in sorted(filenames):
                if fn.startswith("."):
                    continue
                full = os.path.join(dirpath, fn)
                arc = fn if rel_dir == "." else os.path.join(rel_dir, fn).replace(os.sep, "/")
                z.write(full, arc)
                count += 1
    print("yazıldı: %s (%d dosya, %.1f KB)" % (os.path.relpath(ZIP, os.path.dirname(APP)), count, os.path.getsize(ZIP) / 1024))


if __name__ == "__main__":
    copy_shared()
    write_weights()
    validate()
    build_zip()
