/*
 * KEŞİF sim/city — ŞEHİR ARAYÜZ VERİSİ (saf; DOM/three yok, Math.random/Date.now yok, worker-güvenli).
 * Sözleşme KESIF_CITY_CONTRACT §12. Okuyucular: systems/cityHud.js (HUD alanları) ve components/game/kesif/city/* (yükleme paneli, çipler).
 *
 *   LOADING_DELAY_MS, LOADING_TIPS, tipAt(i)            yükleme paneli: gecikme (0,6 sn) ve aile dostu ipuçları
 *   loadingPercent(p), loadingAnnouncement(p)           yüzde ve ekran okuyucu cümlesi (25'lik basamaklar)
 *   DISTRICT_TAGLINES, districtBannerSpec(key, name)    bölge girişi duyurusu (G.banner parametreleri)
 *   GATE_TEXT                                           boyut kapısı için ipucu/araç ipucu metinleri
 *   LIGHT_LABELS, nearestLightHint(plan, x, y, z)       40 blok içindeki ışık ipucu (şu an: Boyut Terminali)
 *   cityWeatherLabel(weatherLabel, smog)                'yağmur' | 'fırtına' | 'duman' | ''
 *   parseTimeLabel(label)                               'gece 19:30' → {phase:'gece', clock:'19:30'}
 *   districtDisplay(key)                                bölge adı (Türkçe)
 */
import { DISTRICTS } from './archetypes.js';

/** Işık ipucu menzili (blok); hudStore.HUD_LIGHT_RANGE ile aynı olmak ZORUNDA (test). */
export const LIGHT_RANGE = 40;

/** Yükleme paneli: geçiş bu süreden uzun sürerse çıkar (kısa geçişte panel hiç görünmez). */
export const LOADING_DELAY_MS = 600;
/** İpucu değişim aralığı (ms). */
export const TIP_EVERY_MS = 5000;

/** Aile dostu, doğru bilgi veren ipuçları (Türkçe, ≤ 110 karakter). Sözleşme §2: yalnız özgün ad. */
export const LOADING_TIPS = Object.freeze([
  'Eve dönmek için Neon Meridyen\'deki Boyut Terminaline git; ışığı yanan direği ara.',
  'Kapı 30 saniye açık kalır. Aceleye gerek yok ama oyalanma da.',
  'Her boyut kapısı Portal Tabancasından 12 şarj harcar. Yedek Enerji Hücresi taşı.',
  'Şehirde bir gün sadece on dakika sürer: akşam hemen gelir, sabah da öyle.',
  'Yağmurda yollar ıslanır ve neon ışıkları yerde parlar. Durup bir izle.',
  'Şehirde kazandığın eşyalar ana diyara da taşınır.',
  'Bölge adları ekranın üstünde belirir: Merkez, Gece Pazarı, Liman ve daha fazlası.',
  'Kapı Meydanı güvenlidir; yakınında her zaman ışıklı bir terminal bulursun.',
  'Neon Meridyen\'de herkes dostça; sakince dolaş, tabelalara ve ışıklara bak.',
  'Portal Tabancasının boyut kipi düğmesi (masaüstünde T tuşu) ateşi boyut kapısına çevirir.',
]);

/** İpucu i (negatif/taşan indeks güvenli döner). */
export function tipAt(i) {
  const n = LOADING_TIPS.length;
  const k = Number.isFinite(i) ? Math.floor(i) : 0;
  return LOADING_TIPS[((k % n) + n) % n];
}

/** systems/dimension.js'in yükleme sırasında yazdığı ipucu satırının başı ("Boyut geçişi… %NN"); KesifHud bu satırı gizler (panel + aria-live yeterli). */
export const LOADING_HINT_PREFIX = 'Boyut geçişi…';

/** İlerleme 0..1 → tam yüzde 0..100 (NaN/aralık dışı güvenli). */
export function loadingPercent(p) {
  if (typeof p !== 'number' || !Number.isFinite(p)) return 0;
  return Math.round(Math.max(0, Math.min(1, p)) * 100);
}

/** Ekran okuyucu cümlesi: yüzde 25'lik basamaklara yuvarlanır (en çok 5 farklı metin → canlı bölge gürültü yapmaz). */
export function loadingAnnouncement(p) {
  const q = Math.min(100, Math.floor(loadingPercent(p) / 25) * 25);
  return q <= 0 ? 'Boyut geçişi yükleniyor.' : 'Boyut geçişi yükleniyor, yüzde ' + q + '.';
}

export const LOADING_DONE_TEXT = 'Boyut geçişi tamamlandı.';

/** Bölge girişi duyurusunun altyazısı. */
export const DISTRICT_TAGLINES = Object.freeze({
  merkez: 'Işıktan gökdelenlerin kalbi',
  gece_pazari: 'Tezgâhlar, tabelalar ve hiç bitmeyen kalabalık',
  konteyner: 'Renkli konteynerlerden kurulu mahalle',
  liman: 'Vinçler, depolar ve kanalın kokusu',
  teknoloji: 'Parlak laboratuvarlar ve sessiz bahçeler',
  tepe: 'Şehri tepeden izleyen sakin evler',
  alt_sehir: 'Tüneller ve metro hattı',
});

/** Bölge görünen adı; bilinmeyen anahtar → ''. */
export function districtDisplay(key) {
  if (key === 'alt_sehir') return 'Alt Şehir';
  const d = typeof key === 'string' && Object.prototype.hasOwnProperty.call(DISTRICTS, key) ? DISTRICTS[key] : null;
  return d ? d.name : '';
}

/**
 * Bölge girişi duyurusu → {text, sub, opts} (G.banner(text, sub, opts)). Kuyruk kuralları (systems/sessionBanner.createBannerQueue):
 * öncelik 2 → varışta "Neon Meridyen" karşılama duyurusu (öncelik 2) kesilmez, sıraya girer; derinlik/bölge/boss duyuruları (≥ 3) bunu keser;
 * aynı anahtar 4 sn içinde tekrar gösterilmez (sınırda gidip gelince titreşmez).
 */
export function districtBannerSpec(key) {
  const text = districtDisplay(key);
  if (!text) return null;
  return {
    text,
    sub: DISTRICT_TAGLINES[key] || '',
    opts: {
      key: 'district:' + key, kind: 'zone', duration: 3400, priority: 2,
    },
  };
}

/** Boyut kapısı metinleri (ipucu, araç ipucu, ekran okuyucu). */
export const GATE_TEXT = Object.freeze({
  keyHint: 'T',
  modeLabelOn: 'Boyut kipi',
  modeLabelOff: 'Normal kip',
  modeOnHint: 'Ateş et: Neon Meridyen\'e boyut kapısı açılır (12 şarj).',
  modeOffHint: 'Mavi ve turuncu portal açar. T: boyut kipi.',
  modeInCityHint: 'Ateş et: ana diyara dönen kapı açılır. Terminal de eve götürür.',
  shortOn: 'ateş: kapı açar',
  shortInCity: 'ateş: eve kapı',
  tooltip: 'Boyut kipi: Portal Tabancası ateşi, başka bir diyara boyut kapısı açar',
});

/** Işık ipucu türü → görünen ad. */
export const LIGHT_LABELS = Object.freeze({
  terminal: 'Terminal',
  kapi: 'Kapı',
  pano: 'Görev Panosu',
  garaj: 'Garaj',
  cip: 'Veri Çipi',
  grafiti: 'Grafiti Noktası',
  oda: 'Gizli Oda',
});

/**
 * En yakın ışık ipucu {kind,dist,text}: şimdilik Boyut Terminali (plan.terminals; yüzey, ≤ LIGHT_RANGE blok yatay, ≤ 12 blok dikey).
 * Yeraltında (terminaller yüzeyde) y farkı büyük olduğundan ipucu çıkmaz. out verilirse yeniden kullanılır (tahsissiz).
 */
export function nearestLightHint(plan, x, y, z, out) {
  const ts = plan && plan.terminals;
  if (!ts || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const yy = Number.isFinite(y) ? y : 64;
  let best = -1;
  let bd = LIGHT_RANGE * LIGHT_RANGE;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (Math.abs(yy - t.y) > 12) continue;
    const dx = x - t.x;
    const dz = z - t.z;
    const d = dx * dx + dz * dz;
    if (d <= bd) {
      bd = d;
      best = i;
    }
  }
  if (best < 0) return null;
  const o = out || {};
  o.kind = 'terminal';
  o.dist = Math.round(Math.sqrt(bd) * 10) / 10;
  o.text = LIGHT_LABELS.terminal;
  return o;
}

/** Şehir hava etiketi: yağmur/fırtına motor etiketinden, duman (smog ≥ 0,5) şehir havasından. */
export function cityWeatherLabel(label, smog) {
  if (label === 'yağmur' || label === 'fırtına') return label;
  return Number.isFinite(smog) && smog >= 0.5 ? 'duman' : '';
}

/** 'gece 19:30' → {phase:'gece', clock:'19:30'}; biçim bozuksa varsayılanlar. */
export function parseTimeLabel(label) {
  const s = typeof label === 'string' ? label.trim() : '';
  const m = /^(.*?)\s*(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return { phase: s || 'gündüz', clock: '' };
  const hh = Math.min(23, Number(m[2]));
  return { phase: m[1] || 'gündüz', clock: (hh < 10 ? '0' : '') + hh + ':' + m[3] };
}
