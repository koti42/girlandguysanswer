/*
 * KEŞİF eşya/blok simgeleri (canvas 2D → dataURL), UI için.
 *
 *   renderItemIcon(itemKey, size = 64) → dataURL ('' → tarayıcı dışı/canvas yok)
 *   setAtlasPixels(pixels)             → blok simgeleri için atlas piksel tamponu enjekte eder
 *   paintItemIcon(ctx, itemKey, size)  → simgeyi verilen 2D bağlama çizer (test/özel kullanım)
 *   clearItemIconCache(), iconColorFor(itemKey), ICON_PAINTERS
 *
 * Bloklar: atlas pikselleriyle ışıklandırılmış izometrik küp (üst 1.0 / sol .78 / sağ .58, 2×2 aşırı
 * örnekleme → yumuşak kenar; tek geçişte ImageData; ≈1 ms). Atlas yoksa tek renkli yedek küp.
 * Diğer eşyalar: kademe renkli, elle boyanmış vektör simgeler (itemIconsTools/Misc). Sonuçlar
 * anahtar+boyut+atlas sürümüyle önbelleklenir; document yoksa '' döner (SSR/worker güvenli).
 *
 * pixels biçimi: atlas.generateAtlasPixels() çıktısı {color:Uint8ClampedArray, width, cols, cell, pad, tileSize}
 * (alternatif olarak color yerine `data`). Doku satırı GL sırasındadır (art-üst = tampon satırı pad+n-1).
 */
import { itemSpec } from './itemPalette.js';
import { getBlock } from '../sim/blocks.js';
import { TOOL_PAINTERS } from './itemIconsTools.js';
import { MISC_PAINTERS } from './itemIconsMisc.js';
import { MAGIC_PAINTERS } from './itemIconsMagic.js';
import { TECH_PAINTERS } from './itemIconsTech.js';
import { poly, rrect, lin, glow, paint, shadeColor, mixColor } from './itemIconsKit.js';
import { ITEMS } from '../sim/items.js';

let atlas = null;
let atlasVersion = 0;
const memo = new Map();
const MEMO_MAX = 1200;

/** Atlas piksel tamponunu enjekte eder (null ile temizlenir); blok simgeleri yeniden üretilir. */
export function setAtlasPixels(pixels) {
  if (!pixels) {
    atlas = null;
  } else {
    const data = pixels.color || pixels.data;
    if (!data || !pixels.width || !pixels.cols || !pixels.tileSize) throw new TypeError('setAtlasPixels: {color|data,width,cols,tileSize,cell?,pad?} gerekli');
    const n = pixels.tileSize;
    const pad = pixels.pad === undefined ? Math.max(2, n >> 3) : pixels.pad;
    atlas = { data, width: pixels.width, cols: pixels.cols, n, pad, cell: pixels.cell || n + 2 * pad };
  }
  atlasVersion++;
  memo.clear();
}

export function clearItemIconCache() {
  memo.clear();
}

/** Atlas dokusundan art-uzayı (0..1, v aşağı) örnek: [r,g,b,a] 0..255 → out dizisine yazar. */
function sampleTile(tile, s, t, out) {
  const a = atlas;
  const n = a.n;
  let x = Math.floor(s * n);
  let y = Math.floor(t * n);
  x = x < 0 ? 0 : x >= n ? n - 1 : x;
  y = y < 0 ? 0 : y >= n ? n - 1 : y;
  const col = tile % a.cols;
  const row = (tile / a.cols) | 0;
  const gx = col * a.cell + a.pad + x;
  const gy = row * a.cell + a.pad + (n - 1 - y);
  const i = (gy * a.width + gx) * 4;
  out[0] = a.data[i]; out[1] = a.data[i + 1]; out[2] = a.data[i + 2]; out[3] = a.data[i + 3];
}

/* ------------------------------------------------------------------------------------------------
 * İzometrik küp
 * ---------------------------------------------------------------------------------------------- */
/** İzometrik izdüşüm: blok-yerel (x,y,z) 0..1 → simge uzayı 0..1 (y yukarı). */
function iso(x, y, z) {
  return [0.5 + 0.43 * (x - z), 0.25 * (x + z) + 0.5 * (1 - y)];
}

/** Kutu → 3 görünür yüz (üst, sol=ön z, sağ=ön x); (s,t) doku koordinatları yüzün blok-yerel kesitine eşlenir. */
function boxFaces(x0, x1, y0, y1, z0, z1) {
  const mk = (o, pe1, pe2, shade, kind, depth, map) => {
    const e1 = [pe1[0] - o[0], pe1[1] - o[1]];
    const e2 = [pe2[0] - o[0], pe2[1] - o[1]];
    return { o, e1, e2, shade, kind, depth, map, det: e1[0] * e2[1] - e2[0] * e1[1] };
  };
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;
  return [
    mk(iso(x0, y1, z0), iso(x1, y1, z0), iso(x0, y1, z1), 1.0, 'top', cx + y1 + cz, [x0, x1 - x0, z0, z1 - z0]),
    mk(iso(x0, y1, z1), iso(x1, y1, z1), iso(x0, y0, z1), 0.78, 'left', cx + cy + z1, [x0, x1 - x0, 1 - y1, y1 - y0]),
    mk(iso(x1, y1, z1), iso(x1, y1, z0), iso(x1, y0, z1), 0.58, 'right', x1 + cy + cz, [1 - z1, z1 - z0, 1 - y1, y1 - y0]),
  ];
}

const SHAPE_BOXES = {
  cube: [[0, 1, 0, 1, 0, 1]],
  slab: [[0, 1, 0, 0.5, 0, 1]],
  // basamak: ön yarıda alçak plaka + arka yarıda tam yükseklikte blok
  stair: [[0, 1, 0, 0.5, 0.5, 1], [0, 1, 0, 1, 0, 0.5]],
};
/** Şekil dış siluetleri (simge uzayı 0..1). */
const SHAPE_OUTLINE = {
  cube: [[0.5, 0], [0.93, 0.25], [0.93, 0.75], [0.5, 1], [0.07, 0.75], [0.07, 0.25]],
  slab: [[0.5, 0.25], [0.93, 0.5], [0.93, 0.75], [0.5, 1], [0.07, 0.75], [0.07, 0.5]],
  stair: [[0.5, 0], [0.93, 0.25], [0.93, 0.75], [0.5, 1], [0.07, 0.75], [0.07, 0.5], [0.285, 0.375], [0.285, 0.125]],
};
const faceCache = {};
/** Şekil → yüzler (öne en yakın önce; izdüşüm ressam sırası). Bilinmeyen şekil küptür. */
function facesFor(shape) {
  const key = SHAPE_BOXES[shape] ? shape : 'cube';
  if (!faceCache[key]) {
    const all = [];
    SHAPE_BOXES[key].forEach((bx) => boxFaces(bx[0], bx[1], bx[2], bx[3], bx[4], bx[5]).forEach((f) => all.push(f)));
    all.sort((a, b) => b.depth - a.depth);
    faceCache[key] = all;
  }
  return faceCache[key];
}
const TINTS = { grass: [0.47, 0.74, 0.29], foliage: [0.37, 0.65, 0.23], water: [0.23, 0.56, 0.85] };

const _px = [0, 0, 0, 0];

function cubeRaster(ctx, spec, size) {
  const b = getBlock(spec.blockId);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const tint = b.tint ? TINTS[b.tint] : null;
  const fb = spec.color;
  const fr = (fb >> 16) & 255;
  const fg = (fb >> 8) & 255;
  const fbl = fb & 255;
  const ss = 2;
  const inv = 1 / (size * ss);
  const tiles = [b.tiles.top, b.tiles.side];
  const faces = facesFor(spec.sub);
  const useAtlas = !!atlas && tiles[0] >= 0;
  const inset = 0.95;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let bl = 0;
      let cov = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = ((px * ss + sx + 0.5) * inv - 0.5) / inset + 0.5;
          const v = ((py * ss + sy + 0.5) * inv - 0.5) / inset + 0.5;
          for (let k = 0; k < faces.length; k++) {
            const f = faces[k];
            const dx = u - f.o[0];
            const dy = v - f.o[1];
            const s = (f.e2[1] * dx - f.e2[0] * dy) / f.det;
            const t = (-f.e1[1] * dx + f.e1[0] * dy) / f.det;
            if (s < 0 || s >= 1 || t < 0 || t >= 1) continue;
            let cr;
            let cg;
            let cb;
            let ca = 255;
            const top = f.kind === 'top';
            if (useAtlas) {
              sampleTile(top ? tiles[0] : tiles[1], f.map[0] + s * f.map[1], f.map[2] + t * f.map[3], _px);
              cr = _px[0]; cg = _px[1]; cb = _px[2]; ca = _px[3];
              if (tint && (b.tintFaces === 'all' || top)) { cr *= tint[0]; cg *= tint[1]; cb *= tint[2]; }
            } else {
              const e = 0.9 + 0.1 * (1 - t);
              cr = fr * e; cg = fg * e; cb = fbl * e;
              const edge = Math.min(s, 1 - s, t, 1 - t) < 0.06 ? 0.86 : 1;
              cr *= edge; cg *= edge; cb *= edge;
            }
            const sh = f.shade;
            const a = ca / 255;
            r += cr * sh * a; g += cg * sh * a; bl += cb * sh * a; cov += a;
            break;
          }
        }
      }
      const o = (py * size + px) * 4;
      if (cov > 0) {
        d[o] = Math.min(255, r / cov);
        d[o + 1] = Math.min(255, g / cov);
        d[o + 2] = Math.min(255, bl / cov);
        d[o + 3] = Math.round((cov / (ss * ss)) * 255);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  // ince çerçeve: şeklin dış silueti
  ctx.save();
  ctx.scale(size, size);
  const c = (p) => [(p[0] - 0.5) * inset + 0.5, (p[1] - 0.5) * inset + 0.5];
  ctx.beginPath();
  (SHAPE_OUTLINE[spec.sub] || SHAPE_OUTLINE.cube).forEach((p, i) => {
    const q = c(p);
    if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
  });
  ctx.closePath();
  ctx.lineWidth = 1 / size;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  ctx.restore();
  if (b.emission >= 6) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.scale(size / 64, size / 64);
    glow(ctx, 32, 32, 30, fb, Math.min(0.35, b.emission / 40));
    ctx.restore();
  }
}

/** ImageData yoksa vektör küp (tek renk, 3 yüz). */
function cubeVector(c, spec) {
  const col = spec.color;
  const top = [[32, 3], [58, 18], [32, 33], [6, 18]];
  const left = [[6, 18], [32, 33], [32, 61], [6, 46]];
  const right = [[32, 33], [58, 18], [58, 46], [32, 61]];
  [[top, mixColor(col, 0xffffff, 0.12)], [left, shadeColor(col, 0.78)], [right, shadeColor(col, 0.58)]].forEach(([p, f]) => {
    poly(c, p);
    paint(c, f, shadeColor(col, 0.35), 1.4);
  });
}

/* ------------------------------------------------------------------------------------------------
 * Yedek glif
 * ---------------------------------------------------------------------------------------------- */
function glyph(c, spec) {
  const it = ITEMS[spec.key];
  const ch = it && it.name ? it.name.charAt(0).toLocaleUpperCase('tr-TR') : '?';
  rrect(c, 8, 8, 48, 48, 10);
  paint(c, lin(c, 8, 8, 56, 56, mixColor(spec.color, 0xffffff, 0.35), shadeColor(spec.color, 0.6), spec.color), shadeColor(spec.color, 0.35), 2.2);
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.font = 'bold 28px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(ch, 32, 34);
}

/** Tür → çizici (tam küme: itemPalette.MODEL_KINDS; test denetler). */
export const ICON_PAINTERS = {
  ...TOOL_PAINTERS, ...MISC_PAINTERS, ...MAGIC_PAINTERS, ...TECH_PAINTERS, block: cubeVector,
};

/** Eşyanın temsilî rengi (simge rengi tablosu; test kapsamı). */
export function iconColorFor(itemKey) {
  const spec = itemSpec(itemKey);
  if (spec.palette) return spec.palette.head;
  return spec.color;
}

/** Simgeyi verilen 2D bağlama çizer (size×size alanına). Hata olursa yedek glif çizilir. */
export function paintItemIcon(ctx, itemKey, size = 64) {
  const spec = itemSpec(itemKey);
  ctx.clearRect(0, 0, size, size);
  try {
    if (spec.kind === 'block' && spec.blockId > 0 && typeof ctx.createImageData === 'function' && typeof ctx.putImageData === 'function') {
      cubeRaster(ctx, spec, size);
      return true;
    }
    ctx.save();
    ctx.scale(size / 64, size / 64);
    const p = ICON_PAINTERS[spec.kind] || glyph;
    p(ctx, spec);
    ctx.restore();
    return true;
  } catch (_e) {
    try {
      ctx.restore();
    } catch (_e2) { /* bağlam durumu bozuk olabilir */ }
    ctx.save();
    ctx.scale(size / 64, size / 64);
    glyph(ctx, spec);
    ctx.restore();
    return false;
  }
}

/** Eşya simgesi dataURL (PNG). Tarayıcı dışında '' döner. Bellekte önbelleklenir. */
export function renderItemIcon(itemKey, size = 64) {
  if (typeof document === 'undefined') return '';
  const sz = Math.max(8, Math.min(512, Math.round(size)));
  const key = itemKey + '|' + sz + '|' + atlasVersion;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  let url = '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = sz;
    canvas.height = sz;
    // CPU destekli tuval: GPU'lu 2D tuvalde toDataURL okuma senkronu her simgede 30-170 ms donma yapıyordu (RTX 3060 ölçümü)
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      paintItemIcon(ctx, itemKey, sz);
      url = canvas.toDataURL('image/png');
    }
  } catch (_e) {
    url = '';
  }
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
  memo.set(key, url);
  return url;
}

