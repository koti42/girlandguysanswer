import { afterEach, describe, expect, it } from 'vitest';
import {
  PUZZLE_TYPES, PuzzleManager, buildChamber, clampDifficulty, getPuzzle, hasPuzzle, loadedPuzzleModules,
  puzzleTypesForDifficulty, registerPuzzle, registeredPuzzleTypes, unregisterPuzzle,
} from './index.js';
import * as kit from './kit.js';

function minimal(extra) {
  return Object.assign({
    name: 'Deneme',
    summary: 'özet',
    difficultyRange: [2, 4],
    footprint: () => ({ w: 5, d: 5, h: 4 }),
    build: () => ({ state: {}, anchors: {} }),
    restore: () => {},
    interact: (ctx, state) => ({ state, effects: [] }),
    isSolved: () => false,
  }, extra);
}

const made = [];
function reg(type, extra) {
  made.push(type);
  return registerPuzzle(type, minimal(extra));
}
afterEach(() => {
  while (made.length) unregisterPuzzle(made.pop());
});

describe('kayıt defteri', () => {
  it('11 kurallı tip anahtarı sabit sırada ve ASCII', () => {
    expect(PUZZLE_TYPES).toEqual([
      'basincplakasi', 'runedizisi', 'renkkollari', 'isinayna', 'itilebilirblok', 'hareketliplatform',
      'golgekopru', 'portaloda', 'terazi', 'kodkilidi', 'suakisi',
    ]);
    expect(Object.isFrozen(PUZZLE_TYPES)).toBe(true);
    PUZZLE_TYPES.forEach((t) => expect(/^[a-z]+$/.test(t)).toBe(true));
  });

  it('registerPuzzle normalleştirir: varsayılan tick/hint, donmuş aralık, type atanır', () => {
    const impl = reg('testtip1');
    expect(impl.type).toBe('testtip1');
    expect(getPuzzle('testtip1')).toBe(impl);
    expect(hasPuzzle('testtip1')).toBe(true);
    expect(Object.isFrozen(impl)).toBe(true);
    expect(impl.difficultyRange).toEqual([2, 4]);
    const st = { a: 1 };
    expect(impl.tick({}, st, 0.1)).toEqual({ state: st, effects: [] });
    expect(impl.hint(st)).toBe('');
    expect(getPuzzle('hicyok')).toBeNull();
    // aralık verilmezse 1..5
    expect(reg('testtip2', { difficultyRange: undefined }).difficultyRange).toEqual([1, 5]);
  });

  it('arayüz eksikse ya da geçersizse açık hata fırlatır', () => {
    expect(() => registerPuzzle('Buyuk', minimal())).toThrow(TypeError);
    expect(() => registerPuzzle('tr-ğ', minimal())).toThrow(TypeError);
    expect(() => registerPuzzle('testx', null)).toThrow(TypeError);
    expect(() => registerPuzzle('testx', minimal({ type: 'baska' }))).toThrow(/uyuşmuyor/);
    for (const k of ['footprint', 'build', 'restore', 'interact', 'isSolved']) {
      expect(() => registerPuzzle('testx', minimal({ [k]: undefined }))).toThrow(k);
    }
    expect(() => registerPuzzle('testx', minimal({ name: '' }))).toThrow(/name/);
    expect(() => registerPuzzle('testx', minimal({ difficultyRange: [0, 3] }))).toThrow(RangeError);
    expect(() => registerPuzzle('testx', minimal({ difficultyRange: [4, 2] }))).toThrow(RangeError);
    expect(() => registerPuzzle('testx', minimal({ difficultyRange: [1.5, 3] }))).toThrow(RangeError);
    expect(hasPuzzle('testx')).toBe(false);
  });

  it('tip listesi kayıt sırasından bağımsız ve belirlenimli', () => {
    const before = registeredPuzzleTypes().slice();
    reg('testzzz');
    reg('testaaa');
    const mid = registeredPuzzleTypes();
    expect(mid.slice(0, before.length)).toEqual(before);
    expect(mid.slice(before.length)).toEqual(['testaaa', 'testzzz']);
    unregisterPuzzle('testzzz');
    made.splice(made.indexOf('testzzz'), 1);
    reg('testzzz');
    expect(registeredPuzzleTypes()).toEqual(mid);
  });

  it('puzzleTypesForDifficulty zorluk aralığına göre süzer', () => {
    reg('testlow', { difficultyRange: [1, 2] });
    reg('testhigh', { difficultyRange: [4, 5] });
    expect(puzzleTypesForDifficulty(1)).toContain('testlow');
    expect(puzzleTypesForDifficulty(1)).not.toContain('testhigh');
    expect(puzzleTypesForDifficulty(5)).toContain('testhigh');
    expect(puzzleTypesForDifficulty(3)).not.toContain('testlow');
    expect(puzzleTypesForDifficulty(3)).not.toContain('testhigh');
    expect(puzzleTypesForDifficulty(99)).not.toContain('testlow');
    expect(puzzleTypesForDifficulty('x')).toEqual([]);
  });

  it('clampDifficulty', () => {
    const impl = reg('testclamp', { difficultyRange: [2, 4] });
    expect(clampDifficulty(impl, 1)).toBe(2);
    expect(clampDifficulty(impl, 9)).toBe(4);
    expect(clampDifficulty(impl, 3.4)).toBe(3);
    expect(clampDifficulty(impl, NaN)).toBe(2);
    expect(clampDifficulty(null, 7)).toBe(5);
  });
});

describe('index yüzeyi ve yükleyici', () => {
  it('kit yüzeyi index üzerinden de erişilir; döngüsüz yüklenir', () => {
    expect(typeof PuzzleManager).toBe('function');
    expect(PuzzleManager).toBe(kit.PuzzleManager);
    expect(buildChamber).toBe(kit.buildChamber);
    expect(Array.isArray(loadedPuzzleModules())).toBe(true);
    loadedPuzzleModules().forEach((f) => {
      expect(/^\.\/[A-Za-z0-9]+\.js$/.test(f)).toBe(true);
      expect(/^\.\/(index|kit)/.test(f)).toBe(false);
    });
  });

  it('kayıtlı tüm gerçek bulmaca tipleri uyumluluk denetiminden geçer', () => {
    // Başka ajanların yazdığı tipler yüklendikçe otomatik denetlenir (şimdilik boş olabilir).
    const real = registeredPuzzleTypes().filter((t) => PUZZLE_TYPES.indexOf(t) >= 0);
    const problems = [];
    real.forEach((t) => problems.push(...kit.checkPuzzleConformance(t, { facings: [0, 3] })));
    expect(problems).toEqual([]);
    // Tüm tipleri her yönde kurar: paralel yükte 5 sn'yi aşabilir (mantık değil, CPU bekleme).
  }, 180000);
});
