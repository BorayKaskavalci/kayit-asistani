# Kayıt Asistanı

**OBS ders kaydı için akıllı yardımcı** - Yaşar Üniversitesi Makine Mühendisliği öğrencisi örneği üzerinden hazırlanmış, TR/EN dilli, tamamen statik (HTML + CSS + vanilla JS) bir ders kayıt yardımcısı. GenAI dersi dönem ödevidir.

> **Veri durumu özeti:** Müfredat, **ön koşullar** ve **2026-2027 Güz ders programı gerçektir** (Yaşar Üniv. Makine Mühendisliği). **Kontenjan simülasyondur** (OBS'de herkese açık değil) ve öğrenci **kurgusaldır**. Resmi OBS ile bağlantısı yoktur.

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

- **1. Ders Seç & Program** - aranabilir/filtrelenebilir ders listesi, sepet, haftalık program (Pzt-Cum 08:40-18:40), kırmızı çakışma uyarısı ("ME 3310 ile ... Salı 13:40'ta çakışıyor"), dönem yük sınırı uyarısı, şubenin üzerine gelince programda önizleme.
- **2. Ön Koşul & Kontenjan** - "Alabileceğim dersler", sepet kontrolü ve tek ders inceleme. Ön koşul sağlandı/sağlanmadı (eksik mi, başarısız mı), kontenjan çubuğu (dolu / az kaldı / müsait), alternatif şubeler, "bu dersi geçersen / kalırsan" ipuçları.
- **3. Mezuniyet Takibi** - 240 AKTS ilerlemesi, zorunlu dersler, 4 alan + 2 kısıtlı seçmeli, tekrar edilecek dersler, GNO ≥ 2,00 koşulu, "bu dönem alırsan" projeksiyonu.
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
| `data.js` | Katalog, kurallar, öğrenci profili, grup üyeleri |
| `i18n.js` | TR/EN arayüz metinleri |

## Ekran açıklaması

1. **Ders Seç & Program:** solda ders listesi, sağda sepet, haftalık program ve program tercihleri/üretici.
2. **Ön Koşul & Kontenjan:** üstte üç görünüm düğmesi (alabileceğim dersler / sepet kontrolü / ders incele).
3. **Mezuniyet Takibi:** özet kartlar, genel ilerleme çubuğu, tekrar edilecek dersler, zorunlu ve seçmeli ilerleme.
4. **Danışman Onayı:** adım göstergesi, kontrol listesi, mesaj özeti ve simüle danışman yanıtı.
5. **Kayıt Günü Planı:** geri sayım, giriş sırası, "doluysa" kuralları, Plan A/B/C mini programları, kopyala ve yazdır.

## İleride

- Gerçek OBS entegrasyonu (ders programı, kontenjan ve transkript verisini canlı çekme; kayıt gününde otomatik uyarı).
- Resmi müfredat görselinden/OBS ders bilgi paketlerinden **doğrulanmış ön koşul** ve seçmeli havuzu.
- Ders/hoca değerlendirmeleri ve iş yükü bilgisi ile program önerisi; yapay zekâ destekli danışman sohbeti.
- Danışmana gerçek e-posta/bildirim, birden çok bölüm ve çift anadal desteği.
- Takvim (iCal) dışa aktarımı.

## Grup üyeleri

<!-- Aynı listeyi data.js içindeki meta.group dizisine de yazın (alt bilgide görünür). -->

- Üye 1 (ad soyad - öğrenci no)
- Üye 2 (ad soyad - öğrenci no)
- Üye 3 (ad soyad - öğrenci no)

Ders: GenAI - Öğretim görevlisi: (yazınız)
