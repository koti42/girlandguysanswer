/*
 * KEŞİF sim/props — PROP TANIMLARI (saf veri + küçük saf yardımcılar). Sözleşme KESIF_CITY_CONTRACT §6, §19 (props_core).
 *
 * Faz 1: 12 sokak tanımı (t=1..12). Faz 2: iç mekân tanımları (t=13…, propDefsInterior.js; PROP_ALL/PROP_BY_T/getPropDef kapsar, PROP_LIST/PROP_DEFS değil).
 * Şekil (donuk):
 *   PROP_DEFS[key] = {
 *     t:u16, key:ASCII, name:TR, model:{meshKey}, size:[w,h,d] (blok; yerel x,y,z; çapa = taban merkezi), colliders:[[x0,y0,z0,x1,y1,z1]]≤4
 *     (çapaya göre, 1/16 katları, yaw 90° niceli), trigger?:[x0,y0,z0,x1,y1,z1] (ışın/etkileşim hacmi; yoksa colliders; o da yoksa size),
 *     interact:{kind,prompt(TR),range}|null, states:n, emissive:0..1, light?:{level,hue}, holo?:bool, sign?:{w,h,font},
 *     tags:[], dimBound?, dyn?:bool }
 *   Yön: yaw k (0..3) → yerel +Z'nin baktığı yön: 0:+Z, 1:+X, 2:−Z, 3:−X (three rotation.y = k·π/2 ile aynı).
 *   Prop.flags düşük 16 bit = `data`: tabela/billboard için SIGN_ENTRIES indeksi, terminal/boyut terminali için terminal numarası 0..15.
 *
 *   getPropDef(keyOrT)  resolvePropKey(k)  worldBoxes(def,x,y,z,yaw,out?)  hitBoxes(def)  rotateBox(box,yaw,out?)  validatePropDef(def)
 */

import { INTERIOR_DEFS, interiorDef } from './propDefsInterior.js';

const Q = 1 / 16;

/** Aynı anahtarın farklı yazımları (aksan/Türkçe) → kanonik ASCII anahtar. */
export const PROP_ALIASES = Object.freeze({
  lamba: 'lamba',
  sokak_lambasi: 'lamba',
  'sokak_lambası': 'lamba',
  bank: 'bank',
  cop_kutusu: 'cop_kutusu',
  'çöp_kutusu': 'cop_kutusu',
  cop: 'cop_kutusu',
  'çöp': 'cop_kutusu',
  trafik_diregi: 'trafik_diregi',
  'trafik_direği': 'trafik_diregi',
  trafik_isigi: 'trafik_diregi',
  'trafik_ışığı': 'trafik_diregi',
  otomat: 'otomat',
  tabela: 'tabela',
  billboard: 'billboard',
  terminal: 'terminal',
  boyut_terminali: 'boyut_terminali',
  agac: 'agac',
  'ağaç': 'agac',
  cit: 'cit',
  'çit': 'cit',
  saksi: 'saksi',
  'saksı': 'saksi',
});

const TAGS_DEKOR = ['sokak', 'dekor'];
const TAGS_ZORUNLU = ['sokak', 'zorunlu'];

function def(d) {
  return Object.freeze(Object.assign({
    trigger: undefined, light: undefined, holo: false, sign: undefined, dimBound: undefined, dyn: false,
  }, d, {
    size: Object.freeze(d.size.slice()),
    colliders: Object.freeze(d.colliders.map((b) => Object.freeze(b.slice()))),
    tags: Object.freeze(d.tags.slice()),
    model: Object.freeze(Object.assign({}, d.model)),
    interact: d.interact ? Object.freeze(Object.assign({ range: 2.6 }, d.interact)) : null,
    trigger: d.trigger ? Object.freeze(d.trigger.slice()) : undefined,
    light: d.light ? Object.freeze(Object.assign({}, d.light)) : undefined,
    sign: d.sign ? Object.freeze(Object.assign({}, d.sign)) : undefined,
  }));
}

/* Koordinatlar çapaya göre (taban merkezi). Çarpışma kutuları 1/16 katlarıdır. */
const DEFS = [
  def({
    t: 1, key: 'lamba', name: 'Sokak Lambası', model: { meshKey: 'lamba' }, size: [0.5, 5.5, 1.6],
    colliders: [[-0.125, 0, -0.125, 0.125, 5.5, 0.125]],
    interact: null, states: 1, emissive: 0.9, light: { level: 13, hue: 'kehribar' }, tags: TAGS_ZORUNLU,
  }),
  def({
    t: 2, key: 'bank', name: 'Bank', model: { meshKey: 'bank' }, size: [1.75, 1.0, 0.625],
    colliders: [[-0.875, 0, -0.3125, 0.875, 0.875, 0.3125]],
    trigger: [-0.9375, 0, -0.4375, 0.9375, 1.0, 0.4375],
    interact: { kind: 'dinlen', prompt: 'Bankta dinlen' }, states: 1, emissive: 0.5, tags: TAGS_DEKOR,
  }),
  def({
    t: 3, key: 'cop_kutusu', name: 'Çöp Kutusu', model: { meshKey: 'cop_kutusu' }, size: [0.625, 1.0, 0.625],
    colliders: [[-0.3125, 0, -0.3125, 0.3125, 0.9375, 0.3125]],
    interact: null, states: 1, emissive: 0.45, tags: TAGS_DEKOR,
  }),
  def({
    t: 4, key: 'trafik_diregi', name: 'Trafik Direği', model: { meshKey: 'trafik_diregi' }, size: [2.5, 6.5, 0.625],
    colliders: [[-0.125, 0, -0.125, 0.125, 6.25, 0.125]],
    interact: null, states: 3, emissive: 1.0, light: { level: 8, hue: 'camgobegi' }, tags: TAGS_ZORUNLU.concat(['trafik']),
    transient: true, // lamba durumu trafik sistemi tarafından zamandan türetilir (systems/traffic.js): kayda girmez, yüklemede sıfırlanır
  }),
  def({
    t: 5, key: 'otomat', name: 'Otomat', model: { meshKey: 'otomat' }, size: [1.0, 2.0, 0.875],
    colliders: [[-0.5, 0, -0.4375, 0.5, 2.0, 0.4375]],
    trigger: [-0.5625, 0, -0.5, 0.5625, 2.0, 0.5625],
    interact: { kind: 'otomat', prompt: 'Otomatı kullan' }, states: 2, emissive: 0.85,
    light: { level: 9, hue: 'pembe' }, tags: TAGS_DEKOR,
  }),
  def({
    t: 6, key: 'tabela', name: 'Tabela', model: { meshKey: 'tabela' }, size: [3.0, 1.0, 0.25],
    colliders: [], trigger: [-1.5, 0, -0.25, 1.5, 1.0, 0.25],
    interact: { kind: 'oku', prompt: 'Tabelayı oku' }, states: 1, emissive: 1.0, sign: { w: 2.8, h: 0.84, font: 'neon' },
    light: { level: 8, hue: 'pembe' }, tags: ['tabela', 'dekor'],
  }),
  def({
    t: 7, key: 'billboard', name: 'Billboard', model: { meshKey: 'billboard' }, size: [6.0, 3.5, 0.5],
    colliders: [[-2.5, 0, -0.125, -2.25, 1.0, 0.125], [2.25, 0, -0.125, 2.5, 1.0, 0.125]],
    trigger: [-3.0, 0, -0.25, 3.0, 3.5, 0.25],
    interact: { kind: 'oku', prompt: 'Reklamı oku' }, states: 1, emissive: 1.0, holo: true,
    sign: { w: 5.7, h: 2.7, font: 'holo' }, light: { level: 9, hue: 'camgobegi' }, tags: ['tabela', 'holo', 'dekor'],
  }),
  def({
    t: 8, key: 'terminal', name: 'Terminal', model: { meshKey: 'terminal' }, size: [1.0, 2.0, 0.875],
    colliders: [[-0.4375, 0, -0.3125, 0.4375, 1.75, 0.3125]],
    trigger: [-0.6875, 0, -0.5625, 0.6875, 2.0, 0.5625],
    interact: { kind: 'terminal', prompt: 'Terminali kullan' }, states: 2, emissive: 1.0,
    light: { level: 10, hue: 'camgobegi' }, tags: ['terminal', 'zorunlu'],
  }),
  def({
    t: 9, key: 'boyut_terminali', name: 'Boyut Terminali', model: { meshKey: 'boyut_terminali' }, size: [3.0, 3.5, 1.5],
    colliders: [[-1.5, 0, -0.5, -1.0, 3.5, 0.5], [1.0, 0, -0.5, 1.5, 3.5, 0.5], [-0.5, 0, 0.25, 0.5, 1.25, 0.75]],
    trigger: [-1.5, 0, -0.75, 1.5, 3.5, 1.0],
    interact: { kind: 'boyut', prompt: 'Boyut terminalini kullan' }, states: 2, emissive: 1.0,
    light: { level: 12, hue: 'pembe' }, tags: ['terminal', 'zorunlu'],
  }),
  def({
    t: 10, key: 'agac', name: 'Ağaç', model: { meshKey: 'agac' }, size: [3.2, 6.0, 3.2],
    colliders: [[-0.25, 0, -0.25, 0.25, 3.0, 0.25]],
    interact: null, states: 1, emissive: 0.25, tags: TAGS_DEKOR.concat(['bitki']),
  }),
  def({
    t: 11, key: 'cit', name: 'Çit', model: { meshKey: 'cit' }, size: [2.0, 1.5, 0.125],
    colliders: [[-1.0, 0, -0.0625, 1.0, 1.4375, 0.0625]],
    interact: null, states: 1, emissive: 0.7, tags: TAGS_DEKOR,
  }),
  def({
    t: 12, key: 'saksi', name: 'Saksı', model: { meshKey: 'saksi' }, size: [0.875, 1.25, 0.875],
    colliders: [[-0.4375, 0, -0.4375, 0.4375, 0.75, 0.4375]],
    interact: null, states: 1, emissive: 0.5, tags: TAGS_DEKOR.concat(['bitki']),
  }),
];

export const PROP_LIST = Object.freeze(DEFS);
export const PROP_DEFS = Object.freeze(DEFS.reduce((o, d) => {
  o[d.key] = d;
  return o;
}, Object.create(null)));
/** Sokak + iç mekân (props_content, t = 13…) tüm tanımlar. PROP_LIST/PROP_DEFS yalnız 12 sokak tanımıdır (Faz 1 sözleşmesi). */
export const PROP_ALL = Object.freeze(DEFS.concat(INTERIOR_DEFS));
/** t → tanım (seyrek dizi, en büyük t+1 uzunluğunda); sokak + iç mekân. */
export const PROP_BY_T = Object.freeze(PROP_ALL.reduce((a, d) => {
  a[d.t] = d;
  return a;
}, []));

/** Anahtar | t | takma ad → tanım | null. Prototip anahtarlarına karşı güvenli. */
export function getPropDef(k) {
  if (typeof k === 'number') return PROP_BY_T[k] || null;
  if (typeof k !== 'string') return null;
  const key = Object.prototype.hasOwnProperty.call(PROP_ALIASES, k) ? PROP_ALIASES[k] : k;
  return Object.prototype.hasOwnProperty.call(PROP_DEFS, key) ? PROP_DEFS[key] : interiorDef(key);
}

export function resolvePropKey(k) {
  const d = getPropDef(k);
  return d ? d.key : null;
}

/* ------------------------------------------------------------------------------------------------
 * Yön ve kutu yardımcıları
 * ---------------------------------------------------------------------------------------------- */
/** Yerel kutuyu yaw·90° döndürür (çapa çevresinde). out verilirse yazılır. three rotation.y = yaw·π/2 ile aynı dönüş. */
export function rotateBox(b, yaw, out) {
  const o = out || [0, 0, 0, 0, 0, 0];
  const k = yaw & 3;
  let x0 = b[0];
  let z0 = b[2];
  let x1 = b[3];
  let z1 = b[5];
  if (k === 1) {
    // (x,z) → (z,−x)
    x0 = b[2]; x1 = b[5]; z0 = -b[3]; z1 = -b[0];
  } else if (k === 2) {
    x0 = -b[3]; x1 = -b[0]; z0 = -b[5]; z1 = -b[2];
  } else if (k === 3) {
    // (x,z) → (−z,x)
    x0 = -b[5]; x1 = -b[2]; z0 = b[0]; z1 = b[3];
  }
  o[0] = x0; o[1] = b[1]; o[2] = z0; o[3] = x1; o[4] = b[4]; o[5] = z1;
  return o;
}

/** Tanımın çarpışma kutuları, (x,y,z,yaw) çapasında dünya uzayında. out: önceden ayrılmış kutu dizisi (yoksa yeni). */
export function worldBoxes(d, x, y, z, yaw, out) {
  const list = d.colliders;
  const res = out || [];
  res.length = list.length;
  for (let i = 0; i < list.length; i++) {
    const r = rotateBox(list[i], yaw, res[i] || [0, 0, 0, 0, 0, 0]);
    r[0] += x; r[3] += x; r[1] += y; r[4] += y; r[2] += z; r[5] += z;
    res[i] = r;
  }
  return res;
}

/** Işın/etkileşim kutuları (yerel): trigger | colliders | size kutusu. */
export function hitBoxes(d) {
  if (d.trigger) return [d.trigger];
  if (d.colliders.length > 0) return d.colliders;
  const hw = d.size[0] / 2;
  const hd = d.size[2] / 2;
  return [[-hw, 0, -hd, hw, d.size[1], hd]];
}

/** Tanım tablosu değişmezleri: hata dizisi (boş = geçerli). Testler ve props_content ekleme denetimi kullanır. */
export function validatePropDef(d) {
  const err = [];
  if (!d || typeof d !== 'object') return ['tanım nesne değil'];
  if (!Number.isInteger(d.t) || d.t < 1 || d.t > 65535) err.push('t u16 olmalı');
  if (typeof d.key !== 'string' || !/^[a-z0-9_]{1,32}$/.test(d.key)) err.push('key ASCII [a-z0-9_] olmalı');
  if (typeof d.name !== 'string' || d.name.length === 0 || d.name.length > 32) err.push('ad 1..32 karakter');
  if (!d.model || (typeof d.model.meshKey !== 'string' && !Array.isArray(d.model.boxes))) err.push('model meshKey|boxes');
  if (!Array.isArray(d.size) || d.size.length !== 3 || d.size.some((v) => !(v > 0 && v <= 64))) err.push('size 3 pozitif sayı');
  if (!Array.isArray(d.colliders) || d.colliders.length > 4) err.push('colliders ≤ 4');
  else {
    d.colliders.forEach((b, i) => {
      if (!Array.isArray(b) || b.length !== 6 || b.some((v) => !Number.isFinite(v))) err.push('collider ' + i + ' 6 sayı');
      else {
        if (!(b[3] > b[0] && b[4] > b[1] && b[5] > b[2])) err.push('collider ' + i + ' ters/boş');
        if (b.some((v) => Math.abs(v * 16 - Math.round(v * 16)) > 1e-9)) err.push('collider ' + i + ' 1/16 katı değil');
        if (b[1] < 0) err.push('collider ' + i + ' tabanın altında');
      }
    });
  }
  if (d.trigger !== undefined && (!Array.isArray(d.trigger) || d.trigger.length !== 6 || !(d.trigger[3] > d.trigger[0]))) err.push('trigger 6 sayı');
  if (d.interact !== null) {
    if (!d.interact || typeof d.interact.kind !== 'string' || typeof d.interact.prompt !== 'string' || !(d.interact.range > 0)) err.push('interact {kind,prompt,range}');
  }
  if (!Number.isInteger(d.states) || d.states < 1 || d.states > 255) err.push('states 1..255');
  if (!(d.emissive >= 0 && d.emissive <= 1)) err.push('emissive 0..1');
  if (d.light !== undefined && !(d.light.level >= 0 && d.light.level <= 15)) err.push('light.level 0..15');
  if (d.sign !== undefined && !(d.sign.w > 0 && d.sign.h > 0)) err.push('sign w,h');
  if (!Array.isArray(d.tags)) err.push('tags dizi');
  return err;
}

export const PROP_QUANT = Q;
