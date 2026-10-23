/*
 * content: portal tabancası girdisi — sağ tık etkileşimli bloğa (kol/sandık) KULLAN'dır, ateş değildir (regresyon).
 * Hata: raftan tabanca alınan sağ tık aynı tikte kola ateşleniyor ("Bu yüzey portal tutmaz") ve elde tabancayla
 * sıfırlama/raf kollarına sağ tıklamak ateş sayılıp kolu kullanılamaz kılıyordu.
 */
import { describe, expect, it } from 'vitest';
import { B } from '../sim/blocks.js';
import { makeContentG } from './contentTestKit.js';

function gunRoom() {
  const kit = makeContentG({ seed: 4242, pos: { x: 5.5, y: 70, z: 6.5 } });
  kit.init();
  kit.load(5, 5, 24);
  const { G } = kit;
  for (let y = 70; y <= 72; y++) for (let x = 3; x <= 8; x++) for (let z = 3; z <= 7; z++) G.world.setBlock(x, y, z, 0);
  for (let x = 3; x <= 8; x++) for (let z = 3; z <= 7; z++) G.world.setBlock(x, 69, z, B.STONE);
  G.inventory.add('item:portal_tabancası', 1);
  G.player.yaw = 0;
  G.player.pitch = 0;
  G.body.x = 5.5;
  G.body.z = 6.5;
  G.eyeSim.x = 5.5;
  G.eyeSim.y = 71.62;
  G.eyeSim.z = 6.5;
  return kit;
}

describe('content: portal tabancası — sağ tık = kullan / ateş ayrımı', () => {
  it('düz bloğa sağ tık turuncu portal ateşler; sola tık her zaman mavi ateşler', () => {
    const kit = gunRoom();
    const { G } = kit;
    expect(G.inventory.heldItem()).toBe('item:portal_tabancası');
    G.world.setBlock(5, 71, 4, B.STONE);
    G.inputState.placePressed = true;
    kit.step(1);
    const shots = kit.emitted('portalShot');
    expect(shots.length).toBe(1);
    expect(shots[0].color).toBe('turuncu');
    expect(shots[0]).toMatchObject({ x: 5, y: 71, z: 4 });
    kit.step(3);
    G.inputState.attackPressed = true;
    kit.step(1);
    expect(kit.emitted('portalShot').map((e) => e.color)).toEqual(['turuncu', 'mavi']);
  });

  it('kola sağ tık: tabanca ateşlemez (kol kullanılır); sola tık yine ateşler', () => {
    const kit = gunRoom();
    const { G } = kit;
    G.world.setBlock(5, 71, 4, B.LEVER);
    G.inputState.placePressed = true;
    kit.step(1);
    expect(kit.emitted('portalShot').length).toBe(0);
    kit.step(8);
    G.inputState.attackPressed = true;
    kit.step(1);
    expect(kit.emitted('portalShot').map((e) => e.color)).toEqual(['mavi']);
  });

  it('aynı tikte bir bulmaca "use" işlediyse (raftan tabanca alma) yedek yol ateş etmez', () => {
    const kit = gunRoom();
    const { G, S } = kit;
    G.world.setBlock(5, 71, 4, B.STONE);
    S.lastUse.tick = G.time.tick + 1; // blocks sistemi bu tikte 'use' işledi
    G.inputState.placePressed = true;
    kit.step(1);
    expect(kit.emitted('portalShot').length).toBe(0);
  });
});
