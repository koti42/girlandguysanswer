/*
 * KEŞİF sim/city — görev / başarım / parça / yer adı tabloları (yalnızca İSİMLER; mantık ilgili paketlerde).
 *
 * Neon Meridyen sözleşme §2: tüm kullanıcı metni Türkçe, aile dostu, özgün. Bu dosya iskelettir: discovery_missions
 * (görev/başarım kayıtları), vehicle_* (parça/renk adları), crowd_ai/npc_vendors (ped/robot adları), photo_map
 * (filtre adları), audio (radyo) kimlik→ad eşlemelerini BURADAN okur; ad değişikliği tek yerde yapılır.
 * Kimlikler ASCII (`[a-z0-9_]`), adlar Türkçe. `citySafe.test.js` her dizgeyi tarar.
 *
 * API: QUEST_CHAIN_NEON · ACHIEVEMENT_NAMES · JOB_TIERS · JOB_PACKAGES · METRIC_LABELS · VEHICLE_CLASS_NAMES ·
 *      VEHICLE_PART_NAMES · GARAGE_COLORS · NEON_COLORS · UNDERGLOW_PATTERNS · GRAFFITI_STENCILS · GRAFFITI_COLORS ·
 *      RACE_NAMES · RADIO_STATIONS · PHOTO_FILTERS · ROBOT_NAMES · PED_NAMES · TERMINAL_NAMES · COMPASS_KEYS ·
 *      terminalName(i) · allCityNameStrings() (tarama/atlas için tüm dizgeler)
 */
import { DISTRICT_KEYS, DISTRICT_NAMES } from './cityBrands.js';

const fz = (a) => Object.freeze(a.map((x) => Object.freeze(x)));

/** `neon` görev zinciri (12): kimlikler sözleşme §11. */
export const QUEST_CHAIN_NEON = fz([
  { id: 'nm_ilk_surus', name: 'İlk Sürüş', desc: 'Bir araca bin ve şehirde sür.' },
  { id: 'nm_ilk_teslimat', name: 'İlk Teslimat', desc: 'Panodan bir kurye görevi al ve teslim et.' },
  { id: 'nm_yaris_bronz', name: 'Bronz Başlangıç', desc: 'Bir yarışı bronz madalyayla bitir.' },
  { id: 'nm_cip_10', name: 'Çip Avcısı', desc: '10 veri çipi bul.' },
  { id: 'nm_graffiti_5', name: 'Duvar Sanatçısı', desc: '5 duvara grafiti yap.' },
  { id: 'nm_cati_parkur', name: 'Çatı Koşucusu', desc: 'Bir çatı parkurunu tamamla.' },
  { id: 'nm_fotograf', name: 'Şehir Fotoğrafçısı', desc: 'Foto modunda bir kare yakala.' },
  { id: 'nm_taksi_5', name: 'Taksi Şoförü', desc: 'Taksiyle 5 yolcu taşı.' },
  { id: 'nm_robot_10', name: 'Temiz Sokaklar', desc: '10 hatalı robotu dağıt.' },
  { id: 'nm_gizli_oda', name: 'Gizli Oda', desc: 'Gizli bir odayı bul.' },
  { id: 'nm_garaj_boya', name: 'Yeni Renk', desc: 'Aracını garajda yeniden boya.' },
  { id: 'nm_portal_yumurtasi', name: 'Diyar Işığı', desc: 'Kasadaki gizemli ışığı bul.' },
]);

/** 24 başarım (`nm_*`; görev kimlikleriyle çakışmaz). */
export const ACHIEVEMENT_NAMES = fz([
  { id: 'nm_ilk_gecis', name: 'İlk Geçiş', desc: 'Neon Meridyen\'e ilk kez gir.' },
  { id: 'nm_tum_terminaller', name: 'Terminal Haritacısı', desc: '16 terminalin hepsini bul.' },
  { id: 'nm_gece_yuruyusu', name: 'Gece Yürüyüşçüsü', desc: 'Gece sokaklarında uzun yürü.' },
  { id: 'nm_yagmur_dansi', name: 'Yağmur Dansı', desc: 'Yağmurda şehirde dolaş.' },
  { id: 'nm_kurye_10', name: 'Hızlı Kurye', desc: '10 teslimat tamamla.' },
  { id: 'nm_kurye_50', name: 'Efsane Kurye', desc: '50 teslimat tamamla.' },
  { id: 'nm_yaris_altin', name: 'Altın Kupa', desc: 'Bir yarışta altın madalya al.' },
  { id: 'nm_tum_yarislar', name: 'Pist Ustası', desc: '8 yarışı da bitir.' },
  { id: 'nm_cip_60', name: 'Çip Koleksiyoncusu', desc: '60 veri çipi bul.' },
  { id: 'nm_cip_240', name: 'Tam Arşiv', desc: '240 veri çipinin hepsini bul.' },
  { id: 'nm_graffiti_30', name: 'Sokak Ressamı', desc: '30 duvara grafiti yap.' },
  { id: 'nm_graffiti_90', name: 'Şehir Tuvali', desc: '90 grafiti noktasını boya.' },
  { id: 'nm_oda_10', name: 'Sır Avcısı', desc: '10 gizli oda bul.' },
  { id: 'nm_oda_30', name: 'Sırların Efendisi', desc: '30 gizli odanın hepsini bul.' },
  { id: 'nm_kilit_10', name: 'Çilingir', desc: '10 kilit aç.' },
  { id: 'nm_cati_8', name: 'Çatı Kralı', desc: '8 çatı parkurunu tamamla.' },
  { id: 'nm_km_100', name: 'Yüz Kilometre', desc: 'Şehirde 100 km yol yap.' },
  { id: 'nm_foto_20', name: 'Albüm Dolu', desc: '20 fotoğraf çek.' },
  { id: 'nm_robot_50', name: 'Parlak Sokaklar', desc: '50 hatalı robotu dağıt.' },
  { id: 'nm_garaj_6', name: 'Dolu Garaj', desc: 'Garajına 6 araç topla.' },
  { id: 'nm_tum_sahipler', name: 'Komşu Dostu', desc: '16 dükkân sahibiyle tanış.' },
  { id: 'nm_metro_gezgin', name: 'Metro Gezgini', desc: 'Tüm metro duraklarını gez.' },
  { id: 'nm_kasa', name: 'Kasa Kâşifi', desc: 'Teknoloji Parkı\'ndaki kasayı aç.' },
  { id: 'nm_neon_usta', name: 'Neon Meridyen Ustası', desc: 'Tüm başarımları topla.' },
]);

/** Kurye kademeleri (ödül/süre formülleri mission/jobs.js'tedir; burada yalnızca adlar). */
export const JOB_TIERS = fz([
  { key: 'caylak', name: 'Çaylak', desc: 'Kısa mesafe, rahat süre.' },
  { key: 'usta', name: 'Usta', desc: 'Orta mesafe, dikkatli sürüş.' },
  { key: 'efsane', name: 'Efsane', desc: 'Uzun mesafe, kırılgan paket.' },
]);

/** Kurye paketi adları (görev başlığı). */
export const JOB_PACKAGES = Object.freeze([
  'Sıcak çorba', 'Yedek parça paketi', 'Kitap siparişi', 'Çiçek buketi', 'Oyuncak kutusu', 'Devre kartı seti',
  'Kırmızı zarf', 'Taze simit sepeti', 'Boya seti', 'Pil kutusu', 'Tatlı tepsisi', 'Plak paketi', 'Çay demliği',
  'Kumaş rulosu', 'Fotoğraf albümü', 'Bitki saksısı', 'Defter ve kalem', 'Robot kolu', 'Kırılgan cam küre',
  'Gizemli koli',
]);

/** Oyun metrikleri (sözleşme §11) → Türkçe etiket. */
export const METRIC_LABELS = Object.freeze({
  dimHops: 'Boyut sıçraması',
  citySeconds: 'Şehirde geçen süre',
  terminalsFound: 'Bulunan terminal',
  locksOpened: 'Açılan kilit',
  cityKm: 'Şehir kilometresi',
  jobsDone: 'Tamamlanan görev',
  racesWon: 'Kazanılan yarış',
  chipsFound: 'Bulunan çip',
  graffitiDone: 'Yapılan grafiti',
  roomsFound: 'Bulunan gizli oda',
  photosTaken: 'Çekilen fotoğraf',
  robotsDissolved: 'Dağılan robot',
  kredi: 'Kredi',
});

/** Araç sınıfları (sözleşme §9 anahtarları). */
export const VEHICLE_CLASS_NAMES = Object.freeze({
  taksi: 'Taksi',
  spor: 'Spor Araba',
  kamyonet: 'Kamyonet',
  motor: 'Motor',
  hoverbike: 'Süzülmotor',
  suzulkay: 'Süzülkay',
});

/** Araç parçası adları (model parçaları + garaj seçenekleri). */
export const VEHICLE_PART_NAMES = Object.freeze({
  kaporta: 'Kaporta',
  tekerlek: 'Tekerlek',
  far: 'Far',
  stop: 'Stop Lambası',
  neon_altlik: 'Neon Altlık',
  nitro: 'Nitro Tüpü',
  direksiyon: 'Direksiyon',
  koltuk: 'Koltuk',
  anten: 'Anten',
  egzoz: 'Egzoz',
  ayna: 'Dikiz Aynası',
  plaka: 'Plaka',
  cam: 'Cam',
  kanat: 'Kanat',
  hover_halka: 'Süzülme Halkası',
  sepet: 'Yük Sepeti',
});

/** Garaj: 16 sabit boya, 16 sabit neon tonu, zemin ışığı kalıpları. */
export const GARAGE_COLORS = Object.freeze([
  'Gece Mavisi', 'Neon Pembe', 'Kehribar', 'Limon Sarısı', 'Camgöbeği', 'Mor Işıltı', 'Mercan', 'Nane Yeşili',
  'Gümüş', 'Karbon Siyahı', 'İnci Beyazı', 'Bakır', 'Kiraz Kırmızısı', 'Turuncu Hat', 'Okyanus', 'Lavanta',
]);
export const NEON_COLORS = Object.freeze([
  'Camgöbeği', 'Pembe', 'Kehribar', 'Limon', 'Mor', 'Mavi', 'Yeşil', 'Beyaz', 'Turuncu', 'Kırmızı', 'Gökkuşağı',
  'Lavanta', 'Mercan', 'Nane', 'Altın', 'Gümüş',
]);
export const UNDERGLOW_PATTERNS = Object.freeze({ sabit: 'Sabit', nefes: 'Nefes', dalga: 'Dalga' });

/** Grafiti: 6 sabit kalıp × 8 renk (serbest çizim yok). */
export const GRAFFITI_STENCILS = Object.freeze(['Yıldız', 'Roket', 'Robot', 'Bulut', 'Gezegen', 'Dalga']);
export const GRAFFITI_COLORS = Object.freeze([
  'Kırmızı', 'Turuncu', 'Sarı', 'Yeşil', 'Camgöbeği', 'Mavi', 'Mor', 'Pembe',
]);

/** 8 yarış (6 halka + 2 sprint; #1 Çevreyolu halkası). */
export const RACE_NAMES = Object.freeze([
  'Çevreyolu Turu', 'Merkez Halkası', 'Pazar Zigzag Turu', 'Konteyner Kupası', 'Liman Turu', 'Teknopark Halkası',
  'Kanal Sprinti', 'Tepe Sprinti',
]);

/** Radyo: 5 istasyon + Sessiz (sesli konuşma yok). */
export const RADIO_STATIONS = fz([
  { id: 'neonfm', name: 'Neon FM 88.8' },
  { id: 'gece_taksisi', name: 'Gece Taksisi' },
  { id: 'hiz_hatti', name: 'Hız Hattı' },
  { id: 'pazar_sokagi', name: 'Pazar Sokağı' },
  { id: 'yildiz_ambient', name: 'Yıldız Ambient' },
  { id: 'sessiz', name: 'Sessiz' },
]);

/** Foto modu filtreleri. */
export const PHOTO_FILTERS = fz([
  { id: 'neon', name: 'Neon' },
  { id: 'gece_sepya', name: 'Gece Sepyası' },
  { id: 'siyah_beyaz', name: 'Siyah Beyaz' },
  { id: 'retro_bant', name: 'Retro Bant' },
  { id: 'pastel', name: 'Pastel' },
  { id: 'yagmur', name: 'Yağmur' },
]);

/** Robot türleri (mobTypes anahtarları ASCII) ve düşen eşya adları. */
export const ROBOT_NAMES = Object.freeze({
  gozdrone: 'Gözcü Dron',
  bekcirobot: 'Bekçi Robot',
  hatabot: 'Hatabot',
});
export const ROBOT_DROP_NAMES = Object.freeze({ bakir_tel: 'Bakır Tel', devre_karti: 'Devre Kartı', kredi_cipi: 'Kredi Çipi' });

/** Yaya tipi (sözleşme §10) → görünen ad. */
export const PED_NAMES = Object.freeze({
  halk: 'Yaya',
  cocuk: 'Çocuk',
  turist: 'Turist',
  satici: 'Satıcı',
  kapici: 'Kapıcı',
  kurye: 'Kurye',
  temizlik_robotu: 'Temizlik Robotu',
  dost_dron: 'Dost Dron',
});

/** Çevreyolu kavşak terminalleri için pusula yönleri (kuzeyden saat yönünde). */
export const COMPASS_KEYS = Object.freeze([
  'kuzey', 'kuzeydogu', 'dogu', 'guneydogu', 'guney', 'guneybati', 'bati', 'kuzeybati',
]);
const COMPASS_NAMES = Object.freeze({
  kuzey: 'Kuzey', kuzeydogu: 'Kuzeydoğu', dogu: 'Doğu', guneydogu: 'Güneydoğu', guney: 'Güney',
  guneybati: 'Güneybatı', bati: 'Batı', kuzeybati: 'Kuzeybatı',
});
const DISTRICT_TERMINAL = Object.freeze({
  merkez: 'Merkez Terminali', gece_pazari: 'Pazar Terminali', konteyner: 'Konteyner Terminali',
  liman: 'Liman Terminali', teknoloji: 'Teknopark Terminali', tepe: 'Tepe Terminali',
});

/**
 * 16 terminal adı (sözleşme §1.7): 0 Kapı Meydanı, 1–6 bölge merkezleri (DISTRICT_KEYS sırası), 7–14 Çevreyolu
 * kavşakları (COMPASS_KEYS sırası), 15 Tepe Terası. Kullanan paket sırası farklıysa `terminalName(i)` yerine
 * DISTRICT_TERMINAL/COMPASS adlarını anahtarla çözer.
 */
export const TERMINAL_NAMES = Object.freeze([].concat(
  ['Kapı Meydanı'],
  DISTRICT_KEYS.map((k) => DISTRICT_TERMINAL[k]),
  COMPASS_KEYS.map((k) => 'Çevreyolu ' + COMPASS_NAMES[k]),
  ['Tepe Terası'],
));

export function terminalName(i) {
  const n = typeof i === 'number' ? i : (typeof i === 'string' && /^[0-9]+$/.test(i) ? Number(i) : NaN);
  return Number.isInteger(n) && n >= 0 && n < TERMINAL_NAMES.length ? TERMINAL_NAMES[n] : 'Bilinmeyen Terminal';
}

/** Bölge adı + terminal adı + tüm tablo dizgeleri (tarama ve tabela atlası için düz liste). */
export function allCityNameStrings() {
  const out = [];
  const push = (v) => { if (typeof v === 'string' && v) out.push(v); };
  const rec = (v) => {
    if (typeof v === 'string') push(v);
    else if (Array.isArray(v)) v.forEach(rec);
    else if (v && typeof v === 'object') Object.keys(v).forEach((k) => { if (k !== 'id' && k !== 'key') rec(v[k]); });
  };
  [QUEST_CHAIN_NEON, ACHIEVEMENT_NAMES, JOB_TIERS, JOB_PACKAGES, METRIC_LABELS, VEHICLE_CLASS_NAMES,
    VEHICLE_PART_NAMES, GARAGE_COLORS, NEON_COLORS, UNDERGLOW_PATTERNS, GRAFFITI_STENCILS, GRAFFITI_COLORS,
    RACE_NAMES, RADIO_STATIONS, PHOTO_FILTERS, ROBOT_NAMES, ROBOT_DROP_NAMES, PED_NAMES, TERMINAL_NAMES,
    DISTRICT_NAMES].forEach(rec);
  return out;
}
