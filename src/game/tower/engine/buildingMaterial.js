/*
 * Kule katları ve şehir binaları için ortak malzeme + örnekli kutu kurucu.
 *
 * Her örneğin özellikleri InstancedBufferAttribute'larda: boy (aSize),
 * pencere çapası (aAnchor), renk (aColor), bayraklar (aFlag). Matris
 * merkez + ölçekten (ya da düşen parçada dönüşten) kurulur.
 */
import * as THREE from 'three';
import { BUILDING_FRAG, BUILDING_VERT } from './shaders.js';

const setRgb = (v, rgb) => v.set(rgb[0], rgb[1], rgb[2]);

export function createBuildingMaterial({ floorH, cell, glass = [0.1, 0.13, 0.27], lamp = [1, 0.82, 0.52] }) {
    return new THREE.ShaderMaterial({
        vertexShader: BUILDING_VERT,
        fragmentShader: BUILDING_FRAG,
        uniforms: {
            uSunDir: { value: new THREE.Vector3(0.38, 0.58, 0.72).normalize() },
            uSunCol: { value: new THREE.Vector3(1, 0.8, 0.6) },
            uSkyCol: { value: new THREE.Vector3(0.5, 0.45, 0.8) },
            uGroundCol: { value: new THREE.Vector3(0.4, 0.22, 0.32) },
            uFogCol: { value: new THREE.Vector3(0.8, 0.4, 0.5) },
            uFogNear: { value: 60 },
            uFogFar: { value: 400 },
            uNight: { value: 0.3 },
            uFloorH: { value: floorH },
            uCell: { value: cell },
            uGlass: { value: new THREE.Vector3(glass[0], glass[1], glass[2]) },
            uLamp: { value: new THREE.Vector3(lamp[0], lamp[1], lamp[2]) },
        },
    });
}

/** Gökyüzü/sis durumunu malzemeye yaz (her kare; allocation yok). */
export function applyEnv(material, sky, fogNear, fogFar) {
    const u = material.uniforms;
    setRgb(u.uSunCol.value, sky.sunCol);
    setRgb(u.uSkyCol.value, sky.skyCol);
    setRgb(u.uGroundCol.value, sky.groundCol);
    setRgb(u.uFogCol.value, sky.fog);
    u.uFogNear.value = fogNear;
    u.uFogFar.value = fogFar;
    u.uNight.value = sky.night;
}

/**
 * Örnekli kutu: `capacity` örneklik InstancedMesh + özellik dizileri.
 * Dönen nesnenin set(i, ...) yazımları ilgili aralığı güncellenmiş işaretler.
 */
export function createBoxInstances(geometry, material, capacity) {
    const geo = geometry.clone();
    const size = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    const anchor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    const color = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    const flag = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    for (const a of [size, anchor, color, flag]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSize', size);
    geo.setAttribute('aAnchor', anchor);
    geo.setAttribute('aColor', color);
    geo.setAttribute('aFlag', flag);
    const mesh = new THREE.InstancedMesh(geo, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    const m = new THREE.Matrix4();
    // Toplu yazımda (şehir kurulumu) aralık işaretlenmez; bulkEnd hepsini bir kerede yükler.
    let bulk = false;

    function mark(attr, i) {
        if (bulk) return;
        attr.addUpdateRange(i * attr.itemSize, attr.itemSize);
        attr.needsUpdate = true;
    }

    return {
        mesh,
        geometry: geo,
        attrs: { size, anchor, color, flag },
        /** Döndürülmemiş kutu: merkez (cx, cy, cz), boy (sx, sy, sz). */
        setBox(i, cx, cy, cz, sx, sy, sz) {
            m.makeScale(sx, sy, sz);
            m.setPosition(cx, cy, cz);
            mesh.setMatrixAt(i, m);
            mark(mesh.instanceMatrix, i);
            size.setXYZ(i, sx, sy, sz);
            anchor.setXYZ(i, cx, cy, cz);
            mark(size, i);
            mark(anchor, i);
        },
        setMatrix(i, matrix) {
            mesh.setMatrixAt(i, matrix);
            mark(mesh.instanceMatrix, i);
        },
        setAnchor(i, cx, cy, cz, sx, sy, sz) {
            size.setXYZ(i, sx, sy, sz);
            anchor.setXYZ(i, cx, cy, cz);
            mark(size, i);
            mark(anchor, i);
        },
        setColor(i, rgb) {
            color.setXYZ(i, rgb[0], rgb[1], rgb[2]);
            mark(color, i);
        },
        setFlag(i, x, y, z) {
            flag.setXYZ(i, x, y, z);
            mark(flag, i);
        },
        setFlagY(i, y) {
            flag.setY(i, y);
            mark(flag, i);
        },
        bulkBegin() {
            bulk = true;
        },
        bulkEnd() {
            bulk = false;
            for (const a of [mesh.instanceMatrix, size, anchor, color, flag]) {
                a.clearUpdateRanges();
                a.needsUpdate = true;
            }
        },
        dispose() {
            geo.dispose();
            mesh.dispose();
        },
    };
}
