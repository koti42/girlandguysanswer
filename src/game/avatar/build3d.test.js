import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
    BONES,
    BODY_DIMS,
    avatarColors,
    buildAvatar,
    blendPose,
    createPoseTarget,
    poseCheer,
    poseFall,
    poseIdle,
    poseJump,
    poseRun,
    poseSlide,
    restLayout,
} from './build3d.js';
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, STYLES, defaultAvatar } from './catalog.js';
import { createAvatarViewer } from './viewer.js';

/*
 * 3D avatar modülü (şartname E.3): three node'da WebGL olmadan geometri
 * kurabildiği için karakter burada gerçekten inşa edilir; render tarafı
 * tarayıcıda (Playwright) doğrulandı.
 */

const cfg = (over = {}) => ({ ...defaultAvatar('female'), ...over });

function bounds(av) {
    const box = new THREE.Box3();
    for (const m of av.meshes) {
        m.geometry.computeBoundingBox();
        box.union(m.geometry.boundingBox);
    }
    return box;
}

describe('buildAvatar: katalogdaki her stil kurulur', () => {
    it('tüm saç/üst/alt/ayakkabı/aksesuar stilleri iki vücutta da hatasız kurulur', () => {
        for (const body of ['kiz', 'erkek']) {
            for (const slot of ['hair', 'top', 'bottom', 'shoes']) {
                for (const { id } of STYLES[slot]) {
                    const av = buildAvatar(cfg({ body, [slot]: { style: id, color: 3 } }));
                    expect(av.triangles).toBeGreaterThan(1000);
                    av.dispose();
                }
            }
            for (const { id } of STYLES.acc) {
                const av = buildAvatar(cfg({ body, acc: id }));
                expect(av.triangles).toBeGreaterThan(1000);
                av.dispose();
            }
        }
    });

    it('şapka/bere ile tepe hacimli saçlar (topuz, mohawk, kıvırcık) da kurulur', () => {
        for (const hair of ['topuz', 'mohawk', 'kivircik']) {
            for (const acc of ['sapka', 'bere']) {
                const av = buildAvatar(cfg({ hair: { style: hair, color: 0 }, acc }));
                expect(av.meshes.length).toBeGreaterThanOrEqual(1);
                av.dispose();
            }
        }
    });

    it('renkler katalogdan çözülür (ten, saç, giysi)', () => {
        const c = avatarColors(cfg({ skin: 5, hair: { style: 'uzun', color: 9 }, top: { style: 'forma', color: 2 }, bottom: { style: 'etek', color: 11 }, shoes: { style: 'neon', color: 6 } }));
        expect(c).toEqual({ skin: SKIN_TONES[5], hair: HAIR_COLORS[9], top: CLOTH_COLORS[2], bottom: CLOTH_COLORS[11], shoes: CLOTH_COLORS[6] });
    });

    it('bozuk yapılandırma varsayılana düşer, hata vermez', () => {
        const av = buildAvatar({ body: 'uzayli', hair: { style: 'yok', color: 99 }, acc: 12 });
        expect(av.triangles).toBeGreaterThan(1000);
        av.dispose();
        expect(() => buildAvatar(null).dispose()).not.toThrow();
    });
});

describe('buildAvatar: ölçek, orijin, yön, iskelet', () => {
    it('boy ≈ 1.7 m, ayak tabanı y = 0, karakter ortada', () => {
        for (const body of ['kiz', 'erkek']) {
            const av = buildAvatar(cfg({ body, acc: 'none', hair: { style: 'kisa', color: 0 } }));
            const b = bounds(av);
            expect(b.min.y).toBeGreaterThan(-0.03);
            expect(b.min.y).toBeLessThan(0.03);
            expect(b.max.y).toBeGreaterThan(1.58);
            expect(b.max.y).toBeLessThan(1.82);
            expect(Math.abs((b.min.x + b.max.x) / 2)).toBeLessThan(0.02);
            av.dispose();
        }
    });

    it('yüz -Z yönüne bakar: göz parıltıları (ışıyan mesh) başın önünde', () => {
        const av = buildAvatar(cfg({ shoes: { style: 'spor', color: 0 } }));
        const glow = av.meshes[1];
        expect(glow).toBeTruthy();
        glow.geometry.computeBoundingBox();
        expect(glow.geometry.boundingBox.max.z).toBeLessThan(-0.1);
        av.dispose();
    });

    it('rig sözleşmedeki tüm eklemleri ve trailAnchor içerir; her biri Object3D', () => {
        const av = buildAvatar(cfg());
        const keys = ['hips', 'spine', 'chest', 'neck', 'head', 'armL', 'armR', 'foreArmL', 'foreArmR', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR', 'hair', 'trailAnchor'];
        for (const k of keys) expect(av.rig[k]).toBeInstanceOf(THREE.Object3D);
        expect(av.rig.hips.parent).toBe(av.root);
        expect(av.rig.trailAnchor.parent).toBe(av.rig.hips);
        av.dispose();
    });

    it('her köşe tek kemiğe tam bağlı (rijit kaplama) ve kemik dizini geçerli', () => {
        const av = buildAvatar(cfg({ hair: { style: 'orgu', color: 2 } }));
        for (const m of av.meshes) {
            const si = m.geometry.attributes.skinIndex;
            const sw = m.geometry.attributes.skinWeight;
            expect(si.count).toBe(m.geometry.attributes.position.count);
            for (let i = 0; i < si.count; i++) {
                expect(si.getX(i)).toBeLessThan(BONES.length);
                expect(sw.getX(i)).toBe(1);
            }
        }
        av.dispose();
    });

    it('kemik dönünce bağlı parça birlikte döner (bağlama matrisi doğru)', () => {
        const av = buildAvatar(cfg());
        const mesh = av.meshes[0];
        const pos = mesh.geometry.attributes.position;
        const si = mesh.geometry.attributes.skinIndex;
        const idx = Array.from({ length: si.count }, (_, i) => i).find((i) => si.getX(i) === BONES.indexOf('foreArmR'));
        const p = new THREE.Vector3().fromBufferAttribute(pos, idx);
        av.root.updateMatrixWorld(true);
        mesh.skeleton.update();
        // Dinlenme pozunda kaplama köşeyi yerinde bırakır.
        expect(mesh.applyBoneTransform(idx, p.clone()).distanceTo(p)).toBeLessThan(1e-5);
        av.rig.armR.rotation.x = Math.PI / 2;
        av.root.updateMatrixWorld(true);
        mesh.skeleton.update();
        expect(mesh.applyBoneTransform(idx, p.clone()).distanceTo(p)).toBeGreaterThan(0.1);
        av.dispose();
    });

    it('kız ve erkek oranları farklı (omuz, bel), kalça yüksekliği bacak boyuna eşit', () => {
        const k = restLayout('kiz', 'atkuyrugu');
        const e = restLayout('erkek', 'kisa');
        expect(BODY_DIMS.kiz.shX).toBeLessThan(BODY_DIMS.erkek.shX);
        expect(BODY_DIMS.kiz.waistR).toBeLessThan(BODY_DIMS.erkek.waistR);
        expect(k.hipY).toBeCloseTo(BODY_DIMS.kiz.thigh + BODY_DIMS.kiz.shin + BODY_DIMS.kiz.ankle, 6);
        expect(e.abs.footL[1]).toBeCloseTo(BODY_DIMS.erkek.ankle, 6);
        expect(k.abs.armL[0]).toBeLessThan(0);
        expect(k.abs.armR[0]).toBeGreaterThan(0);
    });

    it("'low' ayrıntı daha az üçgen", () => {
        const hi = buildAvatar(cfg());
        const lo = buildAvatar(cfg(), { detail: 'low' });
        expect(lo.triangles).toBeLessThan(hi.triangles * 0.7);
        hi.dispose();
        lo.dispose();
    });
});

describe('setConfig ve dispose', () => {
    it('setConfig aynı rig nesnelerini korur, geometriyi değiştirir; aynı yapılandırmada yeniden kurmaz', () => {
        const av = buildAvatar(cfg({ body: 'kiz' }));
        const rig = { ...av.rig };
        const g0 = av.meshes[0].geometry;
        av.setConfig(cfg({ body: 'kiz' }));
        expect(av.meshes[0].geometry).toBe(g0);
        av.setConfig(cfg({ body: 'erkek', hair: { style: 'mohawk', color: 7 } }));
        expect(av.meshes[0].geometry).not.toBe(g0);
        for (const k of Object.keys(rig)) if (k !== 'rest') expect(av.rig[k]).toBe(rig[k]);
        expect(av.rig.rest.hipsY).toBeCloseTo(restLayout('erkek').hipY, 6);
        av.dispose();
    });

    it('setConfig animasyon sürerken çağrılsa da dönüşleri bozmaz', () => {
        const av = buildAvatar(cfg());
        av.rig.legL.rotation.x = 0.8;
        av.setConfig(cfg({ top: { style: 'kazak', color: 1 } }));
        expect(av.rig.legL.rotation.x).toBe(0.8);
        av.dispose();
    });

    it('dispose geometrileri, malzemeleri ve dokuyu bırakır; kökü ebeveynden çıkarır', () => {
        const parent = new THREE.Group();
        const av = buildAvatar(cfg({ shoes: { style: 'neon', color: 6 } }));
        parent.add(av.root);
        const disposed = vi.fn();
        for (const m of av.meshes) {
            m.geometry.addEventListener('dispose', disposed);
            m.material.addEventListener('dispose', disposed);
        }
        av.dispose();
        expect(disposed).toHaveBeenCalledTimes(4);
        expect(av.root.parent).toBeNull();
        expect(() => av.dispose()).not.toThrow();
        expect(() => av.setConfig(cfg())).not.toThrow();
    });
});

describe('poz yardımcıları (saf)', () => {
    const finite = (rig) => {
        for (const k of ['hips', 'spine', 'chest', 'neck', 'head', 'armL', 'armR', 'foreArmL', 'foreArmR', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR', 'hair']) {
            for (const ax of ['x', 'y', 'z']) {
                expect(Number.isFinite(rig[k].rotation[ax])).toBe(true);
                expect(Number.isFinite(rig[k].position[ax])).toBe(true);
            }
        }
    };

    it('her poz tüm kanalları sonlu değerle yazar; hedef nesnede de çalışır', () => {
        const av = buildAvatar(cfg());
        const t = createPoseTarget(av.rig);
        for (const r of [av.rig, t]) {
            poseIdle(r, 1.3);
            finite(r);
            poseRun(r, 2.1, 0.7);
            finite(r);
            poseJump(r, 0.5);
            finite(r);
            poseJump(r, -3);
            finite(r);
            poseSlide(r, 0.4);
            finite(r);
            poseFall(r);
            finite(r);
            poseCheer(r, 0.8);
            finite(r);
        }
        av.dispose();
    });

    it('pozlar önceki pozdan değer sızdırmaz (nötrden başlar)', () => {
        const av = buildAvatar(cfg());
        const t = createPoseTarget(av.rig);
        poseCheer(t, 0.3);
        poseIdle(t, 0);
        const a = JSON.stringify(t);
        poseRun(t, 1, 1);
        poseIdle(t, 0);
        expect(JSON.stringify(t)).toBe(a);
        av.dispose();
    });

    it('koşu döngüsü bacakları karşılıklı sallar; kalça dinlenme yüksekliği etrafında', () => {
        const av = buildAvatar(cfg());
        const t = createPoseTarget(av.rig);
        poseRun(t, Math.PI / 2, 0.5);
        expect(t.legL.rotation.x).toBeGreaterThan(0.5);
        expect(t.legR.rotation.x).toBeLessThan(-0.5);
        expect(Math.abs(t.hips.position.y - av.rig.rest.hipsY)).toBeLessThan(0.08);
        av.dispose();
    });

    it('kayma kalçayı alçaltır, zıplamada yükselişte ön bacak öne', () => {
        const av = buildAvatar(cfg());
        const t = createPoseTarget(av.rig);
        poseSlide(t, 0.5);
        expect(t.hips.position.y).toBeLessThan(av.rig.rest.hipsY * 0.6);
        poseJump(t, 1);
        expect(t.legL.rotation.x).toBeGreaterThan(1);
        av.dispose();
    });

    it('blendPose hedefe k oranında yaklaşır, k = 1 hedefi kopyalar', () => {
        const av = buildAvatar(cfg());
        const t = createPoseTarget(av.rig);
        poseIdle(av.rig, 0);
        poseFall(t);
        const from = av.rig.armL.rotation.x;
        blendPose(av.rig, t, 0.5);
        expect(av.rig.armL.rotation.x).toBeCloseTo((from + t.armL.rotation.x) / 2, 6);
        blendPose(av.rig, t, 1);
        expect(av.rig.armL.rotation.x).toBeCloseTo(t.armL.rotation.x, 6);
        av.dispose();
    });
});

describe('createAvatarViewer', () => {
    it('WebGL yoksa onReady(false) çağrılır ve boş API döner', async () => {
        const onReady = vi.fn();
        const api = createAvatarViewer({ container: { appendChild() {} }, config: cfg(), onReady });
        await Promise.resolve();
        await Promise.resolve();
        expect(onReady).toHaveBeenCalledWith(false);
        expect(() => {
            api.setConfig(cfg({ acc: 'tac' }));
            api.resize();
            api.destroy();
        }).not.toThrow();
    });

    it('container yoksa TypeError', () => {
        expect(() => createAvatarViewer({ config: cfg() })).toThrow(TypeError);
    });
});
