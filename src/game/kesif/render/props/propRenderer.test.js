import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bestOf, cpuMs, scaled } from '../../../../test/perfScale.js';
import * as THREE from 'three';
import { HUE_RGB, PROP_TIERS, createPropRenderer } from './propRenderer.js';
import { PropWorld } from '../../sim/props/propWorld.js';
import { PROP_BY_T, PROP_DEFS } from '../../sim/props/propDefs.js';
import { setPlanSource } from '../../sim/props/propPlan.js';
import { fakeBlockPlan } from '../../sim/props/propTestKit.js';
import { SIGN_ENTRIES } from '../../sim/props/propSigns.js';
import { createMaterialUniforms } from '../materials.js';
import { hash32 } from '../../sim/rng.js';

const SEED = 0x7a11;

beforeEach(() => setPlanSource(fakeBlockPlan));
afterEach(() => setPlanSource(null));

function fakeCanvas() {
  const state = { font: '' };
  const ctx = {
    set font(v) { state.font = v; },
    get font() { return state.font; },
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, fillText() {},
    measureText(t) {
      const m = /(\d+(?:\.\d+)?)px/.exec(state.font);
      return { width: t.length * (m ? parseFloat(m[1]) : 10) * 0.56 };
    },
  };
  return { width: 0, height: 0, getContext: () => ctx };
}

function makeRenderer(quality) {
  const uniforms = createMaterialUniforms(THREE);
  uniforms.uFadeEnd.value = 400;
  return createPropRenderer({
    THREE, uniforms, quality, createCanvas: () => fakeCanvas(),
  });
}

function loadWorld(cx0, cz0, cx1, cz1) {
  const pw = new PropWorld({ citySeed: SEED });
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) pw.loadChunk(cx, cz);
  return pw;
}

function camAt(x, y, z, yaw) {
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.06, 1600);
  cam.position.set(x, y, z);
  cam.rotation.order = 'YXZ';
  cam.rotation.y = yaw || 0;
  cam.updateMatrixWorld(true);
  return cam;
}

function totalCount(pr) {
  let n = 0;
  pr.slots.forEach((s) => { n += s.count; });
  return n;
}

describe('createPropRenderer — yapı', () => {
  it('13 gövde + 2 holo = 15 InstancedMesh; çizim çağrısı sınırı ≤ 40; malzeme sayısı 15', () => {
    const pr = makeRenderer('high');
    expect(pr.group.children.length).toBe(15);
    pr.group.children.forEach((c) => expect(c.isInstancedMesh).toBe(true));
    expect(pr.group.children.length).toBeLessThanOrEqual(40);
    pr.group.children.forEach((c) => {
      expect(c.frustumCulled).toBe(false);
      expect(c.instanceColor).not.toBeNull();
      expect(c.instanceMatrix.count).toBeGreaterThanOrEqual(32);
    });
    const hasHolo = pr.group.children.filter((c) => c.material.transparent);
    expect(hasHolo.length).toBe(2);
    hasHolo.forEach((c) => {
      expect(c.material.blending).toBe(THREE.AdditiveBlending);
      expect(c.material.depthWrite).toBe(false);
    });
    pr.dispose();
  });

  it('paylaşılan uniform nesneleri referansla bağlanır (gün/gece güncellemesi anında yansır)', () => {
    const uniforms = createMaterialUniforms(THREE);
    const pr = createPropRenderer({ THREE, uniforms, createCanvas: () => fakeCanvas() });
    pr.group.children.forEach((c) => {
      expect(c.material.uniforms.uSkyLight).toBe(uniforms.uSkyLight);
      expect(c.material.uniforms.uTime).toBe(uniforms.uTime);
      expect(c.material.uniforms.uFogNear).toBe(uniforms.uFogNear);
      expect(c.material.uniforms.uSignMap.value).toBe(pr.atlas.texture);
    });
    pr.dispose();
  });

  it('uniforms verilmezse varsayılanlarla çalışır', () => {
    const pr = createPropRenderer({ THREE, createCanvas: () => fakeCanvas() });
    expect(pr.group.children[0].material.uniforms.uSkyLight.value).toBe(1);
    pr.dispose();
  });

  it('bellek ayak izi ≤ 25 MB (öznitelik dizileri + geometri)', () => {
    const pr = makeRenderer('high');
    let bytes = 0;
    pr.group.children.forEach((c) => {
      bytes += c.instanceMatrix.array.byteLength + c.instanceColor.array.byteLength;
      Object.keys(c.geometry.attributes).forEach((n) => { bytes += c.geometry.attributes[n].array.byteLength; });
    });
    bytes += 1024 * 1024 * 4; // atlas tuvali RGBA
    expect(bytes).toBeLessThan(25 * 1024 * 1024);
    pr.dispose();
  });
});

describe('örnek kümesi ve yeniden kurma', () => {
  it('görünür chunk kümesi değişmedikçe yeniden kurulmaz; kamera chunk sınırını geçince kurulur', () => {
    const pw = loadWorld(0, 0, 6, 6);
    const pr = makeRenderer('high');
    pr.setWorld(pw);
    const cam = camAt(48, 66, 48, 0);
    pr.update(0.016, cam);
    expect(pr.stats.rebuilds).toBe(1);
    expect(pr.stats.instances).toBeGreaterThan(20);
    for (let i = 0; i < 300; i++) pr.update(0.016, cam); // 4.8 sn, sabit kamera
    expect(pr.stats.rebuilds).toBe(1);
    // kamerayı döndür: görünür küme değişir
    cam.rotation.y = Math.PI;
    cam.updateMatrixWorld(true);
    for (let i = 0; i < 10; i++) pr.update(0.016, cam);
    expect(pr.stats.rebuilds).toBeGreaterThanOrEqual(2);
    pr.dispose();
  });

  it('yüklü küme değişince (chunk boşaltma) aynı karede yeniden kurulur; boşaltılan prop kalmaz', () => {
    const pw = loadWorld(0, 0, 3, 3);
    const pr = makeRenderer('high');
    pr.setWorld(pw);
    const cam = camAt(32, 66, 32, 0);
    pr.update(0.016, cam);
    const before = pr.stats.rebuilds;
    const n0 = totalCount(pr);
    pw.unloadChunk(0, 0);
    pr.update(0.001, cam);
    expect(pr.stats.rebuilds).toBe(before + 1);
    expect(totalCount(pr)).toBeLessThanOrEqual(n0);
    const ids = new Set();
    pr.slots.forEach((s) => { for (let i = 0; i < s.count; i++) ids.add(s.ids[i]); });
    ids.forEach((id) => expect(pw.has(id)).toBe(true));
    pr.dispose();
  });

  it('dünya yok / dispose sonrası update güvenli', () => {
    const pr = makeRenderer('high');
    expect(() => pr.update(0.016, camAt(0, 66, 0))).not.toThrow();
    pr.dispose();
    expect(() => pr.update(0.016, camAt(0, 66, 0))).not.toThrow();
    expect(() => pr.dispose()).not.toThrow();
  });

  it('örnek sayısı, mesh.count, kademe sınırları: yüksek 2500/60k, düşük 900/20k, holo 24/8', () => {
    ['high', 'medium', 'low'].forEach((q) => {
      const pw = loadWorld(0, 0, 14, 14);
      const pr = makeRenderer(q);
      pr.setWorld(pw);
      pr.update(0.016, camAt(120, 66, 120, 0.3));
      const t = PROP_TIERS[q];
      expect(pr.stats.instances).toBeLessThanOrEqual(t.maxInst);
      expect(pr.stats.tris).toBeLessThanOrEqual(t.maxTris);
      expect(pr.stats.holo).toBeLessThanOrEqual(t.maxHolo);
      expect(pr.stats.draws).toBeLessThanOrEqual(40);
      let sum = 0;
      pr.slots.forEach((s) => {
        expect(s.count).toBeLessThanOrEqual(t.cap);
        expect(s.body.mesh.count).toBe(s.count);
        expect(s.body.mesh.visible).toBe(s.count > 0);
        sum += s.count;
        if (s.holo) {
          expect(s.holo.mesh.count).toBe(s.holoCount);
          expect(s.holoCount).toBeLessThanOrEqual(t.maxHolo);
        }
      });
      expect(sum).toBe(pr.stats.instances);
      pr.dispose();
    });
  });

  it('bütçe aşılınca en uzak örnekler düşer: 10 blok içindeki (her zaman aday) proplar kalır', () => {
    const pw = loadWorld(0, 0, 29, 29);
    const pr = makeRenderer('low');
    pr.setWorld(pw);
    const cam = camAt(240, 66, 240, 0);
    pr.update(0.016, cam);
    expect(pr.stats.skipped).toBeGreaterThan(0);
    const kept = new Set();
    pr.slots.forEach((s) => { for (let i = 0; i < s.count; i++) kept.add(s.ids[i]); });
    let nearDropped = 0;
    let near = 0;
    pw.forEachEntry((e, id) => {
      if (Math.hypot(e.prop.x - 240, e.prop.z - 240) < 10) {
        near++;
        if (!kept.has(id)) nearDropped++;
      }
    });
    expect(near).toBeGreaterThan(0);
    expect(nearDropped).toBe(0);
    pr.dispose();
  });

  it('setQuality: kademe değişince yeniden kurulur ve sınırlar uygulanır', () => {
    const pw = loadWorld(0, 0, 14, 14);
    const pr = makeRenderer('high');
    pr.setWorld(pw);
    const cam = camAt(120, 66, 120, 0.3);
    pr.update(0.016, cam);
    const high = pr.stats.instances;
    pr.setQuality('low');
    pr.update(0.016, cam);
    expect(pr.stats.instances).toBeLessThanOrEqual(900);
    expect(pr.stats.instances).toBeLessThan(high + 1);
    pr.setQuality('nope');
    expect(pr.quality).toBe('low');
    pr.dispose();
  });

  it('yeniden kurma maliyeti: 2500 örnekte ≤ 8 ms; kararlı update ≤ 0.5 ms ortalama', () => {
    const pw = loadWorld(0, 0, 29, 29);
    const pr = makeRenderer('high');
    pr.setWorld(pw);
    const cam = { position: { x: 240, y: 66, z: 240 } }; // süzgeç yok: tüm yarıçap adaylanır
    pr.update(0.016, cam);
    pr.invalidate();
    pr.update(0.016, cam);
    pr.invalidate();
    pr.update(0.016, cam);
    expect(pr.stats.instances).toBeGreaterThan(1000);
    expect(pr.stats.instances).toBeLessThanOrEqual(2500);
    expect(pr.stats.lastRebuildMs).toBeLessThan(scaled(8));
    // qa5: CPU zamanı + en iyi 3 parti; eşik yük ölçeğiyle (bkz. test/perfScale.js)
    const per = bestOf(3, () => {
      const t0 = cpuMs();
      for (let i = 0; i < 600; i++) pr.update(0.016, cam);
      return (cpuMs() - t0) / 600;
    });
    expect(per).toBeLessThan(scaled(0.5));
    pr.dispose();
  });
});

describe('örnek öznitelikleri', () => {
  function find(pr, pw, key) {
    const out = [];
    const slot = pr.slots.get(key);
    for (let i = 0; i < slot.count; i++) out.push({ i, id: slot.ids[i], p: pw.get(slot.ids[i]), slot });
    return out;
  }

  it('örnek matrisi = konum × Y dönüşü (yaw·90°) — three Matrix4 ile aynı', () => {
    const pw = loadWorld(0, 0, 6, 6);
    const pr = makeRenderer('high');
    pr.setWorld(pw);
    pr.update(0.016, camAt(48, 66, 48, 0));
    let checked = 0;
    ['lamba', 'bank', 'otomat', 'terminal', 'cit'].forEach((k) => {
      find(pr, pw, k).forEach(({ i, p, slot }) => {
        const m = new THREE.Matrix4().makeRotationY((p.yaw * Math.PI) / 2).setPosition(p.x, p.y, p.z);
        const a = slot.body.mesh.instanceMatrix.array;
        for (let e = 0; e < 16; e++) expect(Math.abs(a[i * 16 + e] - m.elements[e])).toBeLessThan(1e-9);
        checked++;
      });
    });
    expect(checked).toBeGreaterThan(8);
    pr.dispose();
  });

  it('bitki tanımları ±%8 ölçek sapması alır; diğerleri tam ölçek (çarpışma kutusu eşleşir)', () => {
    const pw = loadWorld(0, 0, 8, 8);
    const pr = makeRenderer('high');
    pr.setWorld(pw);
    pr.update(0.016, camAt(64, 66, 64, 0));
    const scales = new Set();
    find(pr, pw, 'saksi').forEach(({ i, slot }) => {
      const a = slot.body.mesh.instanceMatrix.array;
      const sy = a[i * 16 + 5];
      expect(sy).toBeGreaterThanOrEqual(0.92 - 1e-9);
      expect(sy).toBeLessThanOrEqual(1.08 + 1e-9);
      scales.add(Math.round(sy * 1000));
    });
    expect(scales.size).toBeGreaterThan(3);
    find(pr, pw, 'bank').forEach(({ i, slot }) => {
      expect(slot.body.mesh.instanceMatrix.array[i * 16 + 5]).toBe(1);
    });
    pr.dispose();
  });

  it('ağaç iki varyant grubuna bölünür (variant bit 2)', () => {
    const pw = loadWorld(0, 0, 10, 10);
    const pr = makeRenderer('high');
    pr.setWorld(pw);
    pr.update(0.016, camAt(80, 66, 80, 0));
    find(pr, pw, 'agac').forEach(({ p }) => expect(p.variant & 4).toBe(0));
    find(pr, pw, 'agac:1').forEach(({ p }) => expect(p.variant & 4).toBe(4));
    expect(find(pr, pw, 'agac').length + find(pr, pw, 'agac:1').length).toBeGreaterThan(0);
    pr.dispose();
  });

  it('tabela örnekleri: atlas dikdörtgeni ve dükkân tonu; billboard holo örneği gövdeyle aynı örneği paylaşır', () => {
    const pw = loadWorld(0, 0, 10, 10);
    const pr = makeRenderer('high');
    pr.setWorld(pw);
    pr.update(0.016, camAt(80, 66, 80, 0));
    const tabelas = find(pr, pw, 'tabela');
    expect(tabelas.length).toBeGreaterThan(0);
    const lin = (hex) => {
      const c = new THREE.Color(hex);
      return [c.r, c.g, c.b];
    };
    tabelas.forEach(({ i, p, slot }) => {
      const en = SIGN_ENTRIES[p.flags & 0xffff];
      const rect = pr.atlas.rectOf(en.i);
      const a = slot.body.aSign.array;
      expect(Array.from(a.slice(i * 4, i * 4 + 4)).map((v) => Math.fround(v))).toEqual(rect.map((v) => Math.fround(v)));
      const col = lin(HUE_RGB[en.hue]);
      for (let k = 0; k < 3; k++) expect(slot.body.color.array[i * 3 + k]).toBeCloseTo(col[k], 5);
      expect(slot.body.aInst.array[i * 4 + 3]).toBe(en.mode);
    });
    const bb = pr.slots.get('billboard');
    for (let hi = 0; hi < bb.holoCount; hi++) {
      const src = bb.holoSrc[hi];
      expect(Array.from(bb.holo.mesh.instanceMatrix.array.slice(hi * 16, hi * 16 + 16)))
        .toEqual(Array.from(bb.body.mesh.instanceMatrix.array.slice(src * 16, src * 16 + 16)));
      expect(Array.from(bb.holo.aSign.array.slice(hi * 4, hi * 4 + 4))).toEqual(Array.from(bb.body.aSign.array.slice(src * 4, src * 4 + 4)));
    }
    pr.dispose();
  });

  it('durum senkronu: terminal kullanılınca ≤ 0.1 sn içinde aInst.x = 1; trafik direği durum 0..2', () => {
    const pw = loadWorld(0, 0, 10, 10);
    const pr = makeRenderer('high');
    pr.setWorld(pw);
    const cam = camAt(80, 66, 80, 0);
    pr.update(0.016, cam);
    const terms = find(pr, pw, 'terminal');
    if (terms.length === 0) return; // sahte planda bu bölgede yok (nadir): kapsam diğer testlerde
    const { id, i, slot } = terms[0];
    expect(slot.body.aInst.array[i * 4]).toBe(0);
    pw.use(id);
    for (let k = 0; k < 8; k++) pr.update(0.016, cam);
    expect(slot.body.aInst.array[i * 4]).toBe(1);
    pr.dispose();
  });

  it('ışık tazeleme: getLight sonucu aLight\'a yazılır (gökyüzü/blok 0..1)', () => {
    const pw = loadWorld(0, 0, 6, 6);
    const pr = makeRenderer('high');
    pr.setWorld(pw, { getLight: () => (9 << 4) | 12 });
    const cam = camAt(48, 66, 48, 0);
    pr.update(0.016, cam);
    const n = pr.stats.instances;
    for (let k = 0; k < Math.ceil(n / 96) + 3; k++) pr.update(0.016, cam);
    let ok = 0;
    pr.slots.forEach((s) => {
      for (let i = 0; i < s.count; i++) {
        if (Math.abs(s.body.aLight.array[i * 2] - 9 / 15) < 1e-6 && Math.abs(s.body.aLight.array[i * 2 + 1] - 12 / 15) < 1e-6) ok++;
      }
    });
    expect(ok).toBe(n);
    // bir sonraki yeniden kurmada önbellekten gelir (başlangıç değeri varsayılan değil)
    pr.invalidate();
    pr.update(0.016, cam);
    let cached = 0;
    pr.slots.forEach((s) => {
      for (let i = 0; i < s.count; i++) if (Math.abs(s.body.aLight.array[i * 2] - 9 / 15) < 1e-6) cached++;
    });
    expect(cached).toBeGreaterThan(n * 0.5);
    pr.dispose();
  });

  it('getLight sayı dönmezse örnek ışığı bozulmaz', () => {
    const pw = loadWorld(0, 0, 4, 4);
    const pr = makeRenderer('high');
    pr.setWorld(pw, { getLight: () => null });
    const cam = camAt(32, 66, 32, 0);
    for (let k = 0; k < 5; k++) pr.update(0.016, cam);
    pr.slots.forEach((s) => {
      for (let i = 0; i < s.count; i++) expect(Number.isFinite(s.body.aLight.array[i * 2])).toBe(true);
    });
    pr.dispose();
  });

  it('dinamik prop (kabin) yakınsa çizilir ve taşınınca yeniden kurma ile izlenir', () => {
    const pw = loadWorld(0, 0, 4, 4);
    const pr = makeRenderer('high');
    pr.setWorld(pw);
    const cam = camAt(32, 66, 32, 0);
    pr.update(0.016, cam);
    const before = totalCount(pr);
    pw.addDynamic({ id: 0xdeadbee, t: PROP_DEFS.otomat.t, x: 33, y: 64, z: 33, yaw: 1, variant: 0, flags: 0 });
    pr.update(0.001, cam);
    expect(totalCount(pr)).toBe(before + 1);
    pw.removeDynamic(0xdeadbee);
    pr.update(0.001, cam);
    expect(totalCount(pr)).toBe(before);
    pr.dispose();
  });
});

describe('dispose / sızıntı', () => {
  it('dispose geometri, malzeme ve mesh\'leri bırakır; grup boşalır', () => {
    const pr = makeRenderer('high');
    let geoDisposed = 0;
    let matDisposed = 0;
    pr.group.children.forEach((c) => {
      c.geometry.addEventListener('dispose', () => { geoDisposed++; });
      c.material.addEventListener('dispose', () => { matDisposed++; });
    });
    pr.dispose();
    expect(geoDisposed).toBe(15);
    expect(matDisposed).toBe(15);
    expect(pr.group.children.length).toBe(0);
    expect(pr.atlas.texture).toBeNull();
  });

  it('verilen atlas dispose edilmez (sahibi çağıran)', () => {
    const pr1 = makeRenderer('high');
    const atlas = pr1.atlas;
    const pr2 = createPropRenderer({
      THREE, uniforms: createMaterialUniforms(THREE), signAtlas: atlas,
    });
    pr2.dispose();
    expect(atlas.texture).not.toBeNull();
    pr1.dispose();
    expect(atlas.texture).toBeNull();
  });

  it('50 kurma/yok etme döngüsünde geometri/malzeme sayısı sabit (kaçak yok)', () => {
    let created = 0;
    let disposed = 0;
    for (let k = 0; k < 50; k++) {
      const pr = makeRenderer('low');
      pr.group.children.forEach((c) => {
        created += 2;
        c.geometry.addEventListener('dispose', () => { disposed++; });
        c.material.addEventListener('dispose', () => { disposed++; });
      });
      pr.dispose();
    }
    expect(disposed).toBe(created);
  });

  it('tanım tablosu ve renderer tanım sayıları tutarlı', () => {
    const pr = makeRenderer('high');
    const keys = Array.from(pr.slots.keys());
    expect(keys.length).toBe(13);
    Object.keys(PROP_DEFS).forEach((k) => expect(keys.indexOf(k) >= 0).toBe(true));
    expect(PROP_BY_T[1].key).toBe('lamba');
    expect(hash32(1)).toBeGreaterThan(0);
    pr.dispose();
  });
});
