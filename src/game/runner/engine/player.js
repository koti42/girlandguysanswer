/*
 * Oyuncu karakteri: primitiflerden kurulu kız/erkek, 4 renk paleti.
 *
 * Her uzuv tek mesh (köşe renkli, tek ortak malzeme) ve bir pivot düğümüne
 * bağlı. Animasyon tamamen prosedürel: hedef eklem açıları durumdan
 * hesaplanır (koşu, zıplama, kayma, şerit eğilmesi, sendeleme, çarpma) ve
 * eklemler hedefe üstel sönümle yaklaşır; pozlar arası geçiş yumuşak olur.
 *
 * Karakter -z yönüne koşar; kamera arkasında olduğundan sırt detayları
 * (kapüşon, atkuyruğu, ters şapka) özenli.
 */
import * as THREE from 'three';
import { GeoBuilder, createTemplates } from './geoBuilder.js';
import { CHARACTER_PALETTES } from './palette.js';
import { clamp, damp } from './mathUtils.js';

const SCALE = 0.93;

// Eklem dizisi indeksleri (hedef ve mevcut açılar Float32Array'de tutulur).
const J = {
    hipsY: 0, hipsRX: 1, bodyRZ: 2, bodyRY: 3, torsoRX: 4, torsoRY: 5, headRX: 6,
    shLX: 7, shLZ: 8, shRX: 9, shRZ: 10, elL: 11, elR: 12,
    thL: 13, thR: 14, knL: 15, knR: 16, tailRX: 17, tailRZ: 18, hipsZ: 19,
};
const JOINTS = 20;

// Not: şablon kapsül (createTemplates) yarıçap 1, toplam boy 3; y ölçeği = istenen boy / 3.
export function createPlayer(scene, { body, palette, glowTexture }) {
    const pal = CHARACTER_PALETTES[palette] || CHARACTER_PALETTES[0];
    const isGirl = body !== 'erkek';
    const T = createTemplates();
    const geos = [];
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const build = (fn) => {
        const b = new GeoBuilder();
        fn(b);
        const g = b.build();
        geos.push(g);
        return g;
    };

    const root = new THREE.Group();
    root.scale.setScalar(SCALE);
    scene.add(root);
    const bodyNode = new THREE.Group();
    root.add(bodyNode);
    const hips = new THREE.Group();
    hips.position.y = 0.92;
    bodyNode.add(hips);

    // Pelvis
    hips.add(new THREE.Mesh(build((b) => {
        b.add(T.capsule, pal.pants, [0, -0.02, 0], [0, 0, Math.PI / 2], [0.12, 0.11, 0.11]);
    }), material));

    // Gövde (hoodie) + kapüşon + cep
    const torso = new THREE.Group();
    torso.position.y = 0.06;
    hips.add(torso);
    torso.add(new THREE.Mesh(build((b) => {
        b.add(T.capsule, pal.hoodie, [0, 0.25, 0], null, [isGirl ? 0.185 : 0.2, 0.17, 0.15]);
        // Etek ucu ribanası
        b.add(T.cyl, pal.trim, [0, 0.04, 0], null, [isGirl ? 0.185 : 0.2, 0.06, 0.15]);
        // Kanguru cebi (önde, -z)
        b.box(0, 0.14, -0.145, 0.24, 0.11, 0.03, pal.trim);
        // Kapüşon (sırtta)
        b.add(T.sphere, pal.hoodie, [0, 0.47, 0.11], null, [0.16, 0.11, 0.1]);
        b.add(T.sphere, pal.trim, [0, 0.49, 0.06], null, [0.12, 0.08, 0.07]);
        // Sırt baskısı: küçük "?" amblemi yerine iki renkli şerit
        b.box(0, 0.3, 0.152, 0.2, 0.035, 0.01, pal.trim);
        b.box(0, 0.25, 0.152, 0.14, 0.035, 0.01, pal.trim);
        // İpler (önde)
        b.box(-0.05, 0.38, -0.15, 0.015, 0.12, 0.015, pal.trim);
        b.box(0.05, 0.38, -0.15, 0.015, 0.12, 0.015, pal.trim);
    }), material));

    // Baş
    const head = new THREE.Group();
    head.position.y = 0.52;
    torso.add(head);
    head.add(new THREE.Mesh(build((b) => {
        b.add(T.cyl, pal.skin, [0, 0.04, 0], null, [0.055, 0.1, 0.055]);
        b.add(T.sphereSmooth, pal.skin, [0, 0.2, 0], null, [0.16, 0.17, 0.16]);
        // Kulaklar
        b.add(T.sphere, pal.skin, [-0.16, 0.19, 0.01], null, [0.03, 0.045, 0.03]);
        b.add(T.sphere, pal.skin, [0.16, 0.19, 0.01], null, [0.03, 0.045, 0.03]);
        // Gözler ve ağız (önde, -z)
        b.add(T.sphere, 0x1b1530, [-0.055, 0.21, -0.145], null, [0.022, 0.032, 0.015]);
        b.add(T.sphere, 0x1b1530, [0.055, 0.21, -0.145], null, [0.022, 0.032, 0.015]);
        b.box(0, 0.14, -0.155, 0.05, 0.012, 0.01, 0xb0505a);
        if (isGirl) {
            b.add(T.sphere, 0xff9fb0, [-0.09, 0.16, -0.13], null, [0.025, 0.015, 0.01]);
            b.add(T.sphere, 0xff9fb0, [0.09, 0.16, -0.13], null, [0.025, 0.015, 0.01]);
            // Saç: kafa üstü + kahkül + yanlar
            b.add(T.sphereSmooth, pal.hair, [0, 0.235, 0.012], null, [0.172, 0.165, 0.172]);
            b.add(T.sphereSmooth, pal.hair, [0, 0.3, -0.06], [0.5, 0, 0], [0.15, 0.07, 0.11]);
            b.add(T.sphereSmooth, pal.hair, [-0.13, 0.17, 0.03], null, [0.05, 0.12, 0.09]);
            b.add(T.sphereSmooth, pal.hair, [0.13, 0.17, 0.03], null, [0.05, 0.12, 0.09]);
        } else {
            // Kısa saç + ters şapka (siperlik arkada)
            b.add(T.sphereSmooth, pal.hair, [0, 0.22, 0.015], null, [0.168, 0.15, 0.168]);
            b.add(T.sphereSmooth, pal.cap, [0, 0.27, 0.0], null, [0.172, 0.12, 0.172]);
            b.add(T.cyl12, pal.cap, [0, 0.29, 0.0], null, [0.172, 0.04, 0.172]);
            b.box(0, 0.27, 0.2, 0.2, 0.025, 0.14, pal.cap);
            b.add(T.sphere, pal.trim, [0, 0.39, 0], null, [0.025, 0.02, 0.025]);
        }
    }), material));

    // Atkuyruğu (kızda) - ayrı pivot, koşuda sallanır
    let tail = null;
    if (isGirl) {
        tail = new THREE.Group();
        tail.position.set(0, 0.3, 0.13);
        head.add(tail);
        tail.add(new THREE.Mesh(build((b) => {
            b.add(T.torus, pal.cap, [0, 0, 0.02], [Math.PI / 2, 0, 0], [0.04, 0.04, 0.04]);
            b.add(T.sphereSmooth, pal.hair, [0, -0.07, 0.05], null, [0.065, 0.09, 0.065]);
            b.add(T.sphereSmooth, pal.hair, [0, -0.18, 0.07], null, [0.055, 0.1, 0.055]);
            b.add(T.sphereSmooth, pal.hair, [0, -0.28, 0.07], null, [0.035, 0.07, 0.035]);
        }), material));
    }

    // Kollar
    const armGeoUpper = build((b) => {
        b.add(T.capsule, pal.hoodie, [0, -0.12, 0], null, [0.066, 0.095, 0.066]);
    });
    const armGeoLower = build((b) => {
        b.add(T.capsule, pal.hoodie, [0, -0.1, 0], null, [0.058, 0.07, 0.058]);
        b.add(T.cyl, pal.trim, [0, -0.2, 0], null, [0.054, 0.04, 0.054]);
        b.add(T.sphere, pal.skin, [0, -0.27, 0], null, [0.055, 0.06, 0.05]);
    });
    const makeArm = (side) => {
        const sh = new THREE.Group();
        sh.position.set(side * 0.235, 0.44, 0);
        torso.add(sh);
        sh.add(new THREE.Mesh(armGeoUpper, material));
        const el = new THREE.Group();
        el.position.y = -0.26;
        sh.add(el);
        el.add(new THREE.Mesh(armGeoLower, material));
        return { sh, el };
    };
    const armL = makeArm(-1);
    const armR = makeArm(1);

    // Bacaklar
    const thighGeo = build((b) => {
        b.add(T.capsule, pal.pants, [0, -0.2, 0], null, [0.095, 0.15, 0.095]);
    });
    const shinGeo = build((b) => {
        b.add(T.capsule, pal.pants, [0, -0.18, 0], null, [0.08, 0.135, 0.08]);
        b.box(0, -0.41, -0.045, 0.15, 0.12, 0.29, pal.shoes);
        b.box(0, -0.475, -0.045, 0.16, 0.04, 0.31, pal.sole);
        b.box(0, -0.38, 0.06, 0.135, 0.03, 0.06, pal.sole);
    });
    const makeLeg = (side) => {
        const th = new THREE.Group();
        th.position.set(side * 0.105, -0.06, 0);
        hips.add(th);
        th.add(new THREE.Mesh(thighGeo, material));
        const kn = new THREE.Group();
        kn.position.y = -0.4;
        th.add(kn);
        kn.add(new THREE.Mesh(shinGeo, material));
        return { th, kn };
    };
    const legL = makeLeg(-1);
    const legR = makeLeg(1);

    // Blob gölge (gerçek gölge yok)
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ map: glowTexture, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.renderOrder = 1;
    scene.add(shadow);
    geos.push(shadowGeo);
    T.dispose();

    const cur = new Float32Array(JOINTS);
    const tgt = new Float32Array(JOINTS);
    cur[J.hipsY] = 0.92;
    let phase = 0;
    let crashT = -1;
    let stumbleT = 0;
    let landT = 1;
    let blinkVisible = true;
    let roll = 0;
    let rollBase = 0;
    let lastSlideP = 0;

    function setTarget(i, v) {
        tgt[i] = v;
    }

    return {
        root,
        get phase() {
            return phase;
        },

        land() {
            landT = 0;
        },
        stumble() {
            stumbleT = 0.0001;
        },
        crash() {
            crashT = 0;
        },
        reset() {
            crashT = -1;
            stumbleT = 0;
        },

        /**
         * s: { x, y (m), vy (mm/tick), speed (m/s), sliding, slideProgress (0..1), laneVel (m/s), stumbling,
         *      running (bool), idle (bool), invuln (bool), time }
         */
        update(dt, s) {
            const t = s.time;
            if (s.running && crashT < 0) phase += (s.speed * dt) / 1.55 * Math.PI;
            if (stumbleT > 0) stumbleT += dt;
            if (stumbleT > 1.5) stumbleT = 0;
            landT += dt;

            const air = s.y > 0.001 && crashT < 0;
            const sp = Math.sin(phase);
            const cp = Math.cos(phase);
            const lean = clamp(s.laneVel / 12, -1, 1);
            let lambda = 16;

            if (crashT >= 0) {
                // Çarpma: geriye savrulup sırtüstü düşer, kollar açılır.
                crashT += dt;
                const k = Math.min(1, crashT / 0.45);
                setTarget(J.hipsY, 0.92 - 0.62 * k);
                setTarget(J.hipsRX, 1.45 * k);
                setTarget(J.hipsZ, 0.9 * k);
                setTarget(J.torsoRX, 0.2);
                setTarget(J.torsoRY, 0);
                setTarget(J.headRX, -0.3);
                setTarget(J.shLX, 2.2);
                setTarget(J.shRX, 2.0);
                setTarget(J.shLZ, -1.2);
                setTarget(J.shRZ, 1.2);
                setTarget(J.elL, 0.3);
                setTarget(J.elR, 0.3);
                setTarget(J.thL, 0.5);
                setTarget(J.thR, 0.9);
                setTarget(J.knL, -0.6);
                setTarget(J.knR, -0.2);
                setTarget(J.bodyRZ, 0.15);
                setTarget(J.bodyRY, 0);
                setTarget(J.tailRX, 1.2);
                setTarget(J.tailRZ, 0.3);
                lambda = 10;
            } else if (s.idle) {
                // Bekleme: nefes alma, hafif sallanma
                const br = Math.sin(t * 2.2);
                setTarget(J.hipsY, 0.92 + br * 0.008);
                setTarget(J.hipsRX, 0);
                setTarget(J.hipsZ, 0);
                setTarget(J.torsoRX, -0.04 + br * 0.02);
                setTarget(J.torsoRY, Math.sin(t * 0.7) * 0.12);
                setTarget(J.headRX, 0.05);
                setTarget(J.shLX, 0.1);
                setTarget(J.shRX, 0.1);
                setTarget(J.shLZ, -0.12 - br * 0.03);
                setTarget(J.shRZ, 0.12 + br * 0.03);
                setTarget(J.elL, 0.35);
                setTarget(J.elR, 0.35);
                setTarget(J.thL, 0.04);
                setTarget(J.thR, -0.04);
                setTarget(J.knL, -0.06);
                setTarget(J.knR, -0.06);
                setTarget(J.bodyRZ, 0);
                setTarget(J.bodyRY, 0);
                setTarget(J.tailRX, 0.15);
                setTarget(J.tailRZ, Math.sin(t * 1.3) * 0.08);
                lambda = 8;
            } else if (s.sliding) {
                // Kayma = öne takla: top gibi toplanır, kalçanın etrafında bir tur döner
                // (dönüş açısı aşağıda, sönümsüz). Arkadan bakan kamerada okunaklı.
                setTarget(J.hipsY, 0.42);
                setTarget(J.hipsRX, 0);
                setTarget(J.hipsZ, 0);
                setTarget(J.torsoRX, -0.95);
                setTarget(J.torsoRY, 0);
                setTarget(J.headRX, -0.5);
                setTarget(J.shLX, 1.3);
                setTarget(J.shRX, 1.3);
                setTarget(J.shLZ, -0.25);
                setTarget(J.shRZ, 0.25);
                setTarget(J.elL, 1.5);
                setTarget(J.elR, 1.5);
                setTarget(J.thL, 2.3);
                setTarget(J.thR, 2.25);
                setTarget(J.knL, -2.5);
                setTarget(J.knR, -2.45);
                setTarget(J.bodyRZ, -lean * 0.2);
                setTarget(J.bodyRY, 0);
                setTarget(J.tailRX, 0.4);
                setTarget(J.tailRZ, 0);
                // Top pozu dönüş başlamadan otursun diye hızlı sönüm.
                lambda = 45;
            } else if (air) {
                // Zıplama: yükselirken sıçrama adımı, inerken toplanma
                const rise = clamp(s.vy / 140, -1, 1);
                const up = rise > 0 ? rise : 0;
                setTarget(J.hipsY, 0.92);
                setTarget(J.hipsRX, 0);
                setTarget(J.hipsZ, 0);
                setTarget(J.torsoRX, -0.25 + up * 0.1);
                setTarget(J.torsoRY, 0);
                setTarget(J.headRX, 0.2);
                setTarget(J.thL, 1.25 * up + 0.7 * (1 - up));
                setTarget(J.knL, -0.35 * up - 1.3 * (1 - up));
                setTarget(J.thR, -0.55 * up + 0.35 * (1 - up));
                setTarget(J.knR, -1.4 * up - 1.1 * (1 - up));
                setTarget(J.shLX, -0.8 * up + 2.4 * (1 - up));
                setTarget(J.shRX, 1.5 * up + 2.4 * (1 - up));
                setTarget(J.shLZ, -0.25 - 0.4 * (1 - up));
                setTarget(J.shRZ, 0.25 + 0.4 * (1 - up));
                setTarget(J.elL, 0.6);
                setTarget(J.elR, 0.9);
                setTarget(J.bodyRZ, -lean * 0.35);
                setTarget(J.bodyRY, -lean * 0.25);
                setTarget(J.tailRX, 0.3 - rise * 0.6);
                setTarget(J.tailRZ, 0);
                lambda = 14;
            } else {
                // Koşu döngüsü
                const amp = 0.95;
                setTarget(J.hipsY, 0.9 + Math.abs(cp) * 0.06 - (landT < 0.15 ? (0.15 - landT) * 0.9 : 0));
                setTarget(J.hipsRX, 0);
                setTarget(J.hipsZ, 0);
                setTarget(J.torsoRX, -0.22);
                setTarget(J.torsoRY, sp * 0.18);
                setTarget(J.headRX, 0.16);
                setTarget(J.thL, sp * amp);
                setTarget(J.thR, -sp * amp);
                setTarget(J.knL, -(0.25 + 1.15 * Math.max(0, cp)));
                setTarget(J.knR, -(0.25 + 1.15 * Math.max(0, -cp)));
                setTarget(J.shLX, -sp * 0.9);
                setTarget(J.shRX, sp * 0.9);
                setTarget(J.shLZ, -0.12);
                setTarget(J.shRZ, 0.12);
                setTarget(J.elL, 1.2 + Math.max(0, -sp) * 0.4);
                setTarget(J.elR, 1.2 + Math.max(0, sp) * 0.4);
                setTarget(J.bodyRZ, -lean * 0.32);
                setTarget(J.bodyRY, -lean * 0.3);
                setTarget(J.tailRX, 0.55 + Math.sin(phase * 2) * 0.18);
                setTarget(J.tailRZ, -sp * 0.35 - lean * 0.4);
                lambda = 26;
            }

            // Sendeleme: gövde yalpalar, kollar çırpınır (üstüne eklenir)
            let wobble = 0;
            if (stumbleT > 0 && crashT < 0) {
                const k = Math.max(0, 1 - stumbleT / 0.9);
                wobble = Math.sin(stumbleT * 26) * 0.35 * k;
                tgt[J.torsoRX] += 0.35 * k;
                tgt[J.shLZ] -= 1.1 * k * (0.6 + 0.4 * Math.sin(stumbleT * 30));
                tgt[J.shRZ] += 1.1 * k * (0.6 + 0.4 * Math.cos(stumbleT * 28));
            }

            for (let i = 0; i < JOINTS; i++) cur[i] = damp(cur[i], tgt[i], lambda, dt);

            // Takla açısı: kayma ilerlemesine bağlı tam tur (-2π = öne). Kayma yarıda
            // kesilirse (zıplama) en yakın tam tura yumuşakça tamamlanır.
            if (s.sliding && crashT < 0 && s.slideProgress > 0) {
                const p = s.slideProgress;
                // Kayma sürerken yeniden kayıldı (sayaç başa döndü): dönüş kesintisiz sürsün.
                if (p < lastSlideP - 0.05) rollBase = roll;
                else if (lastSlideP === 0) rollBase = Math.round(roll / (Math.PI * 2)) * Math.PI * 2;
                lastSlideP = p;
                roll = rollBase - Math.PI * 2 * (p * p * (3 - 2 * p));
            } else if (roll !== 0) {
                lastSlideP = 0;
                const target = Math.round(roll / (Math.PI * 2)) * Math.PI * 2;
                roll = damp(roll, target, 14, dt);
                if (Math.abs(roll - target) < 0.01) roll = 0;
            } else {
                lastSlideP = 0;
            }

            root.position.set(s.x, s.y, crashT >= 0 ? Math.min(1, crashT * 3) * 0.9 : 0);
            hips.position.y = cur[J.hipsY];
            hips.position.z = 0;
            hips.rotation.x = cur[J.hipsRX] + roll;
            bodyNode.rotation.z = cur[J.bodyRZ] + wobble;
            bodyNode.rotation.y = cur[J.bodyRY];
            bodyNode.position.y = crashT >= 0 ? Math.max(0, Math.sin(Math.min(crashT, 0.6) / 0.6 * Math.PI)) * 0.25 : 0;
            torso.rotation.x = cur[J.torsoRX];
            torso.rotation.y = cur[J.torsoRY];
            head.rotation.x = cur[J.headRX];
            armL.sh.rotation.x = cur[J.shLX];
            armL.sh.rotation.z = cur[J.shLZ];
            armR.sh.rotation.x = cur[J.shRX];
            armR.sh.rotation.z = cur[J.shRZ];
            armL.el.rotation.x = cur[J.elL];
            armR.el.rotation.x = cur[J.elR];
            legL.th.rotation.x = cur[J.thL];
            legR.th.rotation.x = cur[J.thR];
            legL.kn.rotation.x = cur[J.knL];
            legR.kn.rotation.x = cur[J.knR];
            if (tail) {
                tail.rotation.x = cur[J.tailRX];
                tail.rotation.z = cur[J.tailRZ];
            }
            if (crashT >= 0) bodyNode.rotation.y = cur[J.hipsZ] * 0.4;

            // Dokunulmazlıkta yanıp sönme
            const vis = !s.invuln || Math.floor(t * 12) % 2 === 0;
            if (vis !== blinkVisible) {
                blinkVisible = vis;
                bodyNode.visible = vis;
            }

            // Gölge: yükseldikçe küçülür ve solar
            const hgt = s.y;
            const sc = clamp(1.1 - hgt * 0.22, 0.45, 1.1) * (s.sliding ? 0.9 : 1);
            shadow.position.set(s.x, 0.02, root.position.z - 0.05);
            shadow.scale.set(sc * 1.15, 1, sc * 1.15);
            shadowMat.opacity = clamp(0.6 - hgt * 0.15, 0.2, 0.6);
        },

        dispose() {
            scene.remove(root, shadow);
            for (const g of geos) g.dispose();
            material.dispose();
            shadowMat.dispose();
        },
    };
}
