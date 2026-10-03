/*
 * "Ucuz bloom" haleleri: toplamalı, köşe renkli nokta sprite malzemesi.
 *
 * PointsMaterial'dan farkı: ekrandaki boyut piksel cinsinden sınırlı
 * (uMaxSize). Kameraya çok yakın bir hale sınırsız büyüyüp ekranı
 * kaplayabilir; yazılım render'da (ve zayıf GPU'da) bu tek başına kare
 * süresini katlar. Boyut dünya biriminde (m) verilir: size * uScale / mesafe.
 */
import * as THREE from 'three';

export const HALO_MAX_PX = 84;
export const LITE_HALO_MAX_PX = 40;

export function createHaloMaterial({ map, size = 1, maxPx = HALO_MAX_PX }) {
    return new THREE.ShaderMaterial({
        uniforms: {
            map: { value: map },
            uSize: { value: size },
            uScale: { value: 400 },
            uMaxSize: { value: maxPx },
            uOpacity: { value: 1 },
        },
        vertexShader: `
            attribute vec3 color;
            uniform float uSize;
            uniform float uScale;
            uniform float uMaxSize;
            varying vec3 vColor;
            void main() {
                vColor = color;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = clamp(uSize * uScale / max(0.1, -mv.z), 0.0, uMaxSize);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: `
            uniform sampler2D map;
            uniform float uOpacity;
            varying vec3 vColor;
            void main() {
                float a = texture2D(map, gl_PointCoord).a * uOpacity;
                if (a < 0.004) discard;
                gl_FragColor = vec4(vColor * a, 1.0);
                #include <colorspace_fragment>
            }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
}

/** Ekran yüksekliği (px) ve dikey FOV'dan dünya -> piksel ölçeği. */
export function setHaloPixelScale(mat, heightPx, fovDeg) {
    mat.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
}
