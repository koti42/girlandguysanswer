/*
 * Enlem/boylam → birim küre üzerinde kartezyen koordinat (three.js eksenleri: +Y kuzey).
 * three'ye bağımlı değil; test edilebilir.
 */

const DEG = Math.PI / 180;

/** @returns {{x:number,y:number,z:number}} */
export function latLngToVector3(lat, lng, radius = 1) {
    const phi = (90 - lat) * DEG;
    const theta = (lng + 180) * DEG;
    return {
        x: -radius * Math.sin(phi) * Math.cos(theta),
        y: radius * Math.cos(phi),
        z: radius * Math.sin(phi) * Math.sin(theta),
    };
}

/** İki nokta arasındaki büyük daire açısı (radyan). */
export function angleBetween(a, b) {
    const dot = a.x * b.x + a.y * b.y + a.z * b.z;
    const la = Math.hypot(a.x, a.y, a.z) || 1;
    const lb = Math.hypot(b.x, b.y, b.z) || 1;
    return Math.acos(Math.max(-1, Math.min(1, dot / (la * lb))));
}

/**
 * Kavisli fiber hattın kontrol noktası: orta noktayı küre yüzeyinden uzaklaştırır.
 * Uzun hatlar daha yüksekten geçer.
 */
export function arcControlPoint(a, b, radius = 1) {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    const len = Math.hypot(mid.x, mid.y, mid.z) || 1;
    const lift = radius * (1 + 0.55 * (angleBetween(a, b) / Math.PI));
    return { x: (mid.x / len) * lift, y: (mid.y / len) * lift, z: (mid.z / len) * lift };
}
