/*
 * Kule motorunun shader kaynakları (yalnızca metin; three'ye bağımlı değil).
 *
 * Tüm shader'lar ekran (sRGB) uzayında çalışır: renk dönüşümü ve ton
 * eşleme yok (bkz. palette.js). Sis her yerde aynı: görüş derinliğine göre
 * smoothstep(uFogNear, uFogFar).
 *
 * Bina shader'ı (kule katları + şehir): pencereler doku yerine "metrik"
 * koordinattan (aAnchor + yerel konum × aSize) prosedürel üretilir. Böylece
 * kat daralınca pencereler esnemez, kesilip düşen parça kesildiği yerin
 * pencerelerini taşır ve uzaktaki pencereler titreşmez (fwidth ile
 * ortalamaya geçer). Kutunun yerel normali yüzü seçer (dönen parçada da
 * doğru), ışık dünya normaliyle hesaplanır.
 */

const HASH = /* glsl */ `
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

export const BUILDING_VERT = /* glsl */ `
attribute vec3 aSize;
attribute vec3 aAnchor;
attribute vec3 aColor;
attribute vec3 aFlag; // x: soru katı (altın korniş), y: parlama 0..1, z: pencere tohumu
varying vec3 vMetric;
varying vec3 vLocalN;
varying vec3 vLocalP;
varying vec3 vSize;
varying vec3 vWorldN;
varying vec3 vColor;
varying vec3 vFlag;
varying float vDepth;
void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vMetric = aAnchor + position * aSize;
    vLocalN = normal;
    vLocalP = position;
    vSize = aSize;
    // Kutu normalleri eksen yönünde: ölçek yönü bozmaz, normalize yeterli.
    vWorldN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vColor = aColor;
    vFlag = aFlag;
    vec4 mv = viewMatrix * world;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
}
`;

export const BUILDING_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform vec3 uFogCol;
uniform float uFogNear;
uniform float uFogFar;
uniform float uNight;
uniform float uFloorH;
uniform float uCell;
uniform vec3 uGlass;
uniform vec3 uLamp;
varying vec3 vMetric;
varying vec3 vLocalN;
varying vec3 vLocalP;
varying vec3 vSize;
varying vec3 vWorldN;
varying vec3 vColor;
varying vec3 vFlag;
varying float vDepth;
${HASH}
// [a, b] aralığında 1, kenarlarda w genişliğinde yumuşak.
float band(float x, float a, float b, float w) {
    return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x));
}
void main() {
    vec3 an = abs(vLocalN);
    vec3 base = vColor;
    vec3 col;
    vec3 emit = vec3(0.0);
    vec3 edgeDist = (0.5 - abs(vLocalP)) * vSize;
    float edge;
    if (an.y > 0.5) {
        // Çatı / taban yüzü
        edge = min(edgeDist.x, edgeDist.z);
        float top = step(0.0, vLocalN.y);
        col = base * mix(0.42, 1.04, top);
        col *= mix(0.84, 1.0, smoothstep(0.04, 0.14, edge));
    } else {
        bool fx = an.x > 0.5;
        edge = fx ? edgeDist.z : edgeDist.x;
        float u = (fx ? vMetric.z : vMetric.x) / uCell;
        float fy = vMetric.y / uFloorH + 0.0005;
        float row = floor(fy);
        float v = fy - row;
        float cid = floor(u);
        float fu = u - cid;
        float wu = fwidth(u);
        float wv = fwidth(fy);
        float win = band(fu, 0.17, 0.83, wu) * band(v, 0.27, 0.79, wv);
        // Pencere pikselden küçükse desen yerine ortalaması (titreşim yok).
        float far = clamp(wu * 1.6 - 0.35, 0.0, 1.0);
        win = mix(win, 0.34, far);
        float side = fx ? (vLocalN.x > 0.0 ? 1.0 : 2.0) : (vLocalN.z > 0.0 ? 3.0 : 4.0);
        float rnd = hash12(vec2(cid + side * 37.0, row + vFlag.z * 13.0));
        float litP = 0.16 + 0.64 * uNight;
        float lit = mix(step(1.0 - litP, rnd), litP, far);
        vec3 glass = mix(uGlass, base * 0.45, 0.3);
        col = mix(base, glass, win);
        // Döşeme çizgisi (altta koyu) ve korniş (üstte açık)
        col *= mix(0.66, 1.0, smoothstep(0.0, 0.08, v));
        col = mix(col, base * 1.14, smoothstep(0.9, 0.95, v) * 0.55);
        emit = win * lit * uLamp * (0.3 + 0.95 * uNight) * mix(0.7, 1.15, rnd);
        float gold = vFlag.x * smoothstep(0.84, 0.88, v);
        col = mix(col, vec3(1.0, 0.8, 0.32), gold);
        emit += gold * vec3(1.0, 0.68, 0.22) * (0.35 + 0.65 * uNight);
    }
    float ew = fwidth(edge) * 1.5 + 0.004;
    float rim = 1.0 - smoothstep(0.0, 0.035 + ew, edge);
    vec3 n = normalize(vWorldN);
    float diff = max(dot(n, uSunDir), 0.0);
    vec3 amb = mix(uGroundCol, uSkyCol, n.y * 0.5 + 0.5);
    vec3 c = col * (amb + uSunCol * diff * 0.85) + emit;
    c += rim * 0.16 * (amb + uSunCol * 0.4);
    c += vFlag.y * vec3(1.0, 0.95, 0.82) * 0.85;
    float fogF = smoothstep(uFogNear, uFogFar, vDepth);
    gl_FragColor = vec4(mix(c, uFogCol, fogF), 1.0);
}
`;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w; // her zaman en arkada
}
`;

export const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSun;
uniform float uStars;
uniform float uAurora;
uniform float uTime;
uniform float uLite;
varying vec3 vDir;
${HASH}
void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 col;
    if (y < 0.0) {
        // Ufkun altı sis rengi: zemin ve şehir de aynı renge sisleniyor (kenar dikişi yok)
        col = uFog;
    } else {
        // Ufukta ince pus bandı, sonra degrade
        col = mix(uFog, uHorizon, smoothstep(0.0, 0.11, y));
        col = mix(col, uMid, smoothstep(0.08, 0.36, y));
        col = mix(col, uTop, smoothstep(0.25, 0.9, y));
    }
    // Güneş: disk + iki katman hale (gün batımı)
    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunCol * uSun * (smoothstep(0.9993, 0.9996, sd) * 1.2 + pow(sd, 24.0) * 0.45 + pow(sd, 4.0) * 0.16);
    // Yıldızlar: küre üstünde 3B hücre ızgarası, hafif titreşim
    if (uStars > 0.01 && y > -0.02) {
        vec3 g = d * 160.0;
        vec3 cell = floor(g);
        float r = hash13(cell);
        if (r > 0.972) {
            vec3 f = fract(g) - 0.5;
            float s = smoothstep(0.3, 0.0, length(f));
            float tw = 0.65 + 0.35 * sin(uTime * (1.5 + r * 3.0) + r * 60.0);
            col += vec3(1.0, 0.96, 0.88) * s * tw * uStars * smoothstep(-0.02, 0.18, y) * (0.6 + (r - 0.972) * 14.0);
        }
    }
    // Kuzey ışıkları: azimut boyunca kıvrılan, dikey ışınlı perdeler
    if (uAurora > 0.01 && y > 0.0) {
        float az = atan(d.z, d.x);
        float band = 0.0;
        for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float c = 0.13 + 0.1 * fi + 0.05 * sin(az * (2.0 + fi) + uTime * (0.12 + 0.05 * fi) + fi * 1.9);
            float w = 0.03 + 0.015 * sin(az * 3.0 + uTime * 0.17 + fi);
            // Perde: alt kenar keskin, yukarı doğru uzun sönüm
            float dy = y - c;
            float v = dy < 0.0 ? exp(-pow(dy / (w * 0.6), 2.0)) : exp(-dy / (w * 2.6));
            float rays = uLite > 0.5 ? 0.8 : 0.3 + 0.7 * vnoise(vec2(az * 38.0 + fi * 11.0, uTime * 0.45 + fi)) * (0.6 + 0.4 * vnoise(vec2(az * 9.0 - uTime * 0.2, fi)));
            band += v * rays * (1.0 - fi * 0.22);
        }
        vec3 aur = mix(vec3(0.2, 1.0, 0.55), vec3(0.3, 0.75, 1.0), smoothstep(0.12, 0.3, y));
        aur = mix(aur, vec3(0.9, 0.4, 0.95), smoothstep(0.28, 0.42, y) * 0.55);
        col += aur * band * uAurora * 0.75;
    }
    gl_FragColor = vec4(col, 1.0);
}
`;

export const GROUND_VERT = /* glsl */ `
varying vec3 vWorld;
varying float vDepth;
void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
}
`;

export const GROUND_FRAG = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uRoad;
uniform vec3 uNeonA;
uniform vec3 uNeonB;
uniform vec3 uFogCol;
uniform float uFogNear;
uniform float uFogFar;
uniform float uNight;
uniform float uTime;
uniform float uLite;
uniform float uBlock;
uniform float uPlaza;
varying vec3 vWorld;
varying float vDepth;
${HASH}
void main() {
    vec2 p = vWorld.xz;
    vec2 g = p / uBlock;
    vec2 f = abs(fract(g) - 0.5);
    float w = max(fwidth(g.x), fwidth(g.y));
    float road = smoothstep(0.43 - w, 0.43 + w, max(f.x, f.y));
    float r = length(p);
    float plaza = 1.0 - smoothstep(uPlaza - 0.5, uPlaza + 0.5, r);
    road *= 1.0 - plaza;
    vec3 col = mix(uBase, uRoad, road);
    // Blok içi: yukarıdan bakınca çatılar ve pencere ışıkları (uzaktaki sahte şehir)
    vec2 lot = floor(g * 2.0);
    float lr = hash12(lot + 17.0);
    vec2 lf = fract(g * 2.0);
    // Ayrıntı pikselden küçülünce ortalamasına geç (uzakta titreşim/moiré yok).
    float farLot = smoothstep(0.03, 0.08, w);
    float farWin = smoothstep(0.015, 0.045, w);
    float roof = (1.0 - road) * mix(smoothstep(0.06, 0.1, min(min(lf.x, lf.y), min(1.0 - lf.x, 1.0 - lf.y))), 0.8, farLot);
    col = mix(col, uBase * (1.25 + mix(lr, 0.5, farLot) * 0.9), roof * 0.8);
    vec2 wc = floor(p * 1.3);
    float litP = 0.14 + uNight * 0.22;
    float wl = mix(step(1.0 - litP, hash12(wc)) * step(0.25, lr), litP * 0.75, farWin) * roof;
    col += vec3(1.0, 0.82, 0.55) * wl * (0.12 + 0.55 * uNight);
    // Yol ortasındaki neon şerit (gece parlar)
    float mid = (1.0 - smoothstep(0.0, 0.012 + w, abs(max(f.x, f.y) - 0.5))) * road;
    vec3 neon = mix(uNeonA, uNeonB, step(0.5, hash12(floor(g))));
    col += neon * mid * (0.15 + 0.6 * uNight);
    // Araç farları: yollarda akan ışık noktaları (düşük kalitede yok)
    if (uLite < 0.5) {
        vec2 lane = vec2(f.y > f.x ? 1.0 : 0.0, f.y > f.x ? 0.0 : 1.0);
        float along = dot(p, vec2(lane.x, lane.y));
        float dirS = step(0.5, hash12(floor(g * lane.yx + 0.5))) * 2.0 - 1.0;
        float carT = fract(along / 7.0 + uTime * 0.35 * dirS + hash12(floor(g.yx)) * 3.0);
        float car = smoothstep(0.1, 0.0, abs(carT - 0.5)) * road * smoothstep(0.38, 0.47, max(f.x, f.y));
        col += mix(vec3(1.0, 0.85, 0.6), vec3(1.0, 0.3, 0.3), step(0.0, dirS)) * car * (0.25 + 0.9 * uNight);
    }
    // Meydan: açık taş zemin, kulenin çevresinde ışık halkası
    vec3 stone = mix(uBase * 1.6, uRoad * 1.2, 0.4);
    col = mix(col, stone, plaza * 0.85);
    float ring = 1.0 - smoothstep(0.0, 0.08 + w * 20.0, abs(r - (uPlaza - 1.4)));
    col += uNeonA * ring * plaza * (0.25 + 0.7 * uNight);
    float fogF = smoothstep(uFogNear, uFogFar, vDepth);
    gl_FragColor = vec4(mix(col, uFogCol, fogF), 1.0);
}
`;

export const CLOUD_VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec3 aScale; // x, y: boy; z: tohum
varying vec2 vUv;
varying float vSeed;
varying float vDepth;
void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 wp = aCenter + right * position.x * aScale.x + up * position.y * aScale.y;
    vUv = uv;
    vSeed = aScale.z;
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
}
`;

export const CLOUD_FRAG = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
varying float vDepth;
${HASH}
void main() {
    vec2 c = vUv - 0.5;
    float n = vnoise(vUv * 4.0 + vSeed * 7.0 + vec2(uTime * 0.02, 0.0)) * 0.6 + vnoise(vUv * 9.0 + vSeed * 3.0) * 0.4;
    float blob = 1.0 - smoothstep(0.18, 0.5, length(c * vec2(1.0, 2.2)) + (n - 0.5) * 0.28);
    float a = blob * uOpacity * smoothstep(3.0, 18.0, vDepth);
    vec3 col = mix(uShade, uLit, smoothstep(0.2, 0.8, vUv.y + n * 0.2));
    gl_FragColor = vec4(col * a, a);
}
`;

export const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const RING_FRAG = /* glsl */ `
uniform vec2 uHalf;
uniform vec2 uPlane;
uniform float uProgress;
uniform float uExpand;
uniform vec3 uColor;
varying vec2 vUv;
float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
    vec2 p = (vUv - 0.5) * uPlane;
    float grow = uExpand * uProgress;
    float d = sdRoundBox(p, uHalf + grow, 0.12 + grow * 0.35);
    float w = 0.08 + 0.16 * (1.0 - uProgress);
    float ring = 1.0 - smoothstep(0.0, w, abs(d));
    float glow = (1.0 - smoothstep(0.0, w * 6.0, abs(d))) * 0.55;
    float a = (ring * 1.6 + glow) * (1.0 - uProgress) * (1.0 - uProgress * 0.3);
    gl_FragColor = vec4(uColor * a, a);
}
`;
