/*
 * Etiket levhaları: her simgenin önünde küçük ahşap levha (durak adı).
 * Tüm etiketler tek bir doku atlasında; levhalar tek geometri (1 çizim).
 * Canvas yoksa (node testleri) düz levha rengiyle devam edilir.
 */
import * as THREE from 'three';

const FONT = "700 40px Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const ROW_W = 512;
const ROW_H = 144;
const TILT = 0.3;

export function canMakeCanvas() {
    return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/** Yazı tipinin yüklenmesini kısa süre bekler (gelmezse sistem fontu). */
export async function waitForLabelFont(timeoutMs = 900) {
    try {
        if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return;
        await Promise.race([document.fonts.load('700 40px Inter'), new Promise((r) => setTimeout(r, timeoutMs))]);
    } catch {
        // Font yüklenemese de sahne açılmalı.
    }
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

/** Satır başına bir etiket; döner: THREE.CanvasTexture | null. */
export function createLabelAtlas(labels) {
    if (!canMakeCanvas() || labels.length === 0) return null;
    const c = document.createElement('canvas');
    c.width = ROW_W;
    c.height = ROW_H * labels.length;
    const g = c.getContext('2d');
    if (!g) return null;
    labels.forEach((text, i) => {
        const y0 = i * ROW_H;
        const grad = g.createLinearGradient(0, y0, 0, y0 + ROW_H);
        grad.addColorStop(0, '#fff6e0');
        grad.addColorStop(1, '#f3dcae');
        roundRect(g, 8, y0 + 8, ROW_W - 16, ROW_H - 16, 26);
        g.fillStyle = grad;
        g.fill();
        g.lineWidth = 8;
        g.strokeStyle = '#8a5a36';
        g.stroke();
        g.font = FONT;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#4a2f1d';
        let size = 40;
        while (size > 20 && g.measureText(text).width > ROW_W - 80) {
            size -= 2;
            g.font = FONT.replace('40px', `${size}px`);
        }
        g.fillText(text, ROW_W / 2, y0 + ROW_H / 2 + 3);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}

/**
 * Levha yüzeyleri: plaques [{ index, x, y, z, ry, w, h }] -> tek BufferGeometry
 * (ada yerel uzayında). Atlas satırı = plaque.index.
 */
export function buildPlaqueGeometry(plaques, rows) {
    const pos = [];
    const uv = [];
    const nor = [];
    const idx = [];
    const ca = Math.cos(TILT);
    const sa = Math.sin(TILT);
    plaques.forEach((p, k) => {
        const cy = Math.cos(p.ry);
        const sy = Math.sin(p.ry);
        const hw = p.w / 2;
        const hh = p.h / 2;
        // yerel: sağ (1,0,0), yukarı (0, ca, -sa) (geriye yatık)
        const corners = [
            [-hw, -hh],
            [hw, -hh],
            [hw, hh],
            [-hw, hh],
        ];
        const v0 = 1 - (p.index + 1) / rows;
        const v1 = 1 - p.index / rows;
        const uvs = [[0, v0], [1, v0], [1, v1], [0, v1]];
        for (let i = 0; i < 4; i++) {
            const lx = corners[i][0];
            const ly = corners[i][1] * ca;
            const lz = -corners[i][1] * sa;
            pos.push(p.x + lx * cy + lz * sy, p.y + ly, p.z - lx * sy + lz * cy);
            uv.push(uvs[i][0], uvs[i][1]);
            nor.push(sa * sy, ca, sa * cy);
        }
        // normal: (0, sa?, ...) yerelde (0, sa, ca) -> dünyaya
        const o = k * 4;
        idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
}
