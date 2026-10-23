import { describe, expect, it } from 'vitest';
import { ColliderIndex } from '../sim/props/colliderIndex.js';
import { createCaster } from './magicCast.js';
import { makeG } from './blocksTestKit.js';

/*
 * qa_p2 — Kuantum Sıçrayışı kapalı kapı prop'undan (ColliderIndex kutusu) geçemez: önceden yalnız blokları denetliyordu, kapı/mobilya prop'larının
 * çarpışma kutuları atlanıyor, oyuncu kilitli odaya ışınlanıp kilidi atlayabiliyordu.
 */
describe('blink: prop çarpışma kutularına çarpar', () => {
  function setup() {
    const k = makeG({ mode: 'macera', held: 'item:asa_kuantum' });
    const { G } = k;
    G.teleport = () => ({});
    const caster = createCaster(G, {});
    return { G, caster };
  }

  it('engelsiz: 8 blokluk sıçrayış hedefi bulunur', () => {
    const { G, caster } = setup();
    const t = caster.blinkTarget({ x: 0, y: 0, z: -1 }, 8);
    expect(t).not.toBeNull();
    expect(t.distance).toBeGreaterThan(5);
    expect(G.body.z).toBeDefined();
  });

  it('3 blok ötede kapalı kapı kutusu (3 geniş × 3 yüksek × 0,2 kalın): hedef kapının ÖNÜNDE durur ya da yok; ardına geçmez', () => {
    const { G, caster } = setup();
    const b = G.body;
    const cl = new ColliderIndex();
    const zDoor = b.z - 3.5;
    cl.add(7, [[b.x - 1.5, b.y, zDoor - 0.1, b.x + 1.5, b.y + 3, zDoor + 0.1]]);
    G.colliders = cl;
    const t = caster.blinkTarget({ x: 0, y: 0, z: -1 }, 8);
    if (t) expect(t.z).toBeGreaterThan(zDoor + 0.1 - 1e-6); // kapının bu yanında
    expect(!t || t.distance < 3.4).toBe(true);
  });

  it('yan yana kapı kutusu yoksa (kutu ışının dışında) sıçrayış engellenmez', () => {
    const { G, caster } = setup();
    const b = G.body;
    const cl = new ColliderIndex();
    cl.add(7, [[b.x + 4, b.y, b.z - 6, b.x + 6, b.y + 3, b.z - 5.8]]);
    G.colliders = cl;
    const t = caster.blinkTarget({ x: 0, y: 0, z: -1 }, 8);
    expect(t).not.toBeNull();
    expect(t.distance).toBeGreaterThan(5);
  });
});
