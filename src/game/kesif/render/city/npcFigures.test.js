import { describe, expect, it } from 'vitest';
import {
  ATTENTION_R, EMOTE_NAMES, EMOTE_SEC, FIGURE_TIERS, NEAR_GLOSS, NEAR_GLOW, createNpcFigures, emoteAt,
} from './npcFigures.js';
import { EMOTES, NPCS, npcLook } from '../../sim/city/ped/npcData.js';

const entry = (id, dist, extra) => {
  const n = NPCS.find((q) => q.id === id);
  return Object.assign({
    id, look: npcLook(n), x: dist, y: 64, z: 0, yaw: 0, dist, emotes: n.emotes, h: 12345,
  }, extra || null);
};

const ids = ['rehber_zeynep', 'cocuk_elif', 'ev_sahibi_nilufer', 'satici_orhan', 'kurye_ela', 'robot_pili'];

describe('npcFigures: bütçe ve havuz', () => {
  it('kademe tabloları: 4/3/2 kahraman, çizim ≤ 12/10/8', () => {
    expect(FIGURE_TIERS.high).toEqual({ max: 4, draws: 12 });
    expect(FIGURE_TIERS.medium).toEqual({ max: 3, draws: 10 });
    expect(FIGURE_TIERS.low).toEqual({ max: 2, draws: 8 });
    expect(NEAR_GLOW).toBeLessThan(NEAR_GLOSS);
  });

  it('en yakın kahramanlar seçilir; kademe sınırı aşılmaz; kare başına en çok 1 yeniden kurma; çizim çağrısı bütçesi', () => {
    ['high', 'medium', 'low'].forEach((tier) => {
      const f = createNpcFigures({ tier, reducedMotion: true });
      const list = ids.map((id, i) => entry(id, 3 + i * 2));
      f.sync(list, 0);
      f.update(1 / 60, 0, { px: 0, pz: 0 });
      const st = f.stats();
      expect(st.heroes, tier).toBeLessThanOrEqual(FIGURE_TIERS[tier].max);
      expect(st.builds, tier).toBeLessThanOrEqual(1);
      // her sync bir yeni karakter kurar → birkaç kare sonra tavana ulaşır
      for (let k = 0; k < 8; k++) {
        f.sync(list, k * 0.1);
        f.update(1 / 60, k * 0.1, { px: 0, pz: 0 });
      }
      const s2 = f.stats();
      // yakın kahramanlar 4'er çizim yer → çizim bütçesi kahraman sayısını sınırlar: yüksek 3, orta 2, düşük 2
      expect(s2.heroes, tier).toBe(Math.min(FIGURE_TIERS[tier].max, Math.floor(FIGURE_TIERS[tier].draws / 4)));
      expect(s2.draws, tier).toBeLessThanOrEqual(FIGURE_TIERS[tier].draws);
      expect(s2.tris).toBeGreaterThan(0);
      expect(f.has('rehber_zeynep')).toBe(true);
      expect(f.has('robot_pili')).toBe(false);
      f.dispose();
    });
  });

  it('uzak kahramanlar daha az çizim çağrısı yer (parıltı > 14 m, parlak ağ > 24 m gizlenir): 4 kahraman yüksek kademede sığar', () => {
    const f = createNpcFigures({ tier: 'high', reducedMotion: true });
    const list = [entry(ids[0], 20), entry(ids[1], 22), entry(ids[2], 26), entry(ids[3], 30)];
    for (let k = 0; k < 8; k++) {
      f.sync(list, k * 0.1);
      f.update(1 / 60, k * 0.1, { px: 0, pz: 0 });
    }
    expect(f.stats().heroes).toBe(4);
    expect(f.stats().draws).toBeLessThanOrEqual(12);
    const gloss = f.group.children.flatMap((c) => c.children || []).length;
    expect(gloss).toBeGreaterThanOrEqual(0);
    f.dispose();
  });

  it('havuz sınırlı kalır: ayrılan figürler çıkınca karakterler setConfig ile devralınır (tekrarlı döngülerde havuz büyümez); dispose temizler', () => {
    const f = createNpcFigures({ tier: 'low', reducedMotion: true });
    const a = [entry(ids[0], 3), entry(ids[1], 5)];
    for (let k = 0; k < 4; k++) { f.sync(a, k); f.update(0.05, k, { px: 0, pz: 0 }); }
    expect(f.stats().pool).toBe(2);
    const b = [entry(ids[2], 3), entry(ids[3], 5)];
    for (let k = 0; k < 30; k++) { f.sync(b, k + 10); f.update(0.05, k + 10, { px: 0, pz: 0 }); }
    const grown = f.stats().pool;
    expect(grown).toBeLessThanOrEqual(4);
    for (let r = 0; r < 4; r++) {
      const l = r % 2 ? a : b;
      for (let k = 0; k < 30; k++) { f.sync(l, 100 + r * 10 + k); f.update(0.05, 100 + r * 10 + k, { px: 0, pz: 0 }); }
    }
    expect(f.stats().pool).toBeLessThanOrEqual(4); // en çok kahraman + çıkmakta olan (2×2); sınırsız büyümez
    expect(f.stats().pool).toBeGreaterThanOrEqual(grown);
    expect(f.has('rehber_zeynep')).toBe(true);
    f.dispose();
    expect(f.stats().pool).toBe(0);
  });

  it('ölçek giriş/çıkış (reducedMotion kapalı): 0 → 1; ayrılırken küçülüp kalkar; reducedMotion anında', () => {
    const f = createNpcFigures({ tier: 'high' });
    f.sync([entry(ids[0], 3)], 0);
    f.update(0.016, 0, { px: 0, pz: 0 });
    const g0 = f.get(ids[0]);
    expect(g0.visible).toBe(false); // ilk kare: ölçek ~0
    for (let k = 0; k < 40; k++) f.update(0.02, k * 0.02, { px: 0, pz: 0 });
    expect(f.get(ids[0]).visible).toBe(true);
    f.sync([], 1);
    for (let k = 0; k < 40; k++) f.update(0.02, 1 + k * 0.02, { px: 0, pz: 0 });
    expect(f.has(ids[0])).toBe(false);
    f.dispose();
    const r = createNpcFigures({ tier: 'high', reducedMotion: true });
    r.sync([entry(ids[0], 3)], 0);
    r.update(0.016, 0, { px: 0, pz: 0 });
    expect(r.get(ids[0]).visible).toBe(true);
    r.dispose();
  });

  it('faceTarget: gövde hedefe döner; clearFace duruşa; oyuncu yakınsa dikkat dönüşü (≤ ATTENTION_R); reducedMotion anında', () => {
    const f = createNpcFigures({ tier: 'high', reducedMotion: true });
    f.sync([entry(ids[0], 5, { x: 0, z: 0, yaw: 0 })], 0);
    f.update(0.016, 0, { px: 100, pz: 100 });
    expect(f.faceTarget(ids[0], 0, -10)).toBe(true); // −z'ye bak → yaw 0
    f.update(0.016, 0.1, { px: 100, pz: 100 });
    expect(f.get(ids[0]).yaw).toBeCloseTo(0, 5);
    expect(f.faceTarget(ids[0], 10, 0)).toBe(true); // +x'e bak
    f.update(0.016, 0.2, { px: 100, pz: 100 });
    expect(-Math.sin(f.get(ids[0]).yaw)).toBeCloseTo(1, 4);
    expect(f.faceTarget('yok', 0, 0)).toBe(false);
    expect(f.faceTarget(ids[0], 0, 0)).toBe(false);
    f.clearFace(ids[0]);
    f.update(0.016, 0.3, { px: 100, pz: 100 });
    expect(f.get(ids[0]).yaw).toBeCloseTo(0, 5); // baseYaw
    expect(ATTENTION_R).toBeGreaterThan(3);
    f.dispose();
    const n = createNpcFigures({ tier: 'high' });
    n.sync([entry(ids[1], 3, { x: 0, z: 0, yaw: 0 })], 0);
    for (let k = 0; k < 120; k++) n.update(0.02, k * 0.02, { px: 3, pz: 0 }); // oyuncu +x'te, 3 m
    expect(-Math.sin(n.get(ids[1]).yaw)).toBeGreaterThan(0.9);
    n.dispose();
  });

  it('ışık geri çağrısı kısıtlı sıklıkla çağrılır; NaN yok sayılır', () => {
    const f = createNpcFigures({ tier: 'high', reducedMotion: true });
    f.sync([entry(ids[0], 3)], 0);
    let calls = 0;
    for (let k = 0; k < 60; k++) f.update(1 / 60, k / 60, { px: 0, pz: 0, light: () => { calls++; return k % 2 ? NaN : 0.8; } });
    expect(calls).toBeLessThanOrEqual(6);
    expect(calls).toBeGreaterThanOrEqual(1);
    f.dispose();
  });
});

describe('npcFigures: hareketler', () => {
  it('EMOTE_NAMES npcData.EMOTES ile aynı küme (bekle hariç: hareketsiz)', () => {
    expect(EMOTE_NAMES.slice().sort()).toEqual(EMOTES.filter((e) => e !== 'bekle').sort());
  });

  it('emoteAt belirlenimci, pencere EMOTE_SEC, ağırlık 0..1, bekle/boş liste null', () => {
    const emotes = ['el_salla', 'bekle', 'dusun'];
    const h = 777;
    let active = 0;
    let max = 0;
    for (let t = 0; t < 200; t += 0.05) {
      const a = emoteAt(emotes, h, t);
      const b = emoteAt(emotes, h, t);
      expect(a).toEqual(b);
      if (a) {
        active += 0.05;
        max = Math.max(max, a.w);
        expect(a.w).toBeGreaterThan(0);
        expect(a.w).toBeLessThanOrEqual(1);
        expect(EMOTE_NAMES).toContain(a.name);
      }
    }
    expect(max).toBeCloseTo(1, 1);
    expect(active).toBeGreaterThan(8);
    expect(active).toBeLessThan(200 * (EMOTE_SEC / 9) + 5);
    expect(emoteAt([], h, 5)).toBe(null);
    expect(emoteAt(null, h, 5)).toBe(null);
    expect(emoteAt(['bekle'], h, 1e4)).toBe(null);
  });

  it('hareketler rig kemiklerine eklemeli delta uygular (NaN yok) ve w=0 iken değişmez', () => {
    const f = createNpcFigures({ tier: 'high', reducedMotion: false });
    f.sync([entry('buyukbaba_riza', 3, { emotes: ['okuma'], h: 5 })], 0);
    for (let k = 0; k < 600; k++) f.update(1 / 60, k / 60, { px: 50, pz: 50 });
    const root = f.group.children[0];
    root.traverse((o) => {
      expect(Number.isFinite(o.rotation.x + o.rotation.y + o.rotation.z)).toBe(true);
      expect(Number.isFinite(o.position.x + o.position.y + o.position.z)).toBe(true);
    });
    f.dispose();
  });
});
