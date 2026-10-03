/*
 * 3D oyun karakteri (avatar): katalog yapılandırmasından (catalog.js)
 * primitiflerle kurulan, sevimli oranlı, toon gölgeli karakter.
 *
 * Tek SkinnedMesh + tek "ışıyan" SkinnedMesh (göz parıltısı, neon taban,
 * taç taşları): her vücut parçası tek bir kemiğe %100 bağlı (rijit kaplama).
 * Böylece karakter 16 eklemli bir iskelete sahip olduğu halde yalnızca 2
 * draw call tutar (v1'de 12 ayrı mesh vardı).
 *
 * Ölçek: 1 birim = 1 m, boy ≈ 1.7; orijin ayak tabanı ortası; yüz -Z yönüne
 * bakar (koşu yönü). rig'deki her düğüm eklem noktasında pivotlu bir
 * THREE.Bone; animasyon kodu yalnızca rotation (ve hips.position.y) ile
 * oynar. Dinlenme pozunda tüm dönüşler 0: kemiklerin kök uzayındaki
 * matrisi saf öteleme olduğundan bağlama (bind) matrisleri basit.
 *
 * Poz yardımcıları (poseIdle/poseRun/...) saf: verilen rig benzeri nesneye
 * ({ rotation:{x,y,z}, position:{x,y,z} } alanları olan düğümler) yazar.
 * Yumuşak geçiş için createPoseTarget + blendPose kullanılır (önce hedefe
 * poz yazılır, sonra gerçek rig hedefe üstel sönümle yaklaştırılır).
 */
import * as THREE from 'three';
import { GeoBuilder } from '../runner/engine/geoBuilder.js';
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, normalizeAvatar } from './catalog.js';

// Kemik sırası (skinIndex bu dizinleri kullanır).
export const BONES = [
    'hips', 'spine', 'chest', 'neck', 'head', 'hair',
    'armL', 'foreArmL', 'armR', 'foreArmR',
    'legL', 'shinL', 'footL', 'legR', 'shinR', 'footR',
];
const PARENT = {
    hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', hair: 'head',
    armL: 'chest', foreArmL: 'armL', armR: 'chest', foreArmR: 'armR',
    legL: 'hips', shinL: 'legL', footL: 'shinL', legR: 'hips', shinR: 'legR', footR: 'shinR',
};
const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b, i]));

/*
 * Vücut oranları (m). hipY = thigh + shin + ankle. Kız: daha dar omuz ve bel,
 * biraz daha geniş kalça, ince uzuvlar; erkek: geniş omuz, düz gövde.
 */
export const BODY_DIMS = {
    erkek: { thigh: 0.385, shin: 0.37, ankle: 0.08, legX: 0.092, spineY: 0.07, chestY: 0.1, neckY: 0.255, headY: 0.06, shX: 0.19, shY: 0.218, upper: 0.245, fore: 0.225, chestR: 0.172, waistR: 0.148, pelvisR: 0.148, depth: 0.7, limb: 1 },
    kiz: { thigh: 0.375, shin: 0.36, ankle: 0.08, legX: 0.088, spineY: 0.065, chestY: 0.094, neckY: 0.24, headY: 0.06, shX: 0.168, shY: 0.205, upper: 0.232, fore: 0.214, chestR: 0.152, waistR: 0.122, pelvisR: 0.152, depth: 0.74, limb: 0.9 },
};
const HEAD_R = 0.165;
// Baş (ve saç/aksesuar) bütün olarak biraz büyük: sevimli oran (≈ 4.6 baş boy).
export const HEAD_SCALE = 1.1;
const HEAD_C = 0.15; // baş merkezi, head kemiğinin üstünde
const HEAD_SZ = 0.95; // başın derinlik basıklığı

// Sabit aksesuar renkleri (aksesuar rengi seçilmiyor).
const ACC = {
    capMain: 0xff6b6b, capPanel: 0xfff4ec, beanie: 0xe2b94c, beanieCuff: 0xc79a33, pom: 0xfff4dd,
    frame: 0x2a2440, gold: 0xf2c14e, lens: 0x1b1530, phone: 0xf6f3ff, phoneCushion: 0xff6b9e,
    earInner: 0xffa8c5, gems: [0xff3b6b, 0x38bdf8, 0x34f5a0],
};
const EYE = 0x231a33;
const MOUTH = 0x9b3b4c;
const BLUSH = 0xff9aac;

const _ca = new THREE.Color();
const _cb = new THREE.Color();
function shade(color, f) {
    return _ca.set(color).multiplyScalar(f).getHex();
}
function mix(a, b, t) {
    return _ca.set(a).lerp(_cb.set(b), t).getHex();
}

/** Yapılandırmanın çözülmüş renkleri (saf; testlerde de kullanılır). */
export function avatarColors(config) {
    const a = normalizeAvatar(config);
    return {
        skin: SKIN_TONES[a.skin],
        hair: HAIR_COLORS[a.hair.color],
        top: CLOTH_COLORS[a.top.color],
        bottom: CLOTH_COLORS[a.bottom.color],
        shoes: CLOTH_COLORS[a.shoes.color],
    };
}

/** Kemiklerin dinlenme konumları (ebeveyne göre) ve kök uzayındaki mutlak konumları. */
export function restLayout(body, hairStyle) {
    const d = BODY_DIMS[body] || BODY_DIMS.erkek;
    const hipY = d.thigh + d.shin + d.ankle;
    const local = {
        hips: [0, hipY, 0],
        spine: [0, d.spineY, 0],
        chest: [0, d.chestY, 0],
        neck: [0, d.neckY, 0],
        head: [0, d.headY, 0],
        hair: hairPivot(hairStyle).map((v) => v * HEAD_SCALE),
        armL: [-d.shX, d.shY, 0],
        foreArmL: [0, -d.upper, 0],
        armR: [d.shX, d.shY, 0],
        foreArmR: [0, -d.upper, 0],
        legL: [-d.legX, 0, 0],
        shinL: [0, -d.thigh, 0],
        footL: [0, -d.shin, 0],
        legR: [d.legX, 0, 0],
        shinR: [0, -d.thigh, 0],
        footR: [0, -d.shin, 0],
    };
    const abs = {};
    for (const b of BONES) {
        const p = PARENT[b];
        const l = local[b];
        abs[b] = p ? [abs[p][0] + l[0], abs[p][1] + l[1], abs[p][2] + l[2]] : l.slice();
    }
    return { local, abs, hipY, dims: d };
}

// Sallanan saç kökü (head kemiğine göre): stile göre ense/tepe.
function hairPivot(style) {
    if (style === 'atkuyrugu') return [0, 0.27, 0.15];
    if (style === 'orgu') return [0, 0.17, 0.155];
    if (style === 'uzun') return [0, 0.2, 0.12];
    if (style === 'topuz') return [0, 0.3, 0.1];
    return [0, 0.2, 0.12];
}

function createGradientMap() {
    // 3 kademeli toon: ışığa arkası dönük yüz koyu kalır (aşırı parlamasın).
    const data = new Uint8Array([70, 170, 255]);
    const t = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
}

function createTemplates(detail) {
    const hi = detail !== 'low';
    const t = {
        // Baş ve saç tası en büyük yüzeyler: daha pürüzsüz; diğer küreler orta.
        head: new THREE.SphereGeometry(1, hi ? 24 : 14, hi ? 16 : 10),
        sphere: new THREE.SphereGeometry(1, hi ? 12 : 9, hi ? 9 : 6),
        ball: new THREE.SphereGeometry(1, hi ? 8 : 6, hi ? 6 : 4),
        lump: new THREE.IcosahedronGeometry(1, hi ? 1 : 0),
        cyl: new THREE.CylinderGeometry(1, 1, 1, hi ? 12 : 8, 1),
        tube: new THREE.CylinderGeometry(1, 1, 1, hi ? 16 : 10, 1, true),
        cone: new THREE.ConeGeometry(1, 1, hi ? 10 : 6),
        capsule: new THREE.CapsuleGeometry(1, 1, hi ? 4 : 2, hi ? 12 : 8),
        torus: new THREE.TorusGeometry(1, 0.22, hi ? 8 : 5, hi ? 20 : 12),
        arc: new THREE.TorusGeometry(1, 0.2, hi ? 6 : 4, hi ? 12 : 8, Math.PI),
        box: new THREE.BoxGeometry(1, 1, 1),
    };
    const cache = new Map();
    // Konik silindir (uzuvlar): yarıçap oranına göre önbellekli.
    t.taper = (ratio) => {
        const k = Math.round(ratio * 100);
        let g = cache.get(k);
        if (!g) {
            g = new THREE.CylinderGeometry(k / 100, 1, 1, hi ? 12 : 8, 1);
            cache.set(k, g);
        }
        return g;
    };
    t.hi = hi;
    t.dispose = () => {
        for (const k of Object.keys(t)) {
            if (t[k] && t[k].isBufferGeometry) t[k].dispose();
        }
        for (const g of cache.values()) g.dispose();
    };
    return t;
}

/*
 * Parça yazıcı: kemik uzayında verilen geometriyi (konum/dönüş/ölçek) kök
 * uzayına taşıyıp ilgili kemiğe bağlar.
 */
function createWriter(abs) {
    const solid = new GeoBuilder();
    const glow = new GeoBuilder();
    const sIdx = [];
    const gIdx = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    function put(target, idx, bone, geo, color, pos, rot, scale) {
        const a = abs[bone];
        // Baş ve saç kemiğindeki her şey kemik noktası etrafında HEAD_SCALE kadar büyür.
        const k = bone === 'head' || bone === 'hair' ? HEAD_SCALE : 1;
        p.set(a[0] + (pos ? pos[0] * k : 0), a[1] + (pos ? pos[1] * k : 0), a[2] + (pos ? pos[2] * k : 0));
        e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
        q.setFromEuler(e);
        if (typeof scale === 'number') s.setScalar(scale * k);
        else s.set((scale ? scale[0] : 1) * k, (scale ? scale[1] : 1) * k, (scale ? scale[2] : 1) * k);
        m.compose(p, q, s);
        const before = target.vertexCount;
        target.addMatrix(geo, color, m);
        const bi = BONE_INDEX[bone];
        for (let i = before; i < target.vertexCount; i++) idx.push(bi);
    }
    function finish(builder, idx) {
        if (builder.vertexCount === 0) return null;
        const g = builder.build();
        const n = builder.vertexCount;
        const si = new Uint16Array(n * 4);
        const sw = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
            si[i * 4] = idx[i];
            sw[i * 4] = 1;
        }
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
        return g;
    }
    return {
        add: (bone, geo, color, pos, rot, scale) => put(solid, sIdx, bone, geo, color, pos, rot, scale),
        glow: (bone, geo, color, pos, rot, scale) => put(glow, gIdx, bone, geo, color, pos, rot, scale),
        build: () => ({ solid: finish(solid, sIdx), glow: finish(glow, gIdx) }),
    };
}

/** Baş yüzeyinde (önde, -z) verilen x/y'deki z (head kemiği uzayı). */
function faceZ(x, y, out = 0) {
    const ny = (y - HEAD_C) / (HEAD_R * 0.97);
    const nx = x / HEAD_R;
    const k = Math.max(0, 1 - nx * nx - ny * ny);
    return -(HEAD_SZ * HEAD_R * Math.sqrt(k) + out);
}

// --- Parçalar -------------------------------------------------------------

function buildHead(w, T, a, col) {
    const kiz = a.body === 'kiz';
    const skin = col.skin;
    // Boyun + baş + kulaklar + burun
    w.add('neck', T.cyl, skin, [0, 0.035, 0], null, [0.047, 0.1, 0.045]);
    w.add('head', T.head, skin, [0, HEAD_C, 0], null, [HEAD_R, HEAD_R * 0.97, HEAD_R * HEAD_SZ]);
    // Yanak/çene dolgunluğu (sevimli yuvarlak yüz)
    w.add('head', T.sphere, skin, [0, 0.085, -0.035], null, [0.128, 0.09, 0.115]);
    for (const sx of [-1, 1]) {
        w.add('head', T.ball, skin, [sx * 0.163, 0.13, 0.008], null, [0.03, 0.042, 0.026]);
        w.add('head', T.ball, shade(skin, 0.86), [sx * 0.167, 0.13, 0.004], null, [0.014, 0.024, 0.012]);
    }
    w.add('head', T.ball, shade(skin, 0.92), [0, 0.112, faceZ(0, 0.112, -0.004)], null, [0.017, 0.014, 0.014]);
    // Gözler: koyu badem, büyük parıltı + küçük parıltı (ışıyan)
    const ey = 0.138;
    const ex = 0.06;
    const er = kiz ? 1.08 : 1;
    for (const sx of [-1, 1]) {
        const x = sx * ex;
        const z = faceZ(x, ey, -0.002);
        w.add('head', T.ball, EYE, [x, ey, z], [0.1, sx * 0.25, 0], [0.026 * er, 0.036 * er, 0.014]);
        w.glow('head', T.ball, 0xffffff, [x + 0.009, ey + 0.013, z - 0.011], null, [0.0095 * er, 0.0105 * er, 0.004]);
        w.glow('head', T.ball, 0xffffff, [x - 0.008, ey - 0.012, z - 0.01], null, [0.0045, 0.0045, 0.003]);
        // Kaş
        const by = ey + 0.06;
        w.add('head', T.capsule, shade(col.hair, 0.9), [x, by, faceZ(x, by, 0.004)], [0, sx * 0.3, sx * -0.18 + Math.PI / 2], [0.008, 0.012, 0.007]);
        // Allık
        const cy = 0.098;
        const cx = sx * 0.096;
        w.add('head', T.ball, BLUSH, [cx, cy, faceZ(cx, cy, 0.0)], [0, sx * 0.5, 0], [0.028, 0.016, 0.008]);
        if (kiz) {
            // Kirpik: göz dış üst köşesinde iki minik çizgi
            for (let i = 0; i < 2; i++) {
                const lx = x + sx * (0.02 + i * 0.008);
                const ly = ey + 0.03 - i * 0.008;
                w.add('head', T.box, EYE, [lx, ly, faceZ(lx, ly, 0.003)], [0, sx * 0.3, sx * (-0.7 - i * 0.4)], [0.004, 0.017, 0.004]);
            }
        }
    }
    // Gülümseme (aşağı kıvrık yay)
    w.add('head', T.arc, MOUTH, [0, 0.084, faceZ(0, 0.084, 0.002)], [0, 0, Math.PI], [0.028, 0.024, 0.02]);
}

function buildTorso(w, T, a, col, L) {
    const d = L.dims;
    const style = a.top.style;
    const c = col.top;
    const dark = shade(c, 0.74);
    const light = mix(c, 0xffffff, 0.55);
    const dep = d.depth;
    const dz = (r) => -r * dep; // gövde önü z'si
    const longSleeve = style === 'hoodie' || style === 'ceket' || style === 'kazak';
    const main = style === 'ceket' ? shade(c, 0.78) : c;

    // Bel (spine) ve göğüs (chest): döner profilli gövde, derinlikte basık.
    const lower = new THREE.LatheGeometry([
        new THREE.Vector2(0, -0.035),
        new THREE.Vector2(d.waistR * 1.02, -0.035),
        new THREE.Vector2(d.waistR * 1.04, 0.05),
        new THREE.Vector2(d.waistR * 1.06, 0.13),
        new THREE.Vector2(0, 0.13),
    ], T.hi ? 18 : 10);
    w.add('spine', lower, main, null, null, [1, 1, dep]);
    lower.dispose();
    const r = d.chestR;
    const upper = new THREE.LatheGeometry([
        new THREE.Vector2(0, -0.03),
        new THREE.Vector2(d.waistR * 1.06, -0.03),
        new THREE.Vector2(r * 0.97, 0.09),
        new THREE.Vector2(r, 0.16),
        new THREE.Vector2(r * 0.93, 0.215),
        new THREE.Vector2(r * 0.66, 0.255),
        new THREE.Vector2(0.064, 0.275),
        new THREE.Vector2(0, 0.28),
    ], T.hi ? 18 : 10);
    w.add('chest', upper, main, null, null, [1, 1, dep]);
    upper.dispose();
    // Omuz yuvarlakları
    for (const sx of [-1, 1]) w.add('chest', T.sphere, main, [sx * (d.shX - 0.012), d.shY - 0.006, 0], null, [0.066, 0.06, 0.06]);

    if (style === 'hoodie') {
        // Etek ribanı, kanguru cebi, kapüşon, ipler, sırtta iki şerit
        w.add('spine', T.cyl, dark, [0, -0.03, 0], null, [d.waistR * 1.06, 0.04, d.waistR * 1.06 * dep]);
        w.add('spine', T.box, dark, [0, 0.055, dz(d.waistR * 1.06) - 0.004], [0.08, 0, 0], [0.2, 0.085, 0.02]);
        w.add('chest', T.sphere, c, [0, 0.27, 0.085], [0.3, 0, 0], [0.13, 0.07, 0.085]);
        w.add('chest', T.sphere, dark, [0, 0.285, 0.05], [0.3, 0, 0], [0.09, 0.05, 0.05]);
        for (const sx of [-1, 1]) w.add('chest', T.capsule, 0xfff4ec, [sx * 0.035, 0.2, dz(r * 0.93) - 0.006], null, [0.006, 0.03, 0.006]);
        w.add('chest', T.box, light, [0, 0.17, r * dep + 0.002], null, [0.16, 0.025, 0.01]);
        w.add('chest', T.box, light, [0, 0.125, r * dep + 0.001], null, [0.11, 0.025, 0.01]);
    } else if (style === 'tisort') {
        // Bisiklet yaka + önde yıldız baskı
        w.add('chest', T.torus, light, [0, 0.268, -0.004], [Math.PI / 2 + 0.25, 0, 0], [0.066, 0.06, 0.05]);
        w.add('chest', T.box, light, [0, 0.14, dz(r) - 0.004], [0, 0, Math.PI / 4], [0.05, 0.05, 0.008]);
        w.add('chest', T.box, light, [0, 0.14, dz(r) - 0.004], null, [0.05, 0.05, 0.008]);
        w.add('spine', T.cyl, dark, [0, -0.032, 0], null, [d.waistR * 1.05, 0.02, d.waistR * 1.05 * dep]);
    } else if (style === 'ceket') {
        // Deri ceket: içte beyaz tişört, yaka, çapraz fermuar, bel bandı, sırtta dikiş
        w.add('chest', T.box, 0xf6f3ff, [0, 0.215, dz(r * 0.93) + 0.012], [-0.35, 0, 0], [0.07, 0.08, 0.02]);
        for (const sx of [-1, 1]) {
            w.add('chest', T.box, shade(main, 1.25), [sx * 0.05, 0.22, dz(r * 0.9) - 0.006], [-0.3, sx * 0.3, sx * 0.45], [0.05, 0.11, 0.015]);
        }
        w.add('chest', T.box, 0xd6d9e6, [0.02, 0.1, dz(r) - 0.004], [0, 0, 0.12], [0.008, 0.2, 0.006]);
        w.add('spine', T.cyl, shade(main, 0.7), [0, -0.025, 0], null, [d.waistR * 1.07, 0.045, d.waistR * 1.07 * dep]);
        w.add('chest', T.box, shade(main, 0.65), [0, 0.2, r * dep * 0.95], null, [0.22, 0.008, 0.01]);
        w.add('chest', T.box, 0xd6d9e6, [-0.09, 0.15, dz(r) - 0.003], null, [0.035, 0.006, 0.006]);
    } else if (style === 'forma') {
        // Forma: V yaka, yan paneller, sırtta "10"
        for (const sx of [-1, 1]) {
            w.add('chest', T.box, 0xffffff, [sx * 0.026, 0.245, dz(r * 0.75) - 0.002], [-0.5, 0, sx * 0.55], [0.012, 0.07, 0.01]);
            w.add('chest', T.box, 0xffffff, [sx * (r - 0.012), 0.09, 0], null, [0.012, 0.2, r * dep * 1.4]);
            w.add('spine', T.box, 0xffffff, [sx * (d.waistR - 0.004), 0.05, 0], null, [0.012, 0.16, d.waistR * dep * 1.4]);
        }
        digits10(w, T, 'chest', r * dep + 0.004, 0.13, 0.11, 0xffffff);
        digits10(w, T, 'chest', -(r * dep + 0.004), 0.17, 0.045, 0xffffff, true);
    } else if (style === 'kazak') {
        // Kazak: balıkçı yaka, örgü bantları, göğüste zikzak desen
        w.add('chest', T.cyl, dark, [0, 0.29, 0], null, [0.07, 0.06, 0.066]);
        w.add('chest', T.torus, dark, [0, 0.3, 0], [Math.PI / 2, 0, 0], [0.072, 0.072, 0.06]);
        w.add('spine', T.cyl, dark, [0, -0.03, 0], null, [d.waistR * 1.07, 0.045, d.waistR * 1.07 * dep]);
        const zz = T.hi ? 9 : 5;
        for (let i = 0; i < zz; i++) {
            const ang = -0.9 + (i / (zz - 1)) * 1.8;
            const x = Math.sin(ang) * r * 1.0;
            const z = -Math.cos(ang) * r * dep - 0.004;
            w.add('chest', T.box, light, [x, 0.15 + (i % 2 ? 0.012 : -0.012), z], [0, -ang, i % 2 ? 0.8 : -0.8], [0.03, 0.012, 0.008]);
        }
        for (const y of [0.105, 0.195]) {
            w.add('chest', T.cyl, dark, [0, y, 0], null, [r * 1.008, 0.012, r * dep * 1.008]);
        }
    }

    // Kollar: üst kol (kol rengi ya da kısa kollu), ön kol + el
    const limb = d.limb;
    for (const sx of [-1, 1]) {
        const arm = sx < 0 ? 'armL' : 'armR';
        const fore = sx < 0 ? 'foreArmL' : 'foreArmR';
        const ul = d.upper;
        const fl = d.fore;
        if (longSleeve) {
            w.add(arm, T.taper(0.86), main, [0, -ul / 2, 0], null, [0.056 * limb, ul, 0.056 * limb]);
            w.add(arm, T.sphere, main, [0, -0.004, 0], null, [0.058 * limb, 0.058, 0.058 * limb]);
            w.add(fore, T.sphere, main, [0, 0, 0], null, [0.046 * limb, 0.046, 0.046 * limb]);
            w.add(fore, T.taper(0.84), main, [0, -fl / 2 + 0.01, 0], null, [0.045 * limb, fl - 0.02, 0.045 * limb]);
            w.add(fore, T.cyl, style === 'ceket' ? shade(main, 0.7) : dark, [0, -fl + 0.015, 0], null, [0.041 * limb, 0.035, 0.041 * limb]);
        } else {
            // Kısa kol: kol ağzı genişçe, altında ten
            w.add(arm, T.taper(0.95), c, [0, -0.055, 0], null, [0.06 * limb, 0.11, 0.06 * limb]);
            w.add(arm, T.sphere, c, [0, -0.004, 0], null, [0.06 * limb, 0.058, 0.06 * limb]);
            w.add(arm, T.cyl, style === 'forma' ? 0xffffff : light, [0, -0.108, 0], null, [0.058 * limb, 0.014, 0.058 * limb]);
            w.add(arm, T.taper(0.88), col.skin, [0, -ul / 2 - 0.02, 0], null, [0.044 * limb, ul - 0.04, 0.044 * limb]);
            w.add(fore, T.sphere, col.skin, [0, 0, 0], null, [0.04 * limb, 0.04, 0.04 * limb]);
            w.add(fore, T.taper(0.85), col.skin, [0, -fl / 2, 0], null, [0.039 * limb, fl, 0.039 * limb]);
        }
        // El: yumuşak yumruk + başparmak
        w.add(fore, T.sphere, col.skin, [0, -fl - 0.038, -0.004], null, [0.046 * limb, 0.054, 0.043]);
        w.add(fore, T.ball, col.skin, [-sx * 0.03 * limb, -fl - 0.022, -0.022], null, [0.018, 0.025, 0.018]);
    }
}

// Yedi parçalı "10" (forma sırtı/önü). z: yüzey; scale: rakam yüksekliği.
function digits10(w, T, bone, z, y, h, color, small = false) {
    const t = h * 0.14;
    const half = h / 2;
    const sgn = z > 0 ? 1 : -1;
    const zz = z + sgn * 0.002;
    const dw = h * 0.5;
    const gap = small ? 0.006 : 0.012;
    const x1 = -dw / 2 - gap; // "1" merkezi
    const x0 = dw / 2 + gap + 0.004; // "0" merkezi
    // Arkadan bakınca soldan sağa okunsun: sırtta x eksenini çevir.
    const fx = sgn;
    w.add(bone, T.box, color, [fx * x1, y, zz], null, [t, h, 0.006]);
    w.add(bone, T.box, color, [fx * (x1 - t), y + half - t, zz], [0, 0, fx * 0.7], [t, t * 1.8, 0.006]);
    for (const sy of [-1, 1]) w.add(bone, T.box, color, [fx * x0, y + sy * (half - t / 2), zz], null, [dw, t, 0.006]);
    for (const sx of [-1, 1]) w.add(bone, T.box, color, [fx * (x0 + sx * (dw / 2 - t / 2)), y, zz], null, [t, h, 0.006]);
}

function buildLegs(w, T, a, col, L) {
    const d = L.dims;
    const style = a.bottom.style;
    const c = col.bottom;
    const dark = shade(c, 0.72);
    const light = mix(c, 0xffffff, 0.45);
    const limb = d.limb;
    const skin = col.skin;
    const dep = d.depth;

    // Kalça/pelvis (alt giysi rengi)
    const pelvis = new THREE.LatheGeometry([
        new THREE.Vector2(0, -0.1),
        new THREE.Vector2(0.07, -0.1),
        new THREE.Vector2(d.pelvisR * 0.96, -0.055),
        new THREE.Vector2(d.pelvisR, 0.01),
        new THREE.Vector2(d.waistR * 1.02, 0.085),
        new THREE.Vector2(0, 0.085),
    ], T.hi ? 18 : 10);
    w.add('hips', pelvis, c, null, null, [1, 1, dep * 1.02]);
    pelvis.dispose();
    // Bel bandı
    const beltCol = style === 'jean' ? 0x3a2a20 : dark;
    w.add('hips', T.cyl, beltCol, [0, 0.07, 0], null, [d.waistR * 1.05, 0.032, d.waistR * 1.05 * dep * 1.02]);
    if (style === 'jean') {
        w.add('hips', T.box, ACC.gold, [0, 0.07, -d.waistR * 1.05 * dep * 1.02 - 0.004], null, [0.035, 0.026, 0.008]);
        for (const sx of [-1, 1]) w.add('hips', T.box, dark, [sx * 0.06, -0.015, d.pelvisR * dep * 1.02 + 0.003], null, [0.06, 0.065, 0.006]);
    } else if (style === 'esofman') {
        for (const sx of [-1, 1]) w.add('hips', T.capsule, 0xfff4ec, [sx * 0.03, 0.045, -d.waistR * dep * 1.05 - 0.008], null, [0.005, 0.02, 0.005]);
    }
    if (style === 'etek') {
        // Pileli etek: konik, kenarı dalgalı
        const seg = T.hi ? 28 : 16;
        const sk = new THREE.CylinderGeometry(d.waistR * 1.06, d.pelvisR * 1.62, 0.25, seg, 1, true);
        const p = sk.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i);
            const zq = p.getZ(i);
            const yv = p.getY(i);
            const ang = Math.atan2(zq, x);
            const k = 1 + Math.sin(ang * 12) * 0.045 * (0.5 - yv / 0.25);
            p.setXYZ(i, x * k, yv, zq * k);
        }
        sk.computeVertexNormals();
        w.add('hips', sk, c, [0, -0.06, 0], null, [1, 1, dep * 1.15]);
        // İç yüz (arkadan/alttan bakınca boşluk görünmesin)
        const inner = sk.clone();
        inner.scale(0.985, 1, 0.985);
        const ix = inner.index;
        for (let i = 0; i < ix.count; i += 3) {
            const t0 = ix.getX(i + 1);
            ix.setX(i + 1, ix.getX(i + 2));
            ix.setX(i + 2, t0);
        }
        w.add('hips', inner, dark, [0, -0.06, 0], null, [1, 1, dep * 1.15]);
        sk.dispose();
        inner.dispose();
    }

    for (const sx of [-1, 1]) {
        const leg = sx < 0 ? 'legL' : 'legR';
        const shin = sx < 0 ? 'shinL' : 'shinR';
        const th = d.thigh;
        const sh = d.shin;
        const rTh = 0.07 * limb;
        const rSh = 0.054 * limb;
        if (style === 'jean' || style === 'esofman') {
            w.add(leg, T.sphere, c, [0, -0.01, 0], null, [rTh * 1.05, 0.07, rTh * 1.05]);
            w.add(leg, T.taper(0.82), c, [0, -th / 2, 0], null, [rTh, th, rTh]);
            w.add(shin, T.sphere, c, [0, 0, 0], null, [rSh * 1.05, rSh * 1.05, rSh * 1.05]);
            w.add(shin, T.taper(style === 'jean' ? 0.95 : 0.85), c, [0, -sh / 2 + 0.01, 0], null, [rSh, sh - 0.02, rSh]);
            if (style === 'jean') {
                w.add(shin, T.cyl, light, [0, -sh + 0.045, 0], null, [rSh * 1.06, 0.04, rSh * 1.06]);
                w.add(leg, T.box, light, [sx * rTh * 0.96, -th / 2, 0], [0, 0, sx * 0.03], [0.004, th * 0.9, 0.012]);
            } else {
                w.add(shin, T.cyl, dark, [0, -sh + 0.04, 0], null, [rSh * 0.9, 0.04, rSh * 0.9]);
                w.add(leg, T.box, 0xffffff, [sx * rTh * 0.93, -th / 2, 0], [0, 0, sx * 0.035], [0.008, th, 0.02]);
                w.add(shin, T.box, 0xffffff, [sx * rSh * 0.9, -sh / 2, 0], [0, 0, sx * 0.03], [0.008, sh - 0.06, 0.018]);
            }
        } else {
            // Şort/etek: üst bacak kısmen ya da tamamen ten
            if (style === 'sort') {
                w.add(leg, T.sphere, c, [0, -0.01, 0], null, [rTh * 1.12, 0.07, rTh * 1.12]);
                w.add(leg, T.taper(0.92), c, [0, -0.11, 0], null, [rTh * 1.16, 0.2, rTh * 1.16]);
                w.add(leg, T.cyl, dark, [0, -0.205, 0], null, [rTh * 1.13, 0.02, rTh * 1.13]);
                w.add(leg, T.box, 0xffffff, [sx * rTh * 1.12, -0.1, 0], null, [0.008, 0.18, 0.018]);
                w.add(leg, T.taper(0.85), skin, [0, -th / 2 - 0.04, 0], null, [rTh * 0.9, th - 0.08, rTh * 0.9]);
            } else {
                w.add(leg, T.sphere, skin, [0, -0.01, 0], null, [rTh * 0.95, 0.07, rTh * 0.95]);
                w.add(leg, T.taper(0.82), skin, [0, -th / 2, 0], null, [rTh * 0.9, th, rTh * 0.9]);
            }
            w.add(shin, T.sphere, skin, [0, 0, 0], null, [rSh * 0.95, rSh * 0.95, rSh * 0.95]);
            w.add(shin, T.taper(0.82), skin, [0, -sh / 2, 0], null, [rSh * 0.9, sh, rSh * 0.9]);
            // Çorap: şortta kısa spor, etekte diz altı
            const sockH = style === 'etek' ? 0.17 : 0.08;
            w.add(shin, T.taper(0.92), 0xfbf8ff, [0, -sh + sockH / 2 + 0.01, 0], null, [rSh * 0.93, sockH, rSh * 0.93]);
            w.add(shin, T.cyl, style === 'etek' ? c : light, [0, -sh + sockH + 0.005, 0], null, [rSh * 0.95, 0.014, rSh * 0.95]);
        }
    }
}

function buildShoes(w, T, a, col) {
    const style = a.shoes.style;
    const c = col.shoes;
    for (const foot of ['footL', 'footR']) {
        if (style === 'bot') {
            const leather = shade(c, 0.85);
            w.add(foot, T.cyl, leather, [0, 0.03, 0.004], null, [0.061, 0.15, 0.062]);
            w.add(foot, T.torus, mix(c, 0xffffff, 0.35), [0, 0.105, 0.004], [Math.PI / 2, 0, 0], [0.062, 0.062, 0.05]);
            w.add(foot, T.sphere, leather, [0, -0.035, -0.038], null, [0.064, 0.054, 0.122]);
            w.add(foot, T.sphere, 0x3a2a20, [0, -0.068, -0.036], null, [0.068, 0.022, 0.135]);
            w.add(foot, T.box, 0x3a2a20, [0, -0.062, 0.06], null, [0.12, 0.034, 0.06]);
            for (let i = 0; i < 3; i++) w.add(foot, T.box, 0xe8d9b0, [0, 0.0 - i * 0.03, -0.058 + i * 0.006], [0.4, 0, 0], [0.05, 0.007, 0.006]);
        } else {
            const neon = style === 'neon';
            w.add(foot, T.sphere, c, [0, -0.03, -0.036], null, [0.062, 0.052, 0.124]);
            w.add(foot, T.sphere, neon ? shade(c, 0.6) : 0xffffff, [0, -0.046, -0.128], null, [0.052, 0.03, 0.042]);
            if (neon) {
                w.glow(foot, T.sphere, mix(c, 0xffffff, 0.35), [0, -0.066, -0.036], null, [0.066, 0.02, 0.135]);
                for (const sx of [-1, 1]) w.glow(foot, T.box, mix(c, 0xffffff, 0.55), [sx * 0.058, -0.035, -0.04], [0, sx * 0.06, 0], [0.006, 0.014, 0.12]);
                w.glow(foot, T.box, 0xffffff, [0, -0.012, 0.074], null, [0.03, 0.04, 0.012]);
            } else {
                w.add(foot, T.sphere, 0xffffff, [0, -0.066, -0.036], null, [0.066, 0.02, 0.135]);
                w.add(foot, T.box, mix(c, 0xffffff, 0.5), [0, -0.014, 0.074], null, [0.03, 0.04, 0.012]);
                for (const sx of [-1, 1]) w.add(foot, T.box, mix(c, 0xffffff, 0.6), [sx * 0.058, -0.04, -0.03], [0, sx * 0.06, 0.25 * sx], [0.005, 0.012, 0.09]);
            }
            for (let i = 0; i < 3; i++) w.add(foot, T.box, 0xffffff, [0, 0.014 - i * 0.016, -0.062 - i * 0.022], [0.55, 0, 0], [0.042, 0.007, 0.007]);
        }
    }
}

/*
 * Saç: kafa tası (her stilde) + stile özel kütleler. hat: şapka/bere varsa
 * tepedeki hacim (topuz/mohawk/kıvırcık tepesi) şapkanın içinden çıkmasın.
 */
function buildHair(w, T, a, col) {
    const s = a.hair.style;
    const c = col.hair;
    const dark = shade(c, 0.78);
    const hat = a.acc === 'sapka' || a.acc === 'bere';
    const hi = T.hi;
    const cap = (sy = 0.97, cz = 0.03, r = 0.178) => w.add('head', T.head, c, [0, 0.17, cz], null, [r, r * sy, r]);

    if (s === 'mohawk') {
        // Yanlar kazınmış (saç rengi tene karışık), ortada dikey ibik
        const buzz = mix(c, col.skin, 0.55);
        w.add('head', T.head, buzz, [0, 0.168, 0.016], null, [0.169, 0.162, 0.166]);
        if (!hat) {
            const n = hi ? 6 : 4;
            for (let i = 0; i < n; i++) {
                const t = i / (n - 1);
                const ang = -0.75 + t * 2.1; // alından enseye
                const rr = 0.17;
                const y = 0.17 + Math.cos(ang) * rr;
                const z = Math.sin(ang) * rr;
                const hh = 0.15 - Math.abs(t - 0.35) * 0.07;
                w.add('head', T.cone, i % 2 ? dark : c, [0, y + hh * 0.35 * Math.cos(ang), z + hh * 0.35 * Math.sin(ang)], [ang, 0, 0], [0.03, hh, 0.06]);
            }
        } else {
            w.add('head', T.sphere, c, [0, 0.12, 0.15], null, [0.03, 0.06, 0.03]);
        }
        return;
    }
    if (s === 'kivircik') {
        // Kıvırcık: tasın üstünde yumuşak yumrular (fibonacci dağılımı)
        cap(0.95, 0.025, 0.176);
        const n = hi ? 40 : 22;
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < n; i++) {
            const yv = 1 - (i / (n - 1)) * 1.25; // 1 .. -0.25
            if (yv < -0.25) continue;
            const rad = Math.sqrt(Math.max(0, 1 - yv * yv));
            const th = i * golden;
            const x = Math.cos(th) * rad;
            const z = Math.sin(th) * rad;
            // Yüzün önü açık kalsın
            if (z < -0.35 && yv < 0.45) continue;
            if (hat && yv > 0.35) continue;
            const R = 0.18;
            w.add('head', T.lump, i % 3 ? c : dark, [x * R, 0.18 + yv * R * 0.95, z * R + 0.02], [th, i, 0], 0.052 + (i % 4) * 0.004);
        }
        return;
    }

    // Kafa tası (kısa stillerde biraz daha sıkı)
    const short = s === 'kisa';
    cap(short ? 0.93 : 0.97, short ? 0.022 : 0.03, short ? 0.175 : 0.178);

    if (s === 'kisa') {
        // Önde yukarı kalkık perçem
        for (let i = 0; i < 3; i++) {
            const x = (i - 1) * 0.055;
            w.add('head', T.sphere, i === 1 ? c : dark, [x, 0.29 - Math.abs(i - 1) * 0.012, -0.095 + Math.abs(i - 1) * 0.015], [-0.6, 0, (1 - i) * 0.3], [0.05, 0.035, 0.06]);
        }
        for (const sx of [-1, 1]) w.add('head', T.sphere, c, [sx * 0.15, 0.17, -0.02], null, [0.03, 0.06, 0.05]);
        return;
    }

    // Kahkül (diğer tüm stiller): yana taranmış iki kütle
    w.add('head', T.sphere, c, [-0.045, 0.255, -0.115], [-0.45, 0, 0.35], [0.1, 0.048, 0.07]);
    w.add('head', T.sphere, dark, [0.07, 0.24, -0.12], [-0.5, 0, -0.5], [0.07, 0.04, 0.06]);

    if (s === 'dalgali') {
        // Çene hizasına inen dalgalı yanlar + ense
        for (const sx of [-1, 1]) {
            for (let i = 0; i < 4; i++) {
                const y = 0.19 - i * 0.055;
                const x = sx * (0.158 + (i % 2) * 0.016);
                w.add('head', T.sphere, i % 2 ? dark : c, [x, y, 0.02 + i * 0.008], [0, 0, sx * 0.2], [0.05, 0.05, 0.085]);
            }
        }
        for (let i = 0; i < 3; i++) w.add('head', T.sphere, i % 2 ? dark : c, [0, 0.12 - i * 0.05, 0.12 + i * 0.005], null, [0.15 - i * 0.015, 0.06, 0.07]);
        return;
    }
    if (s === 'atkuyrugu') {
        // Toka + sallanan kuyruk (hair kemiği)
        w.add('hair', T.torus, col.top, [0, 0, 0.012], [Math.PI / 2, 0, 0], [0.034, 0.034, 0.05]);
        w.add('hair', T.sphere, c, [0, -0.05, 0.05], [0.3, 0, 0], [0.072, 0.09, 0.07]);
        w.add('hair', T.sphere, dark, [0, -0.15, 0.075], [0.18, 0, 0], [0.066, 0.1, 0.062]);
        w.add('hair', T.sphere, c, [0, -0.255, 0.082], [0.08, 0, 0], [0.054, 0.09, 0.05]);
        w.add('hair', T.sphere, dark, [0, -0.34, 0.082], null, [0.04, 0.06, 0.038]);
        w.add('hair', T.cone, c, [0, -0.41, 0.08], [Math.PI, 0, 0], [0.03, 0.07, 0.03]);
        return;
    }
    if (s === 'uzun') {
        // Sırta inen düz uzun saç (sallanır) + omuz önüne düşen tutamlar
        w.add('head', T.sphere, c, [0, 0.12, 0.1], null, [0.17, 0.14, 0.1]);
        w.add('hair', T.capsule, c, [0, -0.22, 0.03], [0.1, 0, 0], [0.145, 0.15, 0.052]);
        w.add('hair', T.capsule, dark, [0, -0.25, 0.062], [0.1, 0, 0], [0.1, 0.13, 0.03]);
        w.add('hair', T.cone, c, [0, -0.5, 0.04], [Math.PI + 0.1, 0, 0], [0.12, 0.08, 0.04]);
        for (const sx of [-1, 1]) {
            w.add('head', T.capsule, c, [sx * 0.15, 0.03, 0.0], [0, 0, sx * 0.08], [0.035, 0.09, 0.05]);
            w.add('head', T.sphere, dark, [sx * 0.16, -0.08, -0.005], null, [0.03, 0.05, 0.04]);
        }
        return;
    }
    if (s === 'topuz') {
        if (hat) {
            w.add('head', T.sphere, c, [0, 0.13, 0.19], null, [0.07, 0.07, 0.065]);
            w.add('head', T.torus, col.top, [0, 0.13, 0.15], null, [0.05, 0.05, 0.05]);
        } else {
            w.add('hair', T.sphere, c, [0, 0.05, 0.02], null, [0.085, 0.08, 0.085]);
            w.add('hair', T.sphere, dark, [0.03, 0.08, 0.0], null, [0.04, 0.035, 0.04]);
            w.add('hair', T.torus, col.top, [0, -0.012, 0.01], [Math.PI / 2 - 0.3, 0, 0], [0.058, 0.058, 0.05]);
        }
        for (const sx of [-1, 1]) w.add('head', T.capsule, c, [sx * 0.13, 0.06, -0.08], [0.2, 0, sx * 0.15], [0.012, 0.04, 0.012]);
        return;
    }
    if (s === 'orgu') {
        // Ensede başlayan örgü: zikzak boncuk zinciri + uç tokası
        const n = hi ? 8 : 5;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const r0 = 0.05 - t * 0.016;
            w.add('hair', T.sphere, i % 2 ? dark : c, [(i % 2 ? 1 : -1) * 0.012, -0.03 - i * (0.42 / n), 0.02 + Math.sin(t * 1.4) * 0.03], [0.3, 0, (i % 2 ? 1 : -1) * 0.5], [r0, r0 * 1.15, r0 * 0.95]);
        }
        const endY = -0.03 - n * (0.42 / n);
        w.add('hair', T.torus, col.top, [0, endY + 0.02, 0.035], [Math.PI / 2, 0, 0], [0.024, 0.024, 0.04]);
        w.add('hair', T.cone, c, [0, endY - 0.025, 0.035], [Math.PI, 0, 0], [0.026, 0.06, 0.026]);
    }
}

function buildAccessory(w, T, a, col) {
    const acc = a.acc;
    if (acc === 'sapka') {
        // Beyzbol şapkası: kubbe + öne siperlik + düğme
        w.add('head', T.head, ACC.capMain, [0, 0.22, 0.02], null, [0.188, 0.135, 0.19]);
        w.add('head', T.sphere, ACC.capPanel, [0, 0.245, -0.09], [-0.5, 0, 0], [0.09, 0.07, 0.06]);
        w.add('head', T.cyl, ACC.capMain, [0, 0.235, -0.2], [0.18, 0, 0], [0.12, 0.014, 0.1]);
        w.add('head', T.ball, ACC.capPanel, [0, 0.355, 0.02], null, 0.018);
        w.add('head', T.box, shade(ACC.capMain, 0.7), [0, 0.2, 0.2], [0.2, 0, 0], [0.07, 0.03, 0.012]);
    } else if (acc === 'bere') {
        // Örgü bere: kubbe + katlanmış bant + ponpon
        w.add('head', T.head, ACC.beanie, [0, 0.215, 0.02], null, [0.188, 0.16, 0.19]);
        w.add('head', T.tube, ACC.beanieCuff, [0, 0.205, 0.02], null, [0.19, 0.06, 0.192]);
        w.add('head', T.sphere, ACC.pom, [0, 0.385, 0.03], null, 0.045);
    } else if (acc === 'gozluk') {
        // Yuvarlak çerçeveli gözlük
        for (const sx of [-1, 1]) {
            const x = sx * 0.06;
            w.add('head', T.torus, ACC.frame, [x, 0.138, faceZ(x, 0.138, 0.018)], [0, sx * 0.2, 0], [0.038, 0.038, 0.03]);
            w.add('head', T.box, ACC.frame, [sx * 0.135, 0.15, -0.06], [0, sx * 0.45, 0], [0.006, 0.008, 0.13]);
        }
        w.add('head', T.box, ACC.frame, [0, 0.145, faceZ(0, 0.145, 0.02)], null, [0.04, 0.007, 0.006]);
    } else if (acc === 'gunes') {
        // Güneş gözlüğü: koyu camlar, ince altın çerçeve, cam parıltısı
        for (const sx of [-1, 1]) {
            const x = sx * 0.062;
            const z = faceZ(x, 0.135, 0.016);
            w.add('head', T.sphere, ACC.lens, [x, 0.135, z], [0, sx * 0.25, 0], [0.047, 0.036, 0.012]);
            w.glow('head', T.box, 0xc8d8ff, [x - sx * 0.012, 0.15, z - 0.012], [0, 0, -0.5], [0.022, 0.005, 0.002]);
            w.add('head', T.box, ACC.gold, [sx * 0.135, 0.152, -0.06], [0, sx * 0.45, 0], [0.006, 0.008, 0.13]);
        }
        w.add('head', T.box, ACC.gold, [0, 0.15, faceZ(0, 0.15, 0.02)], null, [0.05, 0.007, 0.006]);
    } else if (acc === 'kulaklik') {
        // Kafa bandı + kulak pedleri
        w.add('head', T.arc, ACC.phone, [0, 0.16, 0.0], [0, 0, 0], [0.2, 0.2, 0.08]);
        for (const sx of [-1, 1]) {
            w.add('head', T.cyl, ACC.phone, [sx * 0.185, 0.13, 0.005], [0, 0, Math.PI / 2], [0.06, 0.04, 0.06]);
            w.add('head', T.cyl, ACC.phoneCushion, [sx * 0.168, 0.13, 0.005], [0, 0, Math.PI / 2], [0.052, 0.02, 0.052]);
            w.glow('head', T.cyl, ACC.phoneCushion, [sx * 0.206, 0.13, 0.005], [0, 0, Math.PI / 2], [0.026, 0.004, 0.026]);
        }
    } else if (acc === 'kedi') {
        // Kedi kulakları: dış saç rengi, iç pembe
        for (const sx of [-1, 1]) {
            w.add('head', T.cone, col.hair, [sx * 0.1, 0.34, 0.0], [0, 0, -sx * 0.35], [0.055, 0.1, 0.03]);
            w.add('head', T.cone, ACC.earInner, [sx * 0.098, 0.33, -0.016], [0, 0, -sx * 0.35], [0.032, 0.065, 0.012]);
        }
    } else if (acc === 'tac') {
        // Altın taç: halka + sivri uçlar + renkli taşlar
        w.add('head', T.tube, ACC.gold, [0, 0.33, 0.01], [-0.08, 0, 0], [0.105, 0.05, 0.105]);
        const n = 5;
        for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2;
            const x = Math.sin(ang) * 0.1;
            const z = -Math.cos(ang) * 0.1 + 0.01;
            w.add('head', T.cone, ACC.gold, [x, 0.38 - z * 0.08, z], [0, -ang, 0], [0.025, 0.06, 0.018]);
            w.glow('head', T.ball, ACC.gems[i % 3], [x * 1.04, 0.335 - z * 0.08, z * 1.04 - 0.002], null, 0.013);
        }
    }
}

/*
 * buildAvatar(config, { detail }) -> { root, rig, setConfig(config), dispose() }
 * detail: 'high' (varsayılan; daha yuvarlak) | 'low' (daha az poligon; koşuda
 * dokunmatik cihazlar, kule tepesindeki mini karakter). İkisi de toon gölgeli.
 */
export function buildAvatar(config, { detail = 'high' } = {}) {
    const root = new THREE.Group();
    root.name = 'avatar';
    const bones = {};
    for (const b of BONES) {
        const bone = new THREE.Bone();
        bone.name = b;
        bones[b] = bone;
    }
    for (const b of BONES) {
        const p = PARENT[b];
        if (p) bones[p].add(bones[b]);
    }
    root.add(bones.hips);
    const trailAnchor = new THREE.Object3D();
    trailAnchor.name = 'trailAnchor';
    bones.hips.add(trailAnchor);

    // Her iki ayrıntı düzeyinde aynı toon görünüm (yalnızca poligon sayısı değişir).
    const gradient = createGradientMap();
    const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
    const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

    const rig = {
        hips: bones.hips,
        spine: bones.spine,
        chest: bones.chest,
        neck: bones.neck,
        head: bones.head,
        armL: bones.armL,
        armR: bones.armR,
        foreArmL: bones.foreArmL,
        foreArmR: bones.foreArmR,
        legL: bones.legL,
        legR: bones.legR,
        shinL: bones.shinL,
        shinR: bones.shinR,
        footL: bones.footL,
        footR: bones.footR,
        hair: bones.hair,
        trailAnchor,
        // Poz yardımcılarının kullandığı dinlenme değerleri (vücuda göre değişir).
        rest: { hipsY: 0.86 },
    };

    let mesh = null;
    let glowMesh = null;
    let skeleton = null;
    let current = '';
    let disposed = false;

    function build(cfg) {
        const a = normalizeAvatar(cfg);
        const key = JSON.stringify(a);
        if (key === current) return;
        current = key;
        const L = restLayout(a.body, a.hair.style);
        // Kemikleri dinlenme konumuna getir (dönüşlere dokunma: animasyon sürüyor olabilir).
        for (const b of BONES) bones[b].position.fromArray(L.local[b]);
        rig.rest.hipsY = L.hipY;
        trailAnchor.position.set(0, -(L.hipY - 0.2), 0.1);

        const col = avatarColors(a);
        const T = createTemplates(detail);
        const w = createWriter(L.abs);
        buildHead(w, T, a, col);
        buildHair(w, T, a, col);
        buildAccessory(w, T, a, col);
        buildTorso(w, T, a, col, L);
        buildLegs(w, T, a, col, L);
        buildShoes(w, T, a, col);
        const geo = w.build();
        T.dispose();

        // Eski mesh/iskeleti bırak.
        dropMeshes();
        const inverses = BONES.map((b) => new THREE.Matrix4().makeTranslation(-L.abs[b][0], -L.abs[b][1], -L.abs[b][2]));
        skeleton = new THREE.Skeleton(BONES.map((b) => bones[b]), inverses);
        const identity = new THREE.Matrix4();
        mesh = new THREE.SkinnedMesh(geo.solid, material);
        mesh.bind(skeleton, identity);
        mesh.frustumCulled = false;
        mesh.name = 'avatarBody';
        root.add(mesh);
        if (geo.glow) {
            glowMesh = new THREE.SkinnedMesh(geo.glow, glowMaterial);
            glowMesh.bind(skeleton, identity);
            glowMesh.frustumCulled = false;
            glowMesh.name = 'avatarGlow';
            root.add(glowMesh);
        }
    }

    function dropMeshes() {
        if (mesh) {
            root.remove(mesh);
            mesh.geometry.dispose();
            mesh = null;
        }
        if (glowMesh) {
            root.remove(glowMesh);
            glowMesh.geometry.dispose();
            glowMesh = null;
        }
        if (skeleton) {
            skeleton.dispose();
            skeleton = null;
        }
    }

    build(config);

    return {
        root,
        rig,
        /** Aynı rig korunur (kemik nesneleri değişmez); yalnızca geometri yeniden kurulur. */
        setConfig(cfg) {
            if (disposed) return;
            build(cfg);
        },
        /** Test/teşhis: üçgen sayısı. */
        get triangles() {
            const t = (m) => (m ? m.geometry.index.count / 3 : 0);
            return t(mesh) + t(glowMesh);
        },
        get meshes() {
            return glowMesh ? [mesh, glowMesh] : [mesh];
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            dropMeshes();
            material.dispose();
            glowMaterial.dispose();
            gradient.dispose();
            if (root.parent) root.parent.remove(root);
        },
    };
}

// --- Pozlar ----------------------------------------------------------------

/*
 * Animasyonlu kanallar: [düğüm, 'r' (rotation) | 'p' (position), eksen].
 * Pozlar önce hepsini nötre çeker; böylece önceki pozdan değer sızmaz.
 */
const CHANNELS = [
    ['hips', 'p', 'y'], ['hips', 'r', 'x'], ['hips', 'r', 'y'], ['hips', 'r', 'z'],
    ['spine', 'r', 'x'], ['spine', 'r', 'y'], ['spine', 'r', 'z'],
    ['chest', 'r', 'x'], ['chest', 'r', 'y'], ['chest', 'r', 'z'],
    ['neck', 'r', 'x'], ['head', 'r', 'x'], ['head', 'r', 'y'], ['head', 'r', 'z'],
    ['armL', 'r', 'x'], ['armL', 'r', 'y'], ['armL', 'r', 'z'], ['armR', 'r', 'x'], ['armR', 'r', 'y'], ['armR', 'r', 'z'],
    ['foreArmL', 'r', 'x'], ['foreArmR', 'r', 'x'],
    ['legL', 'r', 'x'], ['legL', 'r', 'z'], ['legR', 'r', 'x'], ['legR', 'r', 'z'],
    ['shinL', 'r', 'x'], ['shinR', 'r', 'x'], ['footL', 'r', 'x'], ['footR', 'r', 'x'],
    ['hair', 'r', 'x'], ['hair', 'r', 'z'],
];

function node(rig, k) {
    return rig[k];
}

function neutral(rig) {
    const hipsY = rig.rest ? rig.rest.hipsY : 0.86;
    for (let i = 0; i < CHANNELS.length; i++) {
        const [k, t, ax] = CHANNELS[i];
        const n = node(rig, k);
        if (!n) continue;
        if (t === 'p') n.position[ax] = hipsY;
        else n.rotation[ax] = 0;
    }
    return hipsY;
}

/** Bekleme: nefes, hafif sallanma, kollar gevşek. t: saniye. */
export function poseIdle(rig, t) {
    const y0 = neutral(rig);
    const br = Math.sin(t * 2.2);
    rig.hips.position.y = y0 + br * 0.006;
    rig.hips.rotation.y = Math.sin(t * 0.7) * 0.05;
    rig.spine.rotation.x = -0.02 + br * 0.012;
    rig.chest.rotation.x = -0.02 + br * 0.01;
    rig.chest.rotation.y = Math.sin(t * 0.7) * 0.06;
    rig.head.rotation.x = 0.04 + Math.sin(t * 0.9) * 0.03;
    rig.head.rotation.z = Math.sin(t * 0.55) * 0.06;
    rig.armL.rotation.x = 0.08;
    rig.armR.rotation.x = 0.08;
    rig.armL.rotation.z = -0.13 - br * 0.025;
    rig.armR.rotation.z = 0.13 + br * 0.025;
    rig.foreArmL.rotation.x = 0.3;
    rig.foreArmR.rotation.x = 0.3;
    rig.legL.rotation.z = -0.03;
    rig.legR.rotation.z = 0.03;
    rig.legL.rotation.x = 0.03;
    rig.legR.rotation.x = -0.03;
    rig.shinL.rotation.x = -0.05;
    rig.shinR.rotation.x = -0.05;
    if (rig.hair) {
        rig.hair.rotation.x = 0.12;
        rig.hair.rotation.z = Math.sin(t * 1.3) * 0.08;
    }
}

/** Koşu döngüsü. phase: radyan (adım fazı), speed01: 0 yavaş .. 1 en hızlı. */
export function poseRun(rig, phase, speed01 = 0.5) {
    const y0 = neutral(rig);
    const sp = Math.sin(phase);
    const cp = Math.cos(phase);
    const k = 0.82 + 0.18 * speed01;
    rig.hips.position.y = y0 - 0.015 + Math.abs(cp) * 0.055;
    rig.hips.rotation.y = -sp * 0.1;
    rig.spine.rotation.x = -0.1 - speed01 * 0.04;
    rig.chest.rotation.x = -0.1 - speed01 * 0.04;
    rig.chest.rotation.y = sp * 0.2;
    rig.head.rotation.x = 0.15 + speed01 * 0.05;
    rig.head.rotation.y = -sp * 0.08;
    rig.legL.rotation.x = sp * 0.95 * k;
    rig.legR.rotation.x = -sp * 0.95 * k;
    rig.shinL.rotation.x = -(0.25 + 1.2 * Math.max(0, cp)) * k;
    rig.shinR.rotation.x = -(0.25 + 1.2 * Math.max(0, -cp)) * k;
    rig.footL.rotation.x = 0.25 * Math.max(0, -sp);
    rig.footR.rotation.x = 0.25 * Math.max(0, sp);
    rig.armL.rotation.x = -sp * 0.9 * k;
    rig.armR.rotation.x = sp * 0.9 * k;
    rig.armL.rotation.z = -0.14;
    rig.armR.rotation.z = 0.14;
    rig.foreArmL.rotation.x = 1.25 + Math.max(0, -sp) * 0.4;
    rig.foreArmR.rotation.x = 1.25 + Math.max(0, sp) * 0.4;
    if (rig.hair) {
        rig.hair.rotation.x = 0.5 + speed01 * 0.25 + Math.sin(phase * 2) * 0.16;
        rig.hair.rotation.z = -sp * 0.3;
    }
}

/** Havada: vy01 = dikey hız / zıplama hızı (+1 kalkış .. -1 düşüş). */
export function poseJump(rig, vy01) {
    const y0 = neutral(rig);
    const rise = vy01 > 1 ? 1 : (vy01 < -1 ? -1 : vy01);
    const up = rise > 0 ? rise : 0;
    const dn = 1 - up;
    rig.hips.position.y = y0;
    rig.spine.rotation.x = -0.12 + up * 0.05;
    rig.chest.rotation.x = -0.12 + up * 0.05;
    rig.head.rotation.x = 0.2;
    rig.legL.rotation.x = 1.25 * up + 0.7 * dn;
    rig.shinL.rotation.x = -0.35 * up - 1.3 * dn;
    rig.legR.rotation.x = -0.55 * up + 0.35 * dn;
    rig.shinR.rotation.x = -1.4 * up - 1.1 * dn;
    rig.footL.rotation.x = 0.2;
    rig.footR.rotation.x = 0.35;
    rig.armL.rotation.x = -0.8 * up + 2.4 * dn;
    rig.armR.rotation.x = 1.5 * up + 2.4 * dn;
    rig.armL.rotation.z = -0.25 - 0.4 * dn;
    rig.armR.rotation.z = 0.25 + 0.4 * dn;
    rig.foreArmL.rotation.x = 0.6;
    rig.foreArmR.rotation.x = 0.9;
    if (rig.hair) rig.hair.rotation.x = 0.3 - rise * 0.6;
}

/** Kayma (öne takla pozu): t01 kayma ilerlemesi. Dönüşün kendisi motorda. */
export function poseSlide(rig, t01 = 0) {
    const y0 = neutral(rig);
    rig.hips.position.y = y0 * 0.46;
    rig.spine.rotation.x = -0.5;
    rig.chest.rotation.x = -0.45 - Math.sin(Math.min(1, t01) * Math.PI) * 0.1;
    rig.head.rotation.x = -0.5;
    rig.armL.rotation.x = 1.3;
    rig.armR.rotation.x = 1.3;
    rig.armL.rotation.z = -0.25;
    rig.armR.rotation.z = 0.25;
    rig.foreArmL.rotation.x = 1.5;
    rig.foreArmR.rotation.x = 1.5;
    rig.legL.rotation.x = 2.3;
    rig.legR.rotation.x = 2.25;
    rig.shinL.rotation.x = -2.5;
    rig.shinR.rotation.x = -2.45;
    if (rig.hair) rig.hair.rotation.x = 0.4;
}

/** Zıplamadan düşüş (çatı kenarından): kollar havada, bacaklar açık. */
export function poseFall(rig) {
    const y0 = neutral(rig);
    rig.hips.position.y = y0;
    rig.spine.rotation.x = 0.06;
    rig.chest.rotation.x = 0.05;
    rig.head.rotation.x = -0.1;
    rig.armL.rotation.x = 2.5;
    rig.armR.rotation.x = 2.3;
    rig.armL.rotation.z = -0.75;
    rig.armR.rotation.z = 0.75;
    rig.foreArmL.rotation.x = 0.5;
    rig.foreArmR.rotation.x = 0.5;
    rig.legL.rotation.x = 0.55;
    rig.legR.rotation.x = -0.2;
    rig.legL.rotation.z = -0.12;
    rig.legR.rotation.z = 0.12;
    rig.shinL.rotation.x = -0.9;
    rig.shinR.rotation.x = -0.4;
    if (rig.hair) rig.hair.rotation.x = -0.4;
}

/** Kutlama: kollar havada el sallar, hafif zıplar. t: saniye. */
export function poseCheer(rig, t) {
    const y0 = neutral(rig);
    const hop = Math.max(0, Math.sin(t * 7));
    const wave = Math.sin(t * 9);
    rig.hips.position.y = y0 + hop * 0.05;
    rig.spine.rotation.x = 0.04;
    rig.chest.rotation.x = 0.06;
    rig.chest.rotation.z = wave * 0.05;
    rig.head.rotation.x = -0.12;
    rig.head.rotation.z = wave * 0.1;
    rig.armL.rotation.x = 0.3;
    rig.armR.rotation.x = 0.3;
    rig.armL.rotation.z = -2.5 - wave * 0.25;
    rig.armR.rotation.z = 2.5 - wave * 0.25;
    rig.foreArmL.rotation.x = 0.4 + Math.max(0, wave) * 0.4;
    rig.foreArmR.rotation.x = 0.4 + Math.max(0, -wave) * 0.4;
    rig.legL.rotation.z = -0.06;
    rig.legR.rotation.z = 0.06;
    rig.shinL.rotation.x = -0.1 - hop * 0.3;
    rig.shinR.rotation.x = -0.1 - hop * 0.3;
    if (rig.hair) {
        rig.hair.rotation.x = 0.2 + hop * 0.3;
        rig.hair.rotation.z = wave * 0.2;
    }
}

/** Gerçek rig ile aynı anahtarlara sahip sade bir hedef (yalnızca sayılar). */
export function createPoseTarget(rig) {
    const t = { rest: { hipsY: rig.rest ? rig.rest.hipsY : 0.86 } };
    for (let i = 0; i < CHANNELS.length; i++) {
        const k = CHANNELS[i][0];
        if (!rig[k] || t[k]) continue;
        t[k] = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
    }
    return t;
}

/** rig'i hedefe k (0..1) oranında yaklaştırır. Hedefin dinlenme değeri rig'den güncellenir. */
export function blendPose(rig, target, k) {
    if (rig.rest) target.rest.hipsY = rig.rest.hipsY;
    for (let i = 0; i < CHANNELS.length; i++) {
        const [key, t, ax] = CHANNELS[i];
        const a = rig[key];
        const b = target[key];
        if (!a || !b) continue;
        if (t === 'p') a.position[ax] += (b.position[ax] - a.position[ax]) * k;
        else a.rotation[ax] += (b.rotation[ax] - a.rotation[ax]) * k;
    }
}

/** Hedefteki pozu rig'e doğrudan kopyalar (geçişsiz). */
export function applyPose(rig, target) {
    blendPose(rig, target, 1);
}
