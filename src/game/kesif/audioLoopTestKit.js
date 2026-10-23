/*
 * Test desteği (yalnız testler/ölçümler): getLoopContext() benzeri sahte döngü bağlamı + canlı düğüm sayaçları.
 *
 *   makeLoop({state}) → loop {ctx, sfx, music, amb, white, brown, running, musicOn, lowPower, held, holdMusic(b)}   (fakeAudioContext üzerinde)
 *   liveSources(ctx) → şu an canlı (başlamış ve durma zamanı gelmemiş) osilatör + tampon kaynağı sayısı
 *   liveSourceList(ctx) → aynı, düğüm dizisi
 *   connectedCount(ctx) → bağlantısı kesilmemiş düğüm sayısı (destination hariç)
 *   advance(ctx, sec, step) → bağlamı küçük adımlarla ilerletir (onended tetiklenir)
 *   makeVehicle(cls) → vehiclePhysics durumu
 */
import { createFakeAudioContextClass } from './fakeAudioContext.js';
import { createVehicle } from './sim/city/vehicle/vehiclePhysics.js';

export function makeLoop(opts) {
  const o = opts || {};
  const AC = createFakeAudioContextClass({ initialState: o.state || 'running' });
  const ctx = new AC();
  const mk = (sec) => ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
  const loop = {
    ctx,
    sfx: ctx.createGain(),
    music: ctx.createGain(),
    amb: ctx.createGain(),
    white: mk(1.6),
    brown: mk(2.4),
    running: true,
    musicOn: true,
    lowPower: false,
    held: false,
    holdMusic(b) {
      loop.held = Boolean(b);
    },
  };
  loop.sfx.connect(ctx.destination);
  loop.music.connect(ctx.destination);
  loop.amb.connect(ctx.destination);
  return loop;
}

export function liveSourceList(ctx) {
  const out = [];
  for (let i = 0; i < ctx.nodes.length; i++) {
    const n = ctx.nodes[i];
    if (n.kind !== 'osc' && n.kind !== 'bufsrc') continue;
    if (n.startedAt === undefined) continue;
    if (n.stoppedAt !== undefined && n.stoppedAt <= ctx.currentTime) continue;
    out.push(n);
  }
  return out;
}

export function liveSources(ctx) {
  return liveSourceList(ctx).length;
}

export function connectedCount(ctx) {
  let c = 0;
  for (let i = 0; i < ctx.nodes.length; i++) {
    const n = ctx.nodes[i];
    if (n.kind === 'destination') continue;
    if (n.connected !== false) c++;
  }
  return c;
}

export function advance(ctx, sec, step) {
  const h = step || 0.05;
  let left = sec;
  while (left > 1e-9) {
    const d = left > h ? h : left;
    ctx.advance(d);
    left -= d;
  }
}

export function makeVehicle(cls, opts) {
  return createVehicle(cls || 'taksi', opts || { x: 0, y: 64, z: 0 });
}
