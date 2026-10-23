/*
 * Duraklara özgü simgeler (hepsi prosedürel, orijinal):
 *   hakkinda -> tabela (yön levhalı direk, fener)
 *   sorular  -> posta kutusu (üstünde parlayan "?")
 *   cevaplar -> deniz feneri (dönen ışık huzmesi)
 *   rozetler -> rozet kulesi (madalyalar, kupa, parlayan yıldız)
 *   takip    -> iskele + kayık (göletin kıyısında)
 *
 * Her simge yerelde +z'ye (ada dışına) bakar. Katı parçalar tek geometride
 * birleşir (1 çizim); her simgenin parlayan vurgusu ayrı geometridir (aktif
 * olan öne gelince parlaması için malzeme rengi ayrı ayarlanır).
 */
import * as THREE from 'three';
import { createMeshBuilder, blob, box, boxC, cone, cylinder, lathe, mixRgb, plate, prism, rgb } from './geo.js';
import { WATER_LEVEL } from './layout.js';

const GOLD_LO = '#c98a1c';
const GOLD_HI = '#ffd65a';
const STONE_LO = '#7a6c80';
const STONE_HI = '#b4a6ba';

function rockBase(solid, r = 0.3, seed = 1, y = 0.02) {
    solid.add(blob(r, 0), { p: [0, y, 0], s: [1.15, 0.55, 1.05], lo: STONE_LO, hi: STONE_HI, jitter: r * 0.2, ao: 0.5, seed });
    solid.add(blob(r * 0.6, 0), { p: [r * 0.9, y - 0.02, r * 0.45], s: [1, 0.55, 1], lo: STONE_LO, hi: STONE_HI, jitter: r * 0.12, ao: 0.5, seed: seed + 1 });
}

function buildSignpost(solid, glow) {
    rockBase(solid, 0.27, 11);
    solid.add(cylinder(0.075, 0.055, 1.7, 6), { p: [0, 0.06, 0], r: [0, 0, 0.025], lo: '#6c452a', hi: '#9c6c40', ao: 0.2, seed: 12 });
    const arrow = [[-0.4, -0.1], [0.3, -0.1], [0.5, 0], [0.3, 0.1], [-0.4, 0.1]];
    const planks = [
        { y: 1.52, ry: 0.2, dir: 1, c: '#e3ad6e' },
        { y: 1.22, ry: -0.16, dir: -1, c: '#c98b4d' },
        { y: 0.92, ry: 0.1, dir: 1, c: '#dcb77f' },
    ];
    planks.forEach((p, i) => {
        solid.add(plate(arrow, 0.055), { p: [0.02 * p.dir, p.y, 0.07], r: [0, p.ry, 0], s: [p.dir, 1, 1], c: p.c, vary: 0.07, seed: 20 + i });
        // boya şeridi
        solid.add(boxC(0.5, 0.025, 0.062), { p: [0.02 * p.dir - 0.04 * p.dir, p.y + 0.04, 0.07], r: [0, p.ry, 0], c: '#fff1d6', vary: 0.02, seed: 25 + i });
    });
    solid.add(blob(0.06, 0), { p: [0, 1.82, 0], c: GOLD_HI, seed: 30 });
    // fener kolu + kafes
    solid.add(box(0.36, 0.03, 0.03), { p: [-0.18, 1.72, 0], c: '#3b3340', seed: 31 });
    solid.add(box(0.1, 0.15, 0.1), { p: [-0.34, 1.52, 0], c: '#3b3340', ao: 0.2, seed: 32 });
    solid.add(cone(0.075, 0.07, 4), { p: [-0.34, 1.67, 0], c: '#3b3340', seed: 33 });
    glow.add(boxC(0.072, 0.1, 0.072), { p: [-0.34, 1.6, 0], c: '#ffcf70', vary: 0, seed: 34 });
    // dipte çiçekler
    for (let i = 0; i < 4; i++) {
        const x = -0.28 + i * 0.07;
        const z = 0.24 + (i % 2) * 0.06;
        solid.add(cylinder(0.008, 0.008, 0.08, 3), { p: [x, 0.0, z], c: '#3f8f4a', vary: 0, seed: 40 + i });
        solid.add(new THREE.OctahedronGeometry(0.04, 0), { p: [x, 0.1, z], s: [1, 0.6, 1], c: ['#ff7aa8', '#ffd25a', '#fff', '#ff9a62'][i], seed: 45 + i });
    }
    return { halo: [-0.34, 1.6, 0], haloColor: '#ffd98a', haloSize: 1.0 };
}

function buildMailbox(solid, glow) {
    rockBase(solid, 0.24, 51);
    solid.add(box(0.11, 0.9, 0.11), { p: [0, 0.06, 0], lo: '#6c452a', hi: '#9c6c40', ao: 0.2, seed: 52 });
    // gövde: kutu + yuvarlak tavan
    solid.add(box(0.62, 0.28, 0.4), { p: [0, 0.94, 0], lo: '#c93e3e', hi: '#ef5a50', ao: 0.1, vary: 0.04, seed: 53 });
    solid.add(new THREE.CylinderGeometry(0.2, 0.2, 0.62, 8), { p: [0, 1.22, 0], r: [0, 0, Math.PI / 2], lo: '#e84e46', hi: '#f6735f', vary: 0.04, seed: 54 });
    // ön kapak ve kulp
    solid.add(box(0.5, 0.3, 0.025), { p: [0, 0.95, 0.205], c: '#a93131', vary: 0.03, seed: 55 });
    solid.add(blob(0.03, 0), { p: [0, 1.2, 0.225], c: GOLD_HI, seed: 56 });
    solid.add(box(0.34, 0.04, 0.02), { p: [0, 1.02, 0.222], c: '#2a1d24', vary: 0, seed: 57 }); // posta yuvası
    // dışarı sarkan mektuplar
    solid.add(boxC(0.3, 0.012, 0.22), { p: [-0.06, 0.88, 0.3], r: [-0.12, 0.2, 0.05], c: '#fff6e4', vary: 0.02, seed: 58 });
    solid.add(boxC(0.26, 0.012, 0.2), { p: [0.1, 0.86, 0.28], r: [-0.05, -0.25, -0.04], c: '#dff0ff', vary: 0.02, seed: 59 });
    // bayrak (kalkık)
    solid.add(box(0.026, 0.3, 0.026), { p: [0.34, 0.98, 0.0], c: '#444', seed: 60 });
    solid.add(box(0.15, 0.09, 0.02), { p: [0.41, 1.2, 0.0], c: '#ffcf4a', seed: 61 });
    // parlayan soru işareti
    const q = 1.2;
    const hook = new THREE.TorusGeometry(0.15, 0.036, 3, 8, 4.0);
    glow.add(hook, { p: [0, 1.82, 0], s: [-q, q, q], c: '#ffd15a', vary: 0, seed: 62 });
    glow.add(cylinder(0.036, 0.036, 0.13, 4), { p: [0.05 * q, 1.6, 0], r: [0, 0, 0.6], s: q, c: '#ffd15a', vary: 0, seed: 63 });
    glow.add(blob(0.045, 0), { p: [0, 1.5, 0], s: q, c: '#ffd15a', vary: 0, seed: 64 });
    return { halo: [0, 1.82, 0], haloColor: '#ffd070', haloSize: 0.95 };
}

function buildLighthouse(solid, glow) {
    solid.add(blob(0.62, 0), { p: [0, 0.04, 0], s: [1.15, 0.5, 1.1], lo: '#6f6176', hi: '#a89aae', jitter: 0.09, ao: 0.5, seed: 71 });
    solid.add(blob(0.3, 0), { p: [0.62, 0.0, 0.3], s: [1, 0.5, 1], lo: '#6f6176', hi: '#a89aae', jitter: 0.05, ao: 0.5, seed: 72 });
    const secs = 4;
    const H = 1.4;
    const rAt = (y) => 0.44 - 0.15 * (y / H);
    for (let i = 0; i < secs; i++) {
        const y0 = (i / secs) * H;
        const y1 = ((i + 1) / secs) * H;
        const red = i % 2 === 0;
        solid.add(cylinder(rAt(y0), rAt(y1), y1 - y0, 8), {
            p: [0, 0.14 + y0, 0],
            lo: red ? '#c93b3a' : '#e9e0d6',
            hi: red ? '#e8554a' : '#fffaf0',
            ao: 0.18,
            vary: 0.03,
            seed: 73 + i,
        });
    }
    const top = 0.14 + H;
    solid.add(cylinder(0.4, 0.38, 0.06, 8), { p: [0, top, 0], c: '#3a3344', seed: 80 });
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        solid.add(box(0.025, 0.1, 0.025), { p: [Math.sin(a) * 0.37, top + 0.06, Math.cos(a) * 0.37], c: '#3a3344', vary: 0, seed: 81 });
    }
    solid.add(cylinder(0.26, 0.26, 0.035, 8), { p: [0, top + 0.06 + 0.3, 0], c: '#3a3344', seed: 82 });
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        solid.add(box(0.03, 0.3, 0.03), { p: [Math.sin(a) * 0.22, top + 0.06, Math.cos(a) * 0.22], c: '#3a3344', vary: 0, seed: 83 });
    }
    glow.add(cylinder(0.2, 0.2, 0.3, 8), { p: [0, top + 0.06, 0], c: '#ffe49c', vary: 0, seed: 84 });
    solid.add(cone(0.32, 0.3, 8), { p: [0, top + 0.37, 0], lo: '#b8302f', hi: '#e8554a', vary: 0.05, seed: 85 });
    solid.add(blob(0.04, 0), { p: [0, top + 0.69, 0], c: GOLD_HI, seed: 86 });
    solid.add(cylinder(0.008, 0.008, 0.14, 3), { p: [0, top + 0.7, 0], c: '#444', seed: 87 });
    // kapı ve pencereler
    solid.add(box(0.15, 0.27, 0.04), { p: [0, 0.12, 0.43], c: '#6c452a', seed: 88 });
    solid.add(box(0.09, 0.12, 0.04), { p: [0, 0.78, rAt(0.64) + 0.0], c: '#2b2540', vary: 0, seed: 89 });
    solid.add(box(0.08, 0.1, 0.04), { p: [0, 1.15, rAt(1.0) + 0.0], c: '#2b2540', vary: 0, seed: 90 });
    // bekçi kulübesi
    solid.add(box(0.34, 0.22, 0.28), { p: [-0.7, 0.04, 0.3], r: [0, -0.35, 0], c: '#f3e2c9', ao: 0.25, seed: 91 });
    solid.add(prism(0.42, 0.18, 0.36), { p: [-0.7, 0.25, 0.3], r: [0, -0.35, 0], lo: '#b8302f', hi: '#e8554a', seed: 92 });
    return { halo: [0, top + 0.2, 0], haloColor: '#ffe29a', haloSize: 1.1, beamY: top + 0.21 };
}

function buildTrophy(solid, glow) {
    const hex = Math.PI / 6;
    solid.add(cylinder(0.64, 0.6, 0.14, 6), { r: [0, hex, 0], lo: '#9d93bd', hi: '#c9bfe0', ao: 0.3, seed: 101 });
    solid.add(cylinder(0.5, 0.44, 0.52, 6), { p: [0, 0.14, 0], r: [0, hex, 0], lo: '#8f86bd', hi: '#bdb4e4', ao: 0.25, seed: 102 });
    solid.add(cylinder(0.47, 0.47, 0.045, 6), { p: [0, 0.64, 0], r: [0, hex, 0], lo: GOLD_LO, hi: GOLD_HI, seed: 103 });
    solid.add(cylinder(0.4, 0.34, 0.42, 6), { p: [0, 0.685, 0], r: [0, hex, 0], lo: '#9a91c9', hi: '#c8bfec', ao: 0.2, seed: 104 });
    solid.add(cylinder(0.37, 0.37, 0.04, 6), { p: [0, 1.1, 0], r: [0, hex, 0], lo: GOLD_LO, hi: GOLD_HI, seed: 105 });
    solid.add(cylinder(0.3, 0.26, 0.3, 6), { p: [0, 1.14, 0], r: [0, hex, 0], lo: '#a69dd3', hi: '#d2caf2', ao: 0.2, seed: 106 });
    solid.add(cylinder(0.36, 0.34, 0.05, 6), { p: [0, 1.44, 0], r: [0, hex, 0], lo: GOLD_LO, hi: GOLD_HI, seed: 107 });
    // madalyalar (ön yüzde, düz yüz +z'ye bakar)
    const ap = 0.433;
    const medals = [
        { x: -0.2, c: '#d99058', r: '#3f7fd0' },
        { x: 0.0, c: '#ffd34d', r: '#d8453f' },
        { x: 0.2, c: '#e3e7f2', r: '#3fb07a' },
    ];
    medals.forEach((m, i) => {
        solid.add(box(0.045, 0.1, 0.012), { p: [m.x, 0.34, ap + 0.002 + (0.015 - 0.015)], c: m.r, vary: 0.02, seed: 110 + i });
        solid.add(cylinder(0.085, 0.085, 0.03, 8), { p: [m.x, 0.22, ap + 0.016], r: [Math.PI / 2, 0, 0], c: m.c, lo: m.c, hi: m.c, vary: 0.04, seed: 115 + i });
    });
    // üst kat küçük rozet kalkanı
    solid.add(plate([[-0.09, 0.1], [0.09, 0.1], [0.09, -0.02], [0, -0.12], [-0.09, -0.02]], 0.03), { p: [0, 1.28, 0.26], c: '#d8453f', seed: 125 });
    // kupa
    const cup = lathe([[0.001, 0], [0.16, 0.0], [0.16, 0.035], [0.045, 0.09], [0.04, 0.2], [0.2, 0.44], [0.17, 0.46], [0.001, 0.26]], 8);
    solid.add(cup, { p: [0, 1.49, 0], lo: GOLD_LO, hi: GOLD_HI, vary: 0.06, seed: 130 });
    for (const sx of [-1, 1]) {
        solid.add(new THREE.TorusGeometry(0.08, 0.017, 3, 6, Math.PI * 1.3), {
            p: [sx * 0.19, 1.82, 0],
            r: [0, 0, sx > 0 ? -Math.PI * 0.65 : Math.PI * -0.35 - 0.1],
            lo: GOLD_LO, hi: GOLD_HI, vary: 0.04, seed: 131 + (sx > 0 ? 1 : 0),
        });
    }
    // sancaklar
    for (const sx of [-1, 1]) {
        solid.add(cylinder(0.012, 0.012, 0.55, 4), { p: [sx * 0.43, 0.14, 0.12], c: '#d4d0e0', seed: 135 });
        solid.add(plate([[0, 0], [0.2 * sx, -0.06], [0, -0.12]], 0.012), { p: [sx * 0.43, 0.64, 0.12], c: sx > 0 ? '#d8453f' : '#3f7fd0', seed: 136 });
    }
    // parlayan yıldız
    const star = [];
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const r = i % 2 === 0 ? 0.17 : 0.07;
        star.push([Math.sin(a) * r, Math.cos(a) * r]);
    }
    glow.add(plate(star, 0.035), { p: [0, 2.2, 0], c: '#ffe27a', vary: 0, seed: 140 });
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        glow.add(new THREE.OctahedronGeometry(0.02, 0), { p: [Math.sin(a) * 0.46, 1.38, Math.cos(a) * 0.46], c: '#ffe27a', vary: 0, seed: 141 });
    }
    return { halo: [0, 2.2, 0], haloColor: '#ffd860', haloSize: 1.0 };
}

function buildDock(solid, glow) {
    const n = 10;
    for (let i = 0; i < n; i++) {
        solid.add(box(0.54, 0.035, 0.16), { p: [0, -0.02, 0.1 + i * 0.165], c: i % 2 ? '#b98655' : '#a87546', vary: 0.07, seed: 150 + i });
    }
    for (const z of [0.2, 0.9, 1.55]) {
        solid.add(box(0.62, 0.035, 0.045), { p: [0, -0.07, z], c: '#7a5232', vary: 0.03, seed: 160 });
    }
    for (const [i, z] of [0.18, 0.9, 1.6].entries()) {
        for (const sx of [-1, 1]) {
            const last = i === 2;
            solid.add(cylinder(0.04, 0.036, last ? 0.8 : 0.62, 5), { p: [sx * 0.3, last ? -0.5 : -0.5, z], lo: '#523622', hi: '#7a5232', ao: 0.4, seed: 162 + i });
        }
    }
    // iskele ucu lambası + sandık
    solid.add(cylinder(0.022, 0.022, 0.46, 5), { p: [-0.3, 0.0, 1.6], c: '#3b3340', seed: 170 });
    solid.add(box(0.1, 0.13, 0.1), { p: [-0.3, 0.44, 1.6], c: '#3b3340', ao: 0.2, seed: 171 });
    solid.add(cone(0.075, 0.07, 4), { p: [-0.3, 0.57, 1.6], c: '#3b3340', seed: 172 });
    glow.add(boxC(0.07, 0.09, 0.07), { p: [-0.3, 0.5, 1.6], c: '#ffcf70', vary: 0, seed: 173 });
    solid.add(box(0.16, 0.13, 0.15), { p: [0.18, 0.0, 0.34], r: [0, 0.3, 0], c: '#a8743f', seed: 174 });
    solid.add(box(0.17, 0.02, 0.16), { p: [0.18, 0.13, 0.34], r: [0, 0.3, 0], c: '#c99058', seed: 175 });
    return { halo: [-0.3, 0.5, 1.6], haloColor: '#ffd98a', haloSize: 0.6 };
}

const BUILDERS = {
    signpost: buildSignpost,
    mailbox: buildMailbox,
    lighthouse: buildLighthouse,
    trophy: buildTrophy,
    dock: buildDock,
};

/** Kayık gövdesi (animasyonlu, ayrı örgü). Yerel: y = su yüzeyi, uzun eksen z. */
export function buildBoat() {
    const b = createMeshBuilder();
    const hull = lathe([[0.001, -0.065], [0.1, -0.06], [0.17, -0.02], [0.2, 0.05], [0.205, 0.095], [0.185, 0.095], [0.165, 0.035], [0.1, -0.015], [0.001, -0.025]], 8);
    const red = rgb('#d94a45');
    const redLo = rgb('#a93232');
    const cream = rgb('#f6e8c8');
    b.add(hull, {
        s: [1, 1, 2.9],
        bend: (v) => {
            const u = Math.min(1, Math.abs(v.z) / 0.2);
            v.x *= 1 - 0.62 * u * u;
            v.y += u * u * u * 0.075;
        },
        colorFn: (x, y, z, t) => (t > 0.92 ? cream : mixRgb(redLo, red, Math.min(1, t * 1.3))),
        vary: 0.05,
        seed: 180,
    });
    b.add(box(0.2, 0.025, 0.1), { p: [0, 0.015, 0.06], c: '#c99058', seed: 181 });
    b.add(cylinder(0.011, 0.011, 0.72, 4, 'none'), { p: [-0.36, 0.1, -0.16], r: [0, 0, -Math.PI / 2], c: '#d9b27a', vary: 0, seed: 182 });
    b.add(boxC(0.1, 0.012, 0.07), { p: [-0.38, 0.1, -0.16], c: '#e5594e', vary: 0, seed: 183 });
    b.add(boxC(0.1, 0.012, 0.07), { p: [0.36, 0.1, -0.16], c: '#e5594e', vary: 0, seed: 184 });
    return { geometry: b.build(), triangles: b.triangles };
}

/** Işık huzmesi: ucuna doğru sönen, yarı saydam koni (yerel +z yönünde; köşe alfa). */
export function buildBeam() {
    const len = 2.6;
    const seg = 6;
    const g = new THREE.ConeGeometry(0.55, len, seg, 1, true);
    g.rotateX(Math.PI / 2); // koni ucu -z'ye
    g.rotateY(Math.PI); // uç +z'ye
    g.translate(0, 0, len / 2);
    const p = g.getAttribute('position');
    const col = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
        const t = p.getZ(i) / len; // 0: fener, 1: geniş ağız
        col[i * 4] = 1.0;
        col[i * 4 + 1] = 0.93;
        col[i * 4 + 2] = 0.7;
        col[i * 4 + 3] = Math.max(0, 1 - t) * 0.9;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    return { geometry: g, triangles: seg * 2 };
}

function toIsland(item, lx, lz) {
    const c = Math.cos(item.azimuth);
    const s = Math.sin(item.azimuth);
    return [item.x + lx * c + lz * s, item.z - lx * s + lz * c];
}

/**
 * Tüm simgeleri kurar.
 * Döner: { solid, glows:[{index, geometry}], halos, plaques, boat, beam, triangles }
 */
export function buildLandmarks(layout, field) {
    const solid = createMeshBuilder();
    const glows = [];
    const halos = [];
    const plaques = [];
    let boat = null;
    let beam = null;
    let triangles = 0;

    for (const item of layout.items) {
        const yOff = item.kind === 'dock' ? 0.06 : 0; // iskele zeminden biraz yüksek
        const y = field.heightAt(item.x, item.z) + yOff;
        const glow = createMeshBuilder();
        solid.setFrame(item.x, y, item.z, item.azimuth);
        glow.setFrame(item.x, y, item.z, item.azimuth);
        const info = (BUILDERS[item.kind] || buildSignpost)(solid, glow);

        // Etiket levhası: iki kazık (katı) + ayrı dokulu yüzey
        const pl = item.kind === 'dock' ? [-1.05, 0.12] : [0, 0.86];
        const [px, pz] = toIsland(item, pl[0], pl[1]);
        const py = field.heightAt(px, pz);
        solid.setFrame(px, py, pz, item.azimuth);
        for (const sx of [-0.46, 0.46]) solid.add(cylinder(0.03, 0.026, 0.3, 4), { p: [sx, -0.02, 0], c: '#6c452a', seed: 190 });
        plaques.push({ index: item.index, x: px, y: py + 0.31, z: pz, ry: item.azimuth, w: 1.36, h: 0.38 });
        solid.resetFrame();

        const gh = glow.build();
        glow.resetFrame();
        glows.push({ index: item.index, geometry: gh, triangles: glow.triangles });
        triangles += glow.triangles;
        const [hx, hz] = toIsland(item, info.halo[0], info.halo[2]);
        halos.push({ index: item.index, x: hx, y: y + info.halo[1], z: hz, color: info.haloColor, size: info.haloSize });

        if (item.kind === 'dock') {
            const [bx, bz] = toIsland(item, 0.55, 1.15);
            boat = { ...buildBoat(), x: bx, y: WATER_LEVEL + 0.012, z: bz, ry: item.azimuth + 0.12 };
            triangles += boat.triangles;
        }
        if (item.kind === 'lighthouse') {
            const [lx, lz] = toIsland(item, 0, 0);
            beam = { ...buildBeam(), x: lx, y: y + info.beamY, z: lz, index: item.index };
            triangles += beam.triangles;
        }
    }
    triangles += solid.triangles;
    return { solid: solid.build(), glows, halos, plaques, boat, beam, triangles };
}
