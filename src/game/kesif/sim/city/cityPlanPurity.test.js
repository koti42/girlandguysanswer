/*
 * cityplan paketi dosyalarının sözleşme (§0, §18) uyumu: saf sim, es2020, boyut sınırı (≤900 satır), TODO/sahte kod yok, LF satır sonu,
 * yalnızca yerel içe aktarma (node: modülleri yalnız test dosyalarında).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FILES = [
  'cityPlanKit.js', 'archetypes.js', 'cityDistricts.js', 'cityRoads.js', 'roadNet.js', 'cityLots.js', 'cityHill.js', 'cityRaces.js',
  'cityUndergroundPlan.js', 'buildingFacade.js', 'buildingPlan.js', 'cityBlocks.js', 'cityPois.js', 'cityPlan.js',
];
const TESTS = [
  'cityPlanKit.test.js', 'cityDistricts.test.js', 'cityRoads.test.js', 'cityLots.test.js', 'buildingPlan.test.js', 'cityRaces.test.js',
  'cityUndergroundPlan.test.js', 'cityBlocks.test.js', 'cityPois.test.js', 'cityHill.test.js', 'cityPlanHooks.test.js', 'cityPlan.test.js',
  'cityPlan.determinism.test.js', 'cityPlan.graph.test.js', 'cityPlan.walk.test.js', 'cityPlanPurity.test.js', 'cityPlanTestKit.js',
];
const read = (f) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');

describe('cityplan dosyaları', () => {
  FILES.concat(TESTS).forEach((f) => {
    it(f + ': ≤900 satır, TODO/sahte kod yok, LF', () => {
      const t = read(f);
      expect(t.split('\n').length).toBeLessThanOrEqual(900);
      if (f !== 'cityPlanPurity.test.js') {
        expect(t.indexOf('TO' + 'DO')).toBe(-1);
        expect(t.indexOf('FIX' + 'ME')).toBe(-1);
        expect(t.indexOf('not impl' + 'emented')).toBe(-1);
      }
      expect(t.indexOf('\r')).toBe(-1);
    });
  });

  FILES.forEach((f) => {
    it(f + ': saf (DOM/three/rastgele/zaman yok), es2020 uyumlu, yalnızca yerel içe aktarma, void-hack yok', () => {
      const t = read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      ['Math.random', 'Date.now', 'performance.now', 'window.', 'document.', 'localStorage', 'three', 'process.', 'require(']
        .forEach((bad) => expect(t.indexOf(bad), f + ' ' + bad).toBe(-1));
      [/Object\.hasOwn\b/, /structuredClone/, /\.at\(/, /\.replaceAll\(/, /\?\?=/, /\|\|=/, /&&=/, /^\s*void [a-zA-Z_.]+;/m]
        .forEach((re) => expect(re.test(t), f + ' ' + re).toBe(false));
      const re = /import\s+[^;]*?from\s+'([^']+)'/g;
      let m = re.exec(t);
      let imports = 0;
      while (m !== null) {
        imports++;
        expect(m[1], f).toMatch(/^\.\.?\//);
        m = re.exec(t);
      }
      if (f !== 'cityHill.js' && f !== 'archetypes.js') expect(imports, f).toBeGreaterThanOrEqual(1);
    });
  });
});
