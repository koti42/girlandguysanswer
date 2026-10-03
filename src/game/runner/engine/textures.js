/*
 * Prosedürel canvas dokuları (dosya/asset yok).
 *
 * Hepsi kurulumda bir kez çizilir; kapı panelleri hariç (onlar her kapıda
 * aynı canvas'a yeniden çizilir, yeni doku oluşturulmaz). Metinler yalnızca
 * fillText ile çizilir.
 */
import * as THREE from 'three';
import { seededRandom } from './mathUtils.js';
import { fitText } from './textLayout.js';

export const FONT_STACK = "Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

function toTexture(canvas, { repeat = false, anisotropy = 1, mipmaps = true } = {}) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    if (repeat) {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
    }
    if (!mipmaps) {
        t.generateMipmaps = false;
        t.minFilter = THREE.LinearFilter;
    }
    return t;
}

/** Fontun yüklenmesini kısa süre bekle; gelmezse sistem fontuyla devam. */
export async function waitForFont(timeoutMs = 1500) {
    try {
        if (!document.fonts || !document.fonts.load) return;
        await Promise.race([
            document.fonts.load(`700 48px Inter`),
            new Promise((r) => setTimeout(r, timeoutMs)),
        ]);
    } catch {
        // Font yüklenemese de oyun açılmalı.
    }
}

/*
 * Bina cephesi: 4x4 pencere hücresi, tekrar eden doku.
 * map: duvar açık gri (köşe rengiyle boyanır), pencere koyu cam.
 * emissive: yanan pencereler sıcak sarı / pembe / camgöbeği.
 * (0.02, 0.02) noktası pencere dışı duvar payıdır (FIXED_UV).
 */
export function createWindowTextures(anisotropy) {
    const S = 256;
    const cells = 4;
    const cell = S / cells;
    const map = makeCanvas(S, S);
    const emi = makeCanvas(S, S);
    const m = map.getContext('2d');
    const e = emi.getContext('2d');
    const rnd = seededRandom(7);
    m.fillStyle = '#d9d4e6';
    m.fillRect(0, 0, S, S);
    e.fillStyle = '#000';
    e.fillRect(0, 0, S, S);
    // Kat çizgisi (silme)
    for (let r = 0; r < cells; r++) {
        m.fillStyle = '#bfb8d0';
        m.fillRect(0, r * cell + cell - 6, S, 4);
    }
    const lit = ['#ffcf7d', '#ffd99a', '#ffb86b', '#ff9ad5', '#8fe3ff', '#ffe6b0'];
    for (let r = 0; r < cells; r++) {
        for (let c = 0; c < cells; c++) {
            const x = c * cell + 14;
            const y = r * cell + 12;
            const w = cell - 28;
            const h = cell - 26;
            m.fillStyle = '#1b1830';
            m.fillRect(x - 3, y - 3, w + 6, h + 6);
            m.fillStyle = '#2b2748';
            m.fillRect(x, y, w, h);
            if (rnd() < 0.5) {
                const col = lit[Math.floor(rnd() * lit.length)];
                const g = e.createLinearGradient(0, y, 0, y + h);
                g.addColorStop(0, col);
                g.addColorStop(1, '#6b4a2a');
                e.fillStyle = g;
                e.fillRect(x, y, w, h);
                // Perde/siluet: bazı pencerelerde yarım perde
                if (rnd() < 0.4) {
                    e.fillStyle = 'rgba(0,0,0,0.55)';
                    e.fillRect(x, y, w * (0.3 + rnd() * 0.4), h);
                }
                m.fillStyle = '#5a5070';
                m.fillRect(x, y, w, h);
            }
            // Pencere ortası kayıt
            m.fillStyle = '#1b1830';
            m.fillRect(x + w / 2 - 1, y, 2, h);
            e.fillStyle = '#000';
            e.fillRect(x + w / 2 - 1, y, 2, h);
        }
    }
    return {
        map: toTexture(map, { repeat: true, anisotropy }),
        emissive: toTexture(emi, { repeat: true, anisotropy }),
    };
}

/*
 * Yol + kaldırım dokusu: genişlik 17 m (x -8.5..8.5), boy 20 m (bir lamba aralığı).
 * Canvas'ın üstü uzak uç (flipY). Lamba ışık havuzları: sol z≡0, sağ z≡10 (mod 20).
 */
export const ROAD_TILE_M = 20;
export const ROAD_HALF_W = 8.5;

export function createRoadTexture(anisotropy) {
    const W = 512;
    const H = 1024;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const pxPerM = W / (ROAD_HALF_W * 2);
    const X = (m) => (m + ROAD_HALF_W) * pxPerM;
    const Z = (m) => H - (m / ROAD_TILE_M) * H; // z (0..20 m) -> canvas y
    // Kaldırım
    g.fillStyle = '#4a3f66';
    g.fillRect(0, 0, W, H);
    // Kaldırım taşları
    g.strokeStyle = 'rgba(20,10,40,0.45)';
    g.lineWidth = 2;
    for (let z = 0; z < ROAD_TILE_M; z += 1.25) {
        g.beginPath();
        g.moveTo(0, Z(z));
        g.lineTo(X(-4.4), Z(z));
        g.moveTo(X(4.4), Z(z));
        g.lineTo(W, Z(z));
        g.stroke();
    }
    for (let x = 4.4; x < ROAD_HALF_W; x += 1.25) {
        g.beginPath();
        g.moveTo(X(x), 0);
        g.lineTo(X(x), H);
        g.moveTo(X(-x), 0);
        g.lineTo(X(-x), H);
        g.stroke();
    }
    // Asfalt
    g.fillStyle = '#262341';
    g.fillRect(X(-4.3), 0, X(4.3) - X(-4.3), H);
    // Asfalt dokusu: hafif benekler
    const rnd = seededRandom(11);
    for (let i = 0; i < 2600; i++) {
        const x = X(-4.3) + rnd() * (X(4.3) - X(-4.3));
        const y = rnd() * H;
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)';
        g.fillRect(x, y, 2, 2);
    }
    // Lamba ışık havuzları (sol: z=0 / 20, sağ: z=10)
    const pool = (xm, zm) => {
        const cx = X(xm);
        const cy = Z(zm);
        const r = 6.5 * pxPerM;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, 'rgba(255,190,120,0.42)');
        gr.addColorStop(0.5, 'rgba(255,150,110,0.16)');
        gr.addColorStop(1, 'rgba(255,140,110,0)');
        g.fillStyle = gr;
        g.fillRect(cx - r, cy - r, r * 2, r * 2);
    };
    pool(-3.6, 0);
    pool(-3.6, 20);
    pool(3.6, 10);
    // Kenar çizgileri (coral)
    g.fillStyle = '#ff6b6b';
    g.fillRect(X(-4.05), 0, 0.14 * pxPerM, H);
    g.fillRect(X(3.91), 0, 0.14 * pxPerM, H);
    // Şerit çizgileri: kesikli, altın
    g.fillStyle = '#f3d27a';
    for (const lx of [-1.25, 1.25]) {
        for (let z = 1; z < ROAD_TILE_M; z += 5) {
            g.fillRect(X(lx) - 0.07 * pxPerM, Z(z + 2.6), 0.14 * pxPerM, (2.6 / ROAD_TILE_M) * H);
        }
    }
    // Bordür gölgesi
    const sh = g.createLinearGradient(X(4.3), 0, X(5.3), 0);
    sh.addColorStop(0, 'rgba(0,0,0,0.35)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.fillRect(X(4.3), 0, pxPerM, H);
    const sh2 = g.createLinearGradient(X(-4.3), 0, X(-5.3), 0);
    sh2.addColorStop(0, 'rgba(0,0,0,0.35)');
    sh2.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh2;
    g.fillRect(X(-5.3), 0, pxPerM, H);
    return toTexture(c, { repeat: true, anisotropy });
}

/** Uzak silüet katmanı: şeffaf zemin üstünde bina siluetleri + küçük pencereler. */
export function createSkylineTexture(seed, color, windowAlpha) {
    const W = 1024;
    const H = 256;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const rnd = seededRandom(seed);
    g.fillStyle = color;
    let x = 0;
    while (x < W) {
        const w = 18 + rnd() * 46;
        const h = 40 + rnd() * (H - 70) * (rnd() < 0.25 ? 1 : 0.6);
        g.fillRect(x, H - h, w, h);
        if (rnd() < 0.3) g.fillRect(x + w * 0.4, H - h - 14, 3, 14); // anten
        // pencereler
        g.fillStyle = `rgba(255,200,140,${windowAlpha})`;
        for (let wy = H - h + 8; wy < H - 6; wy += 9) {
            for (let wx = x + 4; wx < x + w - 4; wx += 7) {
                if (rnd() < 0.22) g.fillRect(wx, wy, 3, 4);
            }
        }
        g.fillStyle = color;
        x += w + (rnd() < 0.3 ? rnd() * 6 : 0);
    }
    const t = toTexture(c, { repeat: true });
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
}

/** Retro gün batımı güneşi: degrade disk, alt yarıda yatay kesikler. */
export function createSunTexture() {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    const glow = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S / 2);
    glow.addColorStop(0, 'rgba(255,120,120,0.45)');
    glow.addColorStop(1, 'rgba(255,80,140,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.3, 0, Math.PI * 2);
    g.clip();
    const gr = g.createLinearGradient(0, S * 0.2, 0, S * 0.8);
    gr.addColorStop(0, '#ffe08a');
    gr.addColorStop(0.5, '#ff8a6b');
    gr.addColorStop(1, '#ff3d8b');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) {
        const y = S * 0.52 + i * i * 1.6 + i * 6;
        g.fillRect(0, y, S, 2 + i * 0.9);
    }
    g.restore();
    return toTexture(c);
}

/** Yumuşak yuvarlak parıltı (hale, partikül, yıldız). */
export function createGlowTexture() {
    const S = 64;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    return toTexture(c);
}

/** Jeton yüzü: altın disk, kabartma "?" ve kenar halkası. Kenar rengi (0.02,0.5) civarı. */
export function createCoinTexture() {
    const S = 128;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#c98a1c';
    g.fillRect(0, 0, S, S);
    const gr = g.createRadialGradient(S * 0.4, S * 0.35, 4, S / 2, S / 2, S / 2);
    gr.addColorStop(0, '#fff3b0');
    gr.addColorStop(0.55, '#ffd34d');
    gr.addColorStop(1, '#d79a1e');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#b8740f';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 14, 0, Math.PI * 2);
    g.stroke();
    // Silindir kapağının UV'si yüzü 90° döndürüyor (bkz. entities jeton geometrisi);
    // "?" ters yönde çizilir ki ekranda dik dursun.
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(-Math.PI / 2);
    g.font = `700 70px ${FONT_STACK}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#a8650c';
    g.fillText('?', 3, 6);
    g.fillStyle = '#fff6c8';
    g.fillText('?', 0, 3);
    g.restore();
    return toTexture(c);
}

/** Yüksek engel tabelası: koyu panel, neon çerçeve, büyük "?" ve aşağı oklar. */
export function createSignTexture() {
    const W = 512;
    const H = 256;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#140b2e';
    g.fillRect(0, 0, W, H);
    const neon = (color, blur, width, fn) => {
        g.save();
        g.shadowColor = color;
        g.shadowBlur = blur;
        g.strokeStyle = color;
        g.fillStyle = color;
        g.lineWidth = width;
        fn();
        g.restore();
    };
    neon('#ff4fa3', 18, 8, () => g.strokeRect(14, 14, W - 28, H - 28));
    neon('#ffd1ea', 6, 3, () => g.strokeRect(14, 14, W - 28, H - 28));
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    neon('#38bdf8', 22, 4, () => {
        g.font = `700 170px ${FONT_STACK}`;
        g.fillText('?', W / 2, H / 2 + 10);
    });
    g.fillStyle = '#e0f7ff';
    g.font = `700 150px ${FONT_STACK}`;
    g.fillText('?', W / 2, H / 2 + 10);
    // Aşağı oklar: "altından kay" ipucu
    neon('#ffd34d', 14, 10, () => {
        for (const x of [100, W - 100]) {
            g.beginPath();
            g.moveTo(x - 40, 90);
            g.lineTo(x, 140);
            g.lineTo(x + 40, 90);
            g.moveTo(x - 40, 130);
            g.lineTo(x, 180);
            g.lineTo(x + 40, 130);
            g.stroke();
        }
    });
    return toTexture(c);
}

/*
 * Kapı paneli: büyük harf rozeti + şık metni. Aynı canvas her kapıda yeniden
 * çizilir (texture.needsUpdate). Uzun metin satır kaydırılır ve küçültülür.
 */
export const GATE_PANEL_W = 512;
export const GATE_PANEL_H = 320;

export function createGatePanel() {
    const canvas = makeCanvas(GATE_PANEL_W, GATE_PANEL_H);
    const texture = toTexture(canvas, { mipmaps: true });
    texture.anisotropy = 4;
    return { canvas, texture };
}

const LANE_HINTS = ['◀ SOL', '▲ ORTA', 'SAĞ ▶'];
// Şık metni alanı: rozet satırının altı (üst) ve çerçeve payı (alt); satır aralığı.
const GATE_TEXT_TOP = 108;
const GATE_TEXT_BOTTOM = 22;
const GATE_TEXT_LINE_HEIGHT = 1.12;

export function drawGatePanel(panel, { letter, text, color, lane }) {
    const g = panel.canvas.getContext('2d');
    const W = GATE_PANEL_W;
    const H = GATE_PANEL_H;
    g.clearRect(0, 0, W, H);
    // Zemin: koyu cam + renkli çerçeve
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1a1240');
    bg.addColorStop(1, '#0c0a24');
    g.fillStyle = bg;
    roundRect(g, 6, 6, W - 12, H - 12, 28);
    g.fill();
    g.save();
    g.shadowColor = color;
    g.shadowBlur = 20;
    g.strokeStyle = color;
    g.lineWidth = 10;
    roundRect(g, 10, 10, W - 20, H - 20, 24);
    g.stroke();
    g.restore();
    // Harf rozeti + şerit ipucu (üst satır)
    g.fillStyle = color;
    g.beginPath();
    g.arc(64, 62, 38, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 48px ${FONT_STACK}`;
    g.fillText(letter, 64, 65);
    g.textAlign = 'left';
    g.font = `700 32px ${FONT_STACK}`;
    g.fillStyle = 'rgba(255,255,255,0.72)';
    g.fillText(LANE_HINTS[lane] || '', 116, 64);
    // Şık metni: büyük puntodan başlayıp 3 satıra sığana kadar küçülür.
    const maxWidth = W - 60;
    const measure = (s, size) => {
        g.font = `700 ${size}px ${FONT_STACK}`;
        return g.measureText(s).width;
    };
    const areaTop = GATE_TEXT_TOP;
    const areaH = H - areaTop - GATE_TEXT_BOTTOM;
    const fit = fitText(text, {
        maxWidth,
        maxLines: 3,
        maxSize: 80,
        minSize: 30,
        maxHeight: areaH,
        lineHeight: GATE_TEXT_LINE_HEIGHT,
        measure,
    });
    g.font = `700 ${fit.size}px ${FONT_STACK}`;
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    const lineH = fit.size * GATE_TEXT_LINE_HEIGHT;
    let y = areaTop + (areaH - lineH * fit.lines.length) / 2 + lineH / 2;
    for (const line of fit.lines) {
        g.fillText(line, W / 2, y);
        y += lineH;
    }
    panel.texture.needsUpdate = true;
}

/** Başlangıç kemeri pankartı. */
export function createBannerTexture() {
    const W = 1024;
    const H = 192;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, '#ff6b6b');
    bg.addColorStop(0.5, '#a855f7');
    bg.addColorStop(1, '#e2b94c');
    g.fillStyle = bg;
    roundRect(g, 0, 0, W, H, 36);
    g.fill();
    g.fillStyle = 'rgba(12,10,36,0.82)';
    roundRect(g, 12, 12, W - 24, H - 24, 28);
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // Yazı pankarta sığana kadar küçült.
    let size = 92;
    g.font = `700 ${size}px ${FONT_STACK}`;
    while (size > 40 && g.measureText('HERKESLER KOŞUYOR').width > W - 110) {
        size -= 4;
        g.font = `700 ${size}px ${FONT_STACK}`;
    }
    g.save();
    g.shadowColor = '#ff6b6b';
    g.shadowBlur = 24;
    g.fillStyle = '#fff';
    g.fillText('HERKESLER KOŞUYOR', W / 2, H / 2 + 6);
    g.restore();
    return toTexture(c);
}

function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

/** Kapı perdesi: kenarlarda parlak, ortada saydam; yatay tarama çizgileri (y'de tekrar). */
export function createCurtainTexture() {
    const W = 64;
    const H = 128;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.18, 'rgba(255,255,255,0.25)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    gr.addColorStop(0.82, 'rgba(255,255,255,0.25)');
    gr.addColorStop(1, 'rgba(255,255,255,0.9)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let y = 0; y < H; y += 16) g.fillRect(0, y, W, 3);
    const t = toTexture(c, { repeat: true });
    t.repeat.set(1, 3);
    return t;
}
