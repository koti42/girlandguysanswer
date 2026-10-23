import { describe, expect, it } from 'vitest';
import {
  BANNER_SETS, ZONE_TAGLINES, bannerForEvent, createBannerQueue, createHintQueue,
} from './sessionBanner.js';

function clock() {
  const c = { t: 1000, now: () => c.t, adv(ms) { c.t += ms; } };
  return c;
}

describe('banner kuyruğu', () => {
  it('sırayla gösterir; süre dolunca sonrakine geçer (boşluk sonrası)', () => {
    const c = clock();
    const q = createBannerQueue({ now: c.now, gapMs: 300 });
    q.push({ text: 'A', duration: 1000, priority: 3 });
    q.push({ text: 'B', duration: 1000, priority: 3 });
    expect(q.update().text).toBe('A');
    c.adv(999);
    expect(q.update().text).toBe('A');
    c.adv(2);
    expect(q.update()).toBe(null); // boşluk
    c.adv(300);
    expect(q.update().text).toBe('B');
    c.adv(1001);
    expect(q.update()).toBe(null);
    expect(q.size).toBe(0);
  });

  it('kuyruk önceliğe göre sıralanır (eşitte giriş sırası)', () => {
    const c = clock();
    const q = createBannerQueue({ now: c.now, gapMs: 0 });
    q.push({ text: 'gösterilen', priority: 9, duration: 500 });
    expect(q.update().text).toBe('gösterilen');
    q.push({ text: 'düşük', priority: 1, duration: 500 });
    q.push({ text: 'orta', priority: 3, duration: 500 });
    q.push({ text: 'yüksek', priority: 4, duration: 500 });
    q.push({ text: 'orta2', priority: 3, duration: 500 });
    const order = [];
    for (let i = 0; i < 6; i++) {
      c.adv(501);
      const v = q.update();
      if (v) order.push(v.text);
    }
    expect(order).toEqual(['yüksek', 'orta', 'orta2', 'düşük']);
  });

  it('yüksek öncelik gösterileni keser; öncelik >= 4 ve yarısı dolmadıysa geri döner', () => {
    const c = clock();
    const q = createBannerQueue({ now: c.now, gapMs: 0 });
    q.push({ text: 'bölge', priority: 4, duration: 4000, key: 'z' });
    expect(q.update().text).toBe('bölge');
    c.adv(500);
    q.push({ text: 'MÜHÜR', priority: 7, duration: 2000, key: 'u' });
    expect(q.update().text).toBe('MÜHÜR');
    c.adv(2001);
    expect(q.update().text).toBe('bölge');
  });

  it('düşük öncelikli kesilen duyuru geri dönmez', () => {
    const c = clock();
    const q = createBannerQueue({ now: c.now, gapMs: 0 });
    q.push({ text: 'ufak', priority: 2, duration: 4000 });
    q.update();
    c.adv(100);
    q.push({ text: 'büyük', priority: 6, duration: 1000 });
    expect(q.update().text).toBe('büyük');
    c.adv(1001);
    expect(q.update()).toBe(null);
  });

  it('aynı anahtar/metin tekrarı atılır; 4 sn içinde yeniden gösterilmez', () => {
    const c = clock();
    const q = createBannerQueue({ now: c.now, gapMs: 0 });
    expect(q.push({ text: 'X', key: 'k', duration: 500 })).toBe(true);
    expect(q.push({ text: 'X', key: 'k', duration: 500 })).toBe(false);
    q.update();
    expect(q.push({ text: 'X2', key: 'k', duration: 500 })).toBe(false);
    c.adv(600);
    q.update();
    c.adv(1000);
    expect(q.push({ text: 'X', key: 'k', duration: 500 })).toBe(false); // 4 sn dolmadı
    c.adv(4000);
    expect(q.push({ text: 'X', key: 'k', duration: 500 })).toBe(true);
    expect(q.push({ text: 'düz', sub: 's' })).toBe(true);
    expect(q.push({ text: 'düz', sub: 's' })).toBe(false);
  });

  it('kuyruk sınırı: en düşük öncelikli en eski atılır; geçersiz girdi reddedilir', () => {
    const c = clock();
    const q = createBannerQueue({ now: c.now, max: 3, gapMs: 0 });
    q.push({ text: 'g', priority: 9 });
    q.update();
    q.push({ text: 'a', priority: 1 });
    q.push({ text: 'b', priority: 5 });
    q.push({ text: 'c', priority: 4 });
    q.push({ text: 'd', priority: 3 });
    expect(q.size).toBe(4); // 1 gösterilen + 3 bekleyen
    expect(q.push(null)).toBe(false);
    expect(q.push({ text: '' })).toBe(false);
    expect(q.push({ sub: 'x' })).toBe(false);
  });

  it('görünüm nesnesi kararlıdır ve until içerir', () => {
    const c = clock();
    const q = createBannerQueue({ now: c.now });
    q.push({ text: 'A', sub: 'alt', duration: 2000 });
    const v1 = q.update();
    const v2 = q.update();
    expect(v1).toBe(v2);
    expect(v1).toEqual({ text: 'A', sub: 'alt', until: 3000 });
    q.clear();
    expect(q.update()).toBe(null);
  });
});

describe('ipucu kuyruğu', () => {
  it('en yüksek öncelikli, süresi dolmamış ipucunu verir', () => {
    const c = clock();
    const h = createHintQueue({ now: c.now });
    h.push({ text: 'düşük', priority: 1, ttl: 5000 });
    h.push({ text: 'yüksek', priority: 3, ttl: 1000 });
    expect(h.text()).toBe('yüksek');
    c.adv(1500);
    expect(h.text()).toBe('düşük');
    c.adv(4000);
    expect(h.text()).toBe(null);
    expect(h.size).toBe(0);
  });

  it('cooldown: aynı anahtar bekleme dolmadan eklenmez; aynı anahtar yenilenir', () => {
    const c = clock();
    const h = createHintQueue({ now: c.now });
    expect(h.push({ text: 'a', key: 'k', cooldown: 10000, ttl: 1000 })).toBe(true);
    c.adv(2000);
    expect(h.push({ text: 'a2', key: 'k', cooldown: 10000 })).toBe(false);
    c.adv(9000);
    expect(h.push({ text: 'a3', key: 'k', cooldown: 10000, ttl: 1000 })).toBe(true);
    expect(h.text()).toBe('a3');
    h.push({ text: 'yenilendi', key: 'k', ttl: 5000 });
    expect(h.size).toBe(1);
    expect(h.text()).toBe('yenilendi');
    h.clear('k');
    expect(h.text()).toBe(null);
  });
});

describe('olay → duyuru', () => {
  it('büyük duyuru kümesi: bölge, mühür, boss, yetenek', () => {
    expect(bannerForEvent({ type: 'zoneEnter', zone: 1, name: 'Fısıldayan Ormanlar' })).toMatchObject({
      text: 'Fısıldayan Ormanlar', sub: ZONE_TAGLINES[1], priority: 4,
    });
    expect(bannerForEvent({ type: 'zoneUnlocked', zone: 2, name: 'Yanık Kanyonlar' })).toMatchObject({ text: 'Mühür kırıldı', sub: 'Yanık Kanyonlar artık açık' });
    const boss = bannerForEvent({ type: 'bossDefeated', zone: 1 });
    expect(boss.text).toMatch(/yenildi$/);
    expect(boss.priority).toBe(7);
    expect(bannerForEvent({ type: 'ability', key: 'grapple', name: 'Kanca', desc: 'Sallan.' }).sub).toBe('Kanca · Sallan.');
    expect(bannerForEvent({ type: 'bossDoor', zone: 1 }).text).toMatch(/Boss kapısı/);
    expect(bannerForEvent({ type: 'victory' }).priority).toBe(9);
  });

  it('küçük olaylar yalnızca "all" kümesinde', () => {
    const evts = [
      { type: 'puzzleSolved', id: 'p1', puzzleType: 'terazi' },
      { type: 'achievement', id: 'a', title: 'İlk adım', desc: 'Bir blok kır' },
      { type: 'discover', kind: 'biome', id: 'orman', name: 'Orman' },
      { type: 'crystal', zone: 1, id: 'c', count: 2, required: 3 },
      { type: 'questUpdate', id: 'q', title: 'Odun topla', state: 'done' },
    ];
    evts.forEach((e) => {
      expect(bannerForEvent(e)).toBe(null);
      expect(bannerForEvent(e, { set: 'all' })).not.toBe(null);
    });
    expect(bannerForEvent({ type: 'puzzleSolved', id: 'p1', puzzleType: 'terazi' }, { set: 'all' }).sub).toBe('Terazi');
    expect(bannerForEvent({ type: 'crystal', zone: 1, id: 'c', count: 2, required: 3 }, { set: 'all' }).sub).toBe('2 / 3 toplandı');
    expect(bannerForEvent({ type: 'questUpdate', id: 'q', title: 'Odun topla', state: 'active' }, { set: 'all' })).toBe(null);
  });

  it('bilinmeyen/bozuk olaylar null', () => {
    expect(bannerForEvent(null)).toBe(null);
    expect(bannerForEvent({})).toBe(null);
    expect(bannerForEvent({ type: 'inventoryChanged' })).toBe(null);
    expect(bannerForEvent({ type: 'zoneEnter', zone: 99 })).toBe(null);
    expect(bannerForEvent({ type: 'discover', name: '' }, { set: 'all' })).toBe(null);
  });

  it('parkur: yalnızca ilk bitirme ya da rekor', () => {
    expect(bannerForEvent({ type: 'parkourRecord', id: 'k1', tier: 2, ms: 31500, best: 31500, first: true })).toMatchObject({ text: 'Parkur tamamlandı', sub: 'Gümüş · 31,50 sn' });
    expect(bannerForEvent({ type: 'parkourRecord', id: 'k1', tier: 2, ms: 28000, best: 28000, first: false }).text).toBe('Yeni rekor');
    expect(bannerForEvent({ type: 'parkourRecord', id: 'k1', tier: 2, ms: 40000, best: 28000, first: false })).toBe(null);
  });

  it('kümeler tutarlı: all ⊇ major', () => {
    Object.keys(BANNER_SETS.major).forEach((k) => expect(BANNER_SETS.all[k]).toBe(1));
  });
});
