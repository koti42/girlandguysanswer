/*
 * cosmetics.js denetleyicisi: yük → skin kümesi → tüketiciler; canlı değişim, sıfır tahsis tekrarı, low/kısıtlı hareket, bozuk girdi,
 * ve BELİRLENİMLİLİK: skin'li/skin'siz koşuda sim özetleri AYNI (kozmetik yalnız görsel; sim'e hiçbir yazma yok).
 */
import { describe, expect, it } from 'vitest';
import { KESIF } from '../../shop/designs/kesif.js';
import { cleanLoadout, createCosmetics, portalHex } from './cosmetics.js';
import { createTraffic, TICK } from '../sim/city/vehicle/trafficAI.js';
import { clearTrafficNetCache, trafficNet } from '../sim/city/vehicle/junctions.js';
import { clearNetCaches } from '../sim/city/roadNet.js';
import { clearCityPlanCaches } from '../sim/city/cityPlan.js';
import { citySeed } from '../sim/city/cityPlanTestKit.js';
import { makeCrowd } from '../sim/city/ped/crowdTestKit.js';
import { clearPedNavCache } from '../sim/city/ped/pedNav.js';
import { createFxTech } from './particleFxTech.js';
import { createScratch } from './particleFx.js';

const ALL = {
  portal: 'portal:altin-kapi', alet: 'alet:neon-serit', asa: 'asa:gokkusagi-isigi', jet: 'jet:yildiz-izi', arac: 'arac:holo-kristal', gecis: 'gecis:aurora-gecidi',
};

function fakeG(over) {
  const calls = [];
  const rec = (name) => (...a) => { calls.push([name, ...a]); };
  const G = {
    opts: { strictSystems: true },
    reducedMotion: false,
    accessibility: false,
    quality: { settings: { effTier: 'high', tier: 'high' } },
    body: { x: 1, y: 2, z: 3 },
    character: { setSkins: rec('char') },
    viewModel: { setSkins: rec('fp') },
    techVisuals: { backpack: { setSkins: rec('bp') }, portal: { setPalette: rec('portal') } },
    particles: { setSkin: rec('particles'), gecisBurst: rec('gecisBurst') },
    fx: (name, ...a) => { calls.push(['fx', name, ...a]); },
    ...over,
  };
  return { G, calls, count: (n) => calls.filter((c) => c[0] === n).length };
}

describe('cleanLoadout', () => {
  it('yalnız 6 yuva ve ≤64 karakterlik metinler; hiç görünüm yoksa/bozuksa null; zarf kabul', () => {
    expect(cleanLoadout(null)).toBeNull();
    expect(cleanLoadout('x')).toBeNull();
    expect(cleanLoadout({})).toBeNull();
    expect(cleanLoadout({ portal: 5, alet: {}, evil: 'portal:x' })).toBeNull();
    expect(cleanLoadout({ portal: 'a'.repeat(65) })).toBeNull();
    const c = cleanLoadout({ loadout: { portal: 'portal:nane-ferahi', alet: null, extra: 'x' } });
    expect(c).toEqual({ portal: 'portal:nane-ferahi', alet: null, asa: null, jet: null, arac: null, gecis: null });
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.keys(c)).toHaveLength(6);
  });
});

describe('denetleyici', () => {
  it('başlangıç yükü çözülür; set() tüketicilere iletir; aynı yük ikinci kez HİÇBİR şey yapmaz; kaldırma varsayılana döner', () => {
    const { G, calls, count } = fakeG();
    const c = createCosmetics(G, ALL);
    expect(c.skins.key).not.toBe('');
    c.apply();
    expect(count('char')).toBe(1);
    expect(count('fp')).toBe(1);
    expect(count('bp')).toBe(1);
    expect(count('portal')).toBe(1);
    expect(count('particles')).toBe(1);
    const n = calls.length;
    expect(c.set(ALL)).toBe(false); // aynı → değişmedi
    expect(c.set({ ...ALL })).toBe(false);
    expect(calls.length).toBe(n);
    // değişiklik
    expect(c.set({ ...ALL, portal: 'portal:nane-ferahi' })).toBe(true);
    expect(count('char')).toBe(2);
    expect(c.skins.portal.key).toBe('portal:nane-ferahi');
    // kaldırma
    expect(c.set(null)).toBe(true);
    expect(c.skins.key).toBe('');
    expect(c.loadout).toBeNull();
    const last = calls.filter((x) => x[0] === 'char').pop();
    expect(last[1]).toBeNull();
    expect(calls.filter((x) => x[0] === 'portal').pop()[1]).toBeNull();
    expect(c.set(undefined)).toBe(false);
  });

  it('bozuk/bilinmeyen girdiler sessizce varsayılan; istisna yok', () => {
    const { G } = fakeG();
    const c = createCosmetics(G, { portal: 'yok:yok', alet: 7, asa: {}, jet: '__proto__', arac: 'portal:nane-ferahi', gecis: '' });
    expect(c.skins.key).toBe('');
    [undefined, null, 1, 'x', [], { loadout: 3 }, { portal: ['a'] }].forEach((x) => expect(() => c.set(x)).not.toThrow());
    expect(c.skins.key).toBe('');
  });

  it('tüketici hata verirse (strictSystems kapalı) oyun düşmez', () => {
    const { G } = fakeG({ opts: {}, character: { setSkins() { throw new Error('boom'); } } });
    const c = createCosmetics(G, ALL);
    expect(() => c.apply()).not.toThrow();
    expect(() => c.set(null)).not.toThrow();
  });

  it('low kademe / kısıtlı hareket: tick() ton döngüsünü kapatır ve geri açar (yalnız anim değişince yeniden uygular)', () => {
    const { G, count } = fakeG();
    const c = createCosmetics(G, ALL);
    c.apply();
    expect(c.skins.anim).toBe(true);
    const n = count('char');
    c.tick();
    expect(count('char')).toBe(n); // değişiklik yok
    G.quality.settings.effTier = 'medium';
    c.tick();
    expect(count('char')).toBe(n); // medium: anim aynı
    G.quality.settings.effTier = 'low';
    c.tick();
    expect(c.skins.anim).toBe(false);
    expect(count('char')).toBe(n + 1);
    G.quality.settings.effTier = 'high';
    G.reducedMotion = true;
    c.tick();
    expect(c.skins.anim).toBe(false);
    expect(count('char')).toBe(n + 1); // low → reduced: anim yine kapalı, yeniden kurma yok
    G.reducedMotion = false;
    c.tick();
    expect(c.skins.anim).toBe(true);
    expect(count('char')).toBe(n + 2);
    G.accessibility = true;
    c.tick();
    expect(c.skins.anim).toBe(false);
  });

  it("arrive(): 'gecis' skin'i varsa varış/çıkış efekti; yoksa HİÇBİR şey (varsayılan oyun aynı)", () => {
    const { G, calls } = fakeG();
    const c = createCosmetics(G, { gecis: 'gecis:neon-dalga' });
    c.arrive(1);
    c.arrive(0);
    const fx = calls.filter((x) => x[0] === 'fx');
    expect(fx).toHaveLength(2);
    expect(fx[0][1]).toBe('gecisBurst');
    expect(fx[0][3]).toBe(1);
    expect(fx[1][3]).toBe(0);
    expect(fx[0][2]).toEqual({ x: 1, y: 2.1, z: 3 });
    c.set({ portal: 'portal:nane-ferahi' });
    const n = calls.length;
    c.arrive(1);
    expect(calls.length).toBe(n);
    // önizleme
    c.set({ gecis: 'gecis:yildiz-yagmuru' }, { preview: true });
    expect(calls.filter((x) => x[0] === 'fx').length).toBe(3);
    // G.body yoksa sessiz
    const g2 = fakeG({ body: null });
    expect(() => createCosmetics(g2.G, { gecis: 'gecis:neon-dalga' }).arrive(1)).not.toThrow();
    expect(g2.calls.filter((x) => x[0] === 'fx')).toHaveLength(0);
  });

  it('dispose sonrası set/tick/arrive etkisiz', () => {
    const { G, calls } = fakeG();
    const c = createCosmetics(G, ALL);
    c.dispose();
    const n = calls.length;
    expect(c.set(null)).toBe(false);
    c.tick();
    c.arrive(1);
    expect(calls.length).toBe(n);
    expect(c.skins.key).toBe('');
  });

  it('portalHex: skin yoksa eski sabitler, varsa skin renkleri', () => {
    expect(portalHex({}, 'mavi')).toBe(0x3a8fff);
    expect(portalHex({}, 'turuncu')).toBe(0xff9a3a);
    const { G } = fakeG();
    G.cosmetics = createCosmetics(G, { portal: 'portal:neon-sokak' });
    const d = KESIF.find((x) => x.id === 'portal:neon-sokak').skin;
    expect(portalHex(G, 'mavi')).toBe(parseInt(d.a.c.slice(1), 16));
    expect(portalHex(G, 'turuncu')).toBe(parseInt(d.b.c.slice(1), 16));
  });

  it('29 görünümün hepsi tek tek uygulanabilir ve her biri tüketicilere ulaşır', () => {
    const { G, count } = fakeG();
    const c = createCosmetics(G, null);
    KESIF.forEach((d) => { expect(c.set({ [d.kind]: d.id })).toBe(true); expect(c.skins[d.kind]).not.toBeNull(); c.set(null); });
    expect(count('char')).toBe(58);
  });
});

/* ------------------------------------------------------------------------------------------------
 * Belirlenimlilik: kozmetik yalnız görsel
 * ---------------------------------------------------------------------------------------------- */
function freshNets() {
  clearCityPlanCaches();
  clearNetCaches();
  clearTrafficNetCache();
  clearPedNavCache();
}

function deepFreeze(o) {
  Object.keys(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]); });
  return Object.freeze(o);
}

describe('belirlenimlilik: skin\'li ve skin\'siz koşuda sim özetleri AYNI', () => {
  it('trafik 400 adım + yaya 200 adım: her kareyi skin değiştirerek (29 görünüm, low/high, kısıtlı hareket) koşmak özeti DEĞİŞTİRMEZ', () => {
    const seed = citySeed(3);
    const run = (withSkins) => {
      freshNets();
      const { G } = fakeG();
      const c = withSkins ? createCosmetics(G, null) : null;
      let q = 0;
      const poke = (k) => {
        if (!c) return;
        const d = KESIF[(k * 7 + q++) % KESIF.length];
        c.set({ ...ALL, [d.kind]: d.id });
        G.quality.settings.effTier = k % 3 === 0 ? 'low' : 'high';
        G.reducedMotion = k % 5 === 0;
        c.tick();
        c.arrive(k % 2);
      };
      const tr = createTraffic(trafficNet(seed), { seed, cap: 30 });
      tr.setTime(700);
      tr.setPlayer(-180, 64, 90, 0.4);
      tr.setEnv({ phase: 0.5 });
      tr.populate();
      const d = [];
      for (let k = 0; k < 400; k++) {
        poke(k);
        tr.step(TICK);
        if (k % 100 === 99) d.push(tr.digest());
      }
      freshNets();
      const { crowd } = makeCrowd(seed, { px: -100, pz: 60, phase: 0.3, rain: 0 });
      crowd.populate();
      for (let k = 0; k < 200; k++) {
        poke(k);
        crowd.step(0.05);
        if (k % 100 === 99) d.push(crowd.digest());
      }
      return d.join(',');
    };
    const plain = run(false);
    expect(run(true)).toBe(plain);
    expect(run(false)).toBe(plain);
  });

  it('denetleyici sim alanlarına YAZMAZ: dondurulmuş sim durumunda (strict) tüm işlemler istisnasız çalışır', () => {
    const sim = deepFreeze({
      player: { x: 1, y: 2, z: 3, heldKey: 'item:a', dead: false }, time: { tick: 5, seconds: 1, playTime: 1, paused: false }, body: { x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0 },
      inventory: { selected: 0, slots: [{ item: 'item:a', count: 1 }] }, world: { seed: 1 }, progression: { xp: 3 }, tech: { portals: { mavi: null, turuncu: null } }, hud: { hp: 20 },
    });
    const { G } = fakeG(sim);
    const c = createCosmetics(G, ALL);
    c.apply();
    KESIF.forEach((d) => c.set({ [d.kind]: d.id }, { preview: true }));
    c.set(null);
    c.tick();
    c.arrive(1);
    c.dispose();
    expect(JSON.stringify(sim)).toBe(JSON.stringify({
      player: { x: 1, y: 2, z: 3, heldKey: 'item:a', dead: false }, time: { tick: 5, seconds: 1, playTime: 1, paused: false }, body: { x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0 },
      inventory: { selected: 0, slots: [{ item: 'item:a', count: 1 }] }, world: { seed: 1 }, progression: { xp: 3 }, tech: { portals: { mavi: null, turuncu: null } }, hud: { hp: 20 },
    }));
  });

  it("parçacık RNG'si ayrı: skin yokken tüm efektler eski çağrı sayısı/değerleriyle aynı akışı tüketir (yalnız skin'li kıvılcım ek rnd çeker)", () => {
    const make = (skin) => {
      let n = 0;
      const out = [];
      const sys = {
        S: createScratch(),
        emit(S) { out.push([S.kind, S.r0, S.g0, S.b0, S.r1, S.g1, S.b1, S.life, S.s0].join(',')); },
        rnd() { n++; return ((n * 0.6180339887) % 1); },
        col: (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255],
        density: 1,
        reduced: false,
        skin,
      };
      const fx = createFxTech(sys);
      for (let i = 0; i < 30; i++) fx.jetFlame({ x: 0, y: 1, z: 0 }, 0, -3, 0);
      fx.teleportRing({ x: 0, y: 0, z: 0 });
      fx.portalPuff({ x: 0, y: 0, z: 0 });
      fx.gecisBurst({ x: 0, y: 0, z: 0 }, 1);
      return { out, rnd: n };
    };
    const a = make(null);
    const b = make({ jet: null, gecis: null });
    const c = make(undefined);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a.out.length).toBeGreaterThan(0);
  });
});
