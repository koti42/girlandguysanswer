/*
 * KEŞİF sim/city/interior — İÇ MEKÂN KAYIT DEFTERİ (yaprak modül: hiçbir şey içe aktarmaz; tür modülleri güvenle içe aktarabilir).
 * Sözleşme §8.
 *
 *   registerInterior(kind, impl)   impl = {kind, name, footprint(variant)->{w,d,h}, plan(lot, rng, variant, frame)->Interior, emit(W, interior)}
 *                                  kind: INTERIOR_KINDS'ten biri ya da (test) /^[a-z][a-z0-9_]{1,31}$/ ; aynı tür yeniden kaydedilirse değiştirilir
 *   unregisterInterior(kind)       -> bool
 *   getInterior(kind)              -> impl | null (prototip anahtarlarına karşı güvenli)
 *   listInteriors()                -> kayıtlı tür anahtarları (kayıt sırasıyla)
 *   INTERIOR_KINDS                 16 tür, ownerData.INTERIOR_KINDS ile AYNI sıra (test çapraz denetler)
 *
 * Tür modülleri `interior/kinds/<tür>.js` içinde durur ve ya `export default impl` / `export const interior = impl` verir ya da bu dosyadan
 * registerInterior çağırır; index.js `import.meta.glob('./kinds/*.js')` ile hepsini yükler.
 */

export const INTERIOR_KINDS = Object.freeze([
  'kapsul_daire', 'loft', 'hacker_odasi', 'oyuncu_odasi', 'ramen_bari', 'klinik', 'garaj_atolyesi', 'kulup',
  'market', 'cati_bahcesi', 'kitap_kafe', 'sanat_studyosu', 'robot_tamirhanesi', 'arcade', 'dron_kurye',
  'holo_sinema',
]);

const KIND_RE = /^[a-z][a-z0-9_]{1,31}$/;
const REG = new Map();

export function isInteriorImpl(impl) {
  return !!impl && typeof impl === 'object' && typeof impl.plan === 'function' && typeof impl.emit === 'function'
    && typeof impl.footprint === 'function';
}

export function registerInterior(kind, impl) {
  if (typeof kind !== 'string' || !KIND_RE.test(kind)) throw new Error('registerInterior: geçersiz tür anahtarı: ' + String(kind));
  if (!isInteriorImpl(impl)) throw new Error('registerInterior(' + kind + '): impl {footprint, plan, emit} gerekir');
  if (impl.kind !== undefined && impl.kind !== kind) throw new Error('registerInterior(' + kind + '): impl.kind uyuşmuyor: ' + String(impl.kind));
  const frozen = Object.freeze(Object.assign({ name: kind }, impl, { kind }));
  REG.set(kind, frozen);
  return frozen;
}

export function unregisterInterior(kind) {
  return REG.delete(kind);
}

export function getInterior(kind) {
  if (typeof kind !== 'string') return null;
  const r = REG.get(kind);
  return r === undefined ? null : r;
}

export function listInteriors() {
  return Array.from(REG.keys());
}
