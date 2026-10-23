/*
 * KEŞİF sim — yapı kalite denetimi (gerçek dünya blokları): yüzen ada kayanın içine gömülmez, sandıkları yürünebilir yerde;
 * kamp/harabe/gizli mağara/köy/gözcü kulesi sandıklarına girişten yürünür.
 *
 * Her tohum AYRI test: tek senkron 60 sn+ blok (yüklü makinede) vitest işçisinin ana sürece RPC yanıtını keser
 * ("Timeout calling onTaskUpdate" → tüm çalışma kırmızı). Testler arasında setup.js olay döngüsüne nefes verir.
 */
import { describe, expect, it, vi } from 'vitest';
import { B } from './blocks.js';
import { allStructures } from './structures.js';
import { makeWorldGet, standable, walkPath } from './structuresTestKit.js';

vi.setConfig({ testTimeout: 600000 });
const DOORS = new Set([B.LOCKED_DOOR, B.BOSS_DOOR, B.SEAL_BARRIER]);
const SEEDS = [12345, 777, 4242, 99, 31337, 2024];

function chestNeighbors(W, c) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].flatMap((d) => [-1, 0, 1].map((dy) => ({ x: c.x + d[0], y: c.y + dy, z: c.z + d[1] })))
    .filter((q) => standable(W.get, q.x, q.y, q.z));
}

describe('yüzen ada', () => {
  let islands = 0;
  it.each(SEEDS)('ada tavana kıskaçlanıp araziye gömülmez; sandıkların yanında durulabilir; sarmaşık alttan üste ve ada kenarı üstünde standable (tohum %i)', (seed) => {
    const W = makeWorldGet(seed);
    allStructures(seed).filter((s) => s.type === 'yuzenada').forEach((a) => {
      islands++;
      const il = a.island;
      expect(il.topY - il.groundY, a.id + ' yükselti').toBeGreaterThanOrEqual(14);
      expect(a.ladder.bottomY, a.id + ' sarmaşık').toBeLessThanOrEqual(a.ladder.topY);
      a.chests.forEach((c, i) => {
        expect(chestNeighbors(W, c).length, a.id + ' sandık ' + i + ' yanı').toBeGreaterThan(0);
      });
      expect(standable(W.get, a.ladder.x - 1, il.topY + 1, a.ladder.z), a.id + ' ada kenarı').toBe(true);
    });
  });
  it('tüm tohumlarda yeterince yüzen ada üretilir', () => {
    expect(islands).toBeGreaterThan(10);
  });
});

describe('açık dünya yapıları: girişten sandıklara yürünür (kapı/bulmaca/tırmanış gerektirmeyenler)', () => {
  it.each(SEEDS)('kamp, harabe, gizli mağara: her sandığın yanına girişten yürüyüş yolu var (tohum %i)', (seed) => {
    const bad = [];
    const W = makeWorldGet(seed);
    allStructures(seed).filter((s) => ['kamp', 'harabe', 'gizlimagara'].indexOf(s.type) >= 0).forEach((s) => {
      const ent = s.entrance;
      if (!ent) return;
      const box = { x0: s.bounds.x0 - 6, z0: s.bounds.z0 - 6, x1: s.bounds.x1 + 6, z1: s.bounds.z1 + 6 };
      if (!standable(W.get, ent.x, ent.y, ent.z)) { bad.push([seed, s.id, 'giriş']); return; }
      (s.chests || []).forEach((c) => {
        const spots = chestNeighbors(W, c);
        if (spots.length === 0) { bad.push([seed, s.id, 'sandık yanı yok', c.x, c.y, c.z]); return; }
        if (!spots.some((sp) => walkPath(W.get, ent, sp, box, DOORS).ok)) bad.push([seed, s.id, 'sandığa yol yok', c.x, c.y, c.z]);
      });
    });
    expect(bad.slice(0, 8), JSON.stringify(bad.slice(0, 8))).toEqual([]);
  });
});

describe('sandık blokları', () => {
  let total = 0;
  it.each(SEEDS)('her yapının her sandık girdisi dünyada gerçekten sandık (köy bahçesi/fener direği sandığı ezmez) (tohum %i)', (seed) => {
    const bad = [];
    const W = makeWorldGet(seed);
    allStructures(seed).forEach((s) => {
      (s.chests || []).forEach((c) => {
        total++;
        const id = W.get(c.x, c.y, c.z);
        if (id !== B.CHEST && id !== B.REWARD_CHEST) bad.push([seed, s.id, c.x, c.y, c.z, id]);
      });
    });
    expect(bad.slice(0, 8), JSON.stringify(bad.slice(0, 8))).toEqual([]);
  });
  it('tüm tohumlarda yeterince sandık girdisi vardır', () => {
    expect(total).toBeGreaterThan(500);
  });
});
