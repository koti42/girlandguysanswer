/*
 * Kule: taban (lobi), yerleşmiş katlar, hareketli kat ve düşen parçalar.
 *
 * Katlar 64'lük örnekli parçalarda (InstancedMesh) tutulur: her parça tek
 * çizim. Kule yükseldikçe eski parçalar hiç güncellenmez ve kameranın çok
 * altında kalınca gizlenir (oyun sırasında yalnız son ~40-100 kat çizilir);
 * oyun sonu geri çekilmede hepsi görünür. Render döngüsünde allocation yok:
 * matris/kuaterniyon/vektörler önceden oluşturulur, olay başına yalnızca
 * özellik dizilerine yazılır.
 *
 * Düşen parçalar görsel fizik (deterministik olmak zorunda değil): kesik
 * kenarın üstünden devrilir, yerçekimiyle düşer, kulenin çok altına inince
 * havuza döner.
 */
import * as THREE from 'three';
import { BASE_H, FLOOR_H, MM, debrisKick, floorCenterY } from './cameraMath.js';
import { applyEnv, createBoxInstances, createBuildingMaterial } from './buildingMaterial.js';
import { floorColor } from './palette.js';

const CHUNK = 64;
const DEBRIS = 10;
const GRAVITY = 18;
const DEBRIS_LIFE = 4.5;
const FLASH_S = 0.5;
// Oyun sırasında hedefin bu kadar altında kalan parçalar çizilmez.
const HIDE_BELOW_M = 70;

export function createTower(scene, { boxGeometry, hue0, questionCount = 0 }) {
    const material = createBuildingMaterial({ floorH: FLOOR_H, cell: 0.42 });
    const rgb = [0, 0, 0];
    const chunks = [];
    const isQuestionFloor = (k) => k > 0 && k % 12 === 0 && k / 12 <= questionCount;

    // --- Taban: koyu cam lobi, zeminden y = 0'a ---
    const podium = createBoxInstances(boxGeometry, material, 1);
    podium.setBox(0, 0, -BASE_H / 2, 0, 3, BASE_H, 3);
    podium.setColor(0, floorColor(0, hue0, rgb));
    podium.setFlag(0, 0, 0, 3);
    podium.mesh.count = 1;
    scene.add(podium.mesh);

    // --- Hareketli kat ---
    const moving = createBoxInstances(boxGeometry, material, 1);
    moving.mesh.frustumCulled = false;
    scene.add(moving.mesh);

    // --- Düşen parçalar ---
    const debris = createBoxInstances(boxGeometry, material, DEBRIS);
    debris.mesh.count = DEBRIS;
    debris.mesh.frustumCulled = false;
    scene.add(debris.mesh);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const dState = [];
    for (let i = 0; i < DEBRIS; i++) {
        debris.setMatrix(i, zero);
        dState.push({
            active: false,
            life: 0,
            p: new THREE.Vector3(),
            v: new THREE.Vector3(),
            e: new THREE.Euler(),
            w: new THREE.Vector3(),
            s: new THREE.Vector3(1, 1, 1),
        });
    }
    let nextDebris = 0;
    let debrisLive = 0;
    const tmpM = new THREE.Matrix4();
    const tmpQ = new THREE.Quaternion();
    const kick = { vx: 0, vy: 0, vz: 0, wx: 0, wz: 0 };

    // --- Parlama (mükemmel yerleşim) ---
    const flashes = [
        { k: -1, t: 0 },
        { k: -1, t: 0 },
    ];
    let flashNext = 0;

    function chunkFor(k) {
        const ci = Math.floor((k - 1) / CHUNK);
        while (chunks.length <= ci) {
            const c = createBoxInstances(boxGeometry, material, CHUNK);
            c.top = -Infinity;
            scene.add(c.mesh);
            chunks.push(c);
        }
        return chunks[ci];
    }

    /** Kat k (k ≥ 1) yerleşti: sim aralıkları (mm). */
    function placeFloor(k, x0, x1, z0, z1) {
        if (k < 1) return;
        const c = chunkFor(k);
        const i = (k - 1) % CHUNK;
        const sx = (x1 - x0) * MM;
        const sz = (z1 - z0) * MM;
        c.setBox(i, ((x0 + x1) / 2) * MM, floorCenterY(k), ((z0 + z1) / 2) * MM, sx, FLOOR_H, sz);
        c.setColor(i, floorColor(k, hue0, rgb));
        c.setFlag(i, isQuestionFloor(k) ? 1 : 0, 0, k % 7);
        if (i + 1 > c.mesh.count) c.mesh.count = i + 1;
        c.top = Math.max(c.top, k * FLOOR_H);
        c.mesh.computeBoundingSphere();
    }

    /** Hareketli katı göster/gizle; aralıklar mm, ölçek 0..1 doğuş animasyonu. */
    function setMoving(visible, k, x0, x1, z0, z1, pop = 1) {
        if (!visible) {
            moving.mesh.count = 0;
            return;
        }
        const sx = (x1 - x0) * MM;
        const sz = (z1 - z0) * MM;
        const cx = ((x0 + x1) / 2) * MM;
        const cz = ((z0 + z1) / 2) * MM;
        const cy = floorCenterY(k);
        // Doğuşta hafif büyüyerek belirir (pencere deseni ölçekten etkilenmesin diye çapa gerçek boyda).
        const s = pop < 1 ? 0.6 + 0.4 * pop : 1;
        moving.setBox(0, cx, cy, cz, sx * s, FLOOR_H * s, sz * s);
        moving.setAnchor(0, cx, cy, cz, sx, FLOOR_H, sz);
        if (moving.mesh.count !== 1 || moving.k !== k) {
            moving.k = k;
            moving.setColor(0, floorColor(k, hue0, rgb));
            moving.setFlag(0, isQuestionFloor(k) ? 1 : 0, 0, k % 7);
            moving.mesh.count = 1;
        }
    }

    /**
     * Kesilen (ya da ıskada bütün) parça düşer. Aralıklar mm; axis/side:
     * hangi eksende ve hangi yana kesildi (devrilme yönü).
     */
    function dropPiece(k, x0, x1, z0, z1, axis, side) {
        const sx = (x1 - x0) * MM;
        const sz = (z1 - z0) * MM;
        if (sx <= 0.001 || sz <= 0.001) return;
        const i = nextDebris;
        nextDebris = (nextDebris + 1) % DEBRIS;
        const d = dState[i];
        if (!d.active) debrisLive++;
        d.active = true;
        d.life = 0;
        const cx = ((x0 + x1) / 2) * MM;
        const cz = ((z0 + z1) / 2) * MM;
        const cy = floorCenterY(k);
        d.p.set(cx, cy, cz);
        debrisKick(axis, side, kick);
        // Küçük parça daha hızlı döner.
        const spin = 1 + Math.max(0, 1.2 - Math.min(sx, sz)) * 0.8;
        d.v.set(kick.vx, kick.vy, kick.vz);
        d.w.set(kick.wx * spin, 0, kick.wz * spin);
        d.e.set(0, 0, 0);
        d.s.set(sx, FLOOR_H, sz);
        debris.setAnchor(i, cx, cy, cz, sx, FLOOR_H, sz);
        debris.setColor(i, floorColor(k, hue0, rgb));
        debris.setFlag(i, isQuestionFloor(k) ? 1 : 0, 0, k % 7);
    }

    function flash(k) {
        const f = flashes[flashNext];
        flashNext = (flashNext + 1) % flashes.length;
        if (f.k > 0 && f.k !== k) writeFlash(f.k, 0);
        f.k = k;
        f.t = FLASH_S;
        writeFlash(k, 1);
    }

    function writeFlash(k, amount) {
        const c = chunks[Math.floor((k - 1) / CHUNK)];
        if (c) c.setFlagY((k - 1) % CHUNK, amount);
    }

    return {
        material,
        /** İlk parçayı önceden kur (shader ön derlemesi, ilk yerleşimde takılma yok). */
        prewarm() {
            chunkFor(1);
        },
        placeFloor,
        setMoving,
        dropPiece,
        flash,
        isQuestionFloor,
        /** Fizik, parlama sönümü, parça görünürlüğü. minY: bunun altındaki parçalar gizlenir (null: hepsi görünür). */
        update(dt, minY) {
            for (let f = 0; f < flashes.length; f++) {
                const fl = flashes[f];
                if (fl.k < 1 || fl.t <= 0) continue;
                fl.t = Math.max(0, fl.t - dt);
                writeFlash(fl.k, (fl.t / FLASH_S) ** 2);
                if (fl.t === 0) fl.k = -1;
            }
            if (debrisLive > 0) {
                for (let i = 0; i < DEBRIS; i++) {
                    const d = dState[i];
                    if (!d.active) continue;
                    d.life += dt;
                    d.v.y -= GRAVITY * dt;
                    d.p.addScaledVector(d.v, dt);
                    d.e.x += d.w.x * dt;
                    d.e.z += d.w.z * dt;
                    if (d.life > DEBRIS_LIFE || d.p.y < -BASE_H - 2) {
                        d.active = false;
                        debrisLive--;
                        debris.setMatrix(i, zero);
                        continue;
                    }
                    tmpQ.setFromEuler(d.e);
                    tmpM.compose(d.p, tmpQ, d.s);
                    debris.setMatrix(i, tmpM);
                }
            }
            for (let i = 0; i < chunks.length; i++) {
                const c = chunks[i];
                c.mesh.visible = minY == null || c.top >= minY - HIDE_BELOW_M;
            }
        },
        setEnv(sky, fogNear, fogFar) {
            applyEnv(material, sky, fogNear, fogFar);
        },
        /** Çizilen kat parçası sayısı (teşhis). */
        get chunkCount() {
            return chunks.length;
        },
        dispose() {
            podium.dispose();
            moving.dispose();
            debris.dispose();
            for (const c of chunks) c.dispose();
            chunks.length = 0;
            material.dispose();
        },
    };
}
