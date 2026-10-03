/*
 * Görsel efektler: mükemmel yerleşimde yayılan halka dalgası, kat
 * kenarından yükselen parıltılar, doğru cevapta altın serpinti ve kamera
 * sarsıntısı (travma).
 *
 * Havuzlu: halkalar 3 düzlem, parıltılar tek bir Points (sabit kapasite).
 * Render döngüsünde allocation yok. Azaltılmış harekette sarsıntı yok,
 * parıltı sayısı yarıya iner; düşük kalitede de yarıya iner.
 */
import * as THREE from 'three';
import { RING_FRAG, RING_VERT } from './shaders.js';

const RINGS = 3;
const RING_S = 0.75;
const RING_EXPAND = 2.2;
const SPARKS = 160;
const SPARK_GRAVITY = 3.2;

function createGlowTexture() {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// Parıltı renk takımları (sRGB 0..1).
const SETS = {
    perfect: [
        [1, 0.95, 0.75],
        [1, 0.8, 0.4],
        [1, 0.55, 0.55],
    ],
    grow: [
        [0.6, 1, 0.9],
        [1, 1, 1],
        [0.55, 0.85, 1],
    ],
    gold: [
        [1, 0.84, 0.35],
        [1, 0.6, 0.3],
        [1, 1, 0.8],
    ],
    dust: [
        [0.85, 0.8, 0.9],
        [0.7, 0.65, 0.8],
        [1, 0.9, 0.85],
    ],
};

export function createEffects(scene, { reducedMotion = false } = {}) {
    const disposables = [];

    // --- Halka dalgaları ---
    const ringGeo = new THREE.PlaneGeometry(1, 1);
    ringGeo.rotateX(-Math.PI / 2);
    disposables.push(ringGeo);
    const rings = [];
    for (let i = 0; i < RINGS; i++) {
        const mat = new THREE.ShaderMaterial({
            vertexShader: RING_VERT,
            fragmentShader: RING_FRAG,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
                uHalf: { value: new THREE.Vector2(1.5, 1.5) },
                uPlane: { value: new THREE.Vector2(8, 8) },
                uProgress: { value: 1 },
                uExpand: { value: RING_EXPAND },
                uColor: { value: new THREE.Vector3(1, 0.9, 0.6) },
            },
        });
        const mesh = new THREE.Mesh(ringGeo, mat);
        mesh.visible = false;
        mesh.renderOrder = 5;
        mesh.frustumCulled = false;
        scene.add(mesh);
        disposables.push(mat);
        rings.push({ mesh, mat, t: RING_S });
    }
    let ringNext = 0;

    // --- Parıltılar ---
    const glow = createGlowTexture();
    disposables.push(glow);
    const pos = new Float32Array(SPARKS * 3);
    const col = new Float32Array(SPARKS * 3);
    const vel = new Float32Array(SPARKS * 3);
    const base = new Float32Array(SPARKS * 3);
    const life = new Float32Array(SPARKS);
    const maxLife = new Float32Array(SPARKS);
    for (let i = 0; i < SPARKS; i++) pos[i * 3 + 1] = -9999;
    const sparkGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    const colAttr = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
    sparkGeo.setAttribute('position', posAttr);
    sparkGeo.setAttribute('color', colAttr);
    const sparkMat = new THREE.PointsMaterial({
        size: 0.32,
        sizeAttenuation: true,
        map: glow,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    sparks.frustumCulled = false;
    sparks.renderOrder = 6;
    scene.add(sparks);
    disposables.push(sparkGeo, sparkMat);
    let sparkNext = 0;
    let sparkLive = 0;
    let lite = false;

    // --- Sarsıntı ---
    let trauma = 0;
    const shake = { x: 0, y: 0, z: 0 };

    function emitOne(x, y, z, vx, vy, vz, c, l) {
        const i = sparkNext;
        sparkNext = (sparkNext + 1) % SPARKS;
        if (life[i] <= 0) sparkLive++;
        const o = i * 3;
        pos[o] = x;
        pos[o + 1] = y;
        pos[o + 2] = z;
        vel[o] = vx;
        vel[o + 1] = vy;
        vel[o + 2] = vz;
        base[o] = c[0];
        base[o + 1] = c[1];
        base[o + 2] = c[2];
        life[i] = l;
        maxLife[i] = l;
    }

    return {
        /** Halka: kat üstü (y) etrafında, yarı boylar (hx, hz) metre. */
        ring(cx, y, cz, hx, hz, gold = false) {
            const r = rings[ringNext];
            ringNext = (ringNext + 1) % RINGS;
            const span = Math.max(hx, hz) * 2 + RING_EXPAND * 2 + 1;
            r.mesh.scale.set(span, 1, span);
            r.mesh.position.set(cx, y + 0.02, cz);
            r.mat.uniforms.uHalf.value.set(hx, hz);
            r.mat.uniforms.uPlane.value.set(span, span);
            r.mat.uniforms.uProgress.value = 0;
            if (gold) r.mat.uniforms.uColor.value.set(1, 0.78, 0.35);
            else r.mat.uniforms.uColor.value.set(1, 0.93, 0.7);
            r.mesh.visible = true;
            r.t = 0;
        },
        /** Kat çevresinden (dikdörtgen kenarı) yükselen parıltılar. */
        sparkle(cx, y, cz, hx, hz, count, set = 'perfect') {
            const colors = SETS[set] || SETS.perfect;
            const n = Math.max(1, Math.round(count * (lite || reducedMotion ? 0.5 : 1)));
            for (let k = 0; k < n; k++) {
                // Kenarda rastgele nokta
                const side = Math.floor(Math.random() * 4);
                const t = Math.random() * 2 - 1;
                let x = cx;
                let z = cz;
                let nx = 0;
                let nz = 0;
                if (side === 0) {
                    x = cx + hx;
                    z = cz + t * hz;
                    nx = 1;
                } else if (side === 1) {
                    x = cx - hx;
                    z = cz + t * hz;
                    nx = -1;
                } else if (side === 2) {
                    z = cz + hz;
                    x = cx + t * hx;
                    nz = 1;
                } else {
                    z = cz - hz;
                    x = cx + t * hx;
                    nz = -1;
                }
                const out = 0.6 + Math.random() * 1.4;
                emitOne(x, y, z, nx * out, 1.2 + Math.random() * 2.6, nz * out, colors[k % colors.length], 0.7 + Math.random() * 0.7);
            }
        },
        /** Bir noktadan her yöne serpinti (doğru cevap, rekor). */
        burst(cx, y, cz, count, set = 'gold') {
            const colors = SETS[set] || SETS.gold;
            const n = Math.max(1, Math.round(count * (lite || reducedMotion ? 0.5 : 1)));
            for (let k = 0; k < n; k++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 1.5 + Math.random() * 3;
                emitOne(cx, y, cz, Math.cos(a) * sp, 2 + Math.random() * 3.5, Math.sin(a) * sp, colors[k % colors.length], 0.9 + Math.random() * 0.8);
            }
        },
        addTrauma(v) {
            if (reducedMotion) return;
            trauma = Math.min(1, trauma + v);
        },
        /** Kamera ofseti (metre); her kare update'ten sonra okunur. */
        shake,
        update(dt, time) {
            for (let i = 0; i < RINGS; i++) {
                const r = rings[i];
                if (!r.mesh.visible) continue;
                r.t += dt;
                const p = Math.min(1, r.t / RING_S);
                // easeOutQuad: hızlı açılır, yavaşça söner.
                r.mat.uniforms.uProgress.value = 1 - (1 - p) * (1 - p);
                if (p >= 1) r.mesh.visible = false;
            }
            if (sparkLive > 0) {
                for (let i = 0; i < SPARKS; i++) {
                    if (life[i] <= 0) continue;
                    life[i] -= dt;
                    const o = i * 3;
                    if (life[i] <= 0) {
                        sparkLive--;
                        pos[o + 1] = -9999;
                        col[o] = col[o + 1] = col[o + 2] = 0;
                        continue;
                    }
                    vel[o + 1] -= SPARK_GRAVITY * dt;
                    // Hafif hava direnci
                    const drag = 1 - 1.2 * dt;
                    vel[o] *= drag;
                    vel[o + 2] *= drag;
                    pos[o] += vel[o] * dt;
                    pos[o + 1] += vel[o + 1] * dt;
                    pos[o + 2] += vel[o + 2] * dt;
                    const f = life[i] / maxLife[i];
                    const tw = 0.75 + 0.25 * Math.sin(time * 24 + i);
                    const a = f * f * tw;
                    col[o] = base[o] * a;
                    col[o + 1] = base[o + 1] * a;
                    col[o + 2] = base[o + 2] * a;
                }
                posAttr.needsUpdate = true;
                colAttr.needsUpdate = true;
            }
            if (trauma > 0) {
                trauma = Math.max(0, trauma - dt * 1.4);
                const amp = trauma * trauma * 0.35;
                shake.x = Math.sin(time * 41.3) * amp;
                shake.y = Math.sin(time * 37.7 + 1.3) * amp * 0.7;
                shake.z = Math.sin(time * 29.1 + 2.1) * amp;
            } else {
                shake.x = shake.y = shake.z = 0;
            }
        },
        setLite(on) {
            lite = on;
        },
        dispose() {
            for (const d of disposables) d.dispose();
        },
    };
}
