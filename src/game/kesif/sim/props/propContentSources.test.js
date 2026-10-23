import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* props_content kaynak kuralları (KESIF_CITY_CONTRACT §0/§18): sim saf (three/DOM/Math.random/Date.now yok), es2020, ≤900 satır, yer tutucu kod yok. */
const SIM = [
  'propDefsExtra.js', 'propDefsInterior.js', 'propTexts.js', 'propSignsIndoor.js', 'propIndoor.js', 'propSeat.js', 'propBehaviorsInterior.js',
];
const RENDER = [
  'propGeoKit.js', 'propGeoFurniture.js', 'propGeoTech.js', 'propGeoDecor.js', 'propGeoDoors.js', 'propGeoInterior.js', 'propBake.js',
  'propShadersBaked.js', 'propRendererInterior.js',
];
const SYSTEMS = ['props.js', 'propsSeat.js', 'propsAmbient.js', 'propsInteract.js'];
const BANNED_SIM = [
  /Math\.random/, /Date\.now/, /new Date\(/, /performance\.now/, /Object\.hasOwn\b/, /\.replaceAll\(/, /structuredClone/, /[\w\])]\.at\(/,
  /\bbtoa\(/, /\batob\(/, /from ['"]three/, /\bwindow\./, /\bdocument\./, /\blocalStorage\b/, /TODO/, /FIXME/, /not implemented/,
  /\?\?=/, /\|\|=/, /&&=/, /\.flatMap\(/, /\.matchAll\(/, /\bconsole\./,
];
const BANNED_ANY = [/Object\.hasOwn\b/, /\.replaceAll\(/, /structuredClone/, /[\w\])]\.at\(/, /TODO/, /FIXME/, /not implemented/, /\?\?=/, /\|\|=/, /&&=/, /Math\.random/];

function read(rel) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/ .*$/gm, '');
}

describe('props_content kaynak kuralları', () => {
  SIM.forEach((f) => {
    it('sim/props/' + f + ': saf, ≤900 satır, render/sistem içe aktarmaz', () => {
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
    it('render/props/' + f + ': es2020, ≤900 satır, yer tutucu yok; geometri dosyaları three içe aktarmaz', () => {
      const src = read('../../render/props/' + f);
      const code = strip(src);
      BANNED_ANY.forEach((re) => expect(re.test(code), f + ' içinde ' + re).toBe(false));
      expect(src.split('\n').length).toBeLessThanOrEqual(900);
      if (/^propGeo|^propBake\.js$/.test(f)) expect(/from ['"]three/.test(code), f).toBe(false);
    });
  });

  SYSTEMS.forEach((f) => {
    it('systems/' + f + ': es2020, ≤900 satır, yer tutucu yok', () => {
      const src = read('../../systems/' + f);
      const code = strip(src);
      BANNED_ANY.forEach((re) => expect(re.test(code), f + ' içinde ' + re).toBe(false));
      expect(src.split('\n').length).toBeLessThanOrEqual(900);
    });
  });

  it('ses tarifleri dosyası: ≤900 satır; Math.random yok (rr kullanılır)', () => {
    const src = read('../../audioRecipesProps.js');
    expect(src.split('\n').length).toBeLessThanOrEqual(900);
    expect(/Math\.random|Date\.now/.test(strip(src))).toBe(false);
  });

  it('propWorld/propDefs/propPlan eklemeleri ≤ 40 satır ve yalnız ekleme biçiminde (kancalar)', () => {
    const w = read('./propWorld.js');
    expect(w.indexOf("import './propBehaviorsInterior.js'")).toBeGreaterThan(0);
    expect((w.match(/_syncCollider/g) || []).length).toBeLessThanOrEqual(8);
    expect(w.indexOf('transient')).toBeGreaterThan(0);
    const d = read('./propDefs.js');
    expect(d.indexOf('PROP_ALL')).toBeGreaterThan(0);
    expect(/INTERIOR_DEFS/.test(d)).toBe(true);
  });
});
