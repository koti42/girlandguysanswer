/*
 * KEŞİF paneller — Üret çalışma alanı için saf yardımcılar (DOM/React yok; node'da test edilir).
 *
 *   STATION_ORDER / STATION_HELP     istasyon sırası + "nasıl yapılır / nerede" kısa metinleri
 *   stationChips(stations)           [{key,label,block,on,help}] — Tezgah yakınında / yok göstergeleri
 *   missingLine(view)                'Eksik: 3 Meşe Tahta, 1 İp' | 'Tezgah yakınında olmalı' | ''
 *   craftGuide(inv, stations)        yeni oyuncuya "sıradaki adım": {key, text, recipeId?, tab?} | null
 *   searchHaystack(view)             arama için çıktı + malzeme adları
 *   PIN_KEY / pinnedFirst(views, pins)  sabitlenen tarifler (liste sırasını değiştirmez; panel ayrı şerit gösterir)
 *   canonicalIds / mergeOrder / orderViews   KALICI sıra: tarifin yeri envantere, istasyona, açılışa bağlı değildir
 *   craftableFirstSnapshot / craftableSnapshot   "Yapılabilir önce" / "Yapılabilirler": yalnız düğmeye basılan anın görüntüsü
 *
 * Tarif görünümleri panelUtils.recipeView çıktısıdır.
 */
import { STATION_LABELS, itemName } from './panelUtils.js';

export const STATION_ORDER = Object.freeze(['tezgah', 'ocak', 'örs', 'kesici', 'dokuma', 'laboratuvar']);

/** İstasyon bloğu adı ve nasıl edinileceği (kısa, Türkçe). */
export const STATION_HELP = Object.freeze({
  tezgah: { block: 'Üretim Tezgahı', how: '4 Meşe Tahta ile yap (elle), sonra yere koy' },
  ocak: { block: 'Ocak', how: 'Tezgahta 8 Kırık Taş ile yap, yere koy; yakıt olarak kömür ya da kütük kullan' },
  örs: { block: 'Demir Bloğu', how: 'Tezgahta 9 Demir Külçe ile yap, yere koy; elmas ve kuantum üretimi için gerekir' },
  kesici: { block: 'Taş Kesici', how: 'Tezgahta 3 Taş ve 1 Bakır Külçe ile yap, yere koy' },
  dokuma: { block: 'Dokuma Tezgahı', how: 'Tezgahta 2 İp ve 2 Meşe Tahta ile yap, yere koy' },
  laboratuvar: { block: 'Teknoloji Laboratuvarı', how: 'Tezgahta 6 Demir Külçe, 2 Devre Kartı, 2 Çelik Levha ve 2 Cam ile yap, yere koy' },
});

export function stationChips(stations) {
  const st = Array.isArray(stations) ? stations : [];
  return STATION_ORDER.map((key) => {
    const on = st.indexOf(key) >= 0;
    const info = STATION_HELP[key];
    return {
      key,
      label: STATION_LABELS[key] || key,
      block: info.block,
      on,
      text: on ? `${STATION_LABELS[key]} yakınında` : `${STATION_LABELS[key]} yok`,
      help: on ? `${info.block} 4 blok içinde: bu istasyonun tarifleri açık.` : `${info.block}: ${info.how}.`,
    };
  });
}

/** Satır altı "eksik" metni (renk körlüğü: ayrıca sözcük). */
export function missingLine(v) {
  if (!v || v.craftable) return '';
  const parts = [];
  if (!v.stationOk) parts.push(`${STATION_LABELS[v.station] || v.station} yakınında olmalı`);
  const miss = (v.in || []).filter((p) => !p.ok);
  if (miss.length) parts.push('Eksik: ' + miss.map((p) => `${p.count - p.have} ${p.name}`).join(', '));
  if (!parts.length && v.reason) parts.push(v.reason);
  return parts.join(' · ');
}

export function searchHaystack(v) {
  return v.outName + ' ' + (v.in || []).map((p) => p.name).join(' ');
}

/* ------------------------------------------------------------------------------------------------
 * Başlangıç rehberi: envantere ve yakın istasyonlara bakıp bir sonraki adımı söyler.
 * ---------------------------------------------------------------------------------------------- */
const LOGS = ['meşe', 'huş', 'çam', 'akasya'].map((w) => ({ w, log: `blok:${w}_kütük`, plank: `blok:${w}_tahta` }));
const PICKS = ['ahşap', 'taş', 'bakır', 'demir', 'altın', 'elmas', 'kuantum'].map((t) => `item:kazma_${t}`);
const COBBLE = 'blok:kırıktaş';

function counter(inv) {
  const map = {};
  ((inv && inv.slots) || []).forEach((s) => {
    if (s && s.item && s.count > 0) map[s.item] = (map[s.item] || 0) + s.count;
  });
  return (k) => map[k] || 0;
}

/**
 * → {key, text, recipeId?, tab?} | null (temel zincir tamamsa null).
 * Zincir: kütük → tahta → tezgah (üret) → tezgahı koy → sopa → ahşap kazma → ocak.
 */
export function craftGuide(inv, stations) {
  const n = counter(inv);
  const st = Array.isArray(stations) ? stations : [];
  const hasBench = st.indexOf('tezgah') >= 0;
  const hasFurnace = st.indexOf('ocak') >= 0;
  const logOwned = LOGS.find((l) => n(l.log) > 0);
  const planksTotal = LOGS.reduce((a, l) => a + n(l.plank), 0);
  const oak = n('blok:meşe_tahta');
  const benchItem = n('blok:tezgah');
  const anyPick = PICKS.some((k) => n(k) > 0);

  if (!hasBench && benchItem === 0) {
    if (oak >= 4) return { key: 'tezgah', text: 'Tezgah yap: 4 Meşe Tahta yeter. Elle üretilir.', recipeId: 'tezgah' };
    if (planksTotal >= 4) {
      const other = LOGS.find((l) => l.w !== 'meşe' && n(l.plank) > 0);
      return {
        key: 'çevir', text: 'Tezgah için Meşe Tahta gerekir: elindeki tahtayı meşeye çevir.', recipeId: other ? `tahta_çevir_${other.w}` : 'tahta_meşe',
      };
    }
    if (logOwned) return { key: 'tahta', text: 'Kütükten tahta üret: bir kütük dört tahta eder.', recipeId: `tahta_${logOwned.w}` };
    if (planksTotal === 0 && n('item:sopa') === 0) {
      return { key: 'kütük', text: 'Önce odun topla: bir ağaca yaklaş ve kır düğmesini (sol tık) basılı tut.' };
    }
    return { key: 'tahta-topla', text: 'Tezgah için 4 Meşe Tahta lazım. Biraz daha kütük topla ve tahtaya çevir.' };
  }
  if (!hasBench && benchItem > 0) {
    return { key: 'tezgah-koy', text: 'Tezgahı hızlı çubuktan seç ve yere koy (sağ tık). Yanındayken tezgah tarifleri açılır.' };
  }
  if (hasBench && !anyPick) {
    if (n('item:sopa') < 2) return { key: 'sopa', text: 'Sopa üret: iki tahtadan dört sopa. Kazma için sopa gerekir.', recipeId: 'sopa' };
    if (oak >= 3) return { key: 'kazma', text: 'Ahşap Kazma yap: 3 tahta ve 2 sopa. Taşı kazmayla kırarsın.', recipeId: 'kazma_ahşap' };
    return { key: 'kazma-tahta', text: 'Ahşap Kazma için 3 Meşe Tahta ve 2 sopa lazım. Biraz daha tahta üret.' };
  }
  if (hasBench && n(COBBLE) >= 8 && !hasFurnace && n('blok:ocak') === 0) {
    return { key: 'ocak', text: 'Ocak yap: 8 Kırık Taş. Cevherleri eritmek ve yemek pişirmek için gerekir.', recipeId: 'ocak' };
  }
  if (n('blok:ocak') > 0 && !hasFurnace) {
    return { key: 'ocak-koy', text: 'Ocağı yere koy ve yanına geç; Ocak sekmesinde eritme tarifleri açılır.' };
  }
  return null;
}

/** Sabitlenen tarifleri öne alır (kararlı); pins: tarif kimlikleri. */
export function pinnedFirst(views, pins) {
  const set = new Set(pins || []);
  if (!set.size) return views;
  const a = [];
  const b = [];
  views.forEach((v) => (set.has(v.id) ? a : b).push(v));
  return a.concat(b);
}

export const PIN_KEY = 'kesif.craft.pins';

/** Başarı iletisi: 'Meşe Tahta ×4 üretildi' (adet = tarif çıktısı × kez). */
export function craftedMessage(view, times) {
  const total = (view.out.count || 1) * Math.max(1, times || 1);
  return `${itemName(view.out.item)}${total > 1 ? ' ×' + total : ''} üretildi`;
}

/* ------------------------------------------------------------------------------------------------
 * Kalıcı sıra. Tarif listesi ASLA envantere, istasyon yakınlığına, "yapılabilir" durumuna ya da yeni açılan tariflere göre
 * yeniden dizilmez. Sıra = motorun SABİT ilerleme sırası (tahta, sopa, tezgah, ocak, aletler…; sekmeler yalnız süzer);
 * bir kez görülen kimliğin yeri kalıcıdır, sonradan gelen kimlikler sona eklenir (araya girip komşuları kaydırmaz).
 * ---------------------------------------------------------------------------------------------- */
/** Kanonik dizilim (kimlikler): girdi sırası. */
export function canonicalIds(views) {
  return (views || []).map((v) => v.id);
}

/**
 * Görülmüş kimlik sırasını (prev) yeni görünümlerle birleştirir. Yeni kimlik yoksa AYNI diziyi döner (referans sabit).
 * Kaybolan kimlik sırada kalır (geri gelirse eski yerine oturur).
 */
export function mergeOrder(prev, views) {
  const base = prev || [];
  const seen = new Set(base);
  const fresh = (views || []).filter((v) => !seen.has(v.id));
  if (!fresh.length) return base;
  return base.concat(canonicalIds(fresh));
}

/**
 * Görünümleri kalıcı sıraya dizer. snapshot (kimlik dizisi) verilirse önce onun sırası, ardından kalıcı sıra kullanılır.
 * Saf: girdi dizisini değiştirmez.
 */
export function orderViews(views, order, snapshot) {
  const rank = new Map();
  (order || []).forEach((id, i) => rank.set(id, i));
  const snap = new Map();
  (snapshot || []).forEach((id, i) => snap.set(id, i));
  const big = 1e9;
  const key = (v) => (snap.has(v.id) ? snap.get(v.id) : big + (rank.has(v.id) ? rank.get(v.id) : big));
  return (views || [])
    .map((v, i) => ({ v, k: key(v), i }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.v);
}

/** "Yapılabilir önce" anlık görüntüsü: o anki kalıcı sıradan yapılabilirler, sonra istasyonu uygunlar, sonra kalanlar (kararlı). */
export function craftableFirstSnapshot(views, order) {
  const rank = (v) => (v.craftable ? 0 : v.stationOk ? 1 : 2);
  return orderViews(views, order, null)
    .map((v, i) => ({ v, i }))
    .sort((a, b) => rank(a.v) - rank(b.v) || a.i - b.i)
    .map((x) => x.v.id);
}

/** "Yapılabilirler" anlık görüntüsü: düğmeye basıldığı anda yapılabilir olan tariflerin kimlikleri. */
export function craftableSnapshot(views) {
  return new Set((views || []).filter((v) => v.craftable).map((v) => v.id));
}
