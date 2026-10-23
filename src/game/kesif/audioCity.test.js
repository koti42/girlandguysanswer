import { describe, it, expect } from 'vitest';
import {
  layerLevels, ambienceBudget, planLayers, createCityAmbience, LAYER_DEFS, LAYER_KEYS, CITY_AMBIENCE_PERIOD, OVERLAP_FACTOR, MIN_LEVEL,
} from './audioCity.js';
import { DIM_SOUNDS, BED_NODES, BED_DURATION, BED_CROSSFADE } from './audioRecipesDim.js';
import { BASE_SOUND_NAMES, listSoundNames, makeSynth, resolveSound } from './audioRecipes.js';
import { createFakeAudioContextClass } from './fakeAudioContext.js';
import { mulberry32 } from './sim/rng.js';

function rig(seed, opts) {
  const AC = createFakeAudioContextClass();
  const ctx = new AC();
  const out = ctx.createGain();
  const bufs = { white: ctx.createBuffer(1, 100, 44100), brown: ctx.createBuffer(1, 100, 44100) };
  const synth = makeSynth(ctx, out, bufs, Object.assign({ t0: ctx.currentTime + 0.005, rand: mulberry32(seed || 1) }, opts || {}));
  return { ctx, out, synth };
}

describe('makeSynth.sustain (düz plato yatak)', () => {
  it('gürültü: tamponlu döngülü kaynak + süzgeç + doğrusal giriş/çıkış kazancı; start<stop; çıkışa bağlı', () => {
    const { ctx, out, synth } = rig();
    expect(synth.sustain({ src: 'noise', type: 'brown', filter: ['lowpass', 200, 0.8], f0: 200, f1: 300, vol: 0.2, dur: 4, fadeIn: 1, fadeOut: 1 })).toBe(true);
    const src = ctx.nodes.find((n) => n.kind === 'bufsrc');
    expect(src.loop).toBe(true);
    expect(src.stoppedAt).toBeGreaterThan(src.startedAt);
    const bq = ctx.nodes.find((n) => n.kind === 'biquad');
    expect(bq.type).toBe('lowpass');
    expect(bq.frequency.events.map((e) => e[0])).toEqual(['set', 'lin']);
    const g = ctx.nodes.find((n) => n.kind === 'gain' && n !== out);
    expect(g.outputs).toContain(out);
    expect(g.gain.events.map((e) => e[0])).toEqual(['set', 'lin', 'set', 'lin']);
    // plato: giriş sonu ve çıkış başı aynı seviye
    expect(g.gain.events[1][1]).toBeCloseTo(0.2, 9);
    expect(g.gain.events[2][1]).toBeCloseTo(0.2, 9);
    expect(g.gain.events[3][1]).toBe(0);
    expect(synth.nodes).toBe(1);
    expect(synth.endAt).toBeCloseTo(src.stoppedAt, 9);
  });

  it('osilatör: frekans süpürmesi doğrusal; filtre isteğe bağlı; geçersiz girdiler düğüm üretmez', () => {
    const { ctx, synth } = rig();
    expect(synth.sustain({ src: 'osc', type: 'triangle', f0: 46, f1: 50, vol: 0.05, dur: 4.8 })).toBe(true);
    const o = ctx.nodes.find((n) => n.kind === 'osc');
    expect(o.type).toBe('triangle');
    expect(o.frequency.events.map((e) => e[0])).toEqual(['set', 'lin']);
    const before = ctx.nodes.length;
    expect(synth.sustain({ src: 'osc', f0: 0, dur: 1 })).toBe(false);
    expect(synth.sustain({ src: 'osc', f0: 100, dur: 0 })).toBe(false);
    expect(synth.sustain({ src: 'osc', f0: 100, dur: -2 })).toBe(false);
    expect(synth.sustain(null)).toBe(false);
    expect(ctx.nodes.length).toBe(before);
  });

  it('bütçe maxNodes ile sınırlı; tampon yoksa noise false; fade süreleri dur/2 ile kıstırılır (zamanlar artan)', () => {
    const { ctx, synth } = rig(1, { maxNodes: 1 });
    expect(synth.sustain({ src: 'osc', f0: 100, dur: 2 })).toBe(true);
    expect(synth.sustain({ src: 'osc', f0: 100, dur: 2 })).toBe(false);
    const b = rig();
    const s2 = makeSynth(b.ctx, b.out, null, { t0: 1 });
    expect(s2.sustain({ src: 'noise', dur: 2 })).toBe(false);
    const c = rig();
    c.synth.sustain({ src: 'osc', f0: 100, dur: 2, fadeIn: 5, fadeOut: 5 });
    const g = c.ctx.nodes.find((n) => n.kind === 'gain' && n !== c.out);
    const times = g.gain.events.map((e) => e[2]);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    expect(ctx.nodes.length).toBeGreaterThan(0);
  });
});

describe('dim:* ve city:* tarifleri', () => {
  const names = DIM_SOUNDS.map((m) => m[0]);

  it('hepsi audioRecipes kayıt defterinde çözülür ve listSoundNames/BASE_SOUND_NAMES içinde', () => {
    expect(names.length).toBe(11);
    names.forEach((n) => {
      expect(resolveSound(n), n).not.toBeNull();
      expect(BASE_SOUND_NAMES).toContain(n);
      expect(listSoundNames()).toContain(n);
    });
    ['dim:charge', 'dim:whoosh', 'dim:arrive', 'dim:gateOpen', 'dim:gateHum', 'dim:gateClose', 'dim:terminal',
      'city:traffic', 'city:drone', 'city:rain_metal', 'city:neon_buzz'].forEach((n) => expect(names).toContain(n));
  });

  it('her tarif geçerli düğüm kurar: ≤14 düğüm, sonlu zamanlar, < 5 sn, start<stop, çıkışa bağlı (genel kuralla aynı)', () => {
    names.forEach((n) => {
      const { ctx, out, synth } = rig(3);
      const r = resolveSound(n);
      expect(() => r.fn(synth), n).not.toThrow();
      expect(synth.nodes, n).toBeGreaterThanOrEqual(1);
      expect(synth.nodes, n).toBeLessThanOrEqual(14);
      expect(synth.endAt - synth.t0, n).toBeGreaterThan(0);
      expect(synth.endAt - synth.t0, n).toBeLessThan(5);
      const gains = ctx.nodes.filter((x) => x.kind === 'gain' && x !== out);
      expect(gains.length, n).toBe(synth.nodes);
      gains.forEach((g) => expect(g.outputs).toContain(out));
      ctx.nodes.filter((x) => x.kind === 'osc' || x.kind === 'bufsrc').forEach((x) => {
        expect(x.startedAt, n).toBeDefined();
        expect(x.stoppedAt, n).toBeGreaterThan(x.startedAt);
        expect(Number.isFinite(x.startedAt) && Number.isFinite(x.stoppedAt)).toBe(true);
      });
    });
  });

  it('yatak düğüm sayıları BED_NODES ile birebir (ambiyans bütçe hesabı doğru); süre 4,8 sn, çapraz geçiş 0,8 sn', () => {
    Object.keys(BED_NODES).forEach((n) => {
      const { synth } = rig(5);
      resolveSound(n).fn(synth);
      expect(synth.nodes, n).toBe(BED_NODES[n]);
      expect(synth.endAt - synth.t0, n).toBeLessThanOrEqual(BED_DURATION + 0.05);
    });
    expect(BED_DURATION).toBe(4.8);
    expect(BED_CROSSFADE).toBe(0.8);
    expect(LAYER_KEYS.map((k) => LAYER_DEFS[k].nodes)).toEqual([3, 3, 5, 3]);
  });

  it('yatak tarifleri konumsuz/sonsuz menzil, düşük öncelik (SFX onları ezer); tohumlu → belirlenimci', () => {
    Object.keys(BED_NODES).forEach((n) => {
      const r = resolveSound(n);
      expect(r.def.r).toBe(Infinity);
      expect(r.def.p).toBe(1);
    });
    const sig = (seed) => {
      const x = rig(seed);
      resolveSound('city:rain_metal').fn(x.synth);
      return JSON.stringify(x.ctx.nodes.filter((q) => q.kind === 'bufsrc').map((q) => q.startedAt));
    };
    expect(sig(1)).toBe(sig(1));
    expect(sig(1)).not.toBe(sig(2));
  });

  it('aile dostu: ad/yorum içinde siren, silah, şiddet sözcüğü yok', () => {
    const bad = /siren|gun|shot|explos|scream|blood|kill|bomb|alarm/i;
    names.forEach((n) => expect(bad.test(n), n).toBe(false));
    DIM_SOUNDS.forEach((m) => expect(bad.test(String(m[1])), m[0]).toBe(false));
  });
});

describe('katman düzeyleri ve planlama', () => {
  it('düzeyler hep 0..1 ve sonlu; gece/yağmur yönleri doğru', () => {
    const day = layerLevels({ night: 0, rain: 0, shelter: 0 });
    const night = layerLevels({ night: 1, rain: 0, shelter: 0 });
    const rain = layerLevels({ night: 1, rain: 1, shelter: 0 });
    expect(day.traffic).toBeGreaterThan(night.traffic);
    expect(night.drone).toBeGreaterThan(day.drone);
    expect(night.buzz).toBeGreaterThan(day.buzz);
    expect(day.rain).toBe(0);
    expect(rain.rain).toBe(1);
    expect(rain.buzz).toBeLessThan(night.buzz);
    [NaN, Infinity, -5, 9, undefined, null, 'x'].forEach((v) => {
      const l = layerLevels({ night: v, rain: v, shelter: v });
      LAYER_KEYS.forEach((k) => {
        expect(Number.isFinite(l[k])).toBe(true);
        expect(l[k]).toBeGreaterThanOrEqual(0);
        expect(l[k]).toBeLessThanOrEqual(1);
      });
    });
    expect(layerLevels(null).traffic).toBeGreaterThan(0);
  });

  it('içeride (sığınak) trafik/yağmur boğuklaşır ama kesilmez', () => {
    const out = layerLevels({ night: 0, rain: 1, shelter: 0 });
    const inn = layerLevels({ night: 0, rain: 1, shelter: 1 });
    expect(inn.traffic).toBeLessThan(out.traffic * 0.5);
    expect(inn.traffic).toBeGreaterThan(0);
    expect(inn.rain).toBeLessThan(out.rain);
    expect(inn.rain).toBeGreaterThan(0.2);
  });

  it('ses düğümü tavanı 24/18/12 → ambiyans payı; yağmursuz tüm katmanlar yüksekte sığar, düşükte kırpılır', () => {
    expect(ambienceBudget(24)).toBe(16);
    expect(ambienceBudget(18)).toBe(12);
    expect(ambienceBudget(12)).toBe(8);
    expect(ambienceBudget(NaN)).toBe(16);
    const lv = { traffic: 0.7, drone: 0.6, rain: 0, buzz: 0.4 };
    expect(planLayers(lv, ambienceBudget(24))).toEqual(['traffic', 'drone', 'buzz']);
    expect(planLayers(lv, ambienceBudget(12))).toEqual(['traffic', 'drone']);
    const rainy = { traffic: 0.7, drone: 0.6, rain: 0.8, buzz: 0.3 };
    expect(planLayers(rainy, ambienceBudget(24))[0]).toBe('rain'); // yağmurda yağmur önce
    expect(planLayers(rainy, ambienceBudget(12))).toEqual(['rain']);
    const sum = (keys) => keys.reduce((a, k) => a + LAYER_DEFS[k].nodes * OVERLAP_FACTOR, 0);
    [24, 18, 12].forEach((cap) => {
      [lv, rainy, { traffic: 1, drone: 1, rain: 1, buzz: 1 }].forEach((l) => expect(sum(planLayers(l, ambienceBudget(cap)))).toBeLessThanOrEqual(ambienceBudget(cap)));
    });
    expect(planLayers({ traffic: MIN_LEVEL / 2, drone: 0, rain: 0, buzz: 0 }, 99)).toEqual([]);
    expect(planLayers(null, 99)).toEqual([]);
  });
});

describe('createCityAmbience', () => {
  function player() {
    const calls = [];
    let stops = 0;
    return {
      calls,
      get stops() { return stops; },
      play: (name, o) => { calls.push({ name, vol: o.vol, pitch: o.pitch }); return { stop() { stops++; } }; },
    };
  }
  const st = (o) => Object.assign({ night: 0.2, rain: 0, shelter: 0, underwater: false }, o || {});
  function run(amb, secs, state, dt) {
    const d = dt || 1 / 60;
    for (let i = 0; i < Math.round(secs / d); i++) amb.update(d, state);
  }

  it('ilk karede katmanlar başlar; ~3,9 sn’de bir yeniden başlatılır (kesintisiz); hepsi sınırlı ses', () => {
    const p = player();
    const amb = createCityAmbience({ play: p.play, nodeCap: 24, rand: mulberry32(1) });
    run(amb, 0.1, st());
    expect(p.calls.map((c) => c.name).sort()).toEqual(['city:buzz'.replace('buzz', 'neon_buzz'), 'city:drone', 'city:traffic'].sort());
    run(amb, 40, st());
    const traffic = p.calls.filter((c) => c.name === 'city:traffic');
    const expected = 40 / CITY_AMBIENCE_PERIOD;
    expect(traffic.length).toBeGreaterThan(expected - 2);
    expect(traffic.length).toBeLessThan(expected + 2.5);
    p.calls.forEach((c) => {
      expect(c.vol).toBeGreaterThan(0);
      expect(c.vol).toBeLessThanOrEqual(1);
      expect(c.pitch).toBeGreaterThan(0.97);
      expect(c.pitch).toBeLessThan(1.03);
    });
    // yeniden başlatma aralığı yatak süresinden kısa: boşluk yok
    expect(CITY_AMBIENCE_PERIOD).toBeLessThan(BED_DURATION - BED_CROSSFADE * 0.9);
  });

  it('yağmurda yağmur yatağı başlar, yağmur bitince yeniden başlatılmaz; düğüm tahmini bütçe içinde', () => {
    const p = player();
    const amb = createCityAmbience({ play: p.play, nodeCap: 24 });
    run(amb, 8, st({ rain: 0.9 }));
    expect(p.calls.some((c) => c.name === 'city:rain_metal')).toBe(true);
    expect(amb.getStats().nodes).toBeLessThanOrEqual(ambienceBudget(24));
    const n = p.calls.filter((c) => c.name === 'city:rain_metal').length;
    run(amb, 10, st({ rain: 0 }));
    expect(p.calls.filter((c) => c.name === 'city:rain_metal').length).toBe(n);
  });

  it('düşük güç (düğüm tavanı 12): yalnız trafik+drone; orta (18) üçlü; yüksek (24) hepsi', () => {
    [[12, 2], [18, 3], [24, 3]].forEach(([cap, expectLayers]) => {
      const p = player();
      const amb = createCityAmbience({ play: p.play, nodeCap: cap });
      run(amb, 0.1, st({ night: 0.8 }));
      expect(amb.getStats().layers).toBe(expectLayers);
      expect(amb.getStats().nodes).toBeLessThanOrEqual(ambienceBudget(cap));
    });
    const p = player();
    const amb = createCityAmbience({ play: p.play, nodeCap: 24 });
    amb.setNodeCap(12);
    run(amb, 0.1, st({ night: 0.8 }));
    expect(amb.getStats().layers).toBe(2);
  });

  it('su altı / devre dışı / durdur: çalan yataklar söndürülür, yenisi başlamaz; dt=0 zamanlayıcı ilerletmez', () => {
    const p = player();
    const amb = createCityAmbience({ play: p.play });
    run(amb, 0.1, st());
    const started = p.calls.length;
    run(amb, 5, st({ underwater: true }));
    expect(p.stops).toBeGreaterThanOrEqual(3);
    expect(p.calls.length).toBe(started);
    run(amb, 0.1, st());
    expect(p.calls.length).toBeGreaterThan(started);
    const s2 = p.calls.length;
    for (let i = 0; i < 600; i++) amb.update(0, st());
    expect(p.calls.length).toBe(s2); // duraklatılmış: kare süresi 0
    amb.setEnabled(false);
    run(amb, 5, st());
    expect(p.calls.length).toBe(s2);
    amb.setEnabled(true);
    run(amb, 0.1, st());
    expect(p.calls.length).toBeGreaterThan(s2);
    amb.stop();
    expect(amb.active).toEqual([]);
    amb.dispose();
    amb.dispose();
    amb.update(1, st());
  });

  it('play null döndürürse (sessiz/ses bağlamı yok) 1 sn sonra yeniden dener; asla atmaz', () => {
    let n = 0;
    const amb = createCityAmbience({ play: () => { n++; return null; } });
    run(amb, 3.1, st());
    expect(n).toBeGreaterThanOrEqual(3 * 3);
    expect(amb.getStats().failed).toBeGreaterThan(0);
    const bare = createCityAmbience({});
    expect(() => run(bare, 1, st())).not.toThrow();
    expect(() => bare.update(NaN, null)).not.toThrow();
  });
});
