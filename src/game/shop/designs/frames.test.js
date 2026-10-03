import { describe, it, expect } from 'vitest';
import { FRAMES } from './frames.js';

/*
 * Çerçeve tasarım verisinin SPEC_V2 §F.2 sözleşmesine uyduğunu doğrular:
 * yalnız izinli tag/prop, benzersiz anahtar ve defs id'leri, çözülen url(#)
 * başvuruları, hex renkler, izinli transform biçimi, nadirlik/animasyon
 * kuralları ve fotoğraf alanına (merkez r < 70) taşan çizim olmaması.
 */

const ELEMENT_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'g', 'polygon']);
const DEF_TAGS = new Set(['linearGradient', 'radialGradient']);
const ELEMENT_PROPS = new Set([
    'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points',
    'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'opacity', 'transform',
]);
const LINEAR_PROPS = new Set(['x1', 'y1', 'x2', 'y2']);
const RADIAL_PROPS = new Set(['cx', 'cy', 'r', 'fx', 'fy']);
const ANIMS = new Set(['spin', 'pulse', 'shimmer', 'float', 'twinkle']);
const RARITIES = new Set(['common', 'rare', 'epic', 'legendary']);
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const NUMERIC = new Set(['cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'strokeWidth', 'opacity']);
const TRANSFORM_PART = /^(translate\(-?[\d.]+ -?[\d.]+\)|rotate\(-?[\d.]+ -?[\d.]+ -?[\d.]+\)|scale\(-?[\d.]+\))$/;
const F3_REQUIRED = [
    'altin-defne', 'neon-gece', 'gun-batimi', 'kiraz-cicegi', 'lale-bahcesi', 'nazar',
    'galata-gecesi', 'okyanus-dalgasi', 'yildiz-tozu', 'ates-halkasi', 'buz-kristali', 'gokkusagi',
];
const F3_RARITY = {
    'neon-gece': 'epic', 'lale-bahcesi': 'rare', nazar: 'rare', 'galata-gecesi': 'epic',
    'yildiz-tozu': 'legendary', 'ates-halkasi': 'legendary', 'buz-kristali': 'epic', gokkusagi: 'rare',
};
const F3_ANIM = { 'neon-gece': 'shimmer', 'yildiz-tozu': 'twinkle', 'ates-halkasi': 'pulse' };

const walk = (els, fn, parents = []) => {
    for (const e of els) {
        fn(e, parents);
        if (e.children) walk(e.children, fn, [...parents, e]);
    }
};

/* ---------------- geometri: düzleştirme + dönüşüm ---------------- */

const IDENTITY = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const parseTransform = (t) => {
    let m = IDENTITY;
    if (!t) return m;
    const re = /(translate|rotate|scale)\(([^)]*)\)/g;
    let x;
    while ((x = re.exec(t))) {
        const a = x[2].trim().split(/[\s,]+/).map(Number);
        if (x[1] === 'translate') m = mul(m, [1, 0, 0, 1, a[0], a[1] || 0]);
        else if (x[1] === 'scale') m = mul(m, [a[0], 0, 0, a[1] ?? a[0], 0, 0]);
        else {
            const r = (a[0] * Math.PI) / 180;
            const [cx, cy] = [a[1] || 0, a[2] || 0];
            m = mul(m, [1, 0, 0, 1, cx, cy]);
            m = mul(m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
            m = mul(m, [1, 0, 0, 1, -cx, -cy]);
        }
    }
    return m;
};
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** SVG path d -> alt yollar (her biri nokta dizisi). Eğriler örneklenir. */
function flattenPath(d) {
    const toks = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g) || [];
    const subs = [];
    let cur = null;
    let i = 0;
    let cmd = '';
    let x = 0;
    let y = 0;
    let sx = 0;
    let sy = 0;
    let lc = null;
    const num = () => Number(toks[i++]);
    const push = (px, py) => cur.push([px, py]);
    while (i < toks.length) {
        if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
        const rel = cmd === cmd.toLowerCase();
        const C = cmd.toUpperCase();
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        if (C === 'M') {
            x = ox + num();
            y = oy + num();
            sx = x;
            sy = y;
            cur = [[x, y]];
            subs.push(cur);
            cmd = rel ? 'l' : 'L';
            lc = null;
        } else if (C === 'L') {
            x = ox + num();
            y = oy + num();
            push(x, y);
            lc = null;
        } else if (C === 'H') {
            x = ox + num();
            push(x, y);
            lc = null;
        } else if (C === 'V') {
            y = oy + num();
            push(x, y);
            lc = null;
        } else if (C === 'Z') {
            x = sx;
            y = sy;
            lc = null;
        } else if (C === 'C' || C === 'S' || C === 'Q' || C === 'T') {
            let p1;
            let p2;
            if (C === 'C') {
                p1 = [ox + num(), oy + num()];
                p2 = [ox + num(), oy + num()];
            } else if (C === 'S') {
                p1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y];
                p2 = [ox + num(), oy + num()];
            } else if (C === 'Q') {
                p1 = [ox + num(), oy + num()];
                p2 = p1;
            } else {
                p1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y];
                p2 = p1;
            }
            const e = [ox + num(), oy + num()];
            const quad = C === 'Q' || C === 'T';
            for (let k = 1; k <= 12; k++) {
                const t = k / 12;
                const u = 1 - t;
                if (quad) push(u * u * x + 2 * u * t * p1[0] + t * t * e[0], u * u * y + 2 * u * t * p1[1] + t * t * e[1]);
                else
                    push(
                        u * u * u * x + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * e[0],
                        u * u * u * y + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * e[1],
                    );
            }
            lc = quad ? p1 : p2;
            [x, y] = e;
        } else if (C === 'A') {
            let rx = Math.abs(num());
            let ry = Math.abs(num());
            const phi = (num() * Math.PI) / 180;
            const fa = num();
            const fs = num();
            const ex = ox + num();
            const ey = oy + num();
            // uç nokta -> merkez parametrizasyonu (SVG eki F.6.5)
            const cp = Math.cos(phi);
            const sp = Math.sin(phi);
            const dx = (x - ex) / 2;
            const dy = (y - ey) / 2;
            const x1 = cp * dx + sp * dy;
            const y1 = -sp * dx + cp * dy;
            const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
            if (lam > 1) {
                rx *= Math.sqrt(lam);
                ry *= Math.sqrt(lam);
            }
            const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
            const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
            let co = Math.sqrt(Math.max(0, num2 / den));
            if (fa === fs) co = -co;
            const cxp = (co * rx * y1) / ry;
            const cyp = (-co * ry * x1) / rx;
            const cx = cp * cxp - sp * cyp + (x + ex) / 2;
            const cy = sp * cxp + cp * cyp + (y + ey) / 2;
            const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
            const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
            let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
            if (!fs && dt > 0) dt -= 2 * Math.PI;
            if (fs && dt < 0) dt += 2 * Math.PI;
            const n = Math.max(8, Math.ceil(Math.abs(dt) / 0.05));
            for (let k = 1; k <= n; k++) {
                const t = t1 + (dt * k) / n;
                push(cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp);
            }
            x = ex;
            y = ey;
            lc = null;
        } else {
            throw new Error(`desteklenmeyen path komutu: ${cmd}`);
        }
    }
    return subs;
}

const ellipsePts = (cx, cy, rx, ry) =>
    Array.from({ length: 72 }, (_, k) => [cx + rx * Math.cos((k * Math.PI) / 36), cy + ry * Math.sin((k * Math.PI) / 36)]);

/** Öğeyi (dolgu alt yolları, kenar genişliği) hâline getirir. */
function geometry(e) {
    const p = e.props;
    switch (e.tag) {
        case 'path':
            return flattenPath(p.d);
        case 'polygon': {
            const n = p.points.trim().split(/[\s,]+/).map(Number);
            const pts = [];
            for (let k = 0; k < n.length; k += 2) pts.push([n[k], n[k + 1]]);
            return [pts];
        }
        case 'ellipse':
            return [ellipsePts(p.cx ?? 0, p.cy ?? 0, p.rx, p.ry)];
        case 'circle':
            return [ellipsePts(p.cx ?? 0, p.cy ?? 0, p.r, p.r)];
        case 'rect': {
            const { x = 0, y = 0, width: w, height: h } = p;
            return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]];
        }
        default:
            return [];
    }
}

const winding = (subs, [px, py]) => {
    let wn = 0;
    for (const s of subs) {
        for (let k = 0; k < s.length; k++) {
            const [ax, ay] = s[k];
            const [bx, by] = s[(k + 1) % s.length];
            const cross = (bx - ax) * (py - ay) - (px - ax) * (by - ay);
            if (ay <= py) {
                if (by > py && cross > 0) wn++;
            } else if (by <= py && cross < 0) wn--;
        }
    }
    return wn;
};

/** Merkezdeki r<70 fotoğraf alanını boyayan öğeleri bulur. */
function photoIntrusions(design) {
    const problems = [];
    // r<68 diskinde örnek noktalar (dolgu kontrolü için)
    const samples = [[100, 100]];
    for (let rr = 10; rr <= 68; rr += 6) {
        for (let a = 0; a < 360; a += 360 / Math.max(8, Math.round(rr / 2))) {
            samples.push([100 + rr * Math.cos((a * Math.PI) / 180), 100 + rr * Math.sin((a * Math.PI) / 180)]);
        }
    }
    walk(design.art.elements, (e, parents) => {
        if (e.tag === 'g') return;
        let m = IDENTITY;
        for (const g of [...parents, e]) m = mul(m, parseTransform(g.props.transform));
        const subs = geometry(e).map((s) => s.map((pt) => apply(m, pt)));
        const stroked = e.props.stroke && e.props.stroke !== 'none';
        const half = stroked ? (e.props.strokeWidth ?? 1) / 2 : 0;
        const tag = `${e.tag}${e.props.d ? ` d=${e.props.d.slice(0, 40)}…` : ''}`;
        // 1) Hiçbir çizim noktası r < 70 (+ kenar yarı kalınlığı) içinde olmamalı
        let minR = Infinity;
        for (const s of subs) for (const [x, y] of s) minR = Math.min(minR, Math.hypot(x - 100, y - 100));
        if (minR - half < 70 - 0.25) problems.push(`${tag}: en yakın nokta r=${(minR - half).toFixed(2)}`);
        // 2) Dolgu, fotoğraf alanını kapsamamalı (ör. r=80 dolu daire)
        const filled = e.props.fill !== 'none';
        if (filled) {
            const hit = samples.find((pt) => winding(subs, pt) !== 0);
            if (hit) problems.push(`${tag}: dolgu fotoğraf alanını kaplıyor (${hit.map((v) => v.toFixed(0)).join(',')})`);
        }
    });
    return problems;
}

/* ---------------------------- testler ---------------------------- */

describe('FRAMES (profil çerçeveleri)', () => {
    it('F.3 listesindeki 12 çerçevenin hepsi var, en az 12 tasarım', () => {
        expect(FRAMES.length).toBeGreaterThanOrEqual(12);
        const keys = new Set(FRAMES.map((f) => f.id));
        for (const k of F3_REQUIRED) expect(keys.has(`frame:${k}`), k).toBe(true);
    });

    it('anahtarlar benzersiz, frame: önekli, kebab-case', () => {
        const ids = FRAMES.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^frame:[a-z0-9]+(?:-[a-z0-9]+)*$/);
    });

    it('defs id\'leri tüm çerçevelerde benzersiz', () => {
        const all = FRAMES.flatMap((f) => (f.art.defs || []).map((d) => d.id));
        expect(new Set(all).size).toBe(all.length);
    });

    for (const f of FRAMES) {
        describe(f.id, () => {
            it('üst alanlar ve nadirlik', () => {
                expect(f.category).toBe('frame');
                expect(typeof f.name).toBe('string');
                expect(f.name.length).toBeGreaterThan(1);
                expect(typeof f.description).toBe('string');
                expect(f.description.length).toBeGreaterThan(10);
                expect(RARITIES.has(f.rarity)).toBe(true);
                const short = f.id.slice('frame:'.length);
                if (F3_RARITY[short]) expect(f.rarity).toBe(F3_RARITY[short]);
                expect(f.art.viewBox).toBe('0 0 200 200');
                expect(Object.keys(f).sort()).toEqual(['art', 'category', 'description', 'id', 'name', 'rarity']);
                expect(Object.keys(f.art).sort()).toEqual(['defs', 'elements', 'viewBox']);
            });

            it('defs: yalnız gradyan, izinli prop, hex renk', () => {
                const ids = new Set();
                for (const d of f.art.defs) {
                    expect(DEF_TAGS.has(d.tag), d.tag).toBe(true);
                    expect(typeof d.id).toBe('string');
                    expect(ids.has(d.id), `tekrar eden id ${d.id}`).toBe(false);
                    ids.add(d.id);
                    expect(Object.keys(d).sort()).toEqual(['id', 'props', 'stops', 'tag']);
                    const allowed = d.tag === 'linearGradient' ? LINEAR_PROPS : RADIAL_PROPS;
                    for (const [k, v] of Object.entries(d.props)) {
                        expect(allowed.has(k), `${d.id}.${k}`).toBe(true);
                        expect(Number.isFinite(v), `${d.id}.${k}`).toBe(true);
                    }
                    expect(d.stops.length).toBeGreaterThanOrEqual(2);
                    let last = -1;
                    for (const s of d.stops) {
                        expect(Object.keys(s).every((k) => ['offset', 'color', 'opacity'].includes(k))).toBe(true);
                        expect(s.color).toMatch(HEX);
                        expect(s.offset).toBeGreaterThanOrEqual(last);
                        expect(s.offset).toBeLessThanOrEqual(1);
                        last = s.offset;
                        if (s.opacity !== undefined) {
                            expect(s.opacity).toBeGreaterThanOrEqual(0);
                            expect(s.opacity).toBeLessThanOrEqual(1);
                        }
                    }
                }
            });

            it('öğeler: yalnız izinli tag/prop, hex renk, çözülen url(#), izinli transform', () => {
                const defIds = new Set(f.art.defs.map((d) => d.id));
                const used = new Set();
                let count = 0;
                walk(f.art.elements, (e) => {
                    count++;
                    expect(ELEMENT_TAGS.has(e.tag), e.tag).toBe(true);
                    expect(Object.keys(e).every((k) => ['tag', 'props', 'children', 'anim'].includes(k))).toBe(true);
                    if (e.children) {
                        expect(e.tag).toBe('g');
                        expect(Array.isArray(e.children)).toBe(true);
                    }
                    if (e.anim !== undefined) {
                        expect(ANIMS.has(e.anim), e.anim).toBe(true);
                        expect(['epic', 'legendary']).toContain(f.rarity);
                    }
                    for (const [k, v] of Object.entries(e.props)) {
                        expect(ELEMENT_PROPS.has(k), `${e.tag}.${k}`).toBe(true);
                        expect(v === undefined || v === null, `${e.tag}.${k} boş`).toBe(false);
                        if (NUMERIC.has(k)) expect(Number.isFinite(v), `${e.tag}.${k}=${v}`).toBe(true);
                        if (k === 'fill' || k === 'stroke') {
                            const m = /^url\(#([^)]+)\)$/.exec(v);
                            if (m) {
                                expect(defIds.has(m[1]), `çözülmeyen ${v}`).toBe(true);
                                used.add(m[1]);
                            } else if (v !== 'none') expect(v).toMatch(HEX);
                        }
                        if (k === 'opacity') {
                            expect(v).toBeGreaterThanOrEqual(0);
                            expect(v).toBeLessThanOrEqual(1);
                        }
                        if (k === 'strokeLinecap') expect(['butt', 'round', 'square']).toContain(v);
                        if (k === 'strokeLinejoin') expect(['miter', 'round', 'bevel']).toContain(v);
                        if (k === 'transform') for (const part of v.trim().split(/\s+(?=[a-z])/)) expect(part).toMatch(TRANSFORM_PART);
                        if (k === 'd') {
                            expect(v).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
                            expect(v).not.toMatch(/NaN|Infinity/);
                        }
                        if (k === 'points') expect(v).toMatch(/^[0-9.,\s-]+$/);
                    }
                });
                expect(count).toBeGreaterThan(3);
                // kullanılmayan gradyan olmasın (gereksiz veri)
                for (const id of defIds) expect(used.has(id), `kullanılmayan def ${id}`).toBe(true);
            });

            it('animasyon kuralı: epic/legendary\'de en az bir anim, diğerlerinde yok', () => {
                const anims = new Set();
                walk(f.art.elements, (e) => e.anim && anims.add(e.anim));
                if (f.rarity === 'epic' || f.rarity === 'legendary') expect(anims.size).toBeGreaterThan(0);
                else expect(anims.size).toBe(0);
                const req = F3_ANIM[f.id.slice('frame:'.length)];
                if (req) expect(anims.has(req), `${req} bekleniyor`).toBe(true);
            });

            it('fotoğraf alanı (r < 70) boş; çizim viewBox içinde', () => {
                expect(photoIntrusions(f)).toEqual([]);
                let maxOut = 0;
                walk(f.art.elements, (e) => {
                    if (e.tag === 'g') return;
                    const half = e.props.stroke && e.props.stroke !== 'none' ? (e.props.strokeWidth ?? 1) / 2 : 0;
                    for (const s of geometry(e))
                        for (const [x, y] of s) maxOut = Math.max(maxOut, -x + half, -y + half, x + half - 200, y + half - 200);
                });
                expect(maxOut).toBeLessThanOrEqual(0.5);
            });
        });
    }

    it('veri JSON\'a kayıpsız serileşir (mobil ile paylaşılabilir)', () => {
        expect(JSON.parse(JSON.stringify(FRAMES))).toEqual(FRAMES);
    });

    it('doğrulayıcı kendini sınar: içe taşan dolgu ve kenar yakalanır', () => {
        const bad = (elements) => photoIntrusions({ art: { elements } });
        expect(bad([{ tag: 'circle', props: { cx: 100, cy: 100, r: 80, fill: '#FF0000' } }]).length).toBeGreaterThan(0);
        expect(bad([{ tag: 'circle', props: { cx: 100, cy: 100, r: 71, fill: 'none', stroke: '#000000', strokeWidth: 4 } }]).length).toBeGreaterThan(0);
        expect(bad([{ tag: 'path', props: { d: 'M100 20 L110 40 L90 40 Z', fill: '#000000' } }]).length).toBeGreaterThan(0);
        expect(bad([{ tag: 'circle', props: { cx: 100, cy: 100, r: 80, fill: 'none', stroke: '#000000', strokeWidth: 10 } }])).toEqual([]);
        // halka (delikli path) dolgusu merkezi kaplamaz
        const ring = 'M100 10 A90 90 0 1 1 100 190 A90 90 0 1 1 100 10 Z M100 25 A75 75 0 1 0 100 175 A75 75 0 1 0 100 25 Z';
        expect(bad([{ tag: 'path', props: { d: ring, fill: '#000000' } }])).toEqual([]);
    });
});
