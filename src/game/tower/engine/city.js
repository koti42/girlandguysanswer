/*
 * Kulenin aşağısındaki şehir: zemin (yollar, neon şeritler, akan farlar),
 * örnekli bina silüeti ve bir bulut katmanı.
 *
 * Kule bir meydanın ortasında yükselir: yakın halkada alçak binalar (kamera
 * kuleyi görebilsin), uzaklaştıkça yükselen gökdelenler. Binalar kule
 * katlarıyla aynı shader'ı kullanır (gece pencereleri yanar). Bulutlar
 * ~55-70 m'de (≈ 75-95. katlar): kamera içlerinden geçip üstüne çıkar.
 *
 * Yerleşim tohumlu (görsel); oyunun sonucuyla ilgisi yok. Düşük kalite
 * kademesinde uzak binalar ve bulutlar çizilmez.
 */
import * as THREE from 'three';
import { BASE_H, MAX_DIST, PLAY_AZ, SWAY_LAND } from './cameraMath.js';
import { hexToRgb, hslToRgb } from './palette.js';
import { applyEnv, createBoxInstances, createBuildingMaterial } from './buildingMaterial.js';
import { CLOUD_FRAG, CLOUD_VERT, GROUND_FRAG, GROUND_VERT } from './shaders.js';
import { seededRandom } from '../../runner/engine/mathUtils.js';

const BLOCK = 10; // yol ızgarası (m)
const GRID = 12; // -GRID..GRID blok
const PLAZA = 13; // meydan yarıçapı
const GROUND_SIZE = 1600;
const CLOUD_COUNT = 30;
const GROUND_Y = -BASE_H;
// Kameranın baktığı bulvar: oyun kamerası (azimut PLAY_AZ ± salınım) bu
// açısal koridorda ve en uzak mesafesinin biraz ötesine kadar dururken
// hemen altındaki bina çatısı ekranın altını kaplamasın; koridor boş kalır.
const AVENUE_HALF_ANGLE = SWAY_LAND + 0.16;
const AVENUE_REACH = MAX_DIST + 8;

function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
}

const CITY_COLORS = [0x2c2f63, 0x3a2f6b, 0x26405f, 0x45335f, 0x1f3550, 0x53406b, 0x2f4a6a, 0x5b3a55];

export function createCity(scene, { boxGeometry, seed = 7 }) {
    const rnd = seededRandom(seed ^ 0x51ed);
    const disposables = [];

    // --- Zemin ---
    const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 1, 1);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.ShaderMaterial({
        vertexShader: GROUND_VERT,
        fragmentShader: GROUND_FRAG,
        uniforms: {
            uBase: { value: new THREE.Vector3(0.09, 0.08, 0.17) },
            uRoad: { value: new THREE.Vector3(0.05, 0.05, 0.1) },
            uNeonA: { value: new THREE.Vector3(1.0, 0.42, 0.42) },
            uNeonB: { value: new THREE.Vector3(0.89, 0.73, 0.3) },
            uFogCol: { value: new THREE.Vector3() },
            uFogNear: { value: 60 },
            uFogFar: { value: 400 },
            uNight: { value: 0.3 },
            uTime: { value: 0 },
            uLite: { value: 0 },
            uBlock: { value: BLOCK },
            uPlaza: { value: PLAZA },
        },
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = GROUND_Y;
    ground.frustumCulled = false;
    ground.renderOrder = -5;
    scene.add(ground);
    disposables.push(groundGeo, groundMat);
    const gu = groundMat.uniforms;

    // --- Binalar ---
    const lots = [];
    for (let i = -GRID; i <= GRID; i++) {
        for (let j = -GRID; j <= GRID; j++) {
            const cx = i * BLOCK + BLOCK / 2;
            const cz = j * BLOCK + BLOCK / 2;
            const d = Math.hypot(cx, cz);
            if (d < PLAZA + 5) continue;
            // Blok içi: yoldan pay bırak, 1..4 bina (2x2 alt parsel, bazen birleşik).
            const inner = BLOCK * 0.82;
            const split = rnd() < 0.55 ? 2 : 1;
            const sub = inner / split;
            for (let a = 0; a < split; a++) {
                for (let b = 0; b < split; b++) {
                    if (split === 2 && rnd() < 0.12) continue;
                    const w = sub * (0.72 + rnd() * 0.22);
                    const dd = sub * (0.72 + rnd() * 0.22);
                    const x = cx - inner / 2 + sub * (a + 0.5) + (rnd() - 0.5) * (sub - w) * 0.6;
                    const z = cz - inner / 2 + sub * (b + 0.5) + (rnd() - 0.5) * (sub - dd) * 0.6;
                    // Yakında alçak (kamera kuleyi görsün), uzakta silüet; çok azı gökdelen.
                    let h;
                    if (d < 34) h = 1.4 + rnd() * 3.4;
                    else if (d < 70) h = 2.5 + rnd() * rnd() * 12;
                    else h = 4 + rnd() * rnd() * 20 + (rnd() < 0.05 ? 14 : 0);
                    const r = rnd();
                    // Rastgele sayılar tüketildikten sonra: diğer binaların yerleşimi değişmez.
                    if (Math.hypot(x, z) < AVENUE_REACH && angleDiff(Math.atan2(x, z), PLAY_AZ) < AVENUE_HALF_ANGLE) continue;
                    lots.push({ x, z, w, d: dd, h, dist: Math.hypot(x, z), r });
                }
            }
        }
    }
    // Yakından uzağa: düşük kalitede yalnızca baştaki (yakın) binalar çizilir.
    lots.sort((p, q) => p.dist - q.dist);
    const material = createBuildingMaterial({ floorH: 0.9, cell: 0.55, glass: [0.08, 0.1, 0.22], lamp: [1, 0.8, 0.5] });
    disposables.push(material);
    const boxes = createBoxInstances(boxGeometry, material, lots.length);
    const rgb = [0, 0, 0];
    boxes.bulkBegin();
    lots.forEach((l, i) => {
        boxes.setBox(i, l.x, GROUND_Y + l.h / 2, l.z, l.w, l.h, l.d);
        if (l.r < 0.12) hslToRgb(0.92 + l.r * 0.5, 0.45, 0.42, rgb);
        else hexToRgb(CITY_COLORS[Math.floor(l.r * 997) % CITY_COLORS.length], rgb);
        boxes.setColor(i, rgb);
        boxes.setFlag(i, 0, 0, Math.floor(l.r * 89));
    });
    boxes.bulkEnd();
    boxes.mesh.count = lots.length;
    boxes.mesh.frustumCulled = false;
    scene.add(boxes.mesh);
    disposables.push(boxes);
    const fullCount = lots.length;
    const liteCount = Math.round(lots.length * 0.5);

    // --- Bulutlar (kameraya dönük örnekli düzlemler) ---
    const plane = new THREE.PlaneGeometry(1, 1);
    const cloudGeo = new THREE.InstancedBufferGeometry();
    cloudGeo.index = plane.index;
    cloudGeo.setAttribute('position', plane.getAttribute('position'));
    cloudGeo.setAttribute('uv', plane.getAttribute('uv'));
    const centers = new Float32Array(CLOUD_COUNT * 3);
    const scales = new Float32Array(CLOUD_COUNT * 3);
    for (let i = 0; i < CLOUD_COUNT; i++) {
        const ang = rnd() * Math.PI * 2;
        const rad = 28 + rnd() * 150;
        centers[i * 3] = Math.cos(ang) * rad;
        centers[i * 3 + 1] = 50 + rnd() * 22;
        centers[i * 3 + 2] = Math.sin(ang) * rad;
        scales[i * 3] = 26 + rnd() * 44;
        scales[i * 3 + 1] = 9 + rnd() * 10;
        scales[i * 3 + 2] = rnd() * 10;
    }
    cloudGeo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 3));
    cloudGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 3));
    cloudGeo.instanceCount = CLOUD_COUNT;
    const cloudMat = new THREE.ShaderMaterial({
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: {
            uLit: { value: new THREE.Vector3(1, 0.8, 0.8) },
            uShade: { value: new THREE.Vector3(0.5, 0.4, 0.6) },
            uOpacity: { value: 0.55 },
            uTime: { value: 0 },
        },
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    clouds.frustumCulled = false;
    clouds.renderOrder = 2;
    scene.add(clouds);
    disposables.push(plane, cloudGeo, cloudMat);
    const cu = cloudMat.uniforms;

    return {
        /** Gökyüzü, sis ve zaman (her kare). */
        update(sky, fogNear, fogFar, time) {
            applyEnv(material, sky, fogNear, fogFar);
            gu.uFogCol.value.set(sky.fog[0], sky.fog[1], sky.fog[2]);
            gu.uFogNear.value = fogNear;
            gu.uFogFar.value = fogFar;
            gu.uNight.value = sky.night;
            gu.uTime.value = time;
            // Bulut: aydınlık tarafı ufuk rengi, gölgesi orta gökyüzü; gece soluk.
            cu.uLit.value.set(
                Math.min(1, sky.horizon[0] * 0.7 + 0.32),
                Math.min(1, sky.horizon[1] * 0.7 + 0.3),
                Math.min(1, sky.horizon[2] * 0.7 + 0.34)
            );
            cu.uShade.value.set(sky.mid[0] * 0.9 + 0.05, sky.mid[1] * 0.9 + 0.05, sky.mid[2] * 0.9 + 0.08);
            cu.uOpacity.value = 0.62 - sky.night * 0.3;
            cu.uTime.value = time;
        },
        setLite(on) {
            gu.uLite.value = on ? 1 : 0;
            boxes.mesh.count = on ? liteCount : fullCount;
            clouds.visible = !on;
        },
        dispose() {
            for (const d of disposables) d.dispose();
        },
    };
}
