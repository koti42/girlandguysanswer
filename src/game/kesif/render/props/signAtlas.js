/*
 * KEŞİF render/props — TABELA ATLASI. Sözleşme KESIF_CITY_CONTRACT §6: 1024² tuval; tüm tabela dizgeleri (60 dükkân + reklam satırları,
 * sim/props/propSigns.js SIGN_ENTRIES) yüklemede BİR KEZ çizilir; kare başı çizim yok. Doğru Türkçe glifler (İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç â î û).
 *
 *   planSignAtlas(entries, measure, opts?) → {size, cells[{index,x,y,w,h,px,lines,weight}], fontScale, fits}   (saf; ölçüm işlevi enjekte)
 *   createSignAtlas({THREE?, createCanvas?, entries?, size?, anisotropy?}) → atlas
 *       atlas.canvas  atlas.texture (THREE verilirse CanvasTexture, mipmap'li, flipY=false: v tuvalin ÜSTÜNDEN ölçülür)
 *       atlas.rectOf(i) → [u0,v0,u1,v1] (metin kutusu, v yukarıdan)   atlas.cells   atlas.fontScale   atlas.drawCount
 *       atlas.dispose()
 * Kanal: yazı şiddeti R kanalındadır (siyah zemin, beyaz çekirdek + yumuşak ışıma); renk örnek başına shader'da boyanır.
 * Yerleşim: raf paketleme; tuvale sığmazsa yazı boyu %6 küçülür (en az ×0.55); testler tüm dizgelerin sığdığını doğrular.
 */
import { SIGN_ENTRIES } from '../../sim/props/propSigns.js';

export const SIGN_ATLAS_SIZE = 1024;
export const SIGN_FONT_FAMILY = '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif';
const PAD = 5;
const LINE_K = 1.2;
const BASE_PX = { brand: 30, ad: 23 };
const MIN_SCALE = 0.55;
const SHRINK = 0.94;

function weightOf(kind) {
  return kind === 'brand' ? 'bold' : '600';
}

/** measure(text, px, weight) → piksel genişliği. */
export function planSignAtlas(entries, measure, opts) {
  const size = opts && opts.size > 0 ? opts.size : SIGN_ATLAS_SIZE;
  const list = entries || SIGN_ENTRIES;
  let scale = 1;
  let last = null;
  for (;;) {
    const cells = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const px = Math.max(8, Math.round(BASE_PX[e.kind] * scale));
      const weight = weightOf(e.kind);
      let wMax = 0;
      for (let k = 0; k < e.lines.length; k++) {
        const w = measure(e.lines[k], px, weight);
        if (w > wMax) wMax = w;
      }
      const lh = Math.ceil(px * LINE_K);
      cells.push({
        index: e.i, x: 0, y: 0, w: Math.ceil(wMax) + 2 * PAD, h: lh * e.lines.length + 2 * PAD, px, lines: e.lines, weight, lh,
      });
    }
    const order = cells.slice().sort((a, b) => b.h - a.h || b.w - a.w || a.index - b.index);
    let x = 0;
    let y = 0;
    let rowH = 0;
    let ok = true;
    for (let i = 0; i < order.length; i++) {
      const c = order[i];
      if (c.w > size) { ok = false; break; }
      if (x + c.w > size) {
        x = 0;
        y += rowH;
        rowH = 0;
      }
      if (y + c.h > size) { ok = false; break; }
      c.x = x;
      c.y = y;
      x += c.w;
      if (c.h > rowH) rowH = c.h;
    }
    last = { size, cells: cells.sort((a, b) => a.index - b.index), fontScale: scale, fits: ok };
    if (ok || scale * SHRINK < MIN_SCALE) break;
    scale *= SHRINK;
  }
  return last;
}

function defaultCreateCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  throw new Error('signAtlas: tuval oluşturulamıyor (document/OffscreenCanvas yok)');
}

function fontFor(weight, px) {
  return weight + ' ' + px + 'px ' + SIGN_FONT_FAMILY;
}

export function createSignAtlas(o) {
  const opts = o || {};
  const size = opts.size > 0 ? opts.size : SIGN_ATLAS_SIZE;
  const entries = opts.entries || SIGN_ENTRIES;
  const canvas = (opts.createCanvas || defaultCreateCanvas)(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('signAtlas: 2B bağlam yok');
  const measure = (text, px, weight) => {
    ctx.font = fontFor(weight, px);
    return ctx.measureText(text).width;
  };
  const plan = planSignAtlas(entries, measure, { size });

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let drawCount = 0;
  for (let n = 0; n < plan.cells.length; n++) {
    const c = plan.cells[n];
    ctx.save();
    ctx.beginPath();
    ctx.rect(c.x, c.y, c.w, c.h);
    ctx.clip();
    ctx.font = fontFor(c.weight, c.px);
    const cx = c.x + c.w / 2;
    for (let k = 0; k < c.lines.length; k++) {
      const cy = c.y + PAD + c.lh * (k + 0.5) + c.px * 0.04;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = c.px * 0.3;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(c.lines[k], cx, cy);
      ctx.shadowBlur = c.px * 0.12;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(c.lines[k], cx, cy);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(c.lines[k], cx, cy);
      drawCount += 3;
    }
    ctx.restore();
  }
  ctx.restore();

  const rects = plan.cells.map((c) => [
    (c.x + 2) / size, (c.y + 2) / size, (c.x + c.w - 2) / size, (c.y + c.h - 2) / size,
  ]);

  let texture = null;
  const THREE = opts.THREE;
  if (THREE) {
    texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = opts.anisotropy > 0 ? opts.anisotropy : 4;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    texture.name = 'kesif-tabela-atlasi';
  }

  return {
    canvas,
    texture,
    size,
    cells: plan.cells,
    fontScale: plan.fontScale,
    fits: plan.fits,
    drawCount,
    /** [u0,v0,u1,v1] (metin kutusu; v tuvalin üstünden). Geçersiz indeks → ilk giriş. */
    rectOf(i) {
      return rects[Number.isInteger(i) && i >= 0 && i < rects.length ? i : 0];
    },
    dispose() {
      if (texture) texture.dispose();
      texture = null;
      this.texture = null;
    },
  };
}
