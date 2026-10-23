import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* Sim kuralları (KESIF_CITY_CONTRACT §0/§18): saf, belirlenimci, worker-güvenli, es2020, ≤900 satır, yer tutucu kod yok. */
const SIM = [
  'colliderIndex.js', 'colliderPhysics.js', 'propBehaviors.js', 'propDefs.js', 'propInteract.js', 'propLayer.js', 'propPlan.js', 'propSave.js',
  'propSigns.js', 'propWorld.js',
];
const RENDER = ['propGeo.js', 'propRenderer.js', 'propShaders.js', 'signAtlas.js'];
const SYSTEMS = ['props.js', 'propsEffects.js', 'propsInteract.js'];
const BANNED_SIM = [
  /Math\.random/, /Date\.now/, /new Date\(/, /performance\.now/, /Object\.hasOwn\b/, /\.replaceAll\(/, /structuredClone/, /[\w\])]\.at\(/,
  /\bbtoa\(/, /\batob\(/, /from ['"]three/, /\bwindow\./, /\bdocument\./, /\blocalStorage\b/, /TODO/, /FIXME/, /not implemented/,
  /\?\?=/, /\|\|=/, /&&=/, /\.flatMap\(/, /\.matchAll\(/, /\bconsole\./,
];
const BANNED_ANY = [/Object\.hasOwn\b/, /\.replaceAll\(/, /structuredClone/, /[\w\])]\.at\(/, /TODO/, /FIXME/, /not implemented/, /\?\?=/, /\|\|=/, /&&=/];

function read(rel) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/ .*$/gm, '');
}

describe('prop kaynak kuralları', () => {
  SIM.forEach((f) => {
    it('sim/props/' + f + ': saf (yasaklı API yok), ≤900 satır, render/sistem içe aktarmaz', () => {
      const src = read('./' + f);
      const code = strip(src);
      BANNED_SIM.forEach((re) => expect(re.test(code), f + ' içinde ' + re).toBe(false));
      expect(src.split('\n').length).toBeLessThanOrEqual(900);
      const imports = src.match(/^import[\s\S]*?from ['"][^'"]+['"]/gm) || [];
      imports.forEach((imp) => {
        const path = /from ['"]([^'"]+)['"]/.exec(imp)[1];
        expect(path.indexOf('.') === 0, f + ' → ' + path).toBe(true);
        expect(/render|systems|components|\/game[A-Z]/.test(path), f + ' → ' + path).toBe(false);
      });
    });
  });

  RENDER.forEach((f) => {
    it('render/props/' + f + ': es2020 kuralları, ≤900 satır, yer tutucu yok', () => {
      const src = read('../../render/props/' + f);
      const code = strip(src);
      BANNED_ANY.forEach((re) => expect(re.test(code), f + ' içinde ' + re).toBe(false));
      expect(src.split('\n').length).toBeLessThanOrEqual(900);
    });
  });

  SYSTEMS.forEach((f) => {
    it('systems/' + f + ': es2020 kuralları, ≤900 satır, yer tutucu yok', () => {
      const src = read('../../systems/' + f);
      const code = strip(src);
      BANNED_ANY.forEach((re) => expect(re.test(code), f + ' içinde ' + re).toBe(false));
      expect(src.split('\n').length).toBeLessThanOrEqual(900);
    });
  });

  it('physics.js kancası: collider çağrıları yalnız world.colliders doluyken çalışır; ekleme ≤ 40 satır', () => {
    const src = read('../physics.js').replace(/\r\n/g, '\n');
    expect(src.indexOf("from './props/colliderPhysics.js'")).toBeGreaterThan(0);
    // her kanca çağrısı koruma altındadır
    expect(/const cc = world\.colliders;\n\s+if \(cc\) collBegin\(/.test(src)).toBe(true);
    expect(/if \(cc\) collEnd\(\);/.test(src)).toBe(true);
    expect(/if \(CS\.n > 0\) \{\n\s+const r = collClip\(/.test(src)).toBe(true);
    expect(/\(CS\.on \|\| world\.colliders\) && collOverlap\(/.test(src)).toBe(true);
    expect(/if \(CS\.n > 0 && collPredict\(/.test(src)).toBe(true);
    const hookLines = src.split('\n').filter((l) => /collBegin|collEnd|collClip|collOverlap|collPredict|CS\.|colliderPhysics/.test(l)).length;
    expect(hookLines).toBeLessThanOrEqual(24);
  });
});
