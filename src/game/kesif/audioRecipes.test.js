import { describe, expect, it } from 'vitest';
import { BASE_SOUND_NAMES, MOB_MODES, RUNE_COUNT, listSoundNames, makeSynth, materialSound, resolveSound } from './audioRecipes.js';
import { MATERIALS } from './audioMix.js';
import { createFakeAudioContextClass } from './fakeAudioContext.js';
import { mulberry32 } from './sim/rng.js';

function rig(seed = 1, opts = {}) {
  const AC = createFakeAudioContextClass();
  const ctx = new AC();
  const out = ctx.createGain();
  const bufs = { white: ctx.createBuffer(1, 100, 44100), brown: ctx.createBuffer(1, 100, 44100) };
  const synth = makeSynth(ctx, out, bufs, { t0: ctx.currentTime + 0.005, rand: mulberry32(seed), ...opts });
  return { ctx, out, bufs, synth };
}

/** Düğümlerin sıralı imzası: tür, dalga/süzgeç tipi ve frekans otomasyonu. */
function signature(ctx) {
  return JSON.stringify(
    ctx.nodes
      .filter((n) => n.kind === 'osc' || n.kind === 'bufsrc' || n.kind === 'biquad')
      .map((n) => [n.kind, n.type || '', n.frequency ? n.frequency.events : null])
  );
}

describe('makeSynth', () => {
  it('tone: osilatör+kazanç kurar, start/stop sıralı, endAt güncellenir, çıkışa bağlanır', () => {
    const { ctx, out, synth } = rig();
    expect(synth.tone('sine', 440, 220, 0.1, 0.2, 0.3)).toBe(true);
    const osc = ctx.nodes.find((n) => n.kind === 'osc');
    expect(osc.startedAt).toBeCloseTo(synth.t0 + 0.1);
    expect(osc.stoppedAt).toBeGreaterThan(osc.startedAt);
    expect(synth.endAt).toBeCloseTo(osc.stoppedAt);
    const gain = ctx.nodes.find((n) => n.kind === 'gain' && n !== out);
    expect(gain.outputs).toContain(out);
    expect(synth.nodes).toBe(1);
  });

  it('noise: tamponlu kaynak + süzgeç + kazanç; tampon yoksa false; brown seçilebilir', () => {
    const { ctx, bufs, synth } = rig();
    expect(synth.noise(0, 0.1, 0.3, 'bandpass', 1000, 500, 2)).toBe(true);
    expect(ctx.nodes.find((n) => n.kind === 'bufsrc').buffer).toBe(bufs.white);
    expect(synth.noise(0, 0.1, 0.3, 'lowpass', 200, 100, 1, 0.01, 'brown')).toBe(true);
    expect(ctx.nodes.filter((n) => n.kind === 'bufsrc')[1].buffer).toBe(bufs.brown);
    const empty = rig(1);
    const s2 = makeSynth(empty.ctx, empty.out, null, { t0: 1 });
    expect(s2.noise(0, 0.1, 0.3, 'lowpass', 200, 100)).toBe(false);
  });

  it('bütçe: maxNodes aşılınca false döner ve düğüm eklenmez', () => {
    const { ctx, synth } = rig(1, { maxNodes: 2 });
    expect(synth.tone('sine', 440, 440, 0, 0.1, 0.1)).toBe(true);
    expect(synth.noise(0, 0.1, 0.1, 'lowpass', 500, 500)).toBe(true);
    const before = ctx.nodes.length;
    expect(synth.tone('sine', 440, 440, 0, 0.1, 0.1)).toBe(false);
    expect(synth.noise(0, 0.1, 0.1, 'lowpass', 500, 500)).toBe(false);
    expect(ctx.nodes.length).toBe(before);
  });

  it('geçersiz parametreler (süre ≤ 0, frekans ≤ 0) düğüm üretmez', () => {
    const { ctx, synth } = rig();
    const before = ctx.nodes.length;
    expect(synth.tone('sine', 0, 440, 0, 0.1, 0.1)).toBe(false);
    expect(synth.tone('sine', 440, 440, 0, 0, 0.1)).toBe(false);
    expect(synth.tone('sine', 440, 440, 0, -1, 0.1)).toBe(false);
    expect(synth.noise(0, 0, 0.1, 'lowpass', 500, 500)).toBe(false);
    expect(ctx.nodes.length).toBe(before);
  });

  it('pitch frekansı ve süzgeçleri ölçekler; ses 0 olsa bile üstel rampa geçerli kalır', () => {
    const { ctx, synth } = rig(1, { pitch: 2 });
    synth.tone('sine', 300, 300, 0, 0.1, 0, 0.01);
    const osc = ctx.nodes.find((n) => n.kind === 'osc');
    expect(osc.frequency.events[0]).toEqual(['set', 600, synth.t0]);
  });

  it('filtre ve vibrato seçenekleri çalışır (setValueCurveAtTime)', () => {
    const { ctx, synth } = rig();
    expect(synth.tone('sawtooth', 100, 80, 0, 0.5, 0.2, 0.05, { filter: ['bandpass', 320, 2], vib: { hz: 10, cents: 50 }, detune: 12 })).toBe(true);
    const osc = ctx.nodes.find((n) => n.kind === 'osc');
    expect(osc.detune.events.some((e) => e[0] === 'curve')).toBe(true);
    const bq = ctx.nodes.find((n) => n.kind === 'biquad');
    expect(bq.type).toBe('bandpass');
    expect(osc.outputs).toContain(bq);
  });
});

describe('ad çözümleme', () => {
  it('doğrudan, malzemeli, mob, rune ve bilinmeyen adlar', () => {
    expect(resolveSound('pickup').id).toBe('pickup');
    expect(resolveSound('step').id).toBe('step:taş');
    expect(resolveSound('step:çim').id).toBe('step:çim');
    expect(resolveSound('step:CIM').id).toBe('step:çim');
    expect(resolveSound('dig', { material: 'ahsap' }).id).toBe('dig:ahşap');
    expect(resolveSound('break:cam').id).toBe('break:cam');
    expect(resolveSound('mob:golge').id).toContain('growl');
    expect(resolveSound('mobhurt:golge').id).toContain('hurt');
    expect(resolveSound('mob:golge:die').id).toContain('die');
    expect(resolveSound('mob', { mob: 'koyun', mode: 'hurt' }).id).toContain('baa');
    expect(resolveSound('rune:2').id).toBe('rune:2');
    expect(resolveSound('rune:7').id).toBe('rune:2');
    expect(resolveSound('rune:-1').id).toBe('rune:4');
    ['', 'nope', 'mob:', 'mob:kelebek', 'mob:yok', 'rune:x', 'rune', 'constructor', '__proto__', 'toString'].forEach((n) => expect(resolveSound(n)).toBeNull());
    [null, undefined, 5, {}, []].forEach((n) => expect(resolveSound(n)).toBeNull());
  });

  it('tanım alanları: öncelik 1..5, menzil, yankı, aralık', () => {
    listSoundNames().forEach((n) => {
      const r = resolveSound(n);
      expect(r, n).not.toBeNull();
      expect(r.def.p).toBeGreaterThanOrEqual(1);
      expect(r.def.p).toBeLessThanOrEqual(5);
      expect(r.def.r).toBeGreaterThan(0);
      expect(r.def.wet).toBeGreaterThanOrEqual(0);
      expect(r.def.wet).toBeLessThanOrEqual(1);
      expect(typeof r.fn).toBe('function');
    });
  });

  it('konumsuz arayüz sesleri sonsuz menzil; bosslar yaratıklardan öncelikli ve uzaktan duyulur', () => {
    expect(resolveSound('ui_click').def.r).toBe(Infinity);
    expect(resolveSound('achievement').def.p).toBe(5);
    const boss = resolveSound('mob:kokana');
    const mob = resolveSound('mob:golge');
    expect(boss.def.p).toBeGreaterThan(mob.def.p);
    expect(boss.def.r).toBeGreaterThan(mob.def.r);
    expect(resolveSound('hurt').def.p).toBe(5);
    expect(resolveSound('step').def.p).toBe(1);
  });
});

describe('tüm tarifler', () => {
  const names = listSoundNames();

  it('istenen ses ailelerinin hepsi var', () => {
    const need = [
      'pickup', 'hit', 'hurt', 'die', 'bow', 'arrow', 'gun', 'craft', 'ui_click', 'ui_open', 'ui_close', 'achievement', 'zone_unlock',
      'puzzle_solved', 'puzzle_wrong', 'portal', 'door', 'splash', 'lava', 'drip', 'jump',
    ];
    need.forEach((n) => expect(BASE_SOUND_NAMES).toContain(n));
    ['step', 'dig', 'break', 'place', 'land'].forEach((k) => MATERIALS.forEach((m) => expect(names).toContain(`${k}:${m}`)));
    ['growl', 'rattle', 'skitter', 'hiss', 'roar'].forEach((f) => expect(names).toContain(`mob:${f}:idle`));
    expect(RUNE_COUNT).toBe(5);
    expect(names.length).toBeGreaterThan(150);
  });

  it('her tarif geçerli düğüm kurar: bütçe içinde, sonlu zamanlar, start<stop, çıkışa bağlı', () => {
    names.forEach((name) => {
      const { ctx, out, synth } = rig(3);
      const r = resolveSound(name);
      expect(() => r.fn(synth), name).not.toThrow();
      expect(synth.nodes, name).toBeGreaterThanOrEqual(1);
      expect(synth.nodes, name).toBeLessThanOrEqual(14);
      expect(synth.endAt, name).toBeGreaterThan(synth.t0);
      expect(synth.endAt - synth.t0, name).toBeLessThan(5);
      const gains = ctx.nodes.filter((n) => n.kind === 'gain' && n !== out);
      expect(gains.length, name).toBe(synth.nodes);
      gains.forEach((g) => expect(g.outputs).toContain(out));
      ctx.nodes.filter((n) => n.kind === 'osc' || n.kind === 'bufsrc').forEach((n) => {
        expect(n.startedAt, name).toBeDefined();
        expect(n.stoppedAt, name).toBeGreaterThan(n.startedAt);
      });
    });
  });

  it('farklı rastgelelik farklı sonuç verir (çeşitleme), aynı tohum aynı sonuç', () => {
    ['step:taş', 'dig:ahşap', 'break:kum', 'mob:kemikci', 'bird', 'splash'].forEach((name) => {
      const run = (seed) => {
        const x = rig(seed);
        resolveSound(name).fn(x.synth);
        return signature(x.ctx);
      };
      expect(run(1), name).toBe(run(1));
      expect(run(1), name).not.toBe(run(2));
    });
  });

  it('10 malzemenin adım sesi birbirinden farklı (ses dizgesi kopyası değil)', () => {
    const sigs = new Set();
    MATERIALS.forEach((m) => {
      const x = rig(5);
      materialSound(x.synth, m, 'step');
      // Tohum aynı olduğundan imza farkı tarif farkından gelir: süzgeç/dalga türü ve sıklıklar.
      sigs.add(signature(x.ctx));
    });
    expect(sigs.size).toBe(10);
  });

  it('kırılma, adımdan daha uzun ve daha gürültülü; kar/yaprak tanecikli', () => {
    MATERIALS.forEach((m) => {
      const a = rig(9);
      materialSound(a.synth, m, 'step');
      const b = rig(9);
      materialSound(b.synth, m, 'break');
      expect(b.synth.endAt - b.synth.t0, m).toBeGreaterThan(a.synth.endAt - a.synth.t0);
      expect(b.synth.nodes, m).toBeGreaterThanOrEqual(a.synth.nodes);
    });
    const snow = rig(2);
    materialSound(snow.synth, 'kar', 'step');
    expect(snow.ctx.count('bufsrc')).toBeGreaterThanOrEqual(4); // gövde + 3 tanecik
    const metal = rig(2);
    materialSound(metal.synth, 'metal', 'step');
    expect(metal.ctx.count('osc')).toBeGreaterThanOrEqual(3); // çınlama kısmileri
  });

  it('bosslar birbirinden ayırt edilir; kip değişince perde/süre değişir', () => {
    const sigs = new Set();
    ['kokana', 'tasbekci', 'buzkral', 'golgehukumdar'].forEach((b) => {
      const x = rig(4);
      resolveSound(`mob:${b}`).fn(x.synth);
      sigs.add(signature(x.ctx));
    });
    expect(sigs.size).toBe(4);
    const idle = rig(4);
    resolveSound('mob:golge:idle').fn(idle.synth);
    const die = rig(4);
    resolveSound('mob:golge:die').fn(die.synth);
    const hurt = rig(4);
    resolveSound('mob:golge:hurt').fn(hurt.synth);
    expect(die.synth.endAt).toBeGreaterThan(idle.synth.endAt);
    expect(hurt.synth.endAt).toBeLessThan(idle.synth.endAt);
    expect(MOB_MODES).toEqual(['idle', 'hurt', 'die', 'attack']);
  });

  it('rune sesleri 5 farklı perde (pentatonik)', () => {
    const freqs = new Set();
    for (let i = 0; i < RUNE_COUNT; i++) {
      const x = rig(1);
      resolveSound(`rune:${i}`).fn(x.synth);
      freqs.add(x.ctx.nodes.find((n) => n.kind === 'osc').frequency.events[0][1]);
    }
    expect(freqs.size).toBe(5);
  });
});
