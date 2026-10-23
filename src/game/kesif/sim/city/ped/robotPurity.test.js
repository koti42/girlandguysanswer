/*
 * robots paketi dosyalarının sözleşme (§0, §18) uyumu: saf sim (DOM/three/rastgele/zaman yok), es2020, ≤900 satır, TODO yok, LF, yalnızca yerel içe aktarma,
 * paylaşılan dosyalarda yalnızca ekleme (mobTypes/mobAI/spawner/mobModels/gameDimension: robot kancaları) ve ana diyar sözleşmesinin korunması.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // .../kesif/
const SIM = ['sim/city/ped/robotData.js', 'sim/city/ped/robotSlots.js', 'sim/city/ped/robotAI.js', 'sim/city/ped/robots.js'];
const RENDER = ['render/robotModels.js'];
const TESTS = [
  'sim/city/ped/robotData.test.js', 'sim/city/ped/robotSlots.test.js', 'sim/city/ped/robotAI.test.js', 'sim/city/ped/robots.test.js',
  'sim/city/ped/robotPurity.test.js', 'sim/spawnerNeon.test.js', 'render/robotModels.test.js', 'robotsDimension.test.js',
];
const SHARED = ['sim/mobTypes.js', 'sim/mobAI.js', 'sim/spawner.js', 'render/mobModels.js', 'gameDimension.js'];
const read = (f) => readFileSync(ROOT + f, 'utf8');
const code = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('robots paketi dosyaları', () => {
  SIM.concat(RENDER, TESTS).forEach((f) => {
    it(f + ': ≤ 900 satır, TODO/sahte kod yok, LF', () => {
      const t = read(f);
      expect(t.split('\n').length).toBeLessThanOrEqual(900);
      if (!/Purity\.test/.test(f)) {
        expect(t.indexOf('TO' + 'DO')).toBe(-1);
        expect(t.indexOf('FIX' + 'ME')).toBe(-1);
        expect(t.indexOf('not impl' + 'emented')).toBe(-1);
      }
      expect(t.indexOf('\r')).toBe(-1);
    });
  });

  SIM.forEach((f) => {
    it(f + ': saf (DOM/three/rastgele/zaman yok), es2020 uyumlu, yalnızca yerel içe aktarma', () => {
      const t = code(read(f));
      ['Math.random', 'Date.now', 'performance.now', 'window.', 'document.', 'localStorage', 'from \'three\'']
        .forEach((bad) => expect(t.indexOf(bad), f + ' ' + bad).toBe(-1));
      [/Object\.hasOwn\b/, /structuredClone/, /\.at\(/, /\.replaceAll\(/, /\?\?=/, /\|\|=/, /&&=/]
        .forEach((re) => expect(re.test(t), f + ' ' + re).toBe(false));
      t.split('\n').filter((l) => /^\s*import\b|^\} from /.test(l)).forEach((l) => {
        if (/from '/.test(l)) expect(l, f).toMatch(/from '\.\.?\//);
      });
    });
  });

  RENDER.forEach((f) => {
    it(f + ': three içe aktarmaz (model kurucular getKit üzerinden), rastgele/zaman yok', () => {
      const t = code(read(f));
      ['Math.random', 'Date.now', 'performance.now', 'from \'three\'', 'document.', 'window.'].forEach((bad) => expect(t.indexOf(bad), bad).toBe(-1));
      [/Object\.hasOwn\b/, /structuredClone/, /\.at\(/, /\.replaceAll\(/].forEach((re) => expect(re.test(t), String(re)).toBe(false));
    });
  });
});

describe('paylaşılan dosyalara yalnızca küçük, ekleme biçiminde kancalar', () => {
  it('her paylaşılan dosya robot kancasına atıf yapar ve ≤ 900 satır olarak kalır (mobTypes/spawner CRLF korunur)', () => {
    SHARED.forEach((f) => {
      const t = read(f);
      expect(t, f).toMatch(/robot/i);
      if (f !== 'gameDimension.js') expect(t.split('\n').length, f).toBeLessThanOrEqual(900);
    });
    ['sim/mobTypes.js', 'sim/spawner.js'].forEach((f) => {
      const t = read(f);
      const crlf = (t.match(/\r\n/g) || []).length;
      const bare = (t.match(/(^|[^\r])\n/g) || []).length;
      expect(bare, f + ' karışık satır sonu').toBe(0);
      expect(crlf).toBeGreaterThan(100);
    });
  });

  it('mobAI.js: robot dalı yalnızca def.robot ile ve boss/pasif/düşman dallarından ÖNCE-SONRA sırası bozulmadan', () => {
    const t = read('sim/mobAI.js');
    const iBoss = t.indexOf('if (def.boss) bossAI');
    const iRobot = t.indexOf('else if (def.robot)');
    const iHostile = t.indexOf('else if (def.hostile)');
    const iPassive = t.indexOf('else updatePassive');
    expect(iBoss).toBeGreaterThan(0);
    expect(iRobot).toBeGreaterThan(iBoss);
    expect(iHostile).toBeGreaterThan(iRobot);
    expect(iPassive).toBeGreaterThan(iHostile);
  });
});
