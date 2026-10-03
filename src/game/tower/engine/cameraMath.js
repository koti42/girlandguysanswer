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
 * Oyun kadrajı. Taban ölçü: dikeyde genişlik, yatayda yükseklik (fitDistance).
 * Üstüne iki şart (playDistance bunları sağlayana kadar uzaklaşır):
 *
 *  1. Hareketli kat bütün salınımı boyunca (±R = 4,5 m ve kendi yarı boyu,
 *     kamera azimut salınımının iki ucunda da) TAMAMEN ekranda kalır
 *     (|NDC| ≤ SWEEP_NDC_FIT). Eskiden dikey ekranda dönüş noktasında katın
 *     üçte biri ekran dışındaydı: kat ekranın kenarından "bir anda" kulenin
 *     yanında beliriyordu.
 *  2. Kameraya en yakın noktası MIN_SLAB_CAM_DIST'ten yakına gelmez.
 *     45° azimutta salınımın yarısı derinliktir: kat +R ucunda kameraya
 *     doğru gelir. Yatayda eski uzaklıkta (12,4 m) 7,1 m'ye kadar yaklaşıp
 *     ekranda iki katına büyüyor, oyuncuya "üstüme geliyor" hissi veriyordu.
 */
export const PLAY_NEED_W = 9.6;
export const PLAY_NEED_H = 10;
export const MIN_DIST = 11;
export const MAX_DIST = 44;
export const SWEEP_NDC_FIT = 0.97;
export const MIN_SLAB_CAM_DIST = 9;

// Oyun kamerası: 45° azimut, alçak bakış (gökyüzü görünsün). game.js de kullanır.
export const PLAY_AZ = Math.PI / 4;
export const PLAY_EL = 0.22;
// Dikey ekranda azimut salınımı daha dar.
export const SWAY_LAND = 0.17;
export const SWAY_PORTRAIT = 0.08;

// Hareketli katın en büyük hâli (sim: MAX_W = 3000 mm, R = 4500 mm), metre.
const SLAB_HALF = 1.5;
const SLAB_R = 4.5;

export function playSway(aspect) {
    return Number.isFinite(aspect) && aspect > 0 && aspect < 1 ? SWAY_PORTRAIT : SWAY_LAND;
}

/**
 * Kameranın bakış noktasının hedefe (kule tepesi) göre yüksekliği: pitch
 * açısıyla bakılınca hedef ekranda playTargetFy'de durur.
 */
export function playLookLift(dist, el, pitch) {
    return dist * (Math.sin(el) - Math.cos(el) * Math.tan(pitch));
}

/**
 * Noktanın (p) ekran koordinatı (NDC, -1..1) ve kameraya uzaklığı; kamera
 * cam konumunda look'a bakar, yukarı +Y (three'nin lookAt'iyle aynı taban).
 * Kameranın arkasındaki noktada ndc Infinity olur.
 */
export function projectNdc(p, cam, look, aspect, vfovDeg, out = { x: 0, y: 0, dist: 0 }) {
    // z: hedeften kameraya; x = up × z; y = z × x
    let zx = cam.x - look.x;
    let zy = cam.y - look.y;
    let zz = cam.z - look.z;
    const zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl;
    zy /= zl;
    zz /= zl;
    let xx = zz;
    let xz = -zx;
    const xl = Math.hypot(xx, xz) || 1;
    xx /= xl;
    xz /= xl;
    const yx = zy * xz;
    const yy = zz * xx - zx * xz;
    const yz = -zy * xx;
    const dx = p.x - cam.x;
    const dy = p.y - cam.y;
    const dz = p.z - cam.z;
    const cx = dx * xx + dz * xz;
    const cy = dx * yx + dy * yy + dz * yz;
    const depth = -(dx * zx + dy * zy + dz * zz);
    const tv = Math.tan(((vfovDeg * Math.PI) / 180) / 2);
    if (depth <= 1e-6) {
        out.x = Infinity;
        out.y = Infinity;
    } else {
        out.x = cx / (depth * tv * aspect);
        out.y = cy / (depth * tv);
    }
    out.dist = Math.hypot(dx, dy, dz);
    return out;
}

/**
 * Oyun kamerasının konumu ve bakış noktası (hedef = kule tepesi,
 * focus.y = üst katın üstü + yarım kat). game.js her karede bunu kullanır.
 */
export function playCameraPose(focus, dist, az, el, pitch, out = { cam: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 } }) {
    const c = Math.cos(el);
    out.cam.x = focus.x + Math.sin(az) * c * dist;
    out.cam.y = focus.y + Math.sin(el) * dist;
    out.cam.z = focus.z + Math.cos(az) * c * dist;
    out.look.x = focus.x;
    out.look.y = focus.y + playLookLift(dist, el, pitch);
    out.look.z = focus.z;
    return out;
}

/**
 * Hareketli katın salınımı boyunca ekrandaki en uç konumu ve kameraya en
 * yakın mesafesi: iki eksen (x, z), ofset -R..+R, azimut salınımının iki
 * ucu ve ortası, katın 8 köşesi. Hedef kule tepesi (yarım kat yukarıda):
 * hareketli kat hedefe göre y ∈ [-H/2, H/2]. Taban ölçüsünde (3 m) kat en
 * büyük hâlinde; kesilmiş kat bunun içinde kalır.
 */
const sweepPose = { cam: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 } };
const sweepFocus = { x: 0, y: FLOOR_H / 2, z: 0 };
const sweepPt = { x: 0, y: 0, z: 0 };
const sweepNdc = { x: 0, y: 0, dist: 0 };

export function slabSweepStats(aspect, vfovDeg, dist, el = PLAY_EL) {
    const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    const pitch = playPitch(a, vfovDeg, el);
    const sway = playSway(a);
    let maxX = 0;
    let maxY = 0;
    let minDist = Infinity;
    const STEPS = 18;
    for (let si = -1; si <= 1; si++) {
        playCameraPose(sweepFocus, dist, PLAY_AZ + sway * si, el, pitch, sweepPose);
        for (let ax = 0; ax < 2; ax++) {
            for (let i = 0; i <= STEPS; i++) {
                const off = -SLAB_R + (2 * SLAB_R * i) / STEPS;
                const ox = ax === 0 ? off : 0;
                const oz = ax === 0 ? 0 : off;
                for (let c = 0; c < 8; c++) {
                    sweepPt.x = ox + (c & 1 ? SLAB_HALF : -SLAB_HALF);
                    sweepPt.y = c & 2 ? FLOOR_H : 0;
                    sweepPt.z = oz + (c & 4 ? SLAB_HALF : -SLAB_HALF);
                    projectNdc(sweepPt, sweepPose.cam, sweepPose.look, a, vfovDeg, sweepNdc);
                    if (Math.abs(sweepNdc.x) > maxX) maxX = Math.abs(sweepNdc.x);
                    if (Math.abs(sweepNdc.y) > maxY) maxY = Math.abs(sweepNdc.y);
                    if (sweepNdc.dist < minDist) minDist = sweepNdc.dist;
                }
            }
        }
    }
    return { maxNdcX: maxX, maxNdcY: maxY, minDist };
}

function sweepOk(aspect, vfovDeg, dist) {
    const s = slabSweepStats(aspect, vfovDeg, dist);
    return s.maxNdcX <= SWEEP_NDC_FIT && s.maxNdcY <= SWEEP_NDC_FIT && s.minDist >= MIN_SLAB_CAM_DIST;
}

// Son hesap (her karede çağrılır; yalnızca en-boy oranı değişince hesaplanır).
let lastKey = '';
let lastDist = 0;

export function playDistance(aspect, vfovDeg) {
    const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    const key = `${a.toFixed(4)}|${vfovDeg}`;
    if (key === lastKey) return lastDist;
    let lo = Math.min(MAX_DIST, Math.max(MIN_DIST, fitDistance(a, vfovDeg, PLAY_NEED_W, PLAY_NEED_H)));
    let d = lo;
    if (!sweepOk(a, vfovDeg, lo)) {
        // Uzaklaştıkça kat ekranda küçülür ve kameradan uzaklaşır (tekdüze): ikili arama.
        let hi = MAX_DIST;
        if (!sweepOk(a, vfovDeg, hi)) {
            d = hi; // çok dar ekran: en uzaktan, en iyi çaba
        } else {
            for (let i = 0; i < 24; i++) {
                const mid = (lo + hi) / 2;
                if (sweepOk(a, vfovDeg, mid)) hi = mid;
                else lo = mid;
            }
            d = hi;
        }
    }
    lastKey = key;
    lastDist = d;
    return d;
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
