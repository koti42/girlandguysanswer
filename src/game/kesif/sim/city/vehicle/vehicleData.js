/*
 * KEŞİF sim/city/vehicle — ARAÇ VERİSİ (Neon Meridyen Faz 3, paket vehicle_phys). SAF veri + doğrulayıcılar: three/DOM/Math.random/Date.now yok,
 * worker-güvenli, es2020. Sözleşme KESIF_CITY_CONTRACT §9, §14. Aile dostu ve ÖZGÜN adlar (gerçek marka/model yok).
 *
 *   VEHICLE_CLASSES                 ['taksi','spor','kamyonet','motor','hoverbike','suzulkay']   (hudStore.HUD_VEHICLE_CLASSES ile aynı sıra)
 *   VEHICLE_DEFS[cls]               sınıf tanımı (aşağıda); donuk
 *   getVehicleDef(cls) → def | null (prototip anahtarlarına karşı güvenli)     isVehicleClass(cls)
 *   COSMETICS                       sabit renk/neon/zemin ışığı tabloları (çocuk güvenli: yalnız sabit örnekler)
 *   defaultCosmetics(cls, seed?) · sanitizeCosmetics(raw, cls?) → temiz kozmetik     plateFor(seed, idx) → plaka metni
 *   rentalPrice(cls) · purchasePrice(cls) · turnRadiusAt(cls, u) · unlockStatus(cls, stats) → {ok, reason, need}
 *   vehicleSpec(cls) → {t97Max, turnRadiusMin, ...} testlerin "şartname" değerleri
 *   validateVehicleDef(def) → hata dizisi (boş = geçerli)     validateAllVehicles()
 *
 * Birimler: m/s, m, rad; yaw 0 = −Z (ileri = (−sin yaw, −cos yaw)), sağ = (cos yaw, −sin yaw). `max` azami hız (nitro hariç); `accel` m/s².
 * def alanları:
 *   key name desc  max accel brake  steerDeg (tekerlek kilidi)  omegaMax (rad/s)  gripK (1/sn, yanal sönüm)  handGrip (el freni)  latG (azami yanal ivme, kuru)
 *   length width height wheelbase track  wheelR  step:[normal, hızlı]  seats parcels  mass (kg)
 *   nitro:{spd, acc}  hover (0 = tekerlekli; >0 hover yüksekliği)  gears:[…] (vites üst hızı oranları)  rpm:{idle, red}
 *   cam:{dist, height, hood:[x,y,z]}   price (Kredi)  rent (Kredi / 10 dk)  unlock:{minKm}  kind: 'araba'|'motor'|'hover'|'tahta'
 */

export const VEHICLE_CLASSES = Object.freeze(['taksi', 'spor', 'kamyonet', 'motor', 'hoverbike', 'suzulkay']);

/** Kiralama süresi (sn) ve uyarı eşiği (sözleşme §9: 20 Kredi / 10 dk, 60 sn kala uyarı). */
export const RENTAL_SECONDS = 600;
export const RENTAL_WARN_SECONDS = 60;

const GEARS_5 = Object.freeze([0.22, 0.42, 0.62, 0.82, 1.0]);

function freezeDef(d) {
  d.nitro = Object.freeze(d.nitro);
  d.step = Object.freeze(d.step);
  d.gears = Object.freeze(d.gears);
  d.rpm = Object.freeze(d.rpm);
  d.unlock = Object.freeze(d.unlock);
  d.cam = Object.freeze({ dist: d.cam.dist, height: d.cam.height, hood: Object.freeze(d.cam.hood) });
  return Object.freeze(d);
}

/* Not: tüm tekerlekli sınıflar 1 blokluk basamağı hızla (|u| ≥ 4) rampa gibi çıkar (şehir tünel/köprü rampaları 1 blok adımlıdır). */
export const VEHICLE_DEFS = Object.freeze({
  taksi: freezeDef({
    key: 'taksi', name: 'Meridyen Taksi', desc: 'Dört kişilik, güvenilir şehir taksisi.', kind: 'araba',
    max: 28, accel: 10, brake: 22, steerDeg: 32, omegaMax: 2.2, gripK: 9, handGrip: 1.8, latG: 1.6,
    length: 4.2, width: 1.9, height: 1.5, wheelbase: 2.6, track: 1.6, wheelR: 0.34, step: [0.6, 1.05], seats: 4, parcels: 0, mass: 1400,
    nitro: { spd: 1.25, acc: 1.6 }, hover: 0, gears: GEARS_5.slice(), rpm: { idle: 0.22, red: 1 },
    cam: { dist: 6.5, height: 2.4, hood: [0, 1.15, 0.9] }, price: 600, rent: 20, unlock: { minKm: 0 },
  }),
  spor: freezeDef({
    key: 'spor', name: 'Şimşek GT', desc: 'İki kişilik, alçak ve çok hızlı spor araba.', kind: 'araba',
    max: 40, accel: 16, brake: 26, steerDeg: 28, omegaMax: 2.4, gripK: 8.5, handGrip: 1.8, latG: 1.7,
    length: 4.4, width: 1.9, height: 1.2, wheelbase: 2.7, track: 1.6, wheelR: 0.33, step: [0.6, 1.05], seats: 2, parcels: 0, mass: 1250,
    nitro: { spd: 1.35, acc: 1.8 }, hover: 0, gears: GEARS_5.slice(), rpm: { idle: 0.22, red: 1 },
    cam: { dist: 6.8, height: 2.2, hood: [0, 0.95, 1.0] }, price: 1800, rent: 40, unlock: { minKm: 8 },
  }),
  kamyonet: freezeDef({
    key: 'kamyonet', name: 'Yük Kaplanı', desc: 'Üç koli taşıyan sağlam kamyonet.', kind: 'araba',
    max: 24, accel: 7, brake: 18, steerDeg: 26, omegaMax: 1.8, gripK: 9.5, handGrip: 2.0, latG: 1.5,
    length: 5.2, width: 2.1, height: 2.2, wheelbase: 3.2, track: 1.8, wheelR: 0.4, step: [0.6, 1.05], seats: 2, parcels: 3, mass: 2200,
    nitro: { spd: 1.2, acc: 1.4 }, hover: 0, gears: GEARS_5.slice(), rpm: { idle: 0.2, red: 1 },
    cam: { dist: 7.6, height: 3.0, hood: [0, 1.7, 1.3] }, price: 800, rent: 25, unlock: { minKm: 3 },
  }),
  motor: freezeDef({
    key: 'motor', name: 'Neon Moto', desc: 'Çevik, yatarak dönen iki tekerlekli motor.', kind: 'motor',
    max: 36, accel: 14, brake: 24, steerDeg: 40, omegaMax: 3.0, gripK: 7, handGrip: 1.6, latG: 1.5,
    length: 2.1, width: 0.8, height: 1.3, wheelbase: 1.4, track: 0.0, wheelR: 0.3, step: [0.6, 1.05], seats: 1, parcels: 1, mass: 260,
    nitro: { spd: 1.3, acc: 1.7 }, hover: 0, gears: GEARS_5.slice(), rpm: { idle: 0.25, red: 1 },
    cam: { dist: 5.2, height: 2.0, hood: [0, 1.25, 0.2] }, price: 400, rent: 15, unlock: { minKm: 0 },
  }),
  hoverbike: freezeDef({
    key: 'hoverbike', name: 'Rüzgâr Hoverı', desc: 'Havada süzülen, kaygan ve çok hızlı hoverbike.', kind: 'hover',
    max: 44, accel: 18, brake: 20, steerDeg: 34, omegaMax: 2.8, gripK: 2.2, handGrip: 1.2, latG: 1.0,
    length: 2.6, width: 1.0, height: 1.1, wheelbase: 1.6, track: 0.0, wheelR: 0.3, step: [1.1, 1.1], seats: 1, parcels: 0, mass: 380,
    nitro: { spd: 1.3, acc: 1.8 }, hover: 1.2, gears: [1.0], rpm: { idle: 0.3, red: 1 },
    cam: { dist: 5.6, height: 2.2, hood: [0, 1.1, 0.3] }, price: 2400, rent: 50, unlock: { minKm: 15 },
  }),
  suzulkay: freezeDef({
    key: 'suzulkay', name: 'Süzülkay', desc: 'Eğlenceli süzülen hover tahtası; zıplar ve havada döner.', kind: 'tahta',
    max: 22, accel: 12, brake: 16, steerDeg: 45, omegaMax: 3.4, gripK: 4, handGrip: 2.5, latG: 1.2,
    length: 1.4, width: 0.6, height: 0.3, wheelbase: 0.9, track: 0.0, wheelR: 0.2, step: [1.1, 1.1], seats: 1, parcels: 0, mass: 45,
    nitro: { spd: 1.25, acc: 1.5 }, hover: 0.35, gears: [1.0], rpm: { idle: 0.3, red: 1 },
    cam: { dist: 4.4, height: 1.8, hood: [0, 1.0, 0.0] }, price: 0, rent: 0, unlock: { minKm: 0 },
  }),
});

export function isVehicleClass(cls) {
  return typeof cls === 'string' && Object.prototype.hasOwnProperty.call(VEHICLE_DEFS, cls);
}

export function getVehicleDef(cls) {
  return isVehicleClass(cls) ? VEHICLE_DEFS[cls] : null;
}

/* ------------------------------------------------------------------------------------------------
 * Şartname değerleri (testler ve belgeler)
 * ---------------------------------------------------------------------------------------------- */
/**
 * vehicleSpec(cls):
 *   t97Max         0→%97·max süresi üst sınırı (sn) = 1,45·max/accel (vites boşalmaları dahil); alt sınır t97Min = 0,97·max/accel
 *   turnRadiusLow  düşük hızda dönüş yarıçapı (m) = wheelbase / tan(steerDeg) (kinematik bisiklet; testte ±%10)
 *   kmhMax         azami km/s (nitro hariç)
 */
export function vehicleSpec(cls) {
  const d = getVehicleDef(cls);
  if (!d) return null;
  const rad = (d.steerDeg * Math.PI) / 180;
  return {
    t97Max: (1.45 * d.max) / d.accel,
    t97Min: (0.97 * d.max) / d.accel,
    turnRadiusLow: d.wheelbase / Math.tan(rad),
    kmhMax: Math.round(d.max * 3.6),
  };
}

/** Hız u'da kinematik dönüş yarıçapı (m): wheelbase / tan(δ), δ = kilit/(1+(u/14)²) (vehiclePhysics ile aynı formül). */
export function turnRadiusAt(cls, u) {
  const d = getVehicleDef(cls);
  if (!d) return NaN;
  const a = Math.abs(Number.isFinite(u) ? u : 0);
  const delta = ((d.steerDeg * Math.PI) / 180) / (1 + (a / 14) * (a / 14));
  return d.wheelbase / Math.tan(delta);
}

export function rentalPrice(cls) {
  const d = getVehicleDef(cls);
  return d ? d.rent : 0;
}

export function purchasePrice(cls) {
  const d = getVehicleDef(cls);
  return d ? d.price : 0;
}

/**
 * Satın alma kilidi: stats {km}. Süzülkay ücretsizdir. Dönüş {ok, reason, need} (reason: 'km' | 'bilinmeyen').
 * Kiralama için kilit YOKTUR (her sınıf kiralanabilir, 20 Kredi'den başlar); kilit yalnız satın almayadır.
 */
export function unlockStatus(cls, stats) {
  const d = getVehicleDef(cls);
  if (!d) return { ok: false, reason: 'bilinmeyen', need: 0 };
  const km = stats && Number.isFinite(stats.km) ? stats.km : 0;
  if (km + 1e-9 < d.unlock.minKm) return { ok: false, reason: 'km', need: d.unlock.minKm };
  return { ok: true, reason: '', need: 0 };
}

/* ------------------------------------------------------------------------------------------------
 * Kozmetik (garaj): yalnız sabit örnekler (çocuk güvenli, küçük kayıt). Şekil + ad: renk körü dostu.
 * ---------------------------------------------------------------------------------------------- */
function swatch(name, hex, shape) {
  return Object.freeze({ name, hex, shape });
}

export const COSMETICS = Object.freeze({
  body: Object.freeze([
    swatch('Neon Camgöbeği', 0x19d3da, 'daire'), swatch('Şeftali', 0xffa07a, 'üçgen'), swatch('Limon Sarısı', 0xf4e04d, 'kare'), swatch('Nane', 0x7fe3b0, 'yıldız'),
    swatch('Gece Mavisi', 0x1d3a8a, 'elmas'), swatch('Mor Bulut', 0x8a5bd6, 'daire'), swatch('Gül Pembesi', 0xf06aa3, 'üçgen'), swatch('Mercan', 0xff6f61, 'kare'),
    swatch('Kum', 0xd8c49a, 'yıldız'), swatch('Antrasit', 0x3a3f4a, 'elmas'), swatch('Kar Beyazı', 0xf2f5f7, 'daire'), swatch('Zeytin', 0x8c9a4a, 'üçgen'),
    swatch('Turuncu', 0xff8a1f, 'kare'), swatch('Gök Mavisi', 0x66b8ff, 'yıldız'), swatch('Kiraz', 0xc9254a, 'elmas'), swatch('Çam', 0x1f7a52, 'daire'),
  ]),
  accent: Object.freeze([
    swatch('Beyaz', 0xffffff, 'daire'), swatch('Siyah', 0x14161a, 'kare'), swatch('Altın', 0xf2c14e, 'yıldız'), swatch('Gümüş', 0xc3c8d1, 'elmas'),
    swatch('Kırmızı', 0xe04040, 'üçgen'), swatch('Mavi', 0x3b6fe0, 'daire'), swatch('Yeşil', 0x2fbf6b, 'kare'), swatch('Mor', 0x9254e0, 'yıldız'),
    swatch('Pembe', 0xff7eb6, 'elmas'), swatch('Turkuaz', 0x20d6c7, 'üçgen'), swatch('Turuncu', 0xff9a2e, 'daire'), swatch('Limon', 0xe9ee52, 'kare'),
    swatch('Lacivert', 0x16275e, 'yıldız'), swatch('Bordo', 0x7a1f3a, 'elmas'), swatch('Gri', 0x8a909c, 'üçgen'), swatch('Krem', 0xf0e6c8, 'daire'),
  ]),
  neon: Object.freeze([
    swatch('Camgöbeği', 0x00f0ff, 'daire'), swatch('Pembe', 0xff3ea5, 'üçgen'), swatch('Kehribar', 0xffb000, 'kare'), swatch('Limon', 0xc8ff00, 'yıldız'),
    swatch('Mor', 0xa64dff, 'elmas'), swatch('Mavi', 0x3d7bff, 'daire'), swatch('Yeşil', 0x22ff88, 'üçgen'), swatch('Kırmızı', 0xff4d4d, 'kare'),
    swatch('Beyaz', 0xf4f8ff, 'yıldız'), swatch('Turuncu', 0xff7a1a, 'elmas'), swatch('Gül', 0xff8fd0, 'daire'), swatch('Buz', 0x9ee6ff, 'üçgen'),
  ]),
  wheels: Object.freeze([
    Object.freeze({ name: 'Klasik', shape: 'daire' }), Object.freeze({ name: 'Spor', shape: 'yıldız' }),
    Object.freeze({ name: 'Neon Jant', shape: 'elmas' }), Object.freeze({ name: 'Kalın Lastik', shape: 'kare' }),
  ]),
  underPatterns: Object.freeze(['sabit', 'nefes', 'dalga']),
  horns: Object.freeze([
    Object.freeze({ name: 'Klasik', shape: 'daire' }), Object.freeze({ name: 'Kısa Bip', shape: 'üçgen' }),
    Object.freeze({ name: 'Çift Ton', shape: 'kare' }), Object.freeze({ name: 'Neşeli', shape: 'yıldız' }),
  ]),
  plateChoices: 3,
});

const PLATE_LETTERS = 'ABCDEFGHJKLMNPRSTUVYZ';
/** Plakada yer almayan iki harfli bloklar (aşırıcı/siyasi/kulüp/marka kısaltması çağrışımı). */
export const PLATE_AVOID = Object.freeze(['SS', 'KK', 'AK', 'PK', 'PP', 'FB', 'GS', 'TC', 'HP', 'LG', 'BM', 'HH']);

/** Plaka metni (3 üretilmiş seçenek): seed ve idx belirlenimli; yalnız harf+rakam (aile dostu: 3 harf blokları kısa ve anlamsızdır). */
export function plateFor(seed, idx) {
  let h = (Math.imul((seed | 0) ^ 0x4e4d3031, 0x9e3779b1) + Math.imul(((idx | 0) & 7) + 1, 0x85ebca6b)) | 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) | 0;
  h ^= h >>> 12;
  const L = PLATE_LETTERS.length;
  const a = PLATE_LETTERS[(h >>> 0) % L];
  let bi = ((h >>> 5) >>> 0) % L;
  // gerçek kısaltma / simge çağrıştıran ikililer ve sayılar plakaya çıkmaz (belirlenimli kaydırma)
  for (let k = 0; k < L && PLATE_AVOID.indexOf(a + PLATE_LETTERS[bi]) >= 0; k++) bi = (bi + 1) % L;
  let n = ((h >>> 11) >>> 0) % 9000 + 1000;
  for (let k = 0; k < 16 && (n === 1488 || n === 1312 || String(n).indexOf('666') >= 0); k++) n = (n + 137 - 1000) % 9000 + 1000;
  return 'NM-' + a + PLATE_LETTERS[bi] + ' ' + n;
}

function clampInt(v, lo, hi, d) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : d;
  return n < lo ? lo : n > hi ? hi : n;
}

/** Varsayılan kozmetik (sınıfa göre yumuşak seçim; seed ile çeşitlenir). */
export function defaultCosmetics(cls, seed) {
  const i = Math.max(0, VEHICLE_CLASSES.indexOf(cls));
  const s = (seed | 0) >>> 0;
  return {
    body: (i * 3 + (s % 4)) % COSMETICS.body.length,
    accent: (i * 5 + 1) % COSMETICS.accent.length,
    neon: (i * 2) % COSMETICS.neon.length,
    under: { on: false, color: (i * 2) % COSMETICS.neon.length, pattern: 0 },
    wheels: 0,
    plate: 0,
    horn: 0,
    radio: 0,
  };
}

/** Güvensiz girdi → temiz kozmetik (tüm alanlar sınırlı tamsayı; bilinmeyen alanlar atılır; __proto__ güvenli). */
export function sanitizeCosmetics(raw, cls) {
  const base = defaultCosmetics(cls, 0);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const un = raw.under && typeof raw.under === 'object' && !Array.isArray(raw.under) ? raw.under : {};
  return {
    body: clampInt(raw.body, 0, COSMETICS.body.length - 1, base.body),
    accent: clampInt(raw.accent, 0, COSMETICS.accent.length - 1, base.accent),
    neon: clampInt(raw.neon, 0, COSMETICS.neon.length - 1, base.neon),
    under: {
      on: un.on === true,
      color: clampInt(un.color, 0, COSMETICS.neon.length - 1, base.under.color),
      pattern: clampInt(un.pattern, 0, COSMETICS.underPatterns.length - 1, 0),
    },
    wheels: clampInt(raw.wheels, 0, COSMETICS.wheels.length - 1, 0),
    plate: clampInt(raw.plate, 0, COSMETICS.plateChoices - 1, 0),
    horn: clampInt(raw.horn, 0, COSMETICS.horns.length - 1, 0),
    radio: clampInt(raw.radio, 0, 5, 0),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Doğrulama
 * ---------------------------------------------------------------------------------------------- */
const NUM_FIELDS = ['max', 'accel', 'brake', 'steerDeg', 'omegaMax', 'gripK', 'handGrip', 'latG', 'length', 'width', 'height', 'wheelbase', 'wheelR', 'mass'];

export function validateVehicleDef(d) {
  const err = [];
  if (!d || typeof d !== 'object') return ['tanım nesne değil'];
  if (!isVehicleClass(d.key)) err.push('key bilinmeyen sınıf');
  if (typeof d.name !== 'string' || d.name.length < 2 || d.name.length > 24) err.push('ad 2..24 karakter');
  if (typeof d.desc !== 'string' || d.desc.length < 4 || d.desc.length > 70) err.push('açıklama 4..70 karakter');
  NUM_FIELDS.forEach((k) => {
    if (!(typeof d[k] === 'number' && Number.isFinite(d[k]) && d[k] > 0)) err.push(k + ' pozitif sayı olmalı');
  });
  if (d.steerDeg > 60) err.push('steerDeg ≤ 60');
  if (!(d.wheelbase < d.length)) err.push('wheelbase < length');
  if (!(d.step && d.step.length === 2 && d.step[0] > 0 && d.step[1] >= d.step[0] && d.step[1] <= 1.2)) err.push('step [normal, hızlı] ≤ 1,2');
  if (!(d.nitro && d.nitro.spd >= 1 && d.nitro.acc >= 1)) err.push('nitro çarpanları ≥ 1');
  if (!(d.hover >= 0 && d.hover <= 2)) err.push('hover 0..2');
  if (!Array.isArray(d.gears) || d.gears.length < 1 || d.gears.some((g, i) => !(g > 0 && g <= 1) || (i > 0 && g <= d.gears[i - 1]))) err.push('gears artan (0,1] oranlar');
  else if (d.gears[d.gears.length - 1] !== 1) err.push('son vites oranı 1');
  if (!(d.price >= 0 && Number.isInteger(d.price)) || !(d.rent >= 0 && Number.isInteger(d.rent))) err.push('fiyatlar tamsayı ≥ 0');
  if (!(d.seats >= 1 && d.seats <= 4)) err.push('seats 1..4');
  if (!d.unlock || !(d.unlock.minKm >= 0)) err.push('unlock.minKm');
  if (!d.cam || !(d.cam.dist > 0) || !(d.cam.height > 0) || !Array.isArray(d.cam.hood) || d.cam.hood.length !== 3) err.push('cam');
  return err;
}

export function validateAllVehicles() {
  const out = [];
  VEHICLE_CLASSES.forEach((c) => {
    const e = validateVehicleDef(VEHICLE_DEFS[c]);
    e.forEach((m) => out.push(c + ': ' + m));
  });
  return out;
}
