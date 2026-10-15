/* =====================================================================
   Kayıt Asistanı - VERİ DOSYASI (Yaşar Üniversitesi, Makine Mühendisliği)
   ---------------------------------------------------------------------
   Uygulamanın TÜM katalog / kural / öğrenci verisi burada durur.
   app.js içinde ders kodu, AKTS limiti, not eşiği gibi sabit YOKTUR.

   VERİ KAYNAKLARI
   - Müfredat + AKTS + dönem: OBS Bologna, 2025-2026 Makina Mühendisliği müfredatı
     https://obs.yasar.edu.tr/oibs/bologna/progCourses.aspx?lang=tr&curSunit=401166
   - ÖN KOŞULLAR (gerçek, prereqVerified:true): bölüm diyagramı
     https://me.yasar.edu.tr/mufredat-ve-onkosul-iliskileri/
     ME 4910 özel şartı: >=150 AKTS tamamlanmış + 1-4. yarıyıl zorunluları geçilmiş (rules.specialPrereqs)
   - 2026-2027 GÜZ ders programı (gerçek şube/saat/derslik): bölüm xlsx duyurusu
     https://me.yasar.edu.tr/2026/09/07/2026-2027-guz-donemi-ders-programi/
   - Kurallar: Yaşar Üniversitesi Önlisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği (mevzuat.gov.tr)
   GERÇEK OLMAYAN KISIMLAR
   - Kontenjan (capacity/enrolled): herkese açık değil -> SİMÜLE. Arayüzde "simüle kontenjan"
     etiketi var; kullanıcı bir şubeyi elle "DOLU" işaretleyebilir.
   - Öğrenci profili KURGUSALDIR. Hoca adları kaynakta yok (alan yok).
   - Seçmeli ders havuzu: çizelgede yalnızca kod görünüyor; adlar/AKTS bilinmiyor (6 AKTS varsayıldı).

   ŞUBE ÇIKARIM NOTLARI (xlsx metninden; belirsizlikte makul yorum)
   - "MATH1131 S2" / "ENGR 1115.2 Y314" / "PHYS 1121 5 Z22" = o numaralı şube; derslik sonda.
   - "X.9//10" veya "S2//S4" = bloğu 9 ve 10 (2 ve 4) numaralı şubeler birlikte kullanır.
   - Bir şube = o numarayı içeren TÜM blokların birleşimi (ders + o şubenin lab bloğu).
   - Numarasız blok (ör. "EEE 2280" Cuma, "ME 2210 M534") o dersin TÜM şubelerine eklenir;
     hiç numarası olmayan ders tek şube sayılır.
   - PHYS 1121 (17 grup): "PHYS 1121 <grup> Z22" = grubun teori bloğu, "PHYS 1121.<g1>//<g2> M###"
     = lab bloğu (iki grup ortak). Her grubun teorisi 1-2 blok; grup = teori + lab birleşimi.
   - Farklı yıl sayfalarında tekrar eden aynı bloklar (MATH 2230 S1, ME 2320, MATH 2263) tek sayıldı.
   - "ESE-ME 4910" -> ME 4910. SE 1105 (servis dersi) alınmadı.
   - UMFD/HIST/TURK/ISG/UFND (uzaktan), SOFL (YDYO) ve ME 4830 Staj bölüm çizelgesinde yok:
     saatsiz tek şube (simüle) olarak eklendi; Güz'de açılmayan (Bahar) dersler şubesizdir.

   Şema
   meta         { university, faculty, department, term{tr,en}, group[] }
   rules        { sources[], source{}, limit{}, specialPrereqs{}, gradePoints, passingGrades, failGrades,
                  improvableGrades, retakeOverlapGrades, timetable, quota, graduation, info[] }
   courses[]    { code, nameTr, nameEn, tul[T,U,L], ects, credits, type:"zorunlu"|"seçmeli",
                  cat ("bolum"|"univ" seçmeli ise), semester, prereq[], prereqVerified, delivery?, note?{tr,en},
                  sections[{no, times[], room, capacity, enrolled}] }   (sections boşsa bu dönem açılmaz)
   student      { name, no, advisor, completedSemesters, completed[{code,grade,term}] }
   requirements { totalEcts, required[kod], electives[{key,name{tr,en},ects,slots}] }
   ===================================================================== */
(function () {
  var sec = function (no, times, room, capacity, enrolled) {
    return { no: no, times: times, room: room, capacity: capacity, enrolled: enrolled };
  };
  /* C(kod, adTR, adEN, [T,U,L], AKTS, dönem, önkoşullar, ekstra, şubeler) */
  var C = function (code, tr, en, tul, ects, semester, prereq, extra, sections) {
    var c = {
      code: code, nameTr: tr, nameEn: en, tul: tul, ects: ects,
      credits: tul[0] + tul[1] / 2,           /* YU kredisi = T + U/2 (yönetmelik; türetilmiş) */
      type: "zorunlu", semester: semester, prereq: prereq || [], sections: sections || []
    };
    for (var k in (extra || {})) c[k] = extra[k];
    c.prereqVerified = true;                   /* diyagramdan alınan gerçek önkoşullar */
    return c;
  };

  var courses = [
    C("ENGR 1115", "Programlamaya Giriş", "Introduction to Programming", [2, 2, 0], 5, 1, [], null,
      [sec(1, ["Sal 10:40-12:30", "Çar 08:40-10:30"], "Y314 · M110", 40, 27),
         sec(2, ["Sal 08:40-10:30", "Cum 08:40-10:30"], "Y314 · M114", 40, 22),
         sec(3, ["Sal 12:40-14:30", "Per 08:40-10:30"], "Y314 · M114", 40, 36),
         sec(4, ["Pzt 09:40-11:30", "Cum 10:40-12:30"], "Y314 · M114", 40, 27),
         sec(5, ["Pzt 11:40-13:30", "Per 10:40-12:30"], "Y314 · M114", 40, 28),
         sec(6, ["Pzt 13:40-15:30", "Çar 11:40-13:30"], "Y314 · M218", 40, 29)]),
    C("MATH 1100", "Matematiksel Mantık", "Mathematical Logic", [2, 2, 0], 5, 1, [], null,
      [sec(1, ["Sal 12:40-14:30", "Cum 14:40-16:30"], "Y007", 35, 27),
         sec(2, ["Pzt 11:40-13:30", "Sal 14:40-16:30"], "Y007", 35, 24),
         sec(3, ["Pzt 11:40-13:30", "Per 10:40-12:30"], "Y007", 35, 31),
         sec(4, ["Per 12:40-14:30", "Cum 16:40-18:30"], "Y007", 35, 21),
         sec(5, ["Per 14:40-16:30", "Cum 16:40-18:30"], "Y007", 35, 19),
         sec(6, ["Pzt 13:40-15:30", "Per 16:40-18:30"], "M114", 35, 29),
         sec(7, ["Pzt 15:40-17:30", "Per 16:40-18:30"], "M114", 35, 20)]),
    C("MATH 1131", "Analiz I", "Calculus I", [3, 2, 0], 7, 1, [], null,
      [sec(1, ["Sal 10:40-12:30", "Çar 08:40-11:30"], "", 45, 40),
         sec(2, ["Sal 08:40-10:30", "Çar 13:40-16:30"], "", 45, 19),
         sec(3, ["Sal 12:40-15:30", "Per 08:40-10:30"], "", 45, 19),
         sec(4, ["Çar 08:40-11:30", "Per 10:40-12:30"], "", 45, 29),
         sec(5, ["Çar 13:40-16:30", "Per 14:40-16:30"], "", 45, 20),
         sec(6, ["Çar 08:40-11:30", "Per 13:40-15:30"], "", 45, 33),
         sec(7, ["Çar 13:40-16:30", "Cum 08:40-10:30"], "", 45, 40),
         sec(8, ["Per 08:40-11:30", "Cum 10:40-12:30"], "", 45, 21)]),
    C("PHYS 1121", "Fizik I", "Physics I", [3, 2, 0], 7, 1, [], null,
      [sec(1, ["Sal 10:40-13:30", "Çar 09:40-11:30"], "M115/M528 · Z22", 36, 20),
         sec(2, ["Sal 10:40-13:30", "Per 12:40-14:30"], "M115/M528 · Z22", 36, 22),
         sec(3, ["Sal 09:40-12:30", "Per 10:40-12:30"], "M115 · Z22", 36, 23),
         sec(4, ["Sal 09:40-12:30", "Cum 14:40-16:30"], "M115 · Z22", 36, 32),
         sec(5, ["Sal 14:40-17:30", "Per 08:40-10:30"], "M534 · Z22", 36, 32),
         sec(6, ["Sal 14:40-17:30", "Cum 14:40-16:30"], "M534 · Z22", 36, 17),
         sec(7, ["Sal 14:40-17:30", "Per 16:40-18:30"], "M528 · Z22", 36, 18),
         sec(8, ["Sal 14:40-17:30", "Cum 12:40-14:30"], "M528 · Z22", 36, 25),
         sec(9, ["Çar 08:40-11:30", "Per 14:40-16:30"], "M528 · Z22", 36, 26),
         sec(10, ["Çar 08:40-11:30", "Cum 12:40-14:30"], "M528 · Z22", 36, 29),
         sec(11, ["Çar 14:40-17:30", "Cum 08:40-10:30"], "M528 · Z22", 36, 24),
         sec(12, ["Çar 14:40-17:30", "Per 12:40-14:30"], "M528 · Z22", 36, 19),
         sec(13, ["Çar 11:40-14:30", "Cum 10:40-12:30"], "M115 · Z22", 36, 28),
         sec(14, ["Sal 10:40-13:30", "Çar 11:40-13:30"], "M113 · Z22", 36, 19),
         sec(15, ["Sal 10:40-13:30", "Çar 15:40-17:30"], "M113 · Z22", 36, 25),
         sec(16, ["Sal 14:40-17:30", "Çar 13:40-15:30"], "M113 · Z22", 36, 24),
         sec(17, ["Sal 14:40-17:30", "Çar 15:40-17:30"], "M113 · Z22", 36, 19)]),
    C("SOFL 1101", "Akademik İngilizce I", "Academic English I", [4, 0, 0], 4, 1, [], { delivery: "ydyo", note: { tr: "Yabancı Diller Yüksekokulu dersi: bölüm ders programında yer almaz; şube/kontenjan simüledir.", en: "School of Foreign Languages course: not in the department timetable; section and quota are simulated." } },
      [sec(1, [], "YDYO", 300, 191)]),
    C("UMFD 1020", "Eleştirel ve Analitik Düşünmenin Temelleri", "Foundations of Critical and Analytical Thinking", [2, 0, 0], 2, 1, [], { delivery: "online", note: { tr: "Uzaktan ders: bölüm ders programında yer almaz; şube/kontenjan simüledir.", en: "Distance course: not in the department timetable; section and quota are simulated." } },
      [sec(1, [], "Uzaktan", 300, 135)]),
    C("CHEM 1130", "Mühendislik Kimyası", "Engineering Chemistry", [3, 2, 0], 6, 2, [], null,
      []),
    C("MATH 1132", "Analiz II", "Calculus II", [3, 2, 0], 7, 2, ["MATH 1131"], null,
      [sec(1, ["Pzt 08:40-11:30", "Sal 13:40-15:30"], "", 45, 43),
         sec(2, ["Pzt 13:40-16:30", "Çar 12:40-14:30"], "", 45, 45),
         sec(3, ["Sal 08:40-11:30", "Çar 14:40-16:30"], "", 45, 40)]),
    C("ME 1110", "Makine Mühendisliğine Giriş", "Introduction to Mechanical Engineering", [2, 0, 0], 2, 2, [], null,
      []),
    C("PHYS 1122", "Fizik II", "Physics II", [3, 2, 0], 7, 2, [], null,
      []),
    C("SOFL 1102", "Akademik İngilizce II", "Academic English II", [4, 0, 0], 4, 2, ["SOFL 1101"], null,
      []),
    C("UMFD 1120", "Girişimciliğin Temelleri", "Foundations of Entrepreneurship", [2, 0, 0], 2, 2, [], { delivery: "online", note: { tr: "Uzaktan ders: bölüm ders programında yer almaz; şube/kontenjan simüledir.", en: "Distance course: not in the department timetable; section and quota are simulated." } },
      [sec(1, [], "Uzaktan", 300, 269)]),
    C("UMFD 1220", "Tasarım Odaklı Düşünmenin Temelleri", "Foundations of Design Thinking", [2, 0, 0], 2, 2, [], { delivery: "online", note: { tr: "Uzaktan ders: bölüm ders programında yer almaz; şube/kontenjan simüledir.", en: "Distance course: not in the department timetable; section and quota are simulated." } },
      [sec(1, [], "Uzaktan", 300, 270)]),
    C("EEE 2280", "Elektrik Devreleri ve Sistemleri", "Electric Circuits and Systems", [3, 2, 0], 7, 3, [], null,
      [sec(1, ["Sal 11:40-13:30", "Cum 12:40-15:30"], "M535", 45, 40),
         sec(2, ["Sal 13:40-15:30", "Cum 12:40-15:30"], "M535", 45, 35)]),
    C("ENGR 2120", "Bilgisayar Destekli Modellemeye Giriş", "Introduction to Computer-Aided Modeling", [2, 2, 0], 5, 3, [], null,
      [sec(1, ["Pzt 08:40-10:30", "Çar 10:40-12:30"], "M434", 35, 28),
         sec(2, ["Pzt 10:40-12:30", "Çar 08:40-10:30"], "M434", 35, 26)]),
    C("HIST 1110", "Atatürk İlkeleri ve İnkılap Tarihi I", "Principles of Atatürk and History of the Turkish Revolution I", [2, 0, 0], 2, 3, [], { delivery: "online", note: { tr: "Uzaktan ders: bölüm ders programında yer almaz; şube/kontenjan simüledir.", en: "Distance course: not in the department timetable; section and quota are simulated." } },
      [sec(1, [], "Uzaktan", 300, 146)]),
    C("ISG 9110", "İş Sağlığı ve Güvenliği I", "Occupational Health and Safety I", [2, 0, 0], 2, 3, [], { delivery: "online", note: { tr: "Uzaktan ders: bölüm ders programında yer almaz; şube/kontenjan simüledir.", en: "Distance course: not in the department timetable; section and quota are simulated." } },
      [sec(1, [], "Uzaktan", 300, 255)]),
    C("ISG 9210", "İş Sağlığı ve Güvenliği II", "Occupational Health and Safety II", [2, 0, 0], 2, 3, [], { delivery: "online", note: { tr: "Uzaktan ders: bölüm ders programında yer almaz; şube/kontenjan simüledir.", en: "Distance course: not in the department timetable; section and quota are simulated." } },
      [sec(1, [], "Uzaktan", 300, 233)]),
    C("ME 2210", "Mühendislik Mekaniği I", "Engineering Mechanics I", [2, 2, 0], 6, 3, [], null,
      [sec(1, ["Pzt 13:40-15:30", "Cum 08:40-10:30"], "M534", 45, 35)]),
    C("ME 2710", "Malzeme Bilimi", "Materials Science", [2, 2, 0], 4, 3, [], null,
      [sec(1, ["Pzt 16:40-18:30", "Sal 15:40-17:30"], "Y007 · M115", 45, 32)]),
    C("TURK 1110", "Türk Dili I", "Turkish Language I", [2, 0, 0], 2, 3, [], { delivery: "online", note: { tr: "Uzaktan ders: bölüm ders programında yer almaz; şube/kontenjan simüledir.", en: "Distance course: not in the department timetable; section and quota are simulated." } },
      [sec(1, [], "Uzaktan", 300, 195)]),
    C("HIST 1210", "Atatürk İlkeleri ve İnkılap Tarihi II", "Principles of Atatürk and History of the Turkish Revolution II", [2, 0, 0], 2, 4, [], { delivery: "online", note: { tr: "Uzaktan ders: bölüm ders programında yer almaz; şube/kontenjan simüledir.", en: "Distance course: not in the department timetable; section and quota are simulated." } },
      [sec(1, [], "Uzaktan", 300, 261)]),
    C("MATH 2230", "Mühendislikte Hesaplama Yöntemleri", "Computational Methods in Engineering", [2, 2, 0], 6, 4, [], null,
      [sec(1, ["Sal 08:40-10:30", "Cum 10:40-12:30"], "", 50, 48)]),
    C("MATH 2263", "Diferansiyel Denklemler ve Dinamik Sistemler", "Differential Equations and Dynamical Systems", [3, 2, 0], 7, 4, ["MATH 1131"], null,
      [sec(1, ["Pzt 14:40-16:30", "Çar 13:40-16:30"], "M433", 40, 29),
         sec(2, ["Çar 08:40-10:30", "Çar 13:40-16:30"], "M433", 40, 38),
         sec(3, ["Çar 10:40-12:30", "Per 08:40-11:30"], "M433", 40, 30),
         sec(4, ["Çar 08:40-10:30", "Per 08:40-11:30"], "M433", 40, 40)]),
    C("ME 2220", "Malzemelerin Mekaniği", "Mechanics of Materials", [3, 2, 0], 6, 4, ["ME 2210"], null,
      []),
    C("ME 2320", "Termodinamik", "Thermodynamics", [3, 2, 0], 6, 4, [], null,
      [sec(1, ["Sal 12:40-15:30", "Per 12:40-14:30"], "M109 · M216", 45, 38)]),
    C("TURK 1210", "Türk Dili II", "Turkish Language II", [2, 0, 0], 2, 4, [], { delivery: "online", note: { tr: "Uzaktan ders: bölüm ders programında yer almaz; şube/kontenjan simüledir.", en: "Distance course: not in the department timetable; section and quota are simulated." } },
      [sec(1, [], "Uzaktan", 300, 184)]),
    C("UFND 7010", "Sosyal Sorumluluk", "Social Responsibility", [0, 2, 0], 1, 4, [], { delivery: "online", note: { tr: "Uzaktan ders: bölüm ders programında yer almaz; şube/kontenjan simüledir.", en: "Distance course: not in the department timetable; section and quota are simulated." } },
      [sec(1, [], "Uzaktan", 300, 168)]),
    C("EEE 3718", "Geri Besleme Sistemleri", "Feedback Systems", [3, 2, 0], 6, 5, ["MATH 2263"], null,
      [sec(1, ["Pzt 10:40-13:30", "Per 09:40-11:30"], "M528 · M433", 40, 40),
         sec(2, ["Sal 11:40-14:30", "Per 11:40-13:30"], "M534 · M433", 40, 28)]),
    C("ENGR 3450", "Proje Yönetimi", "Project Management", [3, 0, 0], 5, 5, [], null,
      [sec(1, ["Çar 14:40-17:30"], "", 45, 45),
         sec(2, ["Çar 14:40-17:30"], "", 45, 35),
         sec(3, ["Per 14:40-17:30"], "", 45, 25),
         sec(4, ["Per 14:40-17:30"], "", 45, 31)]),
    C("ME 3220", "Mühendislik Mekaniği II", "Engineering Mechanics II", [2, 2, 0], 5, 5, ["ME 2210"], null,
      [sec(1, ["Sal 08:40-10:30", "Cum 12:40-14:30"], "M528", 45, 43)]),
    C("ME 3320", "Isı ve Kütle Transferi", "Heat and Mass Transfer", [3, 2, 0], 6, 5, [], null,
      [sec(1, ["Pzt 13:40-16:30", "Cum 08:40-10:30"], "M113 · M528", 45, 43),
         sec(2, ["Çar 10:40-13:30", "Cum 14:40-16:30"], "M534", 45, 40)]),
    C("ME 3420", "Üretim Yöntemleri ve Prosesleri", "Manufacturing Methods and Processes", [2, 2, 0], 4, 5, ["ME 2710"], null,
      [sec(1, ["Çar 08:40-10:30", "Cum 10:40-12:30"], "M534", 45, 27)]),
    C("MATH 2260", "Mühendisler İçin Olasılık ve İstatistik", "Probability and Statistics for Engineers", [3, 2, 0], 6, 6, [], null,
      [sec(1, ["Pzt 08:40-11:30", "Çar 14:40-16:30"], "", 50, 32),
         sec(2, ["Pzt 13:40-16:30", "Per 08:40-10:30"], "", 50, 40),
         sec(3, ["Çar 08:40-11:30", "Per 10:40-12:30"], "", 50, 45)]),
    C("ME 3330", "Akışkanlar Mekaniği ve Makinaları", "Fluid Mechanics and Machinery", [3, 2, 0], 6, 6, [], null,
      []),
    C("ME 3410", "Makina Elemanları", "Machine Elements", [2, 2, 0], 6, 6, ["ME 2220"], null,
      []),
    C("ME 3510", "Makine Teorisi ve Mekanizmalar", "Theory of Machines and Mechanisms", [2, 2, 0], 6, 6, ["ME 2210"], null,
      []),
    C("ENGR 4400", "Mühendislik Etiği ve Seminer", "Engineering Ethics and Seminar", [0, 2, 0], 2, 7, [], null,
      [sec(1, ["Sal 10:40-12:30"], "C.H X001", 60, 44),
         sec(2, ["Çar 10:40-12:30"], "C.H X001", 60, 41)]),
    C("ENGR 4411", "Sürdürülebilir Kalkınma için Mühendislik", "Engineering for Sustainable Development", [1, 1, 0], 3, 7, [], null,
      [sec(1, ["Pzt 13:40-15:30"], "", 45, 39)]),
    C("ME 4910", "Mezuniyet Tasarım Projesi I", "Graduation Design Project I", [1, 4, 0], 8, 7, [], null,
      [sec(1, ["Per 12:40-13:30"], "M534", 45, 25)]),
    C("UMFD 1720", "Kariyer Planlama", "Career Planning", [2, 0, 0], 2, 7, [], { delivery: "online", note: { tr: "Uzaktan ders: bölüm ders programında yer almaz; şube/kontenjan simüledir.", en: "Distance course: not in the department timetable; section and quota are simulated." } },
      [sec(1, [], "Uzaktan", 300, 254)]),
    C("ME 4830", "Staj", "Internship", [0, 0, 0], 4, 7, ["ISG 9110"], { delivery: "staj", note: { tr: "Staj: ders saati yoktur; çakışma hesaplanmaz.", en: "Internship: no class hours, so no timetable conflicts." } },
      [sec(1, [], "Staj", 300, 251)]),
    C("ME 4920", "Mezuniyet Tasarım Projesi II", "Graduation Design Project II", [1, 4, 0], 8, 8, ["ME 4910"], null,
      []),
    C("ME 4610", "Bölüm Seçmeli (ME 4610)", "Department Elective (ME 4610)", [3, 0, 0], 6, 7, [], { type: "seçmeli", cat: "bolum", note: { tr: "Ders adı/AKTS kaynakta yok: bölüm seçmeli olarak gösterilir (AKTS 6 varsayıldı).", en: "Course name/ECTS not published in the source: shown as a department elective (6 ECTS assumed)." } },
      [sec(1, ["Sal 08:40-11:30"], "M531", 30, 24)]),
    C("ME 4330", "Bölüm Seçmeli (ME 4330)", "Department Elective (ME 4330)", [3, 0, 0], 6, 7, [], { type: "seçmeli", cat: "bolum", note: { tr: "Ders adı/AKTS kaynakta yok: bölüm seçmeli olarak gösterilir (AKTS 6 varsayıldı).", en: "Course name/ECTS not published in the source: shown as a department elective (6 ECTS assumed)." } },
      [sec(1, ["Per 08:40-11:30"], "M527", 30, 16)]),
    C("ME 4240", "Bölüm Seçmeli (ME 4240)", "Department Elective (ME 4240)", [3, 0, 0], 6, 7, [], { type: "seçmeli", cat: "bolum", note: { tr: "Ders adı/AKTS kaynakta yok: bölüm seçmeli olarak gösterilir (AKTS 6 varsayıldı).", en: "Course name/ECTS not published in the source: shown as a department elective (6 ECTS assumed)." } },
      [sec(1, ["Sal 12:40-15:30"], "M527", 30, 27)]),
    C("ME 4340", "Bölüm Seçmeli (ME 4340)", "Department Elective (ME 4340)", [3, 0, 0], 6, 7, [], { type: "seçmeli", cat: "bolum", note: { tr: "Ders adı/AKTS kaynakta yok: bölüm seçmeli olarak gösterilir (AKTS 6 varsayıldı).", en: "Course name/ECTS not published in the source: shown as a department elective (6 ECTS assumed)." } },
      [sec(1, ["Per 14:40-17:30"], "M531", 30, 18)]),
    C("ESE 4112", "Bölüm Seçmeli (ESE 4112)", "Department Elective (ESE 4112)", [3, 0, 0], 6, 7, [], { type: "seçmeli", cat: "bolum", note: { tr: "Ders adı/AKTS kaynakta yok: bölüm seçmeli olarak gösterilir (AKTS 6 varsayıldı).", en: "Course name/ECTS not published in the source: shown as a department elective (6 ECTS assumed)." } },
      [sec(1, ["Sal 08:40-11:30"], "", 30, 23)]),
    C("ENGR 4451", "Üretken Yapay Zekâ", "Generative AI", [3, 0, 0], 6, 7, [], { type: "seçmeli", cat: "bolum", note: { tr: "Üretken Yapay Zekâ seçmeli dersi (AKTS 6 varsayıldı).", en: "Generative AI elective (6 ECTS assumed)." } },
      [sec(1, ["Cum 11:40-14:30"], "M531", 30, 30)])
  ];

  window.KAYIT_DATA = {
    meta: {
      university: "Yaşar Üniversitesi",
      faculty: "Mühendislik Fakültesi",
      department: "Makine Mühendisliği",
      term: { tr: "2026-2027 Güz", en: "2026-2027 Fall" },
      /* Grup üyeleri: TEK YERDEN düzenlenir (alt bilgide görünür; README'ye de aynısını yazın) */
      group: ["Üye 1 (ad soyad - öğrenci no)", "Üye 2 (ad soyad - öğrenci no)", "Üye 3 (ad soyad - öğrenci no)"]
    },

    rules: {
      source: {
        tr: "Yaşar Üniversitesi Önlisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği (RG 14/8/2016, sayı 29801; 22/2/2021 değişikliğine kadar)",
        en: "Yaşar University Regulation on Associate and Undergraduate Education, Teaching and Examinations (OG 14/8/2016, no. 29801; as amended up to 22/2/2021)",
        url: "https://mevzuat.gov.tr/File/GeneratePdf?mevzuatNo=22754&mevzuatTertip=5&mevzuatTur=UniversiteYonetmeligi"
      },
      /* Dönemlik yük sınırı. unit: "ects" (AKTS) veya "credits" (YU kredisi, T+U/2 türetilmiş).
         Yönetmelik m.22: ders yükü AKTS ile ifade edilir; bu yüzden varsayılan "ects". */
      limit: {
        unit: "ects",
        min: 20,
        statusFromCompletedSemesters: 2,    /* statüler 2. dönem sonundan itibaren uygulanır */
        firstYearMax: 30,                   /* ilk iki dönem (birim raporlarına göre; doğrulanmadı) */
        statuses: [
          { key: "basarili", label: { tr: "Başarılı (GNO ≥ 2,00)", en: "Good standing (GPA ≥ 2.00)" }, minGpa: 2.0, max: 40 },
          { key: "sinamali", label: { tr: "Sınamalı (GNO ≤ 1,99)", en: "On probation (GPA ≤ 1.99)" }, minGpa: 0, max: 32, prioritizeFailedRequired: true }
        ]
      },
      /* Yaşar harf notları (m.30). DC/DD/FD yoktur. */
      gradePoints: { "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7, "C+": 2.3, "C": 2.0, "C-": 1.7, "D+": 1.3, "D": 1.0, "F": 0 },
      passingGrades: ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D"],
      failGrades: ["F", "U", "NA"],
      improvableGrades: ["C-", "D+", "D"],         /* m.26: not yükseltmek için tekrar edilebilir */
      retakeOverlapGrades: ["F", "U"],             /* m.29(4): çakışma istisnası (NA hariç) */
      gpaDecimals: 2,                              /* m.21(5): 2 basamak, kesme */
      typicalSemesterEcts: 30,
      timetable: { days: ["Pzt", "Sal", "Çar", "Per", "Cum"], start: "08:40", end: "18:40" },
      quota: { lowAbsolute: 3, lowRatio: 0.1 },
      graduation: { totalEcts: 240, minGpa: 2.0 },
      prereqVerified: true,
      /* ME 4910 özel şartı (bölüm diyagramı dipnotu) */
      specialPrereqs: { "ME 4910": { minEcts: 150, requiredSemesters: [1, 2, 3, 4] } },
      sources: [
        { tr: "OBS Bologna - 2025-2026 Makina Mühendisliği müfredatı", en: "OBS Bologna - 2025-2026 Mechanical Engineering curriculum", url: "https://obs.yasar.edu.tr/oibs/bologna/progCourses.aspx?lang=tr&curSunit=401166" },
        { tr: "Bölüm: müfredat ve ön koşul ilişkileri", en: "Department: curriculum and prerequisite relations", url: "https://me.yasar.edu.tr/mufredat-ve-onkosul-iliskileri/" },
        { tr: "Bölüm: 2026-2027 Güz dönemi ders programı", en: "Department: 2026-2027 Fall timetable", url: "https://me.yasar.edu.tr/2026/09/07/2026-2027-guz-donemi-ders-programi/" }
      ],
      maxWithdrawals: 4,

      /* "Kurallar" panelinde gösterilir */
      info: [
        { ref: "m.22-24", tr: "Dönemlik ders yükü en az 20, en fazla 40 AKTS'dir. GNO ≥ 2,00 olan başarılı öğrenci en çok 40; GNO ≤ 1,99 olan sınamalı öğrenci en çok 32 AKTS alabilir. Statüler 2. dönem sonundan itibaren uygulanır.",
          en: "Semester load is at least 20 and at most 40 ECTS. Good-standing students (GPA ≥ 2.00) may take up to 40; students on probation (GPA ≤ 1.99) up to 32 ECTS. Standing applies after the end of the 2nd semester." },
        { ref: "m.24", tr: "Sınamalı öğrenci önce F, W, U veya NA aldığı zorunlu dersleri tekrar etmekle yükümlüdür.",
          en: "A student on probation must first retake the required courses in which they received F, W, U or NA." },
        { ref: "m.26", tr: "Zorunlu dersten F/U/W/NA alan, dersin açıldığı ilk dönemde öncelikle o derse kayıt olmak zorundadır. C-, D+ ve D notlu dersler not yükseltmek için tekrar edilebilir. Tekrarlanan derslerde son not GNO'ya girer.",
          en: "A student who fails a required course (F/U/W/NA) must enroll in it the first time it is offered. Courses graded C-, D+ or D may be retaken to improve the grade. The latest grade counts toward the GPA." },
        { ref: "m.29(3)-(4)", tr: "İlk kez alınan derslerin programları çakışamaz. Daha önce F veya U alınmış bir ders ilk kez alınacak bir dersle çakışıyorsa, F/U'lu derse yine de kayıt yapılabilir (devam aranmaz, tüm sınav/ödevlere girilir).",
          en: "First-time courses cannot overlap. A course previously failed (F or U) may overlap a first-time course; the repeat enrollment is still allowed (attendance not required, but all exams and assignments must be taken)." },
        { ref: "m.25", tr: "Ders ekleme-bırakma, akademik takvimdeki sürede ve danışman rehberliğinde yapılır. Zorunlu ders ancak başka bir zorunlu ders alınması koşuluyla bırakılabilir.",
          en: "Add/drop is done within the academic calendar dates under the advisor's guidance. A required course can be dropped only if another required course is taken." },
        { ref: "m.30(d)", tr: "Çekilme (W) için yazılı başvuru gerekir; lisans süresince en fazla 4 dersten çekilinebilir.",
          en: "Withdrawal (W) requires a written application; at most 4 courses can be withdrawn from during the degree." },
        { ref: "m.30", tr: "Geçer not en az D'dir. Harf katsayıları: A 4,00 · A- 3,70 · B+ 3,30 · B 3,00 · B- 2,70 · C+ 2,30 · C 2,00 · C- 1,70 · D+ 1,30 · D 1,00 · F 0.",
          en: "The minimum passing grade is D. Grade points: A 4.00 · A- 3.70 · B+ 3.30 · B 3.00 · B- 2.70 · C+ 2.30 · C 2.00 · C- 1.70 · D+ 1.30 · D 1.00 · F 0." },
        { ref: "m.34", tr: "Mezuniyet için 240 AKTS'nin tamamlanması ve GNO ≥ 2,00 gerekir.",
          en: "Graduation requires completing 240 ECTS and a GPA of at least 2.00." },
        { ref: "Bölüm / Dept.", tr: "ME 4910 için özel şart: en az 150 AKTS tamamlanmış olmalı ve 1-4. yarıyıldaki tüm zorunlu dersler geçilmiş olmalıdır.",
          en: "Special requirement for ME 4910: at least 150 ECTS completed and all required courses of semesters 1-4 passed." }
      ]
    },

    /* Senaryolar: "balanced" için yalnızca ders kodları (şubeleri uygulama çakışmasız seçer),
       "problem" için bilerek hatalı örnek sepet (şube kimlikleri: KOD#şubeNo). */
    scenarios: {
      balanced: { codes: ["MATH 2263", "MATH 2230", "ME 3220", "ME 3320", "ME 3420", "ENGR 4411"] },
      problem: { sections: ["MATH 2230#1", "MATH 2263#3", "ME 3220#1", "ME 3320#1", "ENGR 4411#1", "EEE 3718#1", "ME 4910#1", "ENGR 3450#1"] }
    },

    /* YaşarOBS+ "bu dönem" ekranları (KURGUSAL öğrenci). Kayıtlı dersler = "Dengeli dönem" senaryosunun
       çakışmasız şubeleri (uygulama hesaplar). Devamsızlık: kullanılan saat (teorik t / uygulama u).
       Notlar: girilmiş sınavlar; ağırlıklar OBS Bologna'dan (extension/lib/weights.js).
       Sınav ve akademik takvim tarihleri ÖRNEKTİR (gerçek takvim yayımlanınca OBS'den okunur). */
    current: {
      today: "2026-10-15",
      weeks: 14,
      absence: { theory: 0.30, practice: 0.20 },   /* m.29(2): teorik %70, uygulama %80 devam */
      attendance: {
        "MATH 2263": { t: 11, u: 2 }, "MATH 2230": { t: 2, u: 0 }, "ME 3220": { t: 6, u: 3 },
        "ME 3320": { t: 3, u: 0 }, "ME 3420": { t: 0, u: 1 }, "ENGR 4411": { t: 4, u: 1 }
      },
      grades: {
        "MATH 2263": [{ name: "Quiz 1", score: 45, classAvg: 58, date: "2026-10-09" }, { name: "Practice (Lab avg.)", score: 70, classAvg: 72, date: "2026-10-14" }],
        "MATH 2230": [{ name: "Homework 1", score: 55, classAvg: 68, date: "2026-10-07" }, { name: "Quiz 1", score: 40, classAvg: 61, date: "2026-10-12" }],
        "ME 3220": [],
        "ME 3320": [{ name: "Quiz 1", score: 60, classAvg: 59, date: "2026-10-06" }, { name: "Quiz 2", score: 55, classAvg: 57, date: "2026-10-13" }],
        "ME 3420": [{ name: "Quiz 1", score: 85, classAvg: 70, date: "2026-10-08" }],
        "ENGR 4411": []
      },
      exams: [
        { code: "ME 3320", type: "mid", date: "2026-11-09", start: "09:00", end: "11:00", room: "M113" },
        { code: "MATH 2263", type: "mid", date: "2026-11-10", start: "13:00", end: "15:00", room: "M433" },
        { code: "MATH 2230", type: "mid", date: "2026-11-11", start: "10:00", end: "12:00", room: "M534" },
        { code: "ME 3220", type: "mid", date: "2026-11-12", start: "09:00", end: "11:00", room: "M528" },
        { code: "ME 3420", type: "mid", date: "2026-11-13", start: "13:00", end: "15:00", room: "M534" },
        { code: "ME 3320", type: "final", date: "2026-12-28", start: "09:00", end: "11:30", room: "M113" },
        { code: "MATH 2263", type: "final", date: "2026-12-30", start: "13:00", end: "15:30", room: "M433" },
        { code: "MATH 2230", type: "final", date: "2027-01-04", start: "10:00", end: "12:30", room: "M534" },
        { code: "ME 3220", type: "final", date: "2027-01-06", start: "09:00", end: "11:30", room: "M528" },
        { code: "ME 3420", type: "final", date: "2027-01-08", start: "13:00", end: "15:30", room: "M534" }
      ],
      acadcal: [
        { tr: "Ders kaydı ve danışman onayı", en: "Course registration and advisor approval", start: "2026-09-14", end: "2026-10-09" },
        { tr: "Ders ekle / bırak", en: "Add / drop", start: "2026-09-21", end: "2026-10-09" },
        { tr: "Yeni öğrenci kayıt ve ekle/bırak", en: "New-student registration and add/drop", start: "2026-09-14", end: "2026-10-16" },
        { tr: "Ara sınav haftası", en: "Midterm week", start: "2026-11-09", end: "2026-11-13" },
        { tr: "Dersten çekilme (W) son gün", en: "Last day to withdraw (W)", start: "2026-12-04", end: "2026-12-04" },
        { tr: "Yarıyıl sonu sınavları", en: "Final exams", start: "2026-12-28", end: "2027-01-09" },
        { tr: "Harf notlarının ilanı", en: "Letter grades published", start: "2027-01-13", end: "2027-01-13" },
        { tr: "Bahar dönemi ders kaydı", en: "Spring course registration", start: "2027-02-01", end: "2027-02-12" }
      ]
    },

    courses: courses,

    student: {
      name: "Demo Öğrenci",
      no: "2023000000",
      advisor: "Doç. Dr. Demo Danışman",
      completedSemesters: 4,
      completed: [
        { code: "ENGR 1115", grade: "B-", term: "2023 Güz" }, { code: "MATH 1100", grade: "C-", term: "2023 Güz" },
        { code: "MATH 1131", grade: "C-", term: "2023 Güz" }, { code: "PHYS 1121", grade: "C", term: "2023 Güz" },
        { code: "SOFL 1101", grade: "C+", term: "2023 Güz" }, { code: "UMFD 1020", grade: "B", term: "2023 Güz" },
        { code: "CHEM 1130", grade: "C-", term: "2024 Bahar" }, { code: "MATH 1132", grade: "D+", term: "2024 Bahar" },
        { code: "ME 1110", grade: "B-", term: "2024 Bahar" }, { code: "PHYS 1122", grade: "D+", term: "2024 Bahar" },
        { code: "SOFL 1102", grade: "C", term: "2024 Bahar" }, { code: "UMFD 1120", grade: "B", term: "2024 Bahar" },
        { code: "UMFD 1220", grade: "B+", term: "2024 Bahar" },
        { code: "EEE 2280", grade: "C-", term: "2024 Güz" }, { code: "ENGR 2120", grade: "C-", term: "2024 Güz" },
        { code: "HIST 1110", grade: "B", term: "2024 Güz" }, { code: "ISG 9110", grade: "A-", term: "2024 Güz" },
        { code: "ISG 9210", grade: "B", term: "2024 Güz" }, { code: "ME 2210", grade: "C", term: "2024 Güz" },
        { code: "ME 2710", grade: "B-", term: "2024 Güz" }, { code: "TURK 1110", grade: "B", term: "2024 Güz" },
        { code: "HIST 1210", grade: "B", term: "2025 Bahar" }, { code: "MATH 2230", grade: "F", term: "2025 Bahar" },
        { code: "MATH 2263", grade: "F", term: "2025 Bahar" }, { code: "ME 2220", grade: "F", term: "2025 Bahar" },
        { code: "ME 2320", grade: "C-", term: "2025 Bahar" }, { code: "TURK 1210", grade: "B+", term: "2025 Bahar" },
        { code: "UFND 7010", grade: "A", term: "2025 Bahar" }
      ]
    },

    requirements: {
      totalEcts: 240,
      required: ["ENGR 1115", "MATH 1100", "MATH 1131", "PHYS 1121", "SOFL 1101", "UMFD 1020", "CHEM 1130", "MATH 1132", "ME 1110", "PHYS 1122", "SOFL 1102", "UMFD 1120", "UMFD 1220", "EEE 2280", "ENGR 2120", "HIST 1110", "ISG 9110", "ISG 9210", "ME 2210", "ME 2710", "TURK 1110", "HIST 1210", "MATH 2230", "MATH 2263", "ME 2220", "ME 2320", "TURK 1210", "UFND 7010", "EEE 3718", "ENGR 3450", "ME 3220", "ME 3320", "ME 3420", "MATH 2260", "ME 3330", "ME 3410", "ME 3510", "ENGR 4400", "ENGR 4411", "ME 4910", "UMFD 1720", "ME 4830", "ME 4920"],
      requiredExtra: {},
      /* Seçmeli yuvaları (2025-2026 müfredatı): Bölüm Seçmeli A1-A3 + B1-B3 (6 AKTS x 6) ve
         Üniversite Seçmeli ME1 (4 AKTS) + ME3 (3 AKTS). A/B ayrımı kaynakta bilinmediği için tek havuz. */
      electives: [
        { key: "bolum", name: { tr: "Bölüm Seçmeli (A1-A3, B1-B3; 6 x 6 AKTS)", en: "Department Electives (A1-A3, B1-B3; 6 x 6 ECTS)" }, ects: 36, slots: 6 },
        { key: "univ", name: { tr: "Üniversite Seçmeli (ME1: 4 + ME3: 3 AKTS)", en: "University Electives (ME1: 4 + ME3: 3 ECTS)" }, ects: 7, slots: 2 }
      ],
      /* Mezuniyet yol haritası için seçmeli YUVALARI (OBS müfredatındaki satır kodlarıyla, yarıyılı ile) */
      electiveSlots: [
        { code: "UNV ELECT ME1", group: "univ", semester: 5, ects: 4, tr: "Üniversite Seçmeli ME1", en: "University Elective ME1" },
        { code: "ELECT ME A1", group: "bolum", semester: 6, ects: 6, tr: "Bölüm Seçmeli A1", en: "Department Elective A1" },
        { code: "ELECT ME A2", group: "bolum", semester: 7, ects: 6, tr: "Bölüm Seçmeli A2", en: "Department Elective A2" },
        { code: "ELECT ME B1", group: "bolum", semester: 7, ects: 6, tr: "Bölüm Seçmeli B1", en: "Department Elective B1" },
        { code: "ELECT ME A3", group: "bolum", semester: 8, ects: 6, tr: "Bölüm Seçmeli A3", en: "Department Elective A3" },
        { code: "ELECT ME B2", group: "bolum", semester: 8, ects: 6, tr: "Bölüm Seçmeli B2", en: "Department Elective B2" },
        { code: "ELECT ME B3", group: "bolum", semester: 8, ects: 6, tr: "Bölüm Seçmeli B3", en: "Department Elective B3" },
        { code: "UNV ELECT ME3", group: "univ", semester: 8, ects: 3, tr: "Üniversite Seçmeli ME3", en: "University Elective ME3" }
      ],
      /* yol haritasında "proje/staj" rengiyle gösterilen dersler */
      project: ["ME 4910", "ME 4920", "ME 4830"]
    }
  };
})();
