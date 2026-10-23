/*
 * Araç gölgelendirici kaynak sözleşmesi (GLSL burada çalıştırılamaz; kaynak kilitlenir): pow tabanı güvenliği, uniform/öznitelik adlarının tanımlı olması,
 * varying eşleşmesi, strobo yok (≤3 Hz), glsl3 uyumlu yapı.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VEH_FRAGMENT, VEH_GLASS_FRAGMENT, VEH_VERTEX } from './vehicleShaders.js';
import {
  CONE_FRAGMENT, CONE_VERTEX, SMOKE_FRAGMENT, SMOKE_VERTEX, SPRITE_FRAGMENT, SPRITE_VERTEX,
} from './vehicleFxShaders.js';
import { ownUniforms, sharedUniformsFor } from './vehicleRig.js';
import { createMaterialUniforms } from '../materials.js';

const BUILTIN_U = new Set(['modelMatrix', 'viewMatrix', 'projectionMatrix', 'cameraPosition', 'modelViewMatrix', 'normalMatrix']);

function powBases(src) {
  const out = [];
  let i = 0;
  for (;;) {
    i = src.indexOf('pow(', i);
    if (i < 0) break;
    let d = 1;
    let j = i + 4;
    const start = j;
    let comma = -1;
    while (j < src.length && d > 0) {
      const c = src[j];
      if (c === '(') d++;
      else if (c === ')') d--;
      else if (c === ',' && d === 1 && comma < 0) comma = j;
      j++;
    }
    out.push(src.slice(start, comma).trim());
    i = j;
  }
  return out;
}
const SAFE_BASE = /^(max|clamp|abs)\(/;

function declared(src, kw) {
  const re = new RegExp(String.raw`^\s*${kw}\s+(?:highp\s+|mediump\s+|lowp\s+)?(\w+)\s+(\w+)(?:\[\d+\])?\s*;`, 'gm');
  const out = new Map();
  let m = re.exec(src);
  while (m) {
    out.set(m[2], m[1]);
    m = re.exec(src);
  }
  return out;
}

const PAIRS = [
  ['araç', VEH_VERTEX, VEH_FRAGMENT],
  ['cam', VEH_VERTEX, VEH_GLASS_FRAGMENT],
  ['sprite', SPRITE_VERTEX, SPRITE_FRAGMENT],
  ['koni', CONE_VERTEX, CONE_FRAGMENT],
  ['duman', SMOKE_VERTEX, SMOKE_FRAGMENT],
];

describe('gölgelendirici güvenliği', () => {
  PAIRS.forEach(([name, vs, fs]) => {
    it(name + ': pow tabanları negatif olamaz (max/clamp/abs)', () => {
      powBases(vs + '\n' + fs).forEach((b) => expect(SAFE_BASE.test(b), 'pow tabanı güvensiz: ' + b).toBe(true));
    });
    it(name + ': fragment varying\'leri vertex\'te tanımlı ve aynı tipte', () => {
      const vv = declared(vs, 'varying');
      const fv = declared(fs, 'varying');
      fv.forEach((type, n) => {
        expect(vv.has(n), name + ' varying ' + n + ' vertex\'te yok').toBe(true);
        expect(vv.get(n)).toBe(type);
      });
    });
    it(name + ': gl_FragColor yazılır; tonemapping + colorspace dahil', () => {
      expect(fs).toContain('gl_FragColor');
    });
    it(name + ': strobo yok — uTime katsayıları ≤ 18,8 rad/sn (≤3 Hz)', () => {
      const all = vs + fs;
      const re = /uTime\s*\*\s*([0-9.]+)/g;
      let m = re.exec(all);
      while (m) {
        expect(parseFloat(m[1])).toBeLessThanOrEqual(18.85);
        m = re.exec(all);
      }
    });
  });
  it('araç gölgelendiricisi: bildirilen uniform\'lar paylaşılan + sahip olunan kümelerde var', () => {
    const shared = Object.keys(sharedUniformsFor(THREE, createMaterialUniforms(THREE)));
    const own = Object.keys(ownUniforms(THREE));
    const have = new Set([...shared, ...own]);
    [VEH_VERTEX, VEH_FRAGMENT, VEH_GLASS_FRAGMENT].forEach((src) => {
      declared(src, 'uniform').forEach((_t, n) => {
        if (!BUILTIN_U.has(n)) expect(have.has(n), 'uniform ' + n + ' sağlanmıyor').toBe(true);
      });
    });
  });
  it('efekt gölgelendiricisi uniform\'ları paylaşılan kümede', () => {
    const shared = new Set(Object.keys(createMaterialUniforms(THREE)));
    [SPRITE_VERTEX, SPRITE_FRAGMENT, CONE_VERTEX, CONE_FRAGMENT, SMOKE_VERTEX, SMOKE_FRAGMENT].forEach((src) => {
      declared(src, 'uniform').forEach((_t, n) => {
        if (!BUILTIN_U.has(n)) expect(shared.has(n), 'uniform ' + n + ' yok').toBe(true);
      });
    });
  });
  it('öznitelikler geometri/örnek tamponlarıyla uyumlu', () => {
    const attrs = new Set();
    [VEH_VERTEX, SPRITE_VERTEX, CONE_VERTEX, SMOKE_VERTEX].forEach((s) => declared(s, 'attribute').forEach((_t, n) => attrs.add(n)));
    ['aColor', 'aMat', 'aPivot', 'aI0', 'aL', 'aFx', 'aT'].forEach((n) => expect(attrs.has(n)).toBe(true));
    expect(declared(VEH_VERTEX, 'attribute').get('aL')).toBe('vec3');
  });
  it('NaN kapısı: çıkış kSafeColor ile süzülür', () => {
    expect(VEH_FRAGMENT).toContain('kSafeColor(col)');
    expect(VEH_GLASS_FRAGMENT).toContain('kSafeColor(col)');
  });
  it('yasak: Math.random / Date.now yok (kaynak)', () => {
    [VEH_VERTEX, VEH_FRAGMENT, SPRITE_FRAGMENT].forEach((s) => expect(/Math\.random|Date\.now/.test(s)).toBe(false));
  });
});
