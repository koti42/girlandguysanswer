/*
 * Cadde: kayan ıslak yol dokusu, geri dönüşümlü 40 m'lik sokak segmentleri
 * (binalar, cumbalar, kaldırım eşyaları, neon tabelalar), tüneller ve
 * ucuz "bloom" haleleri.
 *
 * Her segment 3 draw call: dokulu binalar, köşe renkli eşyalar ve ışıyan
 * parçalar (lamba, vitrin, neon). Segment geometrileri kurulumda birkaç
 * çeşit olarak üretilir; ekrandaki yuvalar yalnızca geometri referansını
 * ve konumunu değiştirir (render döngüsünde yeni nesne yok).
 *
 * Tüneller (şartname §A.6, yalnızca görsel): sim.tunnelAt(c) olan 30 m'lik
 * chunk'larda cadde kemerli bir tünele döner: neon şeritli duvarlar, tavan
 * lambaları, giriş/çıkış kemerleri. Tünel parçaları InstancedMesh (en fazla
 * 5 draw call, yalnızca görünürken). Tünele değen segmentlerin kaldırım
 * eşyaları (lamba, ağaç) çizilmez; tünel duvarı onların yerini alır.
 *
 * Konumlar oyuncuya göre göreli: segment s'nin render z'si = -(s*40 - oyuncuZ).
 *
 * Düşük kalite kademesinde (setLite) haleler ve ıslak yol parlaması kapanır,
 * kaldırım eşyaları yalnızca yakında çizilir ve sis yakınlaştığı için
 * (bkz. stage.js) onun ötesindeki segmentler çizilmez.
 */
import * as THREE from 'three';
import { GeoBuilder, createTemplates, FIXED_UV } from './geoBuilder.js';
import { ROAD_HALF_W, ROAD_TILE_M } from './textures.js';
import { fract, hash32, seededRandom } from './mathUtils.js';
import { createHaloMaterial, setHaloPixelScale, HALO_MAX_PX, LITE_HALO_MAX_PX } from './halo.js';

export const SEG_LEN = 40;
const VARIANTS = 8;
const BEHIND_M = 24;
const AHEAD_M = 190;
const SLOTS = Math.ceil((BEHIND_M + AHEAD_M) / SEG_LEN) + 1;
const ROAD_LEN = BEHIND_M + AHEAD_M;
const LAMPS_PER_SEG = 4;
const NEON_HALOS_PER_SEG = 8;
const LITE_AHEAD_M = 110;
// Düşük kalitede kaldırım eşyaları (ağaç, tente, vitrin içi...) yalnızca yakında çizilir;
// uzaktakiler zaten siste birkaç piksel.
const LITE_PROPS_M = 65;

// Tünel ölçüleri (m)
const CHUNK_M = 30;
const TUNNEL_W = 5.8; // iç duvar x
const TUNNEL_WALL_H = 5.0;
const TUNNEL_ARCH_H = 2.6; // tepe = 7.6 m (çatıda süper zıplama sığar)
const TUNNEL_SLOTS = 6;
const TUNNEL_LIGHT_STEP = 5;
const TUNNEL_HALOS = TUNNEL_SLOTS * (CHUNK_M / TUNNEL_LIGHT_STEP);

const BUILDING_TINTS = [0x6c5a9e, 0x8a5a8c, 0x4f6a9a, 0x9a6a6a, 0x5d7d8f, 0x7a6ab0, 0xa07a8e, 0x55558a];
const NEON = [0xff4fa3, 0x38bdf8, 0xa855f7, 0xffd34d, 0x34f5c5, 0xff6b6b];
const AWNING = [0xff6b6b, 0xe2b94c, 0x2dd4bf, 0x8b5cf6, 0xf472b6];
const SHOP = [0xffc27a, 0xff9fd0, 0x9ae6ff, 0xffe2a8];
const FOLIAGE = [0x1f7a6d, 0x2a8f6a, 0xff8fb8, 0x1d6b78];
const ROOF_TILE = 0xb5543c;

const _hc = new THREE.Color();

export function createWorld(scene, tex, glowTexture) {
    const T = createTemplates();
    const disposables = [];

    // --- Malzemeler (tüm segmentler paylaşır) ---
    const buildingMat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        map: tex.window.map,
        emissiveMap: tex.window.emissive,
        emissive: 0xffffff,
        emissiveIntensity: 1.15,
    });
    const propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    disposables.push(buildingMat, propMat, glowMat);

    // --- Segment çeşitleri ---
    const variants = [];
    for (let v = 0; v < VARIANTS; v++) {
        const parts = buildSegment(v, T);
        variants.push(parts);
        disposables.push(parts.buildings, parts.props, parts.glow);
    }

    // --- Yuvalar ---
    const slots = [];
    for (let i = 0; i < SLOTS; i++) {
        const g = new THREE.Group();
        const b = new THREE.Mesh(variants[0].buildings, buildingMat);
        const p = new THREE.Mesh(variants[0].props, propMat);
        const l = new THREE.Mesh(variants[0].glow, glowMat);
        // Segmentin sınır küresi z'de 40 m; ufuk ötesi silme doğru çalışsın.
        g.add(b, p, l);
        scene.add(g);
        slots.push({ group: g, b, p, l, seg: -9999, variant: 0, tunnel: false });
    }

    // --- Yol ---
    const roadTex = tex.road;
    roadTex.repeat.set(1, ROAD_LEN / ROAD_TILE_M);
    const roadGeo = new THREE.PlaneGeometry(ROAD_HALF_W * 2, ROAD_LEN);
    roadGeo.rotateX(-Math.PI / 2);
    const roadMat = new THREE.MeshBasicMaterial({ map: roadTex, color: 0xd8cff0 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.position.set(0, 0, -(ROAD_LEN / 2 - BEHIND_M));
    road.frustumCulled = false;
    scene.add(road);
    disposables.push(roadGeo, roadMat);

    // Islak yol parlaması: uzağa doğru artan, ufuk rengini yansıtan toplamalı bant.
    const sheenGeo = new THREE.PlaneGeometry(8.4, 150);
    sheenGeo.rotateX(-Math.PI / 2);
    const sheenMat = new THREE.MeshBasicMaterial({
        map: tex.sheen,
        color: 0xff6b9e,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
    });
    const sheen = new THREE.Mesh(sheenGeo, sheenMat);
    sheen.position.set(0, 0.012, -(75 + 4));
    sheen.frustumCulled = false;
    sheen.renderOrder = 1;
    scene.add(sheen);
    disposables.push(sheenGeo, sheenMat);

    // Binaların arasından boşluk görünmesin diye geniş koyu zemin.
    const groundGeo = new THREE.PlaneGeometry(160, ROAD_LEN);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x241634 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(0, -0.05, road.position.z);
    ground.frustumCulled = false;
    scene.add(ground);
    disposables.push(groundGeo, groundMat);

    // --- Tüneller ---
    const tunnel = buildTunnel(T);
    disposables.push(tunnel.body, tunnel.glow, tunnel.portal, tunnel.portalGlow, tunnel.plate);
    const tunnelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const plateMat = new THREE.MeshBasicMaterial({ map: tex.banner, transparent: true });
    disposables.push(tunnelMat, plateMat);
    const mkInst = (geo, mat, cap) => {
        const m = new THREE.InstancedMesh(geo, mat, cap);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        m.count = 0;
        m.visible = false;
        scene.add(m);
        return m;
    };
    const tBody = mkInst(tunnel.body, tunnelMat, TUNNEL_SLOTS);
    const tGlow = mkInst(tunnel.glow, glowMat, TUNNEL_SLOTS);
    const pBody = mkInst(tunnel.portal, tunnelMat, 2);
    const pGlow = mkInst(tunnel.portalGlow, glowMat, 2);
    const pPlate = mkInst(tunnel.plate, plateMat, 2);
    const tunnelMeshes = [tBody, tGlow, pBody, pGlow, pPlate];
    T.dispose();

    // --- Haleler (tek Points, her kare konum güncellenir) ---
    const haloCount = SLOTS * (LAMPS_PER_SEG + NEON_HALOS_PER_SEG) + TUNNEL_HALOS;
    const haloPos = new Float32Array(haloCount * 3);
    const haloCol = new Float32Array(haloCount * 3);
    const haloGeo = new THREE.BufferGeometry();
    const haloPosAttr = new THREE.BufferAttribute(haloPos, 3).setUsage(THREE.DynamicDrawUsage);
    const haloColAttr = new THREE.BufferAttribute(haloCol, 3).setUsage(THREE.DynamicDrawUsage);
    haloGeo.setAttribute('position', haloPosAttr);
    haloGeo.setAttribute('color', haloColAttr);
    // Boyut v1'deki PointsMaterial (4.2) ile aynı görünsün: 4.2 * tan(30°).
    const haloMat = createHaloMaterial({ map: glowTexture, size: 2.45 });
    const halos = new THREE.Points(haloGeo, haloMat);
    halos.frustumCulled = false;
    scene.add(halos);
    disposables.push(haloGeo, haloMat);
    const haloColor = new THREE.Color(0xffb070);
    const tunnelHaloBase = SLOTS * (LAMPS_PER_SEG + NEON_HALOS_PER_SEG);
    const tunnelHaloColor = new THREE.Color(0xfff0d8);

    // --- Başlangıç kemeri: "HERKESLER KOŞUYOR" pankartı (dünya z = 14 m) ---
    // Pankartın alt kenarı (5.3 m) dikey ekran kamerasının yüksekliğinin (4.4 m,
    // cameraFraming PORTRAIT) üstünde: kamera kemerin altından geçer, içinden değil.
    const ab = new GeoBuilder();
    for (const px of [-4.6, 4.6]) {
        ab.box(px, 3.6, 0, 0.4, 7.2, 0.4, 0x2a2245);
        ab.box(px, 0.15, 0, 0.8, 0.3, 0.8, 0x1c1730);
    }
    ab.box(0, 7.1, 0, 9.6, 0.3, 0.3, 0x2a2245);
    const archGeo = ab.build();
    const archGlowB = new GeoBuilder();
    for (const px of [-4.38, 4.38]) archGlowB.box(px, 3.6, 0.05, 0.05, 7.0, 0.3, 0xff6b6b);
    const archGlowGeo = archGlowB.build();
    const bannerGeo = new THREE.PlaneGeometry(8.6, 1.61);
    const bannerMat = new THREE.MeshBasicMaterial({ map: tex.banner, transparent: true });
    const arch = new THREE.Group();
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 6.1, 0.25);
    arch.add(new THREE.Mesh(archGeo, propMat), new THREE.Mesh(archGlowGeo, glowMat), banner);
    scene.add(arch);
    disposables.push(archGeo, archGlowGeo, bannerGeo, bannerMat);

    let aheadM = AHEAD_M;
    let lite = false;
    let haloK = 1;
    const _m = new THREE.Matrix4();
    const _rot = new THREE.Matrix4().makeRotationY(Math.PI);

    function segTouchesTunnel(s, isTunnel) {
        const z0 = s * SEG_LEN;
        const c0 = Math.floor(z0 / CHUNK_M);
        const c1 = Math.floor((z0 + SEG_LEN - 0.001) / CHUNK_M);
        for (let c = c0; c <= c1; c++) if (c >= 0 && isTunnel(c)) return true;
        return false;
    }

    function updateTunnels(pzM, isTunnel) {
        let n = 0;
        let portals = 0;
        const cFirst = Math.max(0, Math.floor((pzM - BEHIND_M) / CHUNK_M));
        const cLast = Math.floor((pzM + aheadM) / CHUNK_M);
        let h = 0;
        for (let c = cFirst; c <= cLast; c++) {
            if (!isTunnel(c)) continue;
            const z = -(c * CHUNK_M - pzM);
            if (n < TUNNEL_SLOTS) {
                _m.makeTranslation(0, 0, z);
                tBody.setMatrixAt(n, _m);
                tGlow.setMatrixAt(n, _m);
                n++;
                // Tavan lambası haleleri
                for (let k = 0; k < CHUNK_M / TUNNEL_LIGHT_STEP; k++) {
                    const lz = z - 2.5 - k * TUNNEL_LIGHT_STEP;
                    const dist = -lz;
                    const fade = dist < -6 ? 0 : (1 - Math.min(1, Math.max(0, (dist - 20) / 60))) * haloK;
                    const i = tunnelHaloBase + h++;
                    haloPos[i * 3] = 0;
                    haloPos[i * 3 + 1] = TUNNEL_WALL_H + TUNNEL_ARCH_H - 0.25;
                    haloPos[i * 3 + 2] = lz;
                    haloCol[i * 3] = tunnelHaloColor.r * fade * 0.6;
                    haloCol[i * 3 + 1] = tunnelHaloColor.g * fade * 0.6;
                    haloCol[i * 3 + 2] = tunnelHaloColor.b * fade * 0.6;
                }
            }
            // Giriş kemeri (önceki chunk tünel değilse) ve çıkış kemeri.
            if (portals < 2 && (c === 0 || !isTunnel(c - 1))) {
                _m.makeTranslation(0, 0, z);
                pBody.setMatrixAt(portals, _m);
                pGlow.setMatrixAt(portals, _m);
                pPlate.setMatrixAt(portals, _m);
                portals++;
            }
            if (portals < 2 && !isTunnel(c + 1)) {
                _m.makeTranslation(0, 0, z - CHUNK_M).multiply(_rot);
                pBody.setMatrixAt(portals, _m);
                pGlow.setMatrixAt(portals, _m);
                pPlate.setMatrixAt(portals, _m);
                portals++;
            }
        }
        for (let i = tunnelHaloBase + h; i < tunnelHaloBase + TUNNEL_HALOS; i++) {
            haloCol[i * 3] = 0;
            haloCol[i * 3 + 1] = 0;
            haloCol[i * 3 + 2] = 0;
        }
        tBody.count = n;
        tGlow.count = n;
        pBody.count = portals;
        pGlow.count = portals;
        pPlate.count = portals;
        for (const m of tunnelMeshes) {
            m.visible = m.count > 0;
            if (m.count > 0) m.instanceMatrix.needsUpdate = true;
        }
    }
    return {
        /** Düşük kalite kademesi: hale/parlama yok, görüş mesafesi kısa. */
        setLite(on) {
            lite = Boolean(on);
            halos.visible = !on;
            haloMat.uniforms.uMaxSize.value = on ? LITE_HALO_MAX_PX : HALO_MAX_PX;
            sheen.visible = !on;
            aheadM = on ? LITE_AHEAD_M : AHEAD_M;
        },
        /**
         * Ortam: windows = pencere ışık şiddeti, road = yol parlaklık çarpanı,
         * horizon = ufuk rengi (ıslak yol yansıması), night = 0..1, tunnel = 0..1.
         */
        setAmbience(windows, roadK, horizon, night, tunnelK) {
            buildingMat.emissiveIntensity = windows;
            roadMat.color.setRGB(0.85 * roadK, 0.81 * roadK, 0.94 * roadK);
            sheenMat.color.copy(horizon);
            sheenMat.opacity = (0.18 + 0.16 * night) * (1 - tunnelK * 0.8);
            haloK = 0.55 + 0.45 * night;
            groundMat.color.setRGB(0.14 * roadK, 0.086 * roadK, 0.2 * roadK);
        },
        /** pzM: oyuncunun dünya z'si (metre, ondalıklı); isTunnel(c): chunk tünel mi. */
        update(pzM, isTunnel = noTunnel) {
            roadTex.offset.y = fract(pzM / ROAD_TILE_M);
            arch.visible = pzM < 14 + 12;
            arch.position.z = -(14 - pzM);
            const first = Math.floor((pzM - BEHIND_M) / SEG_LEN);
            let h = 0;
            for (let i = 0; i < SLOTS; i++) {
                const s = first + i;
                const slot = slots[i];
                if (slot.seg !== s) {
                    slot.seg = s;
                    slot.variant = hash32(s) % VARIANTS;
                    const v = variants[slot.variant];
                    slot.b.geometry = v.buildings;
                    slot.p.geometry = v.props;
                    slot.l.geometry = v.glow;
                    slot.tunnel = segTouchesTunnel(s, isTunnel);
                }
                const z = -(s * SEG_LEN - pzM);
                slot.group.position.z = z;
                slot.p.visible = !slot.tunnel && (!lite || -z < LITE_PROPS_M);
                // Segmentin yakın ucu görüş mesafesinin ötesindeyse çizme.
                slot.group.visible = -z < aheadM;
                // Haleler: lambalar sol z=0/20, sağ z=10/30 (segment içi).
                for (let k = 0; k < LAMPS_PER_SEG; k++) {
                    const side = k < 2 ? -1 : 1;
                    const lz = z - (k % 2) * 20 - (side > 0 ? 10 : 0);
                    const dist = -lz;
                    // Sisli uzakta haleler parlak kalıp ufukta yığılmasın (haleler sis kullanmıyor).
                    const fade = slot.tunnel || dist < -6 ? 0 : (1 - Math.min(1, Math.max(0, (dist - 35) / 85))) * haloK;
                    haloPos[h * 3] = side * 3.45;
                    haloPos[h * 3 + 1] = 5.25;
                    haloPos[h * 3 + 2] = lz;
                    haloCol[h * 3] = haloColor.r * fade;
                    haloCol[h * 3 + 1] = haloColor.g * fade;
                    haloCol[h * 3 + 2] = haloColor.b * fade;
                    h++;
                }
                // Neon tabela haleleri (segment çeşidine kayıtlı konumlar)
                const nh = variants[slot.variant].halos;
                for (let k = 0; k < NEON_HALOS_PER_SEG; k++) {
                    let fade = 0;
                    if (k * 6 < nh.length) {
                        const lz = z + nh[k * 6 + 2];
                        const dist = -lz;
                        fade = dist < -4 ? 0 : (1 - Math.min(1, Math.max(0, (dist - 25) / 80))) * haloK * 0.7;
                        haloPos[h * 3] = nh[k * 6];
                        haloPos[h * 3 + 1] = nh[k * 6 + 1];
                        haloPos[h * 3 + 2] = lz;
                    }
                    haloCol[h * 3] = (k * 6 < nh.length ? nh[k * 6 + 3] : 0) * fade;
                    haloCol[h * 3 + 1] = (k * 6 < nh.length ? nh[k * 6 + 4] : 0) * fade;
                    haloCol[h * 3 + 2] = (k * 6 < nh.length ? nh[k * 6 + 5] : 0) * fade;
                    h++;
                }
            }
            updateTunnels(pzM, isTunnel);
            if (!lite) {
                haloPosAttr.needsUpdate = true;
                haloColAttr.needsUpdate = true;
            }
        },
        setPixelScale(heightPx, fovDeg) {
            setHaloPixelScale(haloMat, heightPx, fovDeg);
        },
        dispose() {
            for (const slot of slots) scene.remove(slot.group);
            for (const m of tunnelMeshes) {
                scene.remove(m);
                m.dispose();
            }
            scene.remove(road, sheen, ground, halos, arch);
            for (const d of disposables) d.dispose();
        },
    };
}

function noTunnel() {
    return false;
}

/*
 * Tünel parçaları (yerel z: 0 = chunk başı, -30 = chunk sonu).
 * Kesit: dik duvar (5 m) + eliptik kemer (tepe 7.6 m). Yüzeyler içe bakar.
 */
function tunnelProfile(inset = 0) {
    const pts = [];
    const w = TUNNEL_W - inset;
    pts.push([-w, 0]);
    pts.push([-w, TUNNEL_WALL_H]);
    const n = 10;
    for (let i = 1; i < n; i++) {
        const a = Math.PI - (i / n) * Math.PI;
        pts.push([Math.cos(a) * w, TUNNEL_WALL_H + Math.sin(a) * (TUNNEL_ARCH_H - inset)]);
    }
    pts.push([w, TUNNEL_WALL_H]);
    pts.push([w, 0]);
    return pts;
}

/** Profil boyunca z0..z1 içe bakan yüzey (renk: y'ye göre fn). */
function addTube(B, profile, z0, z1, colorFn) {
    const c = new THREE.Color();
    for (let i = 0; i < profile.length - 1; i++) {
        const [x0, y0] = profile[i];
        const [x1, y1] = profile[i + 1];
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dy / len;
        const ny = -dx / len;
        c.set(colorFn((y0 + y1) / 2));
        const base = B.vertexCount;
        const quad = [[x0, y0, z0], [x1, y1, z0], [x1, y1, z1], [x0, y0, z1]];
        for (const q of quad) {
            B.pos.push(q[0], q[1], q[2]);
            B.nor.push(nx, ny, 0);
            B.uv.push(FIXED_UV[0], FIXED_UV[1]);
            B.col.push(c.r, c.g, c.b);
        }
        B.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
}

function buildTunnel(T) {
    const L = CHUNK_M;
    const body = new GeoBuilder();
    const wallColor = (y) => (y < 2.4 ? 0xece4da : (y < 2.8 ? 0x22b8b8 : 0x4a4466));
    addTube(body, tunnelProfile(0), 0, -L, wallColor);
    // Kaburgalar: 5 m'de bir içe çıkıntılı halka
    const ribColor = () => 0x2a2440;
    for (let k = 0; k < L / TUNNEL_LIGHT_STEP; k++) {
        const z = -k * TUNNEL_LIGHT_STEP - 0.2;
        addTube(body, tunnelProfile(0.22), z + 0.2, z - 0.2, ribColor);
    }
    // İç kaldırımlar, korkuluk, karo bant çizgileri
    for (const sx of [-1, 1]) {
        body.box(sx * (4.42 + (TUNNEL_W - 4.42) / 2), 0.08, -L / 2, TUNNEL_W - 4.42, 0.16, L, 0x8f86a8);
        body.box(sx * 4.42, 0.08, -L / 2, 0.24, 0.16, L, 0xb9b0d6);
        body.box(sx * (TUNNEL_W - 0.15), 0.95, -L / 2, 0.08, 0.08, L, 0x9a94b0);
        for (let k = 0; k < L / 2.5; k++) body.box(sx * (TUNNEL_W - 0.15), 0.5, -k * 2.5 - 1.25, 0.06, 0.9, 0.06, 0x6a6480);
        for (const y of [0.6, 1.2, 1.8]) body.box(sx * (TUNNEL_W - 0.01), y, -L / 2, 0.02, 0.025, L, 0xb7ada4);
    }
    const glow = new GeoBuilder();
    // Neon şeritler (kemer omuzlarında, iki renk) + duvar dibi kehribar ışıklar
    const a = (35 * Math.PI) / 180;
    const sxN = Math.cos(a) * (TUNNEL_W - 0.12);
    const syN = TUNNEL_WALL_H + Math.sin(a) * (TUNNEL_ARCH_H - 0.12);
    glow.box(-sxN, syN, -L / 2, 0.08, 0.08, L, 0x38e8ff);
    glow.box(sxN, syN, -L / 2, 0.08, 0.08, L, 0xff4fd8);
    for (const sx of [-1, 1]) {
        glow.box(sx * (TUNNEL_W - 0.02), TUNNEL_WALL_H - 0.2, -L / 2, 0.03, 0.06, L, sx < 0 ? 0x7ff6ff : 0xff8ae6);
        for (let k = 0; k < L / 2; k++) glow.box(sx * (TUNNEL_W - 0.03), 0.3, -k * 2 - 1, 0.03, 0.08, 0.3, 0xffb347);
    }
    // Tavan lamba panelleri
    for (let k = 0; k < L / TUNNEL_LIGHT_STEP; k++) {
        glow.box(0, TUNNEL_WALL_H + TUNNEL_ARCH_H - 0.08, -2.5 - k * TUNNEL_LIGHT_STEP, 1.6, 0.05, 0.4, 0xfff0d8);
    }

    // Kemer cephesi: delikli dikdörtgen (kemer biçimli ağız), 1.4 m kalınlık.
    const shape = new THREE.Shape();
    shape.moveTo(-17, 0);
    shape.lineTo(17, 0);
    shape.lineTo(17, 13);
    shape.lineTo(-17, 13);
    shape.lineTo(-17, 0);
    const hole = new THREE.Path();
    const prof = tunnelProfile(-0.05);
    hole.moveTo(prof[0][0], prof[0][1]);
    for (let i = 1; i < prof.length; i++) hole.lineTo(prof[i][0], prof[i][1]);
    hole.lineTo(prof[0][0], prof[0][1]);
    shape.holes.push(hole);
    const ext = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false, curveSegments: 4 });
    // Ekstrüzyon +z'ye; cephe ön yüzü z = 0'da kalsın diye -1.4 kaydır.
    ext.translate(0, 0, -1.4);
    const portal = new GeoBuilder();
    portal.add(ext, 0x6d5a7a);
    ext.dispose();
    // Taş sıraları, korniş, İznik esintili karo bant
    // Taş sıraları kemer ağzını kesmesin: yanlarda iki parça, kemer üstünde tam boy.
    const open = TUNNEL_W + 0.95;
    for (let r = 0; r < 6; r++) {
        const y = 1.2 + r * 1.7;
        if (y > TUNNEL_WALL_H + TUNNEL_ARCH_H + 0.9) {
            portal.box(0, y, 0.02, 34, 0.06, 0.04, 0x5a4a68);
        } else {
            const w = 17 - open;
            for (const sx of [-1, 1]) portal.box(sx * (open + w / 2), y, 0.02, w, 0.06, 0.04, 0x5a4a68);
        }
    }
    portal.box(0, 13.15, -0.5, 35, 0.3, 2.2, 0x4a3c58);
    portal.box(0, 12.6, 0.06, 34.6, 0.5, 0.12, 0x3a2e48);
    for (let i = 0; i < 46; i++) {
        portal.box(-16.9 + i * 0.735 + 0.36, 11.8, 0.06, 0.62, 0.62, 0.08, i % 2 ? 0xf3efe6 : 0x1fa3a3);
        portal.add(T.box, i % 2 ? 0x1fa3a3 : 0xf3efe6, [-16.9 + i * 0.735 + 0.36, 11.8, 0.11], [0, 0, Math.PI / 4], [0.28, 0.28, 0.04]);
    }
    // Kemer çevresi kilit taşları
    for (let i = 0; i <= 10; i++) {
        const an = Math.PI - (i / 10) * Math.PI;
        const x = Math.cos(an) * (TUNNEL_W + 0.45);
        const y = TUNNEL_WALL_H + Math.sin(an) * (TUNNEL_ARCH_H + 0.45);
        portal.add(T.box, 0x8a7698, [x, y, 0.08], [0, 0, an - Math.PI / 2], [0.9, 0.6, 0.16]);
    }
    const portalGlow = new GeoBuilder();
    for (let i = 0; i < 10; i++) {
        const a0 = Math.PI - (i / 10) * Math.PI;
        const a1 = Math.PI - ((i + 1) / 10) * Math.PI;
        const am = (a0 + a1) / 2;
        const x = Math.cos(am) * (TUNNEL_W + 0.05);
        const y = TUNNEL_WALL_H + Math.sin(am) * (TUNNEL_ARCH_H + 0.05);
        const segLen = Math.hypot(Math.cos(a0) - Math.cos(a1), (Math.sin(a0) - Math.sin(a1)) * (TUNNEL_ARCH_H / TUNNEL_W)) * TUNNEL_W + 0.05;
        portalGlow.add(T.box, i % 2 ? 0xff4fd8 : 0x38e8ff, [x, y, 0.18], [0, 0, am - Math.PI / 2], [segLen, 0.1, 0.05]);
    }
    for (const sx of [-1, 1]) portalGlow.box(sx * (TUNNEL_W + 0.05), TUNNEL_WALL_H / 2, 0.18, 0.1, TUNNEL_WALL_H, 0.05, sx < 0 ? 0x38e8ff : 0xff4fd8);
    // Pankart: başlangıç kemeriyle aynı doku
    const plate = new THREE.PlaneGeometry(6.4, 1.2);
    plate.translate(0, 9.5, 0.12);
    return { body: body.build(), glow: glow.build(), portal: portal.build(), portalGlow: portalGlow.build(), plate };
}

/*
 * Bir segment çeşidi: iki yanda binalar (bazılarında cumba ve kiremit çatı),
 * vitrinler/tabelalar, lambalar, ağaçlar, bordür ve ara sıra simit tezgâhı.
 * Segment yerel koordinatı: z = 0 segment başı, -40 segment sonu (ileri = -z).
 * halos: neon tabela haleleri [x, y, z, r, g, b] * n (en fazla NEON_HALOS_PER_SEG).
 */
function buildSegment(variant, T) {
    const rnd = seededRandom(1000 + variant * 77);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const B = new GeoBuilder();
    const P = new GeoBuilder();
    const L = new GeoBuilder();
    const halos = [];
    const addHalo = (x, y, z, hex) => {
        if (halos.length >= NEON_HALOS_PER_SEG * 6) return;
        _hc.set(hex);
        halos.push(x, y, z, _hc.r, _hc.g, _hc.b);
    };

    for (const side of [-1, 1]) {
        // --- Binalar ---
        let z = 0;
        while (z < SEG_LEN - 0.01) {
            let w = 7 + rnd() * 9;
            if (SEG_LEN - z - w < 6) w = SEG_LEN - z;
            const gap = 0.5 + rnd() * 0.6;
            const bw = Math.max(3, w - gap);
            const tall = rnd() < 0.18;
            const h = tall ? 26 + rnd() * 16 : 8 + rnd() * 16;
            const d = 9 + rnd() * 6;
            const front = 9.2 + rnd() * 1.2;
            const cx = side * (front + d / 2);
            const cz = -(z + bw / 2);
            const tint = pick(BUILDING_TINTS);
            const offU = Math.floor(rnd() * 4) / 4;
            B.box(cx, h / 2, cz, d, h, bw, tint, { pitchU: 10, pitchV: 12.8, offU, offV: 0 });
            if (!tall && h < 17 && rnd() < 0.55) {
                // Kiremit kırma çatı (sırt caddeye paralel)
                for (const k of [-1, 1]) {
                    P.add(T.box, ROOF_TILE, [cx + k * d * 0.24, h + 1.05, cz], [0, 0, -k * 0.42], [d * 0.56, 0.22, bw + 0.4]);
                }
                P.box(cx, h + 0.15, cz, d + 0.3, 0.3, bw + 0.3, darken(tint, 0.55));
            } else {
                // Çatı silmesi
                B.box(cx, h + 0.25, cz, d + 0.5, 0.5, bw + 0.5, darken(tint, 0.55), { fixed: FIXED_UV });
                // Çatı eşyası: su deposu ya da anten (kırmızı ışıklı)
                if (rnd() < 0.5) {
                    P.add(T.cyl, 0x4a3b5e, [cx + side * 1.5, h + 1.4, cz], null, [1.1, 1.8, 1.1]);
                    P.add(T.cone, 0x3a2e4a, [cx + side * 1.5, h + 2.6, cz], null, [1.25, 0.7, 1.25]);
                } else if (rnd() < 0.6) {
                    P.add(T.cyl, 0x2e2640, [cx, h + 3, cz], null, [0.08, 6, 0.08]);
                    L.add(T.sphere, 0xff3355, [cx, h + 6.1, cz], null, [0.22, 0.22, 0.22]);
                }
            }
            const facadeX = side * front;
            // Cumba: üst katlarda caddeye taşan ahşap çıkma (İstanbul evleri)
            if (h > 10 && bw > 4.5 && rnd() < 0.5) {
                const cw = Math.min(bw * 0.5, 4.2);
                const cy = 6.1 + rnd() * 1.2;
                const ch = Math.min(3.2, h - cy - 0.6);
                B.box(facadeX - side * 0.5, cy + ch / 2, cz, 1.0, ch, cw, lighten(tint, 1.12), { pitchU: 10, pitchV: 12.8, offU: 0.25, offV: 0.5 });
                P.box(facadeX - side * 0.55, cy + ch + 0.08, cz, 1.2, 0.16, cw + 0.25, darken(tint, 0.5));
                P.box(facadeX - side * 0.5, cy - 0.12, cz, 1.05, 0.24, cw + 0.1, darken(tint, 0.65));
                for (const k of [-1, 1]) P.add(T.box, darken(tint, 0.6), [facadeX - side * 0.3, cy - 0.5, cz + k * (cw / 2 - 0.25)], [0, 0, side * 0.6], [0.12, 0.9, 0.12]);
            }
            // Zemin kat vitrini (ışıyan) ve tente
            const shopW = bw * 0.7;
            const shopCol = darken(pick(SHOP), 0.62);
            L.box(facadeX - side * 0.04, 1.45, cz, 0.08, 2.1, shopW, shopCol);
            // Vitrin içi: raflar ve ürün siluetleri (düz ışık bloğu gibi durmasın)
            for (let r = 0; r < 2; r++) P.box(facadeX - side * 0.1, 0.95 + r * 0.7, cz, 0.04, 0.05, shopW * 0.92, 0x2a2140);
            const items = Math.max(2, Math.floor(shopW / 1.1));
            for (let k = 0; k < items; k++) {
                const iz = cz - shopW / 2 + (k + 0.5) * (shopW / items);
                P.box(facadeX - side * 0.13, 1.1 + (k % 2) * 0.7, iz, 0.06, 0.22 + rnd() * 0.2, 0.25, pick(AWNING));
            }
            // Vitrin kayıtları ve alt panel
            const mullions = Math.max(2, Math.round(shopW / 1.6));
            for (let m = 0; m <= mullions; m++) {
                P.box(facadeX - side * 0.09, 1.45, cz - shopW / 2 + (m * shopW) / mullions, 0.06, 2.1, 0.1, 0x231c38);
            }
            P.box(facadeX - side * 0.09, 0.55, cz, 0.06, 0.3, shopW, 0x231c38);
            P.box(facadeX - side * 0.09, 2.45, cz, 0.06, 0.1, shopW, 0x231c38);
            const awn = pick(AWNING);
            // Çizgili tente (iki renk)
            const stripesN = Math.max(3, Math.round((shopW + 0.4) / 0.9));
            for (let k = 0; k < stripesN; k++) {
                const sz = cz - (shopW + 0.4) / 2 + (k + 0.5) * ((shopW + 0.4) / stripesN);
                P.add(T.box, k % 2 ? 0xfff4ec : awn, [facadeX - side * 0.7, 2.92, sz], [0, 0, side * 0.22], [1.45, 0.08, (shopW + 0.4) / stripesN + 0.01]);
            }
            P.box(facadeX - side * 1.38, 2.72, cz, 0.06, 0.32, shopW + 0.4, darken(awn, 0.7));
            // Tente üstü dükkân tabelası (neon yazı çizgileri)
            if (rnd() < 0.65) {
                const sw = Math.min(shopW * 0.8, 4.5);
                const sc = pick(NEON);
                P.box(facadeX - side * 0.08, 3.62, cz, 0.12, 0.62, sw, 0x1a1430);
                const letters = Math.max(3, Math.floor(sw / 0.42));
                for (let k = 0; k < letters; k++) {
                    const lz = cz - sw / 2 + 0.3 + k * ((sw - 0.6) / Math.max(1, letters - 1));
                    L.box(facadeX - side * 0.16, 3.62 + (rnd() - 0.5) * 0.06, lz, 0.03, 0.28 + rnd() * 0.12, 0.2, sc);
                }
                L.box(facadeX - side * 0.16, 3.32, cz, 0.03, 0.04, sw * 0.9, sc);
                addHalo(facadeX - side * 0.4, 3.62, cz, sc);
            }
            // Neon tabela (cepheden sokağa dik çıkan)
            if (rnd() < 0.55 && h > 9) {
                const nz = cz + (rnd() - 0.5) * bw * 0.5;
                const ny = 5 + rnd() * 2.5;
                const nh = 2.5 + rnd() * 2;
                const nc = pick(NEON);
                const nx = facadeX - side * 0.75;
                P.box(nx, ny, nz, 1.2, nh + 0.3, 0.28, 0x1a1430);
                // Neon tüp çerçeve + içte "yazı" çizgileri (iki yüzde)
                for (const f of [0.15, -0.15]) {
                    L.box(nx, ny + nh / 2, nz + f, 1.0, 0.07, 0.03, nc);
                    L.box(nx, ny - nh / 2, nz + f, 1.0, 0.07, 0.03, nc);
                    L.box(nx - 0.47, ny, nz + f, 0.07, nh, 0.03, nc);
                    L.box(nx + 0.47, ny, nz + f, 0.07, nh, 0.03, nc);
                    const rows = Math.floor(nh / 0.75);
                    for (let r = 0; r < rows; r++) {
                        const ry = ny + nh / 2 - 0.45 - r * 0.75;
                        L.box(nx + (rnd() - 0.5) * 0.1, ry, nz + f, 0.35 + rnd() * 0.35, 0.36, 0.03, darken(nc, 0.9 + rnd() * 0.1));
                    }
                }
                addHalo(nx, ny, nz, nc);
            } else if (rnd() < 0.5) {
                // Yatay neon şerit
                const nc = pick(NEON);
                const ny = 3.6 + rnd() * 0.4;
                L.box(facadeX - side * 0.05, ny + 0.85, cz, 0.06, 0.16, bw * 0.85, nc);
                addHalo(facadeX - side * 0.3, ny + 0.85, cz, nc);
            }
            z += w;
        }

        // --- Bordür (segment boyu) ---
        P.box(side * 4.42, 0.08, -SEG_LEN / 2, 0.24, 0.16, SEG_LEN, 0xb9b0d6);

        // --- Lambalar: sol z=0/20, sağ z=10/30 ---
        for (let k = 0; k < 2; k++) {
            const lz = -(k * 20 + (side > 0 ? 10 : 0));
            const px = side * 4.75;
            P.add(T.cyl, 0x2b2540, [px, 2.8, lz], null, [0.09, 5.6, 0.09]);
            P.add(T.cyl, 0x2b2540, [px, 0.25, lz], null, [0.2, 0.5, 0.2]);
            P.box(px - side * 0.65, 5.55, lz, 1.4, 0.1, 0.12, 0x2b2540);
            P.box(px - side * 1.3, 5.45, lz, 0.6, 0.18, 0.34, 0x1f1a30);
            L.box(px - side * 1.3, 5.34, lz, 0.5, 0.05, 0.26, 0xffd9a0);
        }

        // --- Ağaçlar ve banklar (lambaların arasında) ---
        for (let k = 0; k < 2; k++) {
            const tz = -(k * 20 + (side > 0 ? 0 : 10)) - 1.5 - rnd() * 2;
            const tx = side * (6.6 + rnd() * 0.8);
            const fol = pick(FOLIAGE);
            P.add(T.cyl, 0x5b3a2e, [tx, 1.0, tz], null, [0.15, 2.0, 0.15]);
            P.add(T.ico, fol, [tx, 2.7, tz], [rnd(), rnd(), 0], [1.25, 1.1, 1.25]);
            P.add(T.ico, darken(fol, 0.8), [tx + 0.3, 3.5, tz - 0.2], [rnd(), 0, rnd()], [0.85, 0.8, 0.85]);
            // Ağaç dibi saksı halkası
            P.add(T.cyl, 0x3d3352, [tx, 0.12, tz], null, [0.6, 0.24, 0.6]);
            if (rnd() < 0.5) {
                const bz = tz - 4;
                P.box(tx, 0.45, bz, 0.5, 0.08, 1.8, 0x8a5a3c);
                P.box(tx + side * 0.22, 0.75, bz, 0.08, 0.5, 1.8, 0x8a5a3c);
                P.box(tx, 0.22, bz - 0.75, 0.4, 0.44, 0.08, 0x2b2540);
                P.box(tx, 0.22, bz + 0.75, 0.4, 0.44, 0.08, 0x2b2540);
            } else if (rnd() < 0.45) {
                // Simit tezgâhı: kırmızı araba, camlı kutu (ışıyan), tekerlekler
                const sz = tz - 4.2;
                const sx = side * 6.2;
                P.box(sx, 0.75, sz, 0.75, 0.5, 1.3, 0xd7262f);
                P.box(sx, 1.02, sz, 0.8, 0.05, 1.36, 0xf3e6c8);
                L.box(sx, 1.32, sz, 0.66, 0.5, 1.18, 0xffd08a);
                P.box(sx, 1.6, sz, 0.78, 0.06, 1.34, 0xd7262f);
                for (const zz of [-0.45, 0.45]) P.add(T.cyl12, 0x1a1626, [sx, 0.28, sz + zz], [0, 0, Math.PI / 2], [0.25, 0.8, 0.25]);
                for (let r = 0; r < 3; r++) L.add(T.cyl, 0xc98a3c, [sx, 1.16 + r * 0.1, sz - 0.3 + r * 0.3], null, [0.13, 0.04, 0.13]);
            }
        }
    }

    return { buildings: B.build(), props: P.build(), glow: L.build(), halos: new Float32Array(halos) };
}

const _dc = new THREE.Color();
function darken(hex, f) {
    _dc.set(hex).multiplyScalar(f);
    return _dc.getHex();
}
function lighten(hex, f) {
    _dc.set(hex).multiplyScalar(f);
    return _dc.getHex();
}
