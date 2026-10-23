/*
 * Gökyüzü ve deniz arka planı (ekran uzayında tek tam ekran çizim), bulutlar,
 * ada tabanındaki sis ve ortak yumuşak ışık dokusu.
 *
 * Arka plan gerçek bir deniz düzlemi DEĞİL: kamera eğimi ne olursa olsun
 * ufuk çizgisi sabit bir ekran yüksekliğinde kalsın ve ada denizin üstünde
 * "süzülsün" diye gökyüzü degradesi + güneş ışıması + perspektif sahte deniz
 * (renk bantları, ışıltı yolu, ada gölgesi) tek fragment shader'ında çizilir.
 */
import * as THREE from 'three';

/** 64x64 yumuşak radyal ışık (DataTexture: canvas gerekmez, node'da da kurulur). */
export function createSoftGlowTexture(size = 64) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (x + 0.5) / size - 0.5;
            const dy = (y + 0.5) / size - 0.5;
            const d = Math.min(1, Math.hypot(dx, dy) * 2);
            let a = Math.pow(1 - d, 2.2);
            a = a * a * (3 - 2 * a);
            const i = (y * size + x) * 4;
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = Math.round(a * 255);
        }
    }
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
}

export const SKY_PALETTE = {
    top: '#4d9be6',
    mid: '#a4d4f2',
    haze: '#ffe2bd',
    sun: '#ffc978',
    seaNear: '#168bb4',
    seaFar: '#6fd3d8',
    seaCrest: '#c9f4ee',
    glint: '#fff1c4',
};

const BACKDROP_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const BACKDROP_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform float uHorizon;
uniform vec2 uSun;
uniform vec2 uShadow;
uniform float uSparkle;
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHaze;
uniform vec3 uSunCol;
uniform vec3 uSeaNear;
uniform vec3 uSeaFar;
uniform vec3 uCrest;
uniform vec3 uGlint;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
    vec2 uv = vUv;
    vec2 asp = vec2(uAspect, 1.0);
    vec3 col;
    float depth = uHorizon - uv.y;
    if (depth <= 0.0) {
        float sy = clamp((uv.y - uHorizon) / (1.0 - uHorizon), 0.0, 1.0);
        col = mix(uHaze, uMid, smoothstep(0.0, 0.4, sy));
        col = mix(col, uTop, smoothstep(0.3, 1.0, sy));
        // uzak bulut şeritleri (ufka yakın, yatay gerilmiş)
        float cl = vnoise(vec2(uv.x * uAspect * 1.6 + uTime * 0.012, sy * 9.0)) * vnoise(vec2(uv.x * uAspect * 3.4 - uTime * 0.02, sy * 18.0 + 3.0));
        float band = smoothstep(0.05, 0.14, sy) * (1.0 - smoothstep(0.2, 0.42, sy));
        col = mix(col, vec3(1.0, 0.95, 0.9), smoothstep(0.22, 0.5, cl) * band * 0.55);
        float ds = length((uv - uSun) * asp);
        col += uSunCol * (exp(-ds * 4.2) * 0.42 + exp(-ds * 12.0) * 0.55);
        col = mix(col, vec3(1.0, 0.97, 0.86), smoothstep(0.052, 0.04, ds));
    } else {
        // sahte perspektifli deniz: z derinliği ufka doğru büyür
        float z = 0.9 / (depth * 5.5 + 0.045);
        float wx = (uv.x - 0.5) * uAspect * z * 2.0;
        float t = uTime;
        float w1 = sin(wx * 0.85 + sin(z * 0.9 + t * 0.35) * 1.4 + t * 0.25);
        float w2 = sin(wx * 1.9 - z * 1.7 + t * 0.55 + sin(wx * 0.4) * 1.2);
        float field = w1 * 0.55 + w2 * 0.45;
        float far = smoothstep(0.0, 0.55, depth);
        vec3 base = mix(uSeaFar, uSeaNear, pow(far, 0.7));
        base = mix(base, base * vec3(0.84, 0.93, 1.0), smoothstep(-0.2, 0.9, field) * 0.5);
        // renk bantları ve köpüklü tepe çizgileri (ufka yaklaştıkça sıklaşır)
        col = base;
        col = mix(col, uCrest, smoothstep(0.78, 0.95, field) * (0.18 + 0.4 * (1.0 - far)));
        // ışıltı yolu: güneşin altında
        float sx = (uv.x - uSun.x) * uAspect;
        float path = exp(-sx * sx / (0.006 + depth * depth * 0.22 + 0.01));
        float tw = hash21(floor(vec2(wx * 5.0, z * 7.0)) + floor(t * 1.6 + hash21(floor(vec2(wx * 5.0, z * 7.0))) * 8.0));
        float spark = smoothstep(0.93, 1.0, tw) * path * uSparkle;
        col += uGlint * (spark * 1.4 + path * 0.07);
        // ada gölgesi
        vec2 sd = (uv - uShadow) * vec2(uAspect * 0.85, 2.6);
        col *= 1.0 - smoothstep(0.4, 0.0, length(sd)) * 0.4;
        // ufuk sisi
        col = mix(col, uHaze, smoothstep(0.075, 0.0, depth));
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
}
`;

function lin(hex) {
    const c = new THREE.Color(hex);
    return new THREE.Vector3(c.r, c.g, c.b);
}

export function createBackdrop(palette = SKY_PALETTE, { horizon = 0.37, sun = [0.2, 0.72] } = {}) {
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
        vertexShader: BACKDROP_VERT,
        fragmentShader: BACKDROP_FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
            uTime: { value: 0 },
            uAspect: { value: 2 },
            uHorizon: { value: horizon },
            uSun: { value: new THREE.Vector2(sun[0], sun[1]) },
            uShadow: { value: new THREE.Vector2(0.5, 0.2) },
            uSparkle: { value: 1 },
            uTop: { value: lin(palette.top) },
            uMid: { value: lin(palette.mid) },
            uHaze: { value: lin(palette.haze) },
            uSunCol: { value: lin(palette.sun) },
            uSeaNear: { value: lin(palette.seaNear) },
            uSeaFar: { value: lin(palette.seaFar) },
            uCrest: { value: lin(palette.seaCrest) },
            uGlint: { value: lin(palette.glint) },
        },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -100;
    mesh.name = 'backdrop';
    return { mesh, geometry, material, uniforms: material.uniforms };
}

// --- Bulutlar --------------------------------------------------------------------

const CLOUDS = [
    { x: -7.2, y: 3.6, z: -8, s: 1.4, v: 0.07 },
    { x: 6.4, y: 4.6, z: -11, s: 1.7, v: 0.05 },
    { x: -7.4, y: -3.4, z: -3, s: 0.7, v: 0.09 },
    { x: 7.6, y: -3.7, z: -3.5, s: 0.8, v: 0.08 },
];
const LUMPS = [
    [0, 0, 0, 1.0],
    [0.62, -0.14, 0.12, 0.72],
    [-0.66, -0.16, -0.06, 0.8],
];
const CLOUD_WRAP = 13;

/** Örnekli bulutlar (1 çizim). tier: görünür bulut sayısı üst sınırı. */
export function createClouds() {
    const geometry = new THREE.SphereGeometry(1, 6, 4);
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xdfe6ff, emissiveIntensity: 0.26 });
    const count = CLOUDS.length * LUMPS.length;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    mesh.name = 'clouds';
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const tr = new THREE.Vector3();
    const tint = new THREE.Color();
    const state = CLOUDS.map((c) => ({ ...c, ox: 0 }));

    function update(t, visibleClouds = CLOUDS.length) {
        let k = 0;
        state.forEach((c, ci) => {
            const on = ci < visibleClouds;
            let x = c.x + t * c.v;
            x = ((x + CLOUD_WRAP) % (CLOUD_WRAP * 2) + CLOUD_WRAP * 2) % (CLOUD_WRAP * 2) - CLOUD_WRAP;
            const edge = Math.abs(x);
            const fade = on ? 1 - Math.min(1, Math.max(0, (edge - (CLOUD_WRAP - 3.5)) / 3.5)) : 0;
            const f = fade * fade * (3 - 2 * fade);
            for (let li = 0; li < LUMPS.length; li++) {
                const l = LUMPS[li];
                const s = c.s * l[3] * f;
                e.set(0.3 * li, li * 1.7 + ci, 0);
                q.setFromEuler(e);
                m.compose(tr.set(x + l[0] * c.s, c.y + l[1] * c.s + Math.sin(t * 0.3 + ci) * 0.05, c.z + l[2] * c.s), q, sc.set(s * 1.25, s * 0.68, s));
                mesh.setMatrixAt(k, m);
                k++;
            }
        });
        mesh.instanceMatrix.needsUpdate = true;
    }
    // Hafif sıcak/soğuk renk çeşitliliği (yalnızca bir kez)
    for (let i = 0; i < count; i++) {
        const ci = Math.floor(i / LUMPS.length);
        tint.setRGB(1, 0.96 + (ci % 2) * 0.03, 0.95 + (i % 3) * 0.025);
        mesh.setColorAt(i, tint);
    }
    mesh.instanceColor.needsUpdate = true;
    update(0);
    return { mesh, geometry, material, update, count: CLOUDS.length };
}

// --- Taban sisi -------------------------------------------------------------------

const MIST_VERT = /* glsl */ `
attribute float aAlpha;
attribute float aSize;
uniform float uScale;
varying float vAlpha;
void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
}
`;
const MIST_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
varying float vAlpha;
void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
}
`;

/** Adanın altından yükselen yumuşak sis (Points, 1 çizim). */
export function createMist(glowTexture, count = 14) {
    const geometry = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const alpha = new Float32Array(count);
    const size = new Float32Array(count);
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const seeds = [];
    for (let i = 0; i < count; i++) {
        seeds.push({ a: (i / count) * Math.PI * 2 + (i % 3) * 0.4, r: 0.6 + ((i * 37) % 10) / 10 * 2.2, ph: (i * 0.618) % 1, sz: 2.0 + ((i * 53) % 10) / 10 * 1.6 });
    }
    const material = new THREE.ShaderMaterial({
        vertexShader: MIST_VERT,
        fragmentShader: MIST_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
            uMap: { value: glowTexture },
            uColor: { value: lin('#fff0e0') },
            uScale: { value: 400 },
        },
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 20;
    points.name = 'mist';

    function update(t, visible = count) {
        for (let i = 0; i < count; i++) {
            const s = seeds[i];
            const life = (t * 0.045 + s.ph) % 1;
            const a = s.a + t * 0.02;
            pos[i * 3] = Math.sin(a) * s.r;
            pos[i * 3 + 1] = -5.2 + life * 3.0;
            pos[i * 3 + 2] = Math.cos(a) * s.r;
            alpha[i] = i < visible ? Math.sin(life * Math.PI) * 0.6 : 0;
            size[i] = s.sz * (0.8 + life * 0.7);
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.aAlpha.needsUpdate = true;
        geometry.attributes.aSize.needsUpdate = true;
    }
    update(0);
    return {
        points,
        geometry,
        material,
        update,
        setPixelScale(heightPx, fovDeg) {
            material.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
        },
    };
}
