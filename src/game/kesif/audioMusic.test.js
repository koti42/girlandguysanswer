import { describe, expect, it } from 'vitest';
import {
  BARS_PER_PHRASE,
  SCALES,
  STEPS_PER_BAR,
  ZONE_MUSIC,
  buildScale,
  createMusicComposer,
  degreeToMidi,
  pickMusicParams,
  stepSeconds,
} from './audioMusic.js';
import { midiToHz } from './audioMix.js';
import { mulberry32 } from './sim/rng.js';

const run = (params, steps, seed = 1) => {
  const c = createMusicComposer({ rand: mulberry32(seed) });
  const all = [];
  for (let i = 0; i < steps; i++) c.next(i, params).forEach((e) => all.push({ ...e, step: i }));
  return all;
};

describe('kipler ve bölgeler', () => {
  it('beş pentatonik kip, hepsi 5 notalı, artan, oktav içinde', () => {
    Object.keys(SCALES).forEach((k) => {
      const s = SCALES[k];
      expect(s).toHaveLength(5);
      expect(s[0]).toBe(0);
      for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
      expect(s[4]).toBeLessThan(12);
    });
  });

  it('her bölgenin kök, kip, tempo, yoğunluk tanımı var ve bölgeler farklı kip/kök kullanır', () => {
    expect(ZONE_MUSIC).toHaveLength(5);
    ZONE_MUSIC.forEach((z) => {
      expect(SCALES[z.scale]).toBeDefined();
      expect(z.bpm).toBeGreaterThan(40);
      expect(z.bpm).toBeLessThan(100);
      expect(z.density).toBeGreaterThan(0);
      expect(z.density).toBeLessThanOrEqual(1);
    });
    const sig = new Set(ZONE_MUSIC.map((z) => z.scale + z.root));
    expect(sig.size).toBe(5);
  });

  it('pickMusicParams: bölgeye göre kip; sınır dışı bölge sıkışır', () => {
    for (let z = 0; z < 5; z++) expect(pickMusicParams({ zone: z }).scaleName).toBe(ZONE_MUSIC[z].scale);
    expect(pickMusicParams({ zone: 99 }).zone).toBe('cekirdek');
    expect(pickMusicParams({ zone: -5 }).zone).toBe('baslangic');
    expect(pickMusicParams({ zone: NaN }).zone).toBe('baslangic');
    expect(pickMusicParams().tense).toBe(false);
  });

  it('gece: yavaş, seyrek, kararmış, majör → asılı kip', () => {
    const day = pickMusicParams({ zone: 0 });
    const night = pickMusicParams({ zone: 0, night: true });
    expect(day.scaleName).toBe('majorPenta');
    expect(night.scaleName).toBe('egyptian');
    expect(night.bpm).toBeLessThan(day.bpm);
    expect(night.density).toBeLessThan(day.density);
    expect(night.brightness).toBeLessThan(day.brightness);
  });

  it('yeraltı: bir oktav aşağı, minör pentatonik, seyrek', () => {
    const open = pickMusicParams({ zone: 1 });
    const cave = pickMusicParams({ zone: 1, underground: true });
    expect(cave.root).toBe(open.root - 12);
    expect(cave.scaleName).toBe('minorPenta');
    expect(cave.density).toBeLessThan(open.density);
  });

  it('savaş: tense bayrağı ve hızlanma; eşik altı (0.02) gergin değil', () => {
    const calm = pickMusicParams({ zone: 2 });
    const fight = pickMusicParams({ zone: 2, combat: 1 });
    expect(fight.tense).toBe(true);
    expect(fight.bpm).toBeGreaterThan(calm.bpm);
    expect(pickMusicParams({ combat: 0.01 }).tense).toBe(false);
    expect(pickMusicParams({ combat: true }).tense).toBe(true);
  });

  it('buildScale / degreeToMidi / stepSeconds', () => {
    expect(buildScale(60, SCALES.majorPenta, 2)).toEqual([60, 62, 64, 67, 69, 72, 74, 76, 79, 81]);
    expect(buildScale(60, SCALES.majorPenta, 1, 1)).toEqual([72, 74, 76, 79, 81]);
    expect(degreeToMidi(60, SCALES.majorPenta, 0)).toBe(60);
    expect(degreeToMidi(60, SCALES.majorPenta, 5)).toBe(72);
    expect(degreeToMidi(60, SCALES.majorPenta, 7)).toBe(76);
    expect(degreeToMidi(60, SCALES.majorPenta, -1)).toBe(57);
    expect(degreeToMidi(60, SCALES.majorPenta, -5)).toBe(48);
    expect(stepSeconds(60)).toBe(0.5);
    expect(stepSeconds(120)).toBe(0.25);
  });
});

describe('besteci', () => {
  const P = pickMusicParams({ zone: 0 });

  it('belirlenimci: aynı tohum aynı müzik, farklı tohum farklı', () => {
    const a = run(P, 128, 7);
    const b = run(P, 128, 7);
    const c = run(P, 128, 8);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('tüm sakin notalar kipin içinde (kök sınıfına göre)', () => {
    for (let z = 0; z < 5; z++) {
      for (const night of [false, true]) {
        const p = pickMusicParams({ zone: z, night });
        const allowed = new Set(p.intervals.map((i) => i % 12));
        run(p, 256, z + 1)
          .filter((e) => !e.kind.startsWith('tense'))
          .forEach((e) => {
            const pc = (((e.midi - p.root) % 12) + 12) % 12;
            expect(allowed.has(pc)).toBe(true);
          });
      }
    }
  });

  it('notalar makul aralıkta, süre/ses pozitif, frekans = midiToHz, delay küçük', () => {
    run(P, 256, 3).forEach((e) => {
      expect(e.midi).toBeGreaterThanOrEqual(20);
      expect(e.midi).toBeLessThanOrEqual(110);
      expect(e.beats).toBeGreaterThan(0);
      expect(e.vel).toBeGreaterThan(0);
      expect(e.vel).toBeLessThanOrEqual(1);
      expect(e.freq).toBeCloseTo(midiToHz(e.midi), 8);
      expect(e.delay).toBeGreaterThanOrEqual(0);
      expect(e.delay).toBeLessThan(0.1);
    });
  });

  it('her ölçü başında 3 pad + bas; pad uzun, bas kök civarında alçak', () => {
    const evs = run(P, STEPS_PER_BAR * 8, 5);
    for (let bar = 0; bar < 8; bar++) {
      const at = evs.filter((e) => e.step === bar * STEPS_PER_BAR);
      expect(at.filter((e) => e.kind === 'pad')).toHaveLength(3);
      expect(at.filter((e) => e.kind === 'bass').length).toBeGreaterThanOrEqual(1);
    }
    evs.filter((e) => e.kind === 'pad').forEach((e) => expect(e.beats).toBeGreaterThanOrEqual(8));
    evs.filter((e) => e.kind === 'bass').forEach((e) => expect(e.midi).toBeLessThan(P.root));
  });

  it('yoğunluk 0 iken arpej yok; yoğunluk 1 iken çok', () => {
    const none = run({ ...P, density: 0 }, 256, 2).filter((e) => e.kind === 'arp');
    const many = run({ ...P, density: 1 }, 256, 2).filter((e) => e.kind === 'arp');
    expect(none).toHaveLength(0);
    expect(many.length).toBeGreaterThan(60);
    const mid = run({ ...P, density: 0.4 }, 256, 2).filter((e) => e.kind === 'arp');
    expect(mid.length).toBeGreaterThan(none.length);
    expect(mid.length).toBeLessThan(many.length);
  });

  it('melodi yürüyüşü sınırlı: ardışık arpej adımları çoğunlukla küçük atlama', () => {
    const arps = run({ ...P, density: 1 }, 512, 4).filter((e) => e.kind === 'arp');
    let big = 0;
    for (let i = 1; i < arps.length; i++) if (Math.abs(arps[i].midi - arps[i - 1].midi) > 12) big++;
    expect(big).toBeLessThan(arps.length * 0.05);
    const lo = Math.min(...arps.map((e) => e.midi));
    const hi = Math.max(...arps.map((e) => e.midi));
    expect(hi - lo).toBeLessThanOrEqual(40);
  });

  it('4 ölçülük cümle: akor ilerlemesi yeniden seçilir, ilk akor hep kök', () => {
    const c = createMusicComposer({ rand: mulberry32(11) });
    const seen = new Set();
    for (let phrase = 0; phrase < 12; phrase++) {
      c.next(phrase * STEPS_PER_BAR * BARS_PER_PHRASE, P);
      expect(c.progression[0]).toBe(0);
      seen.add(c.progression.join(','));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('gergin katman: yalnız tense bayrağıyla; alçak drone, senkoplu nabız, çınlama', () => {
    const calm = run({ ...P, tense: false }, 128, 1);
    expect(calm.some((e) => e.kind.startsWith('tense'))).toBe(false);
    const evs = run({ ...P, tense: true }, STEPS_PER_BAR * 4, 1);
    const pulses = evs.filter((e) => e.kind === 'tensePulse');
    expect(pulses.filter((e) => e.step % 8 === 0)).toHaveLength(4);
    expect(pulses.filter((e) => e.step % 8 === 3)).toHaveLength(4);
    expect(pulses.filter((e) => e.step % 8 === 6)).toHaveLength(4);
    expect(evs.filter((e) => e.kind === 'tenseDrone')).toHaveLength(8);
    const drones = evs.filter((e) => e.kind === 'tenseDrone');
    drones.forEach((e) => expect(e.midi).toBeLessThan(P.root - 20));
    const stings = evs.filter((e) => e.kind === 'tenseSting');
    expect(stings.length).toBeGreaterThanOrEqual(4);
    // Sürtünme: minör ikili ve artırılmış dörtlü kökün üstünde
    const st = stings.filter((e) => e.step === 12);
    const iv = st.map((e) => e.midi - (P.root + 12)).sort((a, b) => a - b);
    expect(iv).toEqual([1, 6]);
  });

  it('kip değişince melodi konumu sıfırlanır (uyumsuz sıçrama yok), reset çalışır', () => {
    const c = createMusicComposer({ rand: mulberry32(2) });
    const a = pickMusicParams({ zone: 0, density: 1 });
    for (let i = 0; i < 64; i++) c.next(i, { ...a, density: 1 });
    const b = pickMusicParams({ zone: 3 });
    const out = [];
    for (let i = 64; i < 80; i++) c.next(i, { ...b, density: 1 }).forEach((e) => out.push(e));
    out.filter((e) => e.kind === 'arp').forEach((e) => {
      const pc = (((e.midi - b.root) % 12) + 12) % 12;
      expect(b.intervals.map((x) => x % 12)).toContain(pc);
    });
    c.reset();
    expect(c.progression[0]).toBe(0);
  });

  it('rand verilmezse çökmeden çalışır', () => {
    const c = createMusicComposer({});
    expect(() => {
      for (let i = 0; i < 40; i++) c.next(i, P);
    }).not.toThrow();
  });
});
