/*
 * Keşif görünümü × portal / parçacık / araç (gerçek three, GL yok): yalnız renk parametresi; portal `kind` (düz/kesikli halka) SABİT;
 * parçacık sayısı ≤28 ve kısıtlı harekette aynı; araç kiti yalnız sürülen araca, çizim çağrısı aynı, kit kalkınca garaj renkleri BİREBİR.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPortalVisual, PORTAL_HEX } from './techPortalVisual.js';
import { createFxTech } from './particleFxTech.js';
import { createScratch } from './particleFx.js';
import { createParticleSystem } from './particles.js';
import { createVehicleRenderer } from './city/vehicleModels.js';
import { createMaterialUniforms } from './materials.js';
import { resolveSkin, resolveSkinSet } from './skins.js';
import { KESIF } from '../../shop/designs/kesif.js';

/* ---------------------------------------------------------------- portal */
describe('techPortalVisual.setPalette', () => {
  const mk = (o) => createPortalVisual(THREE, new THREE.Group(), o);
  const unis = (pv) => ['mavi', 'turuncu'].map((n) => {
    const u = pv._items[n].uniforms;
    return { c: u.uColor.value.getHex(), c2: u.uColor2.value.getHex(), kind: u.uKind.value };
  });

  it('renk uniform\'ları değişir, `kind` (mavi=düz 0, turuncu=kesikli 1) ASLA değişmez; null varsayılanı BİREBİR geri getirir', () => {
    const pv = mk();
    const base = unis(pv);
    expect(base.map((x) => x.kind)).toEqual([0, 1]);
    KESIF.filter((d) => d.kind === 'portal').forEach((d) => {
      const sk = resolveSkin('portal', d.id);
      pv.setPalette(sk);
      const now = unis(pv);
      expect(now.map((x) => x.kind), d.id).toEqual([0, 1]);
      expect(now[0].c).toBe(sk.a.c);
      expect(now[1].c).toBe(sk.b.c);
      expect(pv.hexOf('mavi')).toBe(sk.a.c);
      expect(pv.hexOf('turuncu')).toBe(sk.b.c);
    });
    pv.setPalette(null);
    expect(unis(pv)).toEqual(base);
    expect(pv.hexOf('mavi')).toBe(PORTAL_HEX.mavi);
    expect(pv.hexOf('turuncu')).toBe(PORTAL_HEX.turuncu);
    pv.dispose();
  });

  it('opts.palette ile kurulur; iki portal ayrı malzeme/geometri; bozuk palet sessizce varsayılan; yeni malzeme/mesh yok', () => {
    const plain = mk();
    const nMesh = (pv) => { let n = 0; pv.group.traverse((o) => { if (o.isMesh) n++; }); return n; };
    const sk = resolveSkin('portal', 'portal:altin-kapi');
    const withPal = mk({ palette: sk });
    expect(nMesh(withPal)).toBe(nMesh(plain));
    expect(unis(withPal)[0].c).toBe(sk.a.c);
    [null, undefined, {}, { a: 1, b: 2 }, { a: { c: NaN, c2: 1 }, b: { c: 1, c2: 1 } }].forEach((bad) => {
      const pv = mk();
      const before = unis(pv);
      pv.setPalette(bad);
      expect(unis(pv)).toEqual(before);
      pv.dispose();
    });
    // portalSwirl parçacığı skin rengini kullanır
    const calls = [];
    const pv = mk({ palette: sk });
    pv.sync({ mavi: { cells: [{ x: 0, y: 0, z: 0 }], n: [0, 0, 1], u: [1, 0, 0], r: [1, 0, 0], center: [1, 1, 1] }, turuncu: null });
    pv.update(0.1, { position: { x: 1, y: 1, z: 3 } }, { portalSwirl: (p, c) => calls.push(c) }, false, 1);
    expect(calls[0]).toBe(sk.a.c);
    plain.dispose(); withPal.dispose(); pv.dispose();
  });
});

/* ---------------------------------------------------------------- parçacık */
function fxHarness(skin, reduced = false, density = 1) {
  let n = 0;
  const out = [];
  const sys = {
    S: createScratch(),
    emit(S) { out.push({ kind: S.kind, r0: S.r0, g0: S.g0, b0: S.b0, r1: S.r1, g1: S.g1, b1: S.b1 }); },
    rnd() { n++; return (n * 0.6180339887) % 1; },
    col: (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255],
    density,
    reduced,
    skin,
  };
  return { fx: createFxTech(sys), out, sys };
}

describe('particleFxTech: jetFlame / gecisBurst', () => {
  it('jetFlame skin renklerini kullanır; sayı sınırı: çağrı başına ≤ 28 parçacık (skin\'li kıvılcımlı dahil)', () => {
    KESIF.filter((d) => d.kind === 'jet').forEach((d) => {
      const jet = resolveSkin('jet', d.id);
      const h = fxHarness({ jet, gecis: null });
      const base = fxHarness(null);
      for (let i = 0; i < 200; i++) {
        const before = h.out.length;
        h.fx.jetFlame({ x: 0, y: 1, z: 0 }, 0, -2, 0);
        expect(h.out.length - before, d.id).toBeLessThanOrEqual(28);
        base.fx.jetFlame({ x: 0, y: 1, z: 0 }, 0, -2, 0);
      }
      // ilk parçacık flame[0]'a yakın (çarpan 1.25)
      const lin = (c) => ((c >> 16) & 255) / 255;
      expect(h.out[0].r0).toBeCloseTo(lin(jet.flame[0]) * 1.25, 5);
      expect(h.out[0].r1).toBeCloseTo(lin(jet.flame[2]), 5);
      expect(h.out.slice(0, 20).some((p, i) => p.r0 !== base.out[i].r0 || p.g0 !== base.out[i].g0)).toBe(true);
      // kıvılcım yalnız spark: true ve kısıtlı hareket kapalıyken (SPARK türü 1)
      const sparks = h.out.filter((p) => p.kind === 1).length;
      if (jet.spark) expect(sparks, d.id).toBeGreaterThan(0);
      else expect(sparks, d.id).toBe(0);
    });
  });

  it('low kademe (skin.anim=false): ek kıvılcım yok, parçacık sayısı aynı', () => {
    const jet = resolveSkin('jet', 'jet:altin-kivilcim');
    const a = fxHarness({ jet, gecis: null, anim: false });
    const b = fxHarness({ jet, gecis: null, anim: true });
    for (let i = 0; i < 100; i++) { a.fx.jetFlame({ x: 0, y: 1, z: 0 }); b.fx.jetFlame({ x: 0, y: 1, z: 0 }); }
    expect(a.out.filter((p) => p.kind === 1)).toHaveLength(0);
    expect(b.out.filter((p) => p.kind === 1).length).toBeGreaterThan(0);
  });

  it('kısıtlı hareket (reduced): kıvılcım yok, sayı aynı; yoğunluk ölçeklemesi korunur', () => {
    const jet = resolveSkin('jet', 'jet:yildiz-izi');
    const r = fxHarness({ jet, gecis: null }, true, 0.55);
    for (let i = 0; i < 100; i++) r.fx.jetFlame({ x: 0, y: 1, z: 0 });
    expect(r.out.filter((p) => p.kind === 1)).toHaveLength(0);
    const rb = fxHarness(null, true, 0.55);
    for (let i = 0; i < 100; i++) rb.fx.jetFlame({ x: 0, y: 1, z: 0 });
    expect(r.out.length).toBe(rb.out.length);
  });

  it('gecisBurst: skin yoksa HİÇ parçacık; varsa ≤ 15 parçacık, RING+MOTE/STAR (mevcut türler), sonlu renkler', () => {
    const none = fxHarness(null);
    none.fx.gecisBurst({ x: 0, y: 0, z: 0 }, 1);
    none.fx.gecisBurst({ x: 0, y: 0, z: 0 }, 0);
    expect(none.out).toHaveLength(0);
    const empty = fxHarness({ jet: null, gecis: null });
    empty.fx.gecisBurst({ x: 0, y: 0, z: 0 }, 1);
    expect(empty.out).toHaveLength(0);
    KESIF.filter((d) => d.kind === 'gecis').forEach((d) => {
      [0, 1].forEach((phase) => {
        const h = fxHarness({ jet: null, gecis: resolveSkin('gecis', d.id) });
        h.fx.gecisBurst({ x: 1, y: 2, z: 3 }, phase);
        expect(h.out.length, d.id).toBeGreaterThan(3);
        expect(h.out.length, d.id).toBeLessThanOrEqual(15);
        h.out.forEach((p) => {
          expect([2, 6, 7]).toContain(p.kind); // RING, STAR, MOTE
          [p.r0, p.g0, p.b0, p.r1, p.g1, p.b1].forEach((v) => expect(Number.isFinite(v)).toBe(true));
        });
      });
    });
  });

  it('gerçek parçacık sistemi: setSkin(set) jetFlame\'i etkiler, setSkin(null) eski davranışa döner; sonlu tampon', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', seed: 5 });
    const set = resolveSkinSet({ jet: 'jet:pembe-bulut', gecis: 'gecis:neon-dalga' }, { tier: 'high' });
    ps.setSkin(set);
    const s0 = ps.stats().spawned;
    for (let i = 0; i < 20; i++) ps.jetFlame({ x: 0, y: 1, z: 0 }, 0, 0, 0);
    ps.gecisBurst({ x: 0, y: 0, z: 0 }, 1);
    expect(ps.stats().spawned).toBeGreaterThan(s0);
    const s1 = ps.stats().spawned;
    ps.setSkin(null);
    ps.gecisBurst({ x: 0, y: 0, z: 0 }, 1);
    expect(ps.stats().spawned).toBe(s1); // skin yok → geçiş efekti yok
    const cam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 300);
    cam.position.set(0, 1.6, 4);
    cam.updateMatrixWorld(true);
    ps.update(0.3, cam);
    let bad = 0;
    ps._debug.layers.forEach((L) => L.arrays.forEach((a) => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) bad++; }));
    expect(bad).toBe(0);
    ps.dispose();
  });
});

/* ---------------------------------------------------------------- araç */
function fakeCanvas() {
  const ctx = {
    font: '', save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, rect() {}, fillRect() {}, fillText() {}, roundRect() {},
    measureText: (t) => ({ width: t.length * 10 }),
  };
  return { width: 0, height: 0, getContext: () => ctx };
}
function makeVR(quality) {
  const uniforms = createMaterialUniforms(THREE);
  uniforms.uFadeEnd.value = 400;
  uniforms.uFadeStart.value = 380;
  return createVehicleRenderer({ THREE, uniforms, quality, createCanvas: () => fakeCanvas() });
}
const cam = () => {
  const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1600);
  c.position.set(0, 3, 8);
  c.updateMatrixWorld(true);
  return c;
};
const ENV = (extra) => ({ night: 1, rain: 0, wet: 0, shelter: 0, reduced: false, rigRadius: 80, ...extra });
function drawCalls(vr) {
  let n = 0;
  vr.group.traverse((o) => {
    if ((o.isMesh || o.isInstancedMesh) && o.visible) {
      let p = o.parent;
      let vis = true;
      while (p) { if (!p.visible) vis = false; p = p.parent; }
      if (vis && (!o.isInstancedMesh || o.count > 0)) n++;
    }
  });
  return n;
}
function step(vr, o, env, dt = 1 / 60) {
  vr.beginFrame(cam(), dt, env || ENV());
  const d = vr.slot();
  Object.assign(d, { id: 7, kind: 'sedan', occupied: true, driven: true, nitro: true }, o);
  const other = vr.slot();
  Object.assign(other, { id: 8, kind: 'hatch', occupied: false, x: 6, z: -4 }, o && o.kit ? { kit: o.kit } : {}); // sürülmeyen araca kit verilse bile uygulanmaz (vehicleVisual yalnız sürülene verir)
  vr.endFrame();
  return vr.rigs.get(7);
}
const uni = (rig) => ({
  body: rig.uniforms.uBodyU.value.getHex(), accent: rig.uniforms.uAccentU.value.getHex(), neon: rig.uniforms.uNeonC.value.getHex(), rim: rig.uniforms.uRimStyle.value,
});

describe('araç boya kiti', () => {
  let vr;
  afterEach(() => { if (vr) vr.dispose(); vr = null; });

  it('kit rig uniform değerlerini yazar (renk + jant biçimi); kit kalkınca garaj renkleri BİREBİR geri gelir; yeni uniform/malzeme/mesh yok', () => {
    vr = makeVR('high');
    const cos = { body: 3, accent: 2, neon: 4, under: { on: true, color: 1, pattern: 1 }, wheels: 1, plate: 0, horn: 0, radio: 0 };
    const rig0 = step(vr, { cos });
    const base = uni(rig0);
    const calls0 = drawCalls(vr);
    const uniformKeys = Object.keys(rig0.uniforms).sort();
    const kit = resolveSkin('arac', 'arac:meridyen-yildizi');
    const rig1 = step(vr, { cos, kit });
    expect(rig1).toBe(rig0); // rig yeniden kurulmadı
    expect(uni(rig1)).toEqual({ body: kit.body, accent: kit.accent, neon: kit.neon, rim: 3 });
    expect(Object.keys(rig1.uniforms).sort()).toEqual(uniformKeys);
    expect(drawCalls(vr)).toBe(calls0); // çizim çağrısı AYNI
    const rig2 = step(vr, { cos });
    expect(uni(rig2)).toEqual(base);
    // aynı kiti tekrar uygulamak (cosKey aynı) uniform'ları yeniden yazmaz
    step(vr, { cos, kit });
    const n1 = uni(vr.rigs.get(7));
    step(vr, { cos, kit });
    expect(uni(vr.rigs.get(7))).toEqual(n1);
  });

  it('29 değil 6 araç kiti: hepsi uygulanır, değerler sonlu, çizim çağrısı sayısı kitsizle AYNI (3 kademe)', () => {
    ['high', 'medium', 'low'].forEach((q) => {
      vr = makeVR(q);
      step(vr, {});
      const base = drawCalls(vr);
      KESIF.filter((d) => d.kind === 'arac').forEach((d) => {
        const kit = resolveSkin('arac', d.id);
        const rig = step(vr, { kit });
        const u = uni(rig);
        [u.body, u.accent, u.neon, u.rim].forEach((v) => expect(Number.isFinite(v)).toBe(true));
        expect(drawCalls(vr), q + ' ' + d.id).toBe(base);
      });
      vr.dispose();
      vr = null;
    });
  });

  it('holo kit: neon tonu high\'da döner (≤12 güncelleme/sn); low kademe ve kısıtlı harekette SABİT', () => {
    const kit = resolveSkin('arac', 'arac:holo-kristal');
    expect(kit.cycle).toBe(true);
    const neonAt = (q, env, frames) => {
      vr = makeVR(q);
      const seen = new Set();
      let rig = null;
      for (let i = 0; i < frames; i++) {
        rig = step(vr, { kit }, ENV(env), 1 / 30);
        seen.add(rig.uniforms.uNeonC.value.getHex());
      }
      vr.dispose();
      vr = null;
      return seen;
    };
    expect(neonAt('high', {}, 240).size).toBeGreaterThan(3);
    expect(neonAt('high', {}, 240).size).toBeLessThanOrEqual(8 * 12 + 2); // 8 sn'de en çok 12/sn
    expect(neonAt('low', {}, 240).size).toBe(1);
    expect(neonAt('high', { reduced: true }, 240).size).toBe(1);
    expect(neonAt('medium', { reduced: true }, 60).size).toBe(1);
    // sabit kit (döngüsüz)
    const flat = resolveSkin('arac', 'arac:limonata');
    vr = makeVR('high');
    const s = new Set();
    for (let i = 0; i < 120; i++) s.add(step(vr, { kit: flat }, ENV(), 1 / 30).uniforms.uNeonC.value.getHex());
    expect(s.size).toBe(1);
  });

  it('kit yokken sim betimleyicisi (cos) hiç değişmez: kit yalnız render alanı', () => {
    vr = makeVR('high');
    const cos = Object.freeze({ body: 1, accent: 1, neon: 1, under: Object.freeze({ on: true, color: 1, pattern: 2 }), wheels: 2, plate: 0, horn: 0, radio: 0 });
    expect(() => step(vr, { cos, kit: resolveSkin('arac', 'arac:gece-yolcusu') })).not.toThrow();
  });
});
