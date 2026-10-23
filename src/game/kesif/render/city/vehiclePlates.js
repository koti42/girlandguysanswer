/*
 * KEŞİF render/city — PLAKA + TAKSİ TABELASI ATLASI. 512×512 tuval: 2 sütun × 7 satır plaka hücresi (256×64) + son satırda tam genişlik "TAKSİ" yazısı.
 * Plaka metinleri sim `plateFor(seed, idx)` çıktısıdır ("NM-AB 1234": kurgusal, yalnız harf+rakam). Hücre sayısı dolunca en az kullanılan hücre yeniden çizilir.
 *
 *   createPlateAtlas({THREE?, createCanvas?, anisotropy?}) → atlas
 *     atlas.slotFor(text) → hücre indeksi (0..13)      atlas.rectOf(i) → [u0, v0, du, dv]  (v tuvalin ÜSTÜNDEN; flipY = false)
 *     atlas.signRect → [u0, v0, du, dv]                 atlas.texture (THREE verilirse CanvasTexture)   atlas.drawCount   atlas.dispose()
 * `createCanvas(w,h)` enjekte edilir (düğümde sahte tuval); yoksa document.createElement('canvas').
 */
export const PLATE_ATLAS_SIZE = 512;
export const PLATE_CELL_W = 256;
export const PLATE_CELL_H = 64;
export const PLATE_SLOTS = 14;
const FONT = '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif';

function defaultCreateCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

function roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.lineTo(x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.lineTo(x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.lineTo(x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.closePath();
}

export function drawPlate(ctx, x, y, text) {
  ctx.save();
  ctx.fillStyle = '#14161b';
  roundRect(ctx, x + 2, y + 2, PLATE_CELL_W - 4, PLATE_CELL_H - 4, 8);
  ctx.fill();
  ctx.fillStyle = '#f2f4f6';
  roundRect(ctx, x + 6, y + 6, PLATE_CELL_W - 12, PLATE_CELL_H - 12, 6);
  ctx.fill();
  // sol bant: neon camgöbeği eşkenar dörtgen amblem
  ctx.fillStyle = '#17c4d8';
  roundRect(ctx, x + 6, y + 6, 38, PLATE_CELL_H - 12, 6);
  ctx.fill();
  ctx.fillStyle = '#f2f4f6';
  ctx.beginPath();
  ctx.moveTo(x + 25, y + 18);
  ctx.lineTo(x + 36, y + 32);
  ctx.lineTo(x + 25, y + 46);
  ctx.lineTo(x + 14, y + 32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#14161b';
  ctx.font = 'bold 38px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), x + 44 + (PLATE_CELL_W - 52) / 2, y + PLATE_CELL_H / 2 + 2);
  ctx.restore();
}

export function drawSign(ctx, y) {
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, y, PLATE_ATLAS_SIZE, PLATE_CELL_H);
  ctx.fillStyle = '#ffb02e';
  ctx.font = 'bold 50px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TAKSİ', PLATE_ATLAS_SIZE / 2, y + PLATE_CELL_H / 2 + 3);
  ctx.restore();
}

export function createPlateAtlas(o) {
  const opt = o || {};
  const make = opt.createCanvas || defaultCreateCanvas;
  const canvas = make(PLATE_ATLAS_SIZE, PLATE_ATLAS_SIZE);
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  const map = new Map();
  const slots = new Array(PLATE_SLOTS).fill(null);
  const used = new Array(PLATE_SLOTS).fill(0);
  let tick = 0;
  let drawCount = 0;
  let texture = null;
  const THREE = opt.THREE;
  const rows = PLATE_ATLAS_SIZE / PLATE_CELL_H;
  const signRow = rows - 1;

  if (ctx) {
    ctx.fillStyle = '#d9dde2';
    ctx.fillRect(0, 0, PLATE_ATLAS_SIZE, PLATE_ATLAS_SIZE);
    drawSign(ctx, signRow * PLATE_CELL_H);
    drawCount++;
  }
  if (THREE && canvas) {
    texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = opt.anisotropy || 4;
    texture.needsUpdate = true;
  }

  const rectOf = (i) => {
    const col = i % 2;
    const row = (i / 2) | 0;
    return [col * (PLATE_CELL_W / PLATE_ATLAS_SIZE), row * (PLATE_CELL_H / PLATE_ATLAS_SIZE), PLATE_CELL_W / PLATE_ATLAS_SIZE, PLATE_CELL_H / PLATE_ATLAS_SIZE];
  };

  const atlas = {
    canvas,
    texture,
    slotFor(text) {
      const t = String(text || '');
      tick++;
      if (map.has(t)) {
        const i = map.get(t);
        used[i] = tick;
        return i;
      }
      let pick = -1;
      for (let i = 0; i < PLATE_SLOTS; i++) {
        if (slots[i] === null) { pick = i; break; }
      }
      if (pick < 0) {
        let best = Infinity;
        for (let i = 0; i < PLATE_SLOTS; i++) {
          if (used[i] < best) { best = used[i]; pick = i; }
        }
        map.delete(slots[pick]);
      }
      slots[pick] = t;
      map.set(t, pick);
      used[pick] = tick;
      if (ctx) {
        const r = rectOf(pick);
        drawPlate(ctx, r[0] * PLATE_ATLAS_SIZE, r[1] * PLATE_ATLAS_SIZE, t);
        drawCount++;
        if (texture) texture.needsUpdate = true;
      }
      return pick;
    },
    rectOf,
    signRect: [0, signRow * (PLATE_CELL_H / PLATE_ATLAS_SIZE), 1, PLATE_CELL_H / PLATE_ATLAS_SIZE],
    get drawCount() {
      return drawCount;
    },
    dispose() {
      if (texture) texture.dispose();
      texture = null;
      map.clear();
    },
  };
  return atlas;
}
