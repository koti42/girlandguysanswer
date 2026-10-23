import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { cpuMs, scaled } from '../../../test/perfScale.js';
import { PATH_MAX_POINTS, createPathBuffer, findPath } from './mobAIPath.js';
import {
  angleDiff, cellSolid, effectiveLight, probeMove, probeOptions, standable, steerDirection, turnToward, wrapAngle,
  yawFromDir, darkestDir, groundYBelow,
} from './mobAIUtil.js';
import { fillBox, makeWorld, pitWorld } from './mobAITestKit.js';

const OPT = { hc: 2, canJump: true, maxDrop: 3, avoidWater: true, ignoreLava: false };

describe('mobAIUtil — açılar ve hücreler', () => {
  it('açı sarma, fark, dönüş, yaw yönü', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(angleDiff(3, -3)).toBeCloseTo(2 * Math.PI - 6, 9);
    expect(turnToward(0, 1, 0.25)).toBe(0.25);
    expect(turnToward(0, 0.1, 0.25)).toBe(0.1);
    expect(yawFromDir(0, -1)).toBeCloseTo(0, 9); // -Z'ye bakar
    expect(yawFromDir(-1, 0)).toBeCloseTo(Math.PI / 2, 9); // sola (+yaw)
  });

  it('cellSolid: üretilmemiş (null) engel sayılır; efektif ışık', () => {
    const w = makeWorld({ loaded: (x) => x < 3, light: () => 0xa5 });
    expect(cellSolid(w, 5, 5, 0)).toBe(true);
    expect(cellSolid(w, 0, 5, 0)).toBe(false);
    expect(cellSolid(w, 0, 0, 0)).toBe(true);
    expect(effectiveLight(w, 0, 5, 0, 1)).toBe(10); // gökyüzü 10, blok 5
    expect(effectiveLight(w, 0, 5, 0, 0)).toBe(5); // gece: yalnız blok ışığı
    expect(effectiveLight({ getBlock: () => 0 }, 0, 5, 0, 0)).toBe(15); // getLight yoksa gündüz
  });

  it('standable ve groundYBelow', () => {
    const w = makeWorld();
    expect(standable(w, 0, 1, 0, 2, OPT)).toBe(true);
    expect(standable(w, 0, 3, 0, 2, OPT)).toBe(false);
    expect(groundYBelow(w, 0.5, 6, 0.5, 10)).toBe(1);
    w.setBlock(0, 1, 0, B.WATER);
    expect(standable(w, 0, 1, 0, 2, OPT)).toBe(false); // su kaçınılır
    expect(standable(w, 0, 1, 0, 2, { ...OPT, avoidWater: false })).toBe(true);
  });

  it('probeMove: açık, basamak (zıplama), duvar, uçurum, lav, su', () => {
    const o = { ...OPT, reach0: 0.85, reach1: 1.75 };
    const w = makeWorld();
    expect(probeMove(w, 0.5, 1, 0.5, 0, -1, o)).toBe(1);
    w.setBlock(0, 1, -2, B.STONE);
    expect(probeMove(w, 0.5, 1, 0.5, 0, -1, o)).toBe(2);
    expect(probeMove(w, 0.5, 1, 0.5, 0, -1, { ...o, canJump: false })).toBe(0);
    w.setBlock(0, 2, -2, B.STONE);
    expect(probeMove(w, 0.5, 1, 0.5, 0, -1, o)).toBe(0); // 2 blok duvar
    const pit = pitWorld({ x0: -3, x1: 3, z0: -10, z1: -2 }, 0, 6);
    expect(probeMove(pit, 0.5, 6, 3.5, 0, -1, o)).toBe(1); // çukurdan uzakta açık
    expect(probeMove(pit, 0.5, 6, 0.5, 0, -1, o)).toBe(0); // 1,75 ilerisi 6 derin çukur
    const o2 = { ...o, reach0: 2.5, reach1: 3.5 };
    expect(probeMove(pit, 0.5, 6, -0.9, 0, -1, o2)).toBe(0); // derin çukur
    const lava = pitWorld({ x0: -3, x1: 3, z0: -10, z1: -2 }, B.LAVA, 1);
    expect(probeMove(lava, 0.5, 6, -0.9, 0, -1, o2)).toBe(0);
    expect(probeMove(lava, 0.5, 6, -0.9, 0, -1, { ...o2, ignoreLava: true, avoidWater: false })).toBe(1);
  });

  it('steerDirection: duvar karşısında yan yön seçer; boşta düz', () => {
    const w = makeWorld();
    const ent = { x: 0.5, y: 1, z: 0.5, w: 0.6, h: 1.9, ai: { side: 1 }, mv: { dx: 0, dz: 0, jump: false } };
    expect(steerDirection(w, ent, {}, 0, -1)).toBe(0);
    fillBox(w, -3, 1, -2, 3, 4, -2, B.STONE);
    const k = steerDirection(w, ent, {}, 0, -1);
    expect(k).toBeGreaterThan(0);
    expect(Math.abs(ent.mv.dx)).toBeGreaterThan(0.3);
    expect(probeOptions(ent, {}).hc).toBe(2);
  });

  it('darkestDir: en karanlık yöne döner', () => {
    const w = makeWorld({ light: (x) => (x > 0 ? 0x00 : 0xf0) });
    const out = { x: 0, z: 0 };
    const l = darkestDir(w, 0.5, 1, 0.5, 1, -1, 0, out);
    expect(l).toBe(0);
    expect(out.x).toBeGreaterThan(0.5);
  });
});

describe('findPath (A*-lite)', () => {
  it('duvarın çevresinden yol bulur, noktalar yürünebilir ve ardışık', () => {
    const w = makeWorld();
    fillBox(w, -5, 1, -4, 5, 4, -4, B.STONE);
    const buf = createPathBuffer();
    const n = findPath(w, 0, 1, 0, 0.5, 1, -9, { hc: 2, canJump: true, maxDrop: 3, avoidWater: true }, buf);
    expect(n).toBeGreaterThan(8);
    expect(n).toBeLessThanOrEqual(PATH_MAX_POINTS);
    expect(buf.reached).toBe(true);
    let px = 0.5;
    let pz = 0.5;
    for (let i = 0; i < n; i++) {
      const x = buf.pts[i * 3];
      const y = buf.pts[i * 3 + 1];
      const z = buf.pts[i * 3 + 2];
      expect(Math.hypot(x - px, z - pz)).toBeLessThan(1.5); // komşu hücre
      expect(standable(w, Math.floor(x), y, Math.floor(z), 2, OPT)).toBe(true);
      px = x;
      pz = z;
    }
    expect(Math.abs(buf.pts[(n - 1) * 3 + 2] + 9)).toBeLessThan(1.5);
  });

  it('basamak çıkar (zıplama), inme sınırı: derin çukuru geçmez', () => {
    const w = makeWorld();
    fillBox(w, -5, 1, -6, 5, 1, -3, B.STONE); // 1 yüksek plato
    const buf = createPathBuffer();
    expect(findPath(w, 0, 1, 0, 0.5, 2, -5, { hc: 2, canJump: true, maxDrop: 3, avoidWater: true }, buf)).toBeGreaterThan(0);
    const last = buf.n - 1;
    expect(buf.pts[last * 3 + 1]).toBe(2);
    // zıplama yasak: plato aşılmaz ama kısmi yol (platonun etrafı) verir
    const buf2 = createPathBuffer();
    findPath(w, 0, 1, 0, 0.5, 2, -5, { hc: 2, canJump: false, maxDrop: 3, avoidWater: true }, buf2);
    expect(buf2.reached).toBe(false);
  });

  it('ulaşılamayan hedef: hedefe en yakın düğüme kısmi yol; başlangıç = hedef: 0', () => {
    const w = pitWorld({ x0: -40, x1: 40, z0: -40, z1: -5 }, 0, 12); // hedef derin çukurun karşı yakasında
    const buf = createPathBuffer();
    const n = findPath(w, 0, 6, 0, 0.5, 6, -30, { hc: 2, canJump: true, maxDrop: 3, avoidWater: true }, buf);
    expect(buf.reached).toBe(false);
    if (n > 0) expect(buf.pts[(n - 1) * 3 + 2]).toBeGreaterThan(-6); // çukurun kıyısında durur
    expect(findPath(w, 0, 6, 0, 0.5, 6, 0.5, { hc: 2, canJump: true, maxDrop: 3, avoidWater: true }, buf)).toBe(0);
  });

  it('su ve lavdan geçmez (kaçınma)', () => {
    const w = pitWorld({ x0: -2, x1: 2, z0: -8, z1: -3 }, B.WATER, 3);
    const buf = createPathBuffer();
    const n = findPath(w, 0, 6, 0, 0.5, 6, -10, { hc: 2, canJump: true, maxDrop: 3, avoidWater: true }, buf);
    expect(n).toBeGreaterThan(5);
    for (let i = 0; i < n; i++) {
      const x = buf.pts[i * 3];
      const z = buf.pts[i * 3 + 2];
      expect(x < -2 || x >= 3 || z >= -2 || z < -8).toBe(true); // su dikdörtgeninin dışında
    }
  });

  it('arama bütçeli ve tekrarlanabilir (aynı girdi → aynı yol)', () => {
    const w = makeWorld();
    fillBox(w, -10, 1, -4, 10, 4, -4, B.STONE);
    const a = createPathBuffer();
    const b = createPathBuffer();
    const o = { hc: 2, canJump: true, maxDrop: 3, avoidWater: true };
    const t0 = cpuMs();
    for (let i = 0; i < 200; i++) findPath(w, 0, 1, 0, 0.5, 1, -9, o, a);
    expect(cpuMs() - t0).toBeLessThan(scaled(3000));
    findPath(w, 0, 1, 0, 0.5, 1, -9, o, b);
    expect(Array.from(a.pts)).toEqual(Array.from(b.pts));
    expect(a.n).toBe(b.n);
  });
});
