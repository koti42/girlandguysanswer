/*
 * KEŞİF sim/city/ped — SATICI VERİSİ (npc_vendors). SAF, es2020, belirlenimci. Fiyatlar Kredi (şehir-yerel; jetona asla çevrilmez).
 *
 * VENDORS: 16 sahip tezgâhı + 6 sokak satıcısı + `otomat` (hepsi {id, name, title, brand, pool, markup}). OFFER_POOLS: tür başına ≥14 teklif; günlük stok bunlardan 6'sıdır.
 * Fiyat kuralı: taban fiyat BASE_PRICE (eşya başına tek tablo); alış = ceil(taban × çarpan), çarpan ≥ 1; geri satış TÜREV tablodan:
 *   SELL_PRICE[eşya] = min(floor(0,4 × taban), eldeEtmeMaliyeti − 1)  (eldeEtmeMaliyeti: en ucuz alış ya da tariflerle üretim; Bellman-Ford) → hiçbir al-sat/üret-sat döngüsü Kredi kazandırmaz.
 * Sınırlar: DAILY_CAPS (tüm satıcılar toplamı, eşya/gün: tech malzeme ≤16), satıcı başına günlük stok `qty`, geri satış günlük `SELL_LIMIT`.
 *
 *   OFFER_POOLS · VENDORS · VENDOR_BY_ID · getVendor(id) · BASE_PRICE · basePrice(item) · buyPrice(vendorId, item) · sellPrice(item) · sellAccepted(vendorId, item)
 *   dailyCap(item) · offerQty(item) · SELL_LIMIT · SELL_RATE · STOCK_SIZE · SELL_PRICE · acquisitionCost(item) · poolItems(pool)
 */
import { ITEMS, RECIPES } from '../../items.js';
import { NPCS } from './npcData.js';

export const STOCK_SIZE = 6;
export const SELL_RATE = 0.4;
export const SELL_LIMIT = 16;

/* ad:fiyat (ASCII boşluk ayrımlı; anahtar item: öneki yoksa 'item:'; blok için 'b:' öneki) */
const PRICE_TABLE = [
  // yiyecek
  'elma:6 çilek:7 havuç:6 patates:5 pişmiş_patates:9 meyve_salatası:18 sebze_çorbası:16 mantar_çorbası:18 balık_güveci:26 pişmiş_balık:14',
  'pişmiş_tavuk:15 pişmiş_koyun_eti:16 parlak_meyve:22 altın_elma:90',
  // iksirler
  'şifa_iksiri:60 iksir_guclu_sifa:120 iksir_yenilenme:90 iksir_hiz:70 iksir_ziplama:70 iksir_gece_gorusu:60 iksir_su_solugu:60 iksir_ates_direnci:60 iksir_guc:100',
  // tech malzeme ve aygıt
  'bakır_tel:8 devre_kartı:30 pil_hücresi:24 çelik_levha:18 lazer_merceği:60 enerji_hücresi:20 kristal_tozu:16 bakır_külçe:14 demir_külçe:14 enerji_çekirdeği:150',
  'tarayıcı:220 pusula:40 kanca:180 planör:260 çift_zıplama_botları:300',
  // malzeme, giyim
  'kağıt:4 kitap:14 kase:5 cam_şişe:6 sopa:2 tüy:3 ip:4 yün:6 deri:10',
  'miğfer_deri:28 göğüslük_deri:44 bacaklık_deri:38 çizme_deri:26',
  // boyalar
  'boya_beyaz:10 boya_siyah:10 boya_kırmızı:10 boya_turuncu:10 boya_sarı:10 boya_yeşil:10 boya_mavi:10 boya_mor:10',
  // bloklar
  'b:neon_camgöbeği:14 b:neon_pembe:14 b:neon_kehribar:14 b:neon_limon:14 b:pencere_karanlık:8 b:pencere_sıcak:10 b:pencere_soğuk:10 b:cephe_koyu:8',
  'b:cephe_açık:8 b:holo_panel:26 b:ışık_bloğu:12 b:fener:8 b:cam_mavi:6 b:cam_mor:6 b:asfalt:5 b:asfalt_çizgi_x:6 b:asfalt_çizgi_z:6 b:zebra_x:6',
  'b:zebra_z:6 b:kaldırım:5 b:kumaş_kırmızı:6 b:kumaş_mavi:6 b:kumaş_mor:6 b:kumaş_yeşil:6 b:kumaş_sarı:6 b:kumaş_turuncu:6 b:kitaplık:16',
  'b:işaret_levhası:6 b:beton_beyaz:4 b:zıplama_bloğu:30 b:gelincik:4 b:sarı_çiçek:4 b:papatya:4 b:çan_çiçeği:5 b:lavanta:5 b:lale:5',
  'b:şakayık:6 b:eğrelti:4 b:sarmaşık:4 b:yosun:4 b:kablo:6 b:lamba_paneli:22 b:düğme:10 b:sensör:28 b:güneş_paneli:80 b:pil_bankası:90',
  'b:şarj_istasyonu:100 b:güç_kapısı:40',
];

function keyOf(tok) {
  return tok.indexOf('b:') === 0 ? 'blok:' + tok.slice(2) : 'item:' + tok;
}

export const BASE_PRICE = (() => {
  const t = {};
  PRICE_TABLE.forEach((row) => {
    row.split(' ').forEach((tok) => {
      const i = tok.lastIndexOf(':');
      t[keyOf(tok.slice(0, i))] = parseInt(tok.slice(i + 1), 10);
    });
  });
  return Object.freeze(t);
})();

const pool = (s) => Object.freeze(s.split(' ').map(keyOf));

/** Tür başına ≥14 teklif (günlük stok bunlardan STOCK_SIZE tanesi). */
export const OFFER_POOLS = Object.freeze({
  yemek: pool('elma çilek havuç patates pişmiş_patates meyve_salatası sebze_çorbası mantar_çorbası balık_güveci pişmiş_balık pişmiş_tavuk pişmiş_koyun_eti parlak_meyve altın_elma'),
  saglik: pool('şifa_iksiri iksir_guclu_sifa iksir_yenilenme iksir_hiz iksir_ziplama iksir_gece_gorusu iksir_su_solugu iksir_ates_direnci elma meyve_salatası sebze_çorbası altın_elma çizme_deri iksir_guc'),
  teknoloji: pool('bakır_tel devre_kartı pil_hücresi çelik_levha lazer_merceği enerji_hücresi kristal_tozu bakır_külçe demir_külçe b:kablo b:lamba_paneli b:düğme b:sensör b:güneş_paneli b:pil_bankası'),
  gadget: pool('tarayıcı pusula kanca planör çift_zıplama_botları enerji_hücresi pil_hücresi devre_kartı lazer_merceği çelik_levha bakır_tel kitap kağıt cam_şişe'),
  yol_boya: pool('boya_beyaz boya_siyah boya_kırmızı boya_turuncu boya_sarı boya_yeşil boya_mavi boya_mor çelik_levha pil_hücresi b:asfalt b:asfalt_çizgi_x b:zebra_x b:kaldırım'),
  neon_dekor: pool('b:neon_camgöbeği b:neon_pembe b:neon_kehribar b:neon_limon b:pencere_karanlık b:pencere_sıcak b:pencere_soğuk b:cephe_koyu b:cephe_açık b:holo_panel b:ışık_bloğu b:fener b:cam_mavi b:cam_mor'),
  giyim: pool('miğfer_deri göğüslük_deri bacaklık_deri çizme_deri yün deri ip tüy b:kumaş_kırmızı b:kumaş_mavi b:kumaş_mor b:kumaş_yeşil b:kumaş_sarı b:kumaş_turuncu'),
  kirtasiye: pool('kağıt kitap boya_beyaz boya_siyah boya_mavi boya_kırmızı b:kitaplık kase cam_şişe sopa tüy b:işaret_levhası ip yün'),
  bahce: pool('b:gelincik b:sarı_çiçek b:papatya b:çan_çiçeği b:lavanta b:lale b:şakayık b:eğrelti b:sarmaşık b:yosun çilek havuç patates elma'),
  otomat: pool('elma çilek havuç meyve_salatası sebze_çorbası pişmiş_patates pil_hücresi enerji_hücresi bakır_tel kağıt boya_beyaz boya_mavi cam_şişe ip'),
  robot_parca: pool('bakır_tel devre_kartı pil_hücresi çelik_levha lazer_merceği enerji_hücresi bakır_külçe demir_külçe enerji_çekirdeği b:kablo b:sensör b:düğme b:şarj_istasyonu b:güç_kapısı'),
  market: pool('elma çilek havuç patates meyve_salatası sebze_çorbası enerji_hücresi pil_hücresi bakır_tel kağıt boya_beyaz ip cam_şişe b:fener'),
  sanat: pool('boya_beyaz boya_siyah boya_kırmızı boya_turuncu boya_sarı boya_yeşil boya_mavi boya_mor kağıt kitap b:beton_beyaz b:cam_mor b:kumaş_mavi b:neon_pembe'),
  arcade: pool('b:neon_camgöbeği b:neon_pembe b:neon_kehribar b:neon_limon b:holo_panel b:ışık_bloğu b:zıplama_bloğu b:düğme b:sensör devre_kartı pil_hücresi enerji_hücresi kristal_tozu lazer_merceği'),
  kurye: pool('pusula tarayıcı kanca planör enerji_hücresi pil_hücresi elma meyve_salatası sebze_çorbası boya_turuncu çelik_levha ip kağıt çift_zıplama_botları'),
});

/** Tüm satıcılar toplamı günlük alım sınırı (eşya başına). Tech malzemesi ≤16. */
const CAP_OVERRIDE = {
  'item:tarayıcı': 1, 'item:planör': 1, 'item:kanca': 1, 'item:çift_zıplama_botları': 1, 'item:enerji_çekirdeği': 2, 'item:altın_elma': 2,
};
const TECH_ITEMS = Object.freeze([
  'item:bakır_tel', 'item:devre_kartı', 'item:pil_hücresi', 'item:çelik_levha', 'item:lazer_merceği', 'item:enerji_hücresi', 'item:kristal_tozu',
  'item:bakır_külçe', 'item:demir_külçe', 'blok:kablo', 'blok:lamba_paneli', 'blok:düğme', 'blok:sensör', 'blok:güneş_paneli', 'blok:pil_bankası',
  'blok:şarj_istasyonu', 'blok:güç_kapısı',
]);

export function basePrice(item) {
  return Object.prototype.hasOwnProperty.call(BASE_PRICE, item) ? BASE_PRICE[item] : 0;
}

/** Günlük alım sınırı (tüm satıcılar toplamı). */
export function dailyCap(item) {
  if (Object.prototype.hasOwnProperty.call(CAP_OVERRIDE, item)) return CAP_OVERRIDE[item];
  if (TECH_ITEMS.indexOf(item) >= 0) return 16;
  if (item.indexOf('item:iksir_') === 0 || item === 'item:şifa_iksiri') return 4;
  const it = ITEMS[item];
  if (!it) return 0;
  if (it.kind === 'blok') return 96;
  if (it.kind === 'yiyecek') return 48;
  if (it.kind === 'zırh' || it.kind === 'özel') return 2;
  return 32;
}

/** Satıcı başına günlük stok adedi (tek teklif). */
export function offerQty(item) {
  return Math.min(dailyCap(item), (ITEMS[item] && ITEMS[item].kind === 'blok') ? 32 : 16);
}

/* ---------------------------------------------------------------------------------------------- satıcılar */
function vendorRecord(n) {
  const sh = n.shop;
  return Object.freeze({
    id: n.id,
    name: n.name,
    title: n.title,
    brand: n.brand || null,
    pool: sh.pool,
    markup: sh.markup,
    kind: n.kind === 'owner' ? 'owner' : 'street',
  });
}

export const VENDORS = Object.freeze(NPCS.filter((n) => n.shop).map(vendorRecord).concat([
  Object.freeze({
    id: 'otomat', name: 'Otomat', title: 'Atıştırmalık Otomatı', brand: null, pool: 'otomat', markup: 1.25, kind: 'vending',
  }),
]));
export const VENDOR_BY_ID = Object.freeze(VENDORS.reduce((m, v) => { m[v.id] = v; return m; }, {}));

export function getVendor(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(VENDOR_BY_ID, id) ? VENDOR_BY_ID[id] : null;
}

export function poolItems(poolKey) {
  return Object.prototype.hasOwnProperty.call(OFFER_POOLS, poolKey) ? OFFER_POOLS[poolKey] : [];
}

/** Alış fiyatı (çarpan ≥ 1; taban fiyatın altına inemez). 0 = satılmıyor. */
export function buyPrice(vendorId, item) {
  const v = getVendor(vendorId);
  const b = basePrice(item);
  if (!v || b <= 0) return 0;
  return Math.max(b, Math.ceil(b * Math.max(1, v.markup)));
}

/* ---------------------------------------------------------------------------------------------- geri satış (türev, arbitrajsız) */
function cheapestBuy() {
  const best = {};
  VENDORS.forEach((v) => {
    poolItems(v.pool).forEach((item) => {
      const p = buyPrice(v.id, item);
      if (p > 0 && (best[item] === undefined || p < best[item])) best[item] = p;
    });
  });
  return best;
}

/** Eşyayı elde etmenin en ucuz Kredi yolu (satıcı alışı ya da tarifle üretim); yoksa Infinity. Bellman-Ford. */
export function acquisitionCostTable() {
  const cost = {};
  const buy = cheapestBuy();
  Object.keys(buy).forEach((k) => { cost[k] = buy[k]; });
  const get = (k) => (Object.prototype.hasOwnProperty.call(cost, k) ? cost[k] : Infinity);
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (let i = 0; i < RECIPES.length; i++) {
      const r = RECIPES[i];
      const outs = r.out ? [r.out] : r.outs || [];
      let total = 0;
      const ins = r.in || r.inputs || [];
      let ok = true;
      for (let j = 0; j < ins.length; j++) {
        const c = get(ins[j].item === undefined ? ins[j][0] : ins[j].item);
        const n = ins[j].count === undefined ? (ins[j][1] === undefined ? 1 : ins[j][1]) : ins[j].count;
        if (c === Infinity) { ok = false; break; }
        total += c * n;
      }
      if (!ok) continue;
      for (let o = 0; o < outs.length; o++) {
        const out = outs[o];
        const key = out.item === undefined ? out[0] : out.item;
        const cnt = out.count === undefined ? (out[1] === undefined ? 1 : out[1]) : out.count;
        const unit = total / cnt;
        if (unit < get(key)) {
          cost[key] = unit;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return cost;
}

const ACQ = acquisitionCostTable();
export function acquisitionCost(item) {
  return Object.prototype.hasOwnProperty.call(ACQ, item) ? ACQ[item] : Infinity;
}

/** Geri satış fiyatı tablosu: yalnız fiyatı olan, bağlı olmayan eşyalar; ≥1 Kredi. */
export const SELL_PRICE = (() => {
  const t = {};
  Object.keys(BASE_PRICE).forEach((item) => {
    const it = ITEMS[item];
    if (!it || it.dimBound) return;
    const cap = Math.floor(BASE_PRICE[item] * SELL_RATE);
    const acq = acquisitionCost(item);
    const lim = acq === Infinity ? cap : Math.min(cap, Math.ceil(acq) - 1);
    if (lim >= 1) t[item] = lim;
  });
  return Object.freeze(t);
})();

export function sellPrice(item) {
  return Object.prototype.hasOwnProperty.call(SELL_PRICE, item) ? SELL_PRICE[item] : 0;
}

/** Satıcı bu eşyayı geri alır mı? (yalnız kendi havuzundaki, fiyatı olan, bağlı olmayan eşyalar). */
export function sellAccepted(vendorId, item) {
  const v = getVendor(vendorId);
  if (!v || sellPrice(item) <= 0) return false;
  return poolItems(v.pool).indexOf(item) >= 0;
}
