import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* Sim kuralları (KESIF_CITY_CONTRACT §0/§18): saf, belirlenimci, worker-güvenli, es2020, ≤900 satır, yer tutucu kod yok. */
const FILES = [
  'dim/dimensions.js', 'dim/genRegistry.js', 'dim/dimRules.js', 'dim/dimState.js', 'dim/dimSanitize.js', 'dim/travel.js',
  'world.js', 'save.js', 'saveEnvelope.js', 'saveSanitize.js', 'constants.js', 'index.js',
];
const BANNED = [
  /Math\.random/, /Date\.now/, /new Date\(/, /performance\.now/, /Object\.hasOwn\b/, /\.replaceAll\(/, /structuredClone/, /[\w\])]\.at\(/,
  /\bbtoa\(/, /\batob\(/, /from ['"]three/, /\bwindow\./, /\bdocument\./, /\blocalStorage\b/, /TODO/, /FIXME/, /not implemented/,
  /catch\s*\(/, /\?\?=/, /\|\|=/, /&&=/, /\.flatMap\(/, /Array\.prototype\.flat\b/, /\.matchAll\(/,
];

describe('dim kaynak kuralları', () => {
  FILES.forEach((f) => {
    it(f + ': yasaklı API yok, ≤900 satır', () => {
      const src = readFileSync(fileURLToPath(new URL('../' + f, import.meta.url)), 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/ .*$/gm, '');
      BANNED.forEach((re) => expect(re.test(code), f + ' içinde ' + re).toBe(false));
      expect(src.split('\n').length, f).toBeLessThanOrEqual(900);
    });
  });

  it('dim/ kaynakları DOM/three/React içe aktarmaz', () => {
    FILES.filter((f) => f.indexOf('dim/') === 0).forEach((f) => {
      const src = readFileSync(fileURLToPath(new URL('../' + f, import.meta.url)), 'utf8');
      const imports = src.match(/^import[\s\S]*?from ['"][^'"]+['"]/gm) || [];
      imports.forEach((imp) => {
        const path = /from ['"]([^'"]+)['"]/.exec(imp)[1];
        expect(path.indexOf('..') === 0 || path.indexOf('./') === 0, f + ' → ' + path).toBe(true);
        expect(/render|systems|components|\/game[A-Z]/.test(path), f + ' → ' + path).toBe(false);
      });
    });
  });
});
