/*
 * KEŞİF sim — BÜYÜ sistemi tarifleri (saf veri; items.js'e eklenir, eşya tablosuna bağımlı değildir).
 *
 *   MAGIC_RECIPES   üretim tarifleri: [id, çıktı, adet, [[girdi, adet]...], istasyon, kategori]  (items.js R() biçimi)
 *   BREW_RECIPES    Simya Kazanı tarifleri: {id,name,in:[{item,count}],out,time,note}
 * Kazan her tarif için girdileri BİR kez harcar; 1–3 şişe başına aynı iksirden o kadar çıkar (şişe: item:cam_şişe).
 */
import { ITEM_DUST, ITEM_HEAL_POTION, ITEM_MANA_CRYSTAL, ITEM_SHARD } from './magicData.js';

export const MAGIC_RECIPE_CATEGORY = Object.freeze({ key: 'büyü', name: 'Büyü ve Simya' });

const ST = 'item:sopa';

/** [id, out, outCount, ins, station, category] */
export const MAGIC_RECIPES = Object.freeze([
  ['büyü_tozu', ITEM_DUST, 1, [['item:ametist_parçası', 1], ['item:kristal_tozu', 1]], 'el', 'büyü'],
  ['kuantum_kıymığı', ITEM_SHARD, 4, [['item:kuantum_parçası', 1]], 'tezgah', 'büyü'],
  ['büyü_masası', 'blok:büyü_masası', 1,
    [['item:kitap', 1], ['blok:bazalt', 4], [ITEM_SHARD, 2], ['item:kristal_tozu', 2]], 'tezgah', 'büyü'],
  ['simya_kazanı', 'blok:simya_kazanı', 1, [['item:demir_külçe', 5], ['blok:taş', 3]], 'tezgah', 'büyü'],
  ['mana_kristali', ITEM_MANA_CRYSTAL, 1, [['item:kristal_tozu', 3], [ITEM_DUST, 3], [ITEM_SHARD, 1]], 'tezgah', 'büyü'],
  ['asa_ates', 'item:asa_ates', 1,
    [[ST, 2], ['item:kızıltaş_tozu', 3], [ITEM_DUST, 4], ['item:altın_külçe', 1]], 'tezgah', 'büyü'],
  ['asa_buz', 'item:asa_buz', 1,
    [[ST, 2], ['item:kristal_tozu', 4], [ITEM_DUST, 4], ['blok:buz', 2]], 'tezgah', 'büyü'],
  ['asa_sifa', 'item:asa_sifa', 1,
    [[ST, 2], ['item:altın_elma', 1], [ITEM_DUST, 5], ['item:zümrüt', 1]], 'tezgah', 'büyü'],
  ['asa_kuantum', 'item:asa_kuantum', 1,
    [[ST, 2], ['item:kuantum_parçası', 1], [ITEM_SHARD, 4], [ITEM_DUST, 8]], 'örs', 'büyü'],
]);

export const BREW_TIME = 30;
export const BREW_MAX_BOTTLES = 3;

function B(id, name, ins, out, time) {
  return Object.freeze({
    id, name, in: Object.freeze(ins.map((p) => Object.freeze({ item: p[0], count: p[1] }))), out, time: time || BREW_TIME,
  });
}

export const BREW_RECIPES = Object.freeze([
  B('sifa', 'Şifa İksiri', [['item:çilek', 2], ['item:kızıltaş_tozu', 1]], ITEM_HEAL_POTION),
  B('guclu_sifa', 'Güçlü Şifa İksiri', [['item:altın_külçe', 1], ['item:çilek', 2], [ITEM_DUST, 1]], 'item:iksir_guclu_sifa'),
  B('hiz', 'Hız İksiri', [['item:tüy', 2], ['blok:sarı_çiçek', 2], ['item:kristal_tozu', 1]], 'item:iksir_hiz'),
  B('ziplama', 'Zıplama İksiri', [['item:tüy', 2], ['blok:sarmaşık', 2], [ITEM_DUST, 1]], 'item:iksir_ziplama'),
  B('guc', 'Güç İksiri', [['item:kemik', 2], ['blok:gelincik', 2], [ITEM_DUST, 1]], 'item:iksir_guc'),
  B('gece_gorusu', 'Gece Görüşü İksiri', [['blok:ışıklı_mantar', 3], ['item:kristal_tozu', 1]], 'item:iksir_gece_gorusu'),
  B('ates_direnci', 'Ateş Direnci İksiri',
    [['item:çakmaktaşı', 2], ['item:kızıltaş_tozu', 2], [ITEM_DUST, 1]], 'item:iksir_ates_direnci'),
  B('su_solugu', 'Su Altı Soluğu İksiri',
    [['item:çiğ_balık', 1], ['blok:yosun', 2], ['item:kristal_tozu', 1]], 'item:iksir_su_solugu'),
  B('yenilenme', 'Yenilenme İksiri', [['blok:gelincik', 2], ['item:elma', 2], [ITEM_DUST, 2]], 'item:iksir_yenilenme'),
  B('mana', 'Mana İksiri', [['item:ametist_parçası', 2], [ITEM_SHARD, 1], [ITEM_DUST, 1]], 'item:iksir_mana'),
]);

const byId = Object.create(null);
BREW_RECIPES.forEach((r) => { byId[r.id] = r; });
export function brewRecipe(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(byId, id) ? byId[id] : null;
}
