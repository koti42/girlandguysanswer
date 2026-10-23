import { describe, expect, it } from 'vitest';
import { PROP_AMBIENT_SOUNDS, PROP_SOUNDS } from './audioRecipesProps.js';
import { BASE_SOUND_NAMES, listSoundNames, makeSynth, resolveSound } from './audioRecipes.js';
import { createFakeAudioContextClass } from './fakeAudioContext.js';
import { mulberry32 } from './sim/rng.js';
import { INTERIOR_DEFS } from './sim/props/propDefsInterior.js';

function rig(seed) {
  const AC = createFakeAudioContextClass();
  const ctx = new AC();
  const out = ctx.createGain();
  const bufs = { white: ctx.createBuffer(1, 100, 44100), brown: ctx.createBuffer(1, 100, 44100) };
  const synth = makeSynth(ctx, out, bufs, { t0: ctx.currentTime + 0.005, rand: mulberry32(seed || 1) });
  return { ctx, out, synth };
}

const NAMES = PROP_SOUNDS.map((m) => m[0]);

describe('prop ses tarifleri', () => {
  it('15 tarif, benzersiz `prop:` adları; hepsi kayıt defterinde çözülür', () => {
    expect(NAMES.length).toBe(15);
    expect(new Set(NAMES).size).toBe(15);
    NAMES.forEach((n) => {
      expect(n).toMatch(/^prop:[a-z_]+$/);
      expect(resolveSound(n), n).not.toBeNull();
      expect(BASE_SOUND_NAMES).toContain(n);
      expect(listSoundNames()).toContain(n);
    });
    PROP_AMBIENT_SOUNDS.forEach((n) => expect(NAMES).toContain(n));
  });

  it('her tarif geçerli düğüm kurar: ≤ 14 düğüm (ortam ≤ 4), sonlu zamanlar, kullanım < 1 sn, ortam ≤ 2,9 sn, start<stop, çıkışa bağlı', () => {
    NAMES.forEach((n) => {
      for (let seed = 1; seed <= 3; seed++) {
        const { ctx, out, synth } = rig(seed);
        const r = resolveSound(n);
        expect(() => r.fn(synth), n).not.toThrow();
        expect(synth.nodes, n).toBeGreaterThanOrEqual(1);
        expect(synth.nodes, n).toBeLessThanOrEqual(PROP_AMBIENT_SOUNDS.indexOf(n) >= 0 ? 6 : 5);
        const dur = synth.endAt - synth.t0;
        expect(dur, n).toBeGreaterThan(0);
        expect(dur, n).toBeLessThan(PROP_AMBIENT_SOUNDS.indexOf(n) >= 0 ? 3.1 : 1.0);
        const gains = ctx.nodes.filter((x) => x.kind === 'gain' && x !== out);
        expect(gains.length, n).toBe(synth.nodes);
        gains.forEach((g) => expect(g.outputs).toContain(out));
        ctx.nodes.filter((x) => x.kind === 'osc' || x.kind === 'bufsrc').forEach((x) => {
          expect(Number.isFinite(x.startedAt) && Number.isFinite(x.stoppedAt), n).toBe(true);
          expect(x.stoppedAt).toBeGreaterThan(x.startedAt);
        });
      }
    });
  });

  it('seçenekler geçerli: öncelik/menzil/ara; tanımların amb.sound adları tarif listesinde; aile dostu (siren/silah yok)', () => {
    PROP_SOUNDS.forEach((m) => {
      expect(typeof m[1]).toBe('function');
      expect(m[2].p).toBeGreaterThanOrEqual(1);
      expect(m[2].r).toBeGreaterThan(5);
      expect(m[2].gap).toBeGreaterThan(0);
    });
    INTERIOR_DEFS.forEach((d) => { if (d.amb) expect(NAMES).toContain(d.amb.sound); });
    NAMES.forEach((n) => expect(/siren|silah|patlama|bagir/i.test(n)).toBe(false));
  });
});
