import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  GLINT_SUFFIX, baseKey, disposeGlint, glintKey, glintMaterial, isGlintKey, patchGlintShader, setGlintTime,
} from './enchantGlint.js';
import { createHeldItemModel, createDroppedItem, getHeldPlacement } from './heldItems.js';

describe('büyü parıltısı: anahtar eki', () => {
  it('ek ekler ve ayıklar; yalnız gerçek ek tanınır', () => {
    expect(glintKey('item:kılıç_demir', true)).toBe('item:kılıç_demir' + GLINT_SUFFIX);
    expect(glintKey('item:kılıç_demir', false)).toBe('item:kılıç_demir');
    expect(glintKey(null, true)).toBe(null);
    expect(glintKey('x' + GLINT_SUFFIX, true)).toBe('x' + GLINT_SUFFIX); // çifte ek yok
    expect(isGlintKey('item:a#e')).toBe(true);
    expect(isGlintKey('#e')).toBe(false);
    expect(isGlintKey('item:a')).toBe(false);
    expect(isGlintKey(5)).toBe(false);
    expect(baseKey('item:a#e')).toBe('item:a');
    expect(baseKey('item:a')).toBe('item:a');
  });
});

describe('büyü parıltısı: malzeme', () => {
  it('standart malzeme paylaşılan klonla değişir (önbellekli), basic malzemeye dokunulmaz', () => {
    const std = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const basic = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const a = glintMaterial(std);
    expect(a).not.toBe(std);
    expect(a.userData.kxGlint).toBe(true);
    expect(glintMaterial(std)).toBe(a);
    expect(glintMaterial(a)).toBe(a);
    expect(glintMaterial(basic)).toBe(basic);
    expect(glintMaterial(null)).toBe(null);
    expect(a.color.getHex()).toBe(0xff0000);
    disposeGlint();
  });

  it('gölgelendirici yamalanır: uniform bağlanır, parça opaque_fragment öncesine girer', () => {
    const shader = {
      uniforms: {},
      fragmentShader: '#include <common>\nvoid main(){ vec3 outgoingLight = vec3(0.0);\n#include <opaque_fragment>\n}',
    };
    patchGlintShader(shader);
    expect(shader.uniforms.uGlintT).toBeTruthy();
    expect(shader.uniforms.uGlintK).toBeTruthy();
    expect(shader.fragmentShader).toContain('uniform float uGlintT;');
    expect(shader.fragmentShader.indexOf('outgoingLight +=')).toBeLessThan(shader.fragmentShader.indexOf('#include <opaque_fragment>'));
    expect(shader.fragmentShader).toContain('vViewPosition');
  });

  it('zaman uniform değeri kısıtlı harekette durağan ve soluktur', () => {
    const shader = { uniforms: {}, fragmentShader: '#include <common>\n#include <opaque_fragment>' };
    patchGlintShader(shader);
    setGlintTime(123.4, false);
    expect(shader.uniforms.uGlintT.value).toBeCloseTo(123.4, 3);
    expect(shader.uniforms.uGlintK.value).toBe(1);
    setGlintTime(500, true);
    expect(shader.uniforms.uGlintT.value).toBeLessThan(1);
    expect(shader.uniforms.uGlintK.value).toBeLessThan(1);
    setGlintTime(0, false);
  });
});

describe('büyü parıltısı: eşya modelleri', () => {
  it('büyülü anahtarla kurulan model parıltılı malzeme kullanır; düz anahtar kullanmaz; yerleşim aynıdır', () => {
    const plain = createHeldItemModel(THREE, 'item:kılıç_demir');
    const ench = createHeldItemModel(THREE, 'item:kılıç_demir' + GLINT_SUFFIX);
    let glints = 0;
    let plainGlints = 0;
    ench.traverse((o) => { if (o.isMesh && o.material.userData && o.material.userData.kxGlint) glints++; });
    plain.traverse((o) => { if (o.isMesh && o.material.userData && o.material.userData.kxGlint) plainGlints++; });
    expect(glints).toBeGreaterThan(0);
    expect(plainGlints).toBe(0);
    expect(ench.userData.glint).toBe(true);
    expect(ench.userData.kind).toBe(plain.userData.kind);
    expect(getHeldPlacement(ench, 'fp').kind).toBe('sword');
  });

  it('asa modeli kurulur (staff türü), kristal ve güncelleme kancası vardır; yerdeki büyülü eşya mor halo alır', () => {
    const staff = createHeldItemModel(THREE, 'item:asa_ates');
    expect(staff.userData.kind).toBe('staff');
    expect(staff.userData.crystal).toBeTruthy();
    expect(() => staff.userData.update(1.5, 0.016)).not.toThrow();
    const pl = getHeldPlacement(staff, 'tp');
    expect(pl.hold).toBe('torch');
    const drop = createDroppedItem(THREE, 'item:asa_buz' + GLINT_SUFFIX);
    expect(drop.userData.spec.kind).toBe('staff');
    expect(() => drop.userData.update(0.3, 0.016)).not.toThrow();
  });

  it('bilinmeyen anahtar ve ek zararsızdır; boş anahtar null döner', () => {
    expect(createHeldItemModel(THREE, 'item:yok_boyle_esya' + GLINT_SUFFIX)).toBeTruthy();
    expect(createHeldItemModel(THREE, '')).toBe(null);
  });
});
