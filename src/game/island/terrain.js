/*
 * Ada gövdesi: yükseklik alanı, düz gölgeli üst yüzey (dairesel ızgara),
 * kayalık alt yüzey, gölet ve parlayan kristaller.
 *
 * Yükseklik alanı saftır (heightAt): ağaç, ev ve simgeler yüksekliği ondan
 * alır; üst yüzey ağı onu örnekler. Üst yüzeyin dış halkası ile alt yüzeyin
 * ilk halkası aynı köşelerdir (kapalı, çatlaksız).
 */
import * as THREE from 'three';
import { fbm2, mix, smoothstep, valueNoise2 } from './noise.js';
import { createMeshBuilder, mixRgb, rgb } from './geo.js';
import { HILL_RADIUS, ISLAND_RADIUS, POND_FLOOR, WATER_LEVEL } from './layout.js';

export const TOP_SEGMENTS = 28;
export const TOP_RINGS = 9;
export const UNDER_RINGS = 6;
export const ISLAND_DEPTH = 4.2; // yüz alt ucunun üst kenara göre derinliği

const TAU = Math.PI * 2;

export function createHeightField(layout, seed = 11) {
    const rimNoise = (az) => {
        const c = Math.cos(az);
        const s = Math.sin(az);
        return valueNoise2(c * 1.3 + 20, s * 1.3 + 20, seed) * 0.7 + valueNoise2(c * 3.1 + 7, s * 3.1 + 7, seed + 3) * 0.3;
    };
    const rimRadius = (az) => ISLAND_RADIUS * (0.93 + 0.14 * rimNoise(az));

    function baseHeight(x, z) {
        const r = Math.hypot(x, z);
        const rho = r / rimRadius(Math.atan2(x, z));
        let h = 0.1 * (1 - rho * rho);
        h += 0.7 * (1 - smoothstep(0.55, HILL_RADIUS, r)); // orta tepe (üstü düz)
        h -= 0.5 * Math.pow(smoothstep(0.78, 1.0, rho), 1.4); // kenar yuvarlanması
        return h;
    }

    function heightAt(x, z) {
        const r = Math.hypot(x, z);
        let h = baseHeight(x, z);
        // Yumuşak engebe: merkezde ve simge tabanlarında sönümlenir.
        let pad = 0;
        for (let i = 0; i < layout.pads.length; i++) {
            const p = layout.pads[i];
            const d = Math.hypot(x - p.x, z - p.z);
            pad = Math.max(pad, 1 - smoothstep(p.r * 0.6, p.r * 1.35, d));
        }
        const n = (fbm2(x * 0.8 + 3, z * 0.8 + 3, seed, 3) - 0.5) * 0.26;
        h += n * (1 - pad) * smoothstep(1.0, 2.0, r);
        h = mix(h, 0.04, pad * 0.85);
        if (layout.pond) {
            const d = Math.hypot(x - layout.pond.x, z - layout.pond.z) / layout.pond.r;
            h = mix(h, POND_FLOOR, 1 - smoothstep(1.0, 1.75, d)); // gölet tabanı düz; çevresi yumuşakça iner
        }
        if (r > ISLAND_RADIUS * 1.05) h -= (r - ISLAND_RADIUS * 1.05) * 0.5; // kenar dışında sürekli düşüş
        return h;
    }

    return { heightAt, rimRadius, baseHeight, waterLevel: WATER_LEVEL, seed };
}

// --- Halka ızgarası ------------------------------------------------------------

/** İki halka (köşe dizisi, açı dizisi) arasını fermuar gibi üçgenler. */
function zipper(ringA, angA, ringB, angB, emit) {
    const n = ringA.length;
    let i = 0;
    let j = 0;
    while (i < n || j < n) {
        const nextA = (i + 1 < n ? angA[i + 1] : angA[0] + TAU);
        const nextB = (j + 1 < n ? angB[j + 1] : angB[0] + TAU);
        if (j >= n || (i < n && nextA <= nextB)) {
            emit(ringA[i % n], ringB[j % n], ringA[(i + 1) % n]);
            i++;
        } else {
            emit(ringA[i % n], ringB[j % n], ringB[(j + 1) % n]);
            j++;
        }
    }
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Üçgenleri yönlendirip yüz başına renk veren yardımcı. */
function createTriSink(orient, colorFn) {
    const pos = [];
    const col = [];
    return {
        emit(p0, p1, p2) {
            _a.set(p0[0], p0[1], p0[2]);
            _b.set(p1[0], p1[1], p1[2]);
            _c.set(p2[0], p2[1], p2[2]);
            _n.crossVectors(_b.clone().sub(_a), _c.clone().sub(_a)).normalize();
            const cx = (p0[0] + p1[0] + p2[0]) / 3;
            const cy = (p0[1] + p1[1] + p2[1]) / 3;
            const cz = (p0[2] + p2[2] + p1[2]) / 3;
            let [q0, q1, q2] = [p0, p1, p2];
            if (!orient(_n, cx, cy, cz)) {
                [q1, q2] = [q2, q1];
                _n.negate();
            }
            const c = colorFn(cx, cy, cz, _n.y);
            pos.push(q0[0], q0[1], q0[2], q1[0], q1[1], q1[2], q2[0], q2[1], q2[2]);
            for (let k = 0; k < 3; k++) col.push(c[0], c[1], c[2]);
        },
        build() {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
            geo.computeVertexNormals();
            geo.computeBoundingSphere();
            return geo;
        },
        get triangles() {
            return pos.length / 9;
        },
    };
}

const PAL = {
    lush: rgb('#3f9f5c'),
    mid: rgb('#63be62'),
    light: rgb('#98d86a'),
    warm: rgb('#d3e26c'),
    lip: rgb('#7c9a4c'),
    soil: rgb('#8c6a4e'),
    sandBank: rgb('#e6d29b'),
    pondBed: rgb('#b8a97f'),
    rockTop: rgb('#a39098'),
    rockMid: rgb('#85748b'),
    rockLow: rgb('#5d4f6c'),
    rockDeep: rgb('#43385a'),
    moss: rgb('#5b9d55'),
    shadow: rgb('#2c5a6a'),
};

/**
 * Üst yüzey. occluders: [{x, z, r, s}] (ağaç/ev/simge) taban gölgesi için.
 * Döner: { geometry, triangles, ringVerts }.
 */
export function buildIslandTop(field, layout, occluders = []) {
    const N = TOP_SEGMENTS;
    const K = TOP_RINGS;
    const d = TAU / N;
    const rings = [];
    const angs = [];
    const vert = (az, rho) => {
        const rr = field.rimRadius(az) * rho;
        const x = Math.sin(az) * rr;
        const z = Math.cos(az) * rr;
        return [x, field.heightAt(x, z), z];
    };
    for (let k = 1; k <= K; k++) {
        const off = (k % 2) * 0.5;
        const ring = [];
        const ang = [];
        for (let j = 0; j < N; j++) {
            const az = (j + off) * d;
            ring.push(vert(az, k / K));
            ang.push(az);
        }
        rings.push(ring);
        angs.push(ang);
    }
    const center = [0, field.heightAt(0, 0), 0];

    const tmp = [0, 0, 0];
    const colorFn = (x, y, z) => {
        const r = Math.hypot(x, z);
        const rho = r / field.rimRadius(Math.atan2(x, z));
        const patch = fbm2(x * 0.75 + 11, z * 0.75 + 5, field.seed + 9, 3);
        const patch2 = fbm2(x * 1.4 + 40, z * 1.4 + 2, field.seed + 21, 2);
        mixRgb(PAL.lush, PAL.mid, smoothstep(0.25, 0.65, patch), tmp);
        mixRgb(tmp, PAL.light, Math.min(0.75, Math.max(0, y * 1.1 - 0.05) + smoothstep(0.62, 0.85, patch2) * 0.35), tmp);
        mixRgb(tmp, PAL.warm, smoothstep(0.7, 0.9, patch) * 0.3, tmp);
        mixRgb(tmp, PAL.lip, smoothstep(0.78, 0.9, rho) * 0.7, tmp);
        mixRgb(tmp, PAL.soil, smoothstep(0.9, 1.0, rho) * 0.65, tmp);
        if (layout.pond) {
            const dp = Math.hypot(x - layout.pond.x, z - layout.pond.z) / layout.pond.r;
            mixRgb(tmp, PAL.sandBank, (1 - smoothstep(1.0, 1.5, dp)) * 0.9, tmp);
            mixRgb(tmp, PAL.pondBed, (1 - smoothstep(0.7, 1.05, dp)) * 0.8, tmp);
        }
        // Taban gölgesi (blob AO)
        let ao = 0;
        for (let i = 0; i < occluders.length; i++) {
            const o = occluders[i];
            const dd = ((x - o.x) * (x - o.x) + (z - o.z) * (z - o.z)) / (o.r * o.r);
            if (dd < 6) ao += o.s * Math.exp(-dd * 1.4);
        }
        ao = Math.min(0.55, ao);
        mixRgb(tmp, PAL.shadow, ao * 0.45, tmp);
        const k = 1 - ao * 0.32;
        // yüz başına küçük sapma
        const vv = 1 + (valueNoise2(x * 9.1, z * 9.1, 5) - 0.5) * 0.08;
        return [tmp[0] * k * vv, tmp[1] * k * vv, tmp[2] * k * vv];
    };
    const sink = createTriSink((n) => n.y >= 0, colorFn);
    for (let j = 0; j < N; j++) sink.emit(center, rings[0][j], rings[0][(j + 1) % N]);
    for (let k = 1; k < K; k++) zipper(rings[k - 1], angs[k - 1], rings[k], angs[k], sink.emit);
    return { geometry: sink.build(), triangles: sink.triangles, rimRing: rings[K - 1], rimAngles: angs[K - 1] };
}

/** Kayalık alt yüzey. Döner: { geometry, triangles, anchors }. */
export function buildIslandUnder(field, rimRing, rimAngles) {
    const N = rimRing.length;
    const M = UNDER_RINGS;
    const d = TAU / N;
    const rings = [rimRing];
    const angs = [rimAngles];
    const off0 = (rimAngles[0] / d) % 1;
    const yRim = rimRing.reduce((s, p) => s + p[1], 0) / N;
    const seed = field.seed + 31;
    for (let m = 1; m <= M; m++) {
        const t = m / (M + 1);
        const off = (off0 + 0.5 * m) % 1;
        const ring = [];
        const ang = [];
        for (let j = 0; j < N; j++) {
            const az = (j + off) * d;
            const c = Math.cos(az);
            const s = Math.sin(az);
            const lump = valueNoise2(c * 2.1 + m * 3.7, s * 2.1 + m * 1.3, seed);
            const lump2 = valueNoise2(c * 4.3 + m * 1.9, s * 4.3 + m * 5.1, seed + 4);
            const profile = Math.pow(1 - Math.pow(t, 1.3), 0.85); // üstte dolgun, aşağıda sivrilen havuç gövde
            const r = field.rimRadius(az) * profile * (0.82 + 0.4 * lump) * (m === 1 ? 0.97 : 1);
            const y = yRim - ISLAND_DEPTH * Math.pow(t, 0.9) + (lump2 - 0.5) * 0.55;
            ring.push([s * r, y, c * r]);
            ang.push(az);
        }
        rings.push(ring);
        angs.push(ang);
    }
    const tip = [0.1, yRim - ISLAND_DEPTH - 0.45, -0.06];

    const tmp = [0, 0, 0];
    const colorFn = (x, y, z, ny) => {
        const dep = Math.min(1, Math.max(0, (yRim - y) / ISLAND_DEPTH));
        const strata = 0.5 + 0.5 * Math.sin(y * 5.2 + valueNoise2(x * 1.3, z * 1.3, seed) * 3.0);
        if (dep < 0.5) mixRgb(PAL.rockTop, PAL.rockMid, dep / 0.5, tmp);
        else mixRgb(PAL.rockMid, PAL.rockLow, (dep - 0.5) / 0.5, tmp);
        mixRgb(tmp, PAL.rockDeep, smoothstep(0.78, 1, dep) * 0.8, tmp);
        // üst kenarda toprak ve sarkan yeşil yosun
        mixRgb(tmp, PAL.soil, (1 - smoothstep(0.02, 0.2, dep)) * 0.8, tmp);
        const mossy = valueNoise2(x * 3.3 + 5, z * 3.3, seed + 8) * (1 - smoothstep(0.0, 0.3, dep));
        mixRgb(tmp, PAL.moss, smoothstep(0.45, 0.7, mossy) * 0.9, tmp);
        const k = (0.9 + 0.12 * strata) * (ny < -0.45 ? 0.84 : 1) * (1 - dep * 0.18);
        return [tmp[0] * k, tmp[1] * k, tmp[2] * k];
    };
    const sink = createTriSink((n, cx, cy, cz) => n.x * cx + n.y * (cy + 1.5) + n.z * cz >= 0, colorFn);
    for (let m = 1; m <= M; m++) zipper(rings[m - 1], angs[m - 1], rings[m], angs[m], sink.emit);
    const last = rings[M];
    for (let j = 0; j < N; j++) sink.emit(last[j], tip, last[(j + 1) % N]);
    // Sarkan kaya sivriltileri (siluet kırılsın)
    for (const [m, j, len] of [[3, 4, 0.9], [4, 12, 1.1], [3, 20, 0.8], [5, 8, 0.8], [4, 25, 1.0]]) {
        const p = rings[m][j % N];
        const hl = Math.hypot(p[0], p[2]) || 1;
        const dx = p[0] / hl;
        const dz = p[2] / hl;
        const base = [];
        for (let k = 0; k < 5; k++) {
            const a = (k / 5) * TAU;
            const u = Math.cos(a) * 0.2;
            const v = Math.sin(a) * 0.17;
            base.push([p[0] + dz * u - dx * 0.06, p[1] + v, p[2] - dx * u - dz * 0.06]);
        }
        const sp = [p[0] + dx * 0.05, p[1] - len, p[2] + dz * 0.05];
        for (let k = 0; k < 5; k++) sink.emit(base[k], sp, base[(k + 1) % 5]);
    }
    // Kristaller için çapalar: orta halkalardan seçilmiş köşeler + çıkış yönü
    const anchors = [];
    const picks = [
        [2, 1], [3, 8], [2, 15], [4, 18], [3, 23], [5, 3],
    ];
    for (const [m, j] of picks) {
        const p = rings[m][j % N];
        const len = Math.hypot(p[0], p[2]) || 1;
        anchors.push({ x: p[0], y: p[1], z: p[2], dx: p[0] / len, dz: p[2] / len });
    }
    return { geometry: sink.build(), triangles: sink.triangles, anchors };
}

/** Altta sarkan parlayan kristaller (MeshBasic, köşe renkli). */
export function buildCrystals(anchors) {
    const b = createMeshBuilder();
    const colors = [
        ['#2fe3d4', '#b9fff0'],
        ['#ff7ac8', '#ffd1ee'],
        ['#7fb4ff', '#d8e8ff'],
    ];
    anchors.forEach((a, i) => {
        const [lo, hi] = colors[i % colors.length];
        const tilt = Math.atan2(a.dx, a.dz);
        const h = 0.34 + (i % 3) * 0.1;
        b.add(new THREE.OctahedronGeometry(0.5, 0), {
            p: [a.x + a.dx * 0.08, a.y - 0.06, a.z + a.dz * 0.08],
            r: [0.5, tilt, 0.15 * (i % 2 ? 1 : -1)],
            s: [0.11, h, 0.11],
            lo,
            hi,
            vary: 0.08,
            seed: i + 3,
        });
    });
    return { geometry: b.build(), triangles: b.triangles };
}

/** Gölet suyu: düzensiz yarıçaplı disk, merkezden kıyıya renk geçişi. */
export function buildPond(pond, level = WATER_LEVEL) {
    const seg = 18;
    const pos = [pond.x, level, pond.z];
    const col = [];
    const deep = rgb('#2b9fc2');
    const shallow = rgb('#8fe6e0');
    col.push(...deep);
    const ring = [];
    for (let j = 0; j < seg; j++) {
        const a = (j / seg) * TAU;
        const rr = pond.r * (0.98 + 0.07 * Math.sin(j * 2.3 + 1));
        ring.push(pond.x + Math.sin(a) * rr, level, pond.z + Math.cos(a) * rr);
        col.push(...shallow);
    }
    pos.push(...ring);
    const index = [];
    for (let j = 0; j < seg; j++) index.push(0, 1 + j, 1 + ((j + 1) % seg));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex(index);
    geo.computeBoundingSphere();
    return { geometry: geo, triangles: seg };
}
