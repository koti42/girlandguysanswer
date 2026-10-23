/*
 * cityemit paketi dosyalarının sözleşme (§0, §18) uyumu: saf sim (DOM/three/rastgele/zaman yok), es2020, ≤900 satır, TODO/sahte kod yok, LF,
 * yalnızca yerel içe aktarma; şehir üreticisi kimlik tabloları blocks.js'ten gelir (sihirli sayı yok: ID/Y tabloları).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FILES = [
  'cityEmit.js', 'citySurface.js', 'cityTerrain.js', 'cityBridges.js', 'cityBuildings.js', 'cityUndergroundShell.js', 'cityZone.js', 'cityWarm.js',
  'cityGen.js',
];
const TOOLS = ['cityNavKit.js'];
const TESTS = ['cityGen.test.js', 'cityShell.test.js', 'cityWalk.test.js', 'cityWorld.test.js', 'cityGen.perf.test.js', 'cityGenPurity.test.js'];
const read = (f) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
const code = (f) => read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('cityemit dosyaları', () => {
  FILES.concat(TOOLS, TESTS).forEach((f) => {
    it(f + ': ≤900 satır, TODO/sahte kod yok, LF', () => {
      const t = read(f);
      expect(t.split('\n').length).toBeLessThanOrEqual(900);
      if (f !== 'cityGenPurity.test.js') {
        expect(t.indexOf('TO' + 'DO')).toBe(-1);
        expect(t.indexOf('FIX' + 'ME')).toBe(-1);
        expect(t.indexOf('not impl' + 'emented')).toBe(-1);
      }
      expect(t.indexOf('\r')).toBe(-1);
    });
  });

  FILES.concat(TOOLS).forEach((f) => {
    it(f + ': saf, es2020 uyumlu, yalnızca yerel içe aktarma', () => {
      const t = code(f);
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
      expect(imports, f).toBeGreaterThanOrEqual(1);
    });
  });
});
