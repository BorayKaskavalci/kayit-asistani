# Kayıt Asistanı – OBS (Chrome eklentisi)

Üniversitenin öğrenci bilgi sistemi **OBS (Proliz OİBS)** içinde çalışan, ders kaydı sorunlarını **kayıt sayfasının üstünde** gösteren; devamsızlık, not hesabı ve takvim gibi OBS'nin günlük sorunlarına da yardım eden bir Chrome eklentisi (Manifest V3). Herhangi bir öğrenci kurup kendi OBS hesabında kullanabilir; kişiye özel veri içermez.

## Ne yapar?

OBS'de zaten açtığın sayfaları **salt-okunur** okur ve sağda bir yan panel açar:

| Sekme | İçerik |
|---|---|
| **Durum** | Hangi OBS verisinin toplandığı (zaman damgasıyla), eksikse OBS'de hangi menüyü açman gerektiği, gizlilik notu, "Verilerimi sil". |
| **Kontrol** | OBS'deki ders kaydının kontrolü: saat çakışması (hangi dersle, hangi gün/saatte), F/U tekrar dersinin izinli çakışması (Yönetmelik m.29/4), ön koşul ihlali (notuyla), ME 4910 özel şartı (150 AKTS + 1-4. yarıyıl zorunluları), daha önce geçilmiş dersin tekrarı, "Alttan" işaretlenmemiş tekrar dersi, AKTS limiti (OBS'nin kendi `Table5` limitinden), kayıtta olmayan F'li zorunlu ders. Çakışan şube için **çakışmayan diğer şubeler** önerilir. |
| **Alabileceklerim** | Bu dönem açılan dersler ∩ müfredatın: önce tekrar edilmesi zorunlu dersler, şimdi alınabilenler, seçmeli adayları, not yükseltme, kilitli dersler (nedeniyle), açılmayanlar; geçilenler isteğe bağlı. "Plana ekle" ile panel içi sepet. |
| **Planla** | Sepetten tüm çakışmasız kombinasyonlar; tercihler (en az gün, 08:40 yok, az boşluk, Cuma boş); en iyi 3 seçenek mini haftalık ızgarada (izinli çakışma turuncu); Plan A seçimi, otomatik Plan B/C; şube başına **"Dolu"** işaretiyle anında yeniden planlama; kopyalanabilir **kayıt günü listesi** ("KOD(şube) — doluysa → …"). |
| **Yol Haritası** | Mezuniyet yol haritası: dönem dönem en erken mezuniyet, kritik yol, "ya kalırsam?" senaryosu, beklenen not ve GNO hedefi (sınamalıdan çıkış), plan doğrulaması. Önerilen plan / OBS'deki kayıt / planladığım dersler modları. |
| **Devamsızlık** | OBS Devamsızlık Durumu'ndan her ders için kullanılan / izin verilen saat (sınır, bilgi ikonunun açıklamasından okunur), kalan saat ve "≈ N ders oturumu daha" (oturum uzunluğu ders programındaki bloklardan); renkli durum (güvende / az kaldı / sınır aşıldı = **NA riski**). NA'nın F gibi sayıldığı ve m.29(4) çakışma istisnasından yararlanamadığı açıklanır (Yönetmelik m.29(2): teorik %70, uygulama %80 devam). OBS satırlarına kalan hak rozeti eklenir. |
| **Notlar** | OBS Not Listesi'ndeki açıklanan notlar + dersin herkese açık **Bologna "Değerlendirme Ölçütleri"** ağırlıkları (Ara sınav, Quiz, Ödev, Uygulama, Proje, Katılım, Final …) → şu anki ağırlıklı puan, sınıf ortalamasıyla karşılaştırma ve hedef eşikler için **finalden gereken puan**. Ağırlıklar ve eşikler düzenlenebilir (ağırlığı olmayan derste öğrenci girer). Yaşar'da harf notu sabit aralıkla belirlenmediği için eşikler açıkça "tahmini" etiketlidir. OBS kartına "Finalden ≥ NN gerekli (tahmini)" rozeti eklenir. |
| **Takvim** | Kişisel Ders Programı (yoksa kayıt + bölüm programı), Sınav Takvimi ve Akademik Takvim → tek **.ics** dosyası (RFC 5545): dönem boyunca haftalık tekrarlanan dersler (RRULE, Europe/Istanbul), 1 gün + 1 saat önce hatırlatıcılı sınavlar, tüm gün son tarihler. Dönem aralığı akademik takvimden tahmin edilir, düzenlenebilir. Dosya cihazda üretilir (Blob), hiçbir yere gönderilmez. |

**Durum** sekmesinde ayrıca **Yaklaşan** kartı vardır: kapanmak üzere olan son tarihler ve yaklaşan sınavlar geri sayımla ("Ekle-Bırak 1 gün sonra kapanıyor"). **Oturum uyarısı:** üst çerçevedeki OBS oturum sayacı (`#prolizSessionLeft`) 5:00'ın altına inince bir kez "OBS oturumun 5 dk içinde kapanacak — açık formunu kaydet" uyarısı çıkar; eklenti oturumu uzatmak için hiçbir şeye tıklamaz.

Ayrıca **Ders Kayıt** sayfasındaki OBS tablosunda sorunlu satırlar işaretlenir: satırın sol kenarı renklenir (kırmızı = hata, turuncu = uyarı, mavi = bilgi), son hücreye küçük bir rozet eklenir (üzerine gelince açıklama, tıklayınca panel açılır) ve tablonun üstüne dönem geneli özet şerit konur. İşaretler **zararsızdır**: form değerleri değişmez, eklenen her öğe `data-ka` özniteliği taşır ve yeniden çizimde kaldırılır. Kayıt sayfası bir oturumda ilk kez görüldüğünde panel kendiliğinden **Kontrol** sekmesinde açılır.

Panel TR/EN dillidir (başlıktaki düğme), dar ekranda (375 px) tam genişlikte açılır, açık/kapalı durumu ve sekme hatırlanır.

## Kurulum

1. Bu klasörü (`kayit-asistani/extension/`) indir **veya** `kayit-asistani/extension.zip` dosyasını bir klasöre aç.
2. Chrome'da `chrome://extensions` adresine git, sağ üstten **Geliştirici modu**nu aç.
3. **Paketlenmemiş öğe yükle** → `extension` klasörünü (içinde `manifest.json` olan klasör) seç.
4. Araç çubuğundaki yapboz simgesinden **Kayıt Asistanı – OBS**'yi sabitle.

> Kaynaktan çalışıyorsan önce `python3 kayit-asistani/tools/build_extension.py` çalıştır: web uygulamasının `data.js` ve `i18n.js` dosyalarını `extension/lib/` içine kopyalar, `manifest.json`'u doğrular ve `extension.zip`'i üretir.

## Gerçek OBS'de kullanım

OBS'ye normal şekilde giriş yap. Eklenti yalnızca senin açtığın sayfaları okur; her sayfayı **bir kez** açman yeterlidir:

1. **Genel İşlemler › Bölüm Ders Programı** — Sınıf listesinden **1, 2, 3, 4**'ü sırayla seç (her seçim sayfayı yeniler ve o sınıfın şubeleri alınır). Çakışma kontrolü ve plan bu veriye dayanır.
2. **Ders ve Dönem İşlemleri › Müfredat Durum** — geçtiğin/kaldığın dersler, GNO, kazanılan AKTS, sınıf.
3. **Genel İşlemler › Açılan Bölüm Dersleri** — saatsiz dersler (proje, staj) ve seçmeli adayları için.
4. **Ders ve Dönem İşlemleri › Ders Kayıt** — kaydın kontrol edilir, tablo işaretlenir, panel Kontrol sekmesinde açılır.

İsteğe bağlı (ilgili sekmeler için):

5. **Ders ve Dönem İşlemleri › Devamsızlık Durumu** — Devamsızlık sekmesi.
6. **Ders ve Dönem İşlemleri › Not Listesi** — Notlar sekmesi.
7. **Genel İşlemler › Ders Programı**, **Sınav Takvimi**, **Akademik Takvim** — Takvim sekmesi ve Durum'daki "Yaklaşan" kartı.

Sağ alttaki **KA** düğmesi paneli açar/kapatır; araç çubuğu penceresindeki "OBS'de paneli aç" da aynı işi yapar.

## Gizlilik

- **Salt-okunur DOM okuma.** Eklenti OBS'ye (veya başka bir sunucuya) **hiçbir ağ isteği göndermez**, sayfa getirmez, tıklama/form gönderme otomasyonu yapmaz. (OBS aynı tarayıcıdan paralel oturuma izin vermez; bu yüzden de yalnızca açık sayfa okunur.)
- **Ad ve öğrenci numarası okunmaz.** Yalnızca ders kodları, şubeler, saatler, notlar ve sayısal özetler (GNO, AKTS, sınıf) alınır.
- **Veriler yalnızca bu tarayıcıda** `chrome.storage.local` içinde durur (`ka.data`: toplanan OBS verisi, `ka.ui`: panel tercihleri). Panel veya açılır penceredeki **Verilerimi sil** ile tamamı silinir.
- **.ics takvim dosyası** tarayıcıda üretilir ve doğrudan indirilir; ağırlıklar eklentinin içindeki `lib/weights.js` dosyasından gelir (herkese açık Bologna sayfalarından derleme anında hazırlanır). Not, devamsızlık ve takvim verisi de yalnızca `chrome.storage.local`'da durur.
- Oturum sayacı yalnızca okunur; eklenti oturumu uzatmaz, sayfayı yenilemez.
- İzinler: yalnızca `storage`. İçerik betikleri yalnızca `https://obs.yasar.edu.tr/oibs/*`, demo OBS (GitHub Pages) ve yerel demo için `http://localhost/*`, `http://127.0.0.1/*` adreslerinde çalışır. (localhost/127.0.0.1 eşleşmeleri yalnızca yerel demo/test içindir.)

## Nasıl çalışır?

```
 OBS sekmesi
 ┌───────────────────────────────────────────────────────────────┐
 │ üst çerçeve: index.aspx                                       │
 │   content.js ──► lib/panel.js (Shadow DOM yan panel)          │
 │        ▲  ka:collected / ka:open / ka:cleared                 │
 │ ┌──────┼──────────────────────────────────────────────────┐   │
 │ │ iframe#IFRAME1: /oibs/std/*.aspx                         │   │
 │ │   content.js: KayitOBS.detect(document) → parse          │   │
 │ │   (ders kayıt sayfasında: tablo satırlarını işaretle)    │   │
 │ └──────┼──────────────────────────────────────────────────┘   │
 └────────┼──────────────────────────────────────────────────────┘
          │ chrome.runtime.sendMessage({type:"ka:collect", kind, payload})
          ▼
 background.js (service worker) + lib/bg-core.js (KAStore.merge)
          │ chrome.storage.local "ka.data"  ──► storage.onChanged (tüm çerçeveler)
          ▼
 lib/ka-model.js (KayitExt): toplanan veri → birleşik ders programı + öğrenci modeli
          ▼
 lib/kayit-core.js (KayitCore): çakışma, kayıt kontrolü, çözücü, Plan B/C, yol haritası
```

| Dosya | Görev |
|---|---|
| `manifest.json` | MV3 tanımı: popup, service worker, içerik betikleri (`all_frames`, `document_idle`), `web_accessible_resources` (panel CSS) |
| `background.js` | Service worker: çerçevelerden gelen veriyi sırayla birleştirip saklar, üst çerçeveye bildirir |
| `content.js` | Her çerçevede: sayfa türünü tanı, ayrıştır, gönder; kayıt tablosunu işaretle; üst çerçevede paneli kur |
| `lib/obs-parsers.js` | OBS sayfa ayrıştırıcıları (`KayitOBS`), yapı notları: `research/obs/OBS-YAPI.md` |
| `lib/obs-parsers-more.js` | Ek sayfalar: Devamsızlık, Not Listesi, Sınav Takvimi, kişisel Ders Programı, Akademik Takvim, oturum sayacı |
| `lib/ka-more.js` | Devamsızlık analizi, not hesabı (Bologna ağırlıkları), takvim olayları, "Yaklaşan" (`KayitMore`) |
| `lib/ics.js` | iCalendar üretici (`KayitICS`): CRLF, 75 oktet katlama, VTIMEZONE, RRULE/UNTIL, VALARM |
| `lib/weights.js` | Bologna değerlendirme ağırlıkları (build betiği `research/obs/bologna-weights.json`'dan üretir) |
| `lib/kayit-core.js` | Ortak kural motoru (`KayitCore`) — web uygulamasıyla paylaşılır |
| `lib/ka-model.js` | Eklenti modeli (`KayitExt`): şube birleştirme, öğrenci modeli, kontrol, plan, yol haritası seçenekleri |
| `lib/panel.js`, `panel.css` | Yan panel (Shadow DOM; OBS stilleriyle karışmaz) |
| `lib/roadmap-view.js`, `lib/roadmap.css` | Yol haritası görünümü — web uygulamasıyla ortak |
| `lib/panel-i18n.js` | Eklentiye özgü TR/EN metinler; ortak metinler `lib/i18n.js` |
| `lib/data.js`, `lib/i18n.js` | Web uygulamasından kopya (build betiği): Yaşar ME bilgi paketi ve metinler |
| `popup.html/js/css` | Araç çubuğu penceresi: özet, en erken mezuniyet, panel aç, demo, veri sil |
| `dev/` | Yalnızca geliştirme: `?dev=1` yükleyicisi ve `chrome.*` taklidi (zip'e girmez) |
| `tests/test.html` | Tarayıcı içi birim testleri (zip'e girmez) |

**Öğrenci modeli** OBS Müfredat Durum'dan kurulur: ders kodları, AKTS, yarıyıl, Z/S (zorunlu/seçmeli), geçti/kaldı/devam ediyor ve notlar; alınan kod müfredat kodundan farklıysa eşdeğer ders olarak eşlenir (ör. SE 1115 → ENGR 1115). Program **Makine Mühendisliği** ise `data.js` bilgi paketi eklenir: gerçek ön koşullar, ME 4910 özel şartı, İngilizce adlar. GNO, kazanılan AKTS ve sınıf müfredat özetinden; dönem AKTS limiti varsa OBS'nin `Table5` alanından okunur.

**Varsayım:** tamamlanan yarıyıl sayısı ≈ `(sınıf − 1) × 2 + (dönem Bahar ise 1)` alınır (statü kuralı 2. dönem sonundan itibaren uygulandığı için). Sınıf bilinmiyorsa notu kesinleşmiş derslerin alındığı farklı dönem sayısı kullanılır. Panelin Durum sekmesi bu varsayımı ve sonucunu (statü, limit) gösterir.

**Şubeler** Bölüm Ders Programı'nın saatlik satırlarından (her satır 50 dk) bloklara birleştirilir; aynı dönemin tüm sınıf sayfaları birleştirilir ve iki sayfada görünen aynı şube tek kez sayılır.

## Sınırlamalar

- **Kayıt açıkken kullanılan ders seçim sayfası gözlemlenemedi** (incelemede kayıt dönemi kapalıydı). Kontrol, kayıt özeti sayfası `ders_kayit_ozet.aspx` (`table#grdDersKayit`) üzerinden yapılır; seçim sayfası farklı bir DOM kullanıyorsa orada işaretleme yapılmaz (panelin Planla sekmesi yine çalışır).
- **Ön koşul bilgisi yalnızca Yaşar Makine Mühendisliği için var.** Diğer programlarda çakışma, AKTS limiti, tekrar dersi, plan ve yol haritası (müfredat yarıyılları + Güz/Bahar kuralıyla) çalışır; ön koşul ve özel şart uyarısı verilmez.
- **Kontenjan** OBS'de herkese açık değil: kayıt günü "Dolu" işaretini sen koyarsın. Derslik kapasitesi kontenjan değildir.
- Kurallar Yaşar Üniversitesi Önlisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği'ne göredir; kesin karar için danışmanına ve OBS'nin kendi uyarılarına bak.
- **Devamsızlık:** OBS sayfası toplam devamsızlığı gösterir, teorik/uygulama ayrımını göstermez; toplam temkinli olarak teorik sınırla karşılaştırılır (teorik+uygulama toplam sınırı da gösterilir). Teorik saati olmayan derste uygulama sınırı kullanılır.
- **Not hesabı tahmindir:** ağırlıklar Bologna sayfasındandır (dersin hocası farklı uygulayabilir); harf notu sabit aralıkla verilmediği için eşikler düzenlenebilir varsayımlardır. 14 haftalık lab gibi çok kalemli bileşenler OBS'de tek toplu not olarak görüldüğünde tek kalem sayılır. Bekleyen diğer kalemler şimdiki ortalamayla varsayılır.
- **Sınav Takvimi'nin dolu hali gerçek OBS'de görülemedi:** ayrıştırıcı geneldir (satırda ders kodu + gg.aa.yyyy tarih + SS:DD saat + tür/derslik arar). Dönem aralığı (ders başlangıç/bitiş) akademik takvimde yazmadığı için "Ara Sınav Not Giriş" → "Yarıyıl Sınavı Not Giriş" başlangıçlarından tahmin edilir; Takvim sekmesinde düzeltilebilir.
- Seçici değişikliği: Proliz OBS sayfa yapısı değişirse ayrıştırıcıların (`lib/obs-parsers.js`) güncellenmesi gerekir.

## Demo (eklentiyi kurmadan)

`kayit-asistani/demo-obs/` gerçek OBS'nin DOM yapısını taklit eden kurgusal bir kopyadır (öğrenci kurgusal, ders programı gerçek). Adrese `?dev=1` eklenince sayfalar `extension/dev/loader.js`'i yükler; bu dosya `chrome.*` API'lerini taklit eder (`dev/chrome-shim.js`: depolama = üst pencerenin `localStorage`'ı, mesajlaşma = üst çerçevedeki taklit arka plan) ve `manifest.json`'daki içerik betiklerini **aynı sırayla** yükler. Böylece tam eklenti deneyimi kurulum olmadan denenebilir:

- Çevrimiçi: <https://boraykaskavalci.github.io/kayit-asistani/demo-obs/?dev=1>
- Yerelde: `python3 kayit-asistani/tools/dev_server.py 8766` → <http://localhost:8766/demo-obs/?dev=1>
- Açılır pencere önizlemesi (aynı sunucuda): `extension/dev/popup-dev.html`

Demo akışı: soldaki menüden **Bölüm Ders Programı** (Sınıf 1→4), **Müfredat Durum**, **Açılan Bölüm Dersleri**, **Ders Kayıt**; ardından **Devamsızlık Durumu**, **Not Listesi**, **Ders Programı**, **Sınav Takvimi**, **Akademik Takvim**. Oturum uyarısını hızlı görmek için adrese `&fastsession=1` ekle (sayaç 5:20'den başlar). Demo kaydı bilerek sorunludur: ME 3320(1) ↔ ENGR 4411(1) çakışması, EEE 3718 ön koşul ihlali (MATH 2263 F), ME 4910 özel şartı, AKTS 37/32 ve kayıtta olmayan MATH 2230 tekrarı.

Gerçek eklenti yüklüyken bir demo sayfası `?dev=1` ile açılırsa eklenti çekilir, yalnızca demo yükleyicisi çalışır (çift panel olmaz).

## Testler

`extension/tests/test.html` dosyasını yerel sunucuda aç (ör. <http://localhost:8766/extension/tests/test.html>): ayrıştırıcılar demo OBS sayfalarında (gizli iframe), çekirdek (kayıt kontrolü, şube birleştirme — `research/obs` örnek satırlarıyla, yol haritası doğrulaması) ek sayfa ayrıştırıcıları (devamsızlık sınırı metni, not kartları, görülmemiş tablo biçimli sınav takvimi dahil), devamsızlık/not hesabı, **.ics üreticisi** (CRLF, ≤75 oktet katlama, BEGIN/END dengesi, RRULE UNTIL, VALARM, tüm gün DTEND) ve eklenti modeli (plan, Plan B, "Dolu", başka program, müfredatsız durum) sınanır; sayfa üstünde geçti/kaldı sayısı görünür.
