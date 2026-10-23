/*
 * Ada süsleri: ağaçlar (örnekli çam/palmiye/yuvarlak), evler, kayalar,
 * çiçekler. Yerleşim tohumlu ve deterministik; simge tabanlarından ve
 * göletten uzak durur (testte doğrulanır).
 */
import * as THREE from 'three';
import { seededRandom } from '../runner/engine/mathUtils.js';
import { createMeshBuilder, blob, box, cone, cylinder, prism } from './geo.js';

/** Boşluk başına küme: [tür, yarıçap, teğet kayma]. Desen i % 5 ile seçilir. */
const GAP_PATTERNS = [
    [['house', 2.5, 0.0, 0], ['palm', 3.3, 0.55], ['round', 3.05, -0.6]],
    [['pine', 3.05, 0.1], ['pine', 2.55, -0.55], ['round', 3.25, 0.65]],
    [['pine', 3.15, -0.45], ['pine', 3.25, 0.55], ['palm', 2.7, 0.0], ['round', 2.3, 0.85]],
    [['house', 2.5, 0.1, 1], ['palm', 3.35, -0.45], ['pine', 2.95, 0.75]],
    [['round', 2.95, 0.0], ['palm', 3.4, 0.55], ['house', 2.3, -0.75, 2], ['pine', 3.2, -0.65]],
];

export const TREE_TYPES = ['pine', 'palm', 'round'];

/** Düzenleme: ağaç/ev/kaya/çiçek konumları + taban gölgesi için engeller. */
export function layoutProps(layout, field, seed = 5) {
    const rnd = seededRandom(seed * 7919 + layout.n);
    const trees = [];
    const houses = [];
    const rocks = [];
    const flowers = [];
    const occluders = [];
    const taken = []; // {x, z, r}

    const pondClear = (x, z, r) => !layout.pond || Math.hypot(x - layout.pond.x, z - layout.pond.z) > layout.pond.r * 0.98 + r;
    const free = (x, z, r) => {
        for (const t of taken) if (Math.hypot(x - t.x, z - t.z) < t.r + r) return false;
        for (const it of layout.items) if (Math.hypot(x - it.x, z - it.z) < (it.kind === 'dock' ? 0.9 : 0.78) + r) return false;
        return pondClear(x, z, r) && Math.hypot(x, z) > 1.45 + r * 0.3;
    };
    const place = (x, z, r) => {
        taken.push({ x, z, r });
    };

    layout.gaps.forEach((gap, gi) => {
        const pattern = GAP_PATTERNS[gi % GAP_PATTERNS.length];
        const tx = Math.cos(gap.azimuth);
        const tz = -Math.sin(gap.azimuth);
        for (const [kind, rad, off, variant] of pattern) {
            const x = gap.x * rad + tx * off;
            const z = gap.z * rad + tz * off;
            const size = kind === 'house' ? 0.42 : kind === 'pine' ? 0.3 : 0.33;
            if (!free(x, z, size)) continue;
            place(x, z, size);
            const y = field.heightAt(x, z) - 0.03;
            if (kind === 'house') {
                houses.push({ x, z, y, rot: Math.atan2(x, z) + (rnd() - 0.5) * 0.5, variant: variant || 0 });
                occluders.push({ x, z, r: 0.5, s: 0.6 });
            } else {
                const scale = kind === 'pine' ? 0.78 + rnd() * 0.3 : kind === 'palm' ? 0.9 + rnd() * 0.25 : 0.8 + rnd() * 0.25;
                const tint = 0.9 + rnd() * 0.16;
                trees.push({ kind, x, y, z, scale, rot: rnd() * Math.PI * 2, tint, phase: rnd() * 6.28 });
                occluders.push({ x, z, r: 0.38 * scale, s: 0.5 });
            }
        }
    });

    // Kayalar: kenara ve göletin çevresine serpiştirilmiş.
    let guard = 0;
    while (rocks.length < 7 && guard++ < 200) {
        const az = rnd() * Math.PI * 2;
        const rad = rocks.length < 4 ? 3.45 + rnd() * 0.35 : 1.9 + rnd() * 1.4;
        const x = Math.sin(az) * rad;
        const z = Math.cos(az) * rad;
        const s = 0.07 + rnd() * 0.1;
        if (!free(x, z, s + 0.12)) continue;
        place(x, z, s + 0.12);
        rocks.push({ x, y: field.heightAt(x, z) - 0.02, z, s, rot: rnd() * 6.28 });
        occluders.push({ x, z, r: s * 3, s: 0.3 });
    }
    // Göletin kıyısına birkaç taş (kıyıda sıralı).
    if (layout.pond) {
        for (let i = 0; i < 5; i++) {
            const a = layout.pond.azimuth + Math.PI * (0.62 + i * 0.2);
            const x = layout.pond.x + Math.sin(a) * layout.pond.r * 1.02;
            const z = layout.pond.z + Math.cos(a) * layout.pond.r * 1.02;
            const s = 0.05 + rnd() * 0.05;
            if (Math.hypot(x, z) > 3.5) continue;
            if (!free(x, z, s)) continue;
            place(x, z, s);
            rocks.push({ x, y: field.heightAt(x, z) - 0.01, z, s, rot: rnd() * 6.28 });
        }
    }

    // Çiçek kümeleri
    const palette = ['#ff7aa8', '#ffd25a', '#ffffff', '#ff9a62', '#b88cff'];
    guard = 0;
    let clusters = 0;
    while (clusters < 5 && guard++ < 300) {
        const az = rnd() * Math.PI * 2;
        const rad = 1.9 + rnd() * 1.5;
        const cx = Math.sin(az) * rad;
        const cz = Math.cos(az) * rad;
        if (!free(cx, cz, 0.18)) continue;
        place(cx, cz, 0.22);
        const color = palette[clusters % palette.length];
        for (let i = 0; i < 3; i++) {
            const fx = cx + (rnd() - 0.5) * 0.28;
            const fz = cz + (rnd() - 0.5) * 0.28;
            flowers.push({ x: fx, y: field.heightAt(fx, fz), z: fz, color, s: 0.9 + rnd() * 0.4 });
        }
        clusters++;
    }

    // Simgelerin taban gölgesi
    for (const it of layout.items) occluders.push({ x: it.x, z: it.z, r: it.kind === 'dock' ? 0.55 : 0.62, s: 0.55 });
    occluders.push({ x: 0, z: 0, r: 0.55, s: 0.45 }); // karakterin altı

    return { trees, houses, rocks, flowers, occluders };
}

// --- Ağaç şablonları (köşe renkli; örnek rengi ile çarpılır) --------------------

export function buildTreeTemplate(kind) {
    const b = createMeshBuilder();
    if (kind === 'pine') {
        b.add(cylinder(0.055, 0.04, 0.26, 5, 'none'), { c: '#6d4b36', ao: 0.3, seed: 2 });
        b.add(cone(0.36, 0.52, 6), { p: [0, 0.14, 0], lo: '#1d6a47', hi: '#3a9a5a', ao: 0.4, jitter: 0.015, seed: 3 });
        b.add(cone(0.29, 0.46, 6), { p: [0, 0.4, 0], lo: '#23784d', hi: '#47a85f', ao: 0.35, jitter: 0.015, seed: 4 });
        b.add(cone(0.2, 0.42, 6), { p: [0, 0.66, 0], lo: '#2a8a54', hi: '#62bd6a', ao: 0.3, jitter: 0.012, seed: 5 });
    } else if (kind === 'palm') {
        const segs = 4;
        let x = 0;
        let y = 0;
        for (let i = 0; i < segs; i++) {
            const r0 = 0.062 - i * 0.008;
            const r1 = 0.062 - (i + 1) * 0.008;
            const lean = 0.18 + i * 0.05;
            b.add(cylinder(r0, r1, 0.24, 5, i === segs - 1 ? 'top' : 'none'), {
                p: [x, y, 0],
                r: [0, 0, -lean],
                c: i % 2 ? '#b98859' : '#a9794c',
                ao: 0.2,
                vary: 0.04,
                seed: 6 + i,
            });
            x += Math.sin(lean) * 0.24;
            y += Math.cos(lean) * 0.24;
        }
        const top = [x, y, 0];
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            b.add(cone(0.14, 0.66, 3), {
                p: [top[0], top[1] + 0.02, top[2]],
                r: [0, a, 0],
                s: [1, 1, 1],
                bend: (v) => {
                    // koniyi yatıra: y ekseni boyunca uzanan yaprağı x'e doğru kıvır
                    const t = v.y;
                    const ox = v.x;
                    v.x = ox * 0.9 + t * 0.95;
                    v.y = t * 0.28 - t * t * 0.55 + Math.abs(ox) * 0.2;
                    v.z *= 1.15;
                },
                lo: '#2c8a4e',
                hi: '#7cc765',
                vary: 0.08,
                seed: 20 + i,
            });
        }
        b.add(new THREE.OctahedronGeometry(0.06, 0), { p: [top[0] + 0.01, top[1] - 0.05, 0.02], c: '#7a4a2a', seed: 40 });
    } else {
        b.add(cylinder(0.06, 0.045, 0.34, 5, 'none'), { c: '#6f4d38', ao: 0.3, seed: 8 });
        b.add(blob(0.3, 0), { p: [0, 0.52, 0], lo: '#2f8f50', hi: '#6fc45c', ao: 0.45, jitter: 0.03, seed: 9, s: [1, 0.9, 1] });
        b.add(blob(0.21, 0), { p: [0.17, 0.66, 0.04], lo: '#3a9d54', hi: '#8ad466', ao: 0.3, jitter: 0.02, seed: 10 });
        b.add(blob(0.22, 0), { p: [-0.16, 0.5, -0.06], lo: '#33964f', hi: '#78cb5f', ao: 0.4, jitter: 0.02, seed: 11 });
    }
    return { geometry: b.build(), triangles: b.triangles };
}

const HOUSE_STYLES = [
    { wall: '#f6e6cd', roof: '#d2593f', roofHi: '#ee7a58', door: '#7a4a32' },
    { wall: '#e9f0e2', roof: '#3f8fa3', roofHi: '#62b3c4', door: '#8a5436' },
    { wall: '#f1d9d2', roof: '#8a5fb0', roofHi: '#ad82d3', door: '#6b4630' },
];

/** Evler (tek birleşik geometri) + pencere ışıkları (ayrı, MeshBasic). */
export function buildHouses(houses) {
    const solid = createMeshBuilder();
    const glow = createMeshBuilder();
    houses.forEach((h, i) => {
        const st = HOUSE_STYLES[h.variant % HOUSE_STYLES.length];
        solid.setFrame(h.x, h.y, h.z, h.rot);
        glow.setFrame(h.x, h.y, h.z, h.rot);
        const w = 0.48;
        const d = 0.4;
        const hh = 0.3;
        solid.add(box(w, hh, d), { lo: st.wall, hi: st.wall, ao: 0.28, seed: 50 + i });
        solid.add(prism(w + 0.12, 0.24, d + 0.1), { p: [0, hh - 0.005, 0], lo: st.roof, hi: st.roofHi, vary: 0.07, seed: 60 + i });
        solid.add(box(0.07, 0.16, 0.07), { p: [w * 0.22, hh + 0.12, -0.06], c: '#8a7468', seed: 70 + i });
        solid.add(box(0.1, 0.19, 0.03), { p: [-0.07, 0, d / 2 + 0.005], c: st.door, seed: 80 + i });
        solid.add(box(0.14, 0.03, 0.06), { p: [0, 0, d / 2 + 0.05], c: '#bfb2a6', seed: 90 + i }); // basamak
        glow.add(box(0.1, 0.09, 0.02), { p: [0.14, 0.12, d / 2 + 0.008], c: '#ffd88a', vary: 0, seed: 1 });
        glow.add(box(0.02, 0.09, 0.09), { p: [w / 2 + 0.006, 0.12, 0.02], c: '#ffd88a', vary: 0, seed: 2 });
    });
    solid.resetFrame();
    glow.resetFrame();
    return {
        solid: solid.build(),
        glow: glow.build(),
        triangles: solid.triangles + glow.triangles,
    };
}

export function buildRocks(rocks) {
    const b = createMeshBuilder();
    rocks.forEach((r, i) => {
        b.add(blob(1, 0), {
            p: [r.x, r.y + r.s * 0.3, r.z],
            r: [0, r.rot, 0],
            s: [r.s * 1.3, r.s * 0.85, r.s],
            lo: '#7d6f86',
            hi: '#b4a6b8',
            ao: 0.5,
            jitter: 0.12,
            seed: 100 + i,
        });
    });
    return { geometry: b.build(), triangles: b.triangles };
}

export function buildFlowers(flowers) {
    const b = createMeshBuilder();
    flowers.forEach((f, i) => {
        b.add(new THREE.OctahedronGeometry(0.04 * f.s, 0), { p: [f.x, f.y + 0.05 * f.s, f.z], s: [1, 0.8, 1], c: f.color, vary: 0.04, seed: 130 + i });
    });
    return { geometry: b.build(), triangles: b.triangles };
}
