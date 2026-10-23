/*
 * gateVisual: açılış/kapanış durum makinesi, kalibrasyon, reducedMotion, kalite, yerleşim (normal → dönüş), renk/şekil ayrımı, shader sözleşmesi, dispose.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  GATE_COLORS, GATE_SHADERS, createGateVisual,
} from './gateVisual.js';

function mk(o) {
  const v = createGateVisual(THREE, o);
  const root = new THREE.Group();
  v.attach(root);
  return { v, root };
}

const spec = (o) => Object.assign({
  id: 1, kind: 'out', x: 10.5, y: 64, z: -3.5, nx: 0, nz: 1, w: 3, h: 4,
}, o || {});

describe('durum makinesi', () => {
  it('gizli → açılıyor (0,55 sn) → açık → kapanıyor (0,45 sn) → gizli; görünürlük ve çizim sayısı', () => {
    const { v } = mk();
    expect(v.state).toBe('gizli');
    expect(v.group.visible).toBe(false);
    expect(v.stats.draws).toBe(0);
    v.show(spec());
    expect(v.state).toBe('aciliyor');
    expect(v.group.visible).toBe(true);
    expect(v.stats.draws).toBe(2);
    let t = 0;
    while (v.state === 'aciliyor' && t < 2) { v.update(1 / 60); t += 1 / 60; }
    expect(t).toBeGreaterThan(0.5);
    expect(t).toBeLessThan(0.65);
    expect(v.state).toBe('acik');
    expect(v.openness).toBe(1);
    v.hide();
    expect(v.state).toBe('kapaniyor');
    t = 0;
    while (v.state === 'kapaniyor' && t < 2) { v.update(1 / 60); t += 1 / 60; }
    expect(t).toBeGreaterThan(0.4);
    expect(t).toBeLessThan(0.55);
    expect(v.state).toBe('gizli');
    expect(v.group.visible).toBe(false);
    v.dispose();
  });

  it('aynı kimlikle show yeniden başlatmaz; yeni kimlik açılışı baştan başlatır; instant gizler', () => {
    const { v } = mk();
    v.show(spec());
    for (let i = 0; i < 60; i++) v.update(1 / 60);
    expect(v.state).toBe('acik');
    v.show(spec());
    expect(v.state).toBe('acik');
    v.show(spec({ id: 2 }));
    expect(v.state).toBe('aciliyor');
    expect(v.openness).toBe(0);
    v.hide({ instant: true });
    expect(v.state).toBe('gizli');
    expect(v.spec).toBeNull();
    v.hide(); // gizliyken zararsız
    v.dispose();
  });

  it('kalibrasyon: açıklık kalibrasyon ilerlemesine bağlı büyür (3 sn), bitince tam açılır', () => {
    const { v } = mk();
    v.show(spec({ calibrating: true }));
    v.setCalibration(0.3);
    for (let i = 0; i < 60; i++) v.update(1 / 60);
    expect(v.openness).toBeCloseTo(0.3, 1);
    expect(v.state).toBe('aciliyor');
    v.setCalibration(1);
    v.show(spec({ calibrating: false }));
    for (let i = 0; i < 90; i++) v.update(1 / 60);
    expect(v.state).toBe('acik');
    v.dispose();
  });

  it('dt=0 / NaN / negatif dt animasyonu bozmaz', () => {
    const { v } = mk();
    v.show(spec());
    v.update(0);
    v.update(NaN);
    v.update(-1);
    expect(Number.isFinite(v.uniforms.uTime.value)).toBe(true);
    expect(Number.isFinite(v.uniforms.uOpen.value)).toBe(true);
    v.update(5); // büyük dt kırpılır
    expect(v.uniforms.uTime.value).toBeLessThanOrEqual(0.1000001);
    v.dispose();
  });
});

describe('yerleşim / görünüm', () => {
  it('3×4 oval: levha ölçeği, merkez ayak+2, normal yönünde döndürülmüş (yaw = atan2(nx,nz))', () => {
    const { v } = mk();
    v.show(spec({ nx: 1, nz: 0 }));
    expect(v.group.position.x).toBeCloseTo(10.5);
    expect(v.group.position.y).toBeCloseTo(66);
    expect(v.group.position.z).toBeCloseTo(-3.5);
    expect(v.group.rotation.y).toBeCloseTo(Math.PI / 2);
    const plane = v.group.children[0];
    expect(plane.scale.x).toBe(3);
    expect(plane.scale.y).toBe(4);
    // levha normali (+Z yerel) dünyada (nx,nz)'ye bakar
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(v.group.quaternion);
    expect(n.x).toBeCloseTo(1);
    expect(n.z).toBeCloseTo(0);
    v.show(spec({ id: 5, nx: 0, nz: -1 }));
    const n2 = new THREE.Vector3(0, 0, 1).applyQuaternion(v.group.quaternion);
    expect(n2.z).toBeCloseTo(-1);
    v.dispose();
  });

  it("'out' ve 'back' renkleri/şekilleri ayrı (mor+camgöbeği çentikli ↔ camgöbeği+sıcak beyaz düz halka); mavi/turuncu portallardan farklı", () => {
    const { v } = mk();
    v.show(spec({ kind: 'out' }));
    const outCore = v.uniforms.uCore.value.clone();
    const outKind = v.uniforms.uKind.value;
    v.show(spec({ id: 2, kind: 'back' }));
    expect(v.uniforms.uKind.value).not.toBe(outKind);
    expect(v.uniforms.uCore.value.equals(outCore)).toBe(false);
    // mor çekirdek: kırmızı ve mavi yüksek, yeşil düşük; hiçbir kapı rengi saf mavi (0.23,0.56,1) ya da turuncu (1,0.6,0.23) değil
    const blue = [0x3a / 255, 0x8f / 255, 1];
    const orange = [1, 0x9a / 255, 0x3a / 255];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    ['out', 'back'].forEach((k) => {
      expect(dist(GATE_COLORS[k].core, blue)).toBeGreaterThan(0.3);
      expect(dist(GATE_COLORS[k].core, orange)).toBeGreaterThan(0.3);
    });
    expect(GATE_COLORS.out.core[1]).toBeLessThan(GATE_COLORS.out.core[0]);
    v.dispose();
  });

  it('şarj girdaba hız/parlaklık ekler; reducedMotion sakinleştirir; kalite parçacık sayısını düşürür', () => {
    const { v } = mk();
    v.show(spec());
    v.setCharge(2);
    expect(v.uniforms.uCharge.value).toBe(1);
    v.setCharge(-1);
    expect(v.uniforms.uCharge.value).toBe(0);
    v.setReducedMotion(true);
    expect(v.uniforms.uCalm.value).toBe(1);
    v.setReducedMotion(false);
    expect(v.uniforms.uCalm.value).toBe(0);
    expect(v.stats.points).toBe(64);
    v.setQuality('low');
    expect(v.stats.points).toBe(24);
    v.setQuality('bogus');
    expect(v.stats.points).toBe(24);
    v.dispose();
  });

  it('boşta çizim yok; attach(null) sahneden çıkarır; yeniden attach taşır', () => {
    const { v, root } = mk();
    expect(root.children).toContain(v.group);
    const other = new THREE.Group();
    v.attach(other);
    expect(root.children).not.toContain(v.group);
    expect(other.children).toContain(v.group);
    v.attach(null);
    expect(v.group.parent).toBeNull();
    v.dispose();
  });
});

describe('shader sözleşmesi ve dispose', () => {
  it('GLSL: oval maske, discard, pow yok (negatif taban riski yok), çıkış kıskaçlı; yanıp sönme ≤ 2 Hz', () => {
    const { FRAG, PFRAG, VERT, PVERT } = GATE_SHADERS;
    expect(FRAG).toMatch(/if \(rr > 1\.0\) discard;/);
    expect(FRAG).not.toMatch(/pow\(/);
    expect(PFRAG).not.toMatch(/pow\(/);
    expect(FRAG).toMatch(/col = clamp\(col, 0\.0, 3\.0\);/);
    expect(VERT).toMatch(/gl_Position/);
    expect(PVERT).toMatch(/gl_PointSize = clamp\(/);
    // yavaş nabız: sin(t * 5.0) (≈0,8 Hz); taban hız 1'dir → ≤ 5 rad/s; şarjla ×4,5'a çıkar yalnız geçişte (kısa)
    const m = /sin\(t \* ([0-9.]+) \+ rr/.exec(FRAG);
    expect(m).toBeTruthy();
    expect(Number(m[1]) / (2 * Math.PI)).toBeLessThan(2);
  });

  it('dispose: geometri/malzeme atılır; ikinci dispose ve sonraki çağrılar zararsız', () => {
    const { v } = mk();
    v.show(spec());
    const geos = [v.group.children[0].geometry, v.group.children[1].geometry];
    let n = 0;
    geos.forEach((g) => g.addEventListener('dispose', () => { n++; }));
    v.dispose();
    expect(n).toBe(2);
    v.dispose();
    v.show(spec());
    v.update(0.1);
    expect(v.group.parent).toBeNull();
  });
});
