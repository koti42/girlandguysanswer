/*
 * traffic_ai paketi dosyalarının sözleşme (§0, §18) uyumu: saf sim (DOM/three/rastgele/zaman yok), es2020, boyut ≤ 900 satır, TODO/sahte kod yok, LF,
 * yalnızca yerel içe aktarma; ayrıca tohumlu alt akış etiketlerinin (0xc0..) çakışmaması.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SIM = [
  'trafficLights.js', 'junctions.js', 'trafficCars.js', 'trafficFollow.js', 'trafficReserve.js', 'trafficDrive.js', 'trafficAI.js',
];
const TESTS = [
  'trafficLights.test.js', 'junctions.test.js', 'trafficAI.test.js', 'trafficCity.test.js', 'trafficSoak.test.js', 'trafficSoakB.test.js', 'trafficStress.test.js',
  'trafficPurity.test.js', 'trafficTestKit.js',
];
const SYSTEMS = ['../../../systems/traffic.js', '../../../systems/trafficLamps.js', '../../../systems/traffic.test.js', '../../../systems/trafficLamps.test.js'];
const read = (f) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
const code = (f) => read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('traffic_ai dosyaları', () => {
  SIM.concat(TESTS, SYSTEMS).forEach((f) => {
    it(f + ': ≤900 satır, TODO/sahte kod yok, LF', () => {
      const t = read(f);
      expect(t.split('\n').length).toBeLessThanOrEqual(900);
      if (!/Purity\.test\.js$/.test(f)) {
        expect(t.indexOf('TO' + 'DO')).toBe(-1);
        expect(t.indexOf('FIX' + 'ME')).toBe(-1);
        expect(t.indexOf('not impl' + 'emented')).toBe(-1);
      }
      expect(t.indexOf('\r')).toBe(-1);
    });
  });

  SIM.forEach((f) => {
    it(f + ': saf (DOM/three/rastgele/zaman yok), es2020 uyumlu, yalnızca yerel içe aktarma', () => {
      const t = code(f);
      ['Math.random', 'Date.now', 'performance.now', 'window.', 'document.', 'localStorage', "from 'three'", 'process.', 'require(']
        .forEach((bad) => expect(t.indexOf(bad), f + ' ' + bad).toBe(-1));
      [/Object\.hasOwn\b/, /structuredClone/, /\.at\(/, /\.replaceAll\(/, /\?\?=/, /\|\|=/, /&&=/].forEach((re) => expect(re.test(t), f + ' ' + re).toBe(false));
      const imports = t.match(/from '([^']+)'/g) || [];
      imports.forEach((i) => expect(/from '\./.test(i), f + ' ' + i).toBe(true));
    });
  });

  it('sistem dosyaları: yalnız yerel içe aktarma; sim/ saf modüller dışında three yok; G.world çağrı ötesinde önbelleğe alınmaz', () => {
    SYSTEMS.filter((f) => !/test\.js$/.test(f)).forEach((f) => {
      const t = code(f);
      expect(t.indexOf("from 'three'"), f).toBe(-1);
      expect(/^ {2}(?:const|let) \w+ = (?:G|g)\.(world|em|entityRoot|worldRoot);\s*$/m.test(t), f).toBe(false);
      (t.match(/from '([^']+)'/g) || []).forEach((i) => expect(/from '\./.test(i), f + ' ' + i).toBe(true));
    });
  });

  it('tohumlu alt akış etiketleri (0xc0xx) tüm dosyalarda benzersiz', () => {
    const seen = new Map();
    SIM.forEach((f) => {
      const re = /const (TAG_\w+) = (0x[0-9a-f]+);/g;
      let m = re.exec(read(f));
      while (m) {
        const key = m[2].toLowerCase();
        expect(seen.has(key), f + ' ' + m[1] + ' ' + m[2] + ' çakışıyor: ' + seen.get(key)).toBe(false);
        seen.set(key, f + ':' + m[1]);
        m = re.exec(read(f));
      }
    });
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });
});
