import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { resolveSound } from '../../audioRecipes.js';
import { createFx } from '../../render/particleFx.js';
import { FakeWorld, fakeCtx, frame } from './index.js';
import {
  COLORS, DICE, SHAPES3, bitmapFloor, bitmapWall, chamberInfo, dynDiff, guardEffect, mk, parseMk, put, pushDirection,
  runeInfo, shuffled,
} from './kitP1Common.js';
import { canWalk } from './kitP1Walk.js';
import { seededRandom } from '../rng.js';
import './basincplakasi.js';
import './runedizisi.js';
import './renkkollari.js';
import './isinayna.js';
import './itilebilirblok.js';
import './kodkilidi.js';
import { getPuzzle } from './index.js';

const SOUNDS = ['checkpoint', 'door', 'door_open', 'lever', 'place:taş', 'plate', 'puzzle_solved', 'puzzle_wrong', 'ui_click',
  'rune:0', 'rune:1', 'rune:2', 'rune:3', 'rune:4'];
const PARTICLES = ['beamImpact', 'hitSpark', 'levelUp', 'magicBurst'];
const TYPES = ['basincplakasi', 'runedizisi', 'renkkollari', 'isinayna', 'itilebilirblok', 'kodkilidi'];

describe('puzzles1 ortak: ses ve parçacık adları gerçek motorda var', () => {
  it('kullanılan her ses adı çözülür', () => {
    SOUNDS.forEach((n) => expect(resolveSound(n)).not.toBeNull());
  });

  it('kullanılan her parçacık efekti parçacık motorunda tanımlı', () => {
    const sys = {
      S: {}, rnd: () => 0.5, density: 1, reduced: false, col: () => [1, 1, 1], emit() {},
    };
    const fxs = createFx(sys);
    PARTICLES.forEach((n) => expect(typeof fxs[n]).toBe('function'));
  });
});

describe('puzzles1 ortak: tablolar ve yardımcılar', () => {
  it('yedi renk ve yedi şekil birebir ve benzersiz', () => {
    expect(COLORS.length).toBe(7);
    expect(new Set(COLORS.map((c) => c.concrete)).size).toBe(7);
    expect(new Set(COLORS.map((c) => c.glass)).size).toBe(7);
    expect(new Set(COLORS.map((c) => c.shape)).size).toBe(7);
    expect(SHAPES3.length).toBe(7);
    expect(new Set(SHAPES3.map((s) => s.rows.join(''))).size).toBe(7);
    SHAPES3.forEach((s) => {
      expect(s.rows.length).toBe(3);
      s.rows.forEach((r) => expect(r.length).toBe(3));
    });
  });

  it('zar yüzleri 1..6 doğru nokta sayısında ve benzersiz', () => {
    for (let v = 1; v <= 6; v++) {
      expect(DICE[v].join('').split('X').length - 1).toBe(v);
    }
    expect(new Set(DICE.slice(1).map((r) => r.join(''))).size).toBe(6);
  });

  it('rün bilgisi 5 rengi döndürür (mod 5)', () => {
    expect(runeInfo(0).symbol).toBe('üçgen');
    expect(runeInfo(5)).toBe(runeInfo(0));
    expect(runeInfo(-1)).toBe(runeInfo(4));
  });

  it('bit eşlem çizicileri: zemin satır 0 = en küçük lz; duvar satır 0 = en üst ly', () => {
    const m = new Map();
    bitmapFloor(m, 5, -1, 10, ['X.', '.X'], 7, 8);
    expect(m.get(mk(5, -1, 10))).toBe(7);
    expect(m.get(mk(6, -1, 10))).toBe(8);
    expect(m.get(mk(6, -1, 11))).toBe(7);
    const w = new Map();
    bitmapWall(w, -3, 0, 4, ['XX', '..'], 7, 8);
    expect(w.get(mk(-3, 1, 4))).toBe(7);
    expect(w.get(mk(-3, 0, 4))).toBe(8);
    expect(parseMk('3,-1,9')).toEqual({ x: 3, y: -1, z: 9 });
  });

  it('dynDiff: değişen hücre için setBlock, kaybolan için hava', () => {
    const ctx = fakeCtx({ origin: { x: 0, y: 10, z: 0 }, facing: 0 });
    const F = frame(ctx);
    const a = new Map();
    const b = new Map();
    put(a, 1, 0, 1, 5);
    put(a, 2, 0, 2, 6);
    put(b, 1, 0, 1, 9);
    put(b, 3, 0, 3, 4);
    const fxs = dynDiff(F, a, b);
    const keyOf = (e) => e.x + ',' + e.y + ',' + e.z + '=' + e.id;
    expect(fxs.map(keyOf).sort()).toEqual(['1,10,1=9', '2,10,2=0', '3,10,3=4'].sort());
    expect(dynDiff(F, b, b)).toEqual([]);
  });

  it('guardEffect: haritadaki hücrede kırma/koyma geri yükler, başka hücrede null', () => {
    const ctx = fakeCtx({ origin: { x: 0, y: 10, z: 0 }, facing: 2 });
    const F = frame(ctx);
    const m = new Map();
    put(m, 1, 0, 1, 33);
    const w = F.toWorld(1, 0, 1);
    expect(guardEffect(F, m, { type: 'blockBroken', x: w.x, y: w.y, z: w.z })).toEqual({
      kind: 'setBlock', x: w.x, y: w.y, z: w.z, id: 33,
    });
    expect(guardEffect(F, m, { type: 'use', x: w.x, y: w.y, z: w.z })).toBeNull();
    expect(guardEffect(F, m, { type: 'blockPlaced', x: w.x + 5, y: w.y, z: w.z })).toBeNull();
  });

  it('pushDirection: dünya yönü ve oyuncu konumu her yön (facing) için yerel yöne doğru çevrilir', () => {
    for (let facing = 0; facing < 4; facing++) {
      const ctx = fakeCtx({ origin: { x: 0, y: 10, z: 0 }, facing });
      const F = frame(ctx);
      const cases = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      cases.forEach(([lx, lz]) => {
        const wd = F.dir(lx, lz);
        expect(pushDirection(F, { dx: wd.dx, dz: wd.dz }, 0, 0)).toEqual({ x: lx, z: lz });
        // oyuncu bloğun gerisinde: blok +yerel yöne gider
        const c = F.toWorld(2, 0, 3);
        const p = F.toWorld(2 - lx, 0, 3 - lz);
        const dir = pushDirection(F, { px: p.x + 0.5, pz: p.z + 0.5 }, 2, 3);
        expect(dir).toEqual({ x: lx, z: lz });
        expect(c).toBeTruthy();
      });
      expect(pushDirection(F, {}, 0, 0)).toBeNull();
      expect(pushDirection(F, { dx: 0, dz: 0 }, 0, 0)).toBeNull();
    }
  });

  it('shuffled belirlenimli permütasyon', () => {
    const a = shuffled(seededRandom(5), 8);
    const b = shuffled(seededRandom(5), 8);
    expect(a).toEqual(b);
    expect(a.slice().sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('canWalk: engel varsa false, boşsa true', () => {
    const w = new FakeWorld();
    for (let x = 0; x <= 6; x++) for (let z = 0; z <= 2; z++) w.setBlock(x, 9, z, B.STONE);
    expect(canWalk(w, 10, { x: 0, z: 1 }, { x: 6, z: 1 })).toBe(true);
    for (let z = 0; z <= 2; z++) w.setBlock(3, 10, z, B.STONE);
    expect(canWalk(w, 10, { x: 0, z: 1 }, { x: 6, z: 1 })).toBe(false);
    for (let z = 0; z <= 2; z++) w.setBlock(3, 10, z, 0);
    w.setBlock(3, 11, 1, B.STONE);
    expect(canWalk(w, 10, { x: 0, z: 1 }, { x: 6, z: 1 })).toBe(true); // diğer şeritten geçer
  });

  it('chamberInfo önbelleklenir ve arka kapı hücrelerini verir', () => {
    const ctx = fakeCtx({ origin: { x: 0, y: 10, z: 0 }, facing: 1, difficulty: 2 });
    const a = chamberInfo(ctx, { w: 9, d: 9, h: 5 });
    const b = chamberInfo(ctx, { w: 9, d: 9, h: 5 });
    expect(a).toBe(b);
    expect(a.doorBack.cells.length).toBeGreaterThan(0);
  });
});

describe('puzzles1: altı bulmaca da kayıtlı ve arayüzü tam', () => {
  it('registry: kayıtlı, difficultyRange 1..5, tüm işlevler var, ipucu/adı Türkçe metin', () => {
    TYPES.forEach((t) => {
      const impl = getPuzzle(t);
      expect(impl).toBeTruthy();
      expect(impl.difficultyRange).toEqual([1, 5]);
      ['footprint', 'build', 'restore', 'interact', 'tick', 'isSolved', 'hint'].forEach((f) => expect(typeof impl[f]).toBe('function'));
      expect(impl.name.length).toBeGreaterThan(3);
      expect(impl.summary.length).toBeGreaterThan(20);
      for (let d = 1; d <= 5; d++) {
        const fp = impl.footprint(d);
        expect(fp.w).toBeGreaterThanOrEqual(7);
        expect(fp.d).toBeGreaterThanOrEqual(7);
        expect(fp.h).toBeGreaterThanOrEqual(5);
        expect(fp.w).toBeLessThanOrEqual(41);
        expect(fp.d).toBeLessThanOrEqual(41);
      }
    });
  });
});
