/*
 * Renderer, sahne, kamera, ışıklar ve gökyüzü.
 *
 * Gökyüzü kameraya bağlı bir kubbe (köşe renkli degrade), retro gün batımı
 * güneşi, iki katman uzak şehir silüeti ve yıldızlar. Bunların hiçbiri sisten
 * etkilenmez; cadde ise 150 m'de sise karışıp silüetin önünde kaybolur.
 *
 * Düşük kalite kademesinde (setLite) silüet katmanları ve yıldızlar
 * (ekranı kaplayan saydam katmanlar: yazılım render'da pahalı) gizlenir,
 * sis yaklaşır (world/entities de o mesafenin ötesini çizmez).
 */
import * as THREE from 'three';
import { SCENE_COLORS } from './palette.js';
import { createSkylineTexture, createSunTexture } from './textures.js';
import { seededRandom } from './mathUtils.js';

export const FOG_NEAR = 38;
export const FOG_FAR = 150;
export const LITE_FOG_NEAR = 28;
export const LITE_FOG_FAR = 105;
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
            scene.fog.near = on ? LITE_FOG_NEAR : FOG_NEAR;
            scene.fog.far = on ? LITE_FOG_FAR : FOG_FAR;
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

    // Kubbe: yükseklik açısına göre degrade.
    const domeGeo = new THREE.SphereGeometry(SKY_RADIUS, 32, 20);
    const pos = domeGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cTop = new THREE.Color(SCENE_COLORS.skyTop);
    const cMid = new THREE.Color(SCENE_COLORS.skyMid);
    const cLow = new THREE.Color(SCENE_COLORS.skyLow);
    const cHor = new THREE.Color(SCENE_COLORS.horizon);
    const cFog = new THREE.Color(SCENE_COLORS.fog);
    const tmp = new THREE.Color();
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
    domeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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

    // Silüet katmanları (uzak açık, yakın koyu).
    const layers = [];
    const layerDefs = [
        { seed: 21, color: '#3d1d5e', alpha: 0.35, z: -440, w: 1500, h: 170, y: 36, repeat: 2 },
        { seed: 42, color: '#24123f', alpha: 0.55, z: -400, w: 1300, h: 120, y: 20, repeat: 2 },
    ];
    for (const d of layerDefs) {
        const tex = createSkylineTexture(d.seed, d.color, d.alpha);
        tex.repeat.set(d.repeat, 1);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
        const geo = new THREE.PlaneGeometry(1, 1);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(d.w, d.h, 1);
        mesh.position.set(0, d.y + d.h / 2 - d.h * 0.62, d.z);
        mesh.renderOrder = -7;
        mesh.frustumCulled = false;
        group.add(mesh);
        layers.push({ tex, parallax: d.z, mesh });
        disposables.push(tex, mat, geo);
    }

    return {
        group,
        /** Kamera konumunu izle; silüetler yatayda hafif paralaks yapsın. */
        update(camX, camY) {
            group.position.set(camX, camY, 0);
            for (let i = 0; i < layers.length; i++) {
                layers[i].tex.offset.x = (camX / -layers[i].parallax) * 0.6;
            }
        },
        setLite(on) {
            stars.visible = !on;
            for (let i = 0; i < layers.length; i++) layers[i].mesh.visible = !on;
        },
        dispose() {
            for (const d of disposables) d.dispose();
        },
    };
}
