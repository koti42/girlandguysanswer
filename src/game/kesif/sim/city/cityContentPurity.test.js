/*
 * citycontent paketi dosyalarının sözleşme (§0, §18) uyumu: saf sim, es2020, boyut sınırı, TODO yok, LF satır sonu.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FILES = [
  'cityRealBrands.js', 'citySafeData.js', 'cityBrands.js', 'ownerData.js', 'ambientLines.js', 'cityNames.js',
];
const TESTS = [
  'citySafe.test.js', 'cityBrands.test.js', 'ownerData.test.js', 'ambientLines.test.js', 'cityNames.test.js',
  'cityContentPurity.test.js',
];
const read = (f) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');

describe('citycontent dosyaları', () => {
  FILES.concat(TESTS).forEach((f) => {
    it(f + ': <= 900 satır, TODO/sahte kod yok, LF', () => {
      const t = read(f);
      expect(t.split('\n').length).toBeLessThanOrEqual(900);
      if (f !== 'cityContentPurity.test.js') {
        expect(t.indexOf('TO' + 'DO')).toBe(-1);
        expect(t.indexOf('FIX' + 'ME')).toBe(-1);
        expect(t.indexOf('not impl' + 'emented')).toBe(-1);
      }
      expect(t.indexOf('\r')).toBe(-1);
    });
  });

  FILES.forEach((f) => {
    it(f + ': saf (DOM/three/rastgele/zaman yok), es2020 uyumlu, yalnızca yerel içe aktarma', () => {
      const t = read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      ['Math.random', 'Date.now', 'performance.now', 'window.', 'document.', 'localStorage', 'three']
        .forEach((bad) => expect(t.indexOf(bad), f + ' ' + bad).toBe(-1));
      [/Object\.hasOwn\b/, /structuredClone/, /\.at\(/, /\.replaceAll\(/, /\?\?=/, /\|\|=/, /&&=/]
        .forEach((re) => expect(re.test(t), f + ' ' + re).toBe(false));
      t.split('\n').filter((l) => /^\s*import\b/.test(l)).forEach((l) => expect(l, f).toMatch(/from '\.\.?\//));
    });
  });
});
