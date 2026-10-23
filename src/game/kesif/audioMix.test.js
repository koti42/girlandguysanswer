import { describe, expect, it } from 'vitest';
import {
  MATERIALS,
  ambientMix,
  blendMix,
  createVoiceLimiter,
  distanceGain,
  fillNoise,
  foldKey,
  forwardFromYaw,
  generateImpulse,
  listenerBasis,
  midiToHz,
  mobSoundFor,
  nextEventDelay,
  normBiome,
  normMaterial,
  normWeather,
  normZone,
  panFor,
} from './audioMix.js';
import { mulberry32 } from './sim/rng.js';

describe('malzeme ve ad normalizasyonu', () => {
  it('foldKey Türkçe karakterleri katlar', () => {
    expect(foldKey('ŞĞÜÖÇİI ışğüöç')).toBe('sguociiisguoc');
    expect(foldKey('Çöl ve Kanyon')).toBe('colvekanyon');
    expect(foldKey(5)).toBe('');
    expect(foldKey(null)).toBe('');
  });

  it('normMaterial: 10 kanonik malzeme, ASCII/İngilizce takma adlar, bilinmeyen → taş', () => {
    MATERIALS.forEach((m) => expect(normMaterial(m)).toBe(m));
    expect(normMaterial('tas')).toBe('taş');
    expect(normMaterial('Ahsap')).toBe('ahşap');
    expect(normMaterial('CIM')).toBe('çim');
    expect(normMaterial('glass')).toBe('cam');
    expect(normMaterial('snow')).toBe('kar');
    expect(normMaterial('demir')).toBe('metal');
    expect(normMaterial('???')).toBe('taş');
    expect(normMaterial(undefined)).toBe('taş');
    expect(normMaterial('constructor')).toBe('taş');
    expect(normMaterial('__proto__')).toBe('taş');
    expect(MATERIALS).toHaveLength(10);
  });

  it('mobSoundFor: her mob bir aileye bağlı; süs böcekleri sessiz; boss roar', () => {
    ['golge', 'kemikci', 'kumakrebi', 'buzhortlagi', 'kristalbocegi', 'lavslime', 'tasyarasasi'].forEach((m) => expect(mobSoundFor(m)).not.toBeNull());
    expect(mobSoundFor('golge').family).toBe('growl');
    expect(mobSoundFor('kemikci').family).toBe('rattle');
    expect(mobSoundFor('kumakrebi').family).toBe('skitter');
    expect(mobSoundFor('buzhortlagi').family).toBe('hiss');
    ['kokana', 'tasbekci', 'buzkral', 'golgehukumdar'].forEach((b) => {
      expect(mobSoundFor(b).family).toBe('roar');
      expect(mobSoundFor(b).boss).toBe(b);
    });
    expect(mobSoundFor('kelebek')).toBeNull();
    expect(mobSoundFor('atesbocegi')).toBeNull();
    expect(mobSoundFor('growl').family).toBe('growl');
    expect(mobSoundFor('yok')).toBeNull();
    expect(mobSoundFor('constructor')).toBeNull();
    expect(mobSoundFor('Taş Bekçi').boss).toBe('tasbekci'); // görünen ad da çözülür
  });
});

describe('mesafe ve yön', () => {
  it('distanceGain: ref içinde 1, azalır, max ötesinde 0', () => {
    expect(distanceGain(0)).toBe(1);
    expect(distanceGain(2)).toBe(1);
    expect(distanceGain(4)).toBeLessThan(1);
    expect(distanceGain(4)).toBeGreaterThan(distanceGain(20));
    expect(distanceGain(48.1, 2, 1.1, 48)).toBe(0);
    expect(distanceGain(NaN)).toBe(1);
    expect(distanceGain(-1)).toBe(1);
    let prev = 2;
    for (let d = 2; d < 48; d += 2) {
      const g = distanceGain(d);
      expect(g).toBeLessThanOrEqual(prev);
      prev = g;
    }
  });

  it('forwardFromYaw: 0 → −Z, +90° → −X (sola)', () => {
    const f0 = forwardFromYaw(0);
    expect([f0.x, f0.z]).toEqual([-0, -1].map((v) => v));
    const f = forwardFromYaw(Math.PI / 2);
    expect(f.x).toBeCloseTo(-1);
    expect(f.z).toBeCloseTo(0);
  });

  it('listenerBasis: ortonormal; varsayılan; geçersiz girişte güvenli', () => {
    const b = listenerBasis(0, null);
    expect([b.fx, b.fy, b.fz]).toEqual([-0, 0, -1].map((v) => v));
    expect([b.ux, b.uy, b.uz]).toEqual([0, 1, 0]);
    // sağ = ileri × yukarı = (−Z) × (+Y) = +X
    expect(b.rx).toBeCloseTo(1);
    expect(b.ry).toBeCloseTo(0);
    expect(b.rz).toBeCloseTo(0);
    const c = listenerBasis({ x: 1, y: 0, z: 1 }, { x: 0, y: 2, z: 0 });
    expect(Math.hypot(c.fx, c.fy, c.fz)).toBeCloseTo(1);
    expect(c.uy).toBeCloseTo(1);
    expect(c.fx * c.rx + c.fy * c.ry + c.fz * c.rz).toBeCloseTo(0);
    const d = listenerBasis({ x: 0, y: 0, z: 0 }, { x: NaN, y: 0, z: 0 });
    expect(Math.hypot(d.fx, d.fy, d.fz)).toBeCloseTo(1);
    const e = listenerBasis('x', 5);
    expect(e.fz).toBe(-1);
  });

  it('panFor: sağdaki kaynak +, soldaki −, tam önde ≈ 0, çakışık 0', () => {
    const b = listenerBasis(0, null);
    expect(panFor(b, 0, 0, 0, 10, 0, 0)).toBeCloseTo(1);
    expect(panFor(b, 0, 0, 0, -10, 0, 0)).toBeCloseTo(-1);
    expect(panFor(b, 0, 0, 0, 0, 0, -10)).toBeCloseTo(0);
    expect(panFor(b, 1, 2, 3, 1, 2, 3)).toBe(0);
    // Yaw 90° (sola dön): eskiden önde olan −Z artık sağda
    const l = listenerBasis(Math.PI / 2, null);
    expect(panFor(l, 0, 0, 0, 0, 0, -10)).toBeCloseTo(1);
  });
});

describe('normBiome / normZone / normWeather', () => {
  it('biyom anahtarları ve Türkçe adlar', () => {
    expect(normBiome('cayir')).toBe('cayir');
    expect(normBiome('Çayır')).toBe('cayir');
    expect(normBiome('Karaçam Ormanı')).toBe('karacam');
    expect(normBiome('Çöl ve Kanyon')).toBe('col');
    expect(normBiome('Kar Tundrası')).toBe('tundra');
    expect(normBiome('Dağ ve Zirve')).toBe('dag');
    expect(normBiome('Bataklık')).toBe('bataklik');
    expect(normBiome('Plaj ve Deniz')).toBe('plaj');
    expect(normBiome('Kristal Vadisi')).toBe('kristal');
    expect(normBiome({ key: 'orman' })).toBe('orman');
    expect(normBiome('')).toBe('');
    expect(normBiome(undefined)).toBe('');
    expect(normBiome('bilinmeyen')).toBe('');
  });

  it('bölge: sayı, nesne, anahtar, ad; sınırlanır', () => {
    expect(normZone(3)).toBe(3);
    expect(normZone(99)).toBe(4);
    expect(normZone(-2)).toBe(0);
    expect(normZone({ id: 2 })).toBe(2);
    expect(normZone('donmus')).toBe(3);
    expect(normZone({ name: 'Fısıldayan Ormanlar' })).toBe(1);
    expect(normZone('Başlangıç Vadisi')).toBe(0);
    expect(normZone('Çekirdek')).toBe(4);
    expect(normZone(undefined)).toBe(0);
  });

  it('hava', () => {
    expect(normWeather('yağmur')).toBe('rain');
    expect(normWeather('rain')).toBe('rain');
    expect(normWeather('kar')).toBe('snow');
    expect(normWeather('Karlı')).toBe('snow');
    expect(normWeather('fırtına')).toBe('storm');
    expect(normWeather('açık')).toBe('clear');
    expect(normWeather(undefined)).toBe('clear');
  });
});

describe('ambientMix', () => {
  it('boş girdi güvenli ve tüm alanlar sayısal', () => {
    const m = ambientMix(undefined);
    ['wind', 'rain', 'water', 'drip', 'bird', 'cricket', 'frog', 'lavaBubble', 'reverb', 'lowpass', 'combat'].forEach((k) => {
      expect(Number.isFinite(m[k])).toBe(true);
    });
    expect(m.lowpass).toBe(20000);
    expect(m.wind).toBeGreaterThan(0);
  });

  it('tüm seviyeler 0..1 (lowpass hariç) ve tüm kombinasyonlarda sonlu', () => {
    const biomes = ['cayir', 'orman', 'karacam', 'col', 'tundra', 'dag', 'bataklik', 'plaj', 'kristal', ''];
    const weathers = ['', 'yağmur', 'kar', 'fırtına'];
    biomes.forEach((biome) =>
      weathers.forEach((weather) =>
        [false, true].forEach((night) =>
          [false, true].forEach((underground) =>
            [false, true].forEach((underwater) => {
              const m = ambientMix({ zone: 3, biome, weather, night, underground, underwater, combat: 1, water: 2, lava: 3 });
              ['wind', 'rain', 'water', 'reverb'].forEach((k) => {
                expect(m[k]).toBeGreaterThanOrEqual(0);
                expect(m[k]).toBeLessThanOrEqual(1);
              });
              ['drip', 'bird', 'cricket', 'frog', 'lavaBubble'].forEach((k) => expect(m[k]).toBeGreaterThanOrEqual(0));
              expect(m.lowpass).toBeGreaterThan(100);
            })
          )
        )
      )
    );
  });

  it('yağmur yağmur yatağını açar; fırtına daha güçlü; yeraltında kısılır', () => {
    const dry = ambientMix({ biome: 'cayir' });
    const rain = ambientMix({ biome: 'cayir', weather: 'yağmur' });
    const storm = ambientMix({ biome: 'cayir', weather: 'fırtına' });
    expect(dry.rain).toBe(0);
    expect(rain.rain).toBeGreaterThan(0);
    expect(storm.rain).toBeGreaterThan(rain.rain);
    expect(storm.wind).toBeGreaterThan(rain.wind);
    const cave = ambientMix({ biome: 'cayir', weather: 'yağmur', underground: true });
    expect(cave.rain).toBeLessThan(rain.rain * 0.2);
    expect(cave.wind).toBeLessThan(dry.wind * 0.2);
  });

  it('yeraltı: damlama + yüksek yankı; açık havada damlama yok', () => {
    const cave = ambientMix({ underground: true, biome: 'dag' });
    const open = ambientMix({ biome: 'dag' });
    expect(cave.drip).toBeGreaterThan(0);
    expect(open.drip).toBe(0);
    expect(cave.reverb).toBeGreaterThan(open.reverb * 2);
    expect(cave.bird).toBe(0);
  });

  it('su altı: alçak geçiren, rüzgâr/yağmur/kuş yok', () => {
    const m = ambientMix({ biome: 'orman', weather: 'yağmur', underwater: true });
    expect(m.lowpass).toBeLessThan(1000);
    expect([m.wind, m.rain, m.bird, m.cricket, m.drip]).toEqual([0, 0, 0, 0, 0]);
    expect(m.water).toBeGreaterThan(0);
  });

  it('gündüz kuş, gece cırcır; bataklıkta kurbağa; yağmurda azalır', () => {
    const day = ambientMix({ biome: 'orman' });
    const night = ambientMix({ biome: 'orman', night: true });
    expect(day.bird).toBeGreaterThan(0);
    expect(day.cricket).toBe(0);
    expect(night.cricket).toBeGreaterThan(0);
    expect(night.bird).toBe(0);
    expect(ambientMix({ biome: 'bataklik', night: true }).frog).toBeGreaterThan(ambientMix({ biome: 'bataklik' }).frog);
    expect(ambientMix({ biome: 'orman' }).frog).toBe(0);
    expect(ambientMix({ biome: 'orman', weather: 'yağmur' }).bird).toBeLessThan(day.bird);
    expect(ambientMix({ biome: 'col' }).bird).toBe(0);
  });

  it('savaş ortam yataklarını kısar; combat sayı ya da bayrak', () => {
    const calm = ambientMix({ biome: 'dag' });
    const fight = ambientMix({ biome: 'dag', combat: true });
    expect(fight.combat).toBe(1);
    expect(fight.wind).toBeCloseTo(calm.wind * 0.5);
    expect(ambientMix({ combat: 0.4 }).combat).toBeCloseTo(0.4);
    expect(ambientMix({ combat: 7 }).combat).toBe(1);
    expect(ambientMix({ combat: -1 }).combat).toBe(0);
  });

  it('bölge etkisi: donmuş zirvede rüzgâr daha güçlü; su/lav yakınlığı', () => {
    expect(ambientMix({ biome: 'tundra', zone: 3 }).wind).toBeGreaterThan(ambientMix({ biome: 'tundra', zone: 0 }).wind);
    expect(ambientMix({ biome: 'cayir', water: 1 }).water).toBeGreaterThan(ambientMix({ biome: 'cayir' }).water);
    expect(ambientMix({ lava: 1 }).lavaBubble).toBeGreaterThan(0);
    expect(ambientMix({}).lavaBubble).toBe(0);
  });

  it('blendMix: sayıları yaklaştırır, lowpass logaritmik, bayraklar hedefe geçer', () => {
    const cur = ambientMix({ biome: 'orman' });
    const target = ambientMix({ biome: 'orman', underwater: true });
    const half = blendMix({ ...cur }, target, 0.5, {});
    expect(half.lowpass).toBeLessThan(20000);
    expect(half.lowpass).toBeGreaterThan(650);
    expect(half.lowpass).toBeCloseTo(Math.sqrt(20000 * 650), 0);
    expect(half.underwater).toBe(true);
    const done = blendMix({ ...cur }, target, 1, {});
    expect(done.lowpass).toBeCloseTo(650, 3);
    expect(done.wind).toBeCloseTo(0, 6);
    const same = blendMix({ ...cur }, target, 0, {});
    expect(same.wind).toBeCloseTo(cur.wind, 6);
  });

  it('nextEventDelay: Poisson ortalaması ≈ 1/rate, rate 0 → Infinity', () => {
    const r = mulberry32(5);
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) sum += nextEventDelay(2, r);
    expect(sum / n).toBeGreaterThan(0.45);
    expect(sum / n).toBeLessThan(0.55);
    expect(nextEventDelay(0, r)).toBe(Infinity);
    expect(nextEventDelay(-1, r)).toBe(Infinity);
    expect(Number.isFinite(nextEventDelay(1, () => 0))).toBe(true);
  });
});

describe('ses sınırlayıcı', () => {
  const v = (priority, dist, startedAt = 0, endAt = 10) => ({ priority, dist, startedAt, endAt });

  it('tavana kadar kabul eder', () => {
    const l = createVoiceLimiter({ max: 3 });
    for (let i = 0; i < 3; i++) {
      expect(l.admit({ priority: 1, dist: 0 }).ok).toBe(true);
      l.add(v(1, 0));
    }
    expect(l.count).toBe(3);
    expect(l.admit({ priority: 1, dist: 0 }).ok).toBe(false);
  });

  it('dolu iken yüksek öncelikli sesi alır, en düşük öncelikliyi kovar', () => {
    const l = createVoiceLimiter({ max: 3 });
    const a = l.add(v(1, 5));
    l.add(v(3, 5));
    l.add(v(2, 5));
    const r = l.admit({ priority: 4, dist: 50 });
    expect(r.ok).toBe(true);
    expect(r.steal).toBe(a);
  });

  it('öncelik eşitse yakın olan uzağı kovar; aynı mesafede reddeder', () => {
    const l = createVoiceLimiter({ max: 2 });
    const far = l.add(v(2, 30));
    l.add(v(2, 5));
    const near = l.admit({ priority: 2, dist: 1 });
    expect(near.ok).toBe(true);
    expect(near.steal).toBe(far);
    const same = l.admit({ priority: 2, dist: 30 });
    expect(same.ok).toBe(false);
    expect(l.admit({ priority: 1, dist: 0 }).ok).toBe(false);
  });

  it('eşit öncelik/mesafede en eskiyi kurban seçer', () => {
    const l = createVoiceLimiter({ max: 2 });
    const old = l.add(v(2, 5, 1));
    l.add(v(2, 5, 9));
    expect(l.admit({ priority: 3, dist: 5 }).steal).toBe(old);
  });

  it('sweep biten sesleri döndürür ve çıkarır; remove/clear/setMax', () => {
    const l = createVoiceLimiter({ max: 5 });
    l.add(v(1, 0, 0, 1));
    l.add(v(1, 0, 0, 5));
    expect(l.sweep(2)).toHaveLength(1);
    expect(l.count).toBe(1);
    const x = l.voices()[0];
    l.remove(x);
    expect(l.count).toBe(0);
    l.add(v(1, 0));
    expect(l.clear()).toHaveLength(1);
    l.setMax(0);
    expect(l.max).toBe(1);
    l.setMax(7.9);
    expect(l.max).toBe(7);
  });
});

describe('tamponlar', () => {
  it('fillNoise: beyaz [-1,1], ortalama ≈ 0, belirlenimci; kahverengi normalize', () => {
    const a = fillNoise(new Float32Array(20000), 'white', 1);
    const b = fillNoise(new Float32Array(20000), 'white', 1);
    const c = fillNoise(new Float32Array(20000), 'white', 2);
    expect(Array.from(a.slice(0, 50))).toEqual(Array.from(b.slice(0, 50)));
    expect(Array.from(a.slice(0, 50))).not.toEqual(Array.from(c.slice(0, 50)));
    let mean = 0;
    let max = 0;
    for (let i = 0; i < a.length; i++) {
      mean += a[i];
      max = Math.max(max, Math.abs(a[i]));
    }
    expect(Math.abs(mean / a.length)).toBeLessThan(0.02);
    expect(max).toBeLessThanOrEqual(1);
    const br = fillNoise(new Float32Array(20000), 'brown', 3);
    let bmax = 0;
    for (let i = 0; i < br.length; i++) bmax = Math.max(bmax, Math.abs(br[i]));
    expect(bmax).toBeCloseTo(0.95, 2);
  });

  it('generateImpulse: iki kanal, kuyruk söner, kanallar farklı, ön gecikme sessiz', () => {
    const [l, r] = generateImpulse(8000, 1.5, 3.2, 7);
    expect(l.length).toBe(12000);
    expect(r.length).toBe(12000);
    const energy = (arr, from, to) => {
      let e = 0;
      for (let i = from; i < to; i++) e += arr[i] * arr[i];
      return e;
    };
    expect(energy(l, 100, 3000)).toBeGreaterThan(energy(l, 9000, 12000) * 5);
    expect(Array.from(l.slice(200, 260))).not.toEqual(Array.from(r.slice(200, 260)));
    for (let i = 0; i < 90; i++) expect(l[i]).toBe(0); // 12 ms @ 8 kHz = 96 örnek
    expect(Number.isFinite(energy(l, 0, l.length))).toBe(true);
    const again = generateImpulse(8000, 1.5, 3.2, 7);
    expect(Array.from(again[0].slice(500, 520))).toEqual(Array.from(l.slice(500, 520)));
    expect(generateImpulse(100, 0.0001)[0].length).toBeGreaterThanOrEqual(64);
  });

  it('midiToHz', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBeCloseTo(880);
    expect(midiToHz(60)).toBeCloseTo(261.626, 2);
  });
});
