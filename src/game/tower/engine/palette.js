/*
 * Kule renkleri ve yüksekliğe göre gökyüzü (saf mantık, three bağımsız;
 * node'da test edilir).
 *
 * Renkler sRGB 0..1 üçlüleri: kule/şehir/gökyüzü shader'ları renk
 * dönüşümü yapmadan doğrudan ekran uzayında çalışır (stilize görünüm, tek
 * bir kaynaktan öngörülebilir tonlar). three'nin kendi malzemeleri (avatar)
 * kendi renk yönetimiyle çizilir.
 *
 * Buradaki "rastgelelik" yalnızca görsel: sunucunun verdiği seed paletin
 * başlangıç tonunu seçer, oyunun sonucunu etkilemez.
 */
import { clamp, hash32, lerp, smoothstep } from '../../runner/engine/mathUtils.js';

export function hexToRgb(hex, out = [0, 0, 0]) {
    const v = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
    out[0] = ((v >> 16) & 255) / 255;
    out[1] = ((v >> 8) & 255) / 255;
    out[2] = (v & 255) / 255;
    return out;
}

/** HSL (0..1) → sRGB üçlüsü. */
export function hslToRgb(h, s, l, out = [0, 0, 0]) {
    const hh = ((h % 1) + 1) % 1;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
        let x = t;
        if (x < 0) x += 1;
        if (x > 1) x -= 1;
        if (x < 1 / 6) return p + (q - p) * 6 * x;
        if (x < 1 / 2) return q;
        if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
        return p;
    };
    out[0] = f(hh + 1 / 3);
    out[1] = f(hh);
    out[2] = f(hh - 1 / 3);
    return out;
}

/** Paletin başlangıç tonu (0..1): seed'den; seed yoksa sitenin coral'ına yakın. */
export function paletteHue(seed) {
    if (!Number.isFinite(seed)) return 0.97;
    return (hash32(Math.floor(seed) >>> 0) % 1000) / 1000;
}

// Ton kat başına bu kadar kayar: ~48 katta bir tam tur (gökkuşağı merdiveni).
export const HUE_STEP = 0.021;
// Bu kattan sonra renkler tam "neon" (doygun, biraz koyu).
export const NEON_FLOOR = 150;

/**
 * Kat k'nin rengi: pastel (açık, az doygun) → neon (doygun) degrade, ton her
 * katta biraz kayar. Taban (k = 0) koyu cam lobi.
 */
export function floorColor(k, hue0, out = [0, 0, 0]) {
    if (k <= 0) return hexToRgb(0x2a2f55, out);
    const t = smoothstep(0, NEON_FLOOR, k);
    const s = lerp(0.42, 0.92, t);
    const l = lerp(0.74, 0.57, t);
    return hslToRgb(hue0 + k * HUE_STEP, s, l, out);
}

/*
 * Yükseklik anahtarları (kat cinsinden). Aralarda yumuşak geçiş:
 * gün batımı → alacakaranlık → gece → yıldızlar → (150+) kuzey ışıkları.
 *  top/mid/horizon: kubbe degradesi; fog: sis ve şehir pusu;
 *  sun: güneş diski görünürlüğü; stars, aurora: 0..1;
 *  night: pencere ışıkları ve sokak neonları (0 gündüz → 1 gece);
 *  sunCol/skyCol/groundCol: kule ışığı (yönlü + yarıküre).
 */
export const SKY_KEYS = [
    {
        at: 0,
        top: 0x2b1d63, mid: 0x8a3f8c, horizon: 0xff9d6c, fog: 0xd98184,
        sun: 1, stars: 0, aurora: 0, night: 0.28,
        sunCol: 0xffc48a, skyCol: 0x8d77c9, groundCol: 0x6a3a52,
    },
    {
        at: 32,
        top: 0x1b1650, mid: 0x55307f, horizon: 0xf06d7e, fog: 0xb35e80,
        sun: 0.55, stars: 0.12, aurora: 0, night: 0.5,
        sunCol: 0xff9e86, skyCol: 0x6f63b8, groundCol: 0x4a2d50,
    },
    {
        at: 72,
        top: 0x0a0d2e, mid: 0x1a1d55, horizon: 0x47307a, fog: 0x34295f,
        sun: 0, stars: 0.75, aurora: 0, night: 0.9,
        sunCol: 0x9fb4ff, skyCol: 0x4b4f9a, groundCol: 0x241c40,
    },
    {
        at: 120,
        top: 0x04061c, mid: 0x0c1238, horizon: 0x222a62, fog: 0x161b44,
        sun: 0, stars: 1, aurora: 0, night: 1,
        sunCol: 0x8ea6ff, skyCol: 0x3d4690, groundCol: 0x1a1736,
    },
    {
        at: 140,
        top: 0x03051a, mid: 0x0b1437, horizon: 0x1c2e5e, fog: 0x131f42,
        sun: 0, stars: 1, aurora: 0, night: 1,
        sunCol: 0x8fb8ff, skyCol: 0x3a5294, groundCol: 0x161d38,
    },
    {
        at: 155,
        top: 0x030518, mid: 0x0a1636, horizon: 0x16385a, fog: 0x10243f,
        sun: 0, stars: 1, aurora: 0.5, night: 1,
        sunCol: 0x93e0ff, skyCol: 0x346a98, groundCol: 0x13253a,
    },
    {
        at: 175,
        top: 0x020414, mid: 0x061a33, horizon: 0x0f4250, fog: 0x0b2a38,
        sun: 0, stars: 1, aurora: 1, night: 1,
        sunCol: 0x9cffd8, skyCol: 0x2f7f8f, groundCol: 0x10282f,
    },
];

const COLOR_KEYS = ['top', 'mid', 'horizon', 'fog', 'sunCol', 'skyCol', 'groundCol'];
const SCALAR_KEYS = ['sun', 'stars', 'aurora', 'night'];

// Hex'ler bir kez üçlüye çevrilir (her karede parse yok).
const RGB_KEYS = SKY_KEYS.map((k) => {
    const o = { at: k.at };
    for (const c of COLOR_KEYS) o[c] = hexToRgb(k[c]);
    for (const s of SCALAR_KEYS) o[s] = k[s];
    return o;
});

/** skyAt'in yazdığı nesne (bir kez oluşturulup her karede yeniden kullanılır). */
export function createSkyState() {
    const o = {};
    for (const c of COLOR_KEYS) o[c] = [0, 0, 0];
    for (const s of SCALAR_KEYS) o[s] = 0;
    return o;
}

/** Kat cinsinden yükseklikte gökyüzü durumu; `out`'a yazar (allocation yok). */
export function skyAt(alt, out) {
    const a = Number.isFinite(alt) ? Math.max(0, alt) : 0;
    let i = 0;
    while (i < RGB_KEYS.length - 2 && a >= RGB_KEYS[i + 1].at) i++;
    const k0 = RGB_KEYS[i];
    const k1 = RGB_KEYS[i + 1];
    const t = smoothstep(0, 1, clamp((a - k0.at) / (k1.at - k0.at), 0, 1));
    for (let c = 0; c < COLOR_KEYS.length; c++) {
        const key = COLOR_KEYS[c];
        const o = out[key];
        const x = k0[key];
        const y = k1[key];
        o[0] = lerp(x[0], y[0], t);
        o[1] = lerp(x[1], y[1], t);
        o[2] = lerp(x[2], y[2], t);
    }
    for (let s = 0; s < SCALAR_KEYS.length; s++) {
        const key = SCALAR_KEYS[s];
        out[key] = lerp(k0[key], k1[key], t);
    }
    return out;
}
