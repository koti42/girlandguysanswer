import { describe, expect, it, vi } from 'vitest';
import { createTraffic, TICK } from './trafficAI.js';
import { trafficNet } from './junctions.js';
import { BUMP_REPEAT_MAX, bumpPolicy } from './trafficFollow.js';

vi.setConfig({ testTimeout: 120000 });

/*
 * QA3-001 (qa_p3 G5): oyuncu gazı basılı bir trafik aracının arkasına yapışınca (arkadan çarpma) araç her çarpmada 1,5 sn durduğu için kavşak kutusunun içinde
 * dakikalarca ~1 m/sn yürüyordu (kutuyu tıkıyor, çapraz trafik bekliyordu). Politika: arkadan çarpılan araç durmaz; 10 sn'de 4. çarpmada araç solarak silinir.
 */
const car = (o) => Object.assign({
  id: 7, x: 0, z: 0, yaw: 0, halfLen: 2.1,
}, o);

describe('bumpPolicy (saf)', () => {
  it('oyuncu ARKADA ise bekleme 0 (araç durmaz); önde/yanda ise 1,5 sn', () => {
    const hist = new Map();
    // yaw 0: ileri = −Z. Araç (0,0); oyuncu (0,+4) arkada
    let p = bumpPolicy(car(), 0, 4, hist, 100);
    expect(p.behind).toBe(true);
    expect(p.hold).toBe(0);
    // oyuncu önde (0,−4)
    p = bumpPolicy(car({ id: 8 }), 0, -4, hist, 100);
    expect(p.behind).toBe(false);
    expect(p.hold).toBe(1.5);
    // tam yanda (3,0): arkada sayılmaz
    p = bumpPolicy(car({ id: 9 }), 3, 0, hist, 100);
    expect(p.hold).toBe(1.5);
    // yaw 90°: ileri (−1,0); oyuncu (+5,0) arkada
    p = bumpPolicy(car({ id: 10, yaw: Math.PI / 2 }), 5, 0, hist, 100);
    expect(p.behind).toBe(true);
  });

  it('oyuncu konumu bilinmiyorsa (NaN) eski davranış: 1,5 sn bekleme', () => {
    const p = bumpPolicy(car({ id: 11 }), NaN, NaN, new Map(), 5);
    expect(p.hold).toBe(1.5);
    expect(p.behind).toBe(false);
  });

  it('aynı araca 10 sn içinde 4. çarpma → vanish; pencere dışı sayaç sıfırlanır; geriye giden saat güvenli', () => {
    const hist = new Map();
    for (let k = 1; k < BUMP_REPEAT_MAX; k++) expect(bumpPolicy(car(), 0, 4, hist, 10 + k * 2).vanish).toBe(false);
    expect(bumpPolicy(car(), 0, 4, hist, 17).vanish).toBe(true);
    // sayaç sıfırlandı
    expect(bumpPolicy(car(), 0, 4, hist, 18).vanish).toBe(false);
    // pencere dışı
    const h2 = new Map();
    bumpPolicy(car({ id: 3 }), 0, 4, h2, 0);
    bumpPolicy(car({ id: 3 }), 0, 4, h2, 3);
    bumpPolicy(car({ id: 3 }), 0, 4, h2, 6);
    expect(bumpPolicy(car({ id: 3 }), 0, 4, h2, 30).vanish).toBe(false);
    // saat geri giderse (yükleme) sıfırlanır
    expect(bumpPolicy(car({ id: 3 }), 0, 4, h2, 1).vanish).toBe(false);
  });

  it('kayıt tablosu sınırlı (64 üstünde temizlenir)', () => {
    const hist = new Map();
    for (let i = 0; i < 200; i++) bumpPolicy(car({ id: i }), 0, 4, hist, 1);
    expect(hist.size).toBeLessThanOrEqual(64);
  });
});

/** Gazı basılı oyuncu bir AI aracının hemen arkasında: AI aracının 40 sn'deki ilerlemesi (m) ve kavşak kutusunda (mode 2) geçirdiği süre. */
function chase(policy, backoff) {
  const seed = 4242;
  const tn = trafficNet(seed);
  const tr = createTraffic(tn, { seed, cap: 0, closed: true });
  tr.setTime(1000);
  tr.setEnv({ phase: 0.5 });
  // 2 şeritli arter kenarı (x=240 sütunu), uzun
  const de = tn.dedges.filter((d) => d.lanes === 2 && d.s1 - d.s0 > 60).sort((a, b) => a.id - b.id)[5];
  const ai = tr.spawnAt(de.id, 0, de.s0 + 30, { v: 9, cls: 0 });
  expect(ai).toBeTruthy();
  const hist = new Map();
  let vc = 20; // oyuncu hızı
  let gap = 14; // oyuncu ile araç arası (m)
  let t = 0;
  let inBox = 0;
  let still = 0;
  let travelled = 0;
  let px = ai.x;
  let pz = ai.z;
  let bumps = 0;
  let vanished = false;
  const obs = [{
    x: 0, y: 64, z: 0, yaw: 0, hl: 2.2, hw: 0.95, vx: 0, vz: 0, kind: 1,
  }];
  for (let i = 0; i < 40 / TICK; i++) {
    const c = tr.carById(ai.id);
    if (!c || !c.alive || c.state === 2) { vanished = true; break; }
    const fx = -Math.sin(c.yaw);
    const fz = -Math.cos(c.yaw);
    // oyuncu: tam gaz (16 m/sn², tavan 38), araca yaklaşır
    vc = Math.min(38, vc + 16 * TICK);
    gap += (c.v - vc) * TICK;
    if (gap <= 0) {
      bumps++;
      vc *= 0.5;
      gap = backoff || 0.3;
      const pol = policy === 'new' ? bumpPolicy(c, px, pz, hist, t) : { hold: 1.5, vanish: false };
      if (pol.vanish) { c.state = 2; vanished = true; break; }
      if (pol.hold > 0) tr.bump(c.id, pol.hold);
    }
    px = c.x - fx * (c.halfLen + 2.2 + gap);
    pz = c.z - fz * (c.halfLen + 2.2 + gap);
    obs[0].x = px; obs[0].z = pz; obs[0].yaw = c.yaw; obs[0].vx = fx * vc; obs[0].vz = fz * vc;
    tr.setObstacles(obs, 1);
    tr.setPlayer(px, 64, pz, c.yaw);
    const x0 = c.x;
    const z0 = c.z;
    tr.step(TICK);
    t += TICK;
    travelled += Math.hypot(c.x - x0, c.z - z0);
    if (c.mode === 2) inBox += TICK;
    if (c.v < 3 && !c.sigWait) still += TICK;
  }
  return {
    travelled, inBox, still, bumps, vanished,
  };
}

describe('QA3-001 regresyon: gazı basılı oyuncu bir AI aracına yapışır', () => {
  it('yapışık (her adımda çarpan) oyuncu: eski politika aracı yerinde tutar; yeni politika araç durmaz ve 4. çarpmada araç solarak silinir', () => {
    const legacy = chase('legacy');
    const fixed = chase('new');
    expect(legacy.still).toBeGreaterThan(20); // hata yeniden üretildi: araç 40 sn'nin çoğunda duruyor/sürünüyor
    expect(legacy.travelled).toBeLessThan(30);
    expect(fixed.vanished).toBe(true);
    expect(fixed.bumps).toBeLessThanOrEqual(BUMP_REPEAT_MAX);
    expect(fixed.still).toBeLessThan(2);
  });

  it('gaza her çarpmadan sonra 12 m geri çekilen oyuncu: eski politikada araç her seferinde 1,5 sn durur; yeni politikada akışına devam eder', () => {
    const legacy = chase('legacy', 12);
    const fixed = chase('new', 12);
    expect(fixed.vanished || fixed.travelled > legacy.travelled * 1.2).toBe(true);
    expect(fixed.still).toBeLessThanOrEqual(legacy.still);
  });
});
