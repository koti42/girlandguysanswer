/*
 * Görsel efektler ("juice"): partikül havuzu, hız çizgileri, kalkan
 * baloncuğu, mıknatıs halkaları, ekran kenarı flaşı ve kamera sarsıntısı.
 *
 * Partiküller tek Points nesnesi (tek draw call). Konumları dünya
 * metresinde (Float64) tutulur ve her kare oyuncuya göre göreli yazılır;
 * böylece toz geride kalır, parıltı oyuncuyla akar. Havuz dolarsa en eski
 * partikülün yerine yazılır; render döngüsünde allocation yok.
 *
 * Düşük kalite kademesinde (setLite) hız çizgileri kapanır, partikül
 * patlamaları yarıya iner ve nokta boyutu sınırı küçülür (ekrana yakın
 * büyük toplamalı spriteler yazılım render'da pahalı).
 */
import * as THREE from 'three';
import { clamp } from './mathUtils.js';

const MAX_PARTICLES = 420;
const SPEED_LINES = 36;
const MAX_POINT_PX = 96;
const LITE_MAX_POINT_PX = 40;
const LITE_PARTICLE_SCALE = 0.5;

const PRESETS = {
    sparkle: { colors: [0xfff1a8, 0xffd34d, 0xffffff], life: [0.35, 0.6], speed: [1.5, 3.5], size: [0.28, 0.5], gravity: -2, drag: 3, follow: 1 },
    dust: { colors: [0x9a86c8, 0x7d6aa8, 0xb9a7e0], life: [0.4, 0.7], speed: [0.6, 1.8], size: [0.45, 0.8], gravity: 0.4, drag: 2.5, follow: 0, alpha: 0.3 },
    confetti: { colors: [0x34f5a0, 0xffd34d, 0xff4fa3, 0x38bdf8, 0xffffff], life: [0.7, 1.2], speed: [3, 6.5], size: [0.22, 0.36], gravity: -7, drag: 1.2, follow: 0.85 },
    shards: { colors: [0x8fe9ff, 0x5ad8ff, 0xffffff], life: [0.45, 0.8], speed: [3, 6], size: [0.25, 0.42], gravity: -6, drag: 1.5, follow: 0.6 },
    wrong: { colors: [0xff3b5c, 0xff8a9a, 0x7a2a40], life: [0.45, 0.8], speed: [1.5, 3.5], size: [0.3, 0.5], gravity: -3, drag: 2, follow: 0.85 },
    magnet: { colors: [0xff5a6a, 0xffffff, 0xffb3b3], life: [0.4, 0.7], speed: [2, 4.5], size: [0.28, 0.45], gravity: 0, drag: 2.5, follow: 0.95 },
    shield: { colors: [0x5ad8ff, 0xffffff, 0x8fb8ff], life: [0.4, 0.7], speed: [2, 4.5], size: [0.28, 0.45], gravity: 0, drag: 2.5, follow: 0.95 },
    crash: { colors: [0xffffff, 0xffd34d, 0xff6b6b], life: [0.5, 0.9], speed: [3, 7], size: [0.3, 0.55], gravity: -8, drag: 1.4, follow: 0 },
    stars: { colors: [0xffe066, 0xffffff], life: [0.8, 1.2], speed: [0.6, 1.2], size: [0.3, 0.45], gravity: 0, drag: 0.5, follow: 0 },
};

const _color = new THREE.Color();

export function createEffects(scene, camera, { glowTexture, reducedMotion }) {
    const disposables = [];

    // --- Partiküller ---
    const P = MAX_PARTICLES;
    const px = new Float64Array(P);
    const py = new Float64Array(P);
    const pz = new Float64Array(P); // dünya z (m)
    const vx = new Float32Array(P);
    const vy = new Float32Array(P);
    const vz = new Float32Array(P);
    const life = new Float32Array(P);
    const maxLife = new Float32Array(P);
    const size0 = new Float32Array(P);
    const grav = new Float32Array(P);
    const drag = new Float32Array(P);
    const cr = new Float32Array(P);
    const cg = new Float32Array(P);
    const cb = new Float32Array(P);
    const amul = new Float32Array(P); // preset saydamlık çarpanı (toz soluk, parıltı tam)
    let alive = 0;
    let cursor = 0;

    const gPos = new Float32Array(P * 3);
    const gCol = new Float32Array(P * 4);
    const gSize = new Float32Array(P);
    const pgeo = new THREE.BufferGeometry();
    const aPos = new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage);
    const aCol = new THREE.BufferAttribute(gCol, 4).setUsage(THREE.DynamicDrawUsage);
    const aSize = new THREE.BufferAttribute(gSize, 1).setUsage(THREE.DynamicDrawUsage);
    pgeo.setAttribute('position', aPos);
    pgeo.setAttribute('pcolor', aCol);
    pgeo.setAttribute('psize', aSize);
    pgeo.setDrawRange(0, 0);
    const pmat = new THREE.ShaderMaterial({
        uniforms: { map: { value: glowTexture }, uScale: { value: 400 }, uMaxSize: { value: MAX_POINT_PX } },
        vertexShader: `
            attribute vec4 pcolor;
            attribute float psize;
            uniform float uScale;
            uniform float uMaxSize;
            varying vec4 vColor;
            void main() {
                vColor = pcolor;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = clamp(psize * uScale / max(0.1, -mv.z), 0.0, uMaxSize);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: `
            uniform sampler2D map;
            varying vec4 vColor;
            void main() {
                float a = texture2D(map, gl_PointCoord).a * vColor.a;
                gl_FragColor = vec4(vColor.rgb, a);
                #include <colorspace_fragment>
            }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(pgeo, pmat);
    points.frustumCulled = false;
    points.renderOrder = 5;
    scene.add(points);
    disposables.push(pgeo, pmat);

    function spawn(kind, x, y, zW, count, baseVz = 0, spreadY = 1) {
        const pr = PRESETS[kind];
        if (!pr) return;
        for (let n = 0; n < count; n++) {
            let i;
            if (alive < P) {
                i = alive++;
            } else {
                // Havuz dolu: döngüsel olarak en eskilerin üzerine yaz.
                i = cursor;
                cursor = (cursor + 1) % P;
            }
            const a = Math.random() * Math.PI * 2;
            const e = (Math.random() * 0.9 + 0.1) * spreadY;
            const sp = pr.speed[0] + Math.random() * (pr.speed[1] - pr.speed[0]);
            px[i] = x;
            py[i] = y;
            pz[i] = zW;
            vx[i] = Math.cos(a) * sp * (1 - e * 0.5);
            vy[i] = e * sp;
            vz[i] = Math.sin(a) * sp * (1 - e * 0.5) + baseVz * pr.follow;
            maxLife[i] = pr.life[0] + Math.random() * (pr.life[1] - pr.life[0]);
            life[i] = maxLife[i];
            size0[i] = pr.size[0] + Math.random() * (pr.size[1] - pr.size[0]);
            grav[i] = pr.gravity;
            drag[i] = pr.drag;
            _color.setHex(pr.colors[Math.floor(Math.random() * pr.colors.length)]);
            cr[i] = _color.r;
            cg[i] = _color.g;
            cb[i] = _color.b;
            amul[i] = pr.alpha ?? 1;
        }
    }

    function updateParticles(dt, pzM) {
        let i = 0;
        while (i < alive) {
            life[i] -= dt;
            if (life[i] <= 0) {
                // Sondakini buraya taşı (swap-remove)
                const j = alive - 1;
                px[i] = px[j]; py[i] = py[j]; pz[i] = pz[j];
                vx[i] = vx[j]; vy[i] = vy[j]; vz[i] = vz[j];
                life[i] = life[j]; maxLife[i] = maxLife[j]; size0[i] = size0[j];
                grav[i] = grav[j]; drag[i] = drag[j];
                cr[i] = cr[j]; cg[i] = cg[j]; cb[i] = cb[j]; amul[i] = amul[j];
                alive--;
                if (cursor >= alive) cursor = 0;
                continue;
            }
            const d = Math.exp(-drag[i] * dt);
            vx[i] *= d;
            vz[i] *= d;
            vy[i] = vy[i] * d + grav[i] * dt;
            px[i] += vx[i] * dt;
            py[i] += vy[i] * dt;
            pz[i] += vz[i] * dt;
            if (py[i] < 0.03) {
                py[i] = 0.03;
                vy[i] = 0;
            }
            const t = life[i] / maxLife[i];
            gPos[i * 3] = px[i];
            gPos[i * 3 + 1] = py[i];
            gPos[i * 3 + 2] = -(pz[i] - pzM);
            gCol[i * 4] = cr[i];
            gCol[i * 4 + 1] = cg[i];
            gCol[i * 4 + 2] = cb[i];
            gCol[i * 4 + 3] = (t < 0.5 ? t * 2 : 1) * amul[i];
            gSize[i] = size0[i] * (0.4 + 0.6 * t);
            i++;
        }
        pgeo.setDrawRange(0, alive);
        if (alive > 0) {
            aPos.needsUpdate = true;
            aCol.needsUpdate = true;
            aSize.needsUpdate = true;
        }
        points.visible = alive > 0;
    }

    // --- Hız çizgileri (kameraya bağlı) ---
    const linePos = new Float32Array(SPEED_LINES * 6);
    const lineSeed = new Float32Array(SPEED_LINES * 3); // açı, yarıçap, z
    for (let i = 0; i < SPEED_LINES; i++) {
        lineSeed[i * 3] = Math.random() * Math.PI * 2;
        lineSeed[i * 3 + 1] = 1.6 + Math.random() * 2.6;
        lineSeed[i * 3 + 2] = -2 - Math.random() * 26;
    }
    const lgeo = new THREE.BufferGeometry();
    const aLine = new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage);
    lgeo.setAttribute('position', aLine);
    const lmat = new THREE.LineBasicMaterial({ color: 0xfff0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const lines = new THREE.LineSegments(lgeo, lmat);
    lines.frustumCulled = false;
    lines.visible = false;
    camera.add(lines);
    disposables.push(lgeo, lmat);

    // --- Kalkan baloncuğu ---
    const shieldGeo = new THREE.SphereGeometry(1, 24, 16);
    const shieldMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 }, uColor: { value: new THREE.Color(0x6fdcff) } },
        vertexShader: `
            varying vec3 vN;
            varying vec3 vV;
            varying vec3 vP;
            void main() {
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vN = normalize(normalMatrix * normal);
                vV = normalize(-mv.xyz);
                vP = position;
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: `
            uniform float uTime;
            uniform float uAlpha;
            uniform vec3 uColor;
            varying vec3 vN;
            varying vec3 vV;
            varying vec3 vP;
            void main() {
                float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
                float band = 0.5 + 0.5 * sin(vP.y * 18.0 - uTime * 5.0);
                float a = (f * 0.95 + band * 0.07 + 0.04) * uAlpha;
                gl_FragColor = vec4(uColor * (0.6 + f), a);
                #include <colorspace_fragment>
            }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.visible = false;
    shield.renderOrder = 4;
    scene.add(shield);
    disposables.push(shieldGeo, shieldMat);
    let shieldPop = 0; // kırılma animasyonu (s)
    let shieldShown = 0; // görünürlük ölçeği (0..1)

    // --- Mıknatıs halkaları ---
    const ringGeo = new THREE.TorusGeometry(0.8, 0.028, 6, 48);
    const ringMatA = new THREE.MeshBasicMaterial({ color: 0xff5a6a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const ringMatB = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    const magnetGroup = new THREE.Group();
    const ringA = new THREE.Mesh(ringGeo, ringMatA);
    const ringB = new THREE.Mesh(ringGeo, ringMatB);
    ringA.rotation.x = Math.PI / 2;
    ringB.rotation.x = Math.PI / 2;
    magnetGroup.add(ringA, ringB);
    magnetGroup.visible = false;
    scene.add(magnetGroup);
    disposables.push(ringGeo, ringMatA, ringMatB);

    // --- Ekran kenarı flaşı (tam ekran üçgen çifti, kameradan bağımsız) ---
    const flashGeo = new THREE.PlaneGeometry(2, 2);
    const flashMat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uAmount: { value: 0 } },
        vertexShader: `
            varying vec2 vUv;
            void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uAmount;
            varying vec2 vUv;
            void main() {
                vec2 d = (vUv - 0.5) * 2.0;
                float v = smoothstep(0.35, 1.45, length(d));
                gl_FragColor = vec4(uColor, clamp(v * uAmount + uAmount * 0.12, 0.0, 1.0));
                #include <colorspace_fragment>
            }`,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.frustumCulled = false;
    flash.renderOrder = 1000;
    flash.visible = false;
    scene.add(flash);
    disposables.push(flashGeo, flashMat);
    let flashAmt = 0;
    let flashDecay = 2;

    // --- Kamera sarsıntısı ---
    let trauma = 0;
    let lite = false;
    const shake = { x: 0, y: 0, roll: 0 };

    return {
        shake,
        /** zW: dünya z (m); baseVz: oyuncu hızı (m/s) - "follow" oranında taşınır. */
        burst(kind, x, y, zW, count, baseVz = 0, spreadY = 1) {
            const n = lite ? Math.max(1, Math.round(count * LITE_PARTICLE_SCALE)) : count;
            spawn(kind, x, y, zW, n, baseVz, spreadY);
        },
        /** Düşük kalite kademesi: hız çizgisi yok, daha az ve küçük partikül. */
        setLite(on) {
            lite = Boolean(on);
            pmat.uniforms.uMaxSize.value = lite ? LITE_MAX_POINT_PX : MAX_POINT_PX;
            if (lite) lines.visible = false;
        },
        flash(hex, amount = 0.8, decay = 2) {
            flashMat.uniforms.uColor.value.setHex(hex);
            flashAmt = Math.max(flashAmt, amount);
            flashDecay = decay;
        },
        addTrauma(v) {
            if (reducedMotion) return;
            trauma = Math.min(1, trauma + v);
        },
        shieldBreak() {
            shieldPop = 0.0001;
        },
        setPixelScale(heightPx, fovDeg) {
            // Partikül boyutu: dünya birimi -> piksel
            pmat.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
        },

        /**
         * st: { dt, time, pzM, player:{x,y}, speedNorm (0..1), shield(bool), magnetLeft (s), running }
         */
        update(st) {
            const dt = st.dt;
            updateParticles(dt, st.pzM);

            // Hız çizgileri
            const sn = reducedMotion || lite ? 0 : clamp((st.speedNorm - 0.15) / 0.85, 0, 1) * (st.running ? 1 : 0);
            if (sn > 0.01) {
                lines.visible = true;
                lmat.opacity = 0.12 + sn * 0.3;
                const adv = (14 + sn * 34) * dt;
                const len = 0.8 + sn * 2.6;
                for (let i = 0; i < SPEED_LINES; i++) {
                    let z = lineSeed[i * 3 + 2] + adv;
                    if (z > -1) {
                        z -= 27;
                        lineSeed[i * 3] = Math.random() * Math.PI * 2;
                        lineSeed[i * 3 + 1] = 1.6 + Math.random() * 2.6;
                    }
                    lineSeed[i * 3 + 2] = z;
                    const a = lineSeed[i * 3];
                    const r = lineSeed[i * 3 + 1];
                    const x = Math.cos(a) * r * 1.4;
                    const y = Math.sin(a) * r * 0.9;
                    linePos[i * 6] = x;
                    linePos[i * 6 + 1] = y;
                    linePos[i * 6 + 2] = z;
                    linePos[i * 6 + 3] = x;
                    linePos[i * 6 + 4] = y;
                    linePos[i * 6 + 5] = z - len;
                }
                aLine.needsUpdate = true;
            } else {
                lines.visible = false;
            }

            // Kalkan
            const px = st.player.x;
            const py = st.player.y;
            const pzR = st.player.z || 0;
            shieldShown = clamp(shieldShown + (st.shield ? dt * 5 : -dt * 5), 0, 1);
            if (shieldPop > 0) {
                shieldPop += dt;
                const k = shieldPop / 0.35;
                shield.visible = k < 1;
                shield.scale.setScalar(1.05 + k * 0.9);
                shieldMat.uniforms.uAlpha.value = 1 - k;
                if (k >= 1) shieldPop = 0;
            } else {
                shield.visible = shieldShown > 0.01;
                const pulse = 1 + Math.sin(st.time * 4) * 0.025;
                shield.scale.set(1.0 * pulse * shieldShown, 1.12 * pulse * shieldShown, 1.0 * pulse * shieldShown);
                shieldMat.uniforms.uAlpha.value = 0.9;
            }
            shield.position.set(px, py + 0.9, pzR);
            shieldMat.uniforms.uTime.value = st.time;

            // Mıknatıs
            if (st.magnetLeft > 0) {
                magnetGroup.visible = st.magnetLeft > 2 || Math.floor(st.time * 8) % 2 === 0;
                magnetGroup.position.set(px, py, pzR);
                const t = st.time;
                ringA.position.y = 0.35 + (Math.sin(t * 5) * 0.5 + 0.5) * 1.2;
                ringB.position.y = 0.35 + (Math.sin(t * 5 + Math.PI) * 0.5 + 0.5) * 1.2;
                const s1 = 0.9 + Math.sin(t * 7) * 0.08;
                ringA.scale.set(s1, s1, s1);
                ringB.scale.set(1.15 - (s1 - 0.9), 1.15 - (s1 - 0.9), 1);
                ringA.rotation.z = t * 2;
                ringB.rotation.z = -t * 3;
            } else {
                magnetGroup.visible = false;
            }

            // Flaş
            if (flashAmt > 0.001) {
                flashAmt = Math.max(0, flashAmt - dt * flashDecay);
                flashMat.uniforms.uAmount.value = flashAmt;
                flash.visible = true;
            } else {
                flash.visible = false;
            }

            // Sarsıntı (azalan travma; karesiyle ölçeklenir)
            if (trauma > 0) {
                trauma = Math.max(0, trauma - dt * 1.6);
                const k = trauma * trauma;
                const t = st.time * 40;
                shake.x = (Math.sin(t * 1.3) + Math.sin(t * 2.9) * 0.5) * 0.22 * k;
                shake.y = (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.7) * 0.5) * 0.16 * k;
                shake.roll = Math.sin(t * 1.1 + 2) * 0.05 * k;
            } else {
                shake.x = 0;
                shake.y = 0;
                shake.roll = 0;
            }
        },

        dispose() {
            camera.remove(lines);
            scene.remove(points, shield, magnetGroup, flash);
            for (const d of disposables) d.dispose();
        },
    };
}
