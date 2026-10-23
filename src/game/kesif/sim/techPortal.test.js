import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import {
  COLORS, MAX_EXIT_SPEED, MIN_EXIT_SPEED, PORTAL_COOLDOWN, PORTAL_RANGE, bodyFits, placeOpenPortal, portalCellAt, portalEntry,
  portalFrame, portalSupport, pruneBrokenPortals, restorePortals, safeExit, serializePortals, travelThrough,
} from './techPortal.js';
import { makeWorld, newTech, run } from './techTestKit.js';

const EMPTY = { mavi: null, turuncu: null };
const EYE = { x: 5, y: 61.6, z: 0 };

/** Zemin y ≤ 59; x=10 duvarı (y 60..65, z -8..8) ve z=-10 duvarı (x -8..8). */
function room() {
  const w = makeWorld();
  w.fill(10, 60, -8, 10, 65, 8, B.STONE);
  w.fill(-8, 60, -10, 8, 65, -10, B.STONE);
  return w;
}
const get = (w) => (x, y, z) => w.getBlock(x, y, z);

function shoot(w, portals, color, hx, hy, hz, n, extra) {
  return placeOpenPortal(portals, {
    x: hx, y: hy, z: hz, face: { nx: n[0], ny: n[1], nz: n[2] },
  }, color, Object.assign({ getBlock: get(w), eye: EYE, yaw: 0 }, extra || {}));
}

describe('techPortal: yerleştirme kuralları', () => {
  it('duvara 1×2 portal: iki hücre önde, arka hücreler duvar; isabet hücresi alt hücre olur', () => {
    const w = room();
    const r = shoot(w, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0]);
    expect(r.ok).toBe(true);
    expect(r.portal.cells).toEqual([{ x: 9, y: 61, z: 0 }, { x: 9, y: 62, z: 0 }]);
    expect(r.portal.back).toEqual([{ x: 10, y: 61, z: 0 }, { x: 10, y: 62, z: 0 }]);
    expect(r.replaced).toBeNull();
    expect(r.portals.mavi).toBe(r.portal);
    expect(r.portals.turuncu).toBeNull();
    expect(EMPTY.mavi).toBeNull(); // girdi değişmedi
    expect(portalCellAt(r.portals, 9, 62, 0)).toBe('mavi');
    expect(portalCellAt(r.portals, 9, 63, 0)).toBeNull();
    expect(r.message).toContain('Mavi');
  });

  it('duvarın en üst bloğuna nişan: portal bir hücre aşağı kayar (üst hücre isabet hücresi olur)', () => {
    const w = room();
    const r = shoot(w, EMPTY, 'turuncu', 10, 65, 0, [-1, 0, 0]);
    expect(r.ok).toBe(true);
    expect(r.portal.cells[0].y).toBe(64);
    expect(r.portal.cells[1].y).toBe(65);
  });

  it('yer yok: tek bloklu duvar / ön hücre dolu → reddedilir, durum değişmez', () => {
    const w = makeWorld();
    w.set(10, 60, 0, B.STONE); // tek blok
    const r = shoot(w, EMPTY, 'mavi', 10, 60, 0, [-1, 0, 0]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('yer');
    expect(r.portals).toBe(EMPTY);
    const w2 = room();
    w2.set(9, 62, 0, B.STONE);
    w2.set(9, 60, 0, B.STONE);
    expect(shoot(w2, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0]).reason).toBe('yer');
  });

  it('yüzey kuralları: hava, sıvı, ana kaya/sistem, kırılamaz, portal bloğu, yarım blok tutmaz; tam küp ve cam tutar', () => {
    expect(portalSupport(0)).toBe(false);
    expect(portalSupport(B.WATER)).toBe(false);
    expect(portalSupport(B.BEDROCK)).toBe(false);
    expect(portalSupport(B.PORTAL_BLUE)).toBe(false);
    expect(portalSupport(B.PORTAL_ORANGE)).toBe(false);
    expect(portalSupport(B.SEAL_BARRIER)).toBe(false);
    expect(portalSupport(B.PUSH_BLOCK)).toBe(false);
    expect(portalSupport(B.SLAB)).toBe(false);
    expect(portalSupport(B.STAIRS)).toBe(false);
    expect(portalSupport(B.TORCH)).toBe(false);
    expect(portalSupport(B.STONE)).toBe(true);
    expect(portalSupport(B.GLASS)).toBe(true);
    expect(portalSupport(B.TECH_LAB)).toBe(true);
    expect(portalSupport(9999)).toBe(false);
    const w = room();
    w.set(10, 61, 0, B.BEDROCK);
    w.set(10, 62, 0, B.BEDROCK);
    expect(shoot(w, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0]).reason).toBe('yuzey');
    expect(shoot(w, EMPTY, 'mavi', 5, 61, 0, [-1, 0, 0]).reason).toBe('yuzey'); // hava
  });

  it('geçersiz girdi: renk, isabet, yüz normali', () => {
    const w = room();
    expect(shoot(w, EMPTY, 'yesil', 10, 61, 0, [-1, 0, 0]).reason).toBe('renk');
    expect(placeOpenPortal(EMPTY, null, 'mavi', { getBlock: get(w) }).reason).toBe('yuzey');
    expect(placeOpenPortal(EMPTY, { x: NaN, y: 1, z: 1 }, 'mavi', { getBlock: get(w) }).reason).toBe('yuzey');
    expect(shoot(w, EMPTY, 'mavi', 10, 61, 0, [0, 0, 0]).reason).toBe('yuzey');
    expect(shoot(w, EMPTY, 'mavi', 10, 61, 0, [-1, 1, 0]).reason).toBe('yuzey');
    expect(shoot(w, EMPTY, 'mavi', 10, 61, 0, [-2, 0, 0]).reason).toBe('yuzey');
    expect(placeOpenPortal(EMPTY, { x: 10, y: 61, z: 0, nx: -1, ny: 0, nz: 0 }, 'mavi', {}).reason).toBe('yuzey'); // dünya yok
    expect(placeOpenPortal(EMPTY, { x: 10, y: 61, z: 0, nx: -1, ny: 0, nz: 0 }, 'mavi', { getBlock: get(w) }).ok).toBe(true); // yüz düz alan
  });

  it('48 blok sınırı ve görüş hattı', () => {
    const w = makeWorld();
    w.fill(100, 60, -8, 100, 65, 8, B.STONE);
    const far = placeOpenPortal(EMPTY, { x: 100, y: 61, z: 0, face: { nx: -1, ny: 0, nz: 0 } }, 'mavi', {
      getBlock: get(w), eye: { x: 40, y: 61.6, z: 0 }, yaw: 0,
    });
    expect(far.reason).toBe('uzak');
    const near = placeOpenPortal(EMPTY, { x: 100, y: 61, z: 0, face: { nx: -1, ny: 0, nz: 0 } }, 'mavi', {
      getBlock: get(w), eye: { x: 100 - PORTAL_RANGE + 2, y: 61.6, z: 0 }, yaw: 0,
    });
    expect(near.ok).toBe(true);
    // araya duvar: görüş yok
    const w2 = room();
    w2.fill(8, 60, -3, 8, 65, 3, B.STONE);
    expect(shoot(w2, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0]).reason).toBe('gorus');
    // los:false → denetim atlanır
    expect(shoot(w2, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0], { los: false }).ok).toBe(true);
  });

  it('aynı renk yenisi eskisini TAŞIR; farklı renk üst üste gelemez; aynı yer "ayni"', () => {
    const w = room();
    const a = shoot(w, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0]);
    const b = shoot(w, a.portals, 'mavi', 10, 61, 4, [-1, 0, 0]);
    expect(b.ok).toBe(true);
    expect(b.replaced).toBe(a.portal);
    expect(b.portals.mavi.z).toBe(4);
    expect(shoot(w, b.portals, 'mavi', 10, 61, 4, [-1, 0, 0]).reason).toBe('ayni');
    const o = shoot(w, b.portals, 'turuncu', 10, 62, 4, [-1, 0, 0]); // hücreleri y62..63: mavi y61..62 ile kesişir
    expect(o.ok).toBe(false);
    expect(o.reason).toBe('ustuste');
    const o2 = shoot(w, b.portals, 'turuncu', 10, 63, 4, [-1, 0, 0]); // y63..64 → çakışmaz (63 isabet alt hücre)
    expect(o2.ok).toBe(true);
    expect(o2.portals.mavi).toBe(b.portal);
  });

  it('zemin ve tavan portalı: iki hücre bakış ekseni boyunca; ön/arka hücreler uygun olmalı', () => {
    const w = room();
    const f = shoot(w, EMPTY, 'mavi', 3, 59, 0, [0, 1, 0], { yaw: 0 }); // bakış −Z
    expect(f.ok).toBe(true);
    expect(f.portal.cells).toEqual([{ x: 3, y: 60, z: 0 }, { x: 3, y: 60, z: -1 }]);
    expect([f.portal.ny, f.portal.uz]).toEqual([1, -1]);
    const f2 = shoot(w, EMPTY, 'mavi', 3, 59, 0, [0, 1, 0], { yaw: -Math.PI / 2 }); // bakış +X
    expect(f2.portal.cells[1]).toEqual({ x: 4, y: 60, z: 0 });
    // eksen engelliyse sıradaki aday
    w.set(3, 60, -1, B.STONE);
    const f3 = shoot(w, EMPTY, 'mavi', 3, 59, 0, [0, 1, 0], { yaw: 0 });
    expect(f3.ok).toBe(true);
    expect(f3.portal.cells[1].z).toBe(1); // ters yön
    // tavan
    const w2 = room();
    w2.fill(0, 66, -3, 8, 66, 3, B.STONE);
    const c = shoot(w2, EMPTY, 'turuncu', 3, 66, 0, [0, -1, 0], { yaw: 0, eye: { x: 3, y: 62, z: 3 } });
    expect(c.ok).toBe(true);
    expect(c.portal.ny).toBe(-1);
    expect(c.portal.cells[0].y).toBe(65);
    expect(c.portal.back[0].y).toBe(66);
  });

  it('çerçeve: merkez arka yüzeyde, birim eksenler, r = u × n', () => {
    const w = room();
    const r = shoot(w, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0]);
    const f = portalFrame(r.portal);
    expect(f.n).toEqual([-1, 0, 0]);
    expect(f.u).toEqual([0, 1, 0]);
    expect(f.r).toEqual([0, 0, 1]);
    expect(f.center[0]).toBeCloseTo(9.5 + 0.49, 5);
    expect(f.center[1]).toBeCloseTo(62, 5);
    expect(f.width).toBe(1);
    expect(f.height).toBe(2);
    expect(f.yaw).toBeCloseTo(Math.atan2(1, 0), 5); // −x yönüne bakar
  });
});

describe('techPortal: giriş koşulu', () => {
  const w = room();
  const blue = shoot(w, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0]).portal;
  const body = (x, y, z) => ({ x, y, z, h: 1.8 });

  it('duvara doğru hareket ederken portal hücresindeyse girer; uzaklaşırken/yan geçerken girmez', () => {
    expect(portalEntry(blue, body(9.5, 61, 0.5), { x: 4, y: 0, z: 0 })).toBe(true);
    expect(portalEntry(blue, body(9.5, 61, 0.5), { x: -4, y: 0, z: 0 })).toBe(false); // uzaklaşıyor
    expect(portalEntry(blue, body(9.5, 61, 0.5), { x: 0, y: 0, z: 4 })).toBe(false); // yan kayıyor
    expect(portalEntry(blue, body(9.5, 61, 0.5), { x: 0, y: 0, z: 0 })).toBe(false); // duruyor
    expect(portalEntry(blue, body(7, 61, 0.5), { x: 4, y: 0, z: 0 })).toBe(false); // henüz uzakta (derinlik)
    expect(portalEntry(blue, body(9.5, 61, 5), { x: 4, y: 0, z: 0 })).toBe(false); // yanal dışarıda
    expect(portalEntry(blue, body(9.5, 65, 0.5), { x: 4, y: 0, z: 0 })).toBe(false); // yüksek dışarıda
    expect(portalEntry(blue, body(9.5, 61, 1.2), { x: 4, y: 0, z: 0 })).toBe(true); // kenar toleransı
  });

  it('zemin portalı: üstüne basınca (aşağı ya da duruyor) girer; yukarı fırlarken girmez', () => {
    const f = shoot(w, EMPTY, 'mavi', 3, 59, 0, [0, 1, 0], { yaw: 0 }).portal;
    expect(portalEntry(f, body(3.5, 60.02, 0.5), { x: 0, y: 0, z: 0 })).toBe(true);
    expect(portalEntry(f, body(3.5, 60.1, 0.5), { x: 0, y: -8, z: 0 })).toBe(true);
    expect(portalEntry(f, body(3.5, 60.1, 0.5), { x: 0, y: 6, z: 0 })).toBe(false);
    expect(portalEntry(f, body(3.5, 63, 0.5), { x: 0, y: -8, z: 0 })).toBe(false); // havada çok yüksek
    expect(portalEntry(f, body(8.5, 60.02, 0.5), { x: 0, y: 0, z: 0 })).toBe(false); // yanında
  });
});

describe('techPortal: ışınlanma geometrisi, momentum ve bakış', () => {
  function pair() {
    const w = room();
    const a = shoot(w, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0]); // n=(−1,0,0), x=9
    const b = shoot(w, a.portals, 'turuncu', 0, 61, -10, [0, 0, 1], { eye: { x: 0, y: 61.6, z: -3 } }); // n=(0,0,+1), z=-9
    return { w, portals: b.portals };
  }

  it('duvar → duvar: çıkış hücre merkezi, hız yönü döner (hız büyüklüğü korunur), bakış döner', () => {
    const { w, portals } = pair();
    const st = {
      x: 9.5, y: 61, z: 0.5, vx: 8, vy: -2, vz: 3, yaw: -Math.PI / 2, pitch: 0.2,
    };
    const r = travelThrough(portals, 'mavi', st, get(w));
    expect(r.ok).toBe(true);
    expect(r.to).toBe('turuncu');
    expect(r.x).toBeCloseTo(0.5, 5); // yanal kayma 0 → hücre merkezi
    expect(r.z).toBeCloseTo(-8.5, 5);
    expect(r.y).toBeCloseTo(61.02, 5);
    // v_in=(8,-2,3): vn=−8, vr=3 (r_in=(0,0,1)), vu=−2 → v_out = −3·r_out + (−2)·up + 8·n_out ; r_out=(1,0,0), n_out=(0,0,1)
    expect(r.vx).toBeCloseTo(-3, 5);
    expect(r.vy).toBeCloseTo(-2, 5);
    expect(r.vz).toBeCloseTo(8, 5);
    expect(r.speed).toBeCloseTo(Math.hypot(8, -2, 3), 5);
    // +x'e bakan oyuncu çıkışta +z'ye bakar (yaw π), eğim korunur
    expect(Math.abs(Math.abs(r.yaw) - Math.PI)).toBeLessThan(1e-6);
    expect(r.pitch).toBeCloseTo(0.2, 5);
  });

  it('yatay hız çıkışta çıkış normaline döner: duvar → duvar çıkışa doğru gider, geri değil', () => {
    const { w, portals } = pair();
    for (let a = -3; a <= 3; a += 0.5) {
      const r = travelThrough(portals, 'mavi', {
        x: 9.5, y: 61, z: 0.5, vx: 6, vy: 0, vz: a, yaw: -Math.PI / 2, pitch: 0,
      }, get(w));
      expect(r.vz).toBeGreaterThan(0); // turuncu n=(0,0,1) yönünde
      expect(Math.hypot(r.vx, r.vy, r.vz)).toBeCloseTo(Math.hypot(6, a), 5);
    }
  });

  it('turuncu → mavi (ters yön) ve ping-pong aynı konuma geri götürür', () => {
    const { w, portals } = pair();
    const out = travelThrough(portals, 'mavi', {
      x: 9.5, y: 61, z: 0.5, vx: 5, vy: 0, vz: 0, yaw: -Math.PI / 2, pitch: 0,
    }, get(w));
    const back = travelThrough(portals, 'turuncu', {
      x: out.x, y: out.y, z: out.z, vx: -out.vx, vy: -out.vy, vz: -out.vz, yaw: out.yaw + Math.PI, pitch: 0,
    }, get(w));
    expect(back.ok).toBe(true);
    expect(Math.floor(back.x)).toBe(9);
    expect(back.vx).toBeLessThan(0); // mavi n=(−1,0,0): çıkış −x yönünde
  });

  it('en az çıkış hızı: yürüyerek giren oyuncu bile yumuşakça dışarı itilir; azami hız kırpılır', () => {
    const { w, portals } = pair();
    const slow = travelThrough(portals, 'mavi', {
      x: 9.5, y: 61, z: 0.5, vx: 0.2, vy: 0, vz: 0, yaw: 0, pitch: 0,
    }, get(w));
    expect(slow.vz).toBeCloseTo(MIN_EXIT_SPEED.wall, 5);
    const fast = travelThrough(portals, 'mavi', {
      x: 9.5, y: 61, z: 0.5, vx: 500, vy: 0, vz: 0, yaw: 0, pitch: 0,
    }, get(w));
    expect(fast.speed).toBeCloseTo(MAX_EXIT_SPEED, 5);
    expect(Math.hypot(fast.vx, fast.vy, fast.vz)).toBeCloseTo(MAX_EXIT_SPEED, 5);
  });

  it('zemin portalı → duvar portalı: düşüş hızı yatay fırlatmaya dönüşür (momentum)', () => {
    const w = room();
    const f = shoot(w, EMPTY, 'mavi', 3, 59, 0, [0, 1, 0], { yaw: 0 });
    const wall = shoot(w, f.portals, 'turuncu', 0, 61, -10, [0, 0, 1], { eye: { x: 0, y: 61.6, z: -3 } });
    const r = travelThrough(wall.portals, 'mavi', {
      x: 3.5, y: 60.1, z: 0.5, vx: 0, vy: -12, vz: 0, yaw: 0, pitch: -0.5,
    }, get(w));
    expect(r.ok).toBe(true);
    // normal bileşeni (aşağı −12) çıkış normaline (turuncu +z) döner
    expect(r.vz).toBeCloseTo(12, 5);
    expect(Math.abs(r.vy)).toBeLessThan(1e-6);
    expect(Math.abs(r.vx)).toBeLessThan(1e-6);
  });

  it('duvar → zemin: yatay hız zeminden yukarı fırlatır (en az 6 b/sn); duvar → tavan aşağı iter', () => {
    const w = room();
    const wallBlue = shoot(w, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0]);
    const floor = shoot(w, wallBlue.portals, 'turuncu', 3, 59, -4, [0, 1, 0], { yaw: 0, eye: { x: 3, y: 61.6, z: -1 } });
    const up = travelThrough(floor.portals, 'mavi', {
      x: 9.5, y: 61, z: 0.5, vx: 9, vy: 0, vz: 0, yaw: -Math.PI / 2, pitch: 0,
    }, get(w));
    expect(up.ok).toBe(true);
    expect(up.vy).toBeCloseTo(9, 5);
    const slowUp = travelThrough(floor.portals, 'mavi', {
      x: 9.5, y: 61, z: 0.5, vx: 1, vy: 0, vz: 0, yaw: -Math.PI / 2, pitch: 0,
    }, get(w));
    expect(slowUp.vy).toBeCloseTo(MIN_EXIT_SPEED.floor, 5);
    expect(up.y).toBeGreaterThanOrEqual(60);
    expect(up.y).toBeLessThan(61);
    // tavan çıkışı
    const w2 = room();
    w2.fill(0, 66, -3, 8, 66, 3, B.STONE);
    const wb = shoot(w2, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0]);
    const ceil = shoot(w2, wb.portals, 'turuncu', 3, 66, 0, [0, -1, 0], { yaw: 0, eye: { x: 3, y: 62, z: 3 } });
    const down = travelThrough(ceil.portals, 'mavi', {
      x: 9.5, y: 61, z: 0.5, vx: 7, vy: 0, vz: 0, yaw: -Math.PI / 2, pitch: 0,
    }, get(w2));
    expect(down.ok).toBe(true);
    expect(down.vy).toBeCloseTo(-7, 5);
    expect(down.y + 1.8).toBeLessThanOrEqual(66.0001); // başı tavanın içine girmez
  });

  it('eş portal yoksa reddeder', () => {
    const w = room();
    const a = shoot(w, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0]);
    expect(travelThrough(a.portals, 'mavi', {
      x: 9.5, y: 61, z: 0.5, vx: 5, vy: 0, vz: 0, yaw: 0, pitch: 0,
    }, get(w))).toEqual({ ok: false, reason: 'es_yok' });
  });

  it('güvenli çıkış: ön hücre dolduysa ileriye kaydırır; tamamen kapalıysa "engelli"', () => {
    const { w, portals } = pair();
    w.set(0, 61, -9, B.STONE);
    w.set(0, 62, -9, B.STONE);
    const r = travelThrough(portals, 'mavi', {
      x: 9.5, y: 61, z: 0.5, vx: 5, vy: 0, vz: 0, yaw: 0, pitch: 0,
    }, get(w));
    expect(r.ok).toBe(true);
    expect(r.z).toBeGreaterThan(-8.5); // doldurulan hücrenin ötesinde
    expect(bodyFits(get(w), r.x, r.y, r.z)).toBe(true);
    for (let z = -9; z <= -7; z++) w.fill(-1, 61, z, 1, 63, z, B.STONE);
    const blocked = travelThrough(portals, 'mavi', {
      x: 9.5, y: 61, z: 0.5, vx: 5, vy: 0, vz: 0, yaw: 0, pitch: 0,
    }, get(w));
    expect(blocked).toEqual({ ok: false, reason: 'engelli' });
  });

  it('bodyFits: katı kutular, yarım blok, yüklü olmayan alan', () => {
    const w = makeWorld();
    const g = get(w);
    expect(bodyFits(g, 0.5, 60, 0.5)).toBe(true);
    expect(bodyFits(g, 0.5, 59.5, 0.5)).toBe(false); // zemine gömülü
    w.set(0, 60, 0, B.SLAB);
    expect(bodyFits(g, 0.5, 60, 0.5)).toBe(false); // plaka 0.5
    expect(bodyFits(g, 0.5, 60.5, 0.5)).toBe(true);
    const w2 = makeWorld({ loaded: () => false });
    expect(bodyFits(get(w2), 0.5, 60, 0.5)).toBe(false);
    expect(safeExit(g, 5.5, 60, 5.5, [1, 0, 0], 0.6, 1.8)).toEqual({ x: 5.5, y: 60, z: 5.5 });
  });
});

describe('techPortal: kalıcılık, kırılma, kayıt', () => {
  it('arka blok kırılınca portal kapanır; diğeri kalır; üretilmemiş chunk bekler', () => {
    const w = room();
    const a = shoot(w, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0]);
    const b = shoot(w, a.portals, 'turuncu', 0, 61, -10, [0, 0, 1], { eye: { x: 0, y: 61.6, z: -3 } });
    expect(pruneBrokenPortals(b.portals, get(w)).closed).toEqual([]);
    w.set(10, 62, 0, 0);
    const r = pruneBrokenPortals(b.portals, get(w));
    expect(r.closed).toEqual(['mavi']);
    expect(r.portals.mavi).toBeNull();
    expect(r.portals.turuncu).toBe(b.portals.turuncu);
    w.set(10, 62, 0, B.STONE);
    w.loaded = () => false;
    expect(pruneBrokenPortals(b.portals, get(w)).closed).toEqual([]);
  });

  it('TechState: shoot/travel/cooldown/prune/portalFrames bütünleşik', () => {
    const w = room();
    const tech = newTech();
    const o1 = tech.shootPortal('mavi', {
      x: 10, y: 61, z: 0, face: { nx: -1, ny: 0, nz: 0 },
    }, { world: w, eye: EYE, yaw: 0 });
    expect(o1.ok).toBe(true);
    expect(o1.event).toMatchObject({ type: 'portalPlaced', color: 'mavi', nx: -1, replaced: false });
    expect(tech.travelPortal({ x: 9.5, y: 61, z: 0.5, h: 1.8 }, { x: 5, y: 0, z: 0 }, { yaw: 0, pitch: 0 }, w)).toBeNull(); // eş yok
    const o2 = tech.shootPortal('turuncu', {
      x: 0, y: 61, z: -10, face: { nx: 0, ny: 0, nz: 1 },
    }, { world: w, eye: { x: 0, y: 61.6, z: -3 }, yaw: 0 });
    expect(o2.ok).toBe(true);
    expect(tech.portalAt(9, 61, 0)).toBe('mavi');
    const body = { x: 9.5, y: 61, z: 0.5, h: 1.8 };
    const t = tech.travelPortal(body, { x: 5, y: 0, z: 0 }, { yaw: -Math.PI / 2, pitch: 0 }, w);
    expect(t.ok).toBe(true);
    expect(t.event).toMatchObject({ type: 'portalUsed', from: 'mavi', to: 'turuncu' });
    // bekleme: hemen tekrar girse de ışınlanmaz
    expect(tech.travelPortal({ x: t.x, y: t.y, z: t.z, h: 1.8 }, { x: 0, y: 0, z: -5 }, { yaw: 0, pitch: 0 }, w)).toBeNull();
    run(tech, w, PORTAL_COOLDOWN + 0.5, {}, 0.25);
    expect(tech.portalCd).toBe(0);
    expect(tech.travelPortal({ x: t.x, y: t.y, z: t.z, h: 1.8 }, { x: 0, y: 0, z: -5 }, { yaw: 0, pitch: 0 }, w).ok).toBe(true);
    const fr = tech.portalFrames();
    expect(fr.mavi.n).toEqual([-1, 0, 0]);
    w.set(10, 61, 0, 0);
    expect(tech.pruneBrokenPortals(w)).toEqual(['mavi']);
    expect(tech.portalFrames().mavi).toBeNull();
    expect(tech.travelPortal(body, { x: 5, y: 0, z: 0 }, { yaw: 0, pitch: 0 }, w)).toBeNull();
  });

  it('QA5: bekleme yalnız ÇIKIŞ portalına uygulanır; öbür portala hemen girilebilir (kısa zemin–tavan düşüşü döngüsü kopmaz); kayıtta korunur', () => {
    const w = room();
    const tech = newTech();
    tech.shootPortal('mavi', { x: 10, y: 61, z: 0, face: { nx: -1, ny: 0, nz: 0 } }, { world: w, eye: EYE, yaw: 0 });
    tech.shootPortal('turuncu', { x: 0, y: 61, z: -10, face: { nx: 0, ny: 0, nz: 1 } }, { world: w, eye: { x: 0, y: 61.6, z: -3 }, yaw: 0 });
    const t = tech.travelPortal({ x: 9.5, y: 61, z: 0.5, h: 1.8 }, { x: 5, y: 0, z: 0 }, { yaw: -Math.PI / 2, pitch: 0 }, w);
    expect(t.ok).toBe(true);
    expect(tech.portalCdTo).toBe('turuncu');
    // çıkış portalına (turuncu) geri girmek engelli
    expect(tech.travelPortal({ x: t.x, y: t.y, z: t.z, h: 1.8 }, { x: 0, y: 0, z: -5 }, { yaw: 0, pitch: 0 }, w)).toBeNull();
    // öbür portala (mavi) 0,25 sn sonra (çıkış portalı 1 sn engelli kalırken) girilir
    expect(tech.travelPortal({ x: 9.5, y: 61, z: 0.5, h: 1.8 }, { x: 5, y: 0, z: 0 }, { yaw: -Math.PI / 2, pitch: 0 }, w)).toBeNull();
    run(tech, w, 0.3, {}, 0.1);
    const again = tech.travelPortal({ x: 9.5, y: 61, z: 0.5, h: 1.8 }, { x: 5, y: 0, z: 0 }, { yaw: -Math.PI / 2, pitch: 0 }, w);
    expect(again && again.ok).toBe(true);
    expect(again.from).toBe('mavi');
    // kayıt: bekleme hangi portalda → geri yüklenir; eski kayıt (cdt yok) ikisini de bekletir
    const raw = JSON.parse(JSON.stringify(tech.serialize()));
    expect(raw.cdt).toBe('turuncu');
    const t2 = newTech();
    t2.restore(raw, {});
    expect(t2.portalCdTo).toBe('turuncu');
    delete raw.cdt;
    t2.restore(raw, {});
    expect(t2.portalCdTo).toBe('*');
    run(tech, w, PORTAL_COOLDOWN + 0.5, {}, 0.25);
    expect(tech.portalCdTo).toBeNull();
  });

  it('QA5: ön hücresine katı blok konan portal kapanır; geçilebilir blok (meşale) kapatmaz', () => {
    const w = room();
    const tech = newTech();
    tech.shootPortal('mavi', { x: 10, y: 61, z: 0, face: { nx: -1, ny: 0, nz: 0 } }, { world: w, eye: EYE, yaw: 0 });
    const cell = tech.portals.mavi.cells[1];
    w.set(cell.x, cell.y, cell.z, B.TORCH);
    expect(tech.pruneBrokenPortals(w)).toEqual([]);
    w.set(cell.x, cell.y, cell.z, B.STONE);
    expect(tech.pruneBrokenPortals(w)).toEqual(['mavi']);
    expect(tech.portals.mavi).toBeNull();
  });

  it('TechState: blok olayı portal arka bloğunu yakalar ve tick sonrası kapanır', () => {
    const w = room();
    const tech = newTech();
    tech.shootPortal('mavi', {
      x: 10, y: 61, z: 0, face: { nx: -1, ny: 0, nz: 0 },
    }, { world: w, eye: EYE, yaw: 0 });
    w.onChange((e) => tech.onBlockChange(e));
    w.setBlock(10, 61, 0, 0);
    expect(tech.dirty).toBe(true);
    expect(tech.pruneBrokenPortals(w)).toEqual(['mavi']);
  });

  it('kayıt gidiş-dönüş: aynı portallar geri gelir; çerçeveler eşit', () => {
    const w = room();
    const a = shoot(w, EMPTY, 'mavi', 10, 61, 0, [-1, 0, 0]);
    const b = shoot(w, a.portals, 'turuncu', 3, 59, 0, [0, 1, 0], { yaw: 0 });
    const json = JSON.parse(JSON.stringify(serializePortals(b.portals)));
    const back = restorePortals(json);
    expect(portalFrame(back.mavi)).toEqual(portalFrame(b.portals.mavi));
    expect(portalFrame(back.turuncu)).toEqual(portalFrame(b.portals.turuncu));
    expect(serializePortals(back)).toEqual(json);
    expect(COLORS).toEqual(['mavi', 'turuncu']);
  });

  it('kayıt saldırı/fuzz: bozuk, prototip, taşkın değerler asla atmaz', () => {
    const bad = [
      null, undefined, 5, 'x', [], { mavi: 'x' }, { mavi: [1, 2, 3] }, { mavi: [0, 0, 0, 1, 1, 0, 0, 1, 0] }, // n ve u çarpık
      { mavi: [0, 0, 0, 1, 0, 0, 1, 0, 0] }, // u ∥ n
      { mavi: [1e12, 0, 0, 1, 0, 0, 0, 1, 0] }, { mavi: [0, 0, 0, 2, 0, 0, 0, 1, 0] }, { mavi: [NaN, 0, 0, 1, 0, 0, 0, 1, 0] },
      JSON.parse('{"__proto__":{"mavi":[0,0,0,1,0,0,0,1,0]}}'), JSON.parse('{"mavi":[0,0,0,1,0,0,0,1,0,9]}'),
      { mavi: ['0', '0', '0', '1', '0', '0', '0', '1', '0'] },
      { constructor: [0, 0, 0, 1, 0, 0, 0, 1, 0], prototype: 1 },
    ];
    bad.forEach((raw) => {
      const r = restorePortals(raw);
      expect(r.mavi === null || (Number.isInteger(r.mavi.x) && Math.abs(r.mavi.x) <= 1e7)).toBe(true);
      expect(Object.keys(r).sort()).toEqual(['mavi', 'turuncu']);
    });
    // sayı olarak yazılmış metin tamsayıya çevrilir ama geçerliyse kabul edilir (sıkı biçim için tamsayı ve eksen şartı yeter)
    const ok = restorePortals({ mavi: [0, 60, 0, 1, 0, 0, 0, 1, 0], turuncu: [0, 60, 0, 1, 0, 0, 0, 1, 0] });
    expect(ok.mavi).toBeTruthy();
    expect(ok.turuncu).toBeNull(); // üst üste → atılır
  });

  it('TechState.restore portalları katı doğrular ve yeniden kurar', () => {
    const tech = newTech();
    tech.restore({ v: 1, m: {}, p: { mavi: [10, 61, 0, -1, 0, 0, 0, 1, 0], turuncu: [0, 61, -9, 0, 0, 1, 0, 1, 0] } });
    expect(tech.portals.mavi.cells).toHaveLength(2);
    expect(tech.portals.turuncu.ny).toBe(0);
    const again = newTech();
    again.restore(JSON.parse(JSON.stringify(tech.serialize())));
    expect(again.serialize()).toEqual(tech.serialize());
  });
});
