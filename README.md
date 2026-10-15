# YaşarOBS+

**Öğrenci Bilgi Sistemi, yeniden tasarlandı.** GenAI (ENGR 4451) dersi ödevi: OBS'ye benzeyen ama öğrencinin en sık yaşadığı sorunları (özellikle ders kaydı) doğrudan çözen alternatif bir OBS. TR/EN.

- **Canlı demo (kurulum yok):** <https://boraykaskavalci.github.io/kayit-asistani/> → "Demo öğrenci olarak giriş yap"
- Doğrudan bir sayfa: `#home`, `#plan`, `#status`, `#flow`, `#reg`, `#att`, `#grades`, `#cal`, `#grad`, `#about`
- **İnternetsiz:** depoyu indirip `index.html`'i açmak yeterli (sunucu gerekmez).

| Menü | Ne yapıyor (OBS'den farkı) |
|---|---|
| Ana Sayfa | GNO/statü, AKTS limiti, en erken mezuniyet ve "dikkat etmen gerekenler" listesi tek ekranda |
| Ders Seç & Program | Canlı haftalık program; çakışma eklemeden önce görünür; izinli tekrar dersi çakışması (m.29/4); çakışmasız program üretici |
| Ön Koşul & Kontenjan | "Alabileceklerim", gerekçeli "alamazsın", dolu şube için yedekler |
| Danışman Onayı | Kontrol sonuçlarıyla özet, onay/ret akışı |
| Kayıt Günü Planı | Plan A/B/C, "X doluysa Y" kuralları, geri sayım, yazdır |
| Devamsızlık | Kalan hak (teorik %30 / uygulama %20), NA uyarısı |
| Notlar & Final Hesabı | OBS Bologna ağırlıklarıyla puan; her harf için finalden gereken not; ara sınav "ya şunu alırsam?" |
| Takvim & Sınavlar | Akademik takvim + sınavlar + program tek ekranda; .ics ile telefona (hatırlatmalı) |
| Mezuniyet Yol Haritası | En erken mezuniyet, kritik dersler, "ya kalırsam?", GNO hedefi |
| OBS'den farkı | Sorun / bugün OBS / YaşarOBS+ karşılaştırması |

Bonus: aynı kural motoru **gerçek OBS'nin içinde çalışan bir Chrome eklentisi** olarak da var (aşağıda "Kayıt Asistanı").

---

# Kayıt Asistanı

**OBS ders kaydı için akıllı yardımcı** - üniversitenin öğrenci bilgi sistemi **OBS'nin içinde** çalışan bir Chrome eklentisi ve onunla aynı kural motorunu kullanan, kurulum gerektirmeyen bir web planlayıcı. TR/EN dilli; GenAI dersi dönem ödevidir. Hocamızın isteği doğrultusunda hedef, **OBS'ye benzeyen ve kayıt sorunlarını doğrudan hedefleyen** bir çözümdür.

İki ürün, tek motor (`extension/lib/kayit-core.js`):

| | **1. Chrome eklentisi – "Kayıt Asistanı – OBS"** (ana ürün) | **2. Web uygulaması** (bağımsız planlayıcı) |
|---|---|---|
| Nerede çalışır | Gerçek OBS'nin (Proliz OİBS) içinde, sağda yan panel + OBS tablolarında işaretler (kayıt, devamsızlık, not listesi) | Tarayıcıda tek sayfa (`index.html`), GitHub Pages |
| Veri | Öğrencinin **kendi OBS sayfalarından** (salt-okunur): ders programı, müfredat durumu, açılan dersler, ders kaydı; isteğe bağlı devamsızlık, not listesi, sınav ve akademik takvim | `data.js`: gerçek müfredat/ön koşul/ders programı + kurgusal öğrenci |
| Kimin için | **Her öğrenci** kurup kendi hesabında kullanabilir (kişiye özel veri yok) | Sunum ve "kayıt öncesi deneme" için |
| Ayrıntı | [`extension/README.md`](extension/README.md) | aşağıda |

- **Eklentiyi indir:** [`extension.zip`](extension.zip) → `chrome://extensions` → Geliştirici modu → Paketlenmemiş öğe yükle (ayrıntı: [`extension/README.md`](extension/README.md)).
- **Kurmadan dene (Demo OBS):** <https://boraykaskavalci.github.io/kayit-asistani/demo-obs/?dev=1> — gerçek OBS'nin sayfa yapısını taklit eden kurgusal bir kopya; eklentinin tamamı `?dev=1` ile sayfada çalışır.
- **Web uygulaması:** <https://boraykaskavalci.github.io/kayit-asistani/>

> **Veri durumu özeti:** Web uygulamasında müfredat, **ön koşullar** ve **2026-2027 Güz ders programı gerçektir** (Yaşar Üniv. Makine Mühendisliği). **Kontenjan simülasyondur** (OBS'de herkese açık değil) ve öğrenci **kurgusaldır**. Eklenti ise öğrencinin kendi OBS verisini yalnızca okur; OBS'ye istek atmaz, veriyi hiçbir yere göndermez.

## Problem

OBS ile ders kaydı yapan öğrencilerin sık yaşadığı dört sorun:

1. **OBS yavaşlıyor / çöküyor.** Kayıt günü sistem donabiliyor; öğrenci o anda karar vermek zorunda kalıyor.
2. **Kontenjan anında doluyor.** Seçtiğin şube saniyeler içinde dolabiliyor ve yedeğin yoksa programın çöküyor.
3. **Programı kafada kurmak.** Hangi şubeler çakışıyor, hangi kombinasyon daha az gün/boşluk bırakıyor, elle hesaplamak zor.
4. **Ne alabileceğini bilmemek.** Ön koşullar, başarısız dersler, AKTS üst sınırı ve statü kuralları bir arada düşünülmeli.

## Çözüm

Kayıt günü gelmeden önce her şeyi hazırlatan bir yardımcı:

| Sorun | Özellik |
|---|---|
| OBS yavaş/çöküyor | **Kayıt Günü Planı** sekmesi: OBS'ye giriş sırası, kopyalanabilir ders+şube kodu listesi, yazdır/PDF kaydet, geri sayım, internetsiz çalışır |
| Kontenjan doluyor | Her ders için çakışmasız **yedek şubeler**, "X doluysa -> Y" kuralları, otomatik Plan B ve Plan C; kayıt anında "Dolu işaretle" ile anında yeniden planlama |
| Programı kafada kurmak | **Program üretici**: tüm çakışmasız kombinasyonlar, tercihe göre sıralama (en az gün, 08:40 yok, az boşluk, boş gün), mini haftalık program kartları |
| Ne alabileceğini bilmemek | **Alabileceğim dersler** listesi: ön koşulu sağlananlar, tekrar edilmesi gerekenler öncelikli, gerekçeli "alamazsın" listesi, statüye göre limit |

## Özellikler

### Chrome eklentisi (OBS içinde)

- **Otomatik veri toplama:** OBS'de açtığın sayfalar (Bölüm Ders Programı – her sınıf, Müfredat Durum, Açılan Bölüm Dersleri, Ders Kayıt) salt-okunur ayrıştırılır; Durum sekmesi neyin toplandığını ve eksikse hangi menüye gideceğini gösterir.
- **Kayıt kontrolü + OBS tablosunda işaret:** çakışma (hangi ders, gün, saat), izinli tekrar dersi çakışması (m.29/4), ön koşul ihlali, ME 4910 özel şartı, geçilmiş dersin tekrarı, AKTS limiti (OBS'nin kendi limitinden), kayıtta olmayan F'li zorunlu ders; çakışan şube için çakışmayan şube önerisi. Sorunlu satırlar Ders Kayıt tablosunda renkli kenar ve rozetle işaretlenir.
- **Alabileceklerim:** bu dönem açılanlar ∩ müfredat; önce tekrar edilmesi zorunlu dersler, alınabilenler, seçmeli adayları, kilitliler (nedeniyle).
- **Planla:** çakışmasız kombinasyonlar, tercihler, mini haftalık ızgaralar, Plan A/B/C, "Dolu" ile anında yeniden planlama, kopyalanabilir kayıt günü listesi.
- **Mezuniyet Yol Haritası:** dönem dönem en erken mezuniyet, kritik yol, "ya kalırsam?", GNO hedefi.
- **Kayıt dışındaki OBS sorunları:**
  - **Devamsızlık:** ders başına kullanılan / izin verilen saat, kalan hak ve "≈ N ders oturumu daha", NA riski uyarısı (Yönetmelik m.29(2)); OBS satırlarında rozet.
  - **Not hesabı:** Not Listesi + herkese açık Bologna değerlendirme ağırlıkları → şu anki puan, sınıf ortalaması, hedef eşikler için **finalden gereken puan** (düzenlenebilir, "tahmini" etiketli); OBS kartında rozet.
  - **Takvim (.ics):** haftalık dersler, hatırlatıcılı sınavlar ve akademik son tarihler tek dosyada telefona/takvime; Durum'da "Yaklaşan" geri sayım kartı.
  - **Oturum uyarısı:** OBS oturumu 5 dk içinde kapanacakken bir kez uyarır (oturumu uzatmak için hiçbir şeye tıklamaz).
- Gizlilik: yalnızca `storage` izni, ağ isteği yok, ad/numara okunmaz, .ics cihazda üretilir, "Verilerimi sil".

### Web uygulaması

- **1. Ders Seç & Program** - aranabilir/filtrelenebilir ders listesi, sepet, haftalık program (Pzt-Cum 08:40-18:40), kırmızı çakışma uyarısı ("ME 3310 ile ... Salı 13:40'ta çakışıyor"), dönem yük sınırı uyarısı, şubenin üzerine gelince programda önizleme.
- **2. Ön Koşul & Kontenjan** - "Alabileceğim dersler", sepet kontrolü ve tek ders inceleme. Ön koşul sağlandı/sağlanmadı (eksik mi, başarısız mı), kontenjan çubuğu (dolu / az kaldı / müsait), alternatif şubeler, "bu dersi geçersen / kalırsan" ipuçları.
- **3. Mezuniyet Takibi** - **Mezuniyet Yol Haritası** (dönem dönem en erken mezuniyet planı, kritik yol, "ya kalırsam?" senaryosu, beklenen not ve GNO 2,00 hedefi, plan doğrulaması), 240 AKTS ilerlemesi, zorunlu dersler, seçmeli yuvaları, tekrar edilecek dersler, GNO ≥ 2,00 koşulu, "bu dönem alırsan" projeksiyonu.
- **4. Danışman Onayı** - Ders seçimi -> Kontrol -> Danışmana gönder -> Onay bekleniyor -> Onaylandı/Reddedildi (simüle), engelleyen sorunların kontrol listesi, "Danışmana mesaj kopyala".
- **5. Kayıt Günü Planı** - yukarıda anlatıldı.
- **Kurallar** paneli (başlıktaki "Kurallar"): yönetmelik özeti ve kaynak bağlantısı.
- TR/EN dil düğmesi (seçim tarayıcıda hatırlanır), açık/koyu tema (`prefers-color-scheme`), mobil uyumlu, klavye ile gezilebilir.

### Uygulanan yönetmelik kuralları

Kaynak: *Yaşar Üniversitesi Önlisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği* (RG 14/8/2016, sayı 29801; 22/2/2021 değişikliğine kadar).

- Dönemlik yük en az 20, en fazla 40 AKTS; **sınamalı** (GNO ≤ 1,99) öğrenci en çok 32 AKTS ve önce F/U'lu zorunlu derslerini tekrar etmek zorunda. Statü 2. dönem sonundan itibaren uygulanır.
- İlk kez alınan dersler çakışamaz; **F/U'lu tekrar dersi ilk kez alınan dersle çakışabilir** (m.29(4)) - uygulama bunu "izinli çakışma" olarak ayrı gösterir.
- Not skalası A ... F (D en düşük geçer not; DC/DD/FD yoktur); C-, D+, D not yükseltmek için tekrar edilebilir; son not GNO'ya girer; GNO 2 basamağa kesilir.
- Zorunlu F dersi açıldığı ilk dönemde alınmalı; mezuniyet 240 AKTS + GNO ≥ 2,00.

## Neden farklı?

YU Sync (yu-sync.com) gibi öğrenci yapımı **ders programı planlayıcıları** çakışmasız program üretmekte iyidir. Kayıt Asistanı onların yerine değil, **onları tamamlayacak** biçimde şunları ekler:

- **Uygunluk / ön koşul motoru:** gerçek ön koşullar, ME 4910 özel şartı (>= 150 AKTS ve 1-4. yarıyıl zorunluları), F'li derslerin zincirleme kilidi, "geçersen / kalırsan" ipuçları.
- **GNO'ya göre AKTS limiti:** başarılı (<= 40) / sınamalı (<= 32, önce F'li zorunlu dersler) statüsü ve yönetmeliğin F-tekrar çakışma istisnası.
- **Mezuniyet takibi:** 240 AKTS, zorunlu/seçmeli kategoriler, GNO >= 2,00 koşulu, "bu dönem alırsan" projeksiyonu.
- **Kayıt günü Plan A/B/C:** giriş sırası, "dolarsa -> şuna geç" kuralları, "Dolu işaretle" ile anında yeniden planlama, kopyala / PDF.
- **Danışman onayı kontrol listesi** ve kopyalanabilir mesaj.

## Veri kaynakları ve durumu

| Veri | Kaynak | Durum |
|---|---|---|
| Müfredat (kod, ad, T+U+L, AKTS, dönem, 240 AKTS, seçmeli yuvaları) | [OBS Bologna 2025-2026 müfredatı](https://obs.yasar.edu.tr/oibs/bologna/progCourses.aspx?lang=tr&curSunit=401166) | Gerçek |
| Ön koşullar (+ ME 4910 özel şartı) | [Bölüm: müfredat ve ön koşul ilişkileri](https://me.yasar.edu.tr/mufredat-ve-onkosul-iliskileri/) | Gerçek (`prereqVerified: true`) |
| Güz 2026-2027 şube / gün / saat / derslik | [Bölüm: 2026-2027 Güz ders programı](https://me.yasar.edu.tr/2026/09/07/2026-2027-guz-donemi-ders-programi/) (xlsx) | Gerçek; metin biçimleri yorumlandı (yorumlar `data.js` başında) |
| Kurallar (limitler, not skalası, çakışma istisnası, mezuniyet) | [Yaşar Üniv. Önlisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği](https://mevzuat.gov.tr/File/GeneratePdf?mevzuatNo=22754&mevzuatTertip=5&mevzuatTur=UniversiteYonetmeligi) | Gerçek (22/2/2021 değişikliğine kadar); güncel metinle teyit edin |
| Kontenjan / doluluk | - | **Simüle** (arayüzde "simüle" etiketi; şubeyi elle "Dolu işaretle" ile güncelleyebilirsiniz) |
| Hoca adları | yayımlanmıyor | Gösterilmez |
| Seçmeli ders adları | çizelgede yalnızca kod var | "Bölüm Seçmeli (ME 4610)" vb.; AKTS 6 varsayıldı; ENGR 4451 = Üretken Yapay Zekâ |
| Uzaktan (UMFD, HIST, TURK, ISG, UFND), YDYO (SOFL), Staj | bölüm çizelgesinde yok | Saatsiz örnek şube olarak eklendi |
| Öğrenci profili | - | **Kurgusal** ("Demo Öğrenci", GNO ~1,77 sınamalı) |

Bahar derslerinden Güz çizelgesinde olmayanlar "bu dönem açılmıyor" olarak görünür. Tüm veri tek dosyada (`data.js`) durur; şema dosyanın başındadır. Limit birimi (`rules.limit.unit`: `"ects"` veya `"credits"`) ve değerleri de oradadır.

## Nasıl yapıldı

- **Claude Code ile** (Anthropic'in kodlama ajanı) geliştirildi: gereksinim analizi, veri toplama, kural motoru, arayüzler, testler ve belgeler ajanla birlikte, adım adım doğrulanarak yazıldı.
- **Gerçek veri, hocamızın önerdiği gibi tarayıcı üzerinden toplandı** (Claude in Chrome / Chrome MCP ile, öğrencinin kendi oturumunda, yalnızca okuma):
  - **OBS Bologna** sayfasından 2025-2026 Makina Mühendisliği müfredatı (kod, ad, AKTS, yarıyıl, seçmeli yuvaları),
  - **bölümün ön koşul diyagramından** gerçek ön koşullar ve ME 4910 özel şartı,
  - bölümün yayımladığı **resmi ders programı xlsx** dosyasından 2026-2027 Güz şube/gün/saat/derslik bilgisi,
  - herkese açık **Bologna ders sayfalarının "Değerlendirme Ölçütleri"** tablolarından 259 dersin sınav ağırlıkları (not hesabı için),
  - **OBS sayfa yapısı analizi:** Bölüm Ders Programı, Müfredat Durum, Açılan Bölüm Dersleri ve Ders Kayıt sayfalarının DOM yapısı (çerçeveler, tablo/kimlik seçicileri) incelendi ve kişisel veri içermeyen teknik not olarak `research/obs/OBS-YAPI.md`'ye yazıldı. Eklentinin ayrıştırıcıları ve `demo-obs/` kopyası bu nota dayanır.
- Kurallar Yaşar Üniversitesi yönetmeliğinden (mevzuat.gov.tr) okunup motora işlendi; motor web uygulaması ve eklenti arasında **tek dosya** olarak paylaşılır.
- Doğrulama: tüm JS dosyaları sözdizimi denetiminden geçirildi; eklenti demo OBS'de uçtan uca (veri toplama → kontrol → plan → yol haritası, TR/EN, dar ekran) denendi; `extension/tests/test.html` birim testleri.

## Nasıl çalıştırılır

Derleme yok, bağımlılık yok.

- **Yerelde:** `index.html` dosyasına çift tıklayın (veya `python3 -m http.server` ile açın).
- **GitHub Pages:** depoya yükleyin -> Settings -> Pages -> Branch: `main` / `(root)`. Adres `https://<kullanici>.github.io/<depo>/` olur.
- Sepet, tercihler ve onay durumu tarayıcının `localStorage` alanında tutulur. İsteğe bağlı Google Font (Inter) yüklenemezse sistem yazı tipi kullanılır; başka ağ isteği yoktur.

## Dosyalar

| Dosya | Görev |
|---|---|
| `index.html` | Sayfa iskeleti |
| `style.css` | Tasarım, açık/koyu tema, yazdırma stili |
| `app.js` | Uygulama mantığı (çakışma, ön koşul, çözücü, sekmeler) |
| `data.js` | Katalog, kurallar, öğrenci profili |
| `i18n.js` | TR/EN arayüz metinleri |
| `extension/` | Chrome eklentisi (MV3) - ayrıntı: `extension/README.md`; ortak motor `extension/lib/kayit-core.js` |
| `extension.zip` | Kurulabilir eklenti paketi (`python3 tools/build_extension.py` üretir) |
| `demo-obs/` | Eklenti demosu için kurgusal OBS kopyası (`?dev=1` ile eklenti sayfada çalışır) |
| `tools/` | `build_extension.py` (paketleme), `dev_server.py` (önbelleksiz yerel sunucu) |

## Ekran açıklaması

1. **Ders Seç & Program:** solda ders listesi, sağda sepet, haftalık program ve program tercihleri/üretici.
2. **Ön Koşul & Kontenjan:** üstte üç görünüm düğmesi (alabileceğim dersler / sepet kontrolü / ders incele).
3. **Mezuniyet Takibi:** özet kartlar, genel ilerleme çubuğu, tekrar edilecek dersler, zorunlu ve seçmeli ilerleme.
4. **Danışman Onayı:** adım göstergesi, kontrol listesi, mesaj özeti ve simüle danışman yanıtı.
5. **Kayıt Günü Planı:** geri sayım, giriş sırası, "doluysa" kuralları, Plan A/B/C mini programları, kopyala ve yazdır.

## İleride

- OBS entegrasyonu eklentiyle yapıldı (salt-okunur; kayıt, devamsızlık, not hesabı, takvim). Sırada: kayıt açıkken kullanılan ders seçim sayfasının desteklenmesi, kontenjan bilgisinin (OBS gösteriyorsa) okunması.
- Resmi müfredat görselinden/OBS ders bilgi paketlerinden **doğrulanmış ön koşul** ve seçmeli havuzu.
- Ders/hoca değerlendirmeleri ve iş yükü bilgisi ile program önerisi; yapay zekâ destekli danışman sohbeti.
- Danışmana gerçek e-posta/bildirim, birden çok bölüm ve çift anadal desteği.
- Takvim (iCal) dışa aktarımı.

## Hazırlayan

Bireysel ödev (ENGR 4451 GenAI, 2026-2027 Güz).
