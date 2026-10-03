/*
 * Soru kapıları: her kapıda 3 kemer (Sol/Orta/Sağ), her kemerin üstünde
 * harf rozeti + şık metni paneli, kemer içinde enerji perdesi.
 *
 * İki kapı yuvası dönüşümlü kullanılır (kapılar 420 m arayla, görüş ~150 m).
 * Panel canvas'ları yuvaya aittir; yeni kapı atanınca aynı canvas'a yeniden
 * çizilir (her karede en fazla bir panel - takılma olmasın).
 *
 * Renk durumları: geçilmeden önce şerit renkleri; geçildikten sonra
 * setGateResult gelene kadar nötr (soluk beyaz); sonuç gelince doğru şerit
 * yeşil, yanlış seçilmişse seçilen şerit kırmızı flaş.
 *
 * Kamera kapıdan geçerken direkler/kemer ve paneller görüşü bir anlığına
 * kapatmasın diye kameraya yaklaştıkça erirler (gateNearFade). Çerçeve
 * normalde opak malzemeyle çizilir; yalnızca erirken yuvaya ait saydam
 * kopyaya geçer (OPAQUE define'ı farklı: shader'ı açılışta önceden derlensin
 * diye yuvada gizli bir "probe" mesh'i de vardır).
 */
import * as THREE from 'three';
import { GeoBuilder } from './geoBuilder.js';
import { SCENE_COLORS } from './palette.js';
import { createGatePanel, drawGatePanel, GATE_PANEL_W, GATE_PANEL_H } from './textures.js';
import { laneX } from './entities.js';
import { gateNearFade } from './cameraMath.js';

const LETTERS = ['A', 'B', 'C'];
const SHOW_BEHIND_M = 30;
const SHOW_AHEAD_M = 420;
const PANEL_W = 2.36;
const PANEL_H = (PANEL_W * GATE_PANEL_H) / GATE_PANEL_W;
const OPEN_H = 3.5;

const _col = new THREE.Color();
const NEUTRAL = new THREE.Color(0xd9d6ff);
const CORRECT = new THREE.Color(SCENE_COLORS.correct);
const WRONG = new THREE.Color(SCENE_COLORS.wrong);
const LANE_COLORS = SCENE_COLORS.gateLanes.map((c) => new THREE.Color(c));

export function createGates(scene, { gates, gateZ, curtainTexture }) {
    const disposables = [];
    const byIndex = new Map();
    for (const g of gates) byIndex.set(g.index, g);
    const gateCount = gates.length;

    // Çerçeve: 4 direk + üst kiriş (koyu metal) ve şerit renkli neon kenarlar.
    const fb = new GeoBuilder();
    for (const px of [-3.75, -1.25, 1.25, 3.75]) {
        fb.box(px, 2.7, 0, 0.32, 5.4, 0.46, 0x2a2245);
        fb.box(px, 0.1, 0, 0.6, 0.2, 0.7, 0x1c1730);
    }
    fb.box(0, 5.45, 0, 7.9, 0.32, 0.5, 0x2a2245);
    const frameGeo = fb.build();
    const lb = new GeoBuilder();
    for (let lane = 0; lane < 3; lane++) {
        const cx = laneX(lane);
        const col = SCENE_COLORS.gateLanes[lane];
        lb.box(cx - 1.06, OPEN_H / 2, 0.24, 0.07, OPEN_H, 0.04, col);
        lb.box(cx + 1.06, OPEN_H / 2, 0.24, 0.07, OPEN_H, 0.04, col);
        lb.box(cx, OPEN_H + 0.02, 0.24, 2.2, 0.07, 0.04, col);
    }
    lb.box(0, 5.62, 0.26, 7.9, 0.06, 0.04, 0xffffff);
    const neonGeo = lb.build();
    const frameMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const neonMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const panelGeo = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
    const curtainGeo = new THREE.PlaneGeometry(2.08, OPEN_H);
    disposables.push(frameGeo, neonGeo, frameMat, neonMat, panelGeo, curtainGeo);

    const fadeOpts = { transparent: true, depthWrite: false };
    const slots = [];
    for (let s = 0; s < 2; s++) {
        const group = new THREE.Group();
        const frame = new THREE.Mesh(frameGeo, frameMat);
        const neon = new THREE.Mesh(neonGeo, neonMat);
        const frameFade = new THREE.MeshLambertMaterial({ vertexColors: true, ...fadeOpts });
        const neonFade = new THREE.MeshBasicMaterial({ vertexColors: true, ...fadeOpts });
        const probe = new THREE.Group();
        probe.add(new THREE.Mesh(frameGeo, frameFade), new THREE.Mesh(neonGeo, neonFade));
        probe.visible = false;
        group.add(frame, neon, probe);
        disposables.push(frameFade, neonFade);
        const lanes = [];
        for (let lane = 0; lane < 3; lane++) {
            const panel = createGatePanel();
            const pmat = new THREE.MeshBasicMaterial({ map: panel.texture, transparent: true });
            const pmesh = new THREE.Mesh(panelGeo, pmat);
            pmesh.position.set(laneX(lane), OPEN_H + 0.12 + PANEL_H / 2, 0.3);
            const cmat = new THREE.MeshBasicMaterial({
                map: curtainTexture,
                color: LANE_COLORS[lane],
                transparent: true,
                opacity: 0.4,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            const cmesh = new THREE.Mesh(curtainGeo, cmat);
            cmesh.position.set(laneX(lane), OPEN_H / 2, 0);
            group.add(pmesh, cmesh);
            lanes.push({ panel, pmat, cmat, dirty: false });
            disposables.push(panel.texture, pmat, cmat);
        }
        group.visible = false;
        scene.add(group);
        slots.push({ group, frame, neon, frameFade, neonFade, lanes, gate: -1, flash: 0 });
    }

    // Kapı durumu: geçiş şeridi ve sonuç
    const crossed = new Map(); // index -> lane
    const results = new Map(); // index -> { correct, correctLane, t }

    return {
        crossed(index, lane) {
            crossed.set(index, lane);
        },
        result(index, correct, correctLane) {
            if (!results.has(index)) results.set(index, { correct, correctLane, t: 0 });
        },

        /**
         * pz: oyuncu z (mm); camZ: kameranın oyuncuya göre z'si (m, arkadaysa +).
         * Her karede en fazla bir panel çizer.
         */
        update(pz, dt, time, camZ = 0) {
            let drew = false;
            for (let s = 0; s < slots.length; s++) slots[s].used = false;
            if (gateCount > 0) {
                // Yakındaki kapılar: geride ≤ 30 m, önde ≤ 420 m.
                for (let k = 0; k < gateCount; k++) {
                    const gz = gateZ(k);
                    const ahead = (gz - pz) / 1000;
                    if (ahead < -SHOW_BEHIND_M) continue;
                    if (ahead > SHOW_AHEAD_M) break;
                    const slot = slots[k % 2];
                    slot.used = true;
                    if (slot.gate !== k) {
                        slot.gate = k;
                        for (const l of slot.lanes) l.dirty = true;
                    }
                    if (!drew) {
                        for (let lane = 0; lane < 3; lane++) {
                            const l = slot.lanes[lane];
                            if (!l.dirty) continue;
                            const g = byIndex.get(k);
                            const text = g && g.question && Array.isArray(g.question.options) ? g.question.options[lane] : '';
                            drawGatePanel(l.panel, { letter: LETTERS[lane], text, color: hexCss(SCENE_COLORS.gateLanes[lane]), lane });
                            l.dirty = false;
                            drew = true;
                            break;
                        }
                    }
                    // Paneller çizilmeden kapı görünmesin (boş panel parlamasın).
                    const ready = !slot.lanes[0].dirty && !slot.lanes[1].dirty && !slot.lanes[2].dirty;
                    slot.group.visible = ready && ahead < 190;
                    slot.group.position.set(0, 0, -ahead);
                    // Kameraya yakınken erime: çerçeve ≈ 5 m'den; paneller kamera
                    // yüksekliğinde durduğu için daha önce (oyuncuyu geçerken biter);
                    // perdeler en son (sonuç rengi bir an görünsün, ekranı kaplamasın).
                    const dc = ahead + camZ;
                    const frameOp = gateNearFade(dc);
                    const panelOp = Math.min(gateNearFade(dc, 6.5, 2), gateNearFade(ahead, 1, -1.5));
                    const curtainOp = gateNearFade(dc, 3.5, 0.8);
                    const fading = frameOp < 0.999;
                    slot.frame.material = fading ? slot.frameFade : frameMat;
                    slot.neon.material = fading ? slot.neonFade : neonMat;
                    slot.frameFade.opacity = frameOp;
                    slot.neonFade.opacity = frameOp;
                    slot.frame.visible = frameOp > 0.001;
                    slot.neon.visible = frameOp > 0.001;
                    const lane = crossed.has(k) ? crossed.get(k) : -1;
                    const res = results.get(k);
                    if (res) res.t += dt;
                    for (let i = 0; i < 3; i++) {
                        const cm = slot.lanes[i].cmat;
                        let op = 0.32 + 0.1 * Math.sin(time * 6 + i);
                        if (lane < 0) {
                            cm.color.copy(LANE_COLORS[i]);
                        } else if (!res) {
                            cm.color.copy(NEUTRAL);
                            op = 0.18 + 0.08 * Math.sin(time * 10);
                        } else {
                            const flash = Math.max(0, 1 - res.t / 1.2);
                            if (i === res.correctLane) {
                                _col.copy(CORRECT);
                                cm.color.copy(_col);
                                op = 0.45 + 0.5 * flash * (0.6 + 0.4 * Math.sin(res.t * 30));
                            } else if (i === lane && !res.correct) {
                                cm.color.copy(WRONG);
                                op = 0.35 + 0.55 * flash * (0.6 + 0.4 * Math.sin(res.t * 30));
                            } else {
                                cm.color.copy(NEUTRAL);
                                op = 0.08;
                            }
                        }
                        cm.opacity = op * curtainOp;
                        // Panel yakında hafif kararır ki oyuncunun önünü kapatmasın.
                        slot.lanes[i].pmat.opacity = Math.min(ahead < 6 ? Math.max(0.35, ahead / 6) : 1, panelOp);
                    }
                }
            }
            for (let s = 0; s < slots.length; s++) {
                if (!slots[s].used) slots[s].group.visible = false;
            }
            curtainTexture.offset.y = (time * 0.6) % 1;
        },

        dispose() {
            for (const s of slots) scene.remove(s.group);
            for (const d of disposables) d.dispose();
        },
    };
}

function hexCss(hex) {
    return `#${hex.toString(16).padStart(6, '0')}`;
}
