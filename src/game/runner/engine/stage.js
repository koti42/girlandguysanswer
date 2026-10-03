/*
 * Renderer, sahne, kamera, ışıklar ve gökyüzü.
 *
 * Gökyüzü kameraya bağlı bir kubbe (köşe renkli degrade), retro gün batımı
 * güneşi, ay, iki katman uzak şehir silüeti (uzakta İstanbul esintili kubbe,
 * minare ve kule silüeti) ve yıldızlar. Bunların hiçbiri sisten etkilenmez;
 * cadde ise 150 m'de sise karışıp silüetin önünde kaybolur.
 *
 * Ortam (setAmbience): gece payı (0 altın saat .. 1 gece) gökyüzü renklerini,
 * sisi, ışıkları, güneş/ay/yıldızları kaydırır; tünel payı sisi koyulaştırıp
 * yaklaştırır ve ortam ışığını kısar. Değişim küçükse hiçbir şey yazılmaz.
 *
 * Düşük kalite kademesinde (setLite) silüet katmanları ve yıldızlar
 * (ekranı kaplayan saydam katmanlar: yazılım render'da pahalı) gizlenir,
 * sis yaklaşır (world/entities de o mesafenin ötesini çizmez).
 */
import * as THREE from 'three';
import { SCENE_COLORS, SKY_PALETTES } from './palette.js';
import { createIstanbulSkylineTexture, createSkylineTexture, createSunTexture } from './textures.js';
import { clamp, seededRandom } from './mathUtils.js';

export const FOG_NEAR = 38;
export const FOG_FAR = 150;
export const LITE_FOG_NEAR = 28;
export const LITE_FOG_FAR = 105;
// Tünelde sis: daha yakın ve koyu (tünel ışıkları sisin önünde parlasın).
const TUNNEL_FOG_NEAR = 12;
const TUNNEL_FOG_FAR = 85;
const CAMERA_FAR = 700;
const SKY_RADIUS = 520;

export function createStage(container, { antialias, pixelRatio, glowTexture }) {
    const renderer = new THREE.WebGLRenderer({
        antialias,
        alpha: false,
        depth: true,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(SCENE_COLORS.fog, 1);
    renderer.shadowMap.enabled = false;
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
    canvas.style.webkitTapHighlightColor = 'transparent';
    canvas.style.outline = 'none';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(SCENE_COLORS.fog, FOG_NEAR, FOG_FAR);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, CAMERA_FAR);
    scene.add(camera);

    // Işıklar: mor gökyüzü + sıcak zemin yansıması, arkadan ay ışığı, önden coral kontur.
    const hemi = new THREE.HemisphereLight(0x9d8cff, 0x5a2a3a, 2.1);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xc7d2ff, 1.5);
    key.position.set(-4, 10, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8a7a, 1.6);
    rim.position.set(3, 4, -10);
    scene.add(rim);

    const sky = createSky(glowTexture);
    scene.add(sky.group);

    // --- Ortam ---
    const amb = { night: -1, tunnel: -1, lite: false };
    const P0 = SKY_PALETTES.day;
    const P1 = SKY_PALETTES.dusk;
    const P2 = SKY_PALETTES.night;
    const _ca = new THREE.Color();
    const _cb = new THREE.Color();
    const tunnelFog = new THREE.Color(SKY_PALETTES.tunnelFog);
    const horizon = new THREE.Color(SCENE_COLORS.horizon);
    /** Paletten gece payına göre renk (out'a yazar). */
    function palColor(key, n, out) {
        if (n <= 0.55) {
            const t = n / 0.55;
            return out.set(P0[key]).lerp(_cb.set(P1[key]), t);
        }
        const t = (n - 0.55) / 0.45;
        return out.set(P1[key]).lerp(_cb.set(P2[key]), t);
    }
    function palNum(key, n) {
        if (n <= 0.55) return P0[key] + (P1[key] - P0[key]) * (n / 0.55);
        return P1[key] + (P2[key] - P1[key]) * ((n - 0.55) / 0.45);
    }
    function applyAmbience(n, tu) {
        const dark = 1 - tu * 0.62;
        palColor('fog', n, _ca).lerp(tunnelFog, tu);
        scene.fog.color.copy(_ca);
        renderer.setClearColor(_ca, 1);
        const near = amb.lite ? LITE_FOG_NEAR : FOG_NEAR;
        const far = amb.lite ? LITE_FOG_FAR : FOG_FAR;
        scene.fog.near = near + (TUNNEL_FOG_NEAR - near) * tu;
        scene.fog.far = far + (Math.min(far, TUNNEL_FOG_FAR) - far) * tu;
        palColor('hemiSky', n, hemi.color);
        palColor('hemiGround', n, hemi.groundColor);
        hemi.intensity = palNum('hemi', n) * dark;
        palColor('key', n, key.color);
        key.intensity = palNum('keyI', n) * (1 - tu * 0.7);
        palColor('rim', n, rim.color);
        rim.intensity = palNum('rimI', n) * (1 - tu * 0.5);
        sky.setNight(n, palColor);
        palColor('horizon', n, horizon);
    }

    let width = 1;
    let height = 1;
    function resize() {
        const w = Math.max(1, Math.floor(container.clientWidth));
        const h = Math.max(1, Math.floor(container.clientHeight));
        if (w === width && h === height) return false;
        width = w;
        height = h;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        return true;
    }
    resize();

    return {
        renderer,
        scene,
        camera,
        canvas,
        sky,
        resize,
        /** Düşük kalite kademesi: silüet/yıldız yok, sis yakın. */
        setLite(on) {
            sky.setLite(on);
            amb.lite = Boolean(on);
            const n = amb.night < 0 ? 0.55 : amb.night;
            const tu = amb.tunnel < 0 ? 0 : amb.tunnel;
            applyAmbience(n, tu);
        },
        /**
         * night: 0 altın saat .. 1 gece; tunnel: 0 açık .. 1 tünel içi.
         * Küçük değişimleri yok sayar (her kare çağrılabilir).
         */
        setAmbience(night, tunnel) {
            const n = clamp(night, 0, 1);
            const tu = clamp(tunnel, 0, 1);
            if (Math.abs(n - amb.night) < 0.004 && Math.abs(tu - amb.tunnel) < 0.004) return;
            amb.night = n;
            amb.tunnel = tu;
            applyAmbience(n, tu);
        },
        /** O anki ufuk rengi (ıslak yol yansıması için; salt okunur). */
        horizon,
        /** Palet sayısal değeri (ör. 'windows', 'road') o anki gece payında. */
        paletteValue(key) {
            return palNum(key, amb.night < 0 ? 0.55 : amb.night);
        },
        get width() {
            return width;
        },
        get height() {
            return height;
        },
        dispose() {
            sky.dispose();
            const gl = renderer.getContext();
            renderer.dispose();
            // Bağlamı hemen bırak: tekrar tekrar oyna-kapat döngüsünde tarayıcının
            // WebGL bağlam sınırına takılmayalım (zaten kaybolduysa gerek yok).
            if (gl && !gl.isContextLost()) renderer.forceContextLoss();
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        },
    };
}

function createSky(glowTexture) {
    const group = new THREE.Group();
    const disposables = [];

    // Kubbe: yükseklik açısına göre degrade (renkler palete göre yeniden yazılır).
    const domeGeo = new THREE.SphereGeometry(SKY_RADIUS, 32, 20);
    const pos = domeGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cTop = new THREE.Color(SCENE_COLORS.skyTop);
    const cMid = new THREE.Color(SCENE_COLORS.skyMid);
    const cLow = new THREE.Color(SCENE_COLORS.skyLow);
    const cHor = new THREE.Color(SCENE_COLORS.horizon);
    const cFog = new THREE.Color(SCENE_COLORS.fog);
    const tmp = new THREE.Color();
    const colorAttr = new THREE.BufferAttribute(colors, 3);
    function paintDome() {
        for (let i = 0; i < pos.count; i++) {
            const y = pos.getY(i) / SKY_RADIUS;
            const z = pos.getZ(i) / SKY_RADIUS;
            if (y < 0) tmp.copy(cFog);
            else if (y < 0.06) {
                // Ufuk bandı: önde (güneş tarafı, -z) daha sıcak.
                const warm = Math.max(0, -z) * 0.85 + 0.15;
                tmp.copy(cFog).lerp(cHor, (y / 0.06) * warm);
            } else if (y < 0.3) {
                const warm = Math.max(0, -z) * 0.85 + 0.15;
                tmp.copy(cHor).lerp(cLow, 1 - warm * 0.35).lerp(cLow, (y - 0.06) / 0.24);
            } else if (y < 0.62) tmp.copy(cLow).lerp(cMid, (y - 0.3) / 0.32);
            else tmp.copy(cMid).lerp(cTop, (y - 0.62) / 0.38);
            colors[i * 3] = tmp.r;
            colors[i * 3 + 1] = tmp.g;
            colors[i * 3 + 2] = tmp.b;
        }
        colorAttr.needsUpdate = true;
    }
    paintDome();
    domeGeo.setAttribute('color', colorAttr);
    const domeMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    group.add(dome);
    disposables.push(domeGeo, domeMat);

    // Yıldızlar: üst yarıküre, sabit.
    const starCount = 260;
    const starPos = new Float32Array(starCount * 3);
    const rnd = seededRandom(3);
    for (let i = 0; i < starCount; i++) {
        const theta = rnd() * Math.PI * 2;
        const y = 0.18 + rnd() * 0.8;
        const r = Math.sqrt(1 - y * y);
        starPos[i * 3] = Math.cos(theta) * r * (SKY_RADIUS - 20);
        starPos[i * 3 + 1] = y * (SKY_RADIUS - 20);
        starPos[i * 3 + 2] = Math.sin(theta) * r * (SKY_RADIUS - 20);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
        size: 2.2,
        sizeAttenuation: false,
        map: glowTexture,
        color: 0xfff4e0,
        transparent: true,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.renderOrder = -9;
    stars.frustumCulled = false;
    group.add(stars);
    disposables.push(starGeo, starMat);

    // Güneş: caddenin ucunda, ufkun hemen üstünde.
    const sunTex = createSunTexture();
    const sunMat = new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false });
    const sunGeo = new THREE.PlaneGeometry(1, 1);
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.scale.set(230, 230, 1);
    sun.position.set(0, 52, -470);
    sun.renderOrder = -8;
    sun.frustumCulled = false;
    group.add(sun);
    disposables.push(sunTex, sunMat, sunGeo);

    // Ay (gece): güneşin solunda yukarıda, soluk disk + hale.
    const moonMat = new THREE.MeshBasicMaterial({ map: glowTexture, color: 0xe8e4ff, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    const moonGeo = new THREE.PlaneGeometry(1, 1);
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.scale.set(70, 70, 1);
    moon.position.set(-95, 118, -470);
    moon.renderOrder = -8;
    moon.frustumCulled = false;
    moon.visible = false;
    group.add(moon);
    const moonDiscMat = new THREE.MeshBasicMaterial({ color: 0xfdf8ff, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const moonDiscGeo = new THREE.CircleGeometry(1, 28);
    const moonDisc = new THREE.Mesh(moonDiscGeo, moonDiscMat);
    moonDisc.scale.set(11, 11, 1);
    moonDisc.position.set(-95, 118, -469);
    moonDisc.renderOrder = -7;
    moonDisc.frustumCulled = false;
    moonDisc.visible = false;
    group.add(moonDisc);
    disposables.push(moonMat, moonGeo, moonDiscMat, moonDiscGeo);

    // Silüet katmanları: uzakta İstanbul (tek sahne), önde alçak binalar.
    const layers = [];
    const layerDefs = [
        { istanbul: true, color: '#ffffff', alpha: 0, z: -440, w: 1400, h: 175, y: 30, repeat: 1 },
        { seed: 42, color: '#24123f', alpha: 0.55, z: -400, w: 1300, h: 95, y: 14, repeat: 2 },
    ];
    for (const d of layerDefs) {
        const tex = d.istanbul ? createIstanbulSkylineTexture(d.color, d.alpha) : createSkylineTexture(d.seed, d.color, d.alpha);
        tex.repeat.set(d.repeat, 1);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
        const geo = new THREE.PlaneGeometry(1, 1);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(d.w, d.h, 1);
        // İstanbul katmanı ufkun hemen altından başlar: kubbe ve kule güneşin önünde yükselsin.
        mesh.position.set(0, d.istanbul ? d.h / 2 - 16 : d.y + d.h / 2 - d.h * 0.62, d.z);
        mesh.renderOrder = -7;
        mesh.frustumCulled = false;
        group.add(mesh);
        layers.push({ tex, parallax: d.z, mesh, mat, repeat: d.repeat });
        disposables.push(tex, mat, geo);
    }

    const sunBase = sun.position.y;
    const layerDay = new THREE.Color(0x8a6aa8);
    const layerNight = new THREE.Color(0xffffff);
    // İstanbul katmanı beyaz dokulu: rengi doğrudan malzemeden (gece koyu mor, gündüz pus).
    const istNight = new THREE.Color(0x2e1648);
    const istDusk = new THREE.Color(0x3d1d5e);
    const istDay = new THREE.Color(0xb48aac);
    let isLite = false;
    let starsOn = 1;
    let moonOn = 0;

    return {
        group,
        /** Kamera konumunu izle; silüetler yatayda hafif paralaks yapsın. */
        update(camX, camY) {
            group.position.set(camX, camY, 0);
            for (let i = 0; i < layers.length; i++) {
                // Tek sahne (tekrarsız) katman kaymasın diye paralaks küçük.
                const k = layers[i].repeat > 1 ? 0.6 : 0.15;
                layers[i].tex.offset.x = (camX / -layers[i].parallax) * k;
            }
        },
        /** Gece payı: kubbe renkleri, güneş batışı, ay ve yıldızlar. */
        setNight(n, palColor) {
            palColor('skyTop', n, cTop);
            palColor('skyMid', n, cMid);
            palColor('skyLow', n, cLow);
            palColor('horizon', n, cHor);
            palColor('fog', n, cFog);
            paintDome();
            // Güneş gece ufkun altına iner; gündüz biraz yükselir.
            const sunK = clamp(1 - (n - 0.6) / 0.35, 0, 1);
            sun.position.y = sunBase - (1 - sunK) * 140 + (1 - Math.min(1, n / 0.55)) * 24;
            sun.visible = sunK > 0.01;
            sunMat.opacity = sunK;
            starsOn = clamp((n - 0.3) / 0.5, 0, 1);
            starMat.opacity = starsOn;
            stars.visible = !isLite && starsOn > 0.01;
            moonOn = clamp((n - 0.65) / 0.3, 0, 1);
            moonMat.opacity = moonOn * 0.55;
            moonDiscMat.opacity = moonOn;
            moon.visible = moonOn > 0.01;
            moonDisc.visible = moonOn > 0.01;
            // Silüetler gündüz pusla açılır (gece koyu mor).
            const day = clamp(1 - n / 0.55, 0, 1);
            for (let i = 1; i < layers.length; i++) layers[i].mat.color.copy(layerNight).lerp(layerDay, day * 0.6);
            if (n <= 0.55) layers[0].mat.color.copy(istDusk).lerp(istDay, day);
            else layers[0].mat.color.copy(istDusk).lerp(istNight, (n - 0.55) / 0.45);
        },
        setLite(on) {
            isLite = Boolean(on);
            stars.visible = !on && starsOn > 0.01;
            for (let i = 0; i < layers.length; i++) layers[i].mesh.visible = !on;
        },
        dispose() {
            for (const d of disposables) d.dispose();
        },
    };
}
