import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { fbm2, valueNoise2 } from './noise.js';
import { box, createMeshBuilder, cylinder, jitterGeometry, plate } from './geo.js';
import { ISLAND_STOPS, createLayout, itemFrontWeight, sanitizeStops, FOCUS_OFFSET } from './layout.js';
import { createHeightField, buildIslandTop, buildIslandUnder, buildPond, TOP_SEGMENTS } from './terrain.js';
import { buildTreeTemplate, layoutProps, TREE_TYPES } from './props.js';
import { buildLandmarks } from './landmarks.js';
import { createClouds, createMist, createSoftGlowTexture } from './sky.js';
import { createCreatures } from './creatures.js';
import { createIslandWorld, frameMetrics, measureScene } from './scene.js';
import { TAU, angleForStop } from './interaction.js';

/** Geometrinin tüm sayısal özniteliklerinde NaN/Infinity yok mu? */
function finiteGeometry(geo) {
    for (const name of Object.keys(geo.attributes)) {
        const arr = geo.attributes[name].array;
        for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
    }
    return true;
}

function collect(root) {
    const geos = new Set();
    const mats = new Set();
    const texs = new Set();
    root.traverse((o) => {
        if (o.geometry) geos.add(o.geometry);
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) {
            mats.add(m);
            if (m.map) texs.add(m.map);
            if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value && u.value.isTexture) texs.add(u.value);
        }
    });
    return { geos, mats, texs };
}

describe('noise', () => {
    it('deterministik ve 0..1 aralığında', () => {
        for (let i = 0; i < 200; i++) {
            const x = i * 0.37 - 20;
            const y = i * 0.19 + 3;
            const a = valueNoise2(x, y, 5);
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThanOrEqual(1);
            expect(valueNoise2(x, y, 5)).toBe(a);
            const f = fbm2(x, y, 3, 3);
            expect(f).toBeGreaterThanOrEqual(0);
            expect(f).toBeLessThanOrEqual(1);
        }
        expect(valueNoise2(1.5, 2.5, 1)).not.toBe(valueNoise2(1.5, 2.5, 2));
    });
});

describe('geo: mesh builder', () => {
    it('düz normaller birim uzunlukta, renkler sonlu, üçgen sayısı tutarlı', () => {
        const b = createMeshBuilder();
        b.add(box(1, 1, 1), { c: '#ff0000' });
        b.add(cylinder(0.5, 0.2, 1, 6), { lo: '#00ff00', hi: '#0000ff', ao: 0.5, p: [2, 0, 0] });
        const g = b.build();
        expect(finiteGeometry(g)).toBe(true);
        expect(g.getAttribute('position').count / 3).toBe(b.triangles);
        const n = g.getAttribute('normal');
        for (let i = 0; i < n.count; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 4);
        g.dispose();
    });

    it('aynalı ölçek sarımı düzeltir: yüz normalleri dışa bakar', () => {
        const mk = (sx) => {
            const b = createMeshBuilder();
            b.add(plate([[0, 0], [1, 0], [0.5, 1]], 0.1), { s: [sx, 1, 1] });
            return b.build();
        };
        const normal = mk(1).getAttribute('normal');
        const mirrored = mk(-1).getAttribute('normal');
        // +z yüzünü bul: sayı olarak aynı sayıda +z ve -z normal olmalı (kapalı gövde)
        let pos = 0;
        let neg = 0;
        for (let i = 0; i < mirrored.count; i++) {
            if (mirrored.getZ(i) > 0.9) pos++;
            if (mirrored.getZ(i) < -0.9) neg++;
        }
        expect(pos).toBe(neg);
        expect(pos).toBeGreaterThan(0);
        let pos0 = 0;
        for (let i = 0; i < normal.count; i++) if (normal.getZ(i) > 0.9) pos0++;
        expect(pos0).toBe(pos);
    });

    it('jitter konuma bağlı: ortak köşeler birlikte kayar, çatlak olmaz', () => {
        const g = new THREE.IcosahedronGeometry(1, 1);
        jitterGeometry(g, 0.1, 3);
        const seen = new Map();
        const p = g.getAttribute('position');
        // aynı özgün köşe (jitter öncesi konumu) -> aynı yeni konum: köşe sayısı özgün köşe sayısından fazla olamaz
        const key = (i) => `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`;
        for (let i = 0; i < p.count; i++) seen.set(key(i), true);
        const ref = new THREE.IcosahedronGeometry(1, 1);
        const rp = ref.getAttribute('position');
        const refSeen = new Set();
        for (let i = 0; i < rp.count; i++) refSeen.add(`${rp.getX(i).toFixed(5)},${rp.getY(i).toFixed(5)},${rp.getZ(i).toFixed(5)}`);
        expect(seen.size).toBe(refSeen.size);
    });

    it('cylinder: alt kapak yok (varsayılan), none/top/both üçgen sayıları', () => {
        const tri = (g) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
        expect(tri(cylinder(1, 1, 1, 8, 'none'))).toBe(16);
        expect(tri(cylinder(1, 1, 1, 8, 'top'))).toBe(16 + 8);
        expect(tri(cylinder(1, 1, 1, 8, 'both'))).toBe(16 + 16);
    });
});

describe('layout', () => {
    it('beş durak 72° arayla, simgeler adanın yerelinde -i*adım azimutunda', () => {
        const l = createLayout(ISLAND_STOPS);
        expect(l.n).toBe(5);
        expect(l.step).toBeCloseTo(TAU / 5, 12);
        l.items.forEach((it, i) => {
            expect(it.azimuth).toBeCloseTo(-i * l.step, 12);
            expect(Math.atan2(it.x, it.z)).toBeCloseTo(Math.atan2(Math.sin(it.azimuth), Math.cos(it.azimuth)), 9);
            expect(Math.hypot(it.x, it.z)).toBeCloseTo(it.radius, 9);
        });
        expect(l.items.map((i) => i.kind)).toEqual(['signpost', 'mailbox', 'lighthouse', 'trophy', 'dock']);
        for (let i = 0; i < 5; i++) {
            const d = Math.abs(l.items[(i + 1) % 5].azimuth - l.items[i].azimuth);
            const wrapped = Math.min(d, TAU - d);
            expect(wrapped).toBeCloseTo(TAU / 5, 9);
        }
        expect(l.pond).not.toBeNull();
        expect(l.gaps).toHaveLength(5);
    });

    it('i. durak angleForStop(i) açısında öndedir (ağırlık 1), komşular daha düşük', () => {
        const l = createLayout(ISLAND_STOPS);
        for (let i = 0; i < 5; i++) {
            const a = angleForStop(i, 5);
            const w = l.items.map((it) => itemFrontWeight(it, a, l.step));
            expect(w[i]).toBeCloseTo(1, 9);
            w.forEach((x, k) => k !== i && expect(x).toBeLessThan(0.05));
        }
        // yarı yolda iki komşu ~eşit
        const mid = angleForStop(0, 5) + l.step / 2;
        const w = l.items.map((it) => itemFrontWeight(it, mid, l.step));
        expect(w[0]).toBeCloseTo(w[4] === undefined ? 0 : w[0], 9);
        expect(FOCUS_OFFSET).toBeLessThan(0);
    });

    it('sanitizeStops: geçersiz girdi varsayılana düşer, en fazla 8 durak', () => {
        expect(sanitizeStops(null)).toEqual(ISLAND_STOPS);
        expect(sanitizeStops([])).toEqual(ISLAND_STOPS);
        expect(sanitizeStops(Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, label: `L${i}` })))).toHaveLength(8);
        expect(sanitizeStops([{ key: 5 }])[0]).toEqual({ key: 'durak0', label: 'Durak 1' });
    });

    it('takip durağı yoksa gölet de yok', () => {
        expect(createLayout(ISLAND_STOPS.slice(0, 3)).pond).toBeNull();
    });
});

describe('terrain', () => {
    const layout = createLayout(ISLAND_STOPS);
    const field = createHeightField(layout);

    it('yükseklik alanı sonlu, merkez tepede en yüksek ve düz; kenar düşer', () => {
        let max = -Infinity;
        for (let x = -5; x <= 5; x += 0.25) {
            for (let z = -5; z <= 5; z += 0.25) {
                const h = field.heightAt(x, z);
                expect(Number.isFinite(h)).toBe(true);
                max = Math.max(max, h);
            }
        }
        expect(field.heightAt(0, 0)).toBeGreaterThan(0.5);
        expect(field.heightAt(0.3, 0.2)).toBeCloseTo(field.heightAt(0, 0), 1); // tepe düz
        expect(max).toBeLessThan(1.1);
        expect(field.heightAt(4.2, 0)).toBeLessThan(0.1);
    });

    it('simge tabanları düz (engebe yok)', () => {
        for (const it of layout.items.filter((i) => i.kind !== 'dock')) {
            const h0 = field.heightAt(it.x, it.z);
            for (const [dx, dz] of [[0.2, 0], [0, 0.2], [-0.2, 0.1]]) expect(Math.abs(field.heightAt(it.x + dx, it.z + dz) - h0)).toBeLessThan(0.08);
        }
    });

    it('yüzey ve alt yüzey: sonlu, bütçe içinde, dış halka çakışık (kapalı)', () => {
        const props = layoutProps(layout, field);
        const top = buildIslandTop(field, layout, props.occluders);
        const under = buildIslandUnder(field, top.rimRing, top.rimAngles);
        expect(finiteGeometry(top.geometry)).toBe(true);
        expect(finiteGeometry(under.geometry)).toBe(true);
        expect(top.triangles).toBeLessThanOrEqual(600);
        expect(under.triangles).toBeLessThanOrEqual(450);
        expect(top.rimRing).toHaveLength(TOP_SEGMENTS);
        // üst normaller yukarı bakar
        const n = top.geometry.getAttribute('normal');
        let up = 0;
        for (let i = 0; i < n.count; i++) if (n.getY(i) > 0) up++;
        expect(up / n.count).toBeGreaterThan(0.98);
        // alt yüzey normalleri çoğunlukla aşağı/dışa bakar (içe bakan yüz yok)
        const un = under.geometry.getAttribute('normal');
        const up2 = under.geometry.getAttribute('position');
        let inward = 0;
        for (let i = 0; i < un.count; i++) {
            const dot = un.getX(i) * up2.getX(i) + un.getZ(i) * up2.getZ(i);
            if (dot < -0.3) inward++;
        }
        expect(inward / un.count).toBeLessThan(0.05);
        top.geometry.dispose();
        under.geometry.dispose();
    });

    it('gölet: sonlu ve düz', () => {
        const pond = buildPond(layout.pond, field.waterLevel);
        expect(finiteGeometry(pond.geometry)).toBe(true);
        expect(pond.triangles).toBe(18);
        pond.geometry.dispose();
    });

    it('aynı tohumla aynı ada (deterministik)', () => {
        const a = createHeightField(layout);
        const b = createHeightField(layout);
        for (const [x, z] of [[0.1, 0.2], [2.2, -1], [-3, 1.5]]) expect(a.heightAt(x, z)).toBe(b.heightAt(x, z));
    });
});

describe('props: yerleşim', () => {
    const layout = createLayout(ISLAND_STOPS);
    const field = createHeightField(layout);
    const props = layoutProps(layout, field);

    it('her şey ada içinde, simgelere ve göletten uzak; sonlu', () => {
        const all = [...props.trees, ...props.houses, ...props.rocks, ...props.flowers];
        expect(props.trees.length).toBeGreaterThanOrEqual(8);
        expect(props.houses.length).toBeGreaterThanOrEqual(2);
        for (const p of all) {
            expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
            expect(Math.hypot(p.x, p.z)).toBeLessThan(3.95);
            for (const it of layout.items) {
                const min = it.kind === 'dock' ? 0.85 : 0.7;
                expect(Math.hypot(p.x - it.x, p.z - it.z)).toBeGreaterThan(min);
            }
            expect(Math.hypot(p.x - layout.pond.x, p.z - layout.pond.z)).toBeGreaterThan(layout.pond.r * 0.95);
        }
    });

    it('ağaç ve evler birbirine girmez', () => {
        const solid = [...props.trees.map((t) => ({ x: t.x, z: t.z, r: 0.3 })), ...props.houses.map((h) => ({ x: h.x, z: h.z, r: 0.4 }))];
        for (let i = 0; i < solid.length; i++) {
            for (let j = i + 1; j < solid.length; j++) {
                expect(Math.hypot(solid[i].x - solid[j].x, solid[i].z - solid[j].z)).toBeGreaterThan(0.5);
            }
        }
    });

    it('deterministik; farklı durak sayısında da çalışır (3 ve 8 durak)', () => {
        const again = layoutProps(layout, field);
        expect(again.trees).toEqual(props.trees);
        for (const n of [1, 3, 8]) {
            const stops = Array.from({ length: n }, (_, i) => ISLAND_STOPS[i % 5]).map((s, i) => ({ ...s, key: i < 5 ? s.key : `x${i}` }));
            const l = createLayout(stops);
            const f = createHeightField(l);
            const p = layoutProps(l, f);
            expect(p.trees.every((t) => Number.isFinite(t.y))).toBe(true);
        }
    });

    it('ağaç şablonları: bütçe içinde, sonlu, renkli', () => {
        for (const kind of TREE_TYPES) {
            const t = buildTreeTemplate(kind);
            expect(finiteGeometry(t.geometry)).toBe(true);
            expect(t.triangles).toBeGreaterThan(30);
            expect(t.triangles).toBeLessThan(130);
            expect(t.geometry.getAttribute('color')).toBeTruthy();
            t.geometry.dispose();
        }
    });
});

describe('landmarks', () => {
    const layout = createLayout(ISLAND_STOPS);
    const field = createHeightField(layout);

    it('beş simge: sonlu, simge başına parlaklık geometrisi, halo ve levha', () => {
        const lm = buildLandmarks(layout, field);
        expect(finiteGeometry(lm.solid)).toBe(true);
        expect(lm.glows).toHaveLength(5);
        expect(lm.halos).toHaveLength(5);
        expect(lm.plaques).toHaveLength(5);
        for (const g of lm.glows) {
            expect(g.geometry.getAttribute('position').count).toBeGreaterThan(0);
            expect(finiteGeometry(g.geometry)).toBe(true);
        }
        expect(lm.boat).not.toBeNull();
        expect(lm.beam).not.toBeNull();
        expect(finiteGeometry(lm.boat.geometry)).toBe(true);
        expect(finiteGeometry(lm.beam.geometry)).toBe(true);
        expect(lm.triangles).toBeLessThanOrEqual(2200);
    });

    it('simgeler birbirinden ayrık (72° aralıkla, yarıçap ≥ 1.3)', () => {
        const items = layout.items.filter((i) => i.kind !== 'dock');
        for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) expect(Math.hypot(items[i].x - items[j].x, items[i].z - items[j].z)).toBeGreaterThan(2.5);
        }
    });

    it('bilinmeyen anahtarlı durak genel tabela olur', () => {
        const l = createLayout([{ key: 'bilinmeyen', label: 'X' }, { key: 'sorular', label: 'Y' }]);
        const f = createHeightField(l);
        const lm = buildLandmarks(l, f);
        expect(l.items[0].kind).toBe('signpost');
        expect(lm.glows).toHaveLength(2);
        expect(lm.boat).toBeNull();
        expect(lm.beam).toBeNull();
    });
});

describe('sky ve yaratıklar', () => {
    it('bulutlar: örnekli, sonlu matrisler, uzakta ölçek 0', () => {
        const c = createClouds();
        for (const t of [0, 10, 500, 12345]) {
            c.update(t, 4);
            for (let i = 0; i < c.mesh.count; i++) {
                const m = new THREE.Matrix4();
                c.mesh.getMatrixAt(i, m);
                for (const v of m.elements) expect(Number.isFinite(v)).toBe(true);
            }
        }
        c.update(0, 0);
        const m = new THREE.Matrix4();
        c.mesh.getMatrixAt(0, m);
        expect(m.elements[0]).toBe(0);
        c.geometry.dispose();
        c.material.dispose();
    });

    it('sis: nokta öznitelikleri sonlu; görünür sayı sınırlı', () => {
        const tex = createSoftGlowTexture();
        const mist = createMist(tex, 14);
        for (const t of [0, 3.3, 99]) {
            mist.update(t, 8);
            for (const name of ['position', 'aAlpha', 'aSize']) expect(Array.from(mist.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
        }
        const a = mist.geometry.getAttribute('aAlpha').array;
        expect(a[10]).toBe(0);
        mist.geometry.dispose();
        mist.material.dispose();
        tex.dispose();
    });

    it('yaratıklar: 3 kuş + balon + uçak; kademeye göre azalır; dispose temizler', () => {
        const cr = createCreatures();
        const count = () => {
            let n = 0;
            cr.group.traverse((o) => o.isMesh && o.visible && n++);
            return n;
        };
        cr.update(5, true, 0);
        const full = count();
        cr.update(5, true, 3);
        expect(count()).toBeLessThan(full);
        for (const t of [0, 7, 1000]) {
            cr.update(t, true, 0);
            cr.group.traverse((o) => {
                for (const v of o.position.toArray()) expect(Number.isFinite(v)).toBe(true);
            });
        }
        const { geos, mats } = collect(cr.group);
        const spies = [...geos, ...mats].map((x) => vi.spyOn(x, 'dispose'));
        cr.dispose();
        spies.forEach((s) => expect(s).toHaveBeenCalled());
    });
});

describe('scene: kamera çerçevesi', () => {
    it('görünür genişlik ada genişliğini aşar; dar ekranda daha uzak', () => {
        const wide = frameMetrics(1200, 560);
        const narrow = frameMetrics(390, 420);
        expect(wide.visibleWidth).toBeGreaterThan(8.5);
        expect(narrow.dist).toBeGreaterThanOrEqual(wide.dist - 1e-9);
        expect(narrow.visibleWidth).toBeGreaterThan(7);
        for (const [w, h] of [[0, 0], [1, 1], [4000, 100], [100, 4000]]) {
            const m = frameMetrics(w, h);
            expect(Number.isFinite(m.dist) && m.dist > 0).toBe(true);
        }
    });
});

describe('createIslandWorld', () => {
    it('çizim ve üçgen bütçesi (karakter hariç ≈ 5k üçgen, ≤ 120 çizim)', () => {
        const w = createIslandWorld({ gender: 'female', coarse: true });
        const m = w.measure();
        expect(m.calls).toBeLessThanOrEqual(120);
        expect(m.calls).toBeLessThanOrEqual(60);
        expect(m.sceneTriangles).toBeGreaterThan(2500);
        expect(m.sceneTriangles).toBeLessThanOrEqual(5400);
        expect(m.avatarTriangles).toBeGreaterThan(1000);
        w.dispose();
    });

    it('hiçbir geometri özniteliğinde NaN yok; matrisler sonlu; her kare güncellemesi sonlu kalır', () => {
        const w = createIslandWorld({ gender: 'male' });
        w.update({ time: 3.2, dt: 0.016, angle: 1.3, animate: true });
        w.update({ time: 9.9, dt: 0.016, angle: -4, animate: true });
        const { geos } = collect(w.scene);
        for (const g of geos) if (g.attributes.position) expect(finiteGeometry(g)).toBe(true);
        w.scene.updateMatrixWorld(true);
        w.scene.traverse((o) => {
            for (const v of o.matrixWorld.elements) expect(Number.isFinite(v)).toBe(true);
        });
        w.dispose();
    });

    it('dispose: sahnedeki tüm geometri, malzeme ve dokular serbest bırakılır; ikinci dispose zararsız', () => {
        const w = createIslandWorld({ gender: 'female' });
        const { geos, mats, texs } = collect(w.scene);
        expect(geos.size).toBeGreaterThan(20);
        const spies = [...geos, ...mats, ...texs].map((x) => vi.spyOn(x, 'dispose'));
        w.dispose();
        const missed = spies.filter((s) => s.mock.calls.length === 0).length;
        expect(missed).toBe(0);
        expect(w.scene.children).toHaveLength(0);
        expect(() => w.dispose()).not.toThrow();
        expect(() => w.update({ time: 1, dt: 0.016, angle: 0, animate: true })).not.toThrow();
    });

    it('aktif simge öne gelince parlaklığı artar (en parlak = öndeki)', () => {
        const w = createIslandWorld({ gender: 'female' });
        for (let i = 0; i < 5; i++) {
            const wts = w.weights(angleForStop(i, 5));
            expect(wts.indexOf(Math.max(...wts))).toBe(i);
        }
        const glow = (idx) => {
            let mesh = null;
            w.scene.traverse((o) => o.name === `parilti_${idx}` && (mesh = o));
            return mesh.material.color.r;
        };
        w.update({ time: 0, dt: 0, angle: angleForStop(2, 5), animate: false });
        expect(glow(2)).toBeGreaterThan(glow(0));
        w.update({ time: 0, dt: 0, angle: angleForStop(0, 5), animate: false });
        expect(glow(0)).toBeGreaterThan(glow(2));
        w.dispose();
    });

    it('hareketi azalt (animate=false): zamana bağlı hiçbir şey kımıldamaz', () => {
        const w = createIslandWorld({ gender: 'female' });
        w.update({ time: 0, dt: 0, angle: 0.4, animate: false });
        const snap = () => {
            w.scene.updateMatrixWorld(true);
            const out = [];
            w.scene.traverse((o) => {
                if (o.isMesh || o.isGroup) out.push(...o.matrixWorld.elements);
                if (o.isInstancedMesh) out.push(...o.instanceMatrix.array.slice(0, 32));
            });
            return out;
        };
        const a = snap();
        w.update({ time: 50, dt: 0.016, angle: 0.4, animate: false });
        const b = snap();
        expect(b).toEqual(a);
        w.dispose();
    });

    it('kalite kademesi: yüksek kademede çizilenler azalır', () => {
        const w = createIslandWorld({ gender: 'female' });
        w.update({ time: 1, dt: 0.016, angle: 0, animate: true });
        const full = w.measure();
        w.applyTier({ detail: 3 });
        w.update({ time: 1, dt: 0.016, angle: 0, animate: true });
        const lite = w.measure();
        expect(lite.sceneTriangles).toBeLessThan(full.sceneTriangles);
        expect(lite.calls).toBeLessThan(full.calls);
        w.dispose();
    });

    it('3 duraklı ve göletsiz yerleşimle kurulur; geçersiz avatar yapılandırması varsayılana düşer', () => {
        const w = createIslandWorld({ stops: ISLAND_STOPS.slice(0, 3), avatarConfig: { body: 'x', hair: 5 }, gender: 'male' });
        expect(w.layout.pond).toBeNull();
        expect(w.measure().calls).toBeLessThanOrEqual(120);
        w.setAvatar({ body: 'kiz', acc: 'tac' });
        w.dispose();
    });

    it('çerçeve: dar ve geniş boyutta kamera sonlu', () => {
        const w = createIslandWorld({ gender: 'female' });
        for (const [cw, ch] of [[390, 420], [1200, 560], [320, 200]]) {
            const m = w.frame(cw, ch);
            expect(Number.isFinite(m.dist)).toBe(true);
            w.camera.updateMatrixWorld(true);
            for (const v of w.camera.matrixWorld.elements) expect(Number.isFinite(v)).toBe(true);
        }
        w.dispose();
    });

    it('measureScene: gizli nesneler sayılmaz, örnek sayısı çarpılır', () => {
        const root = new THREE.Group();
        const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 5);
        const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
        hidden.visible = false;
        root.add(inst, hidden);
        expect(measureScene(root)).toEqual({ calls: 1, triangles: 60 });
    });
});
