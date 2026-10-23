/*
 * crowd_ai — KAYNAK DENETİMİ: saf sim (three/DOM/Math.random/Date.now/performance.now yok, es2020), ≤ 900 satır/dosya, TODO yok,
 * kullanıcı metni/dizgeler/yorumlar yasak sözcük ve gerçek marka taramasından geçer (aile dostu, özgün).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanText } from '../citySafeData.js';

const ROOT = join(fileURLToPath(new URL('../../..', import.meta.url)));
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

function files(dir, re) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => re.test(f) && !/\.test\.js$/.test(f) && !/Kit\.js$/.test(f)).map((f) => join(dir, f));
}

const SIM = files(join(ROOT, 'sim/city/ped'), /^(crowd|ped)\w*\.js$/);
const RENDER_PURE = ['crowdGeo.js', 'crowdGeoKit.js', 'crowdShaders.js'].map((f) => join(ROOT, 'render/city', f));
const RENDER_THREE = ['crowdModels.js'].map((f) => join(ROOT, 'render/city', f));
const SYSTEMS = ['crowd.js', 'crowdVisual.js'].map((f) => join(ROOT, 'systems', f));
const ALL = SIM.concat(RENDER_PURE, RENDER_THREE, SYSTEMS);

const read = (p) => readFileSync(p, 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('crowd kaynakları: saflık ve boyut', () => {
  it('dosya listesi bulundu', () => {
    expect(SIM.length).toBeGreaterThanOrEqual(9);
    ALL.forEach((p) => expect(existsSync(p), p).toBe(true));
  });

  SIM.concat(RENDER_PURE).forEach((p) => {
    it(rel(p) + ': three/DOM/rastgele/zaman yok, es2020', () => {
      const t = code(p);
      expect(t).not.toMatch(/from 'three'/);
      expect(t).not.toMatch(/\bdocument\./);
      expect(t).not.toMatch(/\bwindow\./);
      expect(t).not.toMatch(/Math\.random/);
      expect(t).not.toMatch(/Date\.now/);
      expect(t).not.toMatch(/performance\.now/);
      expect(t).not.toMatch(/structuredClone|Object\.hasOwn|\.replaceAll\(|\.at\(-?\d/);
    });
  });

  ALL.forEach((p) => {
    it(rel(p) + ': ≤ 900 satır, TODO/FIXME yok, LF satır sonu', () => {
      const t = read(p);
      expect(t.split('\n').length).toBeLessThanOrEqual(900);
      expect(t).not.toMatch(/\b(TODO|FIXME|XXX)\b/);
      expect(t).not.toMatch(/\r/);
    });
  });

  it('render/sistem dosyaları yalnız bilinen bağımlılıkları kullanır (three yalnız crowdModels/crowdVisual; yeni npm bağımlılığı yok)', () => {
    SYSTEMS.concat(RENDER_THREE).forEach((p) => {
      const imports = [...read(p).matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      imports.forEach((i) => expect(i === 'three' || i.startsWith('.'), rel(p) + ' ' + i).toBe(true));
    });
  });
});

function extractTexts(src) {
  const out = [];
  const re = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\[\s\S])*`/g;
  let m = re.exec(src);
  while (m) {
    out.push(m[0]);
    m = re.exec(src);
  }
  return out;
}

describe('crowd kaynakları: aile dostu / özgün metin taraması', () => {
  ALL.forEach((p) => {
    it(rel(p) + ': yorum ve dizgelerde yasak sözcük / gerçek marka / oyun adı yok', () => {
      const hits = [];
      extractTexts(read(p)).forEach((t) => {
        // GLSL ve sayısal dizgeler kod olduğundan yalnız harf içeren yorum/dizgeleri tara
        const plain = t.replace(/sim\/city\w*/g, ' ').replace(/[^\p{L}\s]/gu, ' ');
        if (plain.trim().length < 3) return;
        const h = scanText(plain);
        if (h.length > 0) hits.push(t.slice(0, 60) + ' → ' + JSON.stringify(h[0]));
      });
      expect(hits).toEqual([]);
    });
  });
});
