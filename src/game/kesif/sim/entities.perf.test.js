import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { HOSTILE_KEYS, PASSIVE_KEYS } from './mobTypes.js';
import { Spawner } from './spawner.js';
import { makeEm, makePlayer, makeWorld } from './mobAITestKit.js';
import { cpuMs, loadScale, scaled } from '../../../test/perfScale.js';

/** Çalışma süresini 3 dilime böler, EN İYİ dilimin kare başı ms'sini verir (geçici yük sıçramalarına dayanıklı). */
function bestSlice(frames, step) {
  const slice = Math.max(1, Math.floor(frames / 3));
  loadScale(); // ölçümden önceki yoğunluğu kaydet
  let best = Infinity;
  for (let s = 0; s < 3; s++) {
    const t0 = cpuMs();
    for (let i = 0; i < slice; i++) step();
    best = Math.min(best, (cpuMs() - t0) / slice);
  }
  return best;
}

/** Engebeli ama hızlı sahte arazi (düz zemin + dağınık sütunlar) — gerçek World.getBlock hızına yakın. */
function terrain() {
  return makeWorld({
    fill: (x, y, z) => {
      if (y <= 0) return B.STONE;
      if (y <= 2 && ((x * 7 + z * 13) & 31) === 0) return B.STONE;
      return 0;
    },
  });
}

function bench(n, ctx, frames, rmax = 54) {
  const w = terrain();
  const { em } = makeEm(w, { maxMobs: 400, seed: 11 });
  const keys = PASSIVE_KEYS.filter((k) => k !== 'balik').concat(HOSTILE_KEYS);
  for (let i = 0; i < n; i++) {
    const a = i * 2.399963;
    const r = 6 + ((i * 37) % rmax);
    em.spawn(keys[i % keys.length], Math.cos(a) * r, 1, Math.sin(a) * r, { aggro: i % 3 === 0 });
  }
  const p = makePlayer(0, 1, 0);
  for (let i = 0; i < 120; i++) em.update(1 / 60, p, ctx); // ısınma (JIT + durum dağılımı)
  const ms = bestSlice(frames, () => em.update(1 / 60, p, ctx));
  return { ms, mobs: em.mobs.size };
}

describe('Performans', () => {
  it('200 varlık güncellemesi ortalama < 2 ms (gece, kovalayan düşmanlarla)', () => {
    const r = bench(200, { dayFactor: 0 }, 900);
    expect(r.mobs).toBe(200);
    console.log('200 varlık gece: ' + r.ms.toFixed(3) + ' ms/kare');
    expect(r.ms).toBeLessThan(scaled(2));
  });

  it('200 varlığın hepsi yakında (≤ 36 blok, LOD yok): ortalama < 2 ms', () => {
    const r = bench(200, { dayFactor: 0 }, 900, 30);
    console.log('200 yakın varlık: ' + r.ms.toFixed(3) + ' ms/kare');
    expect(r.ms).toBeLessThan(scaled(2));
  });

  it('200 varlık güncellemesi ortalama < 2 ms (gündüz)', () => {
    const r = bench(200, { dayFactor: 1 }, 900);
    console.log('200 varlık gündüz: ' + r.ms.toFixed(3) + ' ms/kare');
    expect(r.ms).toBeLessThan(scaled(2));
  });

  it('doğma + yok olma döngüsü kareyi şişirmez (spawner + 200 varlık)', () => {
    const w = terrain();
    const { em } = makeEm(w, { maxMobs: 400, seed: 3 });
    const sp = new Spawner({ seed: 3, world: w, em });
    const p = makePlayer(0, 1, 0);
    for (let i = 0; i < 200; i++) em.spawn(HOSTILE_KEYS[i % HOSTILE_KEYS.length], ((i * 5) % 90) - 45, 1, ((i * 11) % 90) - 45);
    const ctx = { dayFactor: 0 };
    for (let i = 0; i < 60; i++) {
      sp.update(1 / 60, p, ctx);
      em.update(1 / 60, p, ctx);
    }
    const ms = bestSlice(900, () => {
      sp.update(1 / 60, p, ctx);
      em.update(1 / 60, p, ctx);
    });
    console.log('spawner + 200 varlık: ' + ms.toFixed(3) + ' ms/kare');
    expect(ms).toBeLessThan(scaled(2.5));
  });

  it('yol bulma kare başına bütçeli: 50 tıkalı yaratık kareyi 8 ms üstüne çıkarmaz', () => {
    const w = makeWorld();
    for (let x = -30; x <= 30; x++) for (let y = 1; y <= 4; y++) w.setBlock(x, y, -6, B.STONE);
    const { em } = makeEm(w, { maxMobs: 400 });
    for (let i = 0; i < 50; i++) em.spawn('golge', (i % 25) - 12 + 0.5, 1, -2 - (i % 3), { aggro: true });
    const p = makePlayer(0.5, 1, -12);
    // 20 karelik gruplar halinde CPU zamanı (Windows'ta CPU saati ~15 ms'lik adımlarla ilerler; tek kare ölçülemez).
    // En kötü grubun kare başı ortalaması 8 ms'yi aşmamalı: bütçesiz yol bulma tek karede bile grubu şişirir.
    const batches = [];
    loadScale();
    for (let b = 0; b < 30; b++) {
      const t = cpuMs();
      for (let i = 0; i < 20; i++) em.update(1 / 60, p, { dayFactor: 0 });
      batches.push((cpuMs() - t) / 20);
    }
    const worstBatch = Math.max(...batches);
    console.log('50 tıkalı yaratık, en kötü 20 karelik grup ort.: ' + worstBatch.toFixed(2) + ' ms');
    expect(worstBatch).toBeLessThan(scaled(8));
  });
});
