/*
 * Düşük poligonlu geometri kurucu: ilkelleri (kutu, silindir, koni, ikosahedron,
 * lathe...) tek bir düz gölgeli, köşe renkli BufferGeometry'ye birleştirir.
 *
 * - Her ilkel non-indexed'e çevrilir; normaller yüz normalidir (düz gölge).
 * - Renk: tek renk (c) ya da yerel y boyunca alt->üst degrade (lo/hi); `ao`
 *   alt kısmı karartır (çatlak/dip koyulaşması), `vary` yüz başına rastgele
 *   parlaklık verir (elle yontulmuş görünüm).
 * - Renkler three renk yönetimiyle doğrusal uzaya çevrilir (render sRGB çıkar).
 * - Pozisyon bazlı jitter: ortak köşeler aynı kayar (çatlak oluşmaz).
 */
import * as THREE from 'three';
import { hash32 } from '../runner/engine/mathUtils.js';

const _col = new THREE.Color();

/** '#rrggbb' ya da 0xrrggbb -> doğrusal [r, g, b]. */
export function rgb(hex) {
    _col.set(hex);
    return [_col.r, _col.g, _col.b];
}

export function mixRgb(a, b, t, out = [0, 0, 0]) {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
}

function hashPos(x, y, z, seed) {
    const a = Math.round(x * 997) | 0;
    const b = Math.round(y * 997) | 0;
    const c = Math.round(z * 997) | 0;
    return hash32(Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791) ^ seed) / 4294967296;
}

/** Konuma bağlı deterministik titreme (yerinde). */
export function jitterGeometry(geo, amp, seed = 1) {
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        p.setXYZ(
            i,
            x + (hashPos(x, y, z, seed + 1) - 0.5) * 2 * amp,
            y + (hashPos(x, y, z, seed + 2) - 0.5) * 2 * amp,
            z + (hashPos(x, y, z, seed + 3) - 0.5) * 2 * amp,
        );
    }
    p.needsUpdate = true;
    return geo;
}

export function createMeshBuilder() {
    const pos = [];
    const col = [];
    const frame = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const full = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const sc = new THREE.Vector3();
    const tr = new THREE.Vector3();
    const v = new THREE.Vector3();
    let faceCounter = 0;

    const api = {
        /** Sonraki ilkeller bu çerçevede (x, y, z, y-dönüşü) yerleşir. */
        setFrame(x = 0, y = 0, z = 0, ry = 0, scale = 1) {
            quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ry);
            frame.compose(tr.set(x, y, z), quat, sc.set(scale, scale, scale));
            return api;
        },
        resetFrame() {
            frame.identity();
            return api;
        },
        /**
         * o: { p:[x,y,z], r:[rx,ry,rz], s:sayı|[sx,sy,sz], c, lo, hi, ao, vary, jitter, seed,
         *      bend(v), colorFn(x,y,z)->[r,g,b], shade }
         */
        add(geometry, o = {}) {
            const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
            const p = g.getAttribute('position');
            const seed = o.seed ?? 1;
            if (o.jitter) jitterGeometry(g, o.jitter, seed);
            if (o.bend) {
                for (let i = 0; i < p.count; i++) {
                    v.set(p.getX(i), p.getY(i), p.getZ(i));
                    o.bend(v);
                    p.setXYZ(i, v.x, v.y, v.z);
                }
            }
            let minY = Infinity;
            let maxY = -Infinity;
            for (let i = 0; i < p.count; i++) {
                const y = p.getY(i);
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
            const span = Math.max(1e-6, maxY - minY);
            const s = o.s === undefined ? 1 : o.s;
            sc.set(Array.isArray(s) ? s[0] : s, Array.isArray(s) ? s[1] : s, Array.isArray(s) ? s[2] : s);
            const r = o.r || [0, 0, 0];
            euler.set(r[0], r[1], r[2], 'YXZ');
            quat.setFromEuler(euler);
            const q = o.p || [0, 0, 0];
            local.compose(tr.set(q[0], q[1], q[2]), quat, sc);
            full.multiplyMatrices(frame, local);
            const lo = rgb(o.lo ?? o.c ?? 0xcccccc);
            const hi = rgb(o.hi ?? o.c ?? 0xcccccc);
            const ao = o.ao ?? 0;
            const vary = o.vary ?? 0.05;
            const shade = o.shade ?? 1;
            const tmp = [0, 0, 0];
            const flip = full.determinant() < 0; // aynalı ölçek: sarım tersine döner, düzelt
            const order = flip ? [0, 2, 1] : [0, 1, 2];
            for (let i = 0; i < p.count; i += 3) {
                faceCounter++;
                const fv = 1 + (hash32(faceCounter * 2654435761 + seed) / 4294967296 - 0.5) * 2 * vary;
                for (let k = 0; k < 3; k++) {
                    const idx = i + order[k];
                    const lx = p.getX(idx);
                    const ly = p.getY(idx);
                    const lz = p.getZ(idx);
                    const t = (ly - minY) / span;
                    v.set(lx, ly, lz).applyMatrix4(full);
                    pos.push(v.x, v.y, v.z);
                    if (o.colorFn) {
                        const c = o.colorFn(v.x, v.y, v.z, t);
                        col.push(c[0] * fv * shade, c[1] * fv * shade, c[2] * fv * shade);
                    } else {
                        mixRgb(lo, hi, t, tmp);
                        const dark = (1 - ao * (1 - t)) * fv * shade;
                        col.push(tmp[0] * dark, tmp[1] * dark, tmp[2] * dark);
                    }
                }
            }
            g.dispose();
            return api;
        },
        get triangles() {
            return pos.length / 9;
        },
        build() {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
            geo.computeVertexNormals(); // non-indexed: yüz normali (düz gölge)
            geo.computeBoundingSphere();
            geo.computeBoundingBox();
            return geo;
        },
    };
    return api;
}

// --- İlkel kısayolları -------------------------------------------------------

/**
 * Kesik koni/silindir: yarıçap alt->üst, yükseklik h, taban y = 0.
 * caps: 'top' (varsayılan; alt kapak hep gizli, üçgen tasarrufu) | 'none' | 'both'.
 */
export function cylinder(rBottom, rTop, h, seg = 6, caps = 'top') {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, caps === 'none');
    g.translate(0, h / 2, 0);
    if (caps === 'top' && rBottom > 0 && g.groups.length > 1) {
        const idx = g.index.array;
        const keep = [];
        for (const grp of g.groups) {
            if (grp.materialIndex === 2) continue; // alt kapak
            for (let i = grp.start; i < grp.start + grp.count; i++) keep.push(idx[i]);
        }
        g.setIndex(keep);
        g.clearGroups();
    }
    return g;
}

/** Taban y = 0 kutu. */
export function box(w, h, d) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return g;
}

/** Merkezi y = 0 kutu. */
export function boxC(w, h, d) {
    return new THREE.BoxGeometry(w, h, d);
}

export function cone(r, h, seg = 6) {
    return cylinder(r, 0.0001, h, seg, 'none');
}

export function blob(r = 1, detail = 0) {
    return new THREE.IcosahedronGeometry(r, detail);
}

/** Dönel gövde: profil [[yarıçap, y], ...] (alttan üste). */
export function lathe(profile, seg = 8) {
    return new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), seg);
}

/** Üçgen kesitli prizma (çatı): taban genişliği w, yükseklik h, uzunluk l (z boyunca). */
export function prism(w, h, l) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(0, h);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: l, bevelEnabled: false });
    g.translate(0, 0, -l / 2);
    return g;
}

/** Yassı çokgen levha (z kalınlığı t) verilen [x, y] noktalarından. */
export function plate(points, t) {
    const s = new THREE.Shape();
    points.forEach((p, i) => (i === 0 ? s.moveTo(p[0], p[1]) : s.lineTo(p[0], p[1])));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
    g.translate(0, 0, -t / 2);
    return g;
}
