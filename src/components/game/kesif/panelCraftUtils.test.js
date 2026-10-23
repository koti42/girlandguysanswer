import { describe, expect, it } from 'vitest';
import { recipeView } from './panelUtils.js';
import {
  STATION_HELP, STATION_ORDER, canonicalIds, craftGuide, craftableFirstSnapshot, craftableSnapshot, craftedMessage, mergeOrder, missingLine,
  orderViews, pinnedFirst, stationChips,
} from './panelCraftUtils.js';
import { RECIPES, STATIONS } from '../../../game/kesif/sim/items.js';

const inv = (obj) => ({
  slots: Object.keys(obj).map((k) => ({ item: k, count: obj[k] })),
});
const row = (id, have) => {
  const r = RECIPES.find((x) => x.id === id);
  return {
    id: r.id, out: r.out, station: r.station, category: r.category, craftable: true,
    in: r.in.map((p) => ({ item: p.item, count: p.count, have: have[p.item] || 0 })),
  };
};

describe('istasyon göstergeleri', () => {
  it('her crafting istasyonu için yardım metni var; sıra sabit', () => {
    STATIONS.filter((s) => s !== 'el').forEach((s) => {
      expect(STATION_ORDER).toContain(s);
      expect(STATION_HELP[s].block.length).toBeGreaterThan(3);
      expect(STATION_HELP[s].how.length).toBeGreaterThan(10);
    });
    expect(STATION_ORDER).toEqual(['tezgah', 'ocak', 'örs', 'kesici', 'dokuma', 'laboratuvar']);
  });

  it('yakında / yok metinleri ve ipucu', () => {
    const chips = stationChips(['el', 'tezgah', 'kesici']);
    const by = (k) => chips.find((c) => c.key === k);
    expect(by('tezgah').on).toBe(true);
    expect(by('tezgah').text).toBe('Tezgah yakınında');
    expect(by('ocak').on).toBe(false);
    expect(by('ocak').text).toBe('Ocak yok');
    expect(by('ocak').help).toContain('8 Kırık Taş');
    expect(by('kesici').text).toBe('Taş Kesici yakınında');
    expect(by('dokuma').help).toContain('Dokuma Tezgahı');
    expect(by('laboratuvar').text).toBe('Laboratuvar yok');
    expect(by('laboratuvar').help).toContain('Teknoloji Laboratuvarı');
    expect(stationChips(null).every((c) => !c.on)).toBe(true);
  });
});

describe('eksik satırı', () => {
  it('malzeme ve istasyon eksikleri sayı ve adla yazılır', () => {
    const v = recipeView(row('kazma_taş', { 'item:sopa': 2, 'blok:kırıktaş': 1 }), ['el'], null);
    expect(missingLine(v)).toBe('Tezgah yakınında olmalı · Eksik: 2 Kırık Taş');
    const w = recipeView(row('sopa', { 'blok:meşe_tahta': 1 }), ['el'], null);
    expect(missingLine(w)).toBe('Eksik: 1 Meşe Tahta');
    const ok = recipeView(row('sopa', { 'blok:meşe_tahta': 4 }), ['el'], null);
    expect(missingLine(ok)).toBe('');
    expect(missingLine(null)).toBe('');
  });
});

describe('başlangıç rehberi (craftGuide)', () => {
  const el = ['el'];
  const bench = ['el', 'tezgah'];
  it('boş çantada önce ağaç kırmayı söyler', () => {
    expect(craftGuide(inv({}), el).key).toBe('kütük');
    expect(craftGuide(inv({}), el).recipeId).toBeUndefined();
  });
  it('kütük varsa o türün tahta tarifini gösterir', () => {
    const g = craftGuide(inv({ 'blok:huş_kütük': 2 }), el);
    expect(g).toMatchObject({ key: 'tahta', recipeId: 'tahta_huş' });
  });
  it('4 meşe tahta → tezgah; başka tür tahta → meşeye çevir', () => {
    expect(craftGuide(inv({ 'blok:meşe_tahta': 4 }), el)).toMatchObject({ key: 'tezgah', recipeId: 'tezgah' });
    expect(craftGuide(inv({ 'blok:çam_tahta': 5 }), el)).toMatchObject({ key: 'çevir', recipeId: 'tahta_çevir_çam' });
    expect(craftGuide(inv({ 'blok:meşe_tahta': 2 }), el).key).toBe('tahta-topla');
  });
  it('tezgah eşyası varsa yere koymayı söyler', () => {
    expect(craftGuide(inv({ 'blok:tezgah': 1 }), el).key).toBe('tezgah-koy');
  });
  it('tezgah yanındayken sopa, sonra kazma, sonra ocak; zincir bitince null', () => {
    expect(craftGuide(inv({ 'blok:meşe_tahta': 6 }), bench)).toMatchObject({ key: 'sopa', recipeId: 'sopa' });
    expect(craftGuide(inv({ 'blok:meşe_tahta': 6, 'item:sopa': 4 }), bench)).toMatchObject({ key: 'kazma', recipeId: 'kazma_ahşap' });
    expect(craftGuide(inv({ 'blok:meşe_tahta': 1, 'item:sopa': 4 }), bench).key).toBe('kazma-tahta');
    expect(craftGuide(inv({ 'item:kazma_ahşap': 1, 'blok:kırıktaş': 8 }), bench)).toMatchObject({ key: 'ocak', recipeId: 'ocak' });
    expect(craftGuide(inv({ 'item:kazma_ahşap': 1, 'blok:ocak': 1 }), bench).key).toBe('ocak-koy');
    expect(craftGuide(inv({ 'item:kazma_taş': 1 }), bench)).toBeNull();
    expect(craftGuide(null, null).key).toBe('kütük');
  });
  it('rehberin önerdiği tarif kimlikleri gerçek tariflerdir', () => {
    ['tezgah', 'tahta_meşe', 'tahta_huş', 'tahta_çam', 'tahta_akasya', 'tahta_çevir_huş', 'tahta_çevir_çam', 'tahta_çevir_akasya',
      'sopa', 'kazma_ahşap', 'ocak'].forEach((id) => expect(RECIPES.some((r) => r.id === id), id).toBe(true));
  });
});

describe('sabitleme ve ileti', () => {
  it('pinnedFirst sabitlenenleri öne alır, sırayı bozmaz', () => {
    const v = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(pinnedFirst(v, ['c', 'a']).map((x) => x.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(pinnedFirst(v, []).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(pinnedFirst(v, null)).toBe(v);
  });
  it('craftedMessage toplam adedi söyler', () => {
    expect(craftedMessage({ out: { item: 'blok:meşe_tahta', count: 4 } }, 2)).toBe('Meşe Tahta ×8 üretildi');
    expect(craftedMessage({ out: { item: 'blok:tezgah', count: 1 } }, 1)).toBe('Üretim Tezgahı üretildi');
  });
});

describe('kalıcı sıra (tarif yeri kaymaz)', () => {
  const mk = (id, extra) => Object.assign({ id, craftable: false, stationOk: true, tab: 'malzeme' }, extra || {});
  const ids = (a) => a.map((v) => v.id);

  it('canonicalIds girdi (motor ilerleme) sırasıdır', () => {
    expect(canonicalIds([mk('b'), mk('a'), mk('c')])).toEqual(['b', 'a', 'c']);
    expect(canonicalIds(null)).toEqual([]);
  });

  it('mergeOrder: yeni kimlik yoksa aynı dizi; yeniler SONA eklenir; kaybolan yerini korur', () => {
    const o1 = mergeOrder([], [mk('a'), mk('b'), mk('c')]);
    expect(o1).toEqual(['a', 'b', 'c']);
    expect(mergeOrder(o1, [mk('c'), mk('a'), mk('b')])).toBe(o1); // motor sırayı karıştırsa da ilk görülen kalır
    const o2 = mergeOrder(o1, [mk('a'), mk('x'), mk('b'), mk('c'), mk('y')]); // x, y "yeni açıldı", araya girmez
    expect(o2).toEqual(['a', 'b', 'c', 'x', 'y']);
    expect(mergeOrder(o2, [mk('a'), mk('c')])).toBe(o2); // b kayboldu: sıra aynı
    expect(mergeOrder(o2, [mk('c'), mk('b'), mk('a')])).toBe(o2); // b geri geldi: eski yerinde
  });

  it('orderViews: yapılabilirlik/envanter sırayı etkilemez; saf (girdiyi değiştirmez)', () => {
    const order = ['a', 'b', 'c', 'd'];
    const v1 = [mk('d', { craftable: true }), mk('c'), mk('a', { craftable: true }), mk('b')];
    const v2 = [mk('a'), mk('b', { craftable: true }), mk('c', { craftable: true }), mk('d')];
    expect(ids(orderViews(v1, order))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(orderViews(v2, order))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(v1)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('orderViews: bilinmeyen kimlikler sona, girdi sırasıyla', () => {
    expect(ids(orderViews([mk('z'), mk('b'), mk('y'), mk('a')], ['a', 'b']))).toEqual(['a', 'b', 'z', 'y']);
  });

  it('craftableFirstSnapshot: yalnız o anın görüntüsü; sonraki durum değişikliği sırayı oynatmaz', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    const now = [mk('a'), mk('b', { craftable: true }), mk('c', { stationOk: false }), mk('d', { craftable: true }), mk('e')];
    const snap = craftableFirstSnapshot(now, order);
    expect(snap).toEqual(['b', 'd', 'a', 'e', 'c']);
    // sonradan her şey değişir: sıra snapshot'a göre kalır
    const later = [mk('a', { craftable: true }), mk('b'), mk('c', { craftable: true }), mk('d'), mk('e', { craftable: true })];
    expect(ids(orderViews(later, order, snap))).toEqual(['b', 'd', 'a', 'e', 'c']);
    // snapshot'ta olmayan (sonradan gelen) kimlik sona
    expect(ids(orderViews(later.concat(mk('n')), order.concat('n'), snap))).toEqual(['b', 'd', 'a', 'e', 'c', 'n']);
  });

  it('craftableSnapshot: yapılabilir kimliklerin kümesi', () => {
    const s = craftableSnapshot([mk('a', { craftable: true }), mk('b'), mk('c', { craftable: true })]);
    expect(Array.from(s).sort()).toEqual(['a', 'c']);
    expect(craftableSnapshot(null).size).toBe(0);
  });
});
