import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { cityRulesFor } from '../sim/city/cityZone.js';

vi.setConfig({ testTimeout: 120000 });

/**
 * qa_p1 G5: şehir koruması bir kırma/yerleştirmeyi reddedince oyuncu nedenini görür ("Neon Meridyen yapıları korunuyor.").
 * Önceden 'blockDenied' olayını hiçbir sistem dinlemiyordu: cepheyi kırmaya çalışmak sessizce başarısız oluyordu.
 */
function inCity(k) {
  k.mgr.swap('neon', { reason: 'debug' });
  k.step(2);
}

function protectedCell(G) {
  const cr = cityRulesFor(G.world.seed);
  // yol koridoru (yerleştirme yasak) ve dolu bir koruma hücresi: Kapı Meydanı'nda zemin bloğu (kırma yasak)
  for (let z = 1; z < 6; z++) {
    if (cr.isNoBuild(0, 65, z)) return { x: 0, y: 65, z };
  }
  return null;
}

describe('blockDenied → oyuncu mesajı', () => {
  it('şehirde reddedilen yerleştirme: ipucu "Neon Meridyen yapıları korunuyor." + ses; hız sınırı (aynı anahtar bekleme)', () => {
    const k = makeDimG();
    inCity(k);
    const { G } = k;
    const c = protectedCell(G);
    expect(c).not.toBeNull();
    const n0 = k.hints.length;
    G.world.setBlock(c.x, c.y, c.z, 1);
    expect(G.world.getBlock(c.x, c.y, c.z)).toBe(0);
    const added = k.hints.slice(n0).filter((h) => /korunuyor/.test(h.text));
    expect(added.length).toBe(1);
    expect(added[0].op).toMatchObject({ priority: 3 });
    expect(String(added[0].op.key)).toMatch(/^dim:denied:/);
  });

  it('abonelik etkin dünyaya taşınır: her boyutta tam 1 dinleyici (sızıntı yok), diğer dünyada 0', () => {
    const k = makeDimG();
    const { G } = k;
    const count = (w) => w._listeners.blockDenied.length;
    const ow = G.world;
    expect(count(ow)).toBe(1);
    for (let i = 0; i < 6; i++) {
      k.mgr.swap('neon', { reason: 'debug' });
      k.step(1);
      const city = G.world;
      expect(city).not.toBe(ow);
      expect(count(city)).toBe(1);
      expect(count(ow)).toBe(0);
      k.mgr.swap('overworld', { reason: 'debug' });
      k.step(1);
      expect(G.world).toBe(ow);
      expect(count(ow)).toBe(1);
      expect(count(city)).toBe(0);
    }
  });
});
