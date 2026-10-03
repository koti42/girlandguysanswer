/*
 * Kule motorunun saf geometri/kamera hesapları (three bağımsız, node'da
 * test edilir).
 *
 * Ölçek: 1 birim = 1 m. Sim milimetre kullanır (x/1000). Kat k (k ≥ 1)
 * y ∈ [(k-1)·H, k·H] aralığında; tabanın (kat 0) üstü y = 0, altı zeminde
 * (y = -BASE_H). Sim kat yüksekliği bilmez: H yalnızca görsel.
 */

export const FLOOR_H = 0.75;
export const BASE_H = 4.5; // 6 kat boyunda lobi; şehir zemini y = -BASE_H
export const MM = 0.001;

/** Kat k'nin (k ≥ 1) merkez yüksekliği. */
export function floorCenterY(k) {
    return (k - 0.5) * FLOOR_H;
}

/** Kat k'nin üst yüzeyi (k = 0 → tabanın üstü, 0). */
export function floorTopY(k) {
    return Math.max(0, k) * FLOOR_H;
}

/**
 * Sim'in offsetAt'inin kesirli t' ile çalışan görsel karşılığı: iki tick
 * arasında hareketli kat akıcı kaysın. t ≥ 0, v mm/tick, R mm.
 */
export function pingPongMm(t, v, R) {
    const four = 4 * R;
    let ph = (t * v) % four;
    if (ph < 0) ph += four;
    return ph <= 2 * R ? ph - R : 3 * R - ph;
}

/**
 * İstenen genişlik (needW) ve yükseklik (needH, metre) kadrajın içine
 * sığsın diye kameranın hedefe uzaklığı. Dikey ekranda genişlik, yatayda
 * yükseklik belirler.
 */
export function fitDistance(aspect, vfovDeg, needW, needH) {
    const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    const tv = Math.tan(((vfovDeg * Math.PI) / 180) / 2);
    const th = tv * a;
    return Math.max(needW / (2 * th), needH / (2 * tv));
}

/*
 * Oyun kadrajı: hareketli kat ±R (4,5 m) + kendi yarı boyu kadar kayar;
 * 45° azimutta iki eksen de ekrana cos45 ile düşer. Dönüş noktalarında katın
 * dış köşesi ekrandan biraz taşabilir (kısa an); dar ekranda kule büyük
 * görünsün diye bilerek.
 */
export const PLAY_NEED_W = 9.6;
export const PLAY_NEED_H = 10;
export const MIN_DIST = 11;
export const MAX_DIST = 34;

export function playDistance(aspect, vfovDeg) {
    const d = fitDistance(aspect, vfovDeg, PLAY_NEED_W, PLAY_NEED_H);
    return Math.min(MAX_DIST, Math.max(MIN_DIST, d));
}

/*
 * Oyun bakış açısı (pitch, radyan): kulenin tepesi (kamera hedefi, yükseliş
 * açısı el) ekranda NDC y = fy'de dursun (yukarı +). Yatayda fy = -0.21
 * (≈ PITCH 0.136, tepe ekranın %60 aşağısında). Dikeyde genişlik uzaklığı
 * belirler ve görünen yükseklik büyür: tepe ortaya (fy 0.08, ≈ %46) yaklaşır
 * ki üstte boş gökyüzü, kule alt yarıya sıkışmış kalmasın.
 */
export const PLAY_FY_LAND = -0.21;
export const PLAY_FY_PORTRAIT = 0.08;

export function playTargetFy(aspect) {
    const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    if (a >= 1) return PLAY_FY_LAND;
    const k = Math.min(1, Math.max(0, (a - 0.45) / 0.55));
    return PLAY_FY_PORTRAIT + (PLAY_FY_LAND - PLAY_FY_PORTRAIT) * k;
}

export function playPitch(aspect, vfovDeg, el) {
    const tv = Math.tan(((vfovDeg * Math.PI) / 180) / 2);
    return el + Math.atan(playTargetFy(aspect) * tv);
}

/**
 * Hareketli katın dikdörtgeni (mm: x0,x1,z0,z1) noktayı (mm) margin payıyla
 * örtüyor mu? Kuledeki karakter kat ayaklarına gelince üstünden atlar.
 */
export function rectCoversPoint(r, xMm, zMm, marginMm = 0) {
    return r.x0 - marginMm <= xMm && xMm <= r.x1 + marginMm && r.z0 - marginMm <= zMm && zMm <= r.z1 + marginMm;
}

/**
 * Oyun sonu "geri çekil": kulenin tamamı (zeminden tepeye) ve biraz şehir
 * görünsün. Uzaklık bir üst sınırla (kamera uzak düzlemi ve sis).
 */
export const REVEAL_MAX_DIST = 240;

export function revealDistance(topY, aspect, vfovDeg) {
    const h = topY + BASE_H + 6;
    const d = fitDistance(aspect, vfovDeg, PLAY_NEED_W, h * 1.15);
    return Math.min(REVEAL_MAX_DIST, Math.max(MIN_DIST, d));
}

/** Kamera yönü (birim vektör, hedeften kameraya): azimut/yükseliş radyan. */
export function cameraDir(az, el, out = { x: 0, y: 0, z: 0 }) {
    const c = Math.cos(el);
    out.x = Math.sin(az) * c;
    out.y = Math.sin(el);
    out.z = Math.cos(az) * c;
    return out;
}

/**
 * Düşen parçanın başlangıç hızı: kesildiği eksende dışa doğru (kesik
 * tarafın işareti), hafif yukarı. Sonuç metre/sn.
 */
export function debrisKick(axis, side, out = { vx: 0, vy: 0, vz: 0, wx: 0, wz: 0 }) {
    const s = side >= 0 ? 1 : -1;
    out.vx = axis === 'x' ? 1.4 * s : 0;
    out.vz = axis === 'z' ? 1.4 * s : 0;
    out.vy = 0.6;
    // Kenarın üstünden devrilir: eksene dik yatay eksen etrafında döner.
    out.wx = axis === 'z' ? 2.6 * s : 0;
    out.wz = axis === 'x' ? -2.6 * s : 0;
    return out;
}
