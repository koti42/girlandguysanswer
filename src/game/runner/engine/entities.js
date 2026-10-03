/*
 * Pist nesneleri: engeller (bariyer, tabela, dolmuş/kiosk), jetonlar ve
 * güçlendirmeler. Hepsi InstancedMesh: tür başına tek draw call.
 *
 * Her karede görünür chunk'lar sim'den okunur (sim.getChunk önbellekli)
 * ve örnek matrisleri yeniden yazılır. Render döngüsünde allocation yok:
 * geçici vektör/matrisler modül seviyesinde.
 */
import * as THREE from 'three';
import { GeoBuilder, createTemplates } from './geoBuilder.js';
import { hash32 } from './mathUtils.js';

const CHUNK_LEN = 30000;
const BEHIND_MM = 14000;
const AHEAD_MM = 165000;
const LITE_AHEAD_MM = 110000; // düşük kalite: sis yakın, ötesi zaten görünmez
// Düşük kalite: jetonlar en kalabalık çizim (≈ 60 örnek x 72 üçgen); daha az
// dilimli disk ve daha kısa görüş mesafesi (uzaktaki jeton zaten birkaç piksel).
const LITE_COIN_AHEAD_MM = 85000;
const COIN_SEGMENTS = 18;
const LITE_COIN_SEGMENTS = 10;
const CAP_BARRIER = 48;
const CAP_BAR = 48;
const CAP_BLOCK = 48;
const CAP_COIN = 220;
const CAP_FLY = 48;
const CAP_POWER = 4;
const DESTROY_ANIM_S = 0.9;

const VEHICLE_COLORS = [0xffc93c, 0xff6b6b, 0x2dd4bf, 0x8b5cf6, 0x38bdf8, 0xf472b6];
const KIOSK_COLORS = [0xff6b6b, 0x2dd4bf, 0xe2b94c, 0xa855f7];

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

export function laneX(lane) {
    return (lane - 1) * 2.5;
}

function makeInstanced(geo, mat, cap, withColor = false) {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (withColor) {
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    // Örnekler her kare taşınıyor; önbellekli sınır küresi bayatlar.
    m.frustumCulled = false;
    m.count = 0;
    return m;
}

export function createEntities(scene, tex) {
    const T = createTemplates();
    const disposables = [];
    const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    const blink = new THREE.MeshBasicMaterial({ color: 0xffa424 });
    disposables.push(lambert, glow, blink);

    // --- Bariyer: kırmızı-beyaz çizgili pano + ayaklar ---
    const bg = new GeoBuilder();
    const stripes = 7;
    const bw = 2.2;
    for (let i = 0; i < stripes; i++) {
        const sw = bw / stripes;
        bg.box(-bw / 2 + sw * (i + 0.5), 0.66, 0, sw, 0.36, 0.12, i % 2 ? 0xffffff : 0xff3b4a);
    }
    bg.box(0, 0.3, 0, bw - 0.3, 0.1, 0.08, 0xdddddd);
    for (const sx of [-0.95, 0.95]) {
        bg.box(sx, 0.42, 0, 0.1, 0.84, 0.1, 0xe8e8f0);
        bg.box(sx, 0.04, 0, 0.16, 0.08, 0.7, 0x2a2440);
    }
    const barrierGeo = bg.build();
    const barrier = makeInstanced(barrierGeo, lambert, CAP_BARRIER);
    const lampG = new GeoBuilder();
    lampG.add(T.sphere, 0xffffff, [-0.95, 0.92, 0], null, [0.08, 0.08, 0.08]);
    lampG.add(T.sphere, 0xffffff, [0.95, 0.92, 0], null, [0.08, 0.08, 0.08]);
    const barrierLampGeo = lampG.build();
    const barrierLamps = makeInstanced(barrierLampGeo, blink, CAP_BARRIER);
    disposables.push(barrierGeo, barrierLampGeo);

    // --- Yüksek tabela: direkler + neon "?" paneli ---
    const pg = new GeoBuilder();
    for (const sx of [-1.15, 1.15]) {
        pg.box(sx, 1.2, 0, 0.12, 2.4, 0.12, 0x2b2540);
        pg.box(sx, 0.05, 0, 0.3, 0.1, 0.4, 0x1f1a30);
    }
    pg.box(0, 2.38, 0, 2.42, 0.1, 0.16, 0x2b2540);
    pg.box(0, 1.7, 0.03, 2.24, 1.14, 0.06, 0x140b2e);
    const barPoleGeo = pg.build();
    const barPoles = makeInstanced(barPoleGeo, lambert, CAP_BAR);
    const barPanelGeo = new THREE.PlaneGeometry(2.16, 1.08);
    barPanelGeo.translate(0, 1.7, 0.07);
    const barPanelMat = new THREE.MeshBasicMaterial({ map: tex.sign });
    const barPanels = makeInstanced(barPanelGeo, barPanelMat, CAP_BAR);
    disposables.push(barPoleGeo, barPanelGeo, barPanelMat);

    // --- Dolmuş/tramvay gövdesi (z'de 1 m, ölçeklenir; şeritler uzayınca bozulmaz) ---
    const vg = new GeoBuilder();
    vg.box(0, 1.45, 0, 2.2, 2.1, 1, 0xffffff);
    vg.box(0, 0.42, 0, 2.1, 0.24, 1, 0x1c1828);
    vg.box(0, 1.9, 0, 2.24, 0.62, 1, 0x1b2440);
    vg.box(0, 1.16, 0, 2.24, 0.06, 1, 0x2a2440);
    vg.box(0, 2.56, 0, 1.9, 0.12, 1, 0xf2f2f2);
    const vehicleGeo = vg.build();
    const vehicles = makeInstanced(vehicleGeo, lambert, CAP_BLOCK, true);
    // Ön yüz (ölçeklenmez): cam, tampon, tekerlekler
    const fg = new GeoBuilder();
    fg.box(0, 1.95, 0.02, 2.0, 0.85, 0.06, 0x1b2a4a);
    fg.box(0, 0.62, 0.05, 2.24, 0.26, 0.1, 0x3a3550);
    fg.box(0, 2.62, -0.2, 1.4, 0.3, 0.3, 0x1a1430);
    for (const sx of [-1.02, 1.02]) {
        fg.add(T.cyl12, 0x111018, [sx, 0.42, -0.9], [0, 0, Math.PI / 2], [0.42, 0.24, 0.42]);
    }
    const vehicleFrontGeo = fg.build();
    const vehicleFronts = makeInstanced(vehicleFrontGeo, lambert, CAP_BLOCK, true);
    const wg = new GeoBuilder();
    for (const sx of [-1.02, 1.02]) wg.add(T.cyl12, 0x111018, [sx, 0.42, 0], [0, 0, Math.PI / 2], [0.42, 0.24, 0.42]);
    const wheelGeo = wg.build();
    const rearWheels = makeInstanced(wheelGeo, lambert, CAP_BLOCK);
    // Farlar + tepe tabelası (ışıyan)
    const lg = new GeoBuilder();
    for (const sx of [-0.78, 0.78]) {
        lg.box(sx, 0.86, 0.07, 0.42, 0.2, 0.04, 0xfff3c4);
    }
    lg.box(0, 2.62, -0.04, 1.2, 0.2, 0.02, 0xffffff);
    const vehicleGlowGeo = lg.build();
    const vehicleGlows = makeInstanced(vehicleGlowGeo, glow, CAP_BLOCK, true);
    disposables.push(vehicleGeo, vehicleFrontGeo, wheelGeo, vehicleGlowGeo);

    // --- Kiosk (kısa bloklar): 5 m taban, z'de ölçeklenir ---
    const kg = new GeoBuilder();
    kg.box(0, 1.35, 0, 2.2, 2.7, 5, 0xffffff);
    kg.box(0, 2.85, 0, 2.4, 0.3, 5.2, 0x2a2440);
    for (let i = 0; i < 6; i++) {
        kg.box(-1.05 + i * 0.42, 2.45, 2.75, 0.42, 0.14, 0.7, i % 2 ? 0xffffff : 0xff6b6b);
    }
    kg.box(0, 0.5, 2.52, 2.0, 0.9, 0.06, 0x3a3150);
    const kioskGeo = kg.build();
    const kiosks = makeInstanced(kioskGeo, lambert, CAP_BLOCK, true);
    const kgl = new GeoBuilder();
    kgl.box(0, 1.55, 2.52, 1.8, 0.9, 0.04, 0xffd9a0);
    kgl.box(0, 3.25, 0, 1.6, 0.5, 0.12, 0xffffff);
    const kioskGlowGeo = kgl.build();
    const kioskGlows = makeInstanced(kioskGlowGeo, glow, CAP_BLOCK, true);
    disposables.push(kioskGeo, kioskGlowGeo);

    // --- Jeton: dönen altın disk, iki yüzü "?" kabartmalı ---
    const coinGeo = buildCoin(COIN_SEGMENTS);
    const coinLiteGeo = buildCoin(LITE_COIN_SEGMENTS);
    const coinMat = new THREE.MeshLambertMaterial({ map: tex.coin, emissive: 0x6b4a10, emissiveIntensity: 1 });
    const coins = makeInstanced(coinGeo, coinMat, CAP_COIN + CAP_FLY);
    disposables.push(coinGeo, coinLiteGeo, coinMat);

    const instancedAll = [barrier, barrierLamps, barPoles, barPanels, vehicles, vehicleFronts, rearWheels, vehicleGlows, kiosks, kioskGlows, coins];
    for (const m of instancedAll) scene.add(m);

    // --- Güçlendirmeler (az sayıda; havuzlu gruplar) ---
    const magnetGeo = buildMagnet(T);
    const shieldGeo = buildShieldBadge(T);
    const ringGeo = new THREE.RingGeometry(0.55, 0.75, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringOpts = { transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide };
    const ringMagnet = new THREE.MeshBasicMaterial({ color: 0xff5a6a, ...ringOpts });
    const ringShield = new THREE.MeshBasicMaterial({ color: 0x5ad8ff, ...ringOpts });
    const orbMat = new THREE.MeshLambertMaterial({ color: 0x7fe7ff, emissive: 0x1a6a8a, transparent: true, opacity: 0.55, depthWrite: false });
    const orbGeo = new THREE.IcosahedronGeometry(0.62, 1);
    disposables.push(magnetGeo, shieldGeo, ringGeo, ringMagnet, ringShield, orbMat, orbGeo);
    const powerPool = [];
    for (let i = 0; i < CAP_POWER; i++) {
        const g = new THREE.Group();
        const magnet = new THREE.Mesh(magnetGeo, lambert);
        const badge = new THREE.Mesh(shieldGeo, lambert);
        const orb = new THREE.Mesh(orbGeo, orbMat);
        const ring = new THREE.Mesh(ringGeo, ringMagnet);
        ring.position.y = -0.85;
        g.add(magnet, badge, orb, ring);
        g.visible = false;
        scene.add(g);
        powerPool.push({ g, magnet, badge, orb, ring });
    }
    T.dispose();

    // Kalkanla yıkılan engellerin uçuş animasyonu
    const destroyed = [];
    for (let i = 0; i < 6; i++) destroyed.push({ id: -1, t: 0 });

    // Toplanan jetonların oyuncuya uçuşu (mıknatıs çekimi dahil)
    const fly = [];
    for (let i = 0; i < CAP_FLY; i++) fly.push({ active: false, x: 0, y: 0, z: 0, t: 0, dur: 0.2 });

    const counts = { barrier: 0, bar: 0, veh: 0, kiosk: 0, coin: 0, power: 0 };
    let aheadMm = AHEAD_MM;
    let coinAheadMm = AHEAD_MM;

    function destroyAnim(id) {
        for (let i = 0; i < destroyed.length; i++) if (destroyed[i].id === id) return destroyed[i];
        return null;
    }

    function placeObstacle(o, anim, pz, time, playerX) {
        const zNear = -(o.z0 - pz) / 1000;
        const zFar = -(o.z1 - pz) / 1000;
        const x = laneX(o.lane);
        let ox = 0;
        let oy = 0;
        let rx = 0;
        let rz = 0;
        let sc = 1;
        if (anim) {
            const t = anim.t / DESTROY_ANIM_S;
            ox = (hash32(o.id) & 1 ? 1 : -1) * t * 6;
            oy = t * 5 - t * t * 3;
            rx = -t * 4;
            rz = (hash32(o.id) & 1 ? -1 : 1) * t * 3;
            sc = 1 - t * 0.6;
        }
        // Oyuncunun geçtiği engel kamerayla arasına girip görüşü kapatmasın:
        // arka ucu oyuncuyu geçince hızla yere doğru küçülür. Yan şeritteki
        // uzun araçlar ise kamera arkasına kadar durur (pat diye kaybolmasın).
        const passed = zFar - 0.25;
        if (passed > 0 && (o.type !== 'block' || Math.abs(x - playerX) < 1.4)) {
            const k = passed / 1.1;
            if (k >= 1) return;
            sc *= 1 - k;
        }
        if (o.type === 'barrier') {
            if (counts.barrier >= CAP_BARRIER) return;
            const cz = (zNear + zFar) / 2;
            _p.set(x + ox, oy, cz);
            _e.set(rx, 0, rz);
            _q.setFromEuler(_e);
            _s.set(sc, sc, sc);
            _m.compose(_p, _q, _s);
            barrier.setMatrixAt(counts.barrier, _m);
            barrierLamps.setMatrixAt(counts.barrier, _m);
            counts.barrier++;
        } else if (o.type === 'bar') {
            if (counts.bar >= CAP_BAR) return;
            const cz = (zNear + zFar) / 2;
            _p.set(x + ox, oy, cz);
            _e.set(rx, 0, rz);
            _q.setFromEuler(_e);
            _s.set(sc, sc, sc);
            _m.compose(_p, _q, _s);
            barPoles.setMatrixAt(counts.bar, _m);
            barPanels.setMatrixAt(counts.bar, _m);
            counts.bar++;
        } else {
            const len = zNear - zFar;
            const h = hash32(o.id);
            if (len <= 6.01 && (h & 3) !== 0) {
                // Kiosk
                if (counts.kiosk >= CAP_BLOCK) return;
                _p.set(x + ox, oy, (zNear + zFar) / 2);
                _e.set(rx, 0, rz);
                _q.setFromEuler(_e);
                _s.set(sc, sc, (len / 5) * sc);
                _m.compose(_p, _q, _s);
                kiosks.setMatrixAt(counts.kiosk, _m);
                kioskGlows.setMatrixAt(counts.kiosk, _m);
                _c.set(KIOSK_COLORS[(h >>> 4) % KIOSK_COLORS.length]);
                kiosks.setColorAt(counts.kiosk, _c);
                // Tepe lambası yavaşça nefes alır
                _c.setScalar(0.75 + 0.25 * Math.sin(time * 3 + o.id));
                kioskGlows.setColorAt(counts.kiosk, _c);
                counts.kiosk++;
                return;
            }
            if (counts.veh >= CAP_BLOCK) return;
            _e.set(rx, 0, rz);
            _q.setFromEuler(_e);
            _p.set(x + ox, oy, (zNear + zFar) / 2);
            _s.set(sc, sc, Math.max(0.5, len - 0.1) * sc);
            _m.compose(_p, _q, _s);
            vehicles.setMatrixAt(counts.veh, _m);
            const col = VEHICLE_COLORS[(h >>> 4) % VEHICLE_COLORS.length];
            _c.set(col);
            vehicles.setColorAt(counts.veh, _c);
            vehicleFronts.setColorAt(counts.veh, _c);
            _p.set(x + ox, oy, zNear - 0.05);
            _s.set(sc, sc, sc);
            _m.compose(_p, _q, _s);
            vehicleFronts.setMatrixAt(counts.veh, _m);
            vehicleGlows.setMatrixAt(counts.veh, _m);
            _c.set(col).lerp(WHITE, 0.6);
            vehicleGlows.setColorAt(counts.veh, _c);
            _p.set(x + ox, oy, zFar + 1.0);
            _m.compose(_p, _q, _s);
            rearWheels.setMatrixAt(counts.veh, _m);
            counts.veh++;
        }
    }

    function placeCoin(cx, cy, cz, rotY, scale) {
        if (counts.coin >= CAP_COIN + CAP_FLY) return;
        _p.set(cx, cy, cz);
        _e.set(0, rotY, 0);
        _q.setFromEuler(_e);
        _s.set(scale, scale, scale);
        _m.compose(_p, _q, _s);
        coins.setMatrixAt(counts.coin, _m);
        counts.coin++;
    }

    return {
        /** Düşük kalite kademesi: daha kısa görüş mesafesi. */
        setLite(on) {
            aheadMm = on ? LITE_AHEAD_MM : AHEAD_MM;
            coinAheadMm = on ? LITE_COIN_AHEAD_MM : AHEAD_MM;
            coins.geometry = on ? coinLiteGeo : coinGeo;
        },

        /** Jeton toplandı: oyuncuya doğru uçur. */
        collectCoin(sim, id, pz) {
            const ch = sim.getChunk(Math.floor(id / 256));
            const c = ch ? findById(ch.coins, id) : null;
            if (!c) return;
            for (let i = 0; i < fly.length; i++) {
                const f = fly[i];
                if (f.active) continue;
                f.active = true;
                f.x = laneX(c.lane);
                f.y = c.y / 1000;
                f.z = c.z / 1000; // dünya metresi
                f.t = 0;
                // Uzaktaki (mıknatısla çekilen) jeton daha uzun uçar.
                f.dur = Math.min(0.45, 0.12 + Math.abs(c.z - pz) / 1000 / 22);
                return;
            }
        },

        obstacleDestroyed(id) {
            let slot = destroyed[0];
            for (let i = 0; i < destroyed.length; i++) {
                if (destroyed[i].id === -1) {
                    slot = destroyed[i];
                    break;
                }
                if (destroyed[i].t > slot.t) slot = destroyed[i];
            }
            slot.id = id;
            slot.t = 0;
        },

        /**
         * pz: oyuncu z (mm, interpolasyonlu); player: {x, y} render metre; onCoinArrive: parıltı için.
         */
        update(sim, pz, dt, time, player, onCoinArrive) {
            counts.barrier = 0;
            counts.bar = 0;
            counts.veh = 0;
            counts.kiosk = 0;
            counts.coin = 0;
            counts.power = 0;
            for (let i = 0; i < destroyed.length; i++) {
                const d = destroyed[i];
                if (d.id === -1) continue;
                d.t += dt;
                if (d.t > DESTROY_ANIM_S) d.id = -1;
            }

            const c0 = Math.max(0, Math.floor((pz - BEHIND_MM) / CHUNK_LEN));
            const c1 = Math.floor((pz + aheadMm) / CHUNK_LEN);
            const minZ = pz - BEHIND_MM;
            const maxZ = pz + aheadMm;
            const coinMaxZ = pz + coinAheadMm;
            const spin = time * 3.2;
            for (let c = c0; c <= c1; c++) {
                const ch = sim.getChunk(c);
                if (!ch) continue;
                const obs = ch.obstacles;
                for (let i = 0; i < obs.length; i++) {
                    const o = obs[i];
                    if (o.z1 < minZ || o.z0 > maxZ) continue;
                    // Sim nesnelerine yazılmaz; yıkım animasyonu ayrı tabloda.
                    let anim = null;
                    if (sim.isDestroyed(o.id)) {
                        anim = destroyAnim(o.id);
                        if (!anim) continue;
                    }
                    placeObstacle(o, anim, pz, time, player.x);
                }
                const cs = ch.coins;
                for (let i = 0; i < cs.length; i++) {
                    const k = cs[i];
                    if (k.taken || k.z < minZ || k.z > coinMaxZ) continue;
                    const rz = -(k.z - pz) / 1000;
                    placeCoin(laneX(k.lane), k.y / 1000 + Math.sin(time * 4 + k.z * 0.0004) * 0.07, rz, spin + k.z * 0.00035, 1);
                }
                const ps = ch.powers;
                for (let i = 0; i < ps.length; i++) {
                    const pw = ps[i];
                    if (pw.taken || pw.z < minZ || pw.z > maxZ || counts.power >= CAP_POWER) continue;
                    const slot = powerPool[counts.power++];
                    slot.g.visible = true;
                    slot.g.position.set(laneX(pw.lane), pw.y / 1000 + 0.35 + Math.sin(time * 3) * 0.12, -(pw.z - pz) / 1000);
                    const isMagnet = pw.kind === 'magnet';
                    slot.magnet.visible = isMagnet;
                    slot.badge.visible = !isMagnet;
                    slot.orb.visible = !isMagnet;
                    slot.magnet.rotation.y = time * 2.4;
                    slot.badge.rotation.y = time * 2.4;
                    slot.orb.rotation.y = -time * 0.8;
                    const pulse = 1 + Math.sin(time * 5) * 0.12;
                    slot.ring.scale.set(pulse, pulse, pulse);
                    slot.ring.material = isMagnet ? ringMagnet : ringShield;
                }
            }
            for (let i = counts.power; i < CAP_POWER; i++) powerPool[i].g.visible = false;

            // Uçan jetonlar: oyuncunun göğsüne doğru, küçülerek
            const pzM = pz / 1000;
            for (let i = 0; i < fly.length; i++) {
                const f = fly[i];
                if (!f.active) continue;
                f.t += dt;
                const t = Math.min(1, f.t / f.dur);
                const e = t * t;
                const sx = f.x;
                const sy = f.y;
                const sz = -(f.z - pzM);
                const x = sx + (player.x - sx) * e;
                const y = sy + (player.y + 1.0 - sy) * e + Math.sin(t * Math.PI) * 0.6;
                const z = sz + (0 - sz) * e;
                placeCoin(x, y, z, spin * 2, 1 - t * 0.6);
                if (t >= 1) {
                    f.active = false;
                    onCoinArrive?.(player.x, player.y + 1.0);
                }
            }

            barrier.count = counts.barrier;
            barrierLamps.count = counts.barrier;
            barPoles.count = counts.bar;
            barPanels.count = counts.bar;
            vehicles.count = counts.veh;
            vehicleFronts.count = counts.veh;
            vehicleGlows.count = counts.veh;
            rearWheels.count = counts.veh;
            kiosks.count = counts.kiosk;
            kioskGlows.count = counts.kiosk;
            coins.count = counts.coin;
            for (let i = 0; i < instancedAll.length; i++) {
                const m = instancedAll[i];
                m.instanceMatrix.needsUpdate = true;
                if (m.instanceColor) m.instanceColor.needsUpdate = true;
            }
            // Bariyer lambaları senkron yanıp söner
            blink.color.setHex(Math.sin(time * 7) > 0 ? 0xffb030 : 0x4a2a08);
        },

        stats() {
            return counts;
        },

        dispose() {
            for (const m of instancedAll) {
                scene.remove(m);
                m.dispose();
            }
            for (const p of powerPool) scene.remove(p.g);
            for (const d of disposables) d.dispose();
        },
    };
}

const WHITE = new THREE.Color(0xffffff);

/** Jeton diski (z eksenine dik); yan yüzün UV'si dokunun kenar (koyu altın) bölgesine. */
function buildCoin(segments) {
    const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.09, segments, 1);
    geo.rotateX(Math.PI / 2);
    const uv = geo.attributes.uv;
    const side = geo.groups[0];
    for (let i = side.start; i < side.start + side.count; i++) {
        uv.setXY(geo.index.getX(i), 0.03, 0.5);
    }
    return geo;
}

function findById(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
}

/** Mıknatıs: kırmızı at nalı + gümüş uçlar. */
function buildMagnet(T) {
    const g = new GeoBuilder();
    const half = new THREE.TorusGeometry(0.32, 0.12, 8, 14, Math.PI);
    g.add(half, 0xff3b4a, [0, 0.05, 0], [0, 0, 0]);
    g.add(T.cyl, 0xff3b4a, [-0.32, -0.12, 0], null, [0.12, 0.34, 0.12]);
    g.add(T.cyl, 0xff3b4a, [0.32, -0.12, 0], null, [0.12, 0.34, 0.12]);
    g.add(T.cyl, 0xe8eef8, [-0.32, -0.38, 0], null, [0.125, 0.2, 0.125]);
    g.add(T.cyl, 0xe8eef8, [0.32, -0.38, 0], null, [0.125, 0.2, 0.125]);
    half.dispose();
    return g.build();
}

/** Kalkan rozeti: altın çerçeveli mavi kalkan. */
function buildShieldBadge(T) {
    const g = new GeoBuilder();
    g.add(T.cyl, 0xffd34d, [0, 0, 0], [Math.PI / 2, 0, 0], [0.36, 0.08, 0.42]);
    g.add(T.cyl, 0x2f7bff, [0, 0, 0], [Math.PI / 2, 0, 0], [0.29, 0.1, 0.34]);
    g.add(T.cone, 0x2f7bff, [0, -0.38, 0], [Math.PI, 0, 0], [0.29, 0.3, 0.1]);
    g.box(0, 0.02, 0.06, 0.08, 0.36, 0.02, 0xffffff);
    g.box(0, 0.08, 0.06, 0.3, 0.08, 0.02, 0xffffff);
    return g.build();
}
