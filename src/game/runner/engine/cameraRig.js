/*
 * Kamera: oyuncunun arkasında ve üstünde, şerit değişimini yumuşak izler.
 *
 *  - Dikey (portrait) ekranda 3 şerit sığsın diye yatay görüş açısı hedeflenir;
 *    kamera yükselip yaklaşır ve aşağı bakar (kadraj: cameraMath.cameraFraming).
 *  - Hız arttıkça FOV hafifçe açılır; sendeleme/çarpmada sarsıntı
 *    (ikisi de reducedMotion'da kapalı).
 *  - Başlangıç geri sayımında karakterin önünden arkasına süzülen tanıtım
 *    çekimi (reducedMotion'da doğrudan arkadan).
 *  - Yükseklik (v2): kamera üzerinde durulan yüzeyi (zemin/araç çatısı)
 *    yumuşakça izler; çatıdayken biraz daha yükselir (önü görünsün),
 *    çatıdan düşerken aşağı yumuşak iner (ani sıçrama yok). Zıplamanın
 *    yalnızca bir kısmını izler (ekran sallanmasın).
 */
import * as THREE from 'three';
import { clamp, damp, easeOutCubic, lerp } from './mathUtils.js';
import { baseVerticalFov, cameraFraming, cameraHeightTarget } from './cameraMath.js';

const _look = new THREE.Vector3();
const _frame = {};

export function createCameraRig(camera, { reducedMotion }) {
    let camX = 0;
    let camY = 0;
    let supportCam = 0;
    let fovKick = 0;
    let crashPull = 0;
    let intro = reducedMotion ? 0 : 1; // 1 = önden, 0 = arkadan
    let introT = -1;

    return {
        get x() {
            return camX;
        },
        get y() {
            return camY;
        },

        /** Geri sayım tanıtım çekimini başlat (süre: saniye). */
        startIntro() {
            if (reducedMotion) {
                intro = 0;
                return;
            }
            introT = 0;
        },
        skipIntro() {
            intro = 0;
            introT = -1;
        },

        /**
         * st: { dt, aspect, px, py (oyuncu ayak, m), groundY (destek yüksekliği, m),
         *       speedNorm, crashed, shake:{x,y,roll}, idleTime }
         */
        update(st) {
            const dt = st.dt;
            // Dikeyde karakterin altı boş yol olmasın: kamera yüksek ve yakın,
            // karakter ekranın alt dörtte birinde; ufuk üstteki HUD/soru panelinin
            // hemen altında, aradaki geniş bant önümüzdeki yol.
            const { back, height, lookAhead, lookY, fovOffset, kick } = cameraFraming(st.aspect, _frame);

            camX = damp(camX, st.px * 0.72, 9, dt);
            // Destek: çıkarken çabuk, inerken (çatıdan düşüş) yumuşak.
            const g = st.groundY || 0;
            supportCam = damp(supportCam, g, g > supportCam ? 5 : 2.6, dt);
            camY = damp(camY, cameraHeightTarget(st.py, supportCam), 6, dt);
            crashPull = damp(crashPull, st.crashed ? 1 : 0, 3, dt);

            if (introT >= 0) {
                introT += dt;
                intro = 1 - easeOutCubic(clamp((introT - 0.25) / 2.5, 0, 1));
                if (introT > 2.8) {
                    introT = -1;
                    intro = 0;
                }
            }

            // Arka konum
            let x = camX + st.shake.x;
            let y = height + camY + st.shake.y + crashPull * 1.6;
            let z = back + crashPull * 2.2;
            let lx = camX * 0.85;
            let ly = lookY + camY * 0.6;
            let lz = -lookAhead + crashPull * 6;

            if (intro > 0.001) {
                // Önden arkaya yay: oyuncu etrafında y ekseninde dönüş
                const ang = intro * Math.PI * 0.92;
                const r = lerp(back, 3.6, intro);
                const fx = st.px + Math.sin(ang) * r * 0.6;
                const fz = Math.cos(ang) * r;
                const fy = lerp(height, 1.75, intro) + Math.sin(st.idleTime * 0.8) * 0.05 * intro;
                x = lerp(x, fx, intro);
                y = lerp(y, fy, intro);
                z = fz;
                lx = lerp(lx, st.px, intro);
                ly = lerp(ly, 1.15, intro);
                lz = lerp(lz, 0, intro);
            }

            camera.position.set(x, y, z);
            _look.set(lx, ly, lz);
            camera.lookAt(_look);
            if (st.shake.roll) camera.rotation.z += st.shake.roll;

            const kickTarget = reducedMotion ? 0 : st.speedNorm * kick;
            fovKick = damp(fovKick, kickTarget, 2, dt);
            const fov = baseVerticalFov(st.aspect) + fovOffset + fovKick - intro * 6;
            if (Math.abs(camera.fov - fov) > 0.01 || camera.aspect !== st.aspect) {
                camera.fov = fov;
                camera.aspect = st.aspect;
                camera.updateProjectionMatrix();
            }
        },
    };
}
