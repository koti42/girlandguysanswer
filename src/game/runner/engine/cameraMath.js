/*
 * Kamera görüş açısı ve kadraj hesabı (saf mantık, three bağımsız).
 *
 * Dikey (portrait) ekranda 3 şerit sığsın diye yatay görüş açısı hedeflenir;
 * dikey FOV aşırı balıkgözü olmasın diye sınırlıdır.
 *
 * Kadraj (cameraFraming): yatay ekranda kamera oyuncunun arkasında alçak;
 * dikey ekranda daha yüksek ve yakın, bakış daha aşağı: karakter ekranın alt
 * dörtte birine (orta noktası ≈ %75) oturur ve biraz büyür, ufuk ≈ %35'e
 * çıkar. Böylece ekranın üstünü kaplayan HUD (~90 px) ve soru paneli
 * (~150 px) gökyüzünün önünde kalır; yaklaşan kapılar onların altında,
 * önümüzdeki yol ise eskisinin yaklaşık iki katı yükseklikte görünür.
 */
import { clamp, lerp, smoothstep } from './mathUtils.js';

export const H_FOV_DEG = 64; // hedef yatay görüş açısı
export const MIN_VFOV = 52;
export const MAX_VFOV = 80;

/** Ekran oranından dikey FOV (derece): yatayda en az H_FOV_DEG görünsün. */
export function baseVerticalFov(aspect) {
    const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
    const h = (H_FOV_DEG * Math.PI) / 180;
    const v = (2 * Math.atan(Math.tan(h / 2) / a) * 180) / Math.PI;
    return clamp(v, MIN_VFOV, MAX_VFOV);
}

// Yatay (kare ve geniş) ve tam dikey (oran ≤ 0.5) uç kadrajlar; arası doğrusal.
const LANDSCAPE = { back: 5.4, height: 3.2, lookAhead: 9, lookY: 1.25, fovOffset: 0, kick: 7 };
const PORTRAIT = { back: 5.2, height: 4.4, lookAhead: 10, lookY: 1.0, fovOffset: -8, kick: 4 };

/**
 * Ekran oranına göre kamera kadrajı (metre/derece):
 * { pk (0 yatay .. 1 çok dikey), back, height, lookAhead, lookY, fovOffset, kick }.
 * out verilirse ona yazılır (render döngüsünde allocation olmasın).
 */
export function cameraFraming(aspect, out = {}) {
    const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
    const pk = a < 1 ? clamp((1 - a) / 0.5, 0, 1) : 0;
    out.pk = pk;
    out.back = lerp(LANDSCAPE.back, PORTRAIT.back, pk);
    out.height = lerp(LANDSCAPE.height, PORTRAIT.height, pk);
    out.lookAhead = lerp(LANDSCAPE.lookAhead, PORTRAIT.lookAhead, pk);
    out.lookY = lerp(LANDSCAPE.lookY, PORTRAIT.lookY, pk);
    out.fovOffset = lerp(LANDSCAPE.fovOffset, PORTRAIT.fovOffset, pk);
    out.kick = lerp(LANDSCAPE.kick, PORTRAIT.kick, pk);
    return out;
}

/**
 * Kapı çerçevesinin kameraya yakınken saydamlığı (1 = tam görünür, 0 = gizli).
 * distM: kapı düzleminin kameranın önündeki uzaklığı (m; arkadaysa negatif).
 * Kapı oyuncunun yanından geçerken (≈ 5 m) hâlâ tam görünür; kameraya
 * doğru yaklaştıkça erir ki direkler/kemer görüşü bir anlığına kapatmasın.
 */
export const GATE_FADE_FAR_M = 5;
export const GATE_FADE_NEAR_M = 1.5;
export function gateNearFade(distM, far = GATE_FADE_FAR_M, near = GATE_FADE_NEAR_M) {
    if (!Number.isFinite(distM)) return 1;
    return smoothstep(near, far, distM);
}
