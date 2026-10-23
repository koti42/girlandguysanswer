/*
 * KEŞİF sim/city — BÖLGE parametreleri ve BİNA ARKETİPLERİ tabloları (saf veri + küçük sorgular; sözleşme §7, design_city §3.2/§4.2).
 *
 *  DISTRICT_KEYS / DISTRICTS[key]   bölge: yükseklik aralığı (blok, zeminden), parsel kenarı, derinlik, yoğunluk, mega oranı, güvenli mi, neon tonları
 *  ARCHETYPES[key]                  bina arketipi: boyut alt sınırı, yükseklik alt-aralığı (bölge aralığının oranı), iç mekân türleri, çatı, işlev bayrakları
 *  ARCH_WEIGHTS[district][arch]     bölgeye göre ağırlık
 *  INTERIOR_FOOT[kind]              16 iç mekân türünün rezerv ayak izi [w,d,h] (design_city §7.2; Faz 2 interior/* kesin boyutu kendisi verir)
 *  archetypesForInterior(kind)      türü barındırabilen arketipler
 *  floorsFor(district, arch, u, bias?)   kat sayısı: bölge aralığı İÇİNDE (floors*4 ∈ [hMin,hMax]); u ∈ [0,1)
 *
 * Yükseklikler BLOK cinsindendir (kat = 4 blok): Merkez 90–236 (zirve y≤300), Pazar 12–32, Konteyner 8–28, Liman 10–40, Teknoloji 24–80,
 * Tepe 8–24. Pencere yalnız 7 kat altı halka açık yerlerde gerçek cam (buildingFacade). Gökdelen iç katları kapalı ofis (sızıntı yok).
 */

export const FLOOR_H = 4;
export const DISTRICT_KEYS = Object.freeze(['merkez', 'gece_pazari', 'konteyner', 'liman', 'teknoloji', 'tepe']);

/* Neon tonu indeksleri = blok sırası: 0 camgöbeği(229) 1 pembe(230) 2 kehribar(231) 3 limon(232). */
const D = (idx, key, name, o) => Object.freeze(Object.assign({ idx, key, name }, o, { hues: Object.freeze(o.hues) }));

export const DISTRICTS = Object.freeze({
  merkez: D(0, 'merkez', 'Merkez', {
    hMin: 90, hMax: 236, bias: 0.8, sideMin: 28, sideMax: 64, depthMax: 36, density: 0.9, mega: 0.12, safe: true, hues: [0, 1],
    centerBoost: 0.35, ground: 'kaldirim',
  }),
  gece_pazari: D(1, 'gece_pazari', 'Gece Pazarı', {
    hMin: 12, hMax: 32, bias: 1.0, sideMin: 12, sideMax: 20, depthMax: 26, density: 1.0, mega: 0, safe: true, hues: [2, 1],
    centerBoost: 0, ground: 'kaldirim',
  }),
  konteyner: D(2, 'konteyner', 'Konteyner Mahallesi', {
    hMin: 8, hMax: 28, bias: 1.1, sideMin: 16, sideMax: 32, depthMax: 30, density: 0.8, mega: 0, safe: false, hues: [3, 2],
    centerBoost: 0, ground: 'beton',
  }),
  liman: D(3, 'liman', 'Liman ve Sanayi', {
    hMin: 10, hMax: 40, bias: 1.2, sideMin: 32, sideMax: 64, depthMax: 32, density: 0.6, mega: 0.06, safe: false, hues: [2, 0],
    centerBoost: 0, ground: 'beton',
  }),
  teknoloji: D(4, 'teknoloji', 'Teknoloji Parkı', {
    hMin: 24, hMax: 80, bias: 1.0, sideMin: 24, sideMax: 48, depthMax: 30, density: 0.6, mega: 0.08, safe: true, hues: [0, 3],
    centerBoost: 0, ground: 'cim',
  }),
  tepe: D(5, 'tepe', 'Tepe Konutları', {
    hMin: 8, hMax: 24, bias: 1.0, sideMin: 14, sideMax: 24, depthMax: 26, density: 0.5, mega: 0, safe: true, hues: [2, 3],
    centerBoost: 0, ground: 'cim',
  }),
});

/** Robotların doğmadığı (güvenli) bölgeler (sözleşme §1.25). */
export const SAFE_DISTRICTS = Object.freeze(DISTRICT_KEYS.filter((k) => DISTRICTS[k].safe));

/* 16 iç mekân türünün rezerv ayak izi [w,d,h] (design_city §7.2). */
export const INTERIOR_FOOT = Object.freeze({
  kapsul_daire: Object.freeze([8, 6, 4]),
  loft: Object.freeze([16, 12, 5]),
  hacker_odasi: Object.freeze([10, 9, 4]),
  oyuncu_odasi: Object.freeze([9, 9, 4]),
  ramen_bari: Object.freeze([14, 9, 4]),
  klinik: Object.freeze([18, 14, 4]),
  garaj_atolyesi: Object.freeze([20, 16, 6]),
  kulup: Object.freeze([22, 18, 7]),
  market: Object.freeze([20, 14, 4]),
  cati_bahcesi: Object.freeze([20, 20, 5]),
  kitap_kafe: Object.freeze([14, 12, 4]),
  sanat_studyosu: Object.freeze([16, 12, 6]),
  robot_tamirhanesi: Object.freeze([14, 12, 5]),
  arcade: Object.freeze([18, 14, 5]),
  dron_kurye: Object.freeze([16, 12, 5]),
  holo_sinema: Object.freeze([18, 16, 7]),
});

const TOWER_INT = ['loft', 'kitap_kafe', 'market', 'klinik', 'kulup', 'kapsul_daire', 'hacker_odasi', 'oyuncu_odasi', 'cati_bahcesi', 'holo_sinema',
  'sanat_studyosu', 'arcade'];

/*
 * Arketip alanları:
 *  building   gerçek bina (kabuk+iç hacim); false = açık alan (park, tezgâh)
 *  special    yükseklik aralığı testi dışı (kiosk, tepe terasları)
 *  minW/minD  bina ayak izi alt sınırı (ayak izi = parsel − set-back)
 *  h          [a,b] bölge yüksekliği aralığının alt/üst oranı
 *  interiors  barındırabildiği iç mekân türleri (ownerData INTERIOR_KINDS anahtarları)
 *  pub        halka açık alt kat sayısı (gerçek cam) — kule: fuaye 3
 *  roof       'duz' | 'bahce' | 'helipad' | 'egimli' | 'tente'
 *  extStair   dış yangın merdiveni olabilir (çatı parkuru başlangıcı)
 *  signs      yüz başına tabela üst sınırı        chipSlots  çip konumu seçenekleri (çatı/kapı yanı/arka)
 */
const A = (key, name, o) => Object.freeze(Object.assign({
  key, name, building: true, special: false, h: [0, 1], interiors: [], pub: 1, roof: 'duz', extStair: false, signs: 2,
  chipSlots: ['roof', 'back', 'door'], tower: false,
}, o, { interiors: Object.freeze((o.interiors || []).slice()), chipSlots: Object.freeze((o.chipSlots || ['roof', 'back', 'door']).slice()) }));

export const ARCHETYPES = Object.freeze({
  kule_cam: A('kule_cam', 'Cam Kule', { minW: 20, minD: 20, h: [0.45, 1], interiors: TOWER_INT, pub: 3, roof: 'duz', tower: true, signs: 2 }),
  kule_ikiz: A('kule_ikiz', 'İkiz Kule', { minW: 40, minD: 20, h: [0.4, 0.95], interiors: TOWER_INT, pub: 3, roof: 'duz', tower: true, signs: 2 }),
  kule_helipad: A('kule_helipad', 'Helipad Kule', { minW: 24, minD: 24, h: [0.7, 1], interiors: TOWER_INT, pub: 3, roof: 'helipad', tower: true, signs: 1 }),
  kule_spiral: A('kule_spiral', 'Spiral Kule', { minW: 24, minD: 24, h: [0.5, 1], interiors: TOWER_INT, pub: 3, roof: 'duz', tower: true, signs: 1 }),
  ofis_blok: A('ofis_blok', 'Ofis Bloğu', {
    minW: 16, minD: 14, h: [0, 0.55], interiors: ['hacker_odasi', 'dron_kurye', 'kitap_kafe', 'market', 'cati_bahcesi', 'oyuncu_odasi', 'loft'], pub: 2, roof: 'duz', signs: 2,
  }),
  apartman: A('apartman', 'Apartman', {
    minW: 16, minD: 14, h: [0.15, 0.8], interiors: ['kapsul_daire', 'loft', 'oyuncu_odasi', 'cati_bahcesi', 'market', 'kitap_kafe'], pub: 1, roof: 'bahce', extStair: true, signs: 1,
  }),
  dukkan_sirasi: A('dukkan_sirasi', 'Dükkân Sırası', {
    minW: 12, minD: 10, h: [0, 0.45], interiors: ['ramen_bari', 'market', 'kitap_kafe', 'sanat_studyosu', 'arcade', 'dron_kurye'], pub: 2, roof: 'tente', extStair: true, signs: 3,
  }),
  ev: A('ev', 'Müstakil Ev', {
    minW: 10, minD: 10, h: [0, 0.35], interiors: ['kapsul_daire', 'loft', 'kitap_kafe', 'cati_bahcesi', 'sanat_studyosu'], pub: 1, roof: 'egimli', signs: 1,
  }),
  depo: A('depo', 'Depo', {
    minW: 20, minD: 16, h: [0, 0.5], interiors: ['dron_kurye', 'garaj_atolyesi', 'robot_tamirhanesi', 'market'], pub: 1, roof: 'duz', extStair: true, signs: 2,
  }),
  konteyner_yigini: A('konteyner_yigini', 'Konteyner Yığını', {
    minW: 16, minD: 12, h: [0, 1], interiors: ['sanat_studyosu', 'arcade', 'oyuncu_odasi', 'hacker_odasi', 'ramen_bari'], pub: 1, roof: 'duz', extStair: true, signs: 1,
  }),
  pazar_tezgahi: A('pazar_tezgahi', 'Pazar Tezgâhları', { minW: 12, minD: 10, building: false, roof: 'tente', interiors: ['ramen_bari', 'market'], pub: 0, signs: 2 }),
  klinik_binasi: A('klinik_binasi', 'Klinik Binası', {
    minW: 18, minD: 14, h: [0.1, 0.6], interiors: ['klinik', 'market'], pub: 2, roof: 'bahce', signs: 1,
  }),
  garaj: A('garaj', 'Garaj', { minW: 20, minD: 16, h: [0, 0.3], interiors: ['garaj_atolyesi', 'robot_tamirhanesi', 'dron_kurye'], pub: 1, roof: 'duz', extStair: true, signs: 2 }),
  kulup_binasi: A('kulup_binasi', 'Kulüp Binası', { minW: 22, minD: 18, h: [0, 0.4], interiors: ['kulup', 'arcade', 'holo_sinema'], pub: 2, roof: 'duz', signs: 3 }),
  sinema_binasi: A('sinema_binasi', 'Sinema Binası', { minW: 18, minD: 16, h: [0, 0.4], interiors: ['holo_sinema', 'arcade'], pub: 2, roof: 'duz', signs: 3 }),
  lab_binasi: A('lab_binasi', 'Laboratuvar Binası', {
    minW: 20, minD: 16, h: [0.2, 0.8], interiors: ['hacker_odasi', 'robot_tamirhanesi', 'dron_kurye', 'klinik'], pub: 2, roof: 'duz', signs: 1,
  }),
  park: A('park', 'Park', { minW: 8, minD: 8, building: false, roof: 'duz', pub: 0, signs: 0, chipSlots: ['park'] }),
  istasyon_girisi: A('istasyon_girisi', 'Metro İstasyon Girişi', { minW: 8, minD: 8, special: true, interiors: [], pub: 1, roof: 'duz', signs: 1 }),
  tepe_terasi: A('tepe_terasi', 'Tepe Terası', { minW: 40, minD: 40, special: true, interiors: ['cati_bahcesi'], pub: 0, roof: 'bahce', signs: 0, chipSlots: ['park'] }),
});

export const ARCHETYPE_KEYS = Object.freeze(Object.keys(ARCHETYPES));

/** Bölgeye göre arketip ağırlıkları ('park' yoğunluk (density) ile ayrıca seçilir; burada yok). */
export const ARCH_WEIGHTS = Object.freeze({
  merkez: Object.freeze({ kule_cam: 30, kule_ikiz: 14, kule_helipad: 10, kule_spiral: 10, ofis_blok: 24 }),
  gece_pazari: Object.freeze({
    dukkan_sirasi: 40, pazar_tezgahi: 18, apartman: 18, kulup_binasi: 8, sinema_binasi: 6, klinik_binasi: 4, garaj: 6,
  }),
  konteyner: Object.freeze({ konteyner_yigini: 62, depo: 14, garaj: 8, dukkan_sirasi: 8, apartman: 8 }),
  liman: Object.freeze({ depo: 42, garaj: 16, ofis_blok: 14, konteyner_yigini: 10, lab_binasi: 6, dukkan_sirasi: 12 }),
  teknoloji: Object.freeze({
    lab_binasi: 24, ofis_blok: 24, kule_cam: 14, kule_helipad: 8, kule_ikiz: 6, apartman: 10, klinik_binasi: 8, dukkan_sirasi: 6, garaj: 4,
  }),
  tepe: Object.freeze({ ev: 52, apartman: 18, dukkan_sirasi: 10, klinik_binasi: 4 }),
});

/** Çatı parkuru bloklarında kullanılan alçak arketipler (bölgeye göre). */
export const ROOF_ROUTE_ARCHS = Object.freeze({
  konteyner: Object.freeze(['konteyner_yigini', 'depo']),
  gece_pazari: Object.freeze(['dukkan_sirasi', 'apartman']),
  tepe: Object.freeze(['ev', 'apartman']),
  teknoloji: Object.freeze(['lab_binasi', 'ofis_blok']),
  liman: Object.freeze(['depo', 'garaj']),
  merkez: Object.freeze(['ofis_blok']),
});

/** Arketip bu iç mekân türünü barındırabilir mi (yalnız tür listesi; boyut ayrıca denetlenir). */
export function archetypesForInterior(kind) {
  const out = [];
  for (let i = 0; i < ARCHETYPE_KEYS.length; i++) {
    const a = ARCHETYPES[ARCHETYPE_KEYS[i]];
    if (a.interiors.indexOf(kind) >= 0) out.push(a.key);
  }
  return out;
}

/** İç mekân [w,d] rezervi (w,d ayak izine, her iki yönde) sığar mı. */
export function interiorFits(kind, w, d) {
  const f = INTERIOR_FOOT[kind];
  if (!f) return false;
  return (w >= f[0] && d >= f[1]) || (w >= f[1] && d >= f[0]);
}

/**
 * Kat sayısı. u ∈ [0,1) (hash). h = lerp(alt, üst, u^bias) bölge aralığının [a,b] oranları içinde; Merkez merkeze yaklaştıkça
 * ×(1+centerBoost·(1−d/300)). floors·4 DAİMA [hMin,hMax] içindedir. `centerDist` yalnız Merkez için anlamlıdır.
 */
export function floorsFor(districtKey, archKey, u, centerDist) {
  const D0 = DISTRICTS[districtKey];
  const A0 = ARCHETYPES[archKey];
  if (!D0 || !A0 || !A0.building) return 0;
  const span = D0.hMax - D0.hMin;
  const lo = D0.hMin + A0.h[0] * span;
  const hi = D0.hMin + A0.h[1] * span;
  let h = lo + (hi - lo) * Math.pow(u < 0 ? 0 : u > 0.999999 ? 0.999999 : u, D0.bias);
  if (D0.centerBoost > 0 && centerDist >= 0) {
    const t = Math.max(0, 1 - centerDist / 300);
    h *= 1 + D0.centerBoost * t;
  }
  const fmin = Math.ceil(D0.hMin / FLOOR_H);
  const fmax = Math.floor(D0.hMax / FLOOR_H);
  const f = Math.round(h / FLOOR_H);
  return f < fmin ? fmin : f > fmax ? fmax : f;
}
