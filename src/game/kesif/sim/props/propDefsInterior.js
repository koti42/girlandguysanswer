/*
 * KEŞİF sim/props — İÇ MEKÂN PROP TANIMLARI (props_content; sözleşme §6, §19). propCatalog.js (interior_kit) anahtar listesinin YETKİLİ
 * kaynağıdır; her katalog girişi burada tam bir PROP_DEFS tanımına dönüşür (t = 13…; sokak tanımlarının ardından, dizin sırası donuk):
 *
 *   t u16 · key · name(TR) · model:{meshKey} · size · colliders ≤ 4 (1/16 katı, yaw 90°) · trigger? · interact{kind,prompt,range} | null · states
 *   · emissive · light? · holo? · sign? · tags + catalog alanları (mount, uses, variants) + props_content alanları (propDefsExtra.js):
 *   seat · amb · mode · power · transient · openFree · cull · say   ve  interior:true, catalog:true
 *
 * Sizes/colliders/tags KATALOGDAN AYNEN alınır (iç mekân planlayıcısı ve ulaşılabilirlik BFS aynı kutuları kullanır). Bu dosya propDefs.js'i
 * İÇE AKTARMAZ (propDefs.js bunu içe aktarır); saf, belirlenimci, worker-güvenli.
 *
 *   INTERIOR_DEFS · INTERIOR_BY_KEY · INTERIOR_BY_T · interiorDef(keyOrT)
 */
import { CATALOG } from './propCatalog.js';
import { DEFAULT_CULL, EXTRA } from './propDefsExtra.js';

const NO_EXTRA = Object.freeze({});

function inflate(size, interact) {
  if (!interact) return undefined;
  const m = Math.min(size[0], size[1], size[2]);
  if (m >= 0.4) return undefined;
  // ince/küçük duvar propları nişan almak için güç: isabet kutusunu her yönde şişir
  const hw = size[0] / 2 + 0.12;
  const hd = size[2] / 2 + 0.2;
  return [-hw, 0, -hd, hw, size[1] + 0.12, hd];
}

function freezeDeep(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    Object.keys(v).forEach((k) => freezeDeep(v[k]));
  }
  return v;
}

function make(c) {
  const x = Object.prototype.hasOwnProperty.call(EXTRA, c.key) ? EXTRA[c.key] : NO_EXTRA;
  const d = Object.assign({}, c, {
    interior: true,
    mode: x.mode,
    seat: x.seat,
    amb: x.amb,
    power: x.power,
    timed: x.timed,
    transient: x.transient === true,
    openFree: x.openFree === true,
    cull: x.cull || DEFAULT_CULL,
    say: x.say || c.key,
    dyn: false,
    // `sign` sokak tabela kuralıdır (flags = SIGN_ENTRIES indeksi, propPlan otomatik seçer); iç mekân yazı panoları `isign` taşır, data'yı
    // iç mekân planlayıcısı belirler (neon_tabela_ic: marka SIGN indeksi · ilan_panosu/kod_notu: kod ipucu).
    sign: undefined,
    isign: c.sign,
  });
  if (c.trigger === undefined) d.trigger = inflate(c.size, c.interact);
  if (d.light === undefined) d.light = undefined;
  return freezeDeep(d);
}

export const INTERIOR_DEFS = Object.freeze(CATALOG.map(make));

const byKey = Object.create(null);
const byT = [];
INTERIOR_DEFS.forEach((d) => {
  byKey[d.key] = d;
  byT[d.t] = d;
});
export const INTERIOR_BY_KEY = Object.freeze(byKey);
export const INTERIOR_BY_T = Object.freeze(byT);

/** Anahtar | t → iç mekân tanımı | null (prototip anahtarlarına karşı güvenli). */
export function interiorDef(k) {
  if (typeof k === 'number') return Number.isInteger(k) && k >= 0 && k < byT.length ? byT[k] || null : null;
  return typeof k === 'string' && Object.prototype.hasOwnProperty.call(byKey, k) ? byKey[k] : null;
}
