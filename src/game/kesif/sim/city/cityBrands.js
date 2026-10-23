/*
 * KEŞİF sim/city — Neon Meridyen ÖZGÜN dükkân/marka adları, tabela stilleri, holo reklam satırları (saf veri).
 *
 * Sözleşme §2: yalnızca bu tablolar tabela/reklam metni üretir; gerçek marka yok, aile dostu, serbest metin yok.
 * Tüketenler: render/props/signAtlas.js (tabela dizgeleri yüklemede bir kez), sim/props (tabela/billboard propları),
 * interior/* (sahip dükkân adı), ped/dialogueData (genel). `citySafe.test.js` her dizgeyi tarar ve gerçek adlara
 * düzenleme uzaklığını denetler.
 *
 * API:
 *  CITY_BRANDS (60)             {id,name,tagline,kind,districts[],style:{mode,hue,frame},interior|null}
 *  CITY_AD_LINES                {id,text,brand|null,districts[]|[]}  (≤44 kr, Türkçe)
 *  DISTRICT_KEYS / DISTRICT_NAMES / DISTRICT_FLAVOUR   bölge adlandırma tadı (+ sokak adları)
 *  SIGN_MODES / SIGN_MODE_INFO / SIGN_HUES / SIGN_FRAMES / SIGN_LIMITS / SIGN_GLYPHS
 *  getBrand(id) brandsForDistrict(key) brandForInterior(kind)
 *  pickBrand(seed, districtKey, slot, kind?) pickAdLine(seed, districtKey, slot) streetNameFor(seed, districtKey, i)
 *  signLines(brand, {upper, maxChars}) -> string[]   trUpper (Türkçe büyük harf)
 */
import { hash3, stringSeedToInt } from '../rng.js';
import { trUpper } from './cityText.js';

export { trUpper };

/** Şehir bölgeleri (cityDistricts anahtarlarıyla aynı olmalıdır; sırası sözleşme §7 tablosu). */
export const DISTRICT_KEYS = Object.freeze(['merkez', 'gece_pazari', 'konteyner', 'liman', 'teknoloji', 'tepe']);
export const DISTRICT_NAMES = Object.freeze({
  merkez: 'Merkez',
  gece_pazari: 'Gece Pazarı',
  konteyner: 'Konteyner Mahallesi',
  liman: 'Liman ve Sanayi',
  teknoloji: 'Teknoloji Parkı',
  tepe: 'Tepe Konutları',
});

/** Tabela hareket kipleri (aMode). `hz`: en yüksek yanıp sönme/hareket sıklığı; erişilebilirlik tavanı 3 Hz. */
export const SIGN_MODES = Object.freeze(['sabit', 'nefes', 'titresim', 'kayan', 'harf']);
export const SIGN_MODE_INFO = Object.freeze({
  sabit: Object.freeze({ hz: 0, desc: 'sabit ışık' }),
  nefes: Object.freeze({ hz: 0.25, desc: '4 sn yavaş nefes' }),
  titresim: Object.freeze({ hz: 2, desc: 'nadir hafif titreşim' }),
  kayan: Object.freeze({ hz: 0.5, desc: 'yavaş kayan yazı' }),
  harf: Object.freeze({ hz: 1.5, desc: 'harf harf yanma' }),
});
/** Neon tonları (229–232 blokları ile aynı sıra: camgöbeği, pembe, kehribar, limon). */
export const SIGN_HUES = Object.freeze(['camgobegi', 'pembe', 'kehribar', 'limon']);
export const SIGN_FRAMES = Object.freeze(['tup', 'kutu', 'bayrak']);
export const SIGN_LIMITS = Object.freeze({ name: 24, tagline: 36, ad: 44, line: 14, lines: 2 });
/** Tabela atlasının rasterleştireceği karakter kümesi (Türkçe harfler büyük+küçük, â/î/û dahil). */
export const SIGN_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  + 'ÇĞİÖŞÜçğıöşüÂâÎîÛû .,:;!?-\'’"&/()+%';

export const BRAND_KINDS = Object.freeze([
  'market', 'yemek', 'kafe', 'tatli', 'giyim', 'teknik', 'servis', 'eglence', 'saglik', 'ulasim', 'kultur',
  'guzellik', 'finans',
]);

const HUE = { c: 'camgobegi', p: 'pembe', k: 'kehribar', l: 'limon' };
const DIST = { M: 'merkez', P: 'gece_pazari', K: 'konteyner', L: 'liman', T: 'teknoloji', H: 'tepe' };
const FRAME = { t: 'tup', k: 'kutu', b: 'bayrak' };
const MODE = { s: 'sabit', n: 'nefes', z: 'titresim', y: 'kayan', h: 'harf' };

/* [id, ad, slogan, tür, bölgeler, kip+ton+çerçeve, iç mekân türü]; kip/ton/çerçeve tek 3 harf: örn. "sct" */
const RAW = [
  /* --- 16 iç mekân sahibi dükkânı (iç mekân türü anahtarları ownerData.js ile aynıdır) --- */
  ['huzur_kapsul', 'Huzur Kapsülleri', 'Küçük oda, büyük uyku.', 'servis', 'MTP', 'nck', 'kapsul_daire'],
  ['manzara_loft', 'Manzara Loft', 'Şehir ayaklarının altında.', 'servis', 'MT', 'sct', 'loft'],
  ['sifir_bir', 'Sıfır Bir Atölye', 'Kodlar burada konuşur.', 'teknik', 'TL', 'hcb', 'hacker_odasi'],
  ['bir_tur_daha', 'Bir Tur Daha', 'Skor seni bekliyor!', 'eglence', 'PMK', 'zpk', 'oyuncu_odasi'],
  ['bulut_ramen', 'Bulut Ramen', 'Çorba sıcakken konuşulur.', 'yemek', 'PMH', 'nkt', 'ramen_bari'],
  ['nabiz_saglik', 'Nabız Sağlık Merkezi', 'Nabzın harika, devam!', 'saglik', 'MTH', 'scb', 'klinik'],
  ['vida_garaj', 'Vida Garaj', 'Her cıvata bir hikâye.', 'teknik', 'LK', 'skk', 'garaj_atolyesi'],
  ['ritim_kulubu', 'Ritim Kulübü', 'Ritim şehrin kalbi.', 'eglence', 'MP', 'npk', 'kulup'],
  ['luminar_market', 'Lüminar Market', 'Sepet dolsun, ışık bol.', 'market', 'MPHTKL', 'scb', 'market'],
  ['bahar_cati', 'Bahar Çatı Bahçesi', 'Bitkiler de şehirli.', 'kafe', 'HM', 'nlt', 'cati_bahcesi'],
  ['kozmik_kitap', 'Kozmik Kitabevi', 'Her sayfa bir yıldız.', 'kultur', 'MTH', 'sck', 'kitap_kafe'],
  ['duvar_tuval', 'Duvar Tuval Atölyesi', 'Duvar tuvaldir.', 'kultur', 'PKH', 'hpb', 'sanat_studyosu'],
  ['cirak_robot', 'Çırak Robot Atölyesi', 'Vida lazım mı?', 'teknik', 'LKT', 'sck', 'robot_tamirhanesi'],
  ['skor_arcade', 'Skor Arcade', 'Para yok, skor var.', 'eglence', 'PMK', 'zpb', 'arcade'],
  ['tuy_dron', 'Tüy Dron Kurye', 'Paketler beklemez!', 'ulasim', 'MTLP', 'sct', 'dron_kurye'],
  ['perde_holo', 'Perde Holo Sinema', 'Perde açılıyor, sessizlik!', 'kultur', 'MP', 'npk', 'holo_sinema'],
  /* --- diğer 44 dükkân --- */
  ['neonbaba_simit', 'Neonbaba Simit', 'Çıtır çıtır, sıcak sıcak.', 'yemek', 'PMK', 'skt', null],
  ['caybot', 'Çaybot', 'Demli çay, robot servis.', 'kafe', 'PMTH', 'nkt', null],
  ['piksel_pide', 'Piksel Pide', 'Her dilim bir piksel.', 'yemek', 'PK', 'ykt', null],
  ['kuantum_kirtasiye', 'Kuantum Kırtasiye', 'Kalem, defter, biraz fizik.', 'market', 'TM', 'sct', null],
  ['ay_isigi_eczane', 'Ay Işığı Eczanesi', 'Gece gündüz yanındayız.', 'saglik', 'MH', 'nct', null],
  ['servo_tamir', 'Servo Tamir', 'Bozuk robot kalmasın.', 'teknik', 'LKT', 'skt', null],
  ['turbo_tost', 'Turbo Tost', 'Hızlı, sıcak, peynirli.', 'yemek', 'KPL', 'zkt', null],
  ['gece_cicekci', 'Gece Çiçekçisi', 'Neon altında taze çiçek.', 'market', 'PHM', 'npt', null],
  ['hologram_hali', 'Hologram Halı', 'Uçan halı değil ama yakın.', 'market', 'PH', 'ypk', null],
  ['sinyal_kafe', 'Sinyal Kafe', 'Bağlantı güçlü, kahve sıcak.', 'kafe', 'TML', 'sck', null],
  ['atlas_bisiklet', 'Atlas Bisiklet', 'Pedal çevir, şehri gez.', 'ulasim', 'HMT', 'slt', null],
  ['kivilcim_elektrik', 'Kıvılcım Elektrik', 'Işığın yoksa biz varız.', 'teknik', 'LK', 'skb', null],
  ['yildizli_pastane', 'Yıldızlı Pastane', 'Tatlıya yıldız serpiştirdik.', 'tatli', 'MHP', 'npt', null],
  ['robo_berber', 'Robo Berber', 'Saçına robot hassasiyeti.', 'guzellik', 'MPK', 'sct', null],
  ['balon_tatlici', 'Balon Tatlıcı', 'Hafif, şekerli, uçuk.', 'tatli', 'PH', 'ypk', null],
  ['ozon_su', 'Ozon Su Dükkânı', 'Temiz su, temiz şehir.', 'market', 'LTK', 'sck', null],
  ['devre_dondurma', 'Devre Dondurma', 'Soğuk tatlar, sıcak anlar.', 'tatli', 'TMP', 'scb', null],
  ['pembe_pergel', 'Pembe Pergel', 'Çiz, ölç, hayal et.', 'kultur', 'TH', 'spk', null],
  ['isin_optik', 'Işın Optik', 'Dünyayı net gör.', 'saglik', 'MT', 'sct', null],
  ['nano_firin', 'Nano Fırın', 'Küçük ekmek, büyük koku.', 'yemek', 'HKP', 'nkt', null],
  ['aydede_oyuncak', 'Aydede Oyuncak', 'Oyun bitmesin!', 'eglence', 'HPM', 'hpk', null],
  ['lazer_lokanta', 'Lazer Lokanta', 'Tam kıvamında pişer.', 'yemek', 'LKM', 'zkb', null],
  ['bit_bakkal', 'Bit Bakkal', 'Bir bit al, bir bit kazan.', 'market', 'KPLH', 'slt', null],
  ['fosfor_giyim', 'Fosfor Giyim', 'Karanlıkta parlayan stil.', 'giyim', 'PMK', 'ypb', null],
  ['gunesli_salata', 'Güneşli Salata', 'Taze, çıtır, güneşli.', 'yemek', 'HMT', 'slt', null],
  ['kule_kebap', 'Kule Kebap', 'Gökdelen gibi lezzet.', 'yemek', 'MTL', 'skb', null],
  ['dalga_muzik', 'Dalga Müzik', 'Bir nota, bin dalga.', 'kultur', 'LPM', 'ncb', null],
  ['kare_foto', 'Kare Fotoğraf', 'Anı karelere sığdır.', 'kultur', 'MHT', 'sct', null],
  ['meridyen_banka', 'Meridyen Bankası', 'Kredin güvende, gülüşün bol.', 'finans', 'MT', 'scb', null],
  ['sis_cay_evi', 'Sis Çay Evi', 'Sisli günde sıcak bardak.', 'kafe', 'LHK', 'nkt', null],
  ['veri_yolu_kafe', 'Veri Yolu Kafe', 'Hızlı bağlantı, yavaş kahve.', 'kafe', 'TM', 'hcb', null],
  ['mor_metro_bufe', 'Mor Metro Büfe', 'Trene yetişirken lezzet.', 'yemek', 'MPT', 'spt', null],
  ['kiraz_kablo', 'Kiraz Kablo', 'Her fişe bir kiraz.', 'teknik', 'TK', 'spk', null],
  ['parilti_kuafor', 'Parıltı Kuaför', 'Saçına neon dokunuş.', 'guzellik', 'HMP', 'npb', null],
  ['zirhsiz_ayakkabi', 'Zırhsız Ayakkabı', 'Hafif adım, rahat yol.', 'giyim', 'PHK', 'slk', null],
  ['pusula_seyahat', 'Pusula Seyahat', 'Yön şehir, rota sende.', 'servis', 'ML', 'sck', null],
  ['ruzgar_gulu', 'Rüzgâr Gülü Cafe', 'Esinti eşliğinde tatlı mola.', 'kafe', 'HLM', 'nlt', null],
  ['hizli_hece', 'Hızlı Hece Dil Okulu', 'Hece hece öğren.', 'kultur', 'TMH', 'hct', null],
  ['elma_sekeri', 'Elma Şekeri Cafe', 'Kırmızı, parlak, şekerli.', 'tatli', 'PHK', 'ypt', null],
  ['guc_spor', 'Güç Spor Salonu', 'Bir tekrar daha, haydi!', 'servis', 'KLM', 'zlk', null],
  ['yamac_cicek', 'Yamaç Çiçek', 'Tepeden taze çiçekler.', 'market', 'HM', 'slt', null],
  ['turuncu_hat', 'Turuncu Hat Bakkalı', 'Metroya inmeden al.', 'market', 'MPK', 'skb', null],
  ['antenli_radyo', 'Antenli Radyo', 'Frekansın şehir, sesin sen.', 'kultur', 'LTM', 'ykt', null],
  ['tunel_donerci', 'Tünel Dönercisi', 'Tüneldeki en sıcak adres.', 'yemek', 'MLK', 'skb', null],
];

function parseDistricts(codes) {
  const out = [];
  for (let i = 0; i < codes.length; i++) out.push(DIST[codes.charAt(i)]);
  return Object.freeze(out);
}

/** 60 özgün dükkân (id ASCII `[a-z0-9_]`, ad benzersiz). */
export const CITY_BRANDS = Object.freeze(RAW.map((r) => Object.freeze({
  id: r[0],
  name: r[1],
  tagline: r[2],
  kind: r[3],
  districts: parseDistricts(r[4]),
  style: Object.freeze({ mode: MODE[r[5].charAt(0)], hue: HUE[r[5].charAt(1)], frame: FRAME[r[5].charAt(2)] }),
  interior: r[6],
})));

const BY_ID = new Map(CITY_BRANDS.map((b) => [b.id, b]));
const BY_INTERIOR = new Map(CITY_BRANDS.filter((b) => b.interior).map((b) => [b.interior, b]));

/** Bölge adlandırma tadı: sıfatlar/isimler (yeni ad üretimi), sokak adları, baskın tonlar. */
export const DISTRICT_FLAVOUR = Object.freeze({
  merkez: Object.freeze({
    tone: 'parlak, yüksek, gösterişli', hues: Object.freeze(['camgobegi', 'pembe']),
    nouns: Object.freeze(['Kule', 'Zirve', 'Meridyen', 'Işıltı', 'Gökyüzü']),
    streets: Object.freeze(['Meridyen Caddesi', 'Zirve Bulvarı', 'Işıltı Yolu', 'Gökçizgi Caddesi', 'Camgöbeği Sokak',
      'Kule Meydanı Yolu', 'Neon Bulvarı', 'Pembe Hat Caddesi']),
  }),
  gece_pazari: Object.freeze({
    tone: 'sıcak, kalabalık, tezgâh kokulu', hues: Object.freeze(['kehribar', 'pembe']),
    nouns: Object.freeze(['Tezgâh', 'Baharat', 'Fener', 'Tente', 'Çarşı']),
    streets: Object.freeze(['Fener Sokağı', 'Tente Geçidi', 'Baharat Yolu', 'Tezgâh Çıkmazı', 'Çarşı Caddesi',
      'Kehribar Sokak', 'Simitçi Geçidi', 'Gece Pazarı Yolu']),
  }),
  konteyner: Object.freeze({
    tone: 'renkli, sıra sıra, çatı koşusu', hues: Object.freeze(['limon', 'kehribar']),
    nouns: Object.freeze(['Kasa', 'Yığın', 'Vinç', 'Kutu', 'Raf']),
    streets: Object.freeze(['Kasa Sokağı', 'Yığın Caddesi', 'Vinç Yolu', 'Limon Geçidi', 'Kutu Sokak',
      'Raf Caddesi', 'Renkli Sıra Yolu', 'Çatı Koşusu Sokağı']),
  }),
  liman: Object.freeze({
    tone: 'deniz kokulu, işçi dostu, kehribar ışık', hues: Object.freeze(['kehribar', 'camgobegi']),
    nouns: Object.freeze(['Dalga', 'Halat', 'Çıpa', 'Dok', 'Rıhtım']),
    streets: Object.freeze(['Rıhtım Caddesi', 'Halat Sokağı', 'Çıpa Yolu', 'Dok Bulvarı', 'Dalga Sokak',
      'Vinç Hattı Caddesi', 'Liman Yolu', 'Kanal Kıyısı']),
  }),
  teknoloji: Object.freeze({
    tone: 'temiz, ışıklı, bilimsel', hues: Object.freeze(['camgobegi', 'limon']),
    nouns: Object.freeze(['Devre', 'Piksel', 'Kuantum', 'Sinyal', 'Veri']),
    streets: Object.freeze(['Devre Caddesi', 'Piksel Sokağı', 'Kuantum Bulvarı', 'Sinyal Yolu', 'Veri Hattı Caddesi',
      'Mavi Çizgi Sokak', 'Laboratuvar Yolu', 'Teknopark Caddesi']),
  }),
  tepe: Object.freeze({
    tone: 'sakin, yeşil, evcil', hues: Object.freeze(['kehribar', 'limon']),
    nouns: Object.freeze(['Yamaç', 'Bahçe', 'Teras', 'Çınar', 'Kiraz']),
    streets: Object.freeze(['Yamaç Sokağı', 'Bahçe Yolu', 'Teras Caddesi', 'Çınar Sokak', 'Kiraz Çıkmazı',
      'Tepe Yolu', 'Gün Batımı Caddesi', 'Çatı Bahçesi Sokağı']),
  }),
});

/* [kimlik, metin, marka|'', bölgeler('' = hepsi)] */
const ADS = [
  ['a_yagmur', 'Yağmurda neon daha güzel parlar!', '', ''],
  ['a_yaya', 'Yaya geçidinde dur, yol ver!', '', ''],
  ['a_terminal', 'Terminal yakında: eve dönüş bir adım.', '', ''],
  ['a_cip', 'Şehri keşfet, bir veri çipi bul!', '', ''],
  ['a_pil', 'Pilin bitmeden terminale uğra.', '', ''],
  ['a_robot', 'Temizlik robotları şehri parlatıyor.', '', ''],
  ['a_gece', 'Gece yarısı bile bu şehir uyanık.', '', ''],
  ['a_metro', 'Mor Hat 5 dakikada bir kalkar.', '', 'MPT'],
  ['a_graffiti', 'Duvarlar renk bekliyor, sprey al!', '', 'PKH'],
  ['a_cati', 'Çatılarda koş, ama dikkatli ol.', '', 'K'],
  ['a_ramen', 'Bulut Ramen: bir kase sıcak mutluluk.', 'bulut_ramen', 'PMH'],
  ['a_market', 'Lüminar Market: ışık bol, fiyat tatlı.', 'luminar_market', ''],
  ['a_dron', 'Tüy Dron Kurye: gökten teslimat!', 'tuy_dron', 'MTLP'],
  ['a_robo', 'Robo Berber: saçına robot hassasiyeti.', 'robo_berber', 'MPK'],
  ['a_sinema', 'Perde Holo Sinema: bu akşam macera var.', 'perde_holo', 'MP'],
  ['a_kitap', 'Kozmik Kitabevi: sayfalar yıldız dolu.', 'kozmik_kitap', 'MTH'],
  ['a_klinik', 'Nabız Sağlık: kontrol etmeden yürüme!', 'nabiz_saglik', 'MTH'],
  ['a_oyuncu', 'Bir Tur Daha: skor seni bekliyor!', 'bir_tur_daha', 'PMK'],
  ['a_hacker', 'Sıfır Bir Atölye: kodlar burada konuşur.', 'sifir_bir', 'TL'],
  ['a_garaj', 'Vida Garaj: aracına yeni renk!', 'vida_garaj', 'LK'],
  ['a_arcade', 'Skor Arcade: rekorun kırılmayı bekliyor.', 'skor_arcade', 'PMK'],
  ['a_kulup', 'Ritim Kulübü: bu gece ritim bizde.', 'ritim_kulubu', 'MP'],
  ['a_simit', 'Neonbaba Simit: çıtır çıtır sabah!', 'neonbaba_simit', 'PMK'],
  ['a_cay', 'Çaybot: demli çay, robot servis.', 'caybot', 'PMTH'],
  ['a_pide', 'Piksel Pide: her dilim bir sürpriz.', 'piksel_pide', 'PK'],
  ['a_pasta', 'Yıldızlı Pastane: tatlıya yıldız serpildi.', 'yildizli_pastane', 'MHP'],
  ['a_dondurma', 'Devre Dondurma: üç top, bin tat.', 'devre_dondurma', 'TMP'],
  ['a_kafe', 'Sinyal Kafe: bağlantı güçlü, kahve sıcak.', 'sinyal_kafe', 'TML'],
  ['a_bisiklet', 'Atlas Bisiklet: pedal çevir, şehri gez.', 'atlas_bisiklet', 'HMT'],
  ['a_oyuncak', 'Aydede Oyuncak: oyun hiç bitmesin!', 'aydede_oyuncak', 'HPM'],
  ['a_salata', 'Güneşli Salata: taze, çıtır, güneşli.', 'gunesli_salata', 'HMT'],
  ['a_kebap', 'Kule Kebap: gökdelen gibi lezzet.', 'kule_kebap', 'MTL'],
  ['a_muzik', 'Dalga Müzik: bir nota, bin dalga.', 'dalga_muzik', 'LPM'],
  ['a_foto', 'Kare Fotoğraf: anı karelere sığdır.', 'kare_foto', 'MHT'],
  ['a_spor', 'Güç Spor Salonu: bir tekrar daha, haydi!', 'guc_spor', 'KLM'],
  ['a_radyo', 'Antenli Radyo: frekansın şehir, sesin sen.', 'antenli_radyo', 'LTM'],
  ['a_dil', 'Hızlı Hece: iki haftada yeni bir dil.', 'hizli_hece', 'TMH'],
  ['a_cicek', 'Gece Çiçekçisi: neon altında taze çiçek.', 'gece_cicekci', 'PHM'],
  ['a_optik', 'Işın Optik: dünyayı net gör.', 'isin_optik', 'MT'],
  ['a_banka', 'Meridyen Bankası: Kredin güvende!', 'meridyen_banka', 'MT'],
  ['a_seyahat', 'Pusula Seyahat: rota sende, yol bizde.', 'pusula_seyahat', 'ML'],
  ['a_loft', 'Manzara Loft: şehir ayaklarının altında.', 'manzara_loft', 'MT'],
  ['a_kapsul', 'Huzur Kapsülleri: küçük oda, büyük uyku.', 'huzur_kapsul', 'MTP'],
  ['a_sanat', 'Duvar Tuval Atölyesi: duvar tuvaldir.', 'duvar_tuval', 'PKH'],
  ['a_robot_tamir', 'Çırak Robot Atölyesi: vida lazım mı?', 'cirak_robot', 'LKT'],
  ['a_bahce', 'Bahar Çatı Bahçesi: bitkiler de şehirli.', 'bahar_cati', 'HM'],
  ['a_pergel', 'Pembe Pergel: çiz, ölç, hayal et.', 'pembe_pergel', 'TH'],
  ['a_kiraz', 'Kiraz Kablo: her fişe bir kiraz.', 'kiraz_kablo', 'TK'],
  ['a_ayakkabi', 'Zırhsız Ayakkabı: hafif adım, rahat yol.', 'zirhsiz_ayakkabi', 'PHK'],
  ['a_tunel', 'Tünel Dönercisi: tüneldeki en sıcak adres.', 'tunel_donerci', 'MLK'],
  ['a_ruzgar', 'Rüzgâr Gülü Cafe: esinti eşliğinde mola.', 'ruzgar_gulu', 'HLM'],
  ['a_uyku', 'Uykun mu geldi? Kapsül kapıda!', '', 'MTP'],
  ['a_saat', 'Şehir saati 10 dakikada bir tur atar.', '', ''],
  ['a_isik', 'Işığı takip et, yolunu bul.', '', ''],
  ['a_hava', 'Bugün hava: parlak, hafif yağmurlu.', '', ''],
  ['a_dost', 'Dost dronlar yolu gösterir, el salla!', '', 'MPT'],
  ['a_foto_modu', 'Güzel bir an mı gördün? Fotoğrafını çek!', '', ''],
  ['a_kurye', 'Kurye ol, şehri tanı, Kredi kazan.', '', 'MTLP'],
  ['a_yaris', 'Çevreyolunda yarış var, hazır mısın?', '', 'MTL'],
  ['a_tepe', 'Tepe Konutları: sakin, yeşil, rüzgârlı.', '', 'H'],
  ['a_liman', 'Liman akşamları kehribar renkte.', '', 'L'],
  ['a_konteyner', 'Konteyner Mahallesi: her kutu bir renk.', '', 'K'],
  ['a_pazar', 'Gece Pazarı: kokunu takip et!', '', 'P'],
  ['a_teknoloji', 'Teknoloji Parkı: yarının şehri bugünden.', '', 'T'],
  ['a_merkez', 'Merkez: gökyüzüne en yakın cadde.', '', 'M'],
  ['a_sis', 'Sis gelince neonlar dans eder.', '', ''],
  ['a_yardim', 'Kaybolursan haritaya bak, terminal yakın.', '', ''],
  ['a_gulumse', 'Gülümse, bu şehir seni görüyor!', '', ''],
  ['a_sirin', 'Çocuklar için şehir: güvenli ve parlak.', '', ''],
  ['a_kedi', 'Robot kediyi gördün mü? Mırlıyor bile!', '', 'HPM'],
  ['a_cevre', 'Geri dönüşüm kutusu seni bekliyor.', '', ''],
];

/** Holo reklam satırları (≤44 kr). `brand`: ilgili dükkân kimliği ya da null; `districts`: boş = her yerde. */
export const CITY_AD_LINES = Object.freeze(ADS.map((a) => Object.freeze({
  id: a[0], text: a[1], brand: a[2] || null, districts: a[3] ? parseDistricts(a[3]) : Object.freeze([]),
})));

export function getBrand(id) {
  return BY_ID.get(id) || null;
}

/** Bir iç mekân türünün sahip dükkânı (örn. 'ramen_bari' → Bulut Ramen) ya da null. */
export function brandForInterior(kind) {
  return BY_INTERIOR.get(kind) || null;
}

export function brandsForDistrict(key, kind) {
  return CITY_BRANDS.filter((b) => b.districts.indexOf(key) >= 0 && (!kind || b.kind === kind));
}

const KEY_SEED = {};
DISTRICT_KEYS.forEach((k) => { KEY_SEED[k] = stringSeedToInt(k); });

function slotHash(seed, key, slot, tag) {
  const ks = Object.prototype.hasOwnProperty.call(KEY_SEED, key) ? KEY_SEED[key] : stringSeedToInt(String(key));
  return hash3(slot | 0, ks | 0, tag | 0, seed | 0);
}

/**
 * Belirlenimci dükkân seçimi: aynı (seed, bölge, slot, tür) → aynı dükkân. Bölgede tür yoksa bölgenin tüm
 * dükkânlarından, bölgesiz anahtarda (bilinmeyen) tüm tablodan seçer. Hiçbir zaman null dönmez.
 */
export function pickBrand(seed, districtKey, slot, kind) {
  let pool = brandsForDistrict(districtKey, kind);
  if (!pool.length) pool = brandsForDistrict(districtKey);
  if (!pool.length) pool = CITY_BRANDS;
  return pool[slotHash(seed, districtKey, slot, 0x42524e44) % pool.length];
}

/** Belirlenimci reklam satırı: bölgeye uyanlar (bölgesiz satırlar dahil) arasından. */
export function pickAdLine(seed, districtKey, slot) {
  const pool = CITY_AD_LINES.filter((a) => !a.districts.length || a.districts.indexOf(districtKey) >= 0);
  const list = pool.length ? pool : CITY_AD_LINES;
  return list[slotHash(seed, districtKey, slot, 0x41445f4c) % list.length];
}

/** Belirlenimci sokak adı (bölge flavour listesinden; i = yol/parça sırası). */
export function streetNameFor(seed, districtKey, i) {
  const fl = DISTRICT_FLAVOUR[districtKey] || DISTRICT_FLAVOUR.merkez;
  return fl.streets[slotHash(seed, districtKey, i, 0x53545254) % fl.streets.length];
}

/**
 * Tabela satırları: ad ≤ `maxChars` ise tek satır, değilse sözcük sınırında en dengeli iki satır. `upper:true`
 * Türkçe kurallı büyük harf (İ/I doğru). Dönüş en çok 2 satır; sığmazsa ikinci satır sığdığı kadar kırpılmaz,
 * sözcük bazlı bölünür (SIGN_LIMITS.line içinde kalması veri testiyle güvence altındadır).
 */
export function signLines(brand, opts) {
  const o = opts || {};
  const max = o.maxChars > 0 ? o.maxChars : SIGN_LIMITS.line;
  const name = String(typeof brand === 'string' ? brand : (brand && brand.name) || '');
  const text = o.upper ? trUpper(name) : name;
  if (text.length <= max) return [text];
  const words = text.split(' ');
  let best = null;
  for (let cut = 1; cut < words.length; cut++) {
    const a = words.slice(0, cut).join(' ');
    const b = words.slice(cut).join(' ');
    const score = Math.max(a.length, b.length);
    if (!best || score < best.score) best = { a, b, score };
  }
  return best ? [best.a, best.b] : [text];
}
