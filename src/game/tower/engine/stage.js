/*
 * Renderer, sahne, kamera ve gökyüzü kubbesi.
 *
 * Gökyüzü kameraya bağlı tek bir kubbe: degrade, gün batımı güneşi,
 * yıldızlar ve kuzey ışıkları aynı shader'da (tek çizim). Renkleri her
 * karede yüksekliğe göre palette.skyAt verir; burada yalnızca uniform'lara
 * kopyalanır (allocation yok).
 *
 * Gölge yok; avatarın kendi malzemeleri için üç ışık (yarıküre + yönlü)
 * sahnede, renkleri gökyüzüyle birlikte değişir.
 */
import * as THREE from 'three';
import { SKY_FRAG, SKY_VERT } from './shaders.js';

const SKY_RADIUS = 600;
export const CAMERA_FAR = 1400;
export const VFOV = 44;

const setRgb = (v, rgb) => v.set(rgb[0], rgb[1], rgb[2]);

export function createStage(container, { antialias, pixelRatio }) {
    const renderer = new THREE.WebGLRenderer({
        antialias,
        alpha: false,
        depth: true,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x1b1650, 1);
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
    const camera = new THREE.PerspectiveCamera(VFOV, 1, 0.1, CAMERA_FAR);
    scene.add(camera);

    // Avatar (three malzemeleri) için ışıklar; renkleri setSky ile değişir.
    const hemi = new THREE.HemisphereLight(0x8d77c9, 0x6a3a52, 2.2);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffc48a, 1.6);
    key.position.set(6, 9, 11);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8a7a, 1.2);
    rim.position.set(-6, 5, -10);
    scene.add(rim);

    // Gökyüzü kubbesi
    const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, 48, 24);
    const skyMat = new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: {
            uTop: { value: new THREE.Vector3() },
            uMid: { value: new THREE.Vector3() },
            uHorizon: { value: new THREE.Vector3() },
            uFog: { value: new THREE.Vector3() },
            uSunDir: { value: new THREE.Vector3(-0.62, 0.05, -0.78).normalize() },
            uSunCol: { value: new THREE.Vector3(1, 0.8, 0.55) },
            uSun: { value: 1 },
            uStars: { value: 0 },
            uAurora: { value: 0 },
            uTime: { value: 0 },
            uLite: { value: 0 },
        },
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);
    const su = skyMat.uniforms;

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
        resize,
        /** Gökyüzü ve sahne ışıkları (palette.skyAt çıktısı). */
        setSky(s, time, sunY) {
            setRgb(su.uTop.value, s.top);
            setRgb(su.uMid.value, s.mid);
            setRgb(su.uHorizon.value, s.horizon);
            setRgb(su.uFog.value, s.fog);
            su.uSun.value = s.sun;
            su.uStars.value = s.stars;
            su.uAurora.value = s.aurora;
            su.uTime.value = time;
            // Güneş yükseldikçe ufkun altına iner (gün batımı ilerliyor).
            su.uSunDir.value.set(-0.62, sunY, -0.78).normalize();
            su.uSunCol.value.set(s.sunCol[0], s.sunCol[0] * 0.78 + s.sunCol[1] * 0.12, s.sunCol[2] * 0.6);
            hemi.color.setRGB(s.skyCol[0], s.skyCol[1], s.skyCol[2], THREE.SRGBColorSpace);
            hemi.groundColor.setRGB(s.groundCol[0], s.groundCol[1], s.groundCol[2], THREE.SRGBColorSpace);
            key.color.setRGB(s.sunCol[0], s.sunCol[1], s.sunCol[2], THREE.SRGBColorSpace);
        },
        followCamera() {
            sky.position.copy(camera.position);
        },
        setLite(on) {
            su.uLite.value = on ? 1 : 0;
        },
        get width() {
            return width;
        },
        get height() {
            return height;
        },
        dispose() {
            skyGeo.dispose();
            skyMat.dispose();
            const gl = renderer.getContext();
            renderer.dispose();
            // Bağlamı hemen bırak: tekrar tekrar oyna-kapat döngüsünde tarayıcının
            // WebGL bağlam sınırına takılmayalım (zaten kaybolduysa gerek yok).
            if (gl && !gl.isContextLost()) renderer.forceContextLoss();
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        },
    };
}
