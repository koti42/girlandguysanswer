/*
 * Oyuncu karakteri: avatar yapılandırmasından (catalog) kurulan 3D karakter
 * (avatar/build3d.js) + koşu izi + Süper Zıplama ayak parıltısı + blob gölge.
 *
 * Animasyon tamamen prosedürel: her karede durumdan bir hedef poz yazılır
 * (avatar poz yardımcıları: koşu, zıplama, kayma, düşüş, bekleme; çarpma ve
 * sendeleme burada) ve gerçek iskelet hedefe üstel sönümle yaklaşır; pozlar
 * arası geçiş yumuşak olur. Kayma takla dönüşü ve Süper Zıplama saltosu
 * sönümsüz (ilerlemeye bağlı) eklenir.
 *
 * Karakter -z yönüne koşar; kamera arkasında olduğundan sırt detayları
 * (kapüşon, saç, forma numarası) özenli. v2'de y "ayak yüksekliği": araç
 * çatısında y > 0 iken de koşu pozu sürer (havada olmak = grounded false).
 */
import * as THREE from 'three';
import {
    buildAvatar,
    createPoseTarget,
    blendPose,
    poseIdle,
    poseRun,
    poseJump,
    poseSlide,
    poseFall,
} from '../../avatar/build3d.js';
import { normalizeAvatar } from '../../avatar/catalog.js';
import { createTrail } from './trail.js';
import { clamp, damp } from './mathUtils.js';

const FLIP_S = 0.7;
// Koşu kamerasında karakter okunaklı olsun diye hafif büyük (çarpışma kutusu sim'de).
const RUNNER_SCALE = 1.06;
const SUPER_GLOW = 0x5dff8a;

export function createPlayer(scene, { avatar: avatarCfg, glowTexture, detail = 'high' }) {
    let cfg = normalizeAvatar(avatarCfg);
    const avatar = buildAvatar(cfg, { detail });
    const rig = avatar.rig;
    const target = createPoseTarget(rig);

    const root = new THREE.Group();
    root.scale.setScalar(RUNNER_SCALE);
    scene.add(root);
    // Şerit eğilmesi ve çarpma savrulması bu ara düğümde (rig'e dokunmaz).
    const body = new THREE.Group();
    root.add(body);
    body.add(avatar.root);

    // Süper Zıplama: ayaklarda neon yeşil hale (yalnızca etkinken görünür).
    const shoeGlowMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: SUPER_GLOW,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const shoeGlows = [];
    for (const foot of [rig.footL, rig.footR]) {
        const sp = new THREE.Sprite(shoeGlowMat);
        sp.scale.set(0.42, 0.3, 1);
        sp.position.set(0, -0.06, -0.03);
        sp.visible = false;
        foot.add(sp);
        shoeGlows.push(sp);
    }

    // Blob gölge (gerçek gölge yok): üzerinde durulan yüzeye (zemin/çatı) düşer.
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ map: glowTexture, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.renderOrder = 1;
    scene.add(shadow);

    const trail = createTrail(scene, { kind: cfg.trail });

    let phase = 0;
    let crashT = -1;
    let stumbleT = 0;
    let landT = 1;
    let landHeavy = 0;
    let blinkVisible = true;
    let roll = 0;
    let rollBase = 0;
    let lastSlideP = 0;
    let flipT = -1;
    let airFromJump = false;
    let superOn = false;
    let shadowY = 0;
    let appliedRoll = 0; // rig'e eklenmiş takla açısı (sönümlü pozdan ayrı tutulur)
    const _a = new THREE.Vector3();

    /** Çarpma: geriye savrulup sırtüstü düşer, kollar açılır (hedefe yazar). */
    function poseCrash(t, k) {
        poseFall(t);
        const y0 = t.rest.hipsY;
        t.hips.position.y = y0 - (y0 - 0.3) * k;
        t.hips.rotation.x = 1.45 * k;
        t.spine.rotation.x = 0.1;
        t.chest.rotation.x = 0.1;
        t.head.rotation.x = -0.3;
        t.armL.rotation.x = 2.2;
        t.armR.rotation.x = 2.0;
        t.armL.rotation.z = -1.2;
        t.armR.rotation.z = 1.2;
        t.foreArmL.rotation.x = 0.3;
        t.foreArmR.rotation.x = 0.3;
        t.legL.rotation.x = 0.5;
        t.legR.rotation.x = 0.9;
        t.shinL.rotation.x = -0.6;
        t.shinR.rotation.x = -0.2;
        t.hair.rotation.x = 1.2;
        t.hair.rotation.z = 0.3;
    }

    return {
        root,
        rig,
        get phase() {
            return phase;
        },

        /** Yere/çatıya iniş: çatıda daha derin çökme. */
        land(onRoof = false) {
            landT = 0;
            landHeavy = onRoof ? 1 : 0;
            flipT = -1;
        },
        /** Zıplama başladı; süper zıplamada salto. */
        jump(isSuper = false) {
            airFromJump = true;
            if (isSuper) flipT = 0;
        },
        stumble() {
            stumbleT = 0.0001;
        },
        crash() {
            crashT = 0;
            flipT = -1;
        },
        reset() {
            crashT = -1;
            stumbleT = 0;
        },
        setAvatar(next) {
            cfg = normalizeAvatar(next);
            avatar.setConfig(cfg);
            trail.setKind(cfg.trail);
        },
        setLite(on) {
            trail.setLite(on);
        },
        setPixelScale(heightPx, fovDeg) {
            trail.setPixelScale(heightPx, fovDeg);
        },

        /**
         * s: { x, y (ayak, m), vy (mm/tick), grounded, supportY (m), speed (m/s), sliding,
         *      slideProgress (0..1), laneVel (m/s), running, idle, invuln, time,
         *      superLeft (s, 0 = kapalı), pzM (dünya z, m) }
         */
        update(dt, s) {
            const t = s.time;
            if (s.running && crashT < 0) phase += (s.speed * dt) / 1.55 * Math.PI;
            if (stumbleT > 0) stumbleT += dt;
            if (stumbleT > 1.5) stumbleT = 0;
            landT += dt;
            if (s.grounded) airFromJump = false;

            const air = !s.grounded && crashT < 0;
            const lean = clamp(s.laneVel / 12, -1, 1);
            let lambda = 16;
            let leanZ = 0;
            let leanY = 0;

            if (crashT >= 0) {
                crashT += dt;
                poseCrash(target, Math.min(1, crashT / 0.45));
                lambda = 10;
            } else if (s.idle) {
                poseIdle(target, t);
                lambda = 8;
            } else if (s.sliding) {
                // Kayma = öne takla: top gibi toplanır (dönüş aşağıda, sönümsüz).
                poseSlide(target, s.slideProgress);
                leanZ = -lean * 0.2;
                // Top pozu dönüş başlamadan otursun diye hızlı sönüm.
                lambda = 45;
            } else if (air) {
                if (flipT >= 0 && flipT < FLIP_S) {
                    // Süper zıplama saltosu: havada toplanır.
                    poseSlide(target, 0.5);
                    target.hips.position.y = target.rest.hipsY * 0.85;
                    lambda = 30;
                } else if (!airFromJump && s.vy <= 0) {
                    // Çatı kenarından düşüş
                    poseFall(target);
                    target.armL.rotation.z -= Math.sin(t * 18) * 0.2;
                    target.armR.rotation.z += Math.sin(t * 18 + 1) * 0.2;
                    lambda = 10;
                } else {
                    poseJump(target, s.vy / 140);
                    lambda = 14;
                }
                leanZ = -lean * 0.35;
                leanY = -lean * 0.25;
            } else {
                poseRun(target, phase, clamp((s.speed - 10.8) / 14.4, 0, 1));
                // İniş çökmesi (çatıda daha derin)
                if (landT < 0.18) target.hips.position.y -= (0.18 - landT) * (0.8 + landHeavy * 0.9);
                leanZ = -lean * 0.32;
                leanY = -lean * 0.3;
                lambda = 26;
            }

            // Sendeleme: gövde yalpalar, kollar çırpınır (üstüne eklenir)
            let wobble = 0;
            if (stumbleT > 0 && crashT < 0) {
                const k = Math.max(0, 1 - stumbleT / 0.9);
                wobble = Math.sin(stumbleT * 26) * 0.35 * k;
                target.chest.rotation.x += 0.35 * k;
                target.armL.rotation.z -= 1.1 * k * (0.6 + 0.4 * Math.sin(stumbleT * 30));
                target.armR.rotation.z += 1.1 * k * (0.6 + 0.4 * Math.cos(stumbleT * 28));
            }

            rig.hips.rotation.x -= appliedRoll;
            blendPose(rig, target, 1 - Math.exp(-lambda * dt));

            // Takla açısı: kayma ilerlemesine bağlı tam tur (-2π = öne). Kayma yarıda
            // kesilirse (zıplama) en yakın tam tura yumuşakça tamamlanır.
            if (s.sliding && crashT < 0 && s.slideProgress > 0) {
                const p = s.slideProgress;
                // Kayma sürerken yeniden kayıldı (sayaç başa döndü): dönüş kesintisiz sürsün.
                if (p < lastSlideP - 0.05) rollBase = roll;
                else if (lastSlideP === 0) rollBase = Math.round(roll / (Math.PI * 2)) * Math.PI * 2;
                lastSlideP = p;
                roll = rollBase - Math.PI * 2 * (p * p * (3 - 2 * p));
            } else if (flipT >= 0 && crashT < 0 && !s.grounded) {
                if (flipT === 0) rollBase = Math.round(roll / (Math.PI * 2)) * Math.PI * 2;
                flipT += dt;
                const p = Math.min(1, flipT / FLIP_S);
                roll = rollBase - Math.PI * 2 * (p * p * (3 - 2 * p));
                lastSlideP = 0;
                if (p >= 1) flipT = -1;
            } else if (roll !== 0) {
                lastSlideP = 0;
                const tg = Math.round(roll / (Math.PI * 2)) * Math.PI * 2;
                roll = damp(roll, tg, 14, dt);
                if (Math.abs(roll - tg) < 0.01) roll = 0;
            } else {
                lastSlideP = 0;
            }
            rig.hips.rotation.x += roll;
            appliedRoll = roll;

            root.position.set(s.x, s.y, crashT >= 0 ? Math.min(1, crashT * 3) * 0.9 : 0);
            body.rotation.z = crashT >= 0 ? 0.15 : leanZ + wobble;
            body.rotation.y = crashT >= 0 ? Math.min(1, crashT / 0.45) * 0.36 : leanY;
            body.position.y = crashT >= 0 ? Math.max(0, Math.sin((Math.min(crashT, 0.6) / 0.6) * Math.PI)) * 0.25 : 0;

            // Dokunulmazlıkta yanıp sönme
            const vis = !s.invuln || Math.floor(t * 12) % 2 === 0;
            if (vis !== blinkVisible) {
                blinkVisible = vis;
                body.visible = vis;
            }

            // Süper Zıplama ayak parıltısı (son 2 sn yanıp söner)
            const sOn = s.superLeft > 0 && crashT < 0 && (s.superLeft > 2 || Math.floor(t * 8) % 2 === 0);
            if (sOn !== superOn) {
                superOn = sOn;
                shoeGlows[0].visible = sOn;
                shoeGlows[1].visible = sOn;
            }
            if (sOn) shoeGlowMat.opacity = 0.7 + 0.3 * Math.sin(t * 14);

            // Gölge: üzerinde durulan yüzeyde; yükseldikçe küçülür ve solar
            shadowY = s.grounded || Math.abs(shadowY - s.supportY) > 0.5 ? s.supportY : damp(shadowY, s.supportY, 20, dt);
            const hgt = Math.max(0, s.y - s.supportY);
            const sc = clamp(1.1 - hgt * 0.22, 0.45, 1.1) * (s.sliding ? 0.9 : 1);
            shadow.position.set(s.x, shadowY + 0.02, root.position.z - 0.05);
            shadow.scale.set(sc * 1.15, 1, sc * 1.15);
            shadowMat.opacity = clamp(0.6 - hgt * 0.15, 0.2, 0.6);

            // Koşu izi: çapanın dünya konumundan
            root.updateMatrixWorld(true);
            rig.trailAnchor.getWorldPosition(_a);
            trail.update(dt, _a.x, _a.y, _a.z, s.pzM, s.running && crashT < 0 && !s.idle, crashT < 0 ? s.speed : 0);
        },

        dispose() {
            scene.remove(root, shadow);
            trail.dispose();
            avatar.dispose();
            shadowGeo.dispose();
            shadowMat.dispose();
            shoeGlowMat.dispose();
        },
    };
}
