import { describe, expect, it } from 'vitest';
import {
  PROP_ALIASES, PROP_BY_T, PROP_DEFS, PROP_LIST, getPropDef, hitBoxes, resolvePropKey, rotateBox, validatePropDef, worldBoxes,
} from './propDefs.js';
import { getPropBehavior } from './propBehaviors.js';
import { isSafeText } from '../city/citySafeData.js';

describe('PROP_DEFS — tablo değişmezleri', () => {
  it('Faz 1: 12 sokak tanımı, t = 1..12 benzersiz ve sıralı', () => {
    expect(PROP_LIST.length).toBe(12);
    expect(PROP_LIST.map((d) => d.t)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(new Set(PROP_LIST.map((d) => d.key)).size).toBe(12);
    expect(PROP_LIST.map((d) => d.key)).toEqual([
      'lamba', 'bank', 'cop_kutusu', 'trafik_diregi', 'otomat', 'tabela', 'billboard', 'terminal', 'boyut_terminali', 'agac', 'cit', 'saksi',
    ]);
  });

  it('her tanım doğrulayıcıdan geçer (collider ≤4, 1/16 katı, etkileşim, durumlar)', () => {
    PROP_LIST.forEach((d) => expect(validatePropDef(d)).toEqual([]));
  });

  it('tanımlar üst düzey donuk; tablo erişimi tutarlı', () => {
    PROP_LIST.forEach((d) => {
      expect(Object.isFrozen(d)).toBe(true);
      expect(PROP_DEFS[d.key]).toBe(d);
      expect(PROP_BY_T[d.t]).toBe(d);
      expect(getPropDef(d.t)).toBe(d);
      expect(getPropDef(d.key)).toBe(d);
    });
    expect(Object.isFrozen(PROP_DEFS)).toBe(true);
  });

  it('takma adlar (aksanlı yazımlar) kanonik anahtara çözülür; hepsi geçerli tanıma gider', () => {
    Object.keys(PROP_ALIASES).forEach((a) => {
      const d = getPropDef(a);
      expect(d, a).not.toBeNull();
      expect(resolvePropKey(a)).toBe(d.key);
    });
    expect(resolvePropKey('trafik_ışığı')).toBe('trafik_diregi');
    expect(resolvePropKey('çit')).toBe('cit');
    expect(resolvePropKey('ağaç')).toBe('agac');
  });

  it('prototip anahtarları ve geçersiz girdi güvenle null', () => {
    ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', 'yok', 0, 999, -1, NaN, null, undefined, {}, []].forEach((k) => {
      expect(getPropDef(k)).toBeNull();
    });
  });

  it('adlar/istemler Türkçe, kısa ve güvenli; etkileşim türlerinin davranışı kayıtlı', () => {
    PROP_LIST.forEach((d) => {
      expect(d.name.length).toBeLessThanOrEqual(32);
      expect(isSafeText(d.name)).toBe(true);
      if (d.interact) {
        expect(isSafeText(d.interact.prompt)).toBe(true);
        expect(d.interact.prompt.length).toBeLessThanOrEqual(40);
        expect(d.interact.range).toBeCloseTo(2.6, 9);
        expect(getPropBehavior(d.interact.kind), d.key).not.toBeNull();
      }
    });
  });

  it('bir tanımın çarpışma kutuları birbiriyle örtüşmez', () => {
    PROP_LIST.forEach((d) => {
      for (let i = 0; i < d.colliders.length; i++) {
        for (let j = i + 1; j < d.colliders.length; j++) {
          const a = d.colliders[i];
          const b = d.colliders[j];
          const ov = a[0] < b[3] && a[3] > b[0] && a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2];
          expect(ov, d.key + ' ' + i + '/' + j).toBe(false);
        }
      }
    });
  });

  it('çarpışma kutuları boyut kutusunun içinde ve tabanda', () => {
    PROP_LIST.forEach((d) => {
      d.colliders.forEach((b) => {
        expect(b[0]).toBeGreaterThanOrEqual(-d.size[0] / 2 - 1e-9);
        expect(b[3]).toBeLessThanOrEqual(d.size[0] / 2 + 1e-9);
        expect(b[2]).toBeGreaterThanOrEqual(-d.size[2] / 2 - 1e-9);
        expect(b[5]).toBeLessThanOrEqual(d.size[2] / 2 + 1e-9);
        expect(b[4]).toBeLessThanOrEqual(d.size[1] + 1e-9);
      });
    });
  });

  it('yürümeyi durdurması gerekenler: çarpışma kutusu basamaktan (0.6) yüksek; çit zıplayarak aşılmaz', () => {
    ['bank', 'otomat', 'cit', 'cop_kutusu', 'terminal', 'lamba'].forEach((k) => {
      const d = PROP_DEFS[k];
      expect(Math.max(...d.colliders.map((b) => b[4]))).toBeGreaterThan(0.6);
    });
    expect(Math.max(...PROP_DEFS.cit.colliders.map((b) => b[4]))).toBeGreaterThan(1.25 + 0.1);
  });

  it('tabela/billboard sign alanlı; billboard holo; trafik direği 3 durumlu; terminaller zorunlu', () => {
    expect(PROP_DEFS.tabela.sign).toBeDefined();
    expect(PROP_DEFS.billboard.sign).toBeDefined();
    expect(PROP_DEFS.billboard.holo).toBe(true);
    expect(PROP_DEFS.trafik_diregi.states).toBe(3);
    expect(PROP_DEFS.terminal.tags).toContain('zorunlu');
    expect(PROP_DEFS.boyut_terminali.tags).toContain('zorunlu');
    expect(PROP_DEFS.lamba.light.level).toBeGreaterThan(8);
  });
});

describe('yön yardımcıları', () => {
  it('rotateBox: 4 döndürme kimlik, hacim korunur, yerel +Z yaw ile +X/-Z/-X olur', () => {
    const b = [-0.5, 0, -0.25, 1.5, 2, 0.75];
    let r = b.slice();
    for (let i = 0; i < 4; i++) r = rotateBox(r, 1);
    expect(r).toEqual(b);
    for (let y = 0; y < 4; y++) {
      const o = rotateBox(b, y);
      const vol = (o[3] - o[0]) * (o[4] - o[1]) * (o[5] - o[2]);
      expect(vol).toBeCloseTo(2 * 2 * 1, 9);
    }
    const f = rotateBox([-0.1, 0, 0.9, 0.1, 1, 1.1], 1);
    expect((f[0] + f[3]) / 2).toBeCloseTo(1, 9);
    expect((f[2] + f[5]) / 2).toBeCloseTo(0, 9);
    const f2 = rotateBox([-0.1, 0, 0.9, 0.1, 1, 1.1], 2);
    expect((f2[2] + f2[5]) / 2).toBeCloseTo(-1, 9);
    const f3 = rotateBox([-0.1, 0, 0.9, 0.1, 1, 1.1], 3);
    expect((f3[0] + f3[3]) / 2).toBeCloseTo(-1, 9);
  });

  it("three Object3D.rotation.y ile aynı eşleme (x' = x·cosθ + z·sinθ, z' = −x·sinθ + z·cosθ)", () => {
    for (let yaw = 0; yaw < 4; yaw++) {
      const th = (yaw * Math.PI) / 2;
      const px = 0.3;
      const pz = 0.9;
      const ex = px * Math.cos(th) + pz * Math.sin(th);
      const ez = -px * Math.sin(th) + pz * Math.cos(th);
      const o = rotateBox([px - 0.01, 0, pz - 0.01, px + 0.01, 1, pz + 0.01], yaw);
      expect((o[0] + o[3]) / 2).toBeCloseTo(ex, 9);
      expect((o[2] + o[5]) / 2).toBeCloseTo(ez, 9);
    }
  });

  it('worldBoxes: çapaya ötelenir; kutular 1/16 katı kalır; hitBoxes sırası trigger → collider → boyut', () => {
    const d = PROP_DEFS.bank;
    const boxes = worldBoxes(d, 10.5, 64, -3.25, 1, []);
    expect(boxes.length).toBe(1);
    boxes[0].forEach((v) => expect(Math.abs(v * 16 - Math.round(v * 16))).toBeLessThan(1e-9));
    expect(boxes[0][1]).toBe(64);
    expect(hitBoxes(PROP_DEFS.tabela)[0]).toEqual(PROP_DEFS.tabela.trigger);
    expect(hitBoxes(PROP_DEFS.lamba)[0]).toEqual(PROP_DEFS.lamba.colliders[0]);
    const fake = { colliders: [], size: [2, 3, 4] };
    expect(hitBoxes(fake)[0]).toEqual([-1, 0, -2, 1, 3, 2]);
  });

  it('validatePropDef hatalı tanımları yakalar', () => {
    const bad = [
      null, {}, { t: 0 },
      Object.assign({}, PROP_DEFS.bank, { t: 70000 }),
      Object.assign({}, PROP_DEFS.bank, { key: 'Bank!' }),
      Object.assign({}, PROP_DEFS.bank, { colliders: [[0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1]] }),
      Object.assign({}, PROP_DEFS.bank, { colliders: [[0, 0, 0, 0.3, 1, 1]] }),
      Object.assign({}, PROP_DEFS.bank, { colliders: [[1, 0, 0, 0, 1, 1]] }),
      Object.assign({}, PROP_DEFS.bank, { emissive: 2 }),
      Object.assign({}, PROP_DEFS.bank, { states: 0 }),
      Object.assign({}, PROP_DEFS.bank, { interact: { kind: 'x' } }),
    ];
    bad.forEach((d) => expect(validatePropDef(d).length).toBeGreaterThan(0));
  });
});
