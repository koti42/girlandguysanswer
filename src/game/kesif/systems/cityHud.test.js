import { describe, expect, it } from 'vitest';
import { cpuMs, scaled } from '../../../test/perfScale.js';
import createSystemDefault, { CITY_HUD_ORDER, createSystem } from './cityHud.js';
import { makeMutableHud } from '../gameCtx.js';
import { sanitizeHud } from '../hudStore.js';
import { getCityPlan } from '../sim/city/cityPlan.js';
import { districtDisplay } from '../sim/city/cityHudData.js';
import { DISTRICT_KEYS } from '../sim/city/archetypes.js';
import { DIMENSION_ORDER } from './dimension.js';
import { CITY_LOOK_SYSTEM_ORDER } from '../render/city/cityLook.js';

const SEED = 4242;

function makeG(over) {
  const banners = [];
  const speaks = [];
  const G = {
    dim: 'neon',
    world: { seed: SEED },
    body: { x: 0, y: 64, z: 0 },
    hud: makeMutableHud(null, 'macera'),
    transitionActive: false,
    simFrozen: false,
    weatherSim: { smog: 0 },
    dimMgr: { get: () => ({ city: { kredi: 42 } }) },
    banner: (text, sub, opts) => banners.push({ text, sub, opts }),
    speak: (t) => speaks.push(t),
    ...over,
  };
  return { G, banners, speaks };
}
const run = (sys, G, n = 1, dt = 0.25) => {
  for (let i = 0; i < n; i++) sys.frameUpdate(G, dt);
};

describe('cityHud sistemi: kayıt', () => {
  it('ad, sıra 38 ve varsayılan dışa aktarım; sıra mevcut sistemlerden farklı', () => {
    const { G } = makeG();
    const sys = createSystem(G);
    expect(sys.name).toBe('cityHud');
    expect(sys.order).toBe(38);
    expect(CITY_HUD_ORDER).toBe(38);
    expect(typeof createSystemDefault).toBe('function');
    // sözleşme §20: dimension −120, props 23, cityLocks 24, vehicles 26 … cityHud 38; mevcut: tech −110/28, blocks 20, treefall 22, magic 25, content 30, mobs 40, session 10/90
    const used = [DIMENSION_ORDER, CITY_LOOK_SYSTEM_ORDER, -110, 28, 20, 22, 23, 25, 30, 40, 10, 90, -60];
    expect(used).not.toContain(CITY_HUD_ORDER);
    expect(DIMENSION_ORDER).toBe(-120);
    expect(typeof sys.onDimension).toBe('function'); // zorunlu kanca (§5)
  });
});

describe('cityHud: şehirde HUD alanları', () => {
  it('ilk karede dim, bölge adı, zone/biome, şehir durumu doldurulur ve sanitize edilir', () => {
    const { G } = makeG();
    const sys = createSystem(G);
    run(sys, G);
    expect(G.hud.dim).toBe('neon');
    expect(G.hud.district).toBe('Merkez');
    expect(G.hud.zone).toEqual({ id: 0, name: 'Merkez' });
    expect(G.hud.biome).toBe('Neon Meridyen');
    expect(G.hud.city.district).toBe('merkez');
    expect(G.hud.city.kredi).toBe(42);
    const clean = sanitizeHud(G.hud);
    expect(clean.dim).toBe('neon');
    expect(clean.district).toBe('Merkez');
    expect(clean.city.kredi).toBe(42);
  });

  it('bölge girişinde bir kez duyuru (anahtar, tür zone, öncelik 2) ve sesli okuma; aynı bölgede tekrar yok', () => {
    const { G, banners, speaks } = makeG();
    const sys = createSystem(G);
    run(sys, G, 40);
    expect(banners).toHaveLength(1);
    expect(banners[0].text).toBe('Merkez');
    expect(banners[0].sub.length).toBeGreaterThan(5);
    expect(banners[0].opts).toMatchObject({ key: 'district:merkez', kind: 'zone', priority: 2 });
    expect(speaks).toHaveLength(1);
    expect(speaks[0]).toContain('Merkez');
    expect(sys.api().getCityHudInfo()).toMatchObject({ dim: 'neon', district: 'merkez', banners: 1 });
  });

  it('her bölgenin merkezinde: ad doğru, duyuru doğru, 5 tohumda', () => {
    [SEED, 1, 77, 31337, 999999].forEach((seed) => {
      const plan = getCityPlan(seed);
      plan.districts.sites.forEach((site) => {
        const { G, banners } = makeG({ world: { seed } });
        const key = plan.districts.districtAt(site.x, site.z);
        G.body.x = site.x;
        G.body.z = site.z;
        const sys = createSystem(G);
        run(sys, G, 2);
        expect(G.hud.district).toBe(districtDisplay(key));
        expect(G.hud.city.district).toBe(key);
        expect(banners).toHaveLength(1);
        expect(banners[0].text).toBe(districtDisplay(key));
        expect(DISTRICT_KEYS).toContain(key);
      });
    });
  });

  it('yeraltı (y < 60): "Alt Şehir"', () => {
    const { G, banners } = makeG();
    G.body.y = 40;
    const sys = createSystem(G);
    run(sys, G, 2);
    expect(G.hud.district).toBe('Alt Şehir');
    expect(G.hud.city.district).toBe('alt_sehir');
    expect(banners[0].text).toBe('Alt Şehir');
  });

  it('bölge değişimi (ışınlanma): yeni ad + yeni duyuru; hızlı gidip gelmede her giriş duyuru üretir (kuyruk tekilleştirir)', () => {
    const { G, banners } = makeG();
    const sys = createSystem(G);
    run(sys, G, 2);
    const plan = getCityPlan(SEED);
    const other = plan.districts.sites.find((s) => plan.districts.districtAt(s.x, s.z) !== 'merkez');
    G.body.x = other.x;
    G.body.z = other.z;
    run(sys, G, 2);
    const k = plan.districts.districtAt(other.x, other.z);
    expect(G.hud.district).toBe(districtDisplay(k));
    expect(banners.map((b) => b.opts.key)).toEqual(['district:merkez', 'district:' + k]);
  });
});

describe('cityHud: geçiş sırasında ve çıkışta', () => {
  it('geçiş sürerken (transitionActive / simFrozen) duyuru yok; bittiğinde bir kez', () => {
    const { G, banners } = makeG({ transitionActive: true });
    const sys = createSystem(G);
    run(sys, G, 10);
    expect(banners).toHaveLength(0);
    expect(G.hud.district).toBe(''); // anahtar henüz yok
    G.transitionActive = false;
    G.simFrozen = true;
    run(sys, G, 4);
    expect(banners).toHaveLength(0);
    G.simFrozen = false;
    run(sys, G, 4);
    expect(banners).toHaveLength(1);
    expect(G.hud.district).toBe('Merkez');
  });

  it('ana diyara dönünce: bölge, şehir, boyut temizlenir; yeniden girişte duyuru yeniden verilir', () => {
    const { G, banners } = makeG();
    const sys = createSystem(G);
    run(sys, G, 2);
    expect(banners).toHaveLength(1);
    G.dim = 'overworld';
    run(sys, G, 2);
    expect(G.hud.dim).toBe('overworld');
    expect(G.hud.district).toBe('');
    expect(G.hud.city).toBeNull();
    G.dim = 'neon';
    run(sys, G, 2);
    expect(banners).toHaveLength(2);
    expect(G.hud.city).not.toBeNull();
  });

  it('onDimension durumu sıfırlar (hiçbir G.world önbelleği yok: yeni dünya tohumu okunur)', () => {
    const { G, banners } = makeG();
    const sys = createSystem(G);
    run(sys, G, 2);
    G.world = { seed: 777 };
    sys.onDimension(G, { id: 'overworld' }, { id: 'neon' });
    run(sys, G, 2);
    expect(banners).toHaveLength(2);
    G.dim = 'overworld';
    sys.onDimension(G, { id: 'neon' }, { id: 'overworld' });
    expect(G.hud.district).toBe('');
    expect(G.hud.city).toBeNull();
  });

  it('inşa/harita (G.dim tanımsız) ve dünya yok: hiçbir şey yazılmaz, hata yok', () => {
    const a = makeG({ dim: undefined });
    run(createSystem(a.G), a.G, 3);
    expect(a.G.hud.dim).toBe('overworld');
    expect(a.G.hud.city).toBeNull();
    const b = makeG({ world: null });
    run(createSystem(b.G), b.G, 3);
    expect(b.banners).toHaveLength(0);
    const c = makeG({ hud: null });
    expect(() => run(createSystem(c.G), c.G, 3)).not.toThrow();
  });
});

describe('cityHud: hava, kredi, ışık ipucu', () => {
  it('yağmur/fırtına motor etiketinden korunur; duman smog ile; açıkta boş', () => {
    const { G } = makeG();
    const sys = createSystem(G);
    G.hud.weather = 'yağmur';
    run(sys, G);
    expect(G.hud.weather).toBe('yağmur');
    G.hud.weather = 'fırtına';
    run(sys, G);
    expect(G.hud.weather).toBe('fırtına');
    G.hud.weather = '';
    G.weatherSim.smog = 1;
    run(sys, G);
    expect(G.hud.weather).toBe('duman');
    G.weatherSim.smog = 0;
    G.hud.weather = '';
    run(sys, G);
    expect(G.hud.weather).toBe('');
    G.hud.weather = 'kar'; // şehirde kar yok: gelirse yok sayılır
    run(sys, G);
    expect(G.hud.weather).toBe('');
  });

  it('ışık ipucu: terminale 40 blok içinde şekil+metin verisi, dışında null; uzaklık doğru', () => {
    const { G } = makeG();
    const plan = getCityPlan(SEED);
    const t = plan.terminals[0];
    G.body.x = t.x + 10;
    G.body.z = t.z;
    const sys = createSystem(G);
    run(sys, G, 2);
    expect(G.hud.city.light).toMatchObject({ kind: 'terminal', text: 'Terminal' });
    expect(G.hud.city.light.dist).toBe(10);
    expect(sanitizeHud(G.hud).city.light.dist).toBe(10);
    G.body.x = t.x + 60;
    run(sys, G, 2);
    expect(G.hud.city.light).toBeNull();
    G.body.x = t.x;
    G.body.y = 40; // yeraltı
    run(sys, G, 2);
    expect(G.hud.city.light).toBeNull();
  });

  it('kredi: dimMgr yoksa / geçersizse 0; tamsayıya yuvarlanır', () => {
    const a = makeG({ dimMgr: null });
    run(createSystem(a.G), a.G);
    expect(a.G.hud.city.kredi).toBe(0);
    const b = makeG({ dimMgr: { get: () => ({ city: { kredi: 12.9 } }) } });
    run(createSystem(b.G), b.G);
    expect(b.G.hud.city.kredi).toBe(12);
    const c = makeG({ dimMgr: { get: () => ({ city: { kredi: NaN } }) } });
    run(createSystem(c.G), c.G);
    expect(c.G.hud.city.kredi).toBe(0);
    const d = makeG({ dimMgr: { get: () => null } });
    run(createSystem(d.G), d.G);
    expect(d.G.hud.city.kredi).toBe(0);
  });

  it('G.banner / G.speak yoksa çökmez; bozuk koordinat (NaN) çökmez', () => {
    const { G } = makeG({ banner: undefined, speak: undefined });
    const sys = createSystem(G);
    G.body.x = NaN;
    G.body.z = NaN;
    expect(() => run(sys, G, 3)).not.toThrow();
  });
});

describe('cityHud: kayıt ve maliyet', () => {
  it('gameSystems standart sistem listesinde (./systems/cityHud.js) ve createSystem ile çözülür', async () => {
    const { standardSystemFiles, resolveSystems } = await import('../gameSystems.js');
    expect(standardSystemFiles()).toContain('./systems/cityHud.js');
    const { G } = makeG();
    const out = resolveSystems({ './systems/cityHud.js': await import('./cityHud.js') }, G);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('cityHud');
  });

  it('kare maliyeti ihmal edilebilir: 20 000 kare (dolaşırken) < 1 sn ve her karede yeni nesne tahsis edilmez (hud.city aynı nesne)', () => {
    const { G } = makeG();
    const sys = createSystem(G);
    run(sys, G, 2);
    const city = G.hud.city;
    const t0 = cpuMs();
    for (let i = 0; i < 20000; i++) {
      G.body.x = Math.sin(i / 300) * 600;
      G.body.z = Math.cos(i / 300) * 600;
      sys.frameUpdate(G, 0.016);
    }
    expect(cpuMs() - t0).toBeLessThan(scaled(1000));
    expect(G.hud.city).toBe(city);
    expect(sanitizeHud(G.hud).dim).toBe('neon');
  });
});
