/*
 * KEŞİF sim/props — İÇ MEKÂN PROP METİNLERİ (saf veri). Sözleşme §2: Türkçe, aile dostu, özgün; serbest kullanıcı metni YOK.
 * Her satır ≤ 72 karakterdir (HUD ipucu / konuşma balonu); `propTexts.test.js` hepsini citySafe tarayıcısından geçirir
 * ve yinelenen/uzun satırı reddeder.
 *
 *   TEXTS[tablo] → string[]        (mesaj satırları; davranış sayaçla/özetle seçer)
 *   TOGGLE_TEXTS[anahtar] → {on:string[], off:string[]}
 *   pickText(tablo, n) → string    n tamsayı (hash/sayaç), tablo boşsa ''
 *   BOOK_TITLES · MENU_BOARDS · NOTICES · SCORE_BOARDS     tabela içeriği (propSignsIndoor.js tüketir)
 */

export const MSG_MAX = 72;

/** Kitap adları (kitaplık / kitap yığını). */
export const BOOK_TITLES = Object.freeze([
  'Neon Şehirde Çay Demlemek', 'Robotlar İçin Nazik Rehber', 'Çatı Bahçeleri Atlası', 'Dron Kuşlar ve Gerçek Kuşlar',
  'Yağmurun On Bin Sesi', 'Meridyen Haritası', 'Küçük Devre Masalları', 'Gökdelen Çiçekleri', 'Hologram Çizim Defteri',
  'Metro Çizgilerinin Sırrı', 'Işıkla Resim Yapmak', 'Zeplinle Dünya Turu', 'Pil Dolu Bir Gün', 'Servo Motor Şiirleri',
  'Parlayan Pencereler', 'Sessiz Sinema Rehberi', 'Kule Kedisi Mırmır', 'Gece Pazarı Tarifleri', 'Bulut Ramen Defteri',
  'Kodların Küçük Öyküsü', 'Piksel Bahçıvanı', 'Uzay Sepeti', 'Turkuaz Dronun Yolculuğu', 'Tek Tekerlekli Gezginler',
]);

const BOOK_FRAMES = ['Raftan bir kitap çektin: "', 'Rafta şu kitap dikkatini çekti: "', 'Elinde şu kitap var: "'];
const bookLines = BOOK_TITLES.map((t, i) => BOOK_FRAMES[i % 3] + t + '".');

/** Menü tahtaları (sol: sahip türü). Her biri 4–5 satır: başlık + kalemler (fiyat: K = Kredi). */
export const MENU_BOARDS = Object.freeze([
  { kind: 'ramen_bari', lines: ['BULUT RAMEN', 'Sebzeli Ramen 12 K', 'Mantarlı Ramen 14 K', 'Çıtır Tempura 6 K', 'Sıcak Çay 3 K'] },
  { kind: 'ramen_bari', lines: ['USTA SELVİ ÇORBA', 'Misolu Çorba 8 K', 'Pirinç Topu 5 K', 'Yeşil Çay 3 K', 'Mochi 4 K'] },
  { kind: 'ramen_bari', lines: ['GÜNÜN ÇORBASI', 'Tavuk Suyu 9 K', 'Mercimek 7 K', 'Pide Dilimi 4 K', 'Ayran 3 K'] },
  { kind: 'kitap_kafe', lines: ['KOZMİK KAFE', 'Demli Çay 3 K', 'Sıcak Çikolata 6 K', 'Elmalı Turta 7 K', 'Limonata 5 K'] },
  { kind: 'kitap_kafe', lines: ['OKUMA ÇAYI', 'Bitki Çayı 4 K', 'Kurabiye 3 K', 'Filtre Kahve 5 K', 'Simit 2 K'] },
  { kind: 'kitap_kafe', lines: ['SAYFA ARASI', 'Türk Çayı 2 K', 'Poğaça 3 K', 'Süt Köpüklü Kahve 6 K', 'Kek Dilimi 5 K'] },
  { kind: 'cati_bahcesi', lines: ['BAHAR ÇATI', 'Taze Nane Çayı 4 K', 'Limonlu Su 3 K', 'Meyve Tabağı 8 K', 'Bal Kaymak 9 K'] },
  { kind: 'cati_bahcesi', lines: ['BAHÇE MASASI', 'Ihlamur 4 K', 'Salatalık Suyu 3 K', 'Zeytinli Poğaça 5 K', 'Çilek Kasesi 7 K'] },
  { kind: 'kulup', lines: ['RİTİM İKRAM', 'Meyve Bardağı 6 K', 'Narlı Soda 5 K', 'Çıtır Patates 6 K', 'Mısır Kasesi 5 K'] },
]);

/** İlan panoları (Türkçe, günlük hayat; kimseyi hedef almaz). */
export const NOTICES = Object.freeze([
  { kind: 'dron_kurye', lines: ['İLAN PANOSU', 'Turkuaz şemsiye bulundu', 'Pil değişimi cuma', 'Paketler 17:00 çıkar'] },
  { kind: 'dron_kurye', lines: ['KURYE NOTU', 'Dronlar kapıda şarj olur', 'Yeni rota: Gece Pazarı', 'Kask unutma!'] },
  { kind: 'dron_kurye', lines: ['DUYURU', 'Pervane bakımı yarın', 'Çay ocağı koridorda', 'Teslimat saati 5 dk uzadı'] },
  { kind: 'kitap_kafe', lines: ['İLAN PANOSU', 'Okuma saati cumartesi', 'Kayıp: yeşil defter', 'Takas rafı doldu'] },
  { kind: 'kitap_kafe', lines: ['KAFE DUYURUSU', 'Yeni gelen kitaplar rafta', 'Sessiz masa sol köşe', 'Çay ikramı 16:00'] },
  { kind: 'garaj_atolyesi', lines: ['ATÖLYE PANOSU', 'Lastik gününe hazır ol', 'Boya kutuları üst rafta', 'Takımlar yerine konur'] },
  { kind: 'garaj_atolyesi', lines: ['USTA NOTU', 'Kasa kapağı bakımda', 'Yağ kutusu sol dolapta', 'Süpürge herkesin'] },
  { kind: 'garaj_atolyesi', lines: ['YENİ ARAÇ', 'Hoverbisiklet testi var', 'Kask zorunlu', 'Denemeden önce sor'] },
]);

/** Skor tabloları (arcade): kurgusal adlar, yalnız puan. */
export const SCORE_BOARDS = Object.freeze([
  { lines: ['REKOR TABLOSU', '1 DEFNE   9800', '2 KEREM   9150', '3 MİRA     8700', '4 BÜLENT 8200'] },
  { lines: ['GÜNÜN EN İYİLERİ', '1 TUNA   12400', '2 ECE    11900', '3 ŞULE   11300', '4 SELVİ  10800'] },
  { lines: ['HAFTANIN SKORU', '1 CENGİZ 7650', '2 BAHAR  7400', '3 KEMAL  7050', '4 NEHİR  6900'] },
  { lines: ['ARCADE ONURU', '1 PİRAYE 15200', '2 BOLT   14100', '3 ÇIKRIK 13750', '4 DEFNE  13300'] },
]);

/** Sanat metinleri. */
const SANAT = [
  'Tuvalde neon bir gün batımı parlıyor.',
  'Resimde yağmurlu bir sokak, ışıklar su birikintisinde.',
  'Boyalar henüz kurumamış; hafif bir çınlama duyuluyor.',
  'Fırça darbeleri bir çatı bahçesini anlatıyor.',
  'Resimde dev bir zeplin, altında minik şehir.',
  'Şövalede yarım kalmış bir robot portresi var.',
  'Heykel, kolları açmış bir dron kuşu gibi.',
  'Heykelin gözleri gece hafifçe parlıyor.',
  'Cam ve metalden yapılmış küçük bir meridyen çizgisi.',
  'Tuvalde renkli bir metro haritası dolaşıyor.',
  'Soyut bir resim; her bakışta başka bir şehir görüyorsun.',
  'Heykel, sabırla bekleyen bir bekçi robot gibi duruyor.',
];

/** Sunucu kayıtları (hacker odası). */
const SUNUCU = [
  'Kayıt 41: Tüm sistemler sağlıklı, fanlar sakin.',
  'Kayıt 77: Gece yedekleme tamamlandı, hiçbir şey kaybolmadı.',
  'Kayıt 12: Çözülen bulmaca sayısı bugün 9.',
  'Kayıt 03: Soğutma 22 derece. Çay soğutmak için ideal!',
  'Kayıt 58: Yeni zar ipucu eklendi; altı yüzlü düşün.',
  'Kayıt 90: Rün dizisi için pil sevinçli, kol hazır.',
  'Kayıt 26: Kullanıcı sayısı 1. O da sensin, hoş geldin.',
];

/** Bilgi terminali (iç mekân türüne göre; yoksa 'genel'). */
export const BILGI = Object.freeze({
  genel: [
    'Bilgi: Bugün hava neon, yürüyüş için güzel.',
    'Bilgi: Terminaller yeniden doğuş noktandır; bulduklarını hatırlarım.',
    'Bilgi: Bilgi terminali her zaman açıktır. Su içmeyi unutma.',
  ],
  klinik: [
    'Klinik: Nabız ve neşe ölçümü ücretsizdir.',
    'Klinik: Bekleme sırasında su ikramı var.',
    'Klinik: Robot doktor her sabah bakımdan geçer.',
  ],
  dron_kurye: [
    'Kurye: Paket panosunda 3 teslimat var, süreni iyi kullan.',
    'Kurye: Dronlar şarj olurken yaklaşma, mola verirler.',
    'Kurye: Bugün en hızlı teslimat 4 dakika 12 saniye.',
  ],
  market: [
    'Market: Taze reyon 08:00\'de dolar; enerji hücresi alt rafta.',
    'Market: Sepet dolsun! Fiyatlar etiket üstünde.',
    'Market: İndirim saati: ikindi sonrası meyve reyonu.',
  ],
  arcade: [
    'Arcade: Kredi yok, skor var. Rekor panosu duvarda.',
    'Arcade: Her makine bir hikâye; sırayı koru.',
    'Arcade: Ödül tezgâhı kapanmadan önce rekor kartını göster.',
  ],
  holo_sinema: [
    'Sinema: Seans başlamadan telefonu sessize al.',
    'Sinema: Son sıra en iyi manzara, ön sıra en yakın.',
    'Sinema: Bu hafta: Bulut Kasabası ve Küçük Robot.',
  ],
});

const POSTA = [
  'Postaya baktın: bir kartpostal, arkasında "Meridyen\'den selam!".',
  'Posta kutusunda faturalar yok, yalnızca bir çiçek tohumu paketi.',
  'Kutunun içinde katlanmış küçük bir harita duruyor.',
  'Posta: Komşudan "kapıyı çekerken yavaş!" notu.',
  'Kutuda bir kuryenin bıraktığı yeşil bir etiket var.',
];

const VITRIN = [
  'Vitrinde ışıklı bir küp, yanında "Dokunma, sadece bak" notu.',
  'Vitrinde minik bir model zeplin dönüyor.',
  'Vitrinde el yapımı hologram anahtarlıklar sıralanmış.',
  'Vitrinin içinde eski bir kasetçalar duruyor.',
  'Vitrinde parlayan taş koleksiyonu: turkuaz, yeşil, pembe.',
  'Vitrinde renkli ping pong topları, hepsi sıfır numara.',
];

const KOD_NOTU = [
  'Not: "Kapıyı çözmek için etrafa dikkatli bak."',
  'Not: "Rakamlar 1\'den 6\'ya kadar; her biri bir yerde saklı."',
  'Not: "Kodu unutanlara: yanındaki küçük panele bak."',
  'Not: "Zarlar yalan söylemez, sırayla say."',
];

export const TEXTS = Object.freeze({
  kitap: bookLines,
  sanat: SANAT,
  sunucu: SUNUCU,
  posta: POSTA,
  vitrin: VITRIN,
  kod_notu: KOD_NOTU,
  gizli_kapi: ['Raf yavaşça kaydı ve gizli bir geçit göründü!', 'Rafın arkasında bir geçit açıldı.', 'Tık! Raf kenara kaydı.'],
  kapi_kapat: ['Kapı kapandı.', 'Kapı yumuşakça kapandı.', 'Kapı sessizce kapandı.'],
  kapi_kilitli: [
    'Kapı kilitli. Yanındaki düzeneği dene.',
    'Kilitli! Yanındaki panelden çözüm bulabilirsin.',
    'Bu kapı şimdi kapalı; kodu ya da kartı bul.',
  ],
  kapi_otomatik: ['Otomatik kapı: yaklaşınca kendiliğinden açılır.', 'Kapı otomatik; yaklaşman yeterli.', 'Kapı seni görünce açılır.'],
  kapi_cikis: ['İçeriden çıkış her zaman serbest.', 'Bu taraftan kapı hep açık.'],
  pad_kod: ['Kod paneli: 1–6 arası rakamlardan oluşan bir kod bekliyor.', 'Kod paneli ışığı turuncu yanıyor.'],
  pad_kart: ['Kart okuyucu: bir kimlik kartı bekliyor.', 'Kart okuyucu yeşil çizgisini kıpırdatıyor.'],
  pad_hack: ['Çözme terminali: küçük bir bulmaca açıldı.', 'Terminal "Kilidi çöz!" diye bip bip yapıyor.'],
  asansor: ['Asansör çağrıldı, kabin yolda.', 'Düğme yandı; asansör geliyor.', 'Asansör hemen gelecek.'],
  robot_kedi: [
    'Robot kedi mırıldadı: "prrr.exe başlatıldı."',
    'Robot kedi kuyruğunu salladı ve parladı.',
    'Robot kedi başını sana sürttü, kablolar gıdıklandı.',
    'Robot kedi "miyav" yerine kısa bir melodi çaldı.',
  ],
  mini_robot: [
    'Mini robot el salladı: "Merhaba, ben tam boy değilim ama iyi niyetliyim!"',
    'Mini robot bip bip yaptı ve döndü.',
    'Mini robot tekerlerini oynatıp selam verdi.',
    'Mini robot "Pilim %99, keyfim %100" dedi.',
  ],
  sahip_yok: ['Burada kimse yok gibi... ama oda sıcak.', 'Birazdan döner herhalde.'],
  oturma: ['Oturdun. Kalkmak için zıpla ya da F.', 'Rahatça yerleştin. Kalkmak için zıpla.'],
  uzanma: ['Uzandın. Kalkmak için zıpla ya da F.', 'Rahatça uzandın. Kalkmak için zıpla.'],
  kapsul: ['Kapsül kapağı yumuşakça kapandı; mor ışık yanıyor.'],
  otomat_bip: ['Otomat bip dedi: "Hoş geldin!"', 'Otomat ışıkları yakıp söndürdü.', 'Otomat: "Seçim yap, ben hazırım."'],
  pickup: ['Eşyayı aldın.', 'Cebine koydun.'],
  pickup_bos: ['Burada artık bir şey yok.', 'Ele alınacak bir şey kalmadı.'],
});

/** Açma/kapama iletileri (anahtar → on/off). */
export const TOGGLE_TEXTS = Object.freeze({
  katlanir_masa: { on: ['Katlanır masa açıldı.', 'Masa yerine oturdu.'], off: ['Katlanır masa duvara yattı.', 'Masa katlandı.'] },
  cok_ekranli_masa: { on: ['Ekranlar uyandı; çalışma ışıkları yandı.', 'Üç ekran birden parladı.'], off: ['Ekranlar uykuya daldı.', 'Ekranlar karardı.'] },
  dus_kabini: { on: ['Duş kabini sıcak buharla doldu.', 'Su sesi başladı, buhar yükseliyor.'], off: ['Duş durdu.', 'Su kesildi.'] },
  sarj_istasyonu: { on: ['Şarj başladı; yeşil ışık nabız gibi atıyor.'], off: ['Şarj tamam, ışık söndü.'] },
  cay_ocagi: { on: ['Çay demleniyor… kokusu odaya yayıldı.'], off: ['Çayın hazır! Afiyet olsun.'] },
  holo_ekran: { on: ['Ekran kanalı değişti.', 'Hologram ekran yeni bir sahne gösteriyor.'], off: ['Hologram ekran kapandı.'] },
  dev_holo_ekran: { on: ['Dev ekran kanalı değişti.', 'Duvardaki dev hologram yeni bir şehir gösteriyor.'], off: ['Dev ekran kapandı.'] },
  televizyon: { on: ['Ekran açıldı: kanal değişti.', 'Ekranda bir çizgi film başladı.'], off: ['Ekran kapandı.'] },
  arcade_makinesi: { on: ['Oyun başladı! Bip bip, skor artıyor.', 'Makine "Hazır mısın?" dedi ve başladın.'], off: ['Oyun bitti; skorun kaydedildi.'] },
  oyun_bilgisayari: { on: ['Bilgisayar açıldı; ekran pembe parladı.'], off: ['Bilgisayar kapandı.'] },
  robot_kol: { on: ['Robot kol bir cıvata sıkıp geri döndü.', 'Robot kol zarif bir hareket yaptı.'], off: ['Robot kol dinlenmeye çekildi.'] },
  dron_istasyonu: { on: ['Dron havalandı, bir tur atıp geri döndü.', 'İstasyondan küçük bir dron kalktı.'], off: ['Dron istasyona yerleşti.'] },
  tarayici_cihaz: { on: ['Tarama başladı… hareketsiz dur.'], off: ['Tarama bitti: her şey yolunda!'] },
  dj_standi: { on: ['Müzik değişti: yavaş bir synthwave.', 'DJ standı yeni bir parça seçti.', 'Ritim hızlandı, ışıklar yumuşakça döndü.'], off: ['Müzik sessizleşti.'] },
});

/** Dolap/buzdolabı vb. açma iletileri (anahtar → satırlar). */
export const OPEN_TEXTS = Object.freeze({
  dolap: ['Dolap açıldı: düzgünce katlanmış kumaşlar.', 'Dolapta yedek bir pil ve bir şemsiye var.', 'Dolapta temiz havlular sıralanmış.'],
  saglik_dolabi: ['Sağlık dolabında bandajlar ve şeker şişesi var.', 'Dolapta sargı bezleri ve bir sıcak su torbası duruyor.', 'Dolapta etiketli kutular: hepsi derli toplu.'],
  dolap_sirali: ['Dolaptan hafif bir yağ kokusu geliyor.', 'Dolapta etiketli bir takım çantası var.', 'Dolapta yedek eldivenler ve bir fener duruyor.'],
  takim_dolabi: ['Takım dolabında renkli anahtarlar sıralı.', 'Dolapta cıvata kutuları ve bir tornavida seti var.', 'Takımlar özenle yerine yerleştirilmiş.'],
  buzdolabi: ['Buzdolabında meyve suları ve taze sebze var.', 'Buzdolabı serin ve nur gibi; içinde bir kase yoğurt duruyor.', 'Buzdolabında etiketli yemek kapları sıralı.'],
});

/** Metin seç: tablo adı + tamsayı n (mod). Tablo yoksa ''. */
export function pickText(table, n) {
  const t = TEXTS[table];
  if (!t || t.length === 0) return '';
  const i = ((n | 0) % t.length + t.length) % t.length;
  return t[i];
}

export function pickList(list, n) {
  if (!list || list.length === 0) return '';
  const i = ((n | 0) % list.length + list.length) % list.length;
  return list[i];
}
