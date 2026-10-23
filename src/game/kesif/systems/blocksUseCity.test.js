import { describe, expect, it } from 'vitest';
import { B } from '../sim/blocks.js';
import { setClockPhase } from '../sim/daynight.js';
import { events, makeG } from './blocksTestKit.js';

function use(g, x, y, z) {
  g.aim(x, y, z);
  g.step(1, { placePressed: true });
}

/** qa_p1 G5: Neon Meridyen'de yatak YALNIZ geceyi atlar (dims.neon.rules.beds='skipOnly'); ana diyar doğma noktası ezilmez. */
describe('şehirde yatak (skipOnly)', () => {
  function citySetup() {
    const g = makeG();
    g.G.dim = 'neon';
    g.G.bedSpawn = { x: 5.5, y: 42, z: 5.5 }; // ana diyar yatağı
    g.G.world.setBlock(6, 41, 5, B.BED);
    return g;
  }

  it('gündüz: uyunmaz, ana diyar yatak noktası korunur, ipucu şehir doğmasını söylemez-ayarlamaz', () => {
    const g = citySetup();
    setClockPhase(g.G.clock, 0.25);
    use(g, 6, 41, 5);
    expect(g.G.bedSpawn).toEqual({ x: 5.5, y: 42, z: 5.5 });
    expect(events(g.G, 'slept').length).toBe(0);
    expect(g.G.hud.hint).not.toMatch(/bu yatağa ayarlandı/);
  });

  it('gece: sabaha atlar ama doğma noktası değişmez', () => {
    const g = citySetup();
    setClockPhase(g.G.clock, 0.75);
    const day0 = g.G.clock.day;
    use(g, 6, 41, 5);
    expect(g.G.clock.day).toBe(day0 + 1);
    expect(events(g.G, 'slept').length).toBe(1);
    expect(g.G.bedSpawn).toEqual({ x: 5.5, y: 42, z: 5.5 });
  });

  it('ana diyarda davranış aynı: doğma noktası yatağa taşınır', () => {
    const g = makeG();
    g.G.world.setBlock(6, 41, 5, B.BED);
    setClockPhase(g.G.clock, 0.25);
    use(g, 6, 41, 5);
    expect(g.G.bedSpawn).toEqual({ x: 6.5, y: 42, z: 5.5 });
  });
});
