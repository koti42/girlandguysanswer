/*
 * Cadde: kayan yol dokusu, geri dönüşümlü 40 m'lik sokak segmentleri
 * (binalar, kaldırım eşyaları, neon tabelalar) ve lamba haleleri.
 *
 * Her segment 3 draw call: dokulu binalar, köşe renkli eşyalar ve ışıyan
 * parçalar (lamba, vitrin, neon). Segment geometrileri kurulumda birkaç
 * çeşit olarak üretilir; ekrandaki yuvalar yalnızca geometri referansını
 * ve konumunu değiştirir (render döngüsünde yeni nesne yok).
 *
 * Konumlar oyuncuya göre göreli: segment s'nin render z'si = -(s*40 - oyuncuZ).
 *
 * Düşük kalite kademesinde (setLite) lamba haleleri kapanır ve sis
 * yakınlaştığı için (bkz. stage.js) onun ötesindeki segmentler çizilmez.
 */
import * as THREE from 'three';
import { GeoBuilder, createTemplates, FIXED_UV } from './geoBuilder.js';
import { ROAD_HALF_W, ROAD_TILE_M } from './textures.js';
import { fract, hash32, seededRandom } from './mathUtils.js';

export const SEG_LEN = 40;
const VARIANTS = 8;
const BEHIND_M = 24;
const AHEAD_M = 190;
const SLOTS = Math.ceil((BEHIND_M + AHEAD_M) / SEG_LEN) + 1;
const ROAD_LEN = BEHIND_M + AHEAD_M;
const LAMPS_PER_SEG = 4;
const HALO_PER_SEG = LAMPS_PER_SEG;
const LITE_AHEAD_M = 110;

const BUILDING_TINTS = [0x6c5a9e, 0x8a5a8c, 0x4f6a9a, 0x9a6a6a, 0x5d7d8f, 0x7a6ab0, 0xa07a8e, 0x55558a];
const NEON = [0xff4fa3, 0x38bdf8, 0xa855f7, 0xffd34d, 0x34f5c5, 0xff6b6b];
const AWNING = [0xff6b6b, 0xe2b94c, 0x2dd4bf, 0x8b5cf6, 0xf472b6];
const SHOP = [0xffc27a, 0xff9fd0, 0x9ae6ff, 0xffe2a8];
const FOLIAGE = [0x1f7a6d, 0x2a8f6a, 0xff8fb8, 0x1d6b78];

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
    T.dispose();

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
        slots.push({ group: g, b, p, l, seg: -9999 });
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

    // Binaların arasından boşluk görünmesin diye geniş koyu zemin.
    const groundGeo = new THREE.PlaneGeometry(160, ROAD_LEN);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x241634 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(0, -0.05, road.position.z);
    ground.frustumCulled = false;
    scene.add(ground);
    disposables.push(groundGeo, groundMat);

    // --- Lamba haleleri (tek Points, her kare konum güncellenir) ---
    const haloCount = SLOTS * HALO_PER_SEG;
    const haloPos = new Float32Array(haloCount * 3);
    const haloCol = new Float32Array(haloCount * 3);
    const haloGeo = new THREE.BufferGeometry();
    const haloPosAttr = new THREE.BufferAttribute(haloPos, 3).setUsage(THREE.DynamicDrawUsage);
    const haloColAttr = new THREE.BufferAttribute(haloCol, 3).setUsage(THREE.DynamicDrawUsage);
    haloGeo.setAttribute('position', haloPosAttr);
    haloGeo.setAttribute('color', haloColAttr);
    const haloMat = new THREE.PointsMaterial({
        size: 4.2,
        map: glowTexture,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
    });
    const halos = new THREE.Points(haloGeo, haloMat);
    halos.frustumCulled = false;
    scene.add(halos);
    disposables.push(haloGeo, haloMat);
    const haloColor = new THREE.Color(0xffb070);

    // --- Başlangıç kemeri: "HERKESLER KOŞUYOR" pankartı (dünya z = 14 m) ---
    const ab = new GeoBuilder();
    for (const px of [-4.6, 4.6]) {
        ab.box(px, 3.1, 0, 0.4, 6.2, 0.4, 0x2a2245);
        ab.box(px, 0.15, 0, 0.8, 0.3, 0.8, 0x1c1730);
    }
    ab.box(0, 6.1, 0, 9.6, 0.3, 0.3, 0x2a2245);
    const archGeo = ab.build();
    const archGlowB = new GeoBuilder();
    for (const px of [-4.38, 4.38]) archGlowB.box(px, 3.1, 0.05, 0.05, 6.0, 0.3, 0xff6b6b);
    const archGlowGeo = archGlowB.build();
    const bannerGeo = new THREE.PlaneGeometry(8.6, 1.61);
    const bannerMat = new THREE.MeshBasicMaterial({ map: tex.banner, transparent: true });
    const arch = new THREE.Group();
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 5.1, 0.25);
    arch.add(new THREE.Mesh(archGeo, propMat), new THREE.Mesh(archGlowGeo, glowMat), banner);
    scene.add(arch);
    disposables.push(archGeo, archGlowGeo, bannerGeo, bannerMat);

    let aheadM = AHEAD_M;

    return {
        /** Düşük kalite kademesi: hale yok, görüş mesafesi kısa. */
        setLite(on) {
            halos.visible = !on;
            aheadM = on ? LITE_AHEAD_M : AHEAD_M;
        },
        /** pzM: oyuncunun dünya z'si (metre, ondalıklı). */
        update(pzM) {
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
                    const v = variants[hash32(s) % VARIANTS];
                    slot.b.geometry = v.buildings;
                    slot.p.geometry = v.props;
                    slot.l.geometry = v.glow;
                }
                const z = -(s * SEG_LEN - pzM);
                slot.group.position.z = z;
                // Segmentin yakın ucu görüş mesafesinin ötesindeyse çizme.
                slot.group.visible = -z < aheadM;
                // Haleler: lambalar sol z=0/20, sağ z=10/30 (segment içi).
                for (let k = 0; k < LAMPS_PER_SEG; k++) {
                    const side = k < 2 ? -1 : 1;
                    const lz = z - (k % 2) * 20 - (side > 0 ? 10 : 0);
                    const dist = -lz;
                    // Sisli uzakta haleler parlak kalıp ufukta yığılmasın (haleler sis kullanmıyor).
                    const fade = dist < -6 ? 0 : 1 - Math.min(1, Math.max(0, (dist - 35) / 85));
                    haloPos[h * 3] = side * 3.45;
                    haloPos[h * 3 + 1] = 5.25;
                    haloPos[h * 3 + 2] = lz;
                    haloCol[h * 3] = haloColor.r * fade;
                    haloCol[h * 3 + 1] = haloColor.g * fade;
                    haloCol[h * 3 + 2] = haloColor.b * fade;
                    h++;
                }
            }
            haloPosAttr.needsUpdate = true;
            haloColAttr.needsUpdate = true;
        },
        dispose() {
            for (const slot of slots) scene.remove(slot.group);
            scene.remove(road, ground, halos, arch);
            for (const d of disposables) d.dispose();
        },
    };
}

/*
 * Bir segment çeşidi: iki yanda binalar, lambalar, ağaçlar, bordür.
 * Segment yerel koordinatı: z = 0 segment başı, -40 segment sonu (ileri = -z).
 */
function buildSegment(variant, T) {
    const rnd = seededRandom(1000 + variant * 77);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const B = new GeoBuilder();
    const P = new GeoBuilder();
    const L = new GeoBuilder();

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
            const facadeX = side * front;
            // Zemin kat vitrini (ışıyan) ve tente
            const shopW = bw * 0.7;
            L.box(facadeX - side * 0.04, 1.45, cz, 0.08, 2.1, shopW, darken(pick(SHOP), 0.62));
            // Vitrin kayıtları ve alt panel: düz bir ışık bloğu gibi durmasın.
            const mullions = Math.max(2, Math.round(shopW / 1.6));
            for (let m = 0; m <= mullions; m++) {
                P.box(facadeX - side * 0.09, 1.45, cz - shopW / 2 + (m * shopW) / mullions, 0.06, 2.1, 0.1, 0x231c38);
            }
            P.box(facadeX - side * 0.09, 0.55, cz, 0.06, 0.3, shopW, 0x231c38);
            P.box(facadeX - side * 0.09, 2.45, cz, 0.06, 0.1, shopW, 0x231c38);
            const awn = pick(AWNING);
            P.box(facadeX - side * 0.7, 2.95, cz, 1.4, 0.18, shopW + 0.4, awn);
            P.box(facadeX - side * 1.38, 2.75, cz, 0.06, 0.4, shopW + 0.4, darken(awn, 0.7));
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
            } else if (rnd() < 0.5) {
                // Yatay neon şerit
                L.box(facadeX - side * 0.05, 3.6 + rnd() * 0.4, cz, 0.06, 0.16, bw * 0.85, pick(NEON));
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
            }
        }
    }

    return { buildings: B.build(), props: P.build(), glow: L.build() };
}

const _dc = new THREE.Color();
function darken(hex, f) {
    _dc.set(hex).multiplyScalar(f);
    return _dc.getHex();
}
