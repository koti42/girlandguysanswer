/*
 * Pist nesneleri: engeller (bariyer, tabela, araba, otobüs/tramvay, rampa),
 * jetonlar ve güçlendirmeler. Engeller InstancedMesh: tür/parça başına tek
 * draw call; örneği olmayan mesh çizilmez (visible = false).
 *
 * v2 araçları (şartname §A.1, §A.8):
 *  - car: sarı taksi ya da renkli kutu araba (İstanbul dolmuş/taksi esintili
 *    MPV). Üst yüzü 1.2 m'de düz: zıplayıp çatısında koşulur.
 *  - bus: nostaljik kırmızı tramvay (krem kuşak, pantograf) ya da şehir
 *    otobüsü; boyu desenden (8..20 m). Orta gövde z'de ölçeklenir, uçlar
 *    sabit; pencere kayıtları ve çatı panelleri ölçeklenmiş gövdede bile
 *    metre aralıklı kalsın diye gölgelendiricide örnek-yerel z'den çizilir.
 *    Çatı 2.7 m: açık renkli, panel dikişli, havalandırmalı koşu yüzeyi.
 *  - ramp: sarı-siyah şeritli eğik rampa (6 m'de 0 -> 2.7 m), arkasındaki
 *    otobüse yaslanır.
 *
 * Her karede görünür chunk'lar sim'den okunur (sim.getChunk önbellekli)
 * ve örnek matrisleri yeniden yazılır. Render döngüsünde allocation yok:
 * geçici vektör/matrisler modül seviyesinde.
 */
import * as THREE from 'three';
import { C } from '../sim/index.js';
import { GeoBuilder, createTemplates } from './geoBuilder.js';
import { clamp, hash32 } from './mathUtils.js';
import { createHaloMaterial, setHaloPixelScale } from './halo.js';

const CHUNK_LEN = C.CHUNK_LEN;
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
const CAP_CAR = 48;
const CAP_BUS = 32;
const CAP_RAMP = 24;
const CAP_ROOF_UNIT = 160;
const CAP_COIN = 220;
const CAP_FLY = 48;
const CAP_POWER = 4;
const CAP_HALO = 96;
const DESTROY_ANIM_S = 0.9;

// Görsel ölçüler (m) — sim sabitleriyle aynı (yüzeyler birebir oturmalı).
const CAR_TOP = C.CAR_TOP / 1000;
const BUS_TOP = C.BUS_TOP / 1000;
const BUS_CAP = 1.3; // otobüs uç parçası boyu (ölçeklenmez)
const ROOF_UNIT_STEP = 3.6;

export const TAXI_COLOR = 0xffc21a;
export const CAR_COLORS = [0xff6b6b, 0x2dd4bf, 0x8b5cf6, 0x38bdf8, 0xf3f4f6];
export const TRAM_COLOR = 0xd7262f;
export const BUS_COLORS = [0x14b8a6, 0xf2862e, 0x3b82f6];
const WIN_WARM = new THREE.Color(0xffd59a);
const WIN_COOL = new THREE.Color(0xc4ecff);

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _w = new THREE.Color();

export function laneX(lane) {
    return (lane - 1) * 2.5;
}

/**
 * Araç görünümü (saf; testlerde de kullanılır): id'den belirlenimci.
 * car: { taxi, color } · bus: { tram, color, warm }.
 */
export function vehicleLook(type, id) {
    const h = hash32(id * 7 + 3);
    if (type === 'car') {
        const taxi = h % 5 < 2;
        return { taxi, color: taxi ? TAXI_COLOR : CAR_COLORS[(h >>> 4) % CAR_COLORS.length] };
    }
    const tram = (h >>> 2) % 2 === 0;
    return { tram, color: tram ? TRAM_COLOR : BUS_COLORS[(h >>> 5) % BUS_COLORS.length], warm: tram || (h >>> 9) % 2 === 0 };
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
    m.visible = false;
    return m;
}

/*
 * Otobüs gövdesi gölgelendirici eki: örnek-yerel z (metre, ölçekten sonra)
 * ve yerel y. Krem kuşak, açık renkli çatı ve çatı panel dikişleri buradan.
 */
function patchBusBody(mat) {
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uBelt = { value: new THREE.Color(0xf3e6c8) };
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying float vBY;\nvarying float vBZ;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                vBY = transformed.y;
                #ifdef USE_INSTANCING
                    vBZ = (instanceMatrix * vec4(transformed, 1.0)).z - instanceMatrix[3].z;
                #else
                    vBZ = transformed.z;
                #endif`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uBelt;\nvarying float vBY;\nvarying float vBZ;')
            .replace('#include <color_fragment>', `#include <color_fragment>
                {
                    float belt = step(0.97, vBY) * step(vBY, 1.07);
                    diffuseColor.rgb = mix(diffuseColor.rgb, uBelt, belt);
                    float roof = step(2.6, vBY);
                    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.22 + vec3(0.6, 0.58, 0.65), roof * 0.85);
                    float seam = roof * (1.0 - step(0.035, fract(vBZ / 1.45)));
                    diffuseColor.rgb *= 1.0 - seam * 0.4;
                }`);
    };
    mat.customProgramCacheKey = () => 'busBody';
}

/* Pencere bandı: iç ışık degrade + metre aralıklı kayıtlar + orta yatay kayıt. */
function patchBusWindows(mat) {
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uFrame = { value: new THREE.Color(0x1a1726) };
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying float vWY;\nvarying float vWZ;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                vWY = transformed.y;
                #ifdef USE_INSTANCING
                    vWZ = (instanceMatrix * vec4(transformed, 1.0)).z - instanceMatrix[3].z;
                #else
                    vWZ = transformed.z;
                #endif`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uFrame;\nvarying float vWY;\nvarying float vWZ;')
            .replace('#include <color_fragment>', `#include <color_fragment>
                {
                    float f = fract(vWZ / 1.45 + 0.5);
                    float pillar = 1.0 - step(0.11, f);
                    float bar = 1.0 - step(0.03, abs(vWY - 1.82));
                    diffuseColor.rgb *= 0.55 + 0.5 * smoothstep(1.05, 2.1, vWY);
                    diffuseColor.rgb = mix(diffuseColor.rgb, uFrame, max(pillar, bar));
                }`);
    };
    mat.customProgramCacheKey = () => 'busWindows';
}

export function createEntities(scene, tex) {
    const T = createTemplates();
    const disposables = [];
    const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    const blink = new THREE.MeshBasicMaterial({ color: 0xffa424 });
    const busBodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    patchBusBody(busBodyMat);
    const busWinMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    patchBusWindows(busWinMat);
    disposables.push(lambert, glow, blink, busBodyMat, busWinMat);

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

    // --- Tabela: direkler + kalın levha [1.1, 1.6] m, önünde neon panel ---
    const BAR_LO = C.BAR_BOTTOM / 1000;
    const BAR_HI = C.BAR_TOP / 1000;
    const BAR_MID = (BAR_LO + BAR_HI) / 2;
    const pg = new GeoBuilder();
    for (const sx of [-1.15, 1.15]) {
        pg.box(sx, 1.0, 0, 0.12, 2.0, 0.12, 0x2b2540);
        pg.box(sx, 0.05, 0, 0.3, 0.1, 0.4, 0x1f1a30);
        pg.add(T.sphere, 0x2b2540, [sx, 2.02, 0], null, [0.09, 0.09, 0.09]);
    }
    pg.box(0, BAR_MID, 0, 2.36, BAR_HI - BAR_LO + 0.04, 0.28, 0x1b1236);
    pg.box(0, BAR_HI + 0.03, 0, 2.4, 0.05, 0.3, 0x3a3060);
    pg.box(0, BAR_LO - 0.03, 0, 2.4, 0.05, 0.3, 0x3a3060);
    const barPoleGeo = pg.build();
    const barPoles = makeInstanced(barPoleGeo, lambert, CAP_BAR);
    const barPanelGeo = new THREE.PlaneGeometry(2.2, BAR_HI - BAR_LO - 0.02);
    barPanelGeo.translate(0, BAR_MID, 0.145);
    const barPanelMat = new THREE.MeshBasicMaterial({ map: tex.sign });
    const barPanels = makeInstanced(barPanelGeo, barPanelMat, CAP_BAR);
    disposables.push(barPoleGeo, barPanelGeo, barPanelMat);

    // --- Araba (yerel: +z ön yüz oyuncuya bakar; boy CAR_DEPTH) ---
    const carLen = C.CAR_DEPTH / 1000;
    const ch = carLen / 2;
    const cb = new GeoBuilder(); // renklenen gövde (örnek rengi)
    cb.box(0, 0.5, 0, 1.86, 0.5, carLen - 0.12, 0xffffff);
    cb.box(0, 0.5, 0, 1.8, 0.56, carLen - 0.02, 0xffffff);
    cb.box(0, 0.96, -0.2, 1.76, 0.42, carLen - 0.75, 0xffffff);
    cb.box(0, CAR_TOP - 0.025, -0.2, 1.7, 0.05, carLen - 0.85, 0xf2f2f2);
    // Kaput: öne eğimli
    cb.add(T.box, 0xffffff, [0, 0.82, ch - 0.33], [-0.32, 0, 0], [1.76, 0.12, 0.66]);
    const carBodyGeo = cb.build();
    const carBody = makeInstanced(carBodyGeo, lambert, CAP_CAR, true);
    const ct = new GeoBuilder(); // renklenmeyen ayrıntılar
    // Camlar (yan, ön, arka)
    for (const sx of [-1, 1]) {
        ct.box(sx * 0.885, 0.97, -0.25, 0.02, 0.3, carLen - 1.15, 0x1d2540);
        for (const zz of [-0.9, 0.2]) ct.box(sx * 0.892, 0.97, zz, 0.02, 0.32, 0.08, 0x2a2440);
        ct.box(sx * 0.95, 0.88, ch - 0.95, 0.12, 0.08, 0.16, 0x2a2440); // ayna
    }
    ct.add(T.box, 0x223050, [0, 0.98, ch - 0.69], [-0.55, 0, 0], [1.6, 0.42, 0.04]);
    ct.box(0, 0.97, -ch + 0.16, 1.5, 0.3, 0.03, 0x1d2540);
    // Tamponlar, ızgara, plaka yeri
    ct.box(0, 0.32, ch - 0.02, 1.9, 0.2, 0.14, 0x2a2638);
    ct.box(0, 0.32, -ch + 0.02, 1.9, 0.2, 0.14, 0x2a2638);
    ct.box(0, 0.55, ch + 0.005, 0.9, 0.14, 0.02, 0x1a1626);
    ct.box(0, 0.34, ch + 0.08, 0.5, 0.11, 0.02, 0xf4f4f4);
    // Tavan rayları (çatıda koşu hissi)
    for (const sx of [-0.72, 0.72]) {
        ct.box(sx, CAR_TOP + 0.03, -0.2, 0.06, 0.06, carLen - 1.2, 0x3a3550);
        for (const zz of [-1.6, 1.0]) ct.box(sx, CAR_TOP + 0.01, zz - 0.2, 0.08, 0.04, 0.12, 0x3a3550);
    }
    // Tekerlekler (jant gümüş)
    for (const sx of [-0.88, 0.88]) {
        for (const zz of [ch - 0.8, -ch + 0.75]) {
            ct.add(T.cyl12, 0x15131c, [sx, 0.33, zz], [0, 0, Math.PI / 2], [0.33, 0.24, 0.33]);
            ct.add(T.cyl12, 0xb9bccc, [sx * 1.06, 0.33, zz], [0, 0, Math.PI / 2], [0.17, 0.04, 0.17]);
        }
    }
    const carTrimGeo = ct.build();
    const carTrim = makeInstanced(carTrimGeo, lambert, CAP_CAR);
    const cg = new GeoBuilder(); // farlar / stoplar
    for (const sx of [-0.62, 0.62]) {
        cg.box(sx, 0.62, ch + 0.01, 0.42, 0.14, 0.03, 0xfff3c4);
        cg.box(sx, 0.62, -ch - 0.01, 0.38, 0.12, 0.03, 0xff2c4a);
    }
    const carGlowGeo = cg.build();
    const carGlow = makeInstanced(carGlowGeo, glow, CAP_CAR);
    // Taksi süsleri (ışıksız malzeme: dama şerit + tepe lambası)
    const tx = new GeoBuilder();
    for (const sx of [-1, 1]) {
        for (let i = 0; i < 12; i++) {
            const z = -ch + 0.5 + i * 0.27;
            tx.box(sx * 0.912, 0.66, z, 0.02, 0.09, 0.135, i % 2 ? 0x111111 : 0xffffff);
            tx.box(sx * 0.912, 0.57, z + 0.135, 0.02, 0.09, 0.135, i % 2 ? 0xffffff : 0x111111);
        }
    }
    tx.box(0, CAR_TOP + 0.14, 0.45, 0.62, 0.2, 0.24, 0xffe27a);
    tx.box(0, CAR_TOP + 0.14, 0.45, 0.5, 0.07, 0.25, 0x2b1c00);
    tx.box(0, CAR_TOP + 0.03, 0.45, 0.66, 0.04, 0.28, 0x2a2440);
    const taxiGeo = tx.build();
    const taxiDeco = makeInstanced(taxiGeo, glow, CAP_CAR);
    disposables.push(carBodyGeo, carTrimGeo, carGlowGeo, taxiGeo);

    // --- Otobüs / tramvay ---
    // Orta gövde: z'de 1 m, ölçeklenir (kuşak, çatı, dikişler gölgelendiricide).
    const bm = new GeoBuilder();
    bm.box(0, 0.62, 0, 2.3, 0.62, 1, 0xffffff);
    bm.box(0, 2.3, 0, 2.3, 0.32, 1, 0xffffff);
    bm.box(0, BUS_TOP - 0.06, 0, 2.18, 0.12, 1, 0xffffff);
    bm.box(0, 0.24, 0, 2.0, 0.14, 1, 0x2a2638);
    for (const sx of [-1, 1]) bm.box(sx * 1.13, 2.5, 0, 0.08, 0.1, 1, 0xffffff);
    const busMidGeo = bm.build();
    const busMid = makeInstanced(busMidGeo, busBodyMat, CAP_BUS, true);
    // Uç parçası (yerel z: 0 = gövdeye ek yeri, +BUS_CAP = ön yüz)
    const be = new GeoBuilder();
    const ez = BUS_CAP / 2;
    be.box(0, 0.62, ez - 0.03, 2.3, 0.62, BUS_CAP - 0.06, 0xffffff);
    be.box(0, 2.3, ez - 0.05, 2.3, 0.32, BUS_CAP - 0.1, 0xffffff);
    be.box(0, BUS_TOP - 0.06, ez - 0.12, 2.18, 0.12, BUS_CAP - 0.24, 0xffffff);
    be.add(T.cyl12, 0xffffff, [0, BUS_TOP - 0.14, BUS_CAP - 0.22], [0, 0, Math.PI / 2], [0.12, 2.18, 0.12]);
    for (const sx of [-1, 1]) {
        be.box(sx * 1.13, 1.6, BUS_CAP - 0.08, 0.06, 1.2, 0.08, 0xffffff);
        be.add(T.cyl12, 0x15131c, [sx * 1.0, 0.36, 0.55], [0, 0, Math.PI / 2], [0.38, 0.26, 0.38]);
        be.add(T.cyl12, 0xa8acbc, [sx * 1.12, 0.36, 0.55], [0, 0, Math.PI / 2], [0.18, 0.04, 0.18]);
    }
    be.box(0, 0.4, BUS_CAP - 0.02, 2.34, 0.26, 0.1, 0x2a2638);
    be.box(0, 0.62, BUS_CAP + 0.0, 1.2, 0.14, 0.04, 0x1a1626);
    const busEndGeo = be.build();
    const busEnds = makeInstanced(busEndGeo, busBodyMat, CAP_BUS * 2, true);
    // Pencereler (ışıyan iç mekân): orta gövde ölçeklenir, uçlar sabit.
    const bwm = new GeoBuilder();
    for (const sx of [-1, 1]) bwm.box(sx * 1.155, 1.6, 0, 0.02, 1.06, 1, 0xffffff);
    const busWinGeo = bwm.build();
    const busWins = makeInstanced(busWinGeo, busWinMat, CAP_BUS, true);
    const beg = new GeoBuilder();
    for (const sx of [-1, 1]) beg.box(sx * 1.155, 1.6, ez - 0.1, 0.02, 1.06, BUS_CAP - 0.35, 0xffffff);
    beg.box(0, 1.65, BUS_CAP + 0.005, 2.0, 1.0, 0.02, 0x6f80a8);
    beg.box(0, 2.36, BUS_CAP - 0.04, 1.5, 0.18, 0.02, 0xffb84d);
    for (const sx of [-0.82, 0.82]) beg.box(sx, 0.78, BUS_CAP + 0.01, 0.34, 0.16, 0.02, 0xfff6dc);
    const busEndGlowGeo = beg.build();
    const busEndGlows = makeInstanced(busEndGlowGeo, busWinMat, CAP_BUS * 2, true);
    // Çatı birimleri (havalandırma) + tramvay pantografı
    const ru = new GeoBuilder();
    ru.box(0, BUS_TOP + 0.03, 0, 1.0, 0.06, 0.8, 0xc9c6d6);
    for (let i = 0; i < 4; i++) ru.box(0, BUS_TOP + 0.065, -0.27 + i * 0.18, 0.9, 0.012, 0.06, 0x5b5670);
    for (const sx of [-0.52, 0.52]) ru.box(sx, BUS_TOP + 0.03, 0, 0.04, 0.05, 0.84, 0x8e8aa2);
    const roofUnitGeo = ru.build();
    const roofUnits = makeInstanced(roofUnitGeo, lambert, CAP_ROOF_UNIT);
    // Tramvay pantografı: katlanmış (alçak, ince) — çatıda koşan karakterin önünü kesmesin.
    // Renkler çatı birimlerine yakın, düşük kontrast; üst çubuk kısa: koşu
    // çizgisinin üstünde koyu bir bariyer (zıplanacak engel) gibi okunmasın.
    const pt = new GeoBuilder();
    pt.box(0, BUS_TOP + 0.04, 0, 1.1, 0.08, 0.44, 0xb7b3c8);
    for (const sx of [-0.4, 0.4]) pt.add(T.cyl, 0xe8e2c8, [sx, BUS_TOP + 0.12, 0], null, [0.05, 0.1, 0.05]);
    pt.add(T.box, 0x8e8aa2, [0, BUS_TOP + 0.2, 0.32], [-1.25, 0, 0], [0.04, 0.75, 0.04]);
    pt.add(T.box, 0x8e8aa2, [0, BUS_TOP + 0.2, -0.32], [1.25, 0, 0], [0.04, 0.75, 0.04]);
    pt.box(0, BUS_TOP + 0.33, 0, 0.65, 0.035, 0.06, 0x8e8aa2);
    const pantoGeo = pt.build();
    const pantos = makeInstanced(pantoGeo, lambert, CAP_BUS);
    disposables.push(busMidGeo, busEndGeo, busWinGeo, busEndGlowGeo, roofUnitGeo, pantoGeo);

    // --- Rampa (yerel: +z alçak uç oyuncuya bakar, -z yüksek uç otobüse) ---
    const rampLen = C.RAMP_LEN / 1000;
    const rh = rampLen / 2;
    const slope = Math.atan2(BUS_TOP, rampLen);
    const slopeLen = Math.hypot(BUS_TOP, rampLen);
    const rg = new GeoBuilder();
    const bands = 18;
    for (let i = 0; i < bands; i++) {
        const t = (i + 0.5) / bands;
        const y = BUS_TOP * (1 - t);
        const z = -rh + rampLen * t;
        rg.add(T.box, i % 2 ? 0x1a1626 : 0xffc21a, [0, y - 0.04, z], [slope, 0, 0], [2.1, 0.08, slopeLen / bands + 0.005]);
    }
    for (const sx of [-1, 1]) {
        // Yan kirişler ve çapraz destekler
        rg.add(T.box, 0x3a3550, [sx * 1.08, BUS_TOP / 2 - 0.08, 0], [slope, 0, 0], [0.1, 0.22, slopeLen]);
        for (let k = 1; k <= 3; k++) {
            const t = k / 4;
            const z = -rh + rampLen * t;
            const hgt = BUS_TOP * (1 - t);
            rg.box(sx * 1.0, hgt / 2, z, 0.12, hgt, 0.12, 0x4a4560);
        }
        rg.add(T.box, 0x4a4560, [sx * 1.0, BUS_TOP * 0.36, -rh + rampLen * 0.38], [-0.62, 0, 0], [0.08, 2.0, 0.08]);
        // Kenar uyarı şeridi
        for (let i = 0; i < 10; i++) {
            const t = (i + 0.5) / 10;
            rg.add(T.box, i % 2 ? 0x1a1626 : 0xffc21a, [sx * 1.08, BUS_TOP * (1 - t) + 0.05, -rh + rampLen * t], [slope, 0, 0], [0.12, 0.05, slopeLen / 10]);
        }
    }
    rg.box(0, BUS_TOP / 2, -rh + 0.06, 2.0, BUS_TOP, 0.1, 0x2a2638);
    rg.box(0, 0.03, rh - 0.1, 2.2, 0.06, 0.3, 0x2a2638);
    const rampGeo = rg.build();
    const ramps = makeInstanced(rampGeo, lambert, CAP_RAMP);
    const rgl = new GeoBuilder();
    for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
            const t = (i + 0.5) / 4;
            rgl.add(T.sphere, 0xffb020, [sx * 1.14, BUS_TOP * (1 - t) + 0.12, -rh + rampLen * t], null, [0.05, 0.05, 0.05]);
        }
    }
    const rampGlowGeo = rgl.build();
    const rampGlows = makeInstanced(rampGlowGeo, blink, CAP_RAMP);
    disposables.push(rampGeo, rampGlowGeo);

    // --- Jeton: dönen altın disk, iki yüzü "?" kabartmalı ---
    const coinGeo = buildCoin(COIN_SEGMENTS);
    const coinLiteGeo = buildCoin(LITE_COIN_SEGMENTS);
    const coinMat = new THREE.MeshLambertMaterial({ map: tex.coin, emissive: 0x6b4a10, emissiveIntensity: 1 });
    const coins = makeInstanced(coinGeo, coinMat, CAP_COIN + CAP_FLY);
    disposables.push(coinGeo, coinLiteGeo, coinMat);

    const instancedAll = [
        barrier, barrierLamps, barPoles, barPanels,
        carBody, carTrim, carGlow, taxiDeco,
        busMid, busEnds, busWins, busEndGlows, roofUnits, pantos,
        ramps, rampGlows, coins,
    ];
    for (const m of instancedAll) scene.add(m);

    // --- Far haleleri (ucuz bloom: tek Points, toplamalı) ---
    const haloPos = new Float32Array(CAP_HALO * 3);
    const haloCol = new Float32Array(CAP_HALO * 3);
    const haloGeo = new THREE.BufferGeometry();
    const haloPosA = new THREE.BufferAttribute(haloPos, 3).setUsage(THREE.DynamicDrawUsage);
    const haloColA = new THREE.BufferAttribute(haloCol, 3).setUsage(THREE.DynamicDrawUsage);
    haloGeo.setAttribute('position', haloPosA);
    haloGeo.setAttribute('color', haloColA);
    haloGeo.setDrawRange(0, 0);
    const haloMat = createHaloMaterial({ map: tex.glow, size: 0.9 });
    const halos = new THREE.Points(haloGeo, haloMat);
    halos.frustumCulled = false;
    halos.renderOrder = 2;
    halos.visible = false;
    scene.add(halos);
    disposables.push(haloGeo, haloMat);

    // --- Güçlendirmeler (az sayıda; havuzlu gruplar) ---
    const magnetGeo = buildMagnet(T);
    const shieldGeo = buildShieldBadge(T);
    const shoe = buildSuperShoe(T);
    const ringGeo = new THREE.RingGeometry(0.55, 0.75, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringOpts = { transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide };
    const ringMagnet = new THREE.MeshBasicMaterial({ color: 0xff5a6a, ...ringOpts });
    const ringShield = new THREE.MeshBasicMaterial({ color: 0x5ad8ff, ...ringOpts });
    const ringSuper = new THREE.MeshBasicMaterial({ color: 0x5dff8a, ...ringOpts });
    const orbMat = new THREE.MeshLambertMaterial({ color: 0x7fe7ff, emissive: 0x1a6a8a, transparent: true, opacity: 0.55, depthWrite: false });
    const orbGeo = new THREE.IcosahedronGeometry(0.62, 1);
    disposables.push(magnetGeo, shieldGeo, shoe.body, shoe.glow, ringGeo, ringMagnet, ringShield, ringSuper, orbMat, orbGeo);
    const powerPool = [];
    for (let i = 0; i < CAP_POWER; i++) {
        const g = new THREE.Group();
        const magnet = new THREE.Mesh(magnetGeo, lambert);
        const badge = new THREE.Mesh(shieldGeo, lambert);
        const orb = new THREE.Mesh(orbGeo, orbMat);
        const sneaker = new THREE.Group();
        sneaker.add(new THREE.Mesh(shoe.body, lambert), new THREE.Mesh(shoe.glow, glow));
        const ring = new THREE.Mesh(ringGeo, ringMagnet);
        ring.position.y = -0.85;
        g.add(magnet, badge, orb, sneaker, ring);
        g.visible = false;
        scene.add(g);
        powerPool.push({ g, magnet, badge, orb, sneaker, ring });
    }
    T.dispose();

    // Kalkanla yıkılan engellerin uçuş animasyonu
    const destroyed = [];
    for (let i = 0; i < 6; i++) destroyed.push({ id: -1, t: 0 });

    // Toplanan jetonların oyuncuya uçuşu (mıknatıs çekimi dahil)
    const fly = [];
    for (let i = 0; i < CAP_FLY; i++) fly.push({ active: false, x: 0, y: 0, z: 0, t: 0, dur: 0.2 });

    const counts = { barrier: 0, bar: 0, car: 0, taxi: 0, bus: 0, busEnd: 0, roof: 0, panto: 0, ramp: 0, coin: 0, power: 0, halo: 0 };
    let aheadMm = AHEAD_MM;
    let coinAheadMm = AHEAD_MM;
    let lite = false;
    let night = 0.6;

    function destroyAnim(id) {
        for (let i = 0; i < destroyed.length; i++) if (destroyed[i].id === id) return destroyed[i];
        return null;
    }

    function addHalo(x, y, z, hex, k) {
        if (lite || counts.halo >= CAP_HALO) return;
        const dist = -z;
        // Uzakta sönümlenir (haleler sis kullanmıyor); arkada çizilmez.
        const fade = dist < -2 ? 0 : (1 - clamp((dist - 30) / 90, 0, 1)) * k;
        if (fade <= 0.01) return;
        const i = counts.halo++;
        _w.setHex(hex);
        haloPos[i * 3] = x;
        haloPos[i * 3 + 1] = y;
        haloPos[i * 3 + 2] = z;
        haloCol[i * 3] = _w.r * fade;
        haloCol[i * 3 + 1] = _w.g * fade;
        haloCol[i * 3 + 2] = _w.b * fade;
    }

    function setInstance(mesh, index, x, y, z, sx, sy, sz) {
        _p.set(x, y, z);
        _s.set(sx, sy, sz);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(index, _m);
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
        const big = o.type === 'car' || o.type === 'bus' || o.type === 'ramp';
        // Oyuncunun geçtiği engel kamerayla arasına girip görüşü kapatmasın:
        // arka ucu oyuncuyu geçince hızla yere doğru küçülür. Yan şeritteki
        // araçlar ise kamera arkasına kadar durur (pat diye kaybolmasın).
        const passed = zFar - 0.25;
        if (passed > 0 && (!big || Math.abs(x - playerX) < 1.4)) {
            const k = passed / 1.1;
            if (k >= 1) return;
            sc *= 1 - k;
        }
        _e.set(rx, 0, rz);
        _q.setFromEuler(_e);
        const px = x + ox;
        if (o.type === 'barrier') {
            if (counts.barrier >= CAP_BARRIER) return;
            setInstance(barrier, counts.barrier, px, oy, (zNear + zFar) / 2, sc, sc, sc);
            barrierLamps.setMatrixAt(counts.barrier, _m);
            counts.barrier++;
        } else if (o.type === 'bar') {
            if (counts.bar >= CAP_BAR) return;
            setInstance(barPoles, counts.bar, px, oy, (zNear + zFar) / 2, sc, sc, sc);
            barPanels.setMatrixAt(counts.bar, _m);
            counts.bar++;
        } else if (o.type === 'car') {
            if (counts.car >= CAP_CAR) return;
            const look = vehicleLook('car', o.id);
            const i = counts.car++;
            const cz = (zNear + zFar) / 2;
            setInstance(carBody, i, px, oy, cz, sc, sc, sc);
            carTrim.setMatrixAt(i, _m);
            carGlow.setMatrixAt(i, _m);
            carBody.setColorAt(i, _c.setHex(look.color));
            if (look.taxi && counts.taxi < CAP_CAR) taxiDeco.setMatrixAt(counts.taxi++, _m);
            if (!anim) {
                addHalo(px - 0.62, 0.62, zNear + 0.1, 0xfff0c8, 0.8);
                addHalo(px + 0.62, 0.62, zNear + 0.1, 0xfff0c8, 0.8);
                if (look.taxi) addHalo(px, CAR_TOP + 0.16, cz + 0.45, 0xffd34d, 0.55);
            }
        } else if (o.type === 'bus') {
            if (counts.bus >= CAP_BUS) return;
            const look = vehicleLook('bus', o.id);
            const len = zNear - zFar;
            const midLen = Math.max(0.2, len - BUS_CAP * 2);
            const i = counts.bus++;
            const cz = (zNear + zFar) / 2;
            _c.setHex(look.color);
            // Ölçek: gövde z'de midLen; uçlar sabit (yıkım animasyonunda birlikte küçülür).
            setInstance(busMid, i, px, oy, cz, sc, sc, midLen * sc);
            busMid.setColorAt(i, _c);
            busWins.setMatrixAt(i, _m);
            _w.copy(look.warm ? WIN_WARM : WIN_COOL).multiplyScalar(0.55 + 0.5 * night);
            busWins.setColorAt(i, _w);
            const e0 = counts.busEnd++;
            const e1 = counts.busEnd++;
            // Ön uç (+z, oyuncuya bakan) ve arka uç (180° dönük).
            setInstance(busEnds, e0, px, oy, cz + (midLen / 2) * sc, sc, sc, sc);
            busEndGlows.setMatrixAt(e0, _m);
            _e.set(rx, Math.PI, rz);
            _q.setFromEuler(_e);
            setInstance(busEnds, e1, px, oy, cz - (midLen / 2) * sc, sc, sc, sc);
            busEndGlows.setMatrixAt(e1, _m);
            busEnds.setColorAt(e0, _c);
            busEnds.setColorAt(e1, _c);
            busEndGlows.setColorAt(e0, _w);
            busEndGlows.setColorAt(e1, _w);
            _e.set(rx, 0, rz);
            _q.setFromEuler(_e);
            // Çatı birimleri: metre aralıklı (uçlara yakın boşluk)
            const n = Math.max(1, Math.floor((len - 3) / ROOF_UNIT_STEP));
            const span = (n - 1) * ROOF_UNIT_STEP;
            for (let k = 0; k < n && counts.roof < CAP_ROOF_UNIT; k++) {
                // Tramvayın ortası pantografa ayrılır.
                if (look.tram && n > 2 && k === Math.floor(n / 2)) continue;
                setInstance(roofUnits, counts.roof++, px, oy, cz + (span / 2 - k * ROOF_UNIT_STEP) * sc, sc, sc, sc);
            }
            if (look.tram && counts.panto < CAP_BUS) {
                const k = Math.floor(n / 2);
                const pzOff = n > 2 ? span / 2 - k * ROOF_UNIT_STEP : 0;
                setInstance(pantos, counts.panto++, px, oy, cz + pzOff * sc, sc, sc, sc);
            }
            if (!anim) {
                addHalo(px - 0.82, 0.78, zNear + 0.1, 0xfff4dc, 0.9);
                addHalo(px + 0.82, 0.78, zNear + 0.1, 0xfff4dc, 0.9);
                addHalo(px, 2.36, zNear + 0.05, 0xffb84d, 0.45);
            }
        } else if (o.type === 'ramp') {
            if (counts.ramp >= CAP_RAMP) return;
            setInstance(ramps, counts.ramp, px, oy, (zNear + zFar) / 2, sc, sc, sc);
            rampGlows.setMatrixAt(counts.ramp, _m);
            counts.ramp++;
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

    function finishMesh(m, count) {
        m.count = count;
        m.visible = count > 0;
        if (count > 0) {
            m.instanceMatrix.needsUpdate = true;
            if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
    }

    return {
        /** Düşük kalite kademesi: daha kısa görüş mesafesi, hale yok. */
        setLite(on) {
            lite = Boolean(on);
            aheadMm = on ? LITE_AHEAD_MM : AHEAD_MM;
            coinAheadMm = on ? LITE_COIN_AHEAD_MM : AHEAD_MM;
            coins.geometry = on ? coinLiteGeo : coinGeo;
            if (on) halos.visible = false;
        },

        /** 0 gündüz .. 1 gece: araç iç ışıkları ve haleler. */
        setNight(n) {
            night = clamp(n, 0, 1);
            haloMat.uniforms.uOpacity.value = 0.45 + 0.55 * night;
        },

        setPixelScale(heightPx, fovDeg) {
            setHaloPixelScale(haloMat, heightPx, fovDeg);
        },

        /** Jeton toplandı: oyuncuya doğru uçur. */
        collectCoin(sim, id, pz) {
            const chk = sim.getChunk(Math.floor(id / C.COIN_ID_STRIDE));
            const c = chk ? findById(chk.coins, id) : null;
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
            for (const k in counts) counts[k] = 0;
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
                const chk = sim.getChunk(c);
                if (!chk) continue;
                const obs = chk.obstacles;
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
                const cs = chk.coins;
                for (let i = 0; i < cs.length; i++) {
                    const k = cs[i];
                    if (k.taken || k.z < minZ || k.z > coinMaxZ) continue;
                    const rz = -(k.z - pz) / 1000;
                    placeCoin(laneX(k.lane), k.y / 1000 + Math.sin(time * 4 + k.z * 0.0004) * 0.07, rz, spin + k.z * 0.00035, 1);
                }
                const ps = chk.powers;
                for (let i = 0; i < ps.length; i++) {
                    const pw = ps[i];
                    if (pw.taken || pw.z < minZ || pw.z > maxZ || counts.power >= CAP_POWER) continue;
                    const slot = powerPool[counts.power++];
                    slot.g.visible = true;
                    const rzp = -(pw.z - pz) / 1000;
                    slot.g.position.set(laneX(pw.lane), pw.y / 1000 + 0.35 + Math.sin(time * 3) * 0.12, rzp);
                    const kind = pw.kind;
                    slot.magnet.visible = kind === 'magnet';
                    slot.badge.visible = kind === 'shield';
                    slot.orb.visible = kind === 'shield';
                    slot.sneaker.visible = kind === 'superjump';
                    slot.magnet.rotation.y = time * 2.4;
                    slot.badge.rotation.y = time * 2.4;
                    slot.orb.rotation.y = -time * 0.8;
                    slot.sneaker.rotation.y = time * 2.2;
                    slot.sneaker.rotation.z = Math.sin(time * 4) * 0.15;
                    const pulse = 1 + Math.sin(time * 5) * 0.12;
                    slot.ring.scale.set(pulse, pulse, pulse);
                    slot.ring.material = kind === 'magnet' ? ringMagnet : (kind === 'superjump' ? ringSuper : ringShield);
                    if (kind === 'superjump') addHalo(slot.g.position.x, slot.g.position.y, rzp, 0x5dff8a, 0.9);
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

            finishMesh(barrier, counts.barrier);
            finishMesh(barrierLamps, counts.barrier);
            finishMesh(barPoles, counts.bar);
            finishMesh(barPanels, counts.bar);
            finishMesh(carBody, counts.car);
            finishMesh(carTrim, counts.car);
            finishMesh(carGlow, counts.car);
            finishMesh(taxiDeco, counts.taxi);
            finishMesh(busMid, counts.bus);
            finishMesh(busWins, counts.bus);
            finishMesh(busEnds, counts.busEnd);
            finishMesh(busEndGlows, counts.busEnd);
            finishMesh(roofUnits, counts.roof);
            finishMesh(pantos, counts.panto);
            finishMesh(ramps, counts.ramp);
            finishMesh(rampGlows, counts.ramp);
            finishMesh(coins, counts.coin);
            haloGeo.setDrawRange(0, counts.halo);
            halos.visible = !lite && counts.halo > 0;
            if (counts.halo > 0) {
                haloPosA.needsUpdate = true;
                haloColA.needsUpdate = true;
            }
            // Bariyer ve rampa lambaları senkron yanıp söner
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
            scene.remove(halos);
            for (const p of powerPool) scene.remove(p.g);
            for (const d of disposables) d.dispose();
        },
    };
}

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

/** Süper Zıplama: neon yeşil kanatlı spor ayakkabı (gövde + ışıyan taban/şeritler). */
function buildSuperShoe(T) {
    const b = new GeoBuilder();
    b.add(T.sphereSmooth, 0x39ff6a, [0, 0.0, 0.02], null, [0.24, 0.2, 0.46]);
    b.add(T.sphereSmooth, 0x22c55e, [0, 0.12, 0.2], null, [0.18, 0.16, 0.18]);
    b.add(T.sphereSmooth, 0xffffff, [0, -0.04, -0.36], null, [0.2, 0.12, 0.16]);
    for (let i = 0; i < 3; i++) b.box(0, 0.16 - i * 0.03, -0.1 + i * 0.09, 0.2, 0.025, 0.03, 0xffffff);
    // Küçük kanatlar
    for (const sx of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            b.add(T.box, 0xffffff, [sx * 0.24, 0.12 + i * 0.07, 0.22 + i * 0.03], [0.5 + i * 0.25, 0, sx * (0.5 + i * 0.15)], [0.04, 0.26 - i * 0.05, 0.08]);
        }
    }
    const gl = new GeoBuilder();
    gl.add(T.sphereSmooth, 0xb6ffcc, [0, -0.14, 0.0], null, [0.26, 0.06, 0.5]);
    for (const sx of [-1, 1]) gl.box(sx * 0.235, 0.0, 0.0, 0.02, 0.05, 0.42, 0xeaffef);
    return { body: b.build(), glow: gl.build() };
}
