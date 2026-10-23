/*
 * Ada dünyası (renderer'dan bağımsız): sahne grafı, ışıklar, kamera çerçevesi,
 * animasyon güncellemesi, ölçüm ve tam temizlik. Node'da (WebGL'siz) kurulup
 * test edilebilir; engine.js bunu renderer + döngüyle sarar.
 *
 * Sahne grafı:
 *   scene
 *    |- backdrop (gökyüzü + deniz, ekran uzayı)  - bulutlar - yaratıklar
 *    '- bob (hafif sallanır)
 *        |- island (Y dönüşü = döndürme açısı): yüzey, kaya altı, kristaller,
 *        |    gölet, ağaçlar, evler, kayalar, çiçekler, simgeler, parıltılar,
 *        |    haleler, levhalar, kayık, fener huzmesi
 *        |- avatar (adanın ortasındaki tepede; dönmez, kameraya bakar)
 *        '- sis
 */
import * as THREE from 'three';
import { buildAvatar, createPoseTarget, blendPose, poseIdle, poseCheer } from '../avatar/build3d.js';
import { normalizeAvatar } from '../avatar/catalog.js';
import { FOCUS_OFFSET, createLayout, itemFrontWeight } from './layout.js';
import {
    buildCrystals,
    buildIslandTop,
    buildIslandUnder,
    buildPond,
    createHeightField,
} from './terrain.js';
import { TREE_TYPES, buildFlowers, buildHouses, buildRocks, buildTreeTemplate, layoutProps } from './props.js';
import { buildLandmarks } from './landmarks.js';
import { createBackdrop, createClouds, createMist, createSoftGlowTexture } from './sky.js';
import { createCreatures } from './creatures.js';
import { buildPlaqueGeometry, createLabelAtlas } from './labels.js';
import { clampViewOffset, visibleFraction } from './viewOffset.js';

export const FOV = 30;
const PITCH = 0.4; // rad (kamera eğimi)
const LOOK = new THREE.Vector3(0, -1.1, 0);
const HALF_H = 4.3;
const HALF_W = 4.0;
const AVATAR_SCALE = 0.8;
const CHEER_S = 1.7;

/** Ada merkezindeki görünür genişlik ve kamera mesafesi (saf; test edilir). */
export function frameMetrics(width, height, visible = 1) {
    const aspect = Math.max(0.2, width) / Math.max(0.2, height);
    const t = Math.tan((FOV * Math.PI) / 360);
    // visible: adanın sığması gereken görünür yükseklik kesri (telefonda kartın üstü; 1 = tüm sahne)
    const vis = Number.isFinite(visible) ? Math.min(1, Math.max(0.2, visible)) : 1;
    const distV = HALF_H / (t * vis);
    const distW = HALF_W / (t * aspect);
    const dist = Math.max(distV, distW);
    return { aspect, dist, visibleWidth: 2 * dist * t * aspect, visibleHeight: 2 * dist * t };
}

/** Sahnedeki görünür çizim sayısı ve üçgenler (renderer.info'nun beklenen karşılığı). */
export function measureScene(root) {
    let calls = 0;
    let triangles = 0;
    root.traverseVisible((o) => {
        if (!(o.isMesh || o.isPoints || o.isSprite || o.isLine)) return;
        calls += 1;
        const g = o.geometry;
        if (!g) return;
        const pos = g.getAttribute('position');
        const n = o.isInstancedMesh ? o.count : 1;
        if (o.isMesh) triangles += ((g.index ? g.index.count : pos ? pos.count : 0) / 3) * n;
        else if (o.isSprite) triangles += 2;
    });
    return { calls, triangles: Math.round(triangles) };
}

export function createIslandWorld({
    stops,
    avatarConfig,
    gender,
    coarse = false,
    avatarDetail,
    tier = { detail: 0 },
} = {}) {
    const layout = createLayout(stops);
    const field = createHeightField(layout);
    const props = layoutProps(layout, field);
    const disposables = [];
    const track = (o) => {
        disposables.push(o);
        return o;
    };

    const scene = new THREE.Scene();
    scene.name = 'island';
    const camera = new THREE.PerspectiveCamera(FOV, 2, 0.5, 80);

    // --- Işıklar: altın saat (sıcak anahtar, soğuk dolgu/kenar) ---
    const hemi = new THREE.HemisphereLight(0xdcebff, 0xf0b898, 1.35);
    const key = new THREE.DirectionalLight(0xffd7a0, 2.5);
    key.position.set(-6, 7, 6);
    const rim = new THREE.DirectionalLight(0xa6ccff, 1.0);
    rim.position.set(5, 3, -7);
    scene.add(hemi, key, rim);

    // --- Arka plan ---
    const backdrop = createBackdrop();
    track(backdrop.geometry);
    track(backdrop.material);
    scene.add(backdrop.mesh);
    const clouds = createClouds();
    track(clouds.geometry);
    track(clouds.material);
    scene.add(clouds.mesh);
    const creatures = createCreatures();
    scene.add(creatures.group);

    // --- Ortak malzemeler ---
    const glowTex = track(createSoftGlowTexture());
    const litMat = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const basicMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
    const addMesh = (parent, geo, mat) => {
        track(geo);
        const m = new THREE.Mesh(geo, mat);
        parent.add(m);
        return m;
    };

    const bob = new THREE.Group();
    bob.name = 'bob';
    scene.add(bob);
    const island = new THREE.Group();
    island.name = 'adaGrubu';
    bob.add(island);

    // --- Ada gövdesi ---
    const top = buildIslandTop(field, layout, props.occluders);
    addMesh(island, top.geometry, litMat).name = 'ustYuzey';
    const under = buildIslandUnder(field, top.rimRing, top.rimAngles);
    addMesh(island, under.geometry, litMat).name = 'altYuzey';
    const crystals = buildCrystals(under.anchors);
    addMesh(island, crystals.geometry, basicMat).name = 'kristaller';
    let waterMat = null;
    if (layout.pond) {
        const pond = buildPond(layout.pond, field.waterLevel);
        waterMat = track(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.88, emissive: 0x16647a, emissiveIntensity: 0.35 }));
        addMesh(island, pond.geometry, waterMat).name = 'golet';
    }

    // --- Ağaçlar (örnekli) ---
    const treeMeshes = {};
    const _m = new THREE.Matrix4();
    const _q = new THREE.Quaternion();
    const _e = new THREE.Euler();
    const _p = new THREE.Vector3();
    const _s = new THREE.Vector3();
    const _c = new THREE.Color();
    for (const kind of TREE_TYPES) {
        const list = props.trees.filter((t) => t.kind === kind);
        if (list.length === 0) continue;
        const tpl = buildTreeTemplate(kind);
        track(tpl.geometry);
        const mesh = new THREE.InstancedMesh(tpl.geometry, litMat, list.length);
        mesh.frustumCulled = false;
        mesh.name = `agac_${kind}`;
        list.forEach((t, i) => mesh.setColorAt(i, _c.setRGB(t.tint, t.tint * 1.01, t.tint * 0.97)));
        mesh.instanceColor.needsUpdate = true;
        island.add(mesh);
        treeMeshes[kind] = { mesh, list };
    }
    function placeTrees(t, sway) {
        for (const kind of Object.keys(treeMeshes)) {
            const { mesh, list } = treeMeshes[kind];
            list.forEach((tr, i) => {
                const a = sway ? Math.sin(t * 1.1 + tr.phase) * 0.028 : 0;
                const b = sway ? Math.sin(t * 0.8 + tr.phase * 1.7) * 0.02 : 0;
                _e.set(b, tr.rot, a, 'YXZ');
                _q.setFromEuler(_e);
                _m.compose(_p.set(tr.x, tr.y, tr.z), _q, _s.set(tr.scale, tr.scale, tr.scale));
                mesh.setMatrixAt(i, _m);
            });
            mesh.instanceMatrix.needsUpdate = true;
        }
    }
    placeTrees(0, false);

    // --- Evler, kayalar, çiçekler ---
    const houses = buildHouses(props.houses);
    if (props.houses.length) {
        addMesh(island, houses.solid, litMat).name = 'evler';
        addMesh(island, houses.glow, basicMat).name = 'pencereler';
    } else {
        houses.solid.dispose();
        houses.glow.dispose();
    }
    const rocks = buildRocks(props.rocks);
    addMesh(island, rocks.geometry, litMat).name = 'kayalar';
    const flowers = buildFlowers(props.flowers);
    addMesh(island, flowers.geometry, litMat).name = 'cicekler';

    // --- Simgeler ---
    const lm = buildLandmarks(layout, field);
    addMesh(island, lm.solid, litMat).name = 'simgeler';
    const glowMeshes = lm.glows.map((g) => {
        const mat = track(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
        const m = addMesh(island, g.geometry, mat);
        m.name = `parilti_${g.index}`;
        return { mesh: m, mat, index: g.index };
    });
    const halos = lm.halos.map((h) => {
        const mat = track(new THREE.SpriteMaterial({
            map: glowTex,
            color: new THREE.Color(h.color),
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        }));
        const sp = new THREE.Sprite(mat);
        sp.position.set(h.x, h.y, h.z);
        sp.scale.setScalar(h.size);
        sp.renderOrder = 10;
        island.add(sp);
        return { sprite: sp, mat, size: h.size, index: h.index };
    });
    // Sprite geometrisi three'de ortaktır; GPU tamponu bırakılsın (gerekirse yeniden yüklenir).
    if (halos.length) track(halos[0].sprite.geometry);
    // Etiket levhaları
    const atlas = track(createLabelAtlas(layout.items.map((it) => it.label)));
    const plaqueGeo = buildPlaqueGeometry(lm.plaques, layout.items.length);
    const plaqueMat = track(new THREE.MeshBasicMaterial(atlas ? { map: atlas, transparent: true, toneMapped: false } : { color: 0xf3dcae, toneMapped: false }));
    addMesh(island, plaqueGeo, plaqueMat).name = 'levhalar';

    // Kayık (sallanır)
    let boatGroup = null;
    if (lm.boat) {
        boatGroup = new THREE.Group();
        boatGroup.position.set(lm.boat.x, lm.boat.y, lm.boat.z);
        boatGroup.rotation.y = lm.boat.ry;
        addMesh(boatGroup, lm.boat.geometry, litMat).name = 'kayik';
        island.add(boatGroup);
    }
    // Fener huzmesi (toplamalı, dönen)
    let beamGroup = null;
    let beamMat = null;
    if (lm.beam) {
        beamMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        beamGroup = new THREE.Group();
        beamGroup.position.set(lm.beam.x, lm.beam.y, lm.beam.z);
        const bm = addMesh(beamGroup, lm.beam.geometry, beamMat);
        bm.renderOrder = 9;
        island.add(beamGroup);
    }

    // --- Karakter (ortadaki tepede) ---
    const cfg = normalizeAvatar(avatarConfig, gender);
    const avatar = buildAvatar(cfg, { detail: avatarDetail || (coarse ? 'low' : 'high') });
    const avatarGroup = new THREE.Group();
    avatarGroup.name = 'karakter';
    const hillTop = field.heightAt(0, 0) - 0.01;
    avatarGroup.position.set(0, hillTop, 0);
    avatar.root.scale.setScalar(AVATAR_SCALE);
    avatar.root.rotation.y = Math.PI; // -z'ye bakar; kameraya (+z) döndür
    avatarGroup.add(avatar.root);
    const shadowGeo = track(new THREE.PlaneGeometry(1, 1));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = track(new THREE.MeshBasicMaterial({ map: glowTex, color: 0x1a1030, transparent: true, opacity: 0.4, depthWrite: false }));
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.scale.set(0.95, 1, 0.95);
    shadow.position.y = 0.012;
    shadow.renderOrder = 5;
    avatarGroup.add(shadow);
    bob.add(avatarGroup);
    const rig = avatar.rig;
    const target = createPoseTarget(rig);
    poseIdle(rig, 0);
    blendPose(rig, target, 1);

    // --- Sis ---
    const mist = createMist(glowTex);
    track(mist.geometry);
    track(mist.material);
    bob.add(mist.points);

    // --- Durum ---
    let disposed = false;
    let cheerT = -1;
    let nextCheer = 5.5;
    let curTier = tier;
    let lastT = 0;
    const view = { width: 1, height: 1, offset: 0 };

    function frame(width, height) {
        view.width = width;
        view.height = height;
        const m = frameMetrics(width, height, visibleFraction(view.offset));
        camera.aspect = m.aspect;
        camera.userData.dist = m.dist;
        // Görünüm kaydırması: adayı görünür bölgenin ortasına taşır (içerik yukarı kayar).
        if (view.offset > 0) camera.setViewOffset(width, height, 0, Math.round(height * view.offset), width, height);
        else camera.clearViewOffset();
        camera.updateProjectionMatrix();
        placeCamera(0);
        backdrop.uniforms.uAspect.value = m.aspect;
        // Ada gölgesinin denizdeki ekran konumu
        camera.updateMatrixWorld(true);
        const p = new THREE.Vector3(0, -6.5, 0).project(camera);
        backdrop.uniforms.uShadow.value.set(p.x * 0.5 + 0.5, Math.min(0.17, Math.max(0.08, p.y * 0.5 + 0.5)));
        return m;
    }
    function placeCamera(t) {
        const d = camera.userData.dist || 12;
        const swayX = Math.sin(t * 0.21) * 0.18;
        const swayY = Math.sin(t * 0.17 + 1) * 0.06;
        camera.position.set(LOOK.x + swayX, LOOK.y + Math.sin(PITCH) * d + swayY, LOOK.z + Math.cos(PITCH) * d);
        camera.lookAt(LOOK);
    }

    function applyTier(next) {
        curTier = next || curTier;
        const d = curTier.detail || 0;
        backdrop.uniforms.uSparkle.value = d >= 2 ? 0 : 1;
        mist.points.visible = d < 3;
    }
    applyTier(tier);

    function weights(angle) {
        return layout.items.map((it) => itemFrontWeight(it, angle, layout.step));
    }

    /**
     * Her kare: time sn, angle ada açısı, animate = ortam animasyonu açık mı.
     * animate=false iken yalnızca açıya bağlı durum güncellenir.
     */
    function update({ time = 0, dt = 0, angle = 0, animate = true } = {}) {
        if (disposed) return;
        const t = animate ? time : 0;
        lastT = t;
        const d = curTier.detail || 0;
        island.rotation.y = angle + FOCUS_OFFSET;
        // Hafif süzülme
        bob.position.y = animate ? Math.sin(t * 0.9) * 0.07 : 0;
        bob.rotation.z = animate ? Math.sin(t * 0.6) * 0.012 : 0;
        bob.rotation.x = animate ? Math.sin(t * 0.7 + 1) * 0.01 : 0;
        placeCamera(animate ? t : 0);

        // Simge vurgusu
        const w = weights(angle);
        for (const g of glowMeshes) {
            const k = 0.5 + 0.5 * w[g.index];
            g.mat.color.setScalar(k);
        }
        for (const h of halos) {
            const wi = w[h.index];
            const flick = animate ? 1 + Math.sin(t * 3.1 + h.index * 1.7) * 0.06 : 1;
            h.mat.opacity = 0.12 + 0.45 * wi;
            h.sprite.scale.setScalar(h.size * (0.85 + 0.3 * wi) * flick);
        }
        if (beamGroup) {
            const wi = w[lm.beam.index];
            beamGroup.rotation.y = animate ? t * 0.9 : 0.7;
            beamMat.opacity = 0.1 + 0.45 * wi;
        }
        if (waterMat) waterMat.emissiveIntensity = 0.32 + (animate ? Math.sin(t * 1.4) * 0.08 : 0);
        if (boatGroup) {
            boatGroup.position.y = lm.boat.y + (animate ? Math.sin(t * 1.3) * 0.012 : 0);
            boatGroup.rotation.z = animate ? Math.sin(t * 1.1) * 0.05 : 0;
            boatGroup.rotation.x = animate ? Math.sin(t * 0.9) * 0.03 : 0;
        }

        // Ortam: bulutlar, yaratıklar, sis, rüzgâr, deniz
        backdrop.uniforms.uTime.value = t;
        clouds.update(t, d >= 3 ? 2 : d >= 1 ? 3 : 4);
        creatures.update(t, animate, d);
        mist.update(t, d >= 2 ? 8 : 14);
        if (animate && d < 2) placeTrees(t, true);

        // Karakter: bekleme / ara sıra kutlama
        let lambda = 8;
        if (animate) {
            if (cheerT < 0 && t >= nextCheer) {
                cheerT = 0;
            }
            if (cheerT >= 0) {
                cheerT += dt;
                poseCheer(target, cheerT);
                lambda = 12;
                if (cheerT > CHEER_S) {
                    cheerT = -1;
                    nextCheer = t + 7 + ((Math.floor(t * 7) % 5) * 1.2);
                }
            } else {
                poseIdle(target, t);
            }
            avatar.root.rotation.y = Math.PI - 0.34 + Math.sin(t * 0.5) * 0.12;
        } else {
            poseIdle(target, 0);
            avatar.root.rotation.y = Math.PI - 0.34;
        }
        blendPose(rig, target, animate ? 1 - Math.exp(-lambda * Math.max(0, dt)) : 1);
    }

    /** Dokunuş: kutlama (hareketi azalt açıkken anında tek poz). */
    function cheer() {
        if (disposed) return;
        cheerT = 0;
    }

    function setAvatar(next) {
        if (disposed) return;
        avatar.setConfig(normalizeAvatar(next, gender));
    }

    update({ time: 0, dt: 0, angle: 0, animate: false });
    frame(1200, 560);

    return {
        scene,
        camera,
        layout,
        field,
        avatar,
        clouds,
        mist,
        backdrop,
        island,
        bob,
        frame,
        update,
        applyTier,
        cheer,
        setAvatar,
        weights,
        setPixelScale(heightPx) {
            mist.setPixelScale(heightPx, FOV);
        },
        /**
         * Ada merkezini sahne yüksekliğinin y kesri kadar yukarı kaydırır (0 = sıfırla).
         * Değişti ise yeni çerçeve ölçülerini (frameMetrics), değişmediyse null döndürür.
         */
        setViewOffset(y) {
            const next = clampViewOffset(y);
            if (disposed || next === view.offset) return null;
            view.offset = next;
            return frame(view.width, view.height);
        },
        get viewOffset() {
            return view.offset;
        },
        get time() {
            return lastT;
        },
        measure() {
            const all = measureScene(scene);
            const av = avatar.triangles;
            return { calls: all.calls, triangles: all.triangles, avatarTriangles: av, sceneTriangles: all.triangles - av };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            avatar.dispose();
            creatures.dispose();
            for (const d of disposables) {
                try {
                    d?.dispose?.();
                } catch {
                    // temizlik hatası yoksayılır
                }
            }
            scene.traverse((o) => {
                if (o.isInstancedMesh) o.dispose?.();
            });
            scene.clear();
        },
    };
}
