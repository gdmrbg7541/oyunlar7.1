/* ===========================================================
   Bilgi Yarışması — 7. Sınıf · 1. Ünite (ماذا فَعَلْتُ اليَوْم؟)
   Firebase 8.10.1 (compat) · proje: bilgiyarismasi7sinif1unite
   Soru biçimleri: test · sürükle-bırak · eşleştirme · klavyeyle yazma
   Mod 1 (ADMIN): dosyayı sade adresle açan kişi = öğretmen (giriş yok).
   Mod 2 (TAKIM): ?oda=..&takim=.. linkiyle anonim katılım.
   Canlı oyun döngüsü: admin kontrollü, sunucu-zamanlı geri sayım,
   dijital cevap, öğrenci cihazında doğru/yanlış GÖRÜNMEZ; doğru/yanlış
   + puan yalnız admin (yansıtılan) ekranda. Puan zorluğa göre.
   =========================================================== */

/* ---------------- Firebase ---------------- */
/*  Firebase web uygulaması bilgileri.
    Proje: bilgiyarismasi7sinif1unite (7. sınıf 1. ünite bilgi yarışması)
    Bu değerler Firebase Console → ⚙️ Proje ayarları → "Uygulamalarınız" →
    Web uygulaması → SDK kurulumu ve yapılandırması bölümünden alınmıştır.
    NOT: Firestore güvenlik kuralları "bilgiYarismasi" koleksiyonunu açık
    tutmalıdır; kurallar "if false" kalırsa oda kurma/katılma çalışmaz.        */
const firebaseConfig = {
    apiKey: "AIzaSyAHlqUeWT5iyzQRn1KhHvzUZDVBs0UD9Qg",
    authDomain: "bilgiyarismasi7sinif1unite.firebaseapp.com",
    projectId: "bilgiyarismasi7sinif1unite",
    storageBucket: "bilgiyarismasi7sinif1unite.firebasestorage.app",
    messagingSenderId: "343340842876",
    appId: "1:343340842876:web:c6ae6e1d0df099be01aef9",
    measurementId: "G-HMJTNR4Q65"
};
const FIREBASE_HAZIR = !!(firebaseConfig.apiKey && firebaseConfig.appId);
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
if (!FIREBASE_HAZIR) console.warn("[BIY] firebaseConfig eksik. Canlı yarışma çalışmaz.");
const KOLEKSIYON = "bilgiYarismasi";
const PDF_AKTIF = false;     // PDF'ler hazır olunca true yap → PDF önizleme/indirme geri gelir
const SORU_SURESI = 60;      // saniye
const TUR_SORU_SAYISI = 20;  // varsayılan soru sayısı
const SORU_SAYI_SECENEK = [10, 15, 20, 25, 50];
const TOPLAM_PUAN = 1000;    // ana tur toplam puanı (yedekler hariç)
const ZAMAN_PAYI = 0.15;     // puanın en fazla %15'i hızdan (çok fazla değil)
const PUAN = { 1: 10, 2: 20, 3: 30 };  // (eski; artık 1000 üzerinden hesaplanır)

/* ---------------- Soru biçimleri ----------------
   Her sorunun bir "bicim" alanı vardır. Yazılmamışsa "test" kabul edilir,
   böylece eski sorular hiç değiştirilmeden çalışmaya devam eder.
     test     → çoktan seçmeli  { secenekler:[...], dogru:index }
     surukle  → kelimeleri sırala { parcalar:["...","..."] }  (dizideki sıra = doğru sıra)
     eslestir → eşleştirme        { ciftler:[["sol","sağ"], ...] }
     yazma    → klavyeyle yaz     { cevapYazi:"بيت", tuslar:[... en fazla 10 ...] }   */
const BICIM_BILGI = {
  "test":     { ad: "اخْتِيَارٌ",           emoji: "🔘" },
  "surukle":  { ad: "تَرْتِيبٌ",  emoji: "🧲" },
  "eslestir": { ad: "وَصْلٌ",     emoji: "🔗" },
  "yazma":    { ad: "كِتَابَةٌ",  emoji: "⌨️" }
};
function bicimAl(s){ return (s && s.bicim) || "test"; }
// Metin Arapça mı? (kutulara doğru yazı tipini vermek için)
function arMi(t){ return /[\u0600-\u06FF]/.test(String(t == null ? "" : t)); }
function karistir(dizi){
  const a = (dizi || []).slice();
  for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); const g = a[i]; a[i] = a[j]; a[j] = g; }
  return a;
}
// Bir cevabın doğru olup olmadığını TEK yerden karar veren yardımcı.
function cevapDogruMu(s, secilen){
  if (!s || secilen == null) return false;
  const b = bicimAl(s);
  if (b === "surukle")
    return Array.isArray(secilen) && Array.isArray(s.parcalar) && secilen.join("|") === s.parcalar.join("|");
  if (b === "eslestir")
    return Array.isArray(secilen) && Array.isArray(s.ciftler) &&
           secilen.length === s.ciftler.length && s.ciftler.every((c, i) => secilen[i] === c[1]);
  if (b === "yazma")
    return String(secilen).replace(/\s+/g, "") === String(s.cevapYazi || "").replace(/\s+/g, "");
  return secilen === s.dogru;
}
// Doğru cevabın okunabilir metni (önizleme kartları, sınıf modu, soru havuzu).
function dogruCevapMetni(s){
  const b = bicimAl(s);
  if (b === "surukle")  return (s.parcalar || []).join(" ");
  if (b === "eslestir") return (s.ciftler || []).map(c => c[0] + " → " + c[1]).join("  ·  ");
  if (b === "yazma")    return s.cevapYazi || "";
  return (s.secenekler || [])[s.dogru] || "";
}
// Soru havuzu aramasında taranacak metin.
function aramaMetni(q){
  const b = bicimAl(q);
  if (b === "surukle")  return (q.parcalar || []).join(" ");
  if (b === "eslestir") return (q.ciftler || []).map(c => c.join(" ")).join(" ");
  if (b === "yazma")    return q.cevapYazi || "";
  return (q.secenekler || []).join(" ");
}
// Bir takımın verdiği cevabın gösterim biçimi (sonuç ekranı tablosu).
function secimHtml(soru, secilen){
  const b = bicimAl(soru);
  if (secilen == null) return '<span class="biy-rev-yok">—</span>';
  if (b === "surukle")
    return '<span class="biy-rev-metin ar">' + kacis((secilen || []).join(" ")) + '</span>';
  if (b === "eslestir"){
    const sol = (soru.ciftler || []).map(c => c[0]);
    return '<span class="biy-rev-cift">' +
      sol.map((x, i) => '<i>' + kacis(x) + ' → ' + kacis((secilen || [])[i] || "—") + '</i>').join("") + '</span>';
  }
  if (b === "yazma")
    return '<span class="biy-rev-metin ar">' + kacis(String(secilen)) + '</span>';
  const harf = String.fromCharCode(65 + secilen);
  const ar = soru.arSecenek ? ' ar' : '';
  return '<b class="biy-rev-harf">' + harf + '</b> <span class="biy-rev-metin' + ar + '">' +
         kacis((soru.secenekler || [])[secilen] || "") + '</span>';
}

/* ---------------- Seed soru havuzu ---------------- */
/* 7. SINIF — 1. ÜNİTE:  ماذا فَعَلْتُ اليَوْم؟  (Bugün Ne Yaptım?)
   Konular: günlük rutin fiilleri, yiyecek-içecekler, saatler,
            haftanın günleri, namaz vakitleri, zamir-fiil uyumu.
   Soru id'leri konu grupları arasında ÇAKIŞMAMALIDIR (birleşik konu kullanıldığı için). */

/* --- 1) Günlük rutin (id 1-99) --- */
const S_GUNLUK = [
  {"id":1,"tip":"fiil","zorluk":1,"soru":"مَا مَعْنَى «أَسْتَيْقِظُ»؟","secenekler":["uyanırım","uyurum","yıkanırım","giyerim"],"dogru":0,"arapca":"أَسْتَيْقِظُ"},
  {"id":2,"tip":"fiil","zorluk":1,"soru":"مَا مَعْنَى «أَتَوَضَّأُ»؟","secenekler":["abdest alırım","namaz kılarım","uyanırım","yemek yerim"],"dogru":0,"arapca":"أَتَوَضَّأُ"},
  {"id":3,"tip":"fiil","zorluk":1,"soru":"مَا مَعْنَى «أُصَلّي»؟","secenekler":["namaz kılarım","ders çalışırım","koşarım","dönerim"],"dogru":0,"arapca":"أُصَلّي"},
  {"id":4,"tip":"fiil","zorluk":1,"soru":"مَا مَعْنَى «أَتَناوَلُ الفَطورَ»؟","secenekler":["kahvaltı yaparım","akşam yemeği yerim","süt içerim","uyurum"],"dogru":0,"arapca":"أَتَناوَلُ الفَطورَ"},
  {"id":5,"tip":"fiil","zorluk":1,"soru":"مَا مَعْنَى «أَلْبَسُ مَلابِسي»؟","secenekler":["elbiselerimi giyerim","ellerimi yıkarım","dişlerimi fırçalarım","odamı temizlerim"],"dogru":0,"arapca":"أَلْبَسُ مَلابِسي"},
  {"id":6,"tip":"fiil","zorluk":1,"soru":"مَا مَعْنَى «أَرْجِعُ إِلى البَيْتِ»؟","secenekler":["eve dönerim","okula giderim","evden çıkarım","eve girerim"],"dogru":0,"arapca":"أَرْجِعُ إِلى البَيْتِ"},
  {"id":7,"tip":"fiil","zorluk":1,"soru":"مَا مَعْنَى «أُساعِدُ أُمّي»؟","secenekler":["anneme yardım ederim","annemi severim","annemi beklerim","anneme sorarım"],"dogru":0,"arapca":"أُساعِدُ أُمّي"},
  {"id":8,"tip":"fiil","zorluk":1,"soru":"مَا مَعْنَى «أَدْرُسُ دُروسي»؟","secenekler":["derslerimi çalışırım","derse giderim","ders anlatırım","dersi dinlerim"],"dogru":0,"arapca":"أَدْرُسُ دُروسي"},
  {"id":9,"tip":"fiil","zorluk":2,"soru":"مَا تَرْجَمَةُ «Dişlerimi temizlerim» بِالعَرَبِيَّةِ؟","secenekler":["أُنَظِّفُ أَسْناني","أَغْسِلُ يَدَيَّ","أَلْبَسُ مَلابِسي","أَتَناوَلُ الفَطورَ"],"dogru":0,"arSecenek":true},
  {"id":10,"tip":"fiil","zorluk":2,"soru":"مَا تَرْجَمَةُ «Geceleyin uyurum» بِالعَرَبِيَّةِ؟","secenekler":["أَنامُ لَيْلًا","أَسْتَيْقِظُ صَباحًا","أَرْجِعُ ظُهْرًا","أَدْرُسُ مَساءً"],"dogru":0,"arSecenek":true},
  {"id":11,"tip":"fiil","zorluk":2,"soru":"مَا مَعْنَى «أَغْسِلُ يَدَيَّ قَبْلَ الطَّعامِ»؟","secenekler":["Yemekten önce ellerimi yıkarım","Yemekten sonra ellerimi yıkarım","Yemekten önce dua ederim","Yemekten sonra dişlerimi fırçalarım"],"dogru":0,"arapca":"أَغْسِلُ يَدَيَّ قَبْلَ الطَّعامِ"},
  {"id":12,"tip":"fiil","zorluk":2,"soru":"مَا مَعْنَى «مُبَكِّرًا»؟","secenekler":["erken","geç","yavaş","hızlı"],"dogru":0,"arapca":"مُبَكِّرًا"},
  {"id":13,"tip":"cumle","bicim":"surukle","zorluk":2,"soru":"رَتِّبِ الكَلِمَاتِ: «Sabah erken uyanırım.»","parcalar":["أَسْتَيْقِظُ","في","الصَّباحِ","مُبَكِّرًا"]},
  {"id":14,"tip":"cumle","bicim":"surukle","zorluk":2,"soru":"رَتِّبِ الكَلِمَاتِ: «Ailemle kahvaltı yaparım.»","parcalar":["أَتَناوَلُ","الفَطورَ","مَعَ","عائِلَتي"]},
  {"id":15,"tip":"cumle","bicim":"surukle","zorluk":2,"soru":"رَتِّبِ الكَلِمَاتِ: «Öğleyin eve dönerim.»","parcalar":["أَرْجِعُ","إِلى","البَيْتِ","ظُهْرًا"]},
  {"id":16,"tip":"cumle","bicim":"surukle","zorluk":3,"soru":"رَتِّبِ الكَلِمَاتِ: «Abdest alırım, sonra sabah namazını kılarım.»","parcalar":["أَتَوَضَّأُ","ثُمَّ","أُصَلّي","الفَجْرَ"]},
  {"id":17,"tip":"anlam","bicim":"eslestir","zorluk":2,"soru":"صِلِ الأَفْعَالَ بِمَعَانِيهَا.","ciftler":[["أَسْتَيْقِظُ","uyanırım"],["أَنامُ","uyurum"],["أَلْبَسُ","giyerim"],["أُساعِدُ","yardım ederim"]]},
  {"id":18,"tip":"anlam","bicim":"eslestir","zorluk":2,"soru":"صِلِ الأَفْعَالَ بِمَعَانِيهَا.","ciftler":[["أَتَوَضَّأُ","abdest alırım"],["أُصَلّي","namaz kılarım"],["أَدْرُسُ","ders çalışırım"],["أَذْهَبُ","giderim"]]},
  {"id":19,"tip":"anlam","bicim":"eslestir","zorluk":3,"soru":"صِلْ ظُرُوفَ الزَّمَانِ.","ciftler":[["الصَّباح","sabah"],["الظُّهْر","öğle"],["المَساء","akşam"],["اللَّيْل","gece"]]},
  {"id":20,"tip":"kelime","bicim":"yazma","zorluk":3,"soru":"اكْتُبْ «ev» بِالحُرُوفِ.","cevapYazi":"بيت","tuslar":["ب","ي","ت","ن","ث","م","ل","ر","س","د"]}
];

/* --- 2) Yiyecek & içecekler (id 101-199) --- */
const S_YEMEK = [
  {"id":101,"tip":"yemek","zorluk":1,"soru":"مَا مَعْنَى «الحَليب»؟","secenekler":["süt","peynir","bal","su"],"dogru":0,"arapca":"الحَليب"},
  {"id":102,"tip":"yemek","zorluk":1,"soru":"مَا مَعْنَى «الجُبْن»؟","secenekler":["peynir","zeytin","et","ekmek"],"dogru":0,"arapca":"الجُبْن"},
  {"id":103,"tip":"yemek","zorluk":1,"soru":"مَا مَعْنَى «الزَّيْتون»؟","secenekler":["zeytin","üzüm","elma","hurma"],"dogru":0,"arapca":"الزَّيْتون"},
  {"id":104,"tip":"yemek","zorluk":1,"soru":"مَا مَعْنَى «العَسَل»؟","secenekler":["bal","tereyağı","reçel","şeker"],"dogru":0,"arapca":"العَسَل"},
  {"id":105,"tip":"yemek","zorluk":1,"soru":"مَا مَعْنَى «الزُّبْدَة»؟","secenekler":["tereyağı","bal","peynir","yoğurt"],"dogru":0,"arapca":"الزُّبْدَة"},
  {"id":106,"tip":"yemek","zorluk":1,"soru":"مَا مَعْنَى «السَّمَك»؟","secenekler":["balık","tavuk","et","pirinç"],"dogru":0,"arapca":"السَّمَك"},
  {"id":107,"tip":"yemek","zorluk":1,"soru":"مَا مَعْنَى «الدَّجاج»؟","secenekler":["tavuk","balık","et","yumurta"],"dogru":0,"arapca":"الدَّجاج"},
  {"id":108,"tip":"yemek","zorluk":1,"soru":"مَا مَعْنَى «الأُرْز»؟","secenekler":["pirinç","makarna","ekmek","çorba"],"dogru":0,"arapca":"الأُرْز"},
  {"id":109,"tip":"yemek","zorluk":1,"soru":"مَا مَعْنَى «العَصير»؟","secenekler":["meyve suyu","çay","kahve","süt"],"dogru":0,"arapca":"العَصير"},
  {"id":110,"tip":"yemek","zorluk":1,"soru":"مَا مَعْنَى «الخُبْز»؟","secenekler":["ekmek","peynir","pirinç","tuz"],"dogru":0,"arapca":"الخُبْز"},
  {"id":111,"tip":"yemek","zorluk":2,"soru":"مَا مَعْنَى «الفَطور - الغَداء - العَشاء» بِالتَّرْتِيبِ؟","secenekler":["kahvaltı - öğle yemeği - akşam yemeği","öğle yemeği - kahvaltı - akşam yemeği","akşam yemeği - kahvaltı - öğle yemeği","kahvaltı - akşam yemeği - öğle yemeği"],"dogru":0},
  {"id":112,"tip":"yemek","zorluk":2,"soru":"مَا تَرْجَمَةُ «Kahvaltıda süt içerim» بِالعَرَبِيَّةِ؟","secenekler":["أَشْرَبُ الحَليبَ في الفَطورِ","آكُلُ الجُبْنَ في الفَطورِ","أَشْرَبُ العَصيرَ في العَشاءِ","آكُلُ السَّمَكَ في الغَداءِ"],"dogru":0,"arSecenek":true},
  {"id":113,"tip":"yemek","bicim":"surukle","zorluk":2,"soru":"رَتِّبِ الكَلِمَاتِ: «Öğle yemeğinde et ve pirinç yerim.»","parcalar":["أَتَناوَلُ","اللَّحْمَ","وَالأُرْزَ","في","الغَداءِ"]},
  {"id":114,"tip":"yemek","bicim":"surukle","zorluk":2,"soru":"رَتِّبِ الكَلِمَاتِ: «Öğle yemeğinden sonra kahve içerim.»","parcalar":["أَشْرَبُ","القَهْوَةَ","بَعْدَ","الغَداءِ"]},
  {"id":115,"tip":"yemek","bicim":"surukle","zorluk":3,"soru":"رَتِّبِ الكَلِمَاتِ: «Kahvaltıda zeytin ve peynir yerim.»","parcalar":["أَتَناوَلُ","الزَّيْتونَ","وَالجُبْنَ","في","الفَطورِ"]},
  {"id":116,"tip":"yemek","bicim":"eslestir","zorluk":2,"soru":"صِلِ المَشْرُوبَاتِ.","ciftler":[["الحَليب","süt"],["القَهْوَة","kahve"],["الشّاي","çay"],["العَصير","meyve suyu"]]},
  {"id":117,"tip":"yemek","bicim":"eslestir","zorluk":2,"soru":"صِلِ الأَطْعِمَةَ.","ciftler":[["السَّمَك","balık"],["الدَّجاج","tavuk"],["اللَّحْم","et"],["الخُبْز","ekmek"]]},
  {"id":118,"tip":"yemek","bicim":"eslestir","zorluk":3,"soru":"صِلْ أَطْعِمَةَ الفَطُورِ.","ciftler":[["الزَّيْتون","zeytin"],["الجُبْن","peynir"],["العَسَل","bal"],["الزُّبْدَة","tereyağı"]]},
  {"id":119,"tip":"kelime","bicim":"yazma","zorluk":3,"soru":"اكْتُبْ «ekmek» بِالحُرُوفِ.","cevapYazi":"خبز","tuslar":["خ","ب","ز","ح","ج","ر","د","ن","ت","م"]},
  {"id":120,"tip":"kelime","bicim":"yazma","zorluk":3,"soru":"اكْتُبْ «balık» بِالحُرُوفِ.","cevapYazi":"سمك","tuslar":["س","م","ك","ش","ن","ل","ب","ت","ح","ر"]}
];

/* --- 3) Saatler (id 201-299) --- */
const S_SAAT = [
  {"id":201,"tip":"saat","zorluk":1,"soru":"كَمِ السَّاعَةُ؟ «السّاعَةُ الثّالِثَةُ»","secenekler":["3","2","4","8"],"dogru":0,"arapca":"السّاعَةُ الثّالِثَةُ"},
  {"id":202,"tip":"saat","zorluk":1,"soru":"كَمِ السَّاعَةُ؟ «السّاعَةُ السّابِعَةُ»","secenekler":["7","6","8","9"],"dogru":0,"arapca":"السّاعَةُ السّابِعَةُ"},
  {"id":203,"tip":"saat","zorluk":1,"soru":"كَمِ السَّاعَةُ؟ «السّاعَةُ العاشِرَةُ»","secenekler":["10","9","11","12"],"dogru":0,"arapca":"السّاعَةُ العاشِرَةُ"},
  {"id":204,"tip":"saat","zorluk":2,"soru":"كَمِ السَّاعَةُ؟ «السّاعَةُ الحادِيَةَ عَشْرَةَ»","secenekler":["11","10","12","1"],"dogru":0,"arapca":"السّاعَةُ الحادِيَةَ عَشْرَةَ"},
  {"id":205,"tip":"saat","zorluk":2,"soru":"كَيْفَ نَقُولُ السَّاعَةَ 1 بِالعَرَبِيَّةِ؟","secenekler":["السّاعَةُ الواحِدَةُ","السّاعَةُ الثّانِيَةُ","السّاعَةُ الحادِيَةَ عَشْرَةَ","السّاعَةُ الثّامِنَةُ"],"dogru":0,"arSecenek":true},
  {"id":206,"tip":"saat","zorluk":2,"soru":"كَيْفَ نَقُولُ السَّاعَةَ 12 بِالعَرَبِيَّةِ؟","secenekler":["السّاعَةُ الثّانِيَةَ عَشْرَةَ","السّاعَةُ الثّانِيَةُ","السّاعَةُ العاشِرَةُ","السّاعَةُ التّاسِعَةُ"],"dogru":0,"arSecenek":true},
  {"id":207,"tip":"saat","zorluk":2,"soru":"كَمِ السَّاعَةُ؟ «السّاعَةُ السّادِسَةُ»","secenekler":["6","5","7","9"],"dogru":0,"arapca":"السّاعَةُ السّادِسَةُ"},
  {"id":208,"tip":"saat","bicim":"surukle","zorluk":2,"soru":"رَتِّبِ السَّاعَاتِ مِنْ 1 إِلَى 4 (مِنَ اليَمِينِ).","parcalar":["الواحِدَة","الثّانِيَة","الثّالِثَة","الرّابِعَة"]},
  {"id":209,"tip":"saat","bicim":"surukle","zorluk":2,"soru":"رَتِّبِ السَّاعَاتِ مِنْ 5 إِلَى 8 (مِنَ اليَمِينِ).","parcalar":["الخامِسَة","السّادِسَة","السّابِعَة","الثّامِنَة"]},
  {"id":210,"tip":"saat","bicim":"surukle","zorluk":3,"soru":"رَتِّبِ الكَلِمَاتِ: «Saat yedide okula giderim.»","parcalar":["أَذْهَبُ","إِلى","المَدْرَسَةِ","في","السّاعَةِ","السّابِعَةِ"]},
  {"id":211,"tip":"saat","bicim":"eslestir","zorluk":2,"soru":"صِلِ السَّاعَاتِ بِالأَرْقَامِ.","ciftler":[["الثّانِيَة","2"],["الرّابِعَة","4"],["السّادِسَة","6"],["الثّامِنَة","8"]]},
  {"id":212,"tip":"saat","bicim":"eslestir","zorluk":3,"soru":"صِلِ السَّاعَاتِ بِالأَرْقَامِ.","ciftler":[["الخامِسَة","5"],["التّاسِعَة","9"],["العاشِرَة","10"],["الثّانِيَة عَشْرَة","12"]]},
  {"id":213,"tip":"kelime","bicim":"yazma","zorluk":3,"soru":"اكْتُبْ «saat» بِالحُرُوفِ.","cevapYazi":"ساعة","tuslar":["س","ا","ع","ة","ص","ح","ه","ت","ن","م"]}
];

/* --- 4) Haftanın günleri (id 301-399) --- */
const S_GUNLER = [
  {"id":301,"tip":"gun","zorluk":1,"soru":"أَيُّ يَوْمٍ هُوَ «يَوْمُ الجُمُعَةِ»؟","secenekler":["Cuma","Perşembe","Cumartesi","Pazar"],"dogru":0,"arapca":"يَوْمُ الجُمُعَةِ"},
  {"id":302,"tip":"gun","zorluk":1,"soru":"أَيُّ يَوْمٍ هُوَ «يَوْمُ السَّبْتِ»؟","secenekler":["Cumartesi","Cuma","Pazar","Pazartesi"],"dogru":0,"arapca":"يَوْمُ السَّبْتِ"},
  {"id":303,"tip":"gun","zorluk":1,"soru":"أَيُّ يَوْمٍ هُوَ «يَوْمُ الأَحَدِ»؟","secenekler":["Pazar","Cumartesi","Pazartesi","Salı"],"dogru":0,"arapca":"يَوْمُ الأَحَدِ"},
  {"id":304,"tip":"gun","zorluk":1,"soru":"أَيُّ يَوْمٍ هُوَ «يَوْمُ الاِثْنَيْنِ»؟","secenekler":["Pazartesi","Salı","Çarşamba","Pazar"],"dogru":0,"arapca":"يَوْمُ الاِثْنَيْنِ"},
  {"id":305,"tip":"gun","zorluk":1,"soru":"أَيُّ يَوْمٍ هُوَ «يَوْمُ الخَميسِ»؟","secenekler":["Perşembe","Çarşamba","Cuma","Salı"],"dogru":0,"arapca":"يَوْمُ الخَميسِ"},
  {"id":306,"tip":"gun","zorluk":2,"soru":"كَيْفَ نَقُولُ «Çarşamba» بِالعَرَبِيَّةِ؟","secenekler":["الأَرْبِعاء","الثُّلاثاء","الخَميس","الاِثْنَيْن"],"dogru":0,"arSecenek":true},
  {"id":307,"tip":"gun","zorluk":2,"soru":"أَيُّ يَوْمٍ هُوَ «يَوْمُ الثُّلاثاءِ»؟","secenekler":["Salı","Çarşamba","Pazartesi","Perşembe"],"dogru":0,"arapca":"يَوْمُ الثُّلاثاءِ"},
  {"id":308,"tip":"gun","bicim":"surukle","zorluk":2,"soru":"رَتِّبِ الكَلِمَاتِ: «Pazar günü Cumartesi gününden sonra gelir.»","parcalar":["يَوْمُ","الأَحَدِ","يَأْتي","بَعْدَ","يَوْمِ","السَّبْتِ"]},
  {"id":309,"tip":"gun","bicim":"surukle","zorluk":2,"soru":"رَتِّبِ الأَيَّامَ: Pazartesi → Perşembe (مِنَ اليَمِينِ).","parcalar":["الاِثْنَيْن","الثُّلاثاء","الأَرْبِعاء","الخَميس"]},
  {"id":310,"tip":"gun","bicim":"eslestir","zorluk":2,"soru":"صِلِ الأَيَّامَ.","ciftler":[["الاِثْنَيْن","Pazartesi"],["الثُّلاثاء","Salı"],["الأَرْبِعاء","Çarşamba"],["الخَميس","Perşembe"]]},
  {"id":311,"tip":"gun","bicim":"eslestir","zorluk":2,"soru":"صِلِ الأَيَّامَ.","ciftler":[["الجُمُعَة","Cuma"],["السَّبْت","Cumartesi"],["الأَحَد","Pazar"],["الأُسْبوع","hafta"]]},
  {"id":312,"tip":"kelime","bicim":"yazma","zorluk":3,"soru":"اكْتُبْ «gün» بِالحُرُوفِ.","cevapYazi":"يوم","tuslar":["ي","و","م","ن","ب","ت","ل","ر","س","ه"]}
];

/* --- 5) Namaz vakitleri (id 401-499) --- */
const S_NAMAZ = [
  {"id":401,"tip":"namaz","zorluk":1,"soru":"أَيُّ صَلَاةٍ هِيَ «الفَجْر»؟","secenekler":["sabah","öğle","ikindi","akşam"],"dogru":0,"arapca":"الفَجْر"},
  {"id":402,"tip":"namaz","zorluk":1,"soru":"أَيُّ صَلَاةٍ هِيَ «الظُّهْر»؟","secenekler":["öğle","ikindi","akşam","yatsı"],"dogru":0,"arapca":"الظُّهْر"},
  {"id":403,"tip":"namaz","zorluk":1,"soru":"أَيُّ صَلَاةٍ هِيَ «العَصْر»؟","secenekler":["ikindi","öğle","akşam","sabah"],"dogru":0,"arapca":"العَصْر"},
  {"id":404,"tip":"namaz","zorluk":1,"soru":"أَيُّ صَلَاةٍ هِيَ «المَغْرِب»؟","secenekler":["akşam","yatsı","ikindi","sabah"],"dogru":0,"arapca":"المَغْرِب"},
  {"id":405,"tip":"namaz","zorluk":1,"soru":"أَيُّ صَلَاةٍ هِيَ «العِشاء»؟","secenekler":["yatsı","akşam","sabah","öğle"],"dogru":0,"arapca":"العِشاء"},
  {"id":406,"tip":"namaz","zorluk":2,"soru":"مَا مَعْنَى «شُروقُ الشَّمْسِ»؟","secenekler":["güneşin doğuşu","güneşin batışı","gece yarısı","öğle vakti"],"dogru":0,"arapca":"شُروقُ الشَّمْسِ"},
  {"id":407,"tip":"namaz","bicim":"surukle","zorluk":2,"soru":"رَتِّبِ الكَلِمَاتِ: «Güneş doğmadan önce sabah namazı kılarım.»","parcalar":["أُصَلّي","الفَجْرَ","قَبْلَ","شُروقِ","الشَّمْسِ"]},
  {"id":408,"tip":"namaz","bicim":"surukle","zorluk":2,"soru":"رَتِّبِ الكَلِمَاتِ: «Uyumadan önce yatsı namazı kılarım.»","parcalar":["أُصَلّي","العِشاءَ","قَبْلَ","النَّوْمِ"]},
  {"id":409,"tip":"namaz","bicim":"surukle","zorluk":3,"soru":"رَتِّبِ الكَلِمَاتِ: «Muhammed öğle namazını cemaatle kılar.»","parcalar":["يُصَلّي","مُحَمَّدٌ","الظُّهْرَ","مَعَ","الجَماعَةِ"]},
  {"id":410,"tip":"namaz","bicim":"eslestir","zorluk":2,"soru":"صِلْ أَوْقَاتَ الصَّلَاةِ.","ciftler":[["الفَجْر","sabah"],["الظُّهْر","öğle"],["العَصْر","ikindi"],["المَغْرِب","akşam"]]},
  {"id":411,"tip":"kelime","bicim":"yazma","zorluk":3,"soru":"اكْتُبْ «mescid / cami» بِالحُرُوفِ.","cevapYazi":"مسجد","tuslar":["م","س","ج","د","ح","خ","ش","ن","ت","ر"]}
];

/* --- 6) Zamir - fiil uyumu (id 501-599) --- */
const S_ZAMIR = [
  {"id":501,"tip":"zamir","zorluk":2,"soru":"مَا الكَلِمَةُ المُنَاسِبَةُ لِلْفَرَاغِ؟ «هُوَ ... مُبَكِّرًا»","secenekler":["يَسْتَيْقِظُ","تَسْتَيْقِظُ","أَسْتَيْقِظُ","تَسْتَيْقِظينَ"],"dogru":0,"arSecenek":true},
  {"id":502,"tip":"zamir","zorluk":2,"soru":"مَا الكَلِمَةُ المُنَاسِبَةُ لِلْفَرَاغِ؟ «هِيَ ... الفَجْرَ»","secenekler":["تُصَلّي","يُصَلّي","أُصَلّي","تُصَلّينَ"],"dogru":0,"arSecenek":true},
  {"id":503,"tip":"zamir","zorluk":2,"soru":"مَا الكَلِمَةُ المُنَاسِبَةُ لِلْفَرَاغِ؟ «أَنْتِ ... إِلى البَيْتِ»","secenekler":["تَرْجِعينَ","تَرْجِعُ","يَرْجِعُ","أَرْجِعُ"],"dogru":0,"arSecenek":true},
  {"id":504,"tip":"zamir","zorluk":2,"soru":"مَا الكَلِمَةُ المُنَاسِبَةُ لِلْفَرَاغِ؟ «أَنْتَ ... أُمَّكَ»","secenekler":["تُساعِدُ","تُساعِدينَ","يُساعِدُ","أُساعِدُ"],"dogru":0,"arSecenek":true},
  {"id":505,"tip":"zamir","zorluk":2,"soru":"مَا الكَلِمَةُ المُنَاسِبَةُ لِلْفَرَاغِ؟ «هِيَ ... أَسْنانَها»","secenekler":["تُنَظِّفُ","يُنَظِّفُ","أُنَظِّفُ","تُنَظِّفينَ"],"dogru":0,"arSecenek":true},
  {"id":506,"tip":"zamir","zorluk":2,"soru":"مَا الكَلِمَةُ المُنَاسِبَةُ لِلْفَرَاغِ؟ «أَنْتِ ... لَيْلًا»","secenekler":["تَنامينَ","تَنامُ","يَنامُ","أَنامُ"],"dogru":0,"arSecenek":true},
  {"id":507,"tip":"zamir","zorluk":3,"soru":"مَنْ فَاعِلُ الفِعْلِ «يَتَناوَلُ»؟","secenekler":["هُوَ","هِيَ","أَنا","أَنْتِ"],"dogru":0,"arSecenek":true},
  {"id":508,"tip":"zamir","bicim":"eslestir","zorluk":2,"soru":"صِلِ الضَّمَائِرَ بِالأَفْعَالِ (دَرَسَ).","ciftler":[["أَنا","أَدْرُسُ"],["هُوَ","يَدْرُسُ"],["هِيَ","تَدْرُسُ"],["أَنْتِ","تَدْرُسينَ"]]},
  {"id":509,"tip":"zamir","bicim":"eslestir","zorluk":3,"soru":"صِلِ الضَّمَائِرَ بِالأَفْعَالِ (نامَ).","ciftler":[["أَنا","أَنامُ"],["هُوَ","يَنامُ"],["هِيَ","تَنامُ"],["أَنْتِ","تَنامينَ"]]},
  {"id":510,"tip":"zamir","bicim":"surukle","zorluk":2,"soru":"رَتِّبِ الكَلِمَاتِ: «O (kız) ailesiyle kahvaltı yapar.»","parcalar":["هِيَ","تَتَناوَلُ","الفَطورَ","مَعَ","أُسْرَتِها"]},
  {"id":511,"tip":"zamir","bicim":"surukle","zorluk":3,"soru":"رَتِّبِ الكَلِمَاتِ: «O (erkek) sabahleyin dişlerini temizler.»","parcalar":["هُوَ","يُنَظِّفُ","أَسْنانَهُ","في","الصَّباحِ"]}
];

const SORULAR = [].concat(S_GUNLUK, S_YEMEK, S_SAAT, S_GUNLER, S_NAMAZ, S_ZAMIR);

const TIP_BILGI = {
  "fiil":    { ad: "أَفْعَالٌ يَوْمِيَّةٌ",  emoji: "🏃" },
  "cumle":   { ad: "جُمْلَةٌ",           emoji: "💬" },
  "anlam":   { ad: "مَعْنًى",           emoji: "💡" },
  "yemek":   { ad: "طَعَامٌ وَشَرَابٌ",  emoji: "🍽️" },
  "saat":    { ad: "السَّاعَاتُ",         emoji: "🕒" },
  "gun":     { ad: "أَيَّامُ الأُسْبُوعِ",emoji: "📅" },
  "namaz":   { ad: "أَوْقَاتُ الصَّلَاةِ", emoji: "🕌" },
  "zamir":   { ad: "ضَمِيرٌ وَفِعْلٌ",      emoji: "👥" },
  "kelime":  { ad: "كِتَابَةُ الكَلِمَاتِ",    emoji: "🔤" }
};
const ZORLUK_AD = { 1: "سَهْلٌ", 2: "مُتَوَسِّطٌ", 3: "صَعْبٌ" };
const SIK_RENK = ["#E74C3C", "#3498DB", "#F1C40F", "#27AE60", "#9B59B6"]; // A B C D E
const SEVIYE_ZORLUK = { kolay: 1, orta: 2, zor: 3 };

/* ---------------- Konular ----------------
   Yeni konu eklemek için bu diziye bir nesne ekleyin:
   { id: "benzersiz-id", ad: "Konu Adı", pdf: "PDF dosya adı.pdf", sorular: [ ...soru nesneleri... ] }
   • pdf: repo kökündeki PDF dosyasının adı (boş bırakılırsa indirme/önizleme pasif olur).
   • sorular: SORULAR ile aynı biçimde; boşsa o konuda yarışma başlatılamaz.
   NOT: Soru id'leri aynı konu içinde benzersiz olmalıdır (birleşik konu da dâhil).      */
const KONULAR = [
  { id: "unite1",  ad: "الوَحْدَةُ الأُولَى — كُلُّ الأَسْئِلَةِ (ماذا فَعَلْتُ اليَوْم؟)", pdf: "", sorular: SORULAR },
  { id: "gunluk",  ad: "الرُّوتِينُ اليَوْمِيُّ",        pdf: "", sorular: S_GUNLUK },
  { id: "yemek",   ad: "الطَّعَامُ وَالشَّرَابُ",pdf: "", sorular: S_YEMEK },
  { id: "saat",    ad: "السَّاعَاتُ",             pdf: "", sorular: S_SAAT },
  { id: "gunler",  ad: "أَيَّامُ الأُسْبُوعِ",    pdf: "", sorular: S_GUNLER },
  { id: "namaz",   ad: "أَوْقَاتُ الصَّلَاةِ",     pdf: "", sorular: S_NAMAZ },
  { id: "zamir",   ad: "الضَّمِيرُ وَالفِعْلُ",  pdf: "", sorular: S_ZAMIR }
];

/* ---------------- Biçime göre HTML üreticileri ---------------- */
// Önizleme / sınıf modu kartlarındaki "şıklar" alanı.
function sikKartHtml(s, dogruGoster){
  const b = bicimAl(s);
  if (b === "test"){
    let h = "";
    (s.secenekler || []).forEach((sec, i) => {
      const dogruMu = dogruGoster && i === s.dogru;
      const sinif = "biy-secenek" + (dogruMu ? " dogru" : "") + (s.arSecenek ? " biy-arapca-secenek" : "");
      h += '<div class="'+sinif+'"><span class="biy-sik">'+String.fromCharCode(65+i)+'</span><span class="biy-secenek-metin">'+kacis(sec)+'</span></div>';
    });
    return h;
  }
  const bb = BICIM_BILGI[b] || { ad: b, emoji: "❓" };
  const govde = dogruGoster ? dogruCevapMetni(s) : ("سُؤَالٌ · " + bb.ad);
  return '<div class="biy-secenek'+(dogruGoster?' dogru':'')+' biy-arapca-secenek biy-bicim-kutu">' +
         '<span class="biy-sik">'+bb.emoji+'</span><span class="biy-secenek-metin">'+kacis(govde)+'</span></div>';
}
// Yansıtılan admin tahtasındaki soru gövdesi (cevap fazı ve sonuç ekranı).
function tahtaIcerikHtml(soru, sonucMu){
  const b = bicimAl(soru);
  if (b === "test"){
    let h = "";
    (soru.secenekler || []).forEach((sec, i) => {
      const dogru = sonucMu && i === soru.dogru;
      h += '<div class="biy-a-opt'+(dogru?' dogru':'')+(soru.arSecenek?' ar':'')+'" style="--c:'+SIK_RENK[i % SIK_RENK.length]+'">' +
           '<span class="biy-a-harf">'+String.fromCharCode(65+i)+'</span><span class="biy-a-metin">'+kacis(sec)+'</span>' +
           (dogru?'<span class="biy-a-tik">✓</span>':'') + '</div>';
    });
    return h;
  }
  if (b === "surukle"){
    const dizi = sonucMu ? (soru.parcalar || []) : (soru.karisik || soru.parcalar || []);
    return '<div class="biy-a-dizi'+(sonucMu?' dogru':'')+'">' +
      dizi.map(p => '<span class="biy-a-parca">'+kacis(p)+'</span>').join("") + '</div>' +
      (sonucMu ? '<div class="biy-a-cevapcubuk">✓ '+kacis((soru.parcalar||[]).join(" "))+'</div>' : '');
  }
  if (b === "eslestir"){
    const c = soru.ciftler || [];
    if (sonucMu){
      return '<div class="biy-a-cift dogru">' +
        c.map(x => '<div class="biy-a-cift-satir"><span class="biy-a-sol'+(arMi(x[0])?' ar':'')+'">'+kacis(x[0])+'</span><span class="biy-a-ok">→</span><span class="biy-a-sag'+(arMi(x[1])?' ar':'')+'">'+kacis(x[1])+'</span></div>').join("") +
      '</div>';
    }
    const sol = soru.sollar || c.map(x => x[0]);
    const sag = soru.sagKarisik || karistir(c.map(x => x[1]));
    return '<div class="biy-a-cift">' +
      '<div class="biy-a-sutun">'+sol.map(x => '<span class="biy-a-sol'+(arMi(x)?' ar':'')+'">'+kacis(x)+'</span>').join("")+'</div>' +
      '<div class="biy-a-sutun">'+sag.map(x => '<span class="biy-a-sag'+(arMi(x)?' ar':'')+'">'+kacis(x)+'</span>').join("")+'</div>' +
    '</div>';
  }
  if (b === "yazma"){
    const tus = soru.tusKarisik || soru.tuslar || [];
    return '<div class="biy-a-tuslar">'+tus.map(t => '<span class="biy-a-tus">'+kacis(t)+'</span>').join("")+'</div>' +
      (sonucMu ? '<div class="biy-a-cevapcubuk">✓ '+kacis(soru.cevapYazi||"")+'</div>' : '');
  }
  return "";
}
/* ---------------- Durum ---------------- */
const state = {
  mod: null, uid: null,
  oyunModu: "takim",         // takim | birey | okul  (yarışma biçimi)
  bekleyenListe: [],         // birey modu: onay bekleyen katılımcılar
  katilimId: null,           // öğrenci tarafı: kendi katılımcı kaydının id'si
  katilimAbone: null,        // öğrenci tarafı: kendi kaydını dinleyen abonelik
  katilBagli: false,         // takimBagla bir kez çalıştı mı
  atildiMi: false,           // öğretmen bu cihazı yarışmadan çıkardı mı (kalıcı bayrak)
  takimNabiz: null,          // öğrenci tarafı: "hâlâ buradayım" zamanlayıcısı
  konuId: null,              // seçili konu (açılışta seçili değil)
  seviye: null,              // kolay | orta | zor  (başta seçili değil)
  sorularZ: 1,               // Sorular önizleme sekmesi (zorluk)
  soruGizli: true,           // admin ekranında soruyu gizle/göster (açılışta gizli)
  soruSayisi: null,          // turdaki soru sayısı (başta seçili değil)
  soruSayiMax: 50,           // seçili konu+seviyedeki mevcut soruya göre üst sınır
  secilenSet: null,          // elle seçilen soru anahtarları (Set) — havuzdan
  soruSecArama: "",          // soru havuzu arama metni
  otoSonucIndex: -1,         // tüm takımlar cevaplayınca otomatik sonuç kilidi
  odaId: null,               // admin: oda kodu
  odaTakim: null,            // takım: {oda, takim}
  takimAd: "",
  takimAbone: null, odaAboneAdmin: null, odaAbone: null, cevapAbone: null,
  ayarKilidiKapali: false,   // lobiye dönünce ayarlar (konu/seviye/soru sayısı) takım bağlıyken de açılır
  oda: null,                 // canlı oda dokümanı
  takimListe: [],            // [{id, ad, bagli, puan}]
  cevaplar: {},              // "takimId_index" -> {takimId, ad, index, secilen}
  oyunSorulari: [],          // admin: seçilen sorular (cevap dahil)
  sayacInterval: null,
  sonCevapIndex: -1,
  calisma: null,             // takım: yarım kalan cevap { index, yerlesim, secili, yazi }
  sonucAnimIndex: -1,        // sonuç ekranı animasyonu hangi soru için oynatıldı
  sonucTimerlar: [],         // sonuç ekranı adım zamanlayıcıları (temizlik için)
  finalKonfeti: false,       // yarışma bitti ekranında konfeti bir kez patlar
  baglSet: null,             // o an bağlı takım id kümesi (yeni bağlanmayı yakalamak için)
  baglIlk: false,            // ilk takım snapshot'ı işlendi mi (açılışta ses çalmamak için)
  hepsiSesIndex: -1,         // "tümü cevapladı" sesi hangi soru için çalındı
  // ---- beraberlik (yedek soru) ----
  yedekSorular: [],          // turda kullanılmayan yedek sorular
  berHedef: 0,               // beraberlik hangi sıra için (1=liderlik, 2=ikincilik)
  berTakimlar: [],           // beraberlikte yarışan takım id'leri
  berSabit: {},              // sırası kesinleşmiş takımlar { id: sıra }
  berNo: 0,                  // kaçıncı yedek soru
  berSorular: [],            // sorulan yedek soru index'leri
  berOtoIndex: -1,           // (kullanılmıyor)
  yedekSoruMap: {}           // { index: soru }  yedek soruların puan hesabı için
};

/* ---------------- Ses (sinüs dalgası — Web Audio) ---------------- */
const SES = {
  ctx: null,
  _ac(){
    try {
      if (!this.ctx){ const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; this.ctx = new AC(); }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    } catch(e){ return null; }
  },
  _ton(ac, freq, t0, sure, kazanc){
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(kazanc, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + sure);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + sure + 0.03);
  },
  _cal(notalar, kazanc){
    const ac = this._ac(); if (!ac) return;
    const now = ac.currentTime + 0.01;
    notalar.forEach(n => this._ton(ac, n.f, now + (n.t || 0), n.d || 0.15, (n.g || kazanc || 0.14)));
  },
  baglandi(){ this._cal([{f:659,t:0,d:0.12},{f:988,t:0.10,d:0.18}], 0.13); },                          // takım bağlandı: yükselen ding
  hepsiCevap(){ this._cal([{f:523,t:0,d:0.11},{f:659,t:0.09,d:0.11},{f:784,t:0.18,d:0.20}], 0.13); },  // tümü cevapladı: do-mi-sol
  sonuc(){ this._cal([{f:392,t:0,d:0.14},{f:587,t:0.12,d:0.24}], 0.15); },                              // sonuç ekranı açıldı
  siraDegisti(){ this._cal([{f:494,t:0,d:0.10},{f:740,t:0.08,d:0.10},{f:988,t:0.16,d:0.20}], 0.12); }   // sıralama değişti: hızlı yükseliş
};
// ilk kullanıcı hareketinde ses bağlamını aç (tarayıcı otomatik oynatma kısıtı)
["pointerdown","keydown","touchstart"].forEach(ev => window.addEventListener(ev, () => SES._ac(), { passive: true }));

/* ---------------- Yardımcılar ---------------- */
function $(id){ return document.getElementById(id); }
function ekranGoster(id){
  document.querySelectorAll(".biy-ekran").forEach(e => e.classList.add("gizli"));
  const el = $(id); if (el) el.classList.remove("gizli");
  // çıkış tuşu yalnızca canlı oyun ekranında görünür
  const cik = $("cikisTus"); if (cik) cik.classList.toggle("gizli", id !== "ekranOyunAdmin");
}
function kacis(t){ const d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML; }
function rastgeleKod(uzunluk){
  const harf = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i=0;i<uzunluk;i++) s += harf[Math.floor(Math.random()*harf.length)];
  return s;
}
function takimLinki(oda, takim){
  return location.origin + location.pathname + "?oda=" + encodeURIComponent(oda) + "&takim=" + encodeURIComponent(takim);
}
/* Birey/Okul modunda tek bir bağlantı herkese yeter: takım parametresi yok. */
function odaLinki(oda){
  return location.origin + location.pathname + "?oda=" + encodeURIComponent(oda);
}
/* ---- Yarışma modları ----
   takim : öğretmen takım adlarını yazar, her takım kendi karekodunu okutur (eski davranış)
   birey : tek karekod, herkes kendi adını yazar, öğretmen onaylar
   okul  : tek karekod, öğrenci adını yazar + sınıfını seçer, sınıflar ORTALAMA puanla yarışır  */
const MOD_BILGI = {
  takim: { ad: "نِظَامُ الفِرَقِ", emoji: "👥", kisi: "فَرِيقٌ", cog: "فِرَق",      baslik: "إِنْشَاءُ الفِرَقِ وَالانْتِظَارُ" },
  birey: { ad: "نِظَامُ الأَفْرَادِ", emoji: "🙋", kisi: "مُشَارِكٌ",  cog: "مُشارِكونَ", baslik: "المُشَارِكُونَ وَالانْتِظَارُ" },
  okul:  { ad: "نِظَامُ الصُّفُوفِ",  emoji: "🏫", kisi: "صَفٌّ", cog: "صُفوف",      baslik: "إِنْشَاءُ الصُّفُوفِ وَالانْتِظَارُ" }
};
function modAl(){ return MOD_BILGI[state.oyunModu] ? state.oyunModu : "takim"; }
function tekKarekod(){ return modAl() === "birey"; }   // yalnız birey: tek ortak karekod
function kartliMod(){ return modAl() !== "birey"; }    // takım & okul: her katılımcıya ayrı karekod
function kisiSozu(){ return (MOD_BILGI[modAl()] || MOD_BILGI.takim).kisi; }
function cogSozu(){ return (MOD_BILGI[modAl()] || MOD_BILGI.takim).cog; }

/* ---- Ozel SVG simgeleri (emoji yerine) ------------------------------- */
const SIMGELER = {
  "⏳": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrTuruncu)" opacity=".14"/>' +
    '<g class="biy-sv-kum" fill="none" stroke="url(#biyGrTuruncu)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M20 12h24M20 52h24"/><path d="M22 12v6l10 14 10-14v-6"/><path d="M22 52v-6l10-14 10 14v6"/></g>' +
    '<circle class="biy-sv-tane" cx="32" cy="33" r="2.6" fill="url(#biyGrTuruncu)"/>',
  "✅": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrYesil)" opacity=".18"/>' +
    '<circle cx="32" cy="32" r="21" fill="none" stroke="url(#biyGrYesil)" stroke-width="3.5" class="biy-sv-halka"/>' +
    '<path class="biy-sv-tik" d="M21 33l8 8 15-16" fill="none" stroke="url(#biyGrYesil)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>',
  "❌": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="#ef4444" opacity=".14"/>' +
    '<circle cx="32" cy="32" r="21" fill="none" stroke="#ef4444" stroke-width="3.5"/>' +
    '<g class="biy-sv-carpi" stroke="#ef4444" stroke-width="4.5" stroke-linecap="round"><line x1="24" y1="24" x2="40" y2="40"/><line x1="40" y1="24" x2="24" y2="40"/></g>',
  "⚠️": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrTuruncu)" opacity=".16"/>' +
    '<path d="M32 12 55 52H9z" fill="none" stroke="url(#biyGrTuruncu)" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<g class="biy-sv-uyari" stroke="url(#biyGrTuruncu)" stroke-width="4" stroke-linecap="round"><line x1="32" y1="27" x2="32" y2="38"/><line x1="32" y1="45" x2="32" y2="45"/></g>',
  "🎉": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrMor)" opacity=".16"/>' +
    '<path d="M14 52 30 20l14 14z" fill="url(#biyGrMor)" opacity=".85"/>' +
    '<g class="biy-sv-serpme" stroke-linecap="round" stroke-width="3.5">' +
      '<line x1="44" y1="14" x2="49" y2="9" stroke="#f59e0b"/><line x1="50" y1="24" x2="57" y2="23" stroke="#10b981"/>' +
      '<line x1="38" y1="9" x2="39" y2="3" stroke="#ef4444"/><line x1="52" y1="34" x2="58" y2="37" stroke="#3b82f6"/></g>',
  "🏅": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrTuruncu)" opacity=".16"/>' +
    '<g class="biy-sv-kurdele"><path d="M22 8l8 18-8 4-4-16z" fill="url(#biyGrMavi)"/><path d="M42 8l-8 18 8 4 4-16z" fill="url(#biyGrMor)"/></g>' +
    '<circle class="biy-sv-madalya" cx="32" cy="42" r="14" fill="url(#biyGrTuruncu)"/>' +
    '<circle cx="32" cy="42" r="9" fill="none" stroke="#fff" stroke-width="2.5" opacity=".85"/>',
  "🏁": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrMavi)" opacity=".14"/>' +
    '<line x1="18" y1="10" x2="18" y2="54" stroke="url(#biyGrMavi)" stroke-width="3.5" stroke-linecap="round"/>' +
    '<g class="biy-sv-bayrak"><rect x="18" y="12" width="28" height="20" fill="url(#biyGrMavi)" opacity=".25"/>' +
      '<rect x="18" y="12" width="7" height="10" fill="url(#biyGrMavi)"/><rect x="32" y="12" width="7" height="10" fill="url(#biyGrMavi)"/>' +
      '<rect x="25" y="22" width="7" height="10" fill="url(#biyGrMavi)"/><rect x="39" y="22" width="7" height="10" fill="url(#biyGrMavi)"/></g>',
  "📺": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrMavi)" opacity=".14"/>' +
    '<rect x="10" y="20" width="44" height="30" rx="4" fill="none" stroke="url(#biyGrMavi)" stroke-width="3.5"/>' +
    '<path d="M22 12l10 8 10-8" fill="none" stroke="url(#biyGrMavi)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<rect class="biy-sv-parlama" x="14" y="24" width="10" height="22" fill="#fff" opacity=".5"/>',
  "✋": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="#ef4444" opacity=".14"/>' +
    '<g class="biy-sv-el" fill="none" stroke="#ef4444" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M24 30V14M32 30V10M40 30V14"/><path d="M18 30v10a16 16 0 0 0 16 16h2a12 12 0 0 0 12-12V24"/></g>',
  "🚪": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrMor)" opacity=".14"/>' +
    '<rect x="16" y="10" width="32" height="44" rx="3" fill="none" stroke="url(#biyGrMor)" stroke-width="3.5"/>' +
    '<circle class="biy-sv-kol" cx="40" cy="33" r="2.8" fill="url(#biyGrMor)"/>',
  "🏆": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrTuruncu)" opacity=".18"/>' +
    '<path class="biy-sv-kupa" d="M22 10h20v14a10 10 0 0 1-20 0z" fill="url(#biyGrTuruncu)"/>' +
    '<path d="M22 14h-6a6 6 0 0 0 6 6M42 14h6a6 6 0 0 1-6 6" fill="none" stroke="url(#biyGrTuruncu)" stroke-width="3" stroke-linecap="round"/>' +
    '<rect x="29" y="34" width="6" height="10" fill="url(#biyGrTuruncu)"/><rect x="20" y="44" width="24" height="6" rx="2" fill="url(#biyGrTuruncu)"/>' +
    '<g class="biy-sv-parilti" fill="#fff"><circle cx="16" cy="26" r="2"/><circle cx="49" cy="30" r="1.6"/><circle cx="45" cy="8" r="1.6"/></g>'
};
function simge(e){
  const ic = SIMGELER[e];
  if (!ic) return e;
  return '<span class="biy-anim"><svg viewBox="0 0 64 64" class="biy-svg" aria-hidden="true">' + ic + '</svg></span>';
}


/* ---- Uygunsuz isim süzgeci ----
   Öğrenci kendi ismini yazdığı için basit bir denetim gerekiyor. Aşağıdaki liste
   yalnızca ilk süzgeç; son söz her zaman öğretmende (onay + düzelt + çıkar).     */
const YASAK_TAM = ["am","aq","mk","amk","ock","oc","göt","got","sik","sok","mal","bok","döl","dol",
  "piç","pic","31","otuzbir","ibne","ipne","seks","sex","salak","aptal","hıyar","hiyar","eşek","esek",
  "gerizekali","gerizekalı","şerefsiz","serefsiz","yavşak","yavsak","oç"];
const YASAK_PARCA = ["orospu","oruspu","orspu","kahpe","pezevenk","gavat","yarrak","yarak","siktir","sikey",
  "sikik","sikim","amina","amına","amcık","amcik","anani","ananı","ananin","götver","gotver","göddd",
  "puşt","pust","kaltak","sürtük","surtuk","dallama","porno","penis","vajina","taşak","tasak","boktan",
  "sperm","mastur","pezo","kancık","kancik","fuck","shit","bitch","pussy","dick","nigg"];
function isimNormal(t){
  let s = String(t || "").toLocaleLowerCase("tr");
  s = s.replace(/[0o]/g,"o").replace(/1|!|\|/g,"i").replace(/3/g,"e").replace(/4/g,"a")
       .replace(/5|\$/g,"s").replace(/7/g,"t").replace(/@/g,"a").replace(/8/g,"b");
  s = s.replace(/[^a-zçğıöşü ]+/g," ");
  s = s.replace(/(.)\1{2,}/g,"$1$1");          // aaaa -> aa
  return s.replace(/\s+/g," ").trim();
}
function isimTemizle(t){
  return String(t || "").replace(/\s+/g," ").trim().slice(0, 18);
}
/* uygunsa "" döner, değilse kullanıcıya gösterilecek sebebi döner */
function isimSorunu(ad){
  const ham = isimTemizle(ad);
  if (ham.length < 2) return "اكْتُبِ اسْمَكَ بِحَرْفَيْنِ عَلَى الأَقَلِّ.";
  if (!/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(ham)) return "يَجِبُ أَنْ يَكُونَ فِي الاسْمِ حُرُوفٌ.";
  const n = isimNormal(ham);
  const kelimeler = n.split(" ").filter(Boolean);
  for (const k of kelimeler){ if (YASAK_TAM.indexOf(k) >= 0) return "هَذَا الاسْمُ غَيْرُ مُنَاسِبٍ، اكْتُبِ اسْمَكَ الحَقِيقِيَّ."; }
  const bitisik = n.replace(/ /g,"");
  for (const p of YASAK_PARCA){ if (bitisik.indexOf(p) >= 0) return "هَذَا الاسْمُ غَيْرُ مُنَاسِبٍ، اكْتُبِ اسْمَكَ الحَقِيقِيَّ."; }
  return "";
}
/* aynı isimden ikinci kişi gelirse "Ahmet (2)" yapılır */
function isimBenzersiz(ad, mevcutAdlar){
  const kucuk = a => String(a||"").toLocaleLowerCase("tr").trim();
  const set = new Set((mevcutAdlar||[]).map(kucuk));
  if (!set.has(kucuk(ad))) return ad;
  let i = 2; while (set.has(kucuk(ad + " (" + i + ")")) && i < 40) i++;
  return ad + " (" + i + ")";
}
function temizSoru(s){  // takıma gidecek hâli — DOĞRU CEVAP YOK
  const b = bicimAl(s);
  const o = { tip: s.tip, bicim: b, zorluk: s.zorluk, soru: s.soru, arapca: s.arapca || null };
  if (b === "surukle"){
    o.karisik = s.karisik || karistir(s.parcalar);
  } else if (b === "eslestir"){
    o.sollar     = s.sollar     || (s.ciftler || []).map(c => c[0]);
    o.sagKarisik = s.sagKarisik || karistir((s.ciftler || []).map(c => c[1]));
  } else if (b === "yazma"){
    o.tusKarisik = s.tusKarisik || karistir(s.tuslar);
    o.harfSayi   = String(s.cevapYazi || "").replace(/\s+/g, "").length;
  } else {
    o.secenekler = s.secenekler;
    o.arSecenek  = !!s.arSecenek;
  }
  return o;
}
function soruHazirla(s){  // biçime göre karıştırma (doğru cevap hep aynı yerde olmasın)
  const b = bicimAl(s);
  if (b === "surukle"){
    const p = s.parcalar || [];
    let k = karistir(p);
    if (p.length > 1 && k.join("|") === p.join("|")) k = k.slice().reverse();
    return Object.assign({}, s, { karisik: k });
  }
  if (b === "eslestir"){
    const c = karistir(s.ciftler || []);
    let sag = karistir(c.map(x => x[1]));
    if (c.length > 1 && sag.join("|") === c.map(x => x[1]).join("|")) sag = sag.slice().reverse();
    return Object.assign({}, s, { ciftler: c, sollar: c.map(x => x[0]), sagKarisik: sag });
  }
  if (b === "yazma"){
    return Object.assign({}, s, { tusKarisik: karistir(s.tuslar || []) });
  }
  const idx = s.secenekler.map((_, i) => i);
  for (let i = idx.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); const g = idx[i]; idx[i] = idx[j]; idx[j] = g; }
  return Object.assign({}, s, { secenekler: idx.map(i => s.secenekler[i]), dogru: idx.indexOf(s.dogru) });
}
function tsMillis(ts){
  if (!ts) return null;
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds != null) return ts.seconds*1000;
  return null;
}
function kalanSaniye(){
  const o = state.oda; if (!o) return SORU_SURESI;
  const bas = tsMillis(o.soruBaslangic);
  if (bas == null) return o.soruSuresi || SORU_SURESI;
  return Math.max(0, Math.ceil((o.soruSuresi || SORU_SURESI) - (Date.now() - bas)/1000));
}
function sayacBaslat(render){
  sayacDurdur();
  state.sayacInterval = setInterval(render, 400);
}
function sayacDurdur(){ if (state.sayacInterval){ clearInterval(state.sayacInterval); state.sayacInterval = null; } }

/* ===========================================================
   BIY
   =========================================================== */
const BIY = {

  anasayfa(){ sayacDurdur(); ekranGoster("ekranAnasayfa"); BIY._menuDurum(); },

  // Geri: dosyadan çık. Bağlı cihaz varsa onay iste; çıkışta odayı kapat (cihazlar ayrılsın).
  geriDon(){
    if (state.odaId && (state.takimListe || []).some(t => t.bagli)){
      BIY._onay("هَلْ تَخْرُجُ؟", "هُنَاكَ أَجْهِزَةٌ مُتَّصِلَةٌ — إِذَا خَرَجْتَ سَيَنْقَطِعُ اتِّصَالُهَا.", "نَعَمْ، اخْرُجْ", function(){ BIY._geriCik(); });
      return;
    }
    BIY._geriCik();
  },
  async _geriCik(){
    if (state.odaId){
      try { await db.collection(KOLEKSIYON).doc(state.odaId).update({ durum: "bitti", sonSira: [] }); } catch(e){}
      try { if (state.odaAboneAdmin) state.odaAboneAdmin(); if (state.cevapAbone) state.cevapAbone(); if (state.takimAbone) state.takimAbone(); } catch(e){}
      BIY._temizleKayit();
    }
    /* Bu dosya 1. unite oyunlari klasorunde duruyor; geri tusu oyun listesine
       (index.html) doner. Ayni klasorde oldugu icin goreli adres yeterli.     */
    location.href = "index.html";
  },

  /* ---------- Konu seçimi ---------- */
  _aktifKonu(){ return state.konuId ? (KONULAR.find(k => k.id === state.konuId) || null) : null; },
  _aktifSorular(){ const k = BIY._aktifKonu(); return (k && k.sorular) || []; },
  _konuVurgu(){ const sel = $("konuSecim"); if (sel) sel.classList.toggle("secili", !!state.konuId); },
  // tüm konulardaki soruların havuzu (elle seçim için)
  _soruHavuzu(){
    const havuz = [];
    KONULAR.forEach(k => { if (Array.isArray(k.sorular)) k.sorular.forEach(q => havuz.push({ key: k.id + "#" + q.id, konuId: k.id, konuAd: k.ad, soru: q })); });
    return havuz;
  },
  _konulariHazirla(){
    const sel = $("konuSecim"); if (!sel) return;
    sel.innerHTML = '<option value=""'+(state.konuId?'':' selected')+' disabled hidden>اخْتَرِ الدَّرْسَ…</option>' +
      KONULAR.map(k => '<option value="'+k.id+'"'+(k.pasif?' disabled':'')+(k.id===state.konuId?' selected':'')+'>'+kacis(k.ad)+(k.pasif?' · قَرِيبًا':'')+'</option>').join("");
    if (!state.konuId) sel.value = "";
    BIY._konuVurgu();
    BIY._pdfOnizleGuncelle();
  },
  konuSec(id){
    state.konuId = id || null;
    if (state.konuId){
      const set = BIY._secSet();
      if (set.size){ set.clear(); state.soruSayisi = null; }   // havuzdan vazgeçildi → seçimi + soru sayısını sıfırla
    }
    BIY._konuVurgu();
    BIY._soruSecSayiGuncelle();   // havuz tuşu/sayaç + pdf + sınır + menü hepsini günceller
  },

  /* ---------- Soru Havuzu (elle seçim) ---------- */
  _secSet(){ if (!state.secilenSet) state.secilenSet = new Set(); return state.secilenSet; },
  _soruSecSayiGuncelle(){
    const n = BIY._secSet().size;
    // havuzdan soru seçildiyse konu seçimi kalkar (tek kaynak: havuz ya da konu)
    if (n > 0 && state.konuId){ state.konuId = null; const sel = $("konuSecim"); if (sel) sel.value = ""; BIY._konuVurgu(); }
    const b = $("soruSecSayi"); if (b) b.textContent = "(" + n + ")";
    const btn = $("soruSecBtn"); if (btn) btn.classList.toggle("biy-secili-var", n > 0);
    BIY._pdfOnizleGuncelle();
    BIY._soruSayiSinir();
    BIY._menuDurum();
  },
  soruSecAc(){
    if ($("soruSecBtn") && $("soruSecBtn").disabled) return;
    const eski = $("biySoruSec"); if (eski) eski.remove();
    state.soruSecArama = "";
    const ov = document.createElement("div"); ov.id = "biySoruSec"; ov.className = "biy-onay-ov biy-soru-sec-ov";
    ov.innerHTML =
      '<div class="biy-soru-sec-kutu">' +
        '<div class="biy-soru-sec-bas">' +
          '<h3>🎯 مَخْزُونُ الأَسْئِلَةِ</h3>' +
          '<span class="biy-soru-sec-say" id="soruSecSecili"></span>' +
          '<button class="biy-soru-sec-kapat" onclick="BIY.soruSecKapat()">✕</button>' +
        '</div>' +
        '<div class="biy-soru-sec-liste" id="soruSecListe"></div>' +
        '<div class="biy-soru-sec-alt">' +
          '<button class="biy-btn biy-onay-hayir" onclick="BIY.soruSecTemizle()">مَسْحُ الكُلِّ</button>' +
          '<button class="biy-btn biy-btn-yesil" onclick="BIY.soruSecKapat()">تَمَّ</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) BIY.soruSecKapat(); });
    BIY._soruSecRender();
  },
  soruSecAra(v){ state.soruSecArama = (v||"").toLowerCase(); BIY._soruSecRender(); },
  _soruSecRender(){
    const kap = $("soruSecListe"); if (!kap) return;
    const set = BIY._secSet();
    const ara = state.soruSecArama;
    const zorAd = { 1:"سَهْلٌ", 2:"مُتَوَسِّطٌ", 3:"صَعْبٌ" };
    let html = "";
    KONULAR.forEach(k => {
      if (!Array.isArray(k.sorular) || !k.sorular.length) return;
      const sorular = k.sorular.filter(q => !ara || (q.soru + " " + (q.arapca||"") + " " + aramaMetni(q)).toLowerCase().indexOf(ara) >= 0);
      if (!sorular.length) return;
      const seciliSay = k.sorular.filter(q => set.has(k.id + "#" + q.id)).length;
      const acik = ara ? true : !!(state.soruSecAcik && state.soruSecAcik[k.id]);
      html += '<div class="biy-hs-grup'+(acik?' acik':'')+'" data-konu="'+k.id+'">' +
        '<div class="biy-hs-baslik" onclick="BIY.soruSecAkordiyon(\''+k.id+'\')">' +
        '<span class="biy-hs-ok">▸</span>' +
        '<b>'+kacis(k.ad)+'</b> <span class="biy-hs-say">('+seciliSay+'/'+k.sorular.length+')</span>' +
        '<button class="biy-hs-tumu" onclick="event.stopPropagation();BIY.soruSecTumu(\''+k.id+'\')">تَحْدِيدُ الكُلِّ</button></div>' +
        '<div class="biy-hs-govde">';
      sorular.forEach(q => {
        const key = k.id + "#" + q.id; const sec = set.has(key);
        const dogruSik = dogruCevapMetni(q);
        html += '<label class="biy-hs-satir'+(sec?' secili':'')+'" data-key="'+key+'">' +
          '<input type="checkbox" '+(sec?'checked':'')+' onchange="BIY.soruSecTik(\''+key+'\', this)">' +
          '<span class="biy-hs-metin">'+kacis(q.soru)+(q.arapca?' <i>'+kacis(q.arapca)+'</i>':'')+
            ' <b class="biy-hs-dogru">✓ '+kacis(dogruSik)+'</b></span>' +
        '</label>';
      });
      html += '</div></div>';
    });
    kap.innerHTML = html || '<p class="biy-alt" style="text-align:center">لَا نَتِيجَةَ.</p>';
    BIY._soruSecSayilar();
  },
  // sayaçları (grup başlıkları + toplam + buton) satırları yeniden çizmeden güncelle
  _soruSecSayilar(){
    const set = BIY._secSet();
    document.querySelectorAll(".biy-hs-grup").forEach(g => {
      const k = KONULAR.find(x => x.id === g.getAttribute("data-konu")); if (!k) return;
      const sec = k.sorular.filter(q => set.has(k.id + "#" + q.id)).length;
      const sp = g.querySelector(".biy-hs-say"); if (sp) sp.textContent = "(" + sec + "/" + k.sorular.length + ")";
    });
    const say = $("soruSecSecili"); if (say) say.textContent = "المُحَدَّدُ: " + set.size;
    BIY._soruSecSayiGuncelle();
  },
  // tek satır: yeniden çizmeden aç/kapa (kaydırma korunur)
  soruSecTik(key, cb){
    const set = BIY._secSet();
    if (set.has(key)) set.delete(key); else set.add(key);
    if (cb){ const row = cb.closest(".biy-hs-satir"); if (row) row.classList.toggle("secili", cb.checked); }
    BIY._soruSecSayilar();
  },
  // akordiyon: başlığa tıkla → aç/kapa (yeniden çizmeden, kaydırma korunur)
  soruSecAkordiyon(konuId){
    if (!state.soruSecAcik) state.soruSecAcik = {};
    state.soruSecAcik[konuId] = !state.soruSecAcik[konuId];
    const g = document.querySelector('.biy-hs-grup[data-konu="'+konuId+'"]');
    if (g) g.classList.toggle("acik", !!state.soruSecAcik[konuId]);
  },
  soruSecTumu(konuId){
    const set = BIY._secSet();
    const k = KONULAR.find(x => x.id === konuId); if (!k) return;
    const hepsiSecili = k.sorular.every(q => set.has(konuId + "#" + q.id));
    k.sorular.forEach(q => { const key = konuId + "#" + q.id; if (hepsiSecili) set.delete(key); else set.add(key); });
    BIY._soruSecRender();
  },
  soruSecTemizle(){ BIY._secSet().clear(); BIY._soruSecRender(); BIY._soruSecSayiGuncelle(); },
  soruSecKapat(){ const ov = $("biySoruSec"); if (ov) ov.remove(); BIY._soruSecSayiGuncelle(); },
  // elle seçilen sorular (havuzdan) — sıralı liste
  _secilenSorular(){
    const set = BIY._secSet(); if (!set.size) return [];
    return BIY._soruHavuzu().filter(h => set.has(h.key)).map(h => h.soru);
  },
  // seçili konu+seviyedeki mevcut soruya göre soru sayısı üst sınırını ayarla
  _soruSayiSinir(){
    const havuz = BIY._secSet().size;
    const inp = $("soruSayiInput");
    const lbl = document.querySelector(".biy-sorusayi-secim .biy-seviye-label");
    // HAVUZ seçili → soru sayısı = seçilen soru sayısı (sabit); hazır rakamlar pasif, manuel alanda o sayı yazılı
    if (havuz > 0){
      state.soruSayiMax = havuz;
      state.soruSayisi = havuz;
      state.soruSayiHavuzdan = true;   // bu sayı havuzdan geldi → havuz bırakılınca sıfırlanacak
      document.querySelectorAll(".biy-sayi-btn").forEach(b => { b.disabled = true; b.classList.add("biy-pasif"); b.classList.remove("secili"); });
      if (inp){ inp.disabled = false; inp.readOnly = true; inp.max = havuz; inp.min = 1; inp.value = havuz; inp.classList.add("biy-secili"); }
      if (lbl) lbl.textContent = "عَدَدُ الأَسْئِلَةِ (مِنَ المَخْزُونِ " + havuz + "):";
      return;
    }
    // havuz modundan çıkıldıysa havuz kaynaklı soru sayısını sıfırla (öğretmen yeniden seçsin)
    if (state.soruSayiHavuzdan){ state.soruSayisi = null; state.soruSayiHavuzdan = false; }
    let mevcut;
    // dijital yarışma seçilen zorluğu önceliklendirip gerekirse diğer zorluklardan tamamlar → üst sınır konunun TÜM sorusu
    if (state.konuId) mevcut = BIY._aktifSorular().length;
    else mevcut = 50;                                                    // konu/havuz yok → sınır uygulanmasın
    const max = Math.max(1, Math.min(50, mevcut));
    state.soruSayiMax = max;
    document.querySelectorAll(".biy-sayi-btn").forEach(b => {
      const v = +b.getAttribute("data-sayi"); const dis = v > max;
      b.disabled = dis; b.classList.toggle("biy-pasif", dis);
    });
    if (inp){ inp.disabled = false; inp.readOnly = false; inp.classList.remove("biy-secili"); inp.max = max; inp.min = 1; inp.placeholder = "≤ " + max; }
    if (lbl) lbl.textContent = "عَدَدُ الأَسْئِلَةِ (بِحَدٍّ أَقْصَى " + max + "):";
    if (state.soruSayisi != null){ if (state.soruSayisi > max) BIY.setSoruSayisi(max); else BIY.setSoruSayisi(state.soruSayisi); }
    else { document.querySelectorAll(".biy-sayi-btn").forEach(b => b.classList.remove("secili")); if (inp) inp.value = ""; }
  },
  _pdfOnizleGuncelle(){
    const havuz = BIY._secSet().size;
    const k = BIY._aktifKonu();
    const baslik = $("pdfBaslik"); if (baslik) baslik.textContent = havuz > 0 ? "مُخْتَلِطٌ" : (k ? (k.ad || "") : "");
    const kart = $("pdfKart"), indir = $("pdfIndir");
    // PDF'ler henüz hazır değil → tüm önizleme bloğunu gizle (PDF_AKTIF=true olunca geri gelir)
    const blok = kart && kart.closest(".biy-pdf-onizleme");
    if (blok) blok.classList.toggle("gizli", !PDF_AKTIF);
    if (!PDF_AKTIF){
      if (kart){ kart.removeAttribute("href"); kart.classList.add("biy-pasif"); }
      if (indir){ indir.removeAttribute("href"); indir.classList.add("gizli"); }
      return;
    }
    const varMi = !havuz && !!(k && k.pdf);
    const url = varMi ? encodeURI(k.pdf) : "";
    if (kart){ if (varMi){ kart.href = url; kart.classList.remove("biy-pasif"); } else { kart.removeAttribute("href"); kart.classList.add("biy-pasif"); } }
    if (indir){
      if (varMi){ indir.href = url; indir.setAttribute("download", k.pdf); indir.classList.remove("gizli"); }
      else { indir.removeAttribute("href"); indir.classList.add("gizli"); }
    }
  },

  /* ---------- Sorular önizleme ---------- */
  acSorular(){ BIY.sorularSekme(state.sorularZ || 1); ekranGoster("ekranSorular"); },
  sorularSekme(z){
    state.sorularZ = z;
    document.querySelectorAll(".biy-sekme").forEach(b => b.classList.toggle("secili", +b.getAttribute("data-z") === z));
    const liste = $("sorularListe"); liste.innerHTML = "";
    const list = BIY._aktifSorular().filter(s => s.zorluk === z);
    if (!list.length){ liste.innerHTML = '<p class="biy-alt" style="text-align:center">لَا أَمْثِلَةَ فِي هَذَا المُسْتَوَى بَعْدُ.</p>'; return; }
    // her soru tipinden yalnızca bir örnek göster (tüm sorular değil)
    const gorulen = new Set(); const ornekler = [];
    list.forEach(s => { if (!gorulen.has(s.tip)){ gorulen.add(s.tip); ornekler.push(s); } });
    ornekler.forEach(s => liste.appendChild(BIY._soruKartEl(s, true)));
  },
  _soruKartEl(s, dogruGoster){
    const t = TIP_BILGI[s.tip] || { ad: s.tip, emoji: "❓" };
    const kart = document.createElement("div"); kart.className = "biy-soru-kart";
    const sikHtml = sikKartHtml(s, dogruGoster);
    kart.innerHTML =
      '<span class="biy-soru-tip">'+t.emoji+' '+t.ad+'</span>' +
      '<span class="biy-zorluk z'+s.zorluk+'">'+ ZORLUK_AD[s.zorluk] +'</span>' +
      '<div class="biy-soru-metin">'+ kacis(s.soru) +'</div>' +
      (s.arapca ? '<div class="biy-soru-arapca">'+ kacis(s.arapca) +'</div>' : '') +
      '<div class="biy-secenekler">'+ sikHtml +'</div>';
    return kart;
  },

  // ana menü kartları: geçerli içerik (havuz soruları veya soru içeren konu) seçiliyken aktif olur
  _menuDurum(){
    const havuz = BIY._secSet().size;
    const konuVar = (BIY._aktifSorular().length > 0);
    const icerik = havuz > 0 || konuVar;                 // konu ya da havuzdan soru
    const sayiSecili = (state.soruSayisi != null && state.soruSayisi > 0);  // soru sayısı seçili
    const aktif = icerik && sayiSecili;
    ["kartTakim", "kartBirey", "kartOkul"].forEach(id => { const el = $(id); if (el) el.classList.toggle("biy-pasif", !aktif); });
    const not = $("menuNot"); if (not) not.classList.toggle("gizli", aktif);
    BIY._dijitalKartDurum();
  },
  // bağlı cihaz varsa Dijital Yarışma kartının çerçevesi yeşil + rozet
  _dijitalKartDurum(){
    const bagli = (state.takimListe || []).filter(t => t.bagli).length;
    const aktifOda = !!state.odaId && bagli > 0;
    // rozet yalnızca odanın açıldığı modun kartında görünür
    const kartId = { takim: "kartTakim", birey: "kartBirey", okul: "kartOkul" };
    Object.keys(kartId).forEach(m => {
      const el = $(kartId[m]); if (!el) return;
      const bu = aktifOda && modAl() === m;
      el.classList.toggle("biy-bagli-var", bu);
      const r = el.querySelector(".biy-bagli-rozet");
      if (r){ r.textContent = "● " + bagli + " جِهَازًا مُتَّصِلًا"; r.classList.toggle("gizli", !bu); }
    });
  },

  /* ---------- Lobi (üç mod ortak) ---------- */
  acTakimlar(){ return BIY.acLobi("takim"); },
  acLobi(mod){
    if (!MOD_BILGI[mod]) mod = "takim";
    // başka modda açık bir oda varsa önce onay iste
    if (state.odaId && state.oyunModu !== mod){
      const eskiAd = (MOD_BILGI[state.oyunModu] || {}).ad || "المُسَابَقَةِ";
      BIY._onay("هَلْ تُغَيِّرُ النِّظَامَ؟",
        "هُنَاكَ غُرْفَةٌ مَفْتُوحَةٌ مِنْ " + eskiAd + ". إِذَا غَيَّرْتَ النِّظَامَ سَتُتْرَكُ تِلْكَ الغُرْفَةُ وَأَجْهِزَتُهَا.",
        "نَعَمْ، غَيِّرْ", () => BIY._lobiAc(mod));
      return;
    }
    BIY._lobiAc(mod);
  },
  async _lobiAc(mod){
    if (state.oyunModu !== mod){        // gerçek mod değişimi → eski odayı bırak
      BIY._odaBirak();
      state.oyunModu = mod;
    }
    state.oyunModu = mod;
    ekranGoster("ekranTakimlar");
    BIY._lobiDuzen();
    if (!state.odaId){
      $("takimlarGrid").innerHTML = "";
      const b = $("baslatBtn"); if (b) b.classList.add("gizli");
      const n = $("baslatNot"); if (n) n.textContent = "";
      BIY._kontrolleriAc();
    }
    BIY._soruSayiSinir(); BIY._soruSecSayiGuncelle();
    // birey/okul: oda hemen kurulur ki ortak karekod ekranda dursun
    if (tekKarekod()){
      try { await BIY._odayiHazirla(); BIY._odaKarekodCiz(); }
      catch(e){ console.error(e); $("baslatNot").textContent = "تَعَذَّرَ إِنْشَاءُ الغُرْفَةِ: " + (e.code || e.message); }
    }
  },
  // odayı bırak (silmez): abonelikleri kapat, ekranı temizle
  _odaBirak(){
    if (state.takimAbone){ state.takimAbone(); state.takimAbone = null; }
    if (state.odaAboneAdmin){ state.odaAboneAdmin(); state.odaAboneAdmin = null; }
    if (state.cevapAbone){ state.cevapAbone(); state.cevapAbone = null; }
    state.odaId = null; state.oda = null; state.takimListe = []; state.bekleyenListe = [];
    state.baglSet = null; state.baglIlk = false; state.cevaplar = {};
    BIY._temizleKayit();
  },
  // lobi ekranının hangi bölümleri görünecek (moda göre)
  _lobiDuzen(){
    const m = modAl(), bilgi = MOD_BILGI[m];
    const bas = $("lobiBaslik"); if (bas) bas.textContent = bilgi.emoji + " " + bilgi.baslik;
    const goster = (id, evet) => { const el = $(id); if (el) el.classList.toggle("gizli", !evet); };
    /* Takım ve Okul modu aynı akış: öğretmen ad yazar, her ada bir karekod
       çıkar. Tek ortak karekod + onay kuyruğu yalnız Birey modundadır.     */
    goster("takimYapAlan", m !== "birey");
    goster("lobiOdaAlan",  m === "birey");
    goster("lobiBekleyen", m === "birey");
    const grid = $("takimlarGrid");
    if (grid) grid.className = (m === "birey") ? "biy-kat-liste" : "biy-takimlar-grid";
    // ekleme alanının yazıları moda göre (takım adı / sınıf adı)
    const inp = $("takimAdiInput");
    if (inp) inp.placeholder = (m === "okul") ? "اسْمُ الصَّفِّ (٧/أ)" : "اسْمُ الفَرِيقِ";
    const ekleBtn = $("takimEkleBtn");
    if (ekleBtn) ekleBtn.textContent = (m === "okul") ? "+ أَضِفْ صَفًّا" : "+ أَضِفْ فَرِيقًا";
  },
  // --- Kalıcılık (sayfa yenilense de oyun kaybolmasın) ---
  _kaydet(){
    try { localStorage.setItem('biy_aktif', JSON.stringify({ oda: state.odaId, sorular: state.oyunSorulari, yedek: state.yedekSorular, yedekMap: state.yedekSoruMap, seviye: state.seviye, soruSayisi: state.soruSayisi,
      ber: { hedef: state.berHedef, takimlar: state.berTakimlar, sabit: state.berSabit, no: state.berNo, sorular: state.berSorular }, ts: Date.now() })); } catch(e){}
  },
  _temizleKayit(){ try { localStorage.removeItem('biy_aktif'); } catch(e){} },
  async _devamEt(kayit){
    try {
      if (kayit.ts && (Date.now() - kayit.ts) > 12*3600*1000){ BIY._temizleKayit(); ekranGoster('ekranAnasayfa'); return; }
      const ref = db.collection(KOLEKSIYON).doc(kayit.oda);
      const snap = await ref.get();
      const dr0 = snap.exists ? snap.data().durum : null;
      // yalnızca AKTİF oyun (oyun/beraberlik) kaldığı yerden devam eder; lobi/bitti → ana sayfa
      if (dr0 !== 'oyun' && dr0 !== 'beraberlik'){ BIY._temizleKayit(); ekranGoster('ekranAnasayfa'); return; }
      state.odaId = kayit.oda;
      const od0 = snap.data() || {};
      state.oyunModu = MOD_BILGI[od0.mod] ? od0.mod : "takim";
      state.oyunSorulari = Array.isArray(kayit.sorular) ? kayit.sorular : [];
      state.yedekSorular = Array.isArray(kayit.yedek) ? kayit.yedek : [];
      state.yedekSoruMap = kayit.yedekMap || {};
      state.soruSayisi = kayit.soruSayisi || 20;
      if (kayit.ber){ state.berHedef = kayit.ber.hedef||0; state.berTakimlar = kayit.ber.takimlar||[]; state.berSabit = kayit.ber.sabit||{}; state.berNo = kayit.ber.no||0; state.berSorular = kayit.ber.sorular||[]; }
      if (state.takimAbone) state.takimAbone();
      state.takimAbone = ref.collection('takimlar').orderBy('olusturmaZamani').onSnapshot(s => BIY._takimlariCiz(s));
      BIY._adminOyunaGec();   // aktif oyuna geri dön
    } catch(e){ console.error('Devam hatası:', e); BIY._temizleKayit(); ekranGoster('ekranAnasayfa'); }
  },
  // özel onay penceresi (native confirm yerine)
  _onay(baslik, metin, evetMetin, onEvet){
    const eski = $("biyOnay"); if (eski) eski.remove();
    const ov = document.createElement("div"); ov.id = "biyOnay"; ov.className = "biy-onay-ov";
    ov.innerHTML = '<div class="biy-onay-kutu"><h3>'+kacis(baslik)+'</h3><p>'+kacis(metin)+'</p>' +
      '<div class="biy-onay-btnlar"><button class="biy-onay-hayir">إِلْغَاءٌ</button><button class="biy-onay-evet">'+kacis(evetMetin)+'</button></div></div>';
    document.body.appendChild(ov);
    const kapat = () => { if (ov.parentNode) ov.remove(); };
    ov.querySelector(".biy-onay-hayir").onclick = kapat;
    ov.querySelector(".biy-onay-evet").onclick = () => { kapat(); onEvet(); };
    ov.addEventListener("click", e => { if (e.target === ov) kapat(); });
  },
  // canlı yarışmadan çıkış → lobiye dön (takım bağlantıları KORUNUR)
  yaristanCik(){
    BIY._onay("هَلْ تَعُودُ إِلَى الانْتِظَارِ؟",
      "سَتَتَوَقَّفُ المُسَابَقَةُ وَتَعُودُ إِلَى الانْتِظَارِ. تَبْقَى الأَجْهِزَةُ مُتَّصِلَةً — يُمْكِنُكَ تَغْيِيرُ الدَّرْسِ أَوْ عَدَدِ الأَسْئِلَةِ ثُمَّ البَدْءُ مِنْ جَدِيدٍ.",
      "نَعَمْ، عُدْ", function(){ BIY.lobiyeDon(); });
  },
  // oyunu durdurup lobiye döner; oda + takım karekod bağlantıları kopmaz
  async lobiyeDon(){
    // 1) oyun dinleyicilerini kapat (takım aboneliği KORUNUR → kartlar canlı kalır)
    if (state.odaAboneAdmin){ state.odaAboneAdmin(); state.odaAboneAdmin = null; }
    if (state.cevapAbone){ state.cevapAbone(); state.cevapAbone = null; }
    sayacDurdur(); BIY._sonucTemizle();
    // 2) odayı lobiye al + eski cevapları temizle (yeni tura karışmasın), bağlantı kopmaz
    try {
      if (state.odaId){
        await BIY._cevaplariSil();
        await db.collection(KOLEKSIYON).doc(state.odaId).update({
          durum: "lobi", faz: "cevap", aktifIndex: -1, toplamSoru: 0,
          sonSira: [], berHedef: 0, berTakimlar: [], berSabit: {}, berNo: 0
        });
      }
    } catch(e){ console.error(e); }
    // 3) oyun/beraberlik state'ini sıfırla (odaId ve takımlar korunur)
    state.oyunSorulari = []; state.oda = null; state.otoSonucIndex = -1; state.sonucAnimIndex = -1; state.finalKonfeti = false;
    state.hepsiSesIndex = -1;
    state.yedekSorular = []; state.yedekSoruMap = {}; state.berHedef = 0; state.berTakimlar = []; state.berSabit = {}; state.berNo = 0; state.berSorular = [];
    state.ayarKilidiKapali = true;   // lobiye döndük → ayarlar takım bağlıyken de değiştirilebilir
    BIY._temizleKayit();
    // 4) lobi ekranına dön, ayarları aç
    ekranGoster("ekranTakimlar");
    BIY._kontrolleriAc();
    BIY._soruSayiSinir(); BIY._soruSecSayiGuncelle();
  },
  // odanın cevaplar alt-koleksiyonunu temizle (oda yeniden kullanılırken)
  _cevaplariSil(){
    if (!state.odaId) return Promise.resolve();
    return db.collection(KOLEKSIYON).doc(state.odaId).collection("cevaplar").get().then(cs => {
      if (cs.empty) return;
      const batch = db.batch(); cs.forEach(d => batch.delete(d.ref)); return batch.commit();
    }).catch(e => console.warn("cevap temizle:", e));
  },
  oyunuBitir(){
    BIY._temizleKayit();
    if (state.odaAboneAdmin) state.odaAboneAdmin();
    if (state.cevapAbone) state.cevapAbone();
    if (state.takimAbone) state.takimAbone();
    BIY._sonucTemizle();
    state.odaId = null; state.oyunSorulari = []; state.oda = null; state.otoSonucIndex = -1; state.sonucAnimIndex = -1; state.finalKonfeti = false;
    state.baglSet = null; state.baglIlk = false; state.hepsiSesIndex = -1;
    state.yedekSorular = []; state.yedekSoruMap = {}; state.berHedef = 0; state.berTakimlar = []; state.berSabit = {}; state.berNo = 0; state.berSorular = [];
    state.ayarKilidiKapali = false;
    if (state.secilenSet) state.secilenSet.clear(); BIY._soruSecSayiGuncelle();
    BIY._kontrolleriAc();
    const bB = $("baslatBtn"); if (bB) bB.classList.add("gizli");
    const bN = $("baslatNot"); if (bN) bN.textContent = "";
    BIY.anasayfa();
  },
  // takım silinince/yarış bitince kilitli tüm ayar kontrollerini yeniden aç
  _kontrolleriAc(){
    document.querySelectorAll(".biy-seviye-btn, .biy-sayi-btn").forEach(b => { b.disabled = false; b.classList.remove("biy-pasif"); });
    ["soruSayiInput", "soruSecBtn", "konuSecim"].forEach(id => { const el = $(id); if (el){ el.disabled = false; el.classList.remove("biy-pasif"); } });
    document.querySelectorAll(".biy-seviye-label").forEach(l => l.classList.remove("biy-pasif"));
  },

  async _odayiHazirla(){
    if (state.odaId) return state.odaId;
    let kod, ref, mevcut = true, deneme = 0;
    while (mevcut && deneme < 6){
      kod = rastgeleKod(4); ref = db.collection(KOLEKSIYON).doc(kod);
      const snap = await ref.get(); mevcut = snap.exists; deneme++;
    }
    await ref.set({
      durum: "lobi", faz: "cevap", aktifIndex: -1, toplamSoru: 0, soruSuresi: SORU_SURESI,
      mod: modAl(),
      olusturan: state.uid || null, olusturmaZamani: firebase.firestore.FieldValue.serverTimestamp()
    });
    state.odaId = kod;
    if (state.takimAbone) state.takimAbone();
    state.takimAbone = db.collection(KOLEKSIYON).doc(kod).collection("takimlar")
      .orderBy("olusturmaZamani").onSnapshot(snap => BIY._takimlariCiz(snap));
    BIY._kaydet();
    return kod;
  },
  async takimEkle(){
    const inp = $("takimAdiInput"); const ad = (inp.value || "").trim();
    if (!ad){ inp.focus(); return; }
    inp.value = "";
    try {
      const oda = await BIY._odayiHazirla();
      const takimId = rastgeleKod(5);
      await db.collection(KOLEKSIYON).doc(oda).collection("takimlar").doc(takimId).set({
        ad: ad, bagli: false, puan: 0, olusturmaZamani: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(e){ console.error(e); $("baslatNot").textContent = (modAl()==="okul"?"صَفٌّ":"فَرِيقٌ") + " لَمْ يُضَفْ: " + (e.code || e.message); }
  },
  _takimlariCiz(snap){
    state.takimListe = []; state.bekleyenListe = [];
    snap.forEach(doc => {
      const t = doc.data();
      const k = { id: doc.id, ad: t.ad, bagli: !!t.bagli, puan: t.puan || 0 };
      if (t.atildi || t.red) return;                 // çıkarılan / reddedilen listede yok
      if (t.onay === false) state.bekleyenListe.push(k);   // onay bekliyor
      else state.takimListe.push(k);                        // takım modunda onay alanı hiç yoktur
    });
    let sayi = state.takimListe.length;
    let bagli = state.takimListe.filter(t => t.bagli).length;
    if (kartliMod()) BIY._takimKartlariCiz(); else BIY._katilimcilariCiz();
    // takım eklendiyse zorluk seviyesi, soru sayısı ve soru seçimi kilitlenir; hepsi silinince açılır
    // (lobiye dönüldüyse ayarKilidiKapali=true → takım bağlıyken de değiştirilebilir)
    const kilit = sayi > 0 && !state.ayarKilidiKapali;
    document.querySelectorAll(".biy-seviye-btn, .biy-sayi-btn").forEach(b => { b.disabled = kilit; b.classList.toggle("biy-pasif", kilit); });
    const sInp = $("soruSayiInput"); if (sInp){ sInp.disabled = kilit; sInp.classList.toggle("biy-pasif", kilit); }
    const ssBtn = $("soruSecBtn"); if (ssBtn){ ssBtn.disabled = kilit; ssBtn.classList.toggle("biy-pasif", kilit); }
    const kSel = $("konuSecim"); if (kSel){ kSel.disabled = kilit; kSel.classList.toggle("biy-pasif", kilit); }
    const sLbl = document.querySelector(".biy-sorusayi-secim .biy-seviye-label");
    const zLbl = document.querySelector(".biy-seviye-secim .biy-seviye-label");
    if (zLbl) zLbl.classList.toggle("biy-pasif", kilit);
    if (sLbl) sLbl.classList.toggle("biy-pasif", kilit);
    if (!kilit) BIY._soruSayiSinir();   // kilit açıldıysa mevcut soruya göre üst sınırı yeniden uygula

    const baslat = $("baslatBtn");
    const d = BIY._baslatDurumu();
    if (d.olur) baslat.classList.remove("gizli"); else baslat.classList.add("gizli");
    $("baslatNot").textContent = d.not;
    // yeni bağlanan takım(lar) için ses (açılışta çalmaz)
    const simdiBagli = new Set(state.takimListe.filter(t => t.bagli).map(t => t.id));
    if (state.baglIlk && state.baglSet){
      let yeni = false; simdiBagli.forEach(id => { if (!state.baglSet.has(id)) yeni = true; });
      if (yeni) SES.baglandi();
    }
    state.baglSet = simdiBagli; state.baglIlk = true;
    BIY._dijitalKartDurum();   // ana menü kartı için bağlı cihaz göstergesini güncelle
  },
  async takimSil(takimId){
    if (!state.odaId) return;
    try { await db.collection(KOLEKSIYON).doc(state.odaId).collection("takimlar").doc(takimId).delete(); } catch(e){ console.error(e); }
  },
  kopyala(btn){
    const inp = btn.parentElement.querySelector("input");
    inp.select(); inp.setSelectionRange(0, 99999);
    try { navigator.clipboard.writeText(inp.value); btn.textContent = "✓"; setTimeout(()=>btn.textContent="نَسْخٌ", 1200); } catch(e){ document.execCommand("copy"); }
  },

  /* ---------- YARIŞMAYI BAŞLAT (oyun döngüsü) ---------- */
  setSoruSayisi(n){
    const max = state.soruSayiMax || 50;
    n = Math.max(1, Math.min(max, parseInt(n, 10) || max));
    state.soruSayisi = n;
    state.soruSayiHavuzdan = false;
    const hazir = SORU_SAYI_SECENEK.indexOf(n) >= 0;
    document.querySelectorAll(".biy-sayi-btn").forEach(b => b.classList.toggle("secili", +b.getAttribute("data-sayi") === n));
    const inp = $("soruSayiInput"); if (inp){ inp.value = hazir ? "" : n; }
    BIY._menuDurum();
  },
  setSoruSayisiManuel(v){
    let n = parseInt(v, 10);
    if (isNaN(n)){ return; }
    const max = state.soruSayiMax || 50;
    n = Math.max(1, Math.min(max, n));
    state.soruSayisi = n;
    state.soruSayiHavuzdan = false;
    // manuel giriş yapıldı → hazır rakamlardaki yeşil vurgu kalksın
    document.querySelectorAll(".biy-sayi-btn").forEach(b => b.classList.remove("secili"));
    const inp = $("soruSayiInput"); if (inp) inp.value = n;
    BIY._menuDurum();
  },

  async yarisiBaslat(){
    if (!state.odaId) return;
    const d0 = BIY._baslatDurumu();
    if (!d0.olur){ $("baslatNot").textContent = d0.not; return; }

    let secilen, yedek;
    const elle = BIY._secilenSorular();   // öğretmenin havuzdan elle seçtiği sorular
    if (elle.length){
      // MANUEL: yalnızca öğretmenin görüp seçtiği sorular sorulur
      let hv = elle.slice();
      for (let i = hv.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); const g = hv[i]; hv[i] = hv[j]; hv[j] = g; }
      secilen = hv.map(soruHazirla);
      yedek = [];   // görülmemiş yedek sorulmaz
    } else {
      const tumu = BIY._aktifSorular().slice();   // konunun tüm soruları (zorluk fark etmez)
      if (!tumu.length){ $("baslatNot").textContent = "«" + (BIY._aktifKonu() ? BIY._aktifKonu().ad : "") + "» لَا تَحْتَوِي عَلَى أَسْئِلَةٍ بَعْدُ."; return; }
      for (let i = tumu.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); const g = tumu[i]; tumu[i] = tumu[j]; tumu[j] = g; }
      const hedefSayi = Math.max(1, Math.min(50, state.soruSayisi || TUR_SORU_SAYISI));
      secilen = tumu.slice(0, Math.min(hedefSayi, tumu.length)).map(soruHazirla);
      yedek = tumu.slice(secilen.length).map(soruHazirla);
    }
    state.oyunSorulari = secilen;
    state.yedekSorular = yedek;   // beraberlikte yedek olarak kullanılır
    state.yedekSoruMap = {};
    state.berHedef = 0; state.berTakimlar = []; state.berSabit = {}; state.berNo = 0; state.berSorular = [];
    state.ayarKilidiKapali = false;   // yeni tur başladı → normal kilit davranışı
    await BIY._cevaplariSil();         // oda yeniden kullanılıyorsa eski cevapları temizle
    try {
      await db.collection(KOLEKSIYON).doc(state.odaId).update({
        durum: "oyun", faz: "cevap", aktifIndex: 0, toplamSoru: secilen.length, soruSuresi: SORU_SURESI,
        mod: modAl(),
        soruIdSirasi: secilen.map(s => s.id),
        aktifSoru: temizSoru(secilen[0]),
        soruBaslangic: firebase.firestore.FieldValue.serverTimestamp()
      });
      BIY._kaydet();
      BIY._adminOyunaGec();
    } catch(e){ console.error(e); $("baslatNot").textContent = "تَعَذَّرَ البَدْءُ: " + (e.code || e.message); }
  },

  _adminOyunaGec(){
    ekranGoster("ekranOyunAdmin");
    if (state.odaAboneAdmin) state.odaAboneAdmin();
    state.odaAboneAdmin = db.collection(KOLEKSIYON).doc(state.odaId).onSnapshot(d => {
      state.oda = d.data() || null;
      BIY._renderAdminOyun();
    });
    if (state.cevapAbone) state.cevapAbone();
    state.cevaplar = {};
    state.cevapAbone = db.collection(KOLEKSIYON).doc(state.odaId).collection("cevaplar").onSnapshot(snap => {
      state.cevaplar = {}; snap.forEach(d => state.cevaplar[d.id] = d.data());
      BIY._renderAdminOyun();
    });
  },

  _renderAdminOyun(){
    const o = state.oda, kap = $("ekranOyunAdmin");
    if (!o) return;
    if (o.durum === "bitti"){
      sayacDurdur(); BIY._sonucTemizle();
      kap.innerHTML = BIY._leaderboardHtml(true);
      if (!state.finalKonfeti){ state.finalKonfeti = true; BIY._konfetiPatlat(); }
      return;
    }
    const ber = (o.durum === "beraberlik");
    const idx = o.aktifIndex || 0;
    const soru = BIY._soruByIndex(idx);
    if (!soru){ kap.innerHTML = '<div class="biy-oyun-orta"><p class="biy-alt">أَسْئِلَةُ هَذِهِ الجَوْلَةِ غَيْرُ مَوْجُودَةٍ (رُبَّمَا حُدِّثَتِ الصَّفْحَةُ). ابْدَإِ المُسَابَقَةَ مِنْ جَدِيدٍ.</p><button class="biy-btn biy-btn-mavi" onclick="BIY.anasayfa()">القَائِمَةُ الرَّئِيسَةُ</button></div>'; return; }
    const sonuc = (o.faz === "sonuc");
    const t = TIP_BILGI[soru.tip] || { ad: soru.tip, emoji: "❓" };
    // SONUÇ EKRANI — soru ekranından tamamen ayrı (adım adım animasyonlu)
    if (sonuc){
      sayacDurdur();
      const taze = (state.sonucAnimIndex !== idx);
      kap.innerHTML = BIY._sonucEkranHtml(idx, soru, taze);
      if (taze){
        state.sonucAnimIndex = idx;
        SES.sonuc();                                  // sonuç ekranı açıldı
        BIY._sonucOynat();                            // sıralama sesi FLIP anında (_liderlikGecis) çalar
      }
      return;
    }
    // beraberlikte yalnızca beraber olan takımlar; değilse tüm takımlar
    const katilan = BIY._aktifTakimlar();
    const katilanId = {}; katilan.forEach(t => katilanId[t.id] = true);
    // cevaplar (bu index)
    const buCevaplar = {}; Object.values(state.cevaplar).forEach(c => { if (c.index === idx && katilanId[c.takimId]) buCevaplar[c.takimId] = c; });
    const cevapSayisi = Object.keys(buCevaplar).length;
    // seçenekler
    const opt = tahtaIcerikHtml(soru, !!sonuc);
    // üst bilgi + sayaç
    const kalan = kalanSaniye();
    const yuzde = Math.max(0, Math.min(100, (kalan / (o.soruSuresi || SORU_SURESI)) * 100));
    const gizli = state.soruGizli;
    // göz ikonu (tur sırasının yanında): açık göz = görünür (tıkla gizle), çapraz göz = gizli (tıkla göster)
    const gozSvg = state.soruGizli
      ? '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
      : '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    const gozBtn = '<button class="biy-gizle-svg" title="'+(state.soruGizli?'أَظْهِرِ السُّؤَالَ':'أَخْفِ السُّؤَالَ')+'" onclick="BIY.soruGizleToggle()">'+gozSvg+'</button>';

    const cips = BIY._ciplerHtml(katilan, buCevaplar);
    const hepsi = katilan.length > 0 && cevapSayisi >= katilan.length;

    const sayacHtml = '<div class="biy-sayac"><span id="sayacNum">'+kalan+'</span><small>ث</small></div>';
    const barHtml = '<div class="biy-sayac-bar"><i style="width:'+yuzde+'%"></i></div>';
    const siraMetin = ber
      ? '⚔️ '+(o.berHedef===1?'المَرْكَزُ الأَوَّلُ':'المَرْكَزُ الثَّانِي')+' · سُؤَالُ التَّعَادُلِ '+o.berNo
      : 'سُؤَالُ '+(idx+1)+' / '+(o.toplamSoru||state.oyunSorulari.length);

    let govde =
      '<div class="biy-oyun-ust">' +
        '<div class="biy-oyun-sira'+(ber?' biy-ber':'')+'">'+siraMetin+' '+gozBtn+'</div>' +
        '<div class="biy-oyun-tip"><span class="biy-soru-tip">'+t.emoji+' '+t.ad+'</span> <span class="biy-bicim-rozet">'+((BICIM_BILGI[bicimAl(soru)]||{}).emoji||'')+' '+((BICIM_BILGI[bicimAl(soru)]||{}).ad||'')+'</span> <span class="biy-zorluk z'+soru.zorluk+'">'+ZORLUK_AD[soru.zorluk]+'</span></div>' +
        // soru gizliyken geri sayım üstte değil, aşağıda büyük gösterilir
        (gizli ? '' : sayacHtml) +
      '</div>' +
      (gizli ? '' : barHtml);

    // soru gizliyken hiçbir kutu gösterilmez (sınıf durumu + geri sayım aşağıda büyük)
    if (!gizli){
      govde += '<div class="biy-oyun-soru">'+ kacis(soru.soru) +'</div>' +
        (soru.arapca ? '<div class="biy-oyun-arapca">'+ kacis(soru.arapca) +'</div>' : '') +
        '<div class="biy-a-optlar">'+ opt +'</div>';
    }
    // sınıfların durumu (gizliyken çok daha büyük)
    const kaydir = (modAl() === "birey" && katilan.length > 10) ? " biy-kaydir" : "";
    govde += '<div class="biy-cevap-durum'+(gizli?' biy-dev':'')+'">'+cevapSayisi+' / '+katilan.length+' أَجَابُوا'+(hepsi?' — تَظْهَرُ النَّتِيجَةُ…':'')+'</div>' +
             '<div class="biy-cipler'+(gizli?' biy-dev':'')+kaydir+'">'+cips+'</div>';
    // gizliyken geri sayım AŞAĞIDA ve devasa
    if (gizli){
      govde += '<div class="biy-alt-sayac">'+barHtml+'<div class="biy-sayac biy-sayac-dev"><span id="sayacNum">'+kalan+'</span><small>ث</small></div></div>';
    }

    kap.innerHTML = '<div class="biy-oyun-orta">'+govde+'</div>';

    // tüm takımlar cevaplayınca ses (soru başına bir kez)
    if (hepsi && state.hepsiSesIndex !== idx){ state.hepsiSesIndex = idx; SES.hepsiCevap(); }
    // otomatik sonuç: tüm takımlar cevaplayınca
    if (hepsi && state.otoSonucIndex !== idx){
      state.otoSonucIndex = idx;
      setTimeout(function(){ if (state.oda && state.oda.faz === 'cevap' && (state.oda.aktifIndex||0) === idx) BIY.sonucGoster(); }, 450);
    }
    // sayaç + süre bitince otomatik sonuç
    sayacBaslat(() => {
      const k = kalanSaniye(); const el = $("sayacNum"); if (el) el.textContent = k;
      const bar = document.querySelector(".biy-sayac-bar i"); if (bar) bar.style.width = Math.max(0, Math.min(100, (k/(o.soruSuresi||SORU_SURESI))*100)) + "%";
      if (k <= 0 && state.oda && state.oda.faz === 'cevap' && (state.oda.aktifIndex||0) === idx && state.otoSonucIndex !== idx){
        state.otoSonucIndex = idx; BIY.sonucGoster();
      }
    });
  },

  // index'e göre soru (ana tur veya yedek)
  _soruByIndex(i){ return (i >= 1000) ? (state.yedekSoruMap && state.yedekSoruMap[i]) : state.oyunSorulari[i]; },
  // bir doğru cevabın puanı: 1000/toplam taban + küçük hız bonusu (en fazla %15)
  _cevapPuani(c){
    const o = state.oda || {};
    const toplam = o.toplamSoru || state.oyunSorulari.length || state.soruSayisi || 1;
    const sure = o.soruSuresi || SORU_SURESI;
    const taban = TOPLAM_PUAN / toplam;
    let hiz = (typeof c.kalan === 'number') ? (c.kalan / sure) : 1;   // eski cevaplarda kalan yoksa tam say
    hiz = Math.max(0, Math.min(1, hiz));
    return Math.round(taban * (1 - ZAMAN_PAYI + ZAMAN_PAYI * hiz));
  },
  // belirli index'e kadar (dahil) her takımın toplam puanı (yedekler dahil)
  _puanKumul(cutoff){
    const t = {};
    Object.values(state.cevaplar).forEach(c => {
      if (c.index > cutoff) return;
      const s = BIY._soruByIndex(c.index); if (!s) return;
      if (cevapDogruMu(s, c.secilen)) t[c.takimId] = (t[c.takimId] || 0) + BIY._cevapPuani(c);
    });
    return t;
  },
  _rank(puanMap, ids){
    const r = {};
    ids.forEach(id => { const p = puanMap[id] || 0; r[id] = 1 + ids.filter(o => (puanMap[o]||0) > p).length; });
    return r;
  },
  // AYRI SONUÇ EKRANI (soru ekranından bağımsız) — adım adım animasyonlu
  // Akış: (0) doğru şık büyük → (1) sınıfların cevapları → (2) doğru şık küçülür → (3) liderlik tablosu büyür + sıra atlayanlar → (4) buton
  _sonucEkranHtml(idx, soru, taze){
    const o = state.oda;
    const ber = (o.durum === "beraberlik");
    const toplam = o.toplamSoru || state.oyunSorulari.length;
    const buCevaplar = {}; Object.values(state.cevaplar).forEach(c => { if (c.index === idx) buCevaplar[c.takimId] = c; });
    // soru + şıklar (doğru şık vurgulu)
    const optHtml = tahtaIcerikHtml(soru, true);
    // sınıfların sonucu: seçtikleri şık + doğru/yanlış (beraberlikte yalnızca beraber olanlar)
    const cevapTakimlari = BIY._aktifTakimlar();
    const satir = cevapTakimlari.map((tk,ri) => {
      const c = buCevaplar[tk.id]; const dogruMu = !!(c && cevapDogruMu(soru, c.secilen));
      const secim = c ? secimHtml(soru, c.secilen) : '<span class="biy-rev-yok">—</span>';
      const durum = c ? (dogruMu ? '✅ صَحِيحٌ' : '❌ خَطَأٌ') : '⏳ بِلَا إِجَابَةٍ';
      return '<tr class="'+(c?(dogruMu?'dogru':'yanlis'):'yok')+'" style="--r:'+ri+'"><td>'+kacis(tk.ad)+'</td><td class="biy-rev-sik">'+secim+'</td><td>'+durum+'</td></tr>';
    }).join("");
    // puan durumu (yedekler dahil) + sıra değişimi
    const ids = state.takimListe.map(t => t.id);
    const newP = BIY._puanKumul(idx), prevP = BIY._puanKumul(idx - 1);
    let newOrder, prevOrder;
    if (ber){
      newOrder  = BIY._pinliSira(ids, newP,  o.berTakimlar, o.berSabit, o.berHedef);
      prevOrder = BIY._pinliSira(ids, prevP, o.berTakimlar, o.berSabit, o.berHedef);
    } else {
      newOrder  = ids.slice().sort((a,b) => (newP[b]||0)-(newP[a]||0));
      prevOrder = ids.slice().sort((a,b) => (prevP[b]||0)-(prevP[a]||0));
    }
    const rankMap = arr => { const m = {}; arr.forEach((id,i) => m[id] = i+1); return m; };
    const newR = ber ? rankMap(newOrder) : BIY._rank(newP, ids);
    const prevR = ber ? rankMap(prevOrder) : BIY._rank(prevP, ids);
    const adOf = id => { const t = state.takimListe.find(x => x.id === id) || {}; return t.ad || ""; };
    // sonuç tablosunun ilk sütun başlığı moda göre
    const basSutun = modAl() === "birey" ? "مُشَارِكٌ" : (modAl() === "okul" ? "صَفٌّ" : "فَرِيقٌ");
    const lider = newOrder.map(id => {
      const ns = newR[id] || ids.length, ps = prevR[id] || ids.length, delta = ps - ns;
      const ok = delta > 0 ? '<span class="biy-ok biy-ok-yukari">▲</span>' : (delta < 0 ? '<span class="biy-ok biy-ok-asagi">▼</span>' : '<span class="biy-ok biy-ok-sabit"></span>');
      const cls = delta > 0 ? ' biy-lider-yukari' : (delta < 0 ? ' biy-lider-asagi' : '');
      return '<li class="biy-lider-satir'+cls+'"><span class="biy-lider-sira">'+ns+'</span>'+ok+'<span class="biy-lider-ad">'+kacis(adOf(id))+'</span><b>'+(newP[id]||0)+'</b></li>';
    }).join("");
    const degisti = ids.some(id => (prevR[id]||ids.length) !== (newR[id]||ids.length));
    const son = ber ? true : (idx + 1 >= toplam);
    const step = taze ? 0 : 2;   // yenileme olursa doğrudan son sahne (liderlik)
    const t = TIP_BILGI[soru.tip] || { ad: soru.tip, emoji: "❓" };
    const baslik = ber
      ? '⚔️ '+(o.berHedef===1?'المَرْكَزُ الأَوَّلُ':'المَرْكَزُ الثَّانِي')+' · تَعَادُلٌ · سُؤَالُ '+o.berNo
      : '📊 النَّتِيجَةُ · سُؤَالُ '+(idx+1)+' / '+toplam;
    return '<div class="biy-oyun-orta biy-sonuc-ekran" data-degisti="'+(degisti?1:0)+'" data-step="'+step+'">' +
      '<div class="biy-sonuc-baslik'+(ber?' biy-ber':'')+'">'+baslik+'</div>' +
      '<div class="biy-sonuc-sahne">' +
        // SAHNE 1: soru cümlesi + şıklar + vurgulu doğru şık
        '<div class="biy-sahne-oge oge-dogru">' +
          '<div class="biy-sonuc-soru-cumle">'+kacis(soru.soru)+'</div>' +
          (soru.arapca ? '<div class="biy-oyun-arapca">'+kacis(soru.arapca)+'</div>' : '') +
          '<div class="biy-a-optlar">'+optHtml+'</div>' +
        '</div>' +
        // SAHNE 2: sınıfların verdiği cevaplar (devasa)
        '<div class="biy-sahne-oge oge-reveal">' +
          '<div class="biy-reveal'+(cevapTakimlari.length > 8 && modAl() === "birey" ? ' biy-kaydir' : '')+'"><table class="biy-reveal-tablo"><thead><tr><th>'+basSutun+'</th><th>الإِجَابَةُ</th><th>الحَالَةُ</th></tr></thead><tbody>'+satir+'</tbody></table></div>' +
        '</div>' +
        // SAHNE 3: güncel puan durumu (devasa)
        '<div class="biy-sahne-oge oge-lider">' +
          '<div class="biy-sonuc-lider"><h4>🏆 النَّتَائِجُ</h4><ol class="biy-lider-ol'+(newOrder.length>10?' biy-kaydir':'')+'">'+lider+'</ol></div>' +
        '</div>' +
      '</div>' +
      // aşağıda üç ilerleme çizgisi — tıklayınca ilgili sayfaya geçer
      '<div class="biy-sonuc-nokta">' +
        '<button class="biy-nokta" data-adim="0" onclick="BIY.sonucAdim(0)" title="السُّؤَالُ وَالإِجَابَةُ الصَّحِيحَةُ"></button>' +
        '<button class="biy-nokta" data-adim="1" onclick="BIY.sonucAdim(1)" title="إِجَابَاتُ المُشَارِكِينَ"></button>' +
        '<button class="biy-nokta" data-adim="2" onclick="BIY.sonucAdim(2)" title="النَّتَائِجُ"></button>' +
      '</div>' +
      '<div class="biy-oyun-kontrol"><button class="biy-btn biy-btn-buyuk" onclick="BIY.sonrakiSoru()">'+
        (ber ? ((BIY._beraberlikCozuldu() || state.berNo >= state.yedekSorular.length) ? '🏁 اعْتِمَادُ التَّرْتِيبِ' : 'سُؤَالُ التَّعَادُلِ التَّالِي ›')
             : (son ? '🏁 إِنْهَاءُ المُسَابَقَةِ' : 'السُّؤَالُ التَّالِي ›')) +
      '</button></div>' +
    '</div>';
  },
  // ilerleme çizgisine basınca ilgili sonuç sayfasına geç (otomatik akışı durdur)
  sonucAdim(n){
    BIY._sonucTemizle();
    const e = document.querySelector(".biy-sonuc-ekran"); if (e) e.setAttribute("data-step", String(n));
  },
  // sonuç ekranı sahne akışı: her öğe devasa gösterilir; yenisi gelince önceki yukarı kayıp kaybolur
  _sonucOynat(){
    BIY._sonucTemizle();
    const el0 = document.querySelector(".biy-sonuc-ekran");
    const degisti = el0 && el0.getAttribute("data-degisti") === "1";
    const set = (n) => { const e = document.querySelector(".biy-sonuc-ekran"); if (e) e.setAttribute("data-step", String(n)); };
    state.sonucTimerlar.push(setTimeout(() => set(1), 7000));   // sahne 2: sınıf cevapları (soru+şıklar daha uzun beklesin)
    state.sonucTimerlar.push(setTimeout(() => set(2), 10500));  // sahne 3: liderlik + buton
    if (degisti) state.sonucTimerlar.push(setTimeout(() => SES.siraDegisti(), 10700));
  },
  _sonucTemizle(){ (state.sonucTimerlar || []).forEach(t => clearTimeout(t)); state.sonucTimerlar = []; },

  _siraliTakimlar(){
    return state.takimListe.slice().sort((a,b) => (b.puan||0) - (a.puan||0));
  },
  _miniLiderHtml(){
    return '<h4>النَّتَائِجُ</h4><ol class="biy-lider-ol">' +
      BIY._siraliTakimlar().map(t => '<li><span>'+kacis(t.ad)+'</span><b>'+(t.puan||0)+'</b></li>').join("") + '</ol>';
  },
  _leaderboardHtml(final){
    const o = state.oda || {};
    const P = BIY._puanKumul(1e12);   // yedekler dahil toplam puanlar
    const puanOf = t => (P[t.id] != null ? P[t.id] : (t.puan || 0));
    let sirali;
    if (Array.isArray(o.sonSira) && o.sonSira.length){
      sirali = o.sonSira.map(id => state.takimListe.find(t => t.id === id)).filter(Boolean);
      state.takimListe.forEach(t => { if (sirali.indexOf(t) < 0) sirali.push(t); });
    } else {
      sirali = state.takimListe.slice().sort((a,b) => puanOf(b) - puanOf(a));
    }
    const madalya = ["🥇","🥈","🥉"];
    return '<div class="biy-oyun-orta biy-final">' +
      '<div class="biy-logo">'+simge("🏆")+'</div><h1>انْتَهَتِ المُسَابَقَةُ!</h1>' +
      '<ol class="biy-final-ol'+(sirali.length>10?' biy-kaydir':'')+'">' +
        sirali.map((t,i) => '<li class="'+(i<3?'podyum':'')+(i===0?' birinci':'')+'" style="--i:'+i+'"><span class="biy-final-sira">'+(madalya[i]||(i+1))+'</span><span class="biy-final-ad">'+kacis(t.ad)+'</span><b>'+puanOf(t)+'</b></li>').join("") +
      '</ol>' +
      '<div class="biy-final-butonlar">' +
        '<button class="biy-btn biy-btn-yesil" onclick="BIY.lobiyeDon()">🔄 العَوْدَةُ إِلَى الانْتِظَارِ (' + cogSozu() + ' يَبْقَوْنَ مُتَّصِلِينَ)</button>' +
        '<button class="biy-btn biy-btn-mavi" onclick="BIY.oyunuBitir()">إِنْهَاءٌ &amp; القَائِمَةُ</button>' +
      '</div>' +
    '</div>';
  },
  // yarışma bitti — konfeti patlaması (harici kütüphane yok)
  _konfetiPatlat(){
    const renkler = ["#F1C40F","#EF5350","#27AE60","#3498DB","#9B59B6","#FF7AC6","#F39C12","#20C997","#FFFFFF"];
    const kap = document.createElement("div");
    kap.className = "biy-konfeti-kap";
    let h = "";
    const N = 160;
    for (let i = 0; i < N; i++){
      const sol = (Math.random()*100).toFixed(2);
      const renk = renkler[(Math.random()*renkler.length)|0];
      const gecikme = (Math.random()*0.9).toFixed(2);
      const sure = (2.6 + Math.random()*2.4).toFixed(2);
      const don = ((Math.random()*900 - 450)|0);
      const en = 6 + (Math.random()*9|0);
      const yuvarlak = Math.random() < 0.35;
      const boy = yuvarlak ? en : Math.max(4, (en*0.5)|0);
      const sx = ((Math.random()*46 - 23)|0);
      h += '<i style="left:'+sol+'%;background:'+renk+';width:'+en+'px;height:'+boy+'px;border-radius:'+(yuvarlak?'50%':'2px')+
           ';animation-delay:'+gecikme+'s;animation-duration:'+sure+'s;--don:'+don+'deg;--sx:'+sx+'px"></i>';
    }
    kap.innerHTML = h;
    const hedef = document.getElementById("ekranOyunAdmin") || document.body;
    hedef.appendChild(kap);
    setTimeout(function(){ if (kap.parentNode) kap.parentNode.removeChild(kap); }, 8000);
  },

  soruGizleToggle(){ state.soruGizli = !state.soruGizli; BIY._renderAdminOyun(); },

  async sonucGoster(){
    if (!state.odaId) return;
    try {
      await BIY._puanlariGuncelle();
      await db.collection(KOLEKSIYON).doc(state.odaId).update({ faz: "sonuc" });
    } catch(e){ console.error(e); }
  },
  _puanlariGuncelle(){
    // her takımın TOPLAM puanını tüm cevaplardan hesapla (yedekler dahil, idempotent)
    const toplam = BIY._puanKumul(1e12);
    const batch = db.batch();
    state.takimListe.forEach(t => {
      const ref = db.collection(KOLEKSIYON).doc(state.odaId).collection("takimlar").doc(t.id);
      batch.update(ref, { puan: toplam[t.id] || 0 });
    });
    return batch.commit();
  },
  async sonrakiSoru(){
    if (!state.odaId || !state.oda) return;
    BIY._sonucTemizle();
    // beraberlik turundaysak: çözüldüyse bitir, değilse sonraki yedek soru
    if (state.oda.durum === "beraberlik"){ return BIY._yedekVeyaBitir(); }
    const next = (state.oda.aktifIndex || 0) + 1;
    try {
      if (next >= (state.oda.toplamSoru || state.oyunSorulari.length)){
        await BIY._bitirVeyaBeraberlik();   // beraberlik varsa yedek soruya geç, yoksa bitir
      } else {
        await db.collection(KOLEKSIYON).doc(state.odaId).update({
          aktifIndex: next, faz: "cevap",
          aktifSoru: temizSoru(state.oyunSorulari[next]),
          soruBaslangic: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch(e){ console.error(e); }
  },

  /* ---------- BERABERLİK (yedek soru — aynı tasarım, puanlar toplama eklenir) ---------- */
  _aktifTakimlar(){
    const o = state.oda;
    if (o && o.durum === "beraberlik" && Array.isArray(o.berTakimlar)) return state.takimListe.filter(t => o.berTakimlar.indexOf(t.id) >= 0);
    return state.takimListe;
  },
  // sadece liderlik(1) veya ikincilik(2) için beraberlik var mı?
  _beraberlikDurumu(puanMap, ids){
    const pts = id => puanMap[id] || 0;
    if (ids.length < 2) return { hedef: 0 };
    const maxP = Math.max.apply(null, ids.map(pts));
    const topGroup = ids.filter(id => pts(id) === maxP);
    let hedef = 0, tied = [];
    if (topGroup.length > 1){ hedef = 1; tied = topGroup; }
    else {
      const rest = ids.filter(id => pts(id) !== maxP);
      if (rest.length){
        const secondP = Math.max.apply(null, rest.map(pts));
        const secondGroup = ids.filter(id => pts(id) === secondP);
        if (secondGroup.length > 1){ hedef = 2; tied = secondGroup; }
      }
    }
    if (!hedef) return { hedef: 0 };
    const sabit = {};
    ids.forEach(id => { if (tied.indexOf(id) >= 0) return; sabit[id] = 1 + ids.filter(o => pts(o) > pts(id)).length; });
    return { hedef, tied, sabit };
  },
  // pinli sıralama: sabitler kendi sırasında, beraber olanlar toplam puana göre hedef sıralarını doldurur
  _pinliSira(ids, pMap, tied, sabit, hedef){
    const total = id => pMap[id] || 0;
    const to = (tied||[]).slice().sort((a,b) => total(b) - total(a));
    const arr = new Array(ids.length).fill(null);
    to.forEach((id,i) => { arr[hedef - 1 + i] = id; });
    Object.keys(sabit||{}).forEach(id => { const r = sabit[id]; if (r>=1 && r<=arr.length) arr[r-1] = id; });
    const placed = new Set(arr.filter(Boolean)); let b = 0;
    ids.forEach(id => { if (!placed.has(id)){ while (arr[b]) b++; arr[b] = id; } });
    return arr;
  },
  // beraber olanlar artık farklı toplam puana sahipse çözülmüştür
  _beraberlikCozuldu(){
    const P = BIY._puanKumul(1e12);
    const vals = (state.berTakimlar||[]).map(id => P[id] || 0);
    return new Set(vals).size === vals.length;
  },
  async _bitirVeyaBeraberlik(){
    try { await BIY._puanlariGuncelle(); } catch(e){}
    const ids = state.takimListe.map(t => t.id);
    // Yedek soruyla beraberlik bozma takım ve okul modunda anlamlı (az sayıda
    // yarışmacı); birey modunda katılımcı çok, tam eşitlik nadir → doğrudan bitir.
    if (modAl() === "birey"){ await db.collection(KOLEKSIYON).doc(state.odaId).update({ durum: "bitti", sonSira: [] }); return; }
    const d = BIY._beraberlikDurumu(BIY._puanKumul(1e12), ids);
    if (!d.hedef){ await db.collection(KOLEKSIYON).doc(state.odaId).update({ durum: "bitti", sonSira: [] }); return; }
    state.berHedef = d.hedef; state.berTakimlar = d.tied; state.berSabit = d.sabit; state.berNo = 0; state.berSorular = [];
    await BIY._yedekSoruSor();
  },
  async _yedekSoruSor(){
    const q = state.yedekSorular[state.berNo];
    if (!q){ return BIY._beraberlikBitir(); }   // yedek soru kalmadı → mevcut sırayla bitir
    state.berNo += 1;
    const index = 1000 + state.berNo;
    state.yedekSoruMap[index] = q;             // puan hesabına dahil
    state.berSorular.push(index);
    state.otoSonucIndex = -1; state.sonucAnimIndex = -1; state.hepsiSesIndex = -1;
    BIY._kaydet();
    try {
      await db.collection(KOLEKSIYON).doc(state.odaId).update({
        durum: "beraberlik", berHedef: state.berHedef, berTakimlar: state.berTakimlar, berSabit: state.berSabit, berNo: state.berNo,
        aktifIndex: index, faz: "cevap", aktifSoru: temizSoru(q),
        soruBaslangic: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(e){ console.error(e); }
  },
  // yedek soru sonucundan sonra: çözüldüyse bitir, yedek kaldıysa devam
  async _yedekVeyaBitir(){
    if (BIY._beraberlikCozuldu() || state.berNo >= state.yedekSorular.length) return BIY._beraberlikBitir();
    return BIY._yedekSoruSor();
  },
  async _beraberlikBitir(){
    try { await BIY._puanlariGuncelle(); } catch(e){}
    const ids = state.takimListe.map(t => t.id);
    const sonSira = BIY._pinliSira(ids, BIY._puanKumul(1e12), state.berTakimlar, state.berSabit, state.berHedef);
    try { await db.collection(KOLEKSIYON).doc(state.odaId).update({ durum: "bitti", sonSira: sonSira }); } catch(e){ console.error(e); }
  },

  /* ---------- TAKIM MODU ---------- */
  async takimBagla(oda, takim){
    ekranGoster("ekranTakim");
    const takimRef = db.collection(KOLEKSIYON).doc(oda).collection("takimlar").doc(takim);
    try {
      const snap = await takimRef.get();
      if (!snap.exists){ BIY._takimIcerik('❌','لَمْ يُوجَدِ الفَرِيقُ','الرَّابِطُ غَيْرُ صَالِحٍ أَوْ حُذِفَ الفَرِيقُ.'); return; }
      state.takimAd = snap.data().ad || "فَرِيقٌ";
      // yenileme sonrası: bu soruyu zaten cevapladıysa hatırla
      try { const kc = JSON.parse(localStorage.getItem('biy_cevap') || 'null'); if (kc && kc.oda === oda && kc.takim === takim) state.sonCevapIndex = kc.index; } catch(e){}
      await takimRef.update({ bagli: true, sonGorulme: firebase.firestore.FieldValue.serverTimestamp() });
      if (state.takimNabiz) clearInterval(state.takimNabiz);
      state.takimNabiz = setInterval(() => { takimRef.update({ sonGorulme: firebase.firestore.FieldValue.serverTimestamp() }).catch(()=>{}); }, 20000);
      window.addEventListener("pagehide", () => { takimRef.update({ bagli: false }).catch(()=>{}); });

      if (state.odaAbone) state.odaAbone();
      state.odaAbone = db.collection(KOLEKSIYON).doc(oda).onSnapshot(d => { state.oda = d.data() || null; BIY._renderTakim(); });
    } catch(e){ console.error(e); BIY._takimIcerik('⚠️','تَعَذَّرَ الاتِّصَالُ','تَحَقَّقْ مِنَ الإِنْتَرْنِتِ وَالرَّابِطِ.'); }
  },
  _takimIcerik(emoji, baslik, metin, ekstra){
    $("takimIcerik").className = "biy-orta";
    $("takimIcerik").innerHTML =
      '<div class="biy-kart">' +
        '<div class="biy-logo">'+simge(emoji)+'</div>' +
        '<h1>'+kacis(baslik)+'</h1>' +
        '<p class="biy-alt">'+kacis(metin)+'</p>' + (ekstra || "") +
      '</div>';
  },
  _renderTakim(){
    /* Öğretmen bu cihazı çıkardıysa oda belgesinden gecikmeli gelen bir
       snapshot "Bağlandın!" ekranını geri getirmesin — bayrak kalıcıdır. */
    if (state.atildiMi) return;
    const o = state.oda; if (!o){ return; }
    if (o.durum === "lobi" || o.aktifIndex === -1){
      // yeni tura hazırlık: önceki turun cevap takibini sıfırla (oda yeniden kullanılıyor olabilir)
      state.sonCevapIndex = -1; try { localStorage.removeItem('biy_cevap'); } catch(e){}
      BIY._takimIcerik('✅', state.takimAd, 'تَمَّ الاتِّصَالُ! فِي انْتِظَارِ بَدْءِ المُعَلِّمِ.',
        '<div class="biy-bekle-nokta"><span></span><span></span><span></span></div>');
      sayacDurdur(); return;
    }
    if (o.durum === "bitti"){
      // beraberlik sonrası kesin sıralama varsa kendi sıramı göster
      const ss = Array.isArray(o.sonSira) ? o.sonSira : null;
      if (ss){
        const r = ss.indexOf(state.odaTakim.takim) + 1;
        if (r === 1) BIY._takimIcerik('🎉','أَحْسَنْتَ!', 'المَرْكَزُ الأَوَّلُ! 🥇');
        else if (r > 0) BIY._takimIcerik('🏅', 'المَرْكَزُ ' + r, 'أَنْهَيْتَ المُسَابَقَةَ فِي المَرْكَزِ ' + r + '.');
        else BIY._takimIcerik('🏁','انْتَهَتِ المُسَابَقَةُ!', 'التَّرْتِيبُ عَلَى الشَّاشَةِ.');
      } else {
        BIY._takimIcerik('🏁','انْتَهَتِ المُسَابَقَةُ!', 'التَّرْتِيبُ عَلَى شَاشَةِ المُعَلِّمِ.');
      }
      sayacDurdur(); return;
    }
    if (o.durum === "beraberlik"){
      const amTied = (o.berTakimlar||[]).indexOf(state.odaTakim.takim) >= 0;
      if (!amTied){
        const rank = (o.berSabit||{})[state.odaTakim.takim];
        if (rank === 1) BIY._takimIcerik('🎉','أَحْسَنْتَ!', 'المَرْكَزُ الأَوَّلُ! 🥇');
        else if (rank) BIY._takimIcerik('🏅', 'المَرْكَزُ ' + rank, 'أَنْهَيْتَ المُسَابَقَةَ فِي المَرْكَزِ ' + rank + '.');
        else BIY._takimIcerik('⏳','تَعَادُلٌ!', 'الآخَرُونَ فِي سُؤَالِ التَّعَادُلِ…');
        sayacDurdur(); return;
      }
      if (o.faz === "sonuc"){ BIY._takimIcerik('📺','الإِجَابَاتُ عَلَى الشَّاشَةِ!', 'فِي انْتِظَارِ سُؤَالِ التَّعَادُلِ التَّالِي…'); sayacDurdur(); return; }
      // beraberlikte olan takım → aşağıdaki cevap akışıyla yedek soruyu cevaplar
    }
    // oyun
    const idx = o.aktifIndex, s = o.aktifSoru;
    if (!s){ BIY._takimIcerik('⏳','جَارٍ التَّحْضِيرُ…',''); return; }
    if (o.faz === "sonuc"){
      BIY._takimIcerik('📺','الإِجَابَاتُ عَلَى الشَّاشَةِ!', 'فِي انْتِظَارِ السُّؤَالِ التَّالِي…');
      sayacDurdur(); return;
    }
    // cevap fazı
    // ---- cevap fazı: biçime göre etkileşimli alan ----
    const cevapVerildi = (state.sonCevapIndex === idx);
    const t  = TIP_BILGI[s.tip] || { ad: s.tip, emoji: "❓" };
    const bb = BICIM_BILGI[bicimAl(s)] || { ad: "", emoji: "" };
    const kalan = kalanSaniye();
    const kilit = cevapVerildi || kalan <= 0;
    BIY._calismaHazirla(idx, s);
    const alt = cevapVerildi
      ? '<div class="biy-t-alindi">✅ وَصَلَتْ إِجَابَتُكَ</div>'
      : (kalan<=0 ? '<div class="biy-t-alindi biy-gec">⌛ انْتَهَى الوَقْتُ</div>'
                  : '<div class="biy-t-ipucu">'+BIY._ipucuMetni(s)+'</div>');
    $("takimIcerik").className = "biy-oyun-orta";
    $("takimIcerik").innerHTML =
      '<div class="biy-t-kimlik"><span class="biy-t-kimlik-nokta"></span><span class="biy-t-kimlik-ad">'+kacis(state.takimAd)+'</span></div>' +
      '<div class="biy-t-ust"><span class="biy-soru-tip">'+t.emoji+' '+t.ad+'</span>' +
        '<span class="biy-bicim-rozet">'+bb.emoji+' '+bb.ad+'</span>' +
        '<span class="biy-t-sayac" id="sayacNum">'+kalan+'</span></div>' +
      '<div class="biy-oyun-soru">'+kacis(s.soru)+'</div>' +
      (s.arapca ? '<div class="biy-oyun-arapca">'+kacis(s.arapca)+'</div>' : '') +
      BIY._takimAlanHtml(s, kilit) + alt;
    BIY._dragKur();
    sayacBaslat(() => {
      const k = kalanSaniye(); const el = $("sayacNum"); if (el) el.textContent = k;
      if (k <= 0){
        document.querySelectorAll(".biy-t-opt, .biy-t-parca, .biy-t-tus, .biy-t-gonder")
          .forEach(b => b.setAttribute("disabled",""));
        const kap = $("biyCalisma"); if (kap) kap.classList.add("kilitli");
        const ip = document.querySelector(".biy-t-ipucu");
        if (ip){ ip.className = "biy-t-alindi biy-gec"; ip.textContent = "⌛ انْتَهَى الوَقْتُ"; }
      }
    });
  },

  /* ---------- takım tarafı: çalışma durumu ---------- */
  // Yarım kalan cevap (yerleştirilen parçalar / yazılan harfler) state içinde
  // tutulur ki her _renderTakim çağrısında aynen geri kurulabilsin.
  _calismaHazirla(idx, s){
    if (!state.calisma || state.calisma.index !== idx){
      const b = bicimAl(s);
      let n = 0;
      if (b === "surukle")       n = (s.karisik || []).length;
      else if (b === "eslestir") n = (s.sollar  || []).length;
      state.calisma = { index: idx, yerlesim: new Array(n).fill(null), secili: null, yazi: "" };
    }
    return state.calisma;
  },
  _takimKilit(){
    const o = state.oda;
    if (!o || o.faz !== "cevap") return true;
    if (state.sonCevapIndex === o.aktifIndex) return true;
    return kalanSaniye() <= 0;
  },
  _ipucuMetni(s){
    const b = bicimAl(s);
    if (b === "surukle")  return "رَتِّبِ القِطَعَ بِالسَّحْبِ أَوِ اللَّمْسِ";
    if (b === "eslestir") return "انْقُلِ البِطَاقَاتِ إِلَى السَّطْرِ الصَّحِيحِ";
    if (b === "yazma")    return "اكْتُبِ الكَلِمَةَ بِالحُرُوفِ";
    return "اخْتَرْ إِجَابَةً";
  },
  _gonderHtml(kilit, tam){
    return '<div class="biy-t-gonder-sar"><button class="biy-t-gonder" ' +
           ((kilit || !tam) ? 'disabled' : '') +
           ' onclick="BIY.cevapGonder()">إِرْسَالٌ ✔</button></div>';
  },

  /* ---------- takım tarafı: biçime göre cevap alanı ---------- */
  _takimAlanHtml(s, kilit){
    const b = bicimAl(s);
    const c = state.calisma;

    if (b === "surukle"){
      const p = s.karisik || [];
      const slot = p.map((_, k) => {
        const v = c.yerlesim[k], dolu = (v != null);
        return '<div class="biy-t-slot'+(dolu?' dolu':'')+(dolu&&arMi(p[v])?' ar':'')+'" data-drop="slot:'+k+'"' +
               (dolu ? ' data-drag="slot:'+k+'"' : '') +
               ' onclick="BIY.slotTikla('+k+')">' +
               (dolu ? kacis(p[v]) : '<span class="biy-t-slot-no">'+(k+1)+'</span>') + '</div>';
      }).join("");
      const havuz = p.map((x, i) => c.yerlesim.indexOf(i) >= 0 ? '' :
        '<div class="biy-t-parca'+(c.secili===i?' secili':'')+(arMi(x)?' ar':'')+'" data-drag="havuz:'+i+'" onclick="BIY.parcaTikla('+i+')">'+kacis(x)+'</div>'
      ).join("");
      const tam = p.length > 0 && c.yerlesim.every(v => v != null);
      return '<div class="biy-t-calisma" id="biyCalisma">' +
               '<div class="biy-t-slotlar" dir="rtl">'+slot+'</div>' +
               '<div class="biy-t-havuz" data-drop="havuz" dir="rtl">' +
                 (havuz || '<span class="biy-t-bos">تَمَّ تَرْتِيبُ الكُلِّ ✔</span>') +
               '</div>' +
             '</div>' + BIY._gonderHtml(kilit, tam);
    }

    if (b === "eslestir"){
      const sol = s.sollar || [], sag = s.sagKarisik || [];
      const satir = sol.map((x, k) => {
        const v = c.yerlesim[k], dolu = (v != null);
        return '<div class="biy-t-cift-satir">' +
                 '<div class="biy-t-sol'+(arMi(x)?' ar':'')+'">'+kacis(x)+'</div>' +
                 '<div class="biy-t-ok">→</div>' +
                 '<div class="biy-t-slot'+(dolu?' dolu':'')+(dolu&&arMi(sag[v])?' ar':'')+'" data-drop="slot:'+k+'"' +
                 (dolu ? ' data-drag="slot:'+k+'"' : '') +
                 ' onclick="BIY.slotTikla('+k+')">' +
                 (dolu ? kacis(sag[v]) : '<span class="biy-t-slot-no">?</span>') + '</div>' +
               '</div>';
      }).join("");
      const havuz = sag.map((x, i) => c.yerlesim.indexOf(i) >= 0 ? '' :
        '<div class="biy-t-parca'+(c.secili===i?' secili':'')+(arMi(x)?' ar':'')+'" data-drag="havuz:'+i+'" onclick="BIY.parcaTikla('+i+')">'+kacis(x)+'</div>'
      ).join("");
      const tam = sol.length > 0 && c.yerlesim.every(v => v != null);
      return '<div class="biy-t-calisma" id="biyCalisma">' +
               '<div class="biy-t-ciftler">'+satir+'</div>' +
               '<div class="biy-t-havuz" data-drop="havuz">' +
                 (havuz || '<span class="biy-t-bos">تَمَّ وَضْعُ الكُلِّ ✔</span>') +
               '</div>' +
             '</div>' + BIY._gonderHtml(kilit, tam);
    }

    if (b === "yazma"){
      const tus = (s.tusKarisik || []).map((h, i) =>
        '<button class="biy-t-tus" '+(kilit?'disabled':'')+' onclick="BIY.tusBas('+i+')">'+kacis(h)+'</button>'
      ).join("");
      const hedef = s.harfSayi || 0;
      return '<div class="biy-t-yazma" id="biyCalisma">' +
               '<div class="biy-t-yazekran" dir="rtl">' +
                 (c.yazi ? kacis(c.yazi) : '<span class="biy-t-bos">…</span>') + '</div>' +
               (hedef ? '<div class="biy-t-sayi">'+c.yazi.length+' / '+hedef+' harf</div>' : '') +
               '<div class="biy-t-klavye" dir="rtl">'+tus +
                 '<button class="biy-t-tus sil" '+(kilit?'disabled':'')+' onclick="BIY.tusSil()">⌫</button>' +
               '</div>' +
             '</div>' + BIY._gonderHtml(kilit, c.yazi.length > 0);
    }

    // varsayılan: klasik test
    const opt = (s.secenekler || []).map((sec, i) =>
      '<button class="biy-t-opt'+(s.arSecenek?' ar':'')+'" style="--c:'+SIK_RENK[i % SIK_RENK.length]+'" ' +
      (kilit?'disabled':'')+' onclick="BIY.cevapla('+i+')">' +
      '<span class="biy-a-harf">'+String.fromCharCode(65+i)+'</span><span>'+kacis(sec)+'</span></button>'
    ).join("");
    return '<div class="biy-t-optlar">'+opt+'</div>';
  },

  /* ---------- dokunarak yerleştirme ---------- */
  parcaTikla(i){
    if (BIY._takimKilit()) return;
    const c = state.calisma; if (!c) return;
    if (c.secili === i){                       // ikinci dokunuş → ilk boş yuvaya
      const k = c.yerlesim.indexOf(null);
      if (k >= 0) c.yerlesim[k] = i;
      c.secili = null;
    } else {
      c.secili = i;
    }
    BIY._renderTakim();
  },
  slotTikla(k){
    if (BIY._takimKilit()) return;
    const c = state.calisma; if (!c) return;
    if (c.secili != null){
      const onceki = c.yerlesim.indexOf(c.secili);
      if (onceki >= 0) c.yerlesim[onceki] = null;
      c.yerlesim[k] = c.secili;
      c.secili = null;
    } else if (c.yerlesim[k] != null){
      c.yerlesim[k] = null;                    // havuza geri gönder
    }
    BIY._renderTakim();
  },
  tusBas(i){
    if (BIY._takimKilit()) return;
    const s = state.oda && state.oda.aktifSoru; if (!s) return;
    const c = state.calisma; if (!c) return;
    const h = (s.tusKarisik || [])[i];
    if (h == null || c.yazi.length >= 24) return;
    c.yazi += h;
    BIY._renderTakim();
  },
  tusSil(){
    if (BIY._takimKilit()) return;
    const c = state.calisma; if (!c || !c.yazi) return;
    c.yazi = c.yazi.slice(0, -1);
    BIY._renderTakim();
  },
  _tasi(kaynak, hedef){
    const c = state.calisma; if (!c || !kaynak || !hedef) return;
    const kp = kaynak.split(":"), hp = hedef.split(":");
    if (kp[0] === "havuz"){
      const i = +kp[1];
      if (hp[0] !== "slot") return;
      const k = +hp[1];
      const onceki = c.yerlesim.indexOf(i);
      if (onceki >= 0) c.yerlesim[onceki] = null;
      c.yerlesim[k] = i;
    } else if (kp[0] === "slot"){
      const k1 = +kp[1];
      if (hp[0] === "havuz"){ c.yerlesim[k1] = null; }
      else if (hp[0] === "slot"){
        const k2 = +hp[1];
        const g = c.yerlesim[k2]; c.yerlesim[k2] = c.yerlesim[k1]; c.yerlesim[k1] = g;
      }
    }
    c.secili = null;
  },

  /* ---------- parmakla sürükleme (pointer events) ---------- */
  // Tablet/telefon için HTML5 drag&drop kullanılmaz; parmağı takip eden bir
  // "hayalet" kopya + elementFromPoint ile bırakma hedefi bulunur.
  _dragKur(){
    const kap = $("biyCalisma");
    if (!kap || kap._dragli) return;
    kap._dragli = true;
    let bas = null, hayalet = null, tasindi = false;

    const temizle = () => {
      if (hayalet && hayalet.parentNode) hayalet.parentNode.removeChild(hayalet);
      hayalet = null;
      kap.querySelectorAll(".hedef").forEach(e => e.classList.remove("hedef"));
      kap.querySelectorAll(".suruk").forEach(e => e.classList.remove("suruk"));
    };
    const dropBul = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return (el && el.closest) ? el.closest("[data-drop]") : null;
    };

    // Sürükleme bittiğinde tarayıcının ürettiği "click" olayını yut ki
    // parça hem taşınıp hem de tıklanmış sayılmasın.
    kap.addEventListener("click", function(e){
      if (kap._yut){ e.stopPropagation(); e.preventDefault(); }
    }, true);

    kap.addEventListener("pointerdown", function(e){
      kap._yut = false;
      if (BIY._takimKilit()) return;
      const el = (e.target && e.target.closest) ? e.target.closest("[data-drag]") : null;
      if (!el) return;
      bas = { el: el, x: e.clientX, y: e.clientY, id: el.getAttribute("data-drag") };
      tasindi = false;
      try { el.setPointerCapture(e.pointerId); } catch(err){}
    });

    kap.addEventListener("pointermove", function(e){
      if (!bas) return;
      const dx = e.clientX - bas.x, dy = e.clientY - bas.y;
      if (!tasindi && (Math.abs(dx) + Math.abs(dy)) < 8) return;
      if (!tasindi){
        tasindi = true;
        hayalet = bas.el.cloneNode(true);
        hayalet.removeAttribute("data-drag");
        hayalet.removeAttribute("data-drop");
        hayalet.className = bas.el.className.replace("secili", "") + " biy-t-hayalet";
        hayalet.style.width = bas.el.offsetWidth + "px";
        document.body.appendChild(hayalet);
        bas.el.classList.add("suruk");
      }
      e.preventDefault();
      hayalet.style.left = e.clientX + "px";
      hayalet.style.top  = e.clientY + "px";
      kap.querySelectorAll(".hedef").forEach(x => x.classList.remove("hedef"));
      const hd = dropBul(e.clientX, e.clientY);
      if (hd) hd.classList.add("hedef");
    });

    kap.addEventListener("pointerup", function(e){
      if (!bas) return;
      const b = bas; bas = null;
      if (!tasindi){ temizle(); return; }
      const hd = dropBul(e.clientX, e.clientY);
      temizle();
      kap._yut = true;
      if (hd) BIY._tasi(b.id, hd.getAttribute("data-drop"));
      BIY._renderTakim();
    });

    kap.addEventListener("pointercancel", function(){ bas = null; temizle(); });
  },

  /* ---------- cevabı gönder ---------- */
  cevapGonder(){
    if (BIY._takimKilit()) return;
    const o = state.oda; if (!o) return;
    const s = o.aktifSoru; if (!s) return;
    const c = state.calisma; if (!c) return;
    const b = bicimAl(s);
    let secilen = null;
    if (b === "surukle"){
      if (!c.yerlesim.length || c.yerlesim.some(v => v == null)) return;
      secilen = c.yerlesim.map(v => (s.karisik || [])[v]);
    } else if (b === "eslestir"){
      if (!c.yerlesim.length || c.yerlesim.some(v => v == null)) return;
      secilen = c.yerlesim.map(v => (s.sagKarisik || [])[v]);
    } else if (b === "yazma"){
      if (!c.yazi) return;
      secilen = c.yazi;
    } else {
      return;
    }
    BIY._cevapYolla(secilen);
  },
  cevapla(optIdx){ BIY._cevapYolla(optIdx); },
  async _cevapYolla(secilen){
    const o = state.oda; if (!o || o.faz !== "cevap") return;
    if (kalanSaniye() <= 0) return;
    const idx = o.aktifIndex;
    if (state.sonCevapIndex === idx) return;
    state.sonCevapIndex = idx;
    try {
      await db.collection(KOLEKSIYON).doc(state.odaTakim.oda).collection("cevaplar").doc(state.odaTakim.takim + "_" + idx).set({
        takimId: state.odaTakim.takim, ad: state.takimAd, index: idx, secilen: secilen,
        kalan: kalanSaniye(),   // hız bonusu için kalan saniye
        zaman: firebase.firestore.FieldValue.serverTimestamp()
      });
      try { localStorage.setItem('biy_cevap', JSON.stringify({ oda: state.odaTakim.oda, takim: state.odaTakim.takim, index: idx })); } catch(e){}
    } catch(e){ console.error(e); state.sonCevapIndex = -1; }
    BIY._renderTakim();
  },

  /* ===================================================================
     MOD ALTYAPISI — Takım / Birey / Okul
     Üç mod da aynı Firestore yapısını kullanır: her katılımcı (ister takım,
     ister tek öğrenci) "takimlar" alt koleksiyonunda bir belgedir. Böylece
     puanlama, sonuç ekranı ve sıralama kodu üç modda da aynı çalışır.
     Birey modunda belgeye ek olarak  onay(bool) · red · atildi  alanları
     yazılır; takım/okul modunda öğretmen adları kendi yazdığı için onay yok.
     =================================================================== */

  // Başlat düğmesi görünsün mü, altındaki not ne yazsın (moda göre)
  _baslatDurumu(){
    const m = modAl();
    const sayi  = state.takimListe.length;
    const bagli = state.takimListe.filter(t => t.bagli).length;
    const bek   = state.bekleyenListe.length;
    const bekNot = bek ? " · " + bek + " فِي انْتِظَارِ المُوَافَقَةِ" : "";
    // Takım ve Okul: her ada bir karekod → hepsi bağlanınca başlar (aynı mantık)
    if (m !== "birey"){
      const c = cogSozu();                        // "فِرَق" | "صُفوف"
      if (sayi === 0) return { olur:false, not:"" };
      if (sayi < 2)   return { olur:false, not: c + ": " + sayi + " · يَلْزَمُ اثْنَانِ عَلَى الأَقَلِّ" };
      if (bagli < sayi) return { olur:false, not: c + ": " + sayi + " · اتَّصَلَ " + bagli + " · نَنْتَظِرُ " + (sayi-bagli) };
      return { olur:true, not: "✓ " + c + ": " + sayi + " · يُمْكِنُكَ البَدْءُ" };
    }
    if (sayi < 2) return { olur:false, not: "مُشَارِكُونَ: " + sayi + " · يَلْزَمُ اثْنَانِ عَلَى الأَقَلِّ" + bekNot };
    return { olur:true, not: "✓ مُشَارِكُونَ: " + sayi + " · يُمْكِنُكَ البَدْءُ" + bekNot };
  },

  /* ---------- TAKIM & OKUL lobisi: her takıma/sınıfa ayrı karekod ---------- */
  _takimKartlariCiz(){
    const grid = $("takimlarGrid"); if (!grid) return;
    grid.innerHTML = "";
    state.takimListe.forEach(t => {
      const link = takimLinki(state.odaId, t.id); const qrId = "qr_" + t.id;
      const kart = document.createElement("div");
      kart.className = "biy-takim-kart " + (t.bagli ? "biy-kart-bagli" : "biy-kart-bekliyor");
      kart.innerHTML =
        '<button class="biy-sil" title="حَذْفٌ" onclick="BIY.takimSil(&quot;'+t.id+'&quot;)">✕</button>' +
        '<h3>'+ kacis(t.ad) +'</h3>' +
        '<div class="biy-takim-durum '+(t.bagli?"biy-bagli":"biy-bekliyor")+'">'+(t.bagli?"● مُتَّصِلٌ":"○ فِي الانْتِظَارِ")+'</div>' +
        '<div class="biy-qr" id="'+qrId+'"></div>' +
        '<div class="biy-takim-link"><input readonly value="'+ kacis(link) +'"><button class="biy-kopya" onclick="BIY.kopyala(this)">نَسْخٌ</button></div>';
      grid.appendChild(kart);
      try { const box = $(qrId); if (box && window.QRCode){ box.innerHTML=""; new QRCode(box, { text: link, width: 170, height: 170, correctLevel: QRCode.CorrectLevel.M }); } }
      catch(err){ console.warn("QR:", err); }
    });
  },

  /* ---------- BİREY lobisi: tek ortak karekod ---------- */
  _odaKarekodCiz(){
    const kap = $("lobiOdaAlan"); if (!kap || !state.odaId) return;
    const link = odaLinki(state.odaId);
    const ipucu = "يَمْسَحُ الجَمِيعُ هَذَا الرَّمْزَ وَيَكْتُبُ كُلٌّ اسْمَهُ. يَدْخُلُونَ القَائِمَةَ بَعْدَ مُوَافَقَتِكَ.";
    kap.innerHTML =
      '<div class="biy-oda-kart">' +
        '<div class="biy-oda-sol">' +
          '<span class="biy-oda-etiket">رَمْزُ الغُرْفَةِ</span>' +
          '<span class="biy-oda-kod">'+ kacis(state.odaId) +'</span>' +
          '<div class="biy-takim-link"><input readonly value="'+ kacis(link) +'"><button class="biy-kopya" onclick="BIY.kopyala(this)">نَسْخٌ</button></div>' +
          '<p class="biy-oda-ipucu">'+ ipucu +'</p>' +
        '</div>' +
        '<div class="biy-qr biy-oda-qr" id="odaQrKutu"></div>' +
      '</div>';
    try {
      const box = $("odaQrKutu");
      if (box && window.QRCode){ box.innerHTML = ""; new QRCode(box, { text: link, width: 230, height: 230, correctLevel: QRCode.CorrectLevel.M }); }
    } catch(err){ console.warn("QR:", err); }
  },

  _katilimcilariCiz(){
    // --- onay bekleyenler kuyruğu ---
    const bek = $("lobiBekleyen");
    if (bek){
      const b = state.bekleyenListe;
      bek.innerHTML = !b.length
        ? '<div class="biy-bek-bos">⏳ لَا أَحَدَ يَنْتَظِرُ — مَنْ يَمْسَحُ الرَّمْزَ يَظْهَرُ هُنَا.</div>'
        : '<div class="biy-bek-ust"><h3>⏳ فِي انْتِظَارِ المُوَافَقَةِ ('+b.length+')</h3>' +
            (b.length > 1 ? '<button class="biy-btn biy-btn-yesil biy-btn-mini" onclick="BIY.hepsiniOnayla()">المُوَافَقَةُ عَلَى الكُلِّ</button>' : '') +
          '</div>' +
          '<div class="biy-bek-liste">' + b.map(k =>
            '<div class="biy-bek-kart">' +
              '<button class="biy-bek-ad" title="صَحِّحِ الاسْمَ" onclick="BIY.katilimciAdDegistir(&quot;'+k.id+'&quot;)">'+kacis(k.ad)+'</button>' +
              '<span class="biy-bek-btnlar">' +
                '<button class="biy-onay-ok" title="مُوَافَقَةٌ" onclick="BIY.katilimciOnayla(&quot;'+k.id+'&quot;)">✓</button>' +
                '<button class="biy-onay-red" title="رَفْضٌ" onclick="BIY.katilimciReddet(&quot;'+k.id+'&quot;)">✕</button>' +
              '</span>' +
            '</div>').join("") +
          '</div>';
    }
    // --- onaylanan katılımcılar ---
    const grid = $("takimlarGrid"); if (!grid) return;
    const L = state.takimListe;
    if (!L.length){
      grid.innerHTML = '<div class="biy-kat-bos">لَا مُشَارِكِينَ بَعْدُ.</div>';
      return;
    }
    grid.innerHTML =
      '<div class="biy-kat-ust"><span>👥 المُشَارِكُونَ ('+L.length+')</span>' +
        '<span class="biy-kat-ipucu">الْمِسِ الاسْمَ لِتُصَحِّحَهُ · ✕ لِلْإِخْرَاجِ</span></div>' +
      '<div class="biy-kat-satirlar'+(L.length > 12 ? ' biy-kaydir' : '')+'">' +
        L.map(k =>
          '<div class="biy-kat-satir '+(k.bagli ? 'bagli' : 'kopuk')+'">' +
            '<span class="biy-kat-nokta" title="'+(k.bagli?'مُتَّصِلٌ':'غَيْرُ مُتَّصِلٍ')+'"></span>' +
            '<button class="biy-kat-ad" title="صَحِّحِ الاسْمَ" onclick="BIY.katilimciAdDegistir(&quot;'+k.id+'&quot;)">'+kacis(k.ad)+'</button>' +
            '<button class="biy-kat-at" title="أَخْرِجْ مِنَ المُسَابَقَةِ" onclick="BIY.katilimciAt(&quot;'+k.id+'&quot;)">✕</button>' +
          '</div>').join("") +
      '</div>';
  },

  /* ---------- öğretmen müdahalesi: onay / ret / düzelt / çıkar ---------- */
  _katilimciRef(id){ return db.collection(KOLEKSIYON).doc(state.odaId).collection("takimlar").doc(id); },
  async katilimciOnayla(id){
    try { await BIY._katilimciRef(id).update({ onay: true }); SES.baglandi(); }
    catch(e){ console.error(e); }
  },
  async hepsiniOnayla(){
    const b = state.bekleyenListe.slice(); if (!b.length) return;
    try {
      const batch = db.batch();
      b.forEach(k => batch.update(BIY._katilimciRef(k.id), { onay: true }));
      await batch.commit(); SES.baglandi();
    } catch(e){ console.error(e); }
  },
  katilimciReddet(id){
    const k = state.bekleyenListe.find(x => x.id === id) || {};
    BIY._onay("هَلْ تَرْفُضُ المُشَارَكَةَ؟", "«" + (k.ad||"") + "» لَنْ يَدْخُلَ القَائِمَةَ. يُمْكِنُهُ المُحَاوَلَةُ بِاسْمٍ جَدِيدٍ.",
      "رَفْضٌ", async () => { try { await BIY._katilimciRef(id).update({ red: true }); } catch(e){ console.error(e); } });
  },
  katilimciAt(id){
    const k = state.takimListe.find(x => x.id === id) || {};
    BIY._onay("هَلْ تُخْرِجُهُ مِنَ المُسَابَقَةِ؟", "«" + (k.ad||"") + "» سَيَخْرُجُ مِنَ القَائِمَةِ وَسَيَظْهَرُ إِشْعَارٌ عَلَى جِهَازِهِ.",
      "إِخْرَاجٌ", async () => { try { await BIY._katilimciRef(id).update({ atildi: true, bagli: false }); } catch(e){ console.error(e); } });
  },
  katilimciAdDegistir(id){
    const k = state.takimListe.find(x => x.id === id) || state.bekleyenListe.find(x => x.id === id);
    if (!k) return;
    BIY._metinSor("صَحِّحِ الاسْمَ", k.ad, "حِفْظٌ", async (yeni) => {
      const ad = isimTemizle(yeni);
      if (ad.length < 2) return;
      try { await BIY._katilimciRef(id).update({ ad: ad }); } catch(e){ console.error(e); }
    });
  },
  // küçük metin sorma penceresi (_onay kardeşi)
  _metinSor(baslik, mevcut, evetMetin, onEvet){
    const eski = $("biyOnay"); if (eski) eski.remove();
    const ov = document.createElement("div"); ov.id = "biyOnay"; ov.className = "biy-onay-ov";
    ov.innerHTML = '<div class="biy-onay-kutu"><h3>'+kacis(baslik)+'</h3>' +
      '<input id="biyMetinInput" class="biy-onay-input" type="text" maxlength="18" value="'+kacis(mevcut||"")+'">' +
      '<div class="biy-onay-btnlar"><button class="biy-onay-hayir">إِلْغَاءٌ</button><button class="biy-onay-evet">'+kacis(evetMetin)+'</button></div></div>';
    document.body.appendChild(ov);
    const kapat = () => { if (ov.parentNode) ov.remove(); };
    const inp = ov.querySelector("#biyMetinInput");
    const tamam = () => { const v = inp.value; kapat(); if (onEvet) onEvet(v); };
    ov.querySelector(".biy-onay-hayir").onclick = kapat;
    ov.querySelector(".biy-onay-evet").onclick = tamam;
    inp.addEventListener("keydown", e => { if (e.key === "Enter") tamam(); if (e.key === "Escape") kapat(); });
    ov.addEventListener("click", e => { if (e.target === ov) kapat(); });
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  },

  // tahtadaki "kim cevapladı" şeridi
  _ciplerHtml(katilan, buCevaplar){
    return katilan.map(tk => {
      const ok = !!buCevaplar[tk.id];
      return '<span class="biy-cip '+(ok?'ok':'')+'">' + (ok ? '<span class="biy-cip-tik">✓</span> ' : '') +
        kacis(tk.ad) + '</span>';
    }).join("");
  },

  /* ===================================================================
     ÖĞRENCİ TARAFI — tek karekodla katılım (yalnız birey modu)
     =================================================================== */
  async katilimAkisi(oda){
    state.odaTakim = { oda: oda, takim: null };
    ekranGoster("ekranKatil");
    try {
      const snap = await db.collection(KOLEKSIYON).doc(oda).get();
      if (!snap.exists){ BIY._katilNot("لَمْ تُوجَدِ الغُرْفَةُ. امْسَحِ الرَّمْزَ مِنْ جَدِيدٍ أَوِ اسْأَلْ مُعَلِّمَكَ.", true); return; }
      const o = snap.data() || {};
      state.oyunModu = "birey";   // ortak karekod bağlantısı yalnız birey odalarında üretilir
      // daha önce katıldıysa aynı kayda dön
      let kayit = null; try { kayit = JSON.parse(localStorage.getItem("biy_katilim") || "null"); } catch(e){}
      if (kayit && kayit.oda === oda && kayit.takim){
        const kd = await db.collection(KOLEKSIYON).doc(oda).collection("takimlar").doc(kayit.takim).get();
        if (kd.exists){ BIY._katilimIzle(oda, kayit.takim); return; }
        try { localStorage.removeItem("biy_katilim"); } catch(e){}
      }
      BIY._katilFormu();
    } catch(e){
      console.error(e);
      BIY._katilNot("تَعَذَّرَ الاتِّصَالُ. تَحَقَّقْ مِنَ الإِنْتَرْنِتِ.", true);
    }
  },
  _katilFormu(){
    ekranGoster("ekranKatil");
    const kart = $("katilKart"); if (kart) kart.classList.remove("gizli");
    const bekle = $("katilBekle"); if (bekle) bekle.classList.add("gizli");
    const not = $("katilNot"); if (not) not.textContent = "";
    const inp = $("katilAdInput"); if (inp){ inp.value = ""; setTimeout(() => inp.focus(), 60); }
  },
  _katilNot(metin, hata){
    const not = $("katilNot");
    if (not){ not.textContent = metin || ""; not.classList.toggle("biy-not-hata", !!hata); }
  },
  async katilGonder(){
    const oda = state.odaTakim && state.odaTakim.oda; if (!oda) return;
    const inp = $("katilAdInput"); const ham = inp ? inp.value : "";
    const sorun = isimSorunu(ham);
    if (sorun){ BIY._katilNot(sorun, true); if (inp) inp.focus(); return; }
    let ad = isimTemizle(ham);
    BIY._katilNot("جَارٍ الإِرْسَالُ…", false);
    try {
      // aynı isim varsa numaralandır
      const hepsi = await db.collection(KOLEKSIYON).doc(oda).collection("takimlar").get();
      const adlar = []; hepsi.forEach(d => { const t = d.data(); if (!t.atildi && !t.red) adlar.push(t.ad); });
      ad = isimBenzersiz(ad, adlar);
      const id = rastgeleKod(5);
      await db.collection(KOLEKSIYON).doc(oda).collection("takimlar").doc(id).set({
        ad: ad, onay: false, bagli: true, puan: 0,
        olusturmaZamani: firebase.firestore.FieldValue.serverTimestamp()
      });
      try { localStorage.setItem("biy_katilim", JSON.stringify({ oda: oda, takim: id })); } catch(e){}
      BIY._katilimIzle(oda, id);
    } catch(e){
      console.error(e);
      BIY._katilNot("تَعَذَّرَتِ المُشَارَكَةُ: " + (e.code || e.message), true);
    }
  },
  // kendi kaydını dinle: onay / ret / çıkarılma
  _katilimIzle(oda, id){
    state.katilimId = id; state.odaTakim = { oda: oda, takim: id }; state.katilBagli = false;
    if (state.katilimAbone) state.katilimAbone();
    const ref = db.collection(KOLEKSIYON).doc(oda).collection("takimlar").doc(id);
    state.katilimAbone = ref.onSnapshot(d => {
      if (!d.exists){ try { localStorage.removeItem("biy_katilim"); } catch(e){} BIY._katilFormu(); return; }
      const t = d.data() || {};
      state.takimAd = t.ad || "مُشَارِكٌ";
      if (t.atildi){
        state.atildiMi = true;
        if (state.takimNabiz){ clearInterval(state.takimNabiz); state.takimNabiz = null; }
        if (state.katilimAbone){ state.katilimAbone(); state.katilimAbone = null; }
        if (state.odaAbone){ state.odaAbone(); state.odaAbone = null; }
        try { localStorage.removeItem("biy_katilim"); } catch(e){}
        sayacDurdur(); ekranGoster("ekranTakim");
        BIY._takimIcerik("🚪", "تَمَّ إِخْرَاجُكَ مِنَ المُسَابَقَةِ", "أَخْرَجَكَ المُعَلِّمُ مِنَ القَائِمَةِ.");
        return;
      }
      if (t.red){
        try { localStorage.removeItem("biy_katilim"); } catch(e){}
        BIY._katilBeklemeEkrani("✋", "لَمْ يُقْبَلِ الاسْمُ", "حَاوِلْ مَرَّةً أُخْرَى بِاسْمِكَ الحَقِيقِيِّ.",
          '<button class="biy-btn biy-btn-yesil" onclick="BIY.katilYeniden()">شَارِكْ بِاسْمٍ جَدِيدٍ</button>');
        return;
      }
      if (t.onay !== true){
        BIY._katilBeklemeEkrani("⏳", kacis(t.ad || ""), "فِي انْتِظَارِ مُوَافَقَةِ المُعَلِّمِ…",
          '<div class="biy-bekle-nokta"><span></span><span></span><span></span></div>');
        return;
      }
      // onaylandı → normal takım akışına geç (bir kez)
      if (!state.katilBagli){
        state.katilBagli = true;
        BIY.takimBagla(oda, id);
      }
    }, err => { console.error(err); BIY._katilNot("انْقَطَعَ الاتِّصَالُ: " + (err.code || err.message), true); });
  },
  _katilBeklemeEkrani(emoji, baslik, metin, ekstra){
    ekranGoster("ekranKatil");
    const kart = $("katilKart"); if (kart) kart.classList.add("gizli");
    const bekle = $("katilBekle");
    if (bekle){
      bekle.classList.remove("gizli");
      bekle.innerHTML = '<div class="biy-kart biy-orta"><div class="biy-logo">'+simge(emoji)+'</div>' +
        '<h1>'+baslik+'</h1><p class="biy-alt">'+kacis(metin)+'</p>' + (ekstra || "") + '</div>';
    }
  },
  katilYeniden(){
    if (state.katilimAbone){ state.katilimAbone(); state.katilimAbone = null; }
    state.katilimId = null; state.katilBagli = false; state.atildiMi = false;
    BIY._katilFormu();
  }
};
window.BIY = BIY;
// canlı yarışmada sekme kapatma/yenileme kazasına karşı uyarı
window.addEventListener("beforeunload", function(e){
  if (state.mod === "admin" && state.oda && (state.oda.durum === "oyun" || state.oda.durum === "beraberlik")){
    e.preventDefault(); e.returnValue = "";
  }
});

/* ===========================================================
   Başlangıç / mod yönlendirme
   =========================================================== */
(function baslat(){
  const p = new URLSearchParams(location.search);
  const oda = p.get("oda"), takim = p.get("takim");

  /* Tek karekodlu modlarda (birey/okul) baglanti yalnizca ?oda= tasir; ogrenci
     kendi adini yazar ve ogretmen onayini bekler. Takim modunda ise her takimin
     kendi karekodu vardir, bu yuzden ?takim= de bulunur.                     */
  if (oda && !takim){
    state.mod = "takim";
    BIY.katilimAkisi(oda);
    return;
  }

  if (oda && takim){
    state.mod = "takim"; state.odaTakim = { oda, takim };
    ekranGoster("ekranTakim");
    // takım listesi (final için) hafif dinleme
    db.collection(KOLEKSIYON).doc(oda).collection("takimlar").onSnapshot(snap => {
      state.takimListe = []; snap.forEach(d => { const t = d.data(); state.takimListe.push({ id: d.id, ad: t.ad, puan: t.puan||0, bagli: !!t.bagli }); });
    }, () => {});
    // Öğrenci tarafında hesap/giriş yok: karekoddaki oda+takım bilgisi yeterli.
    BIY.takimBagla(oda, takim);
    return;
  }

  /* Sade adres (?oda= yok) ile açan kişi öğretmendir: giriş kapısı, hesap ve
     rol denetimi kaldırıldı. Bu dosya bir okul sitesinin parçası değil; tek
     başına çalışan bir sınıf aracı. Öğrenciler zaten karekod/bağlantıyla
     doğrudan takım ekranına düştüğü için bu panele hiç uğramazlar.        */
  state.mod = "admin";
  ekranGoster("ekranYukleniyor");
  try {
    BIY._konulariHazirla();
    BIY._soruSayiSinir();
    BIY._menuDurum();
    // sayfa yenilenmişse aktif odaya/oyuna dön
    let kayit = null; try { kayit = JSON.parse(localStorage.getItem('biy_aktif') || 'null'); } catch(e){}
    if (kayit && kayit.oda){ BIY._devamEt(kayit); }
    else ekranGoster("ekranAnasayfa");
  } catch(err){
    console.error("[BIY] Açılış hatası:", err);
    const not = $("girisRolNot");
    if (not) not.textContent = String(err && err.message ? err.message : err);
    ekranGoster("ekranGirisKapisi");
  }
})();
