/*
 * KEŞİF mobs sistemi — yüzen hasar sayıları (3B sprite, havuzlu).
 *
 *   createFloaters(THREE, parent, opts) → { update(list, camPos, dt), setVisible(b), dispose(), stats }
 *     list: em.numbers.list ({x,y,z,t,life,text,kind}); opts.makeCanvas(w,h) (test için), opts.reducedMotion, opts.hidePlayer() (oyuncu hasar sayısını gizle)
 *
 * 24 sprite yuvası; hepsi TEK paylaşılan atlas tuvalini (8×3 hücre) farklı UV aralıklarıyla kullanır; bir hücre yalnızca yuva yeni bir
 * sayıya atanınca yeniden çizilir (kare başı doku yükleme yok; çok sayıda hızlandırmalı tuval kurmak yazılım GL'de saniyeler sürer). Sayılar derinlik testi dışındadır (yaratığın arkasında kalmaz) ve uzaklığa göre ölçeklenir.
 */
import { createFloaterSync } from './mobsPool.js';

const CAP = 24;
const SHOW_DIST = 48;
const W = 160;
const H = 64;
const COLS = 8;
const ROWS = 3;

export const FLOATER_STYLE = Object.freeze({
  hit: { fill: '#fff4d6', stroke: '#3a2410', size: 34, scale: 1 },
  crit: { fill: '#ffd23a', stroke: '#5a2400', size: 44, scale: 1.35 },
  block: { fill: '#c6d2de', stroke: '#1e2a36', size: 28, scale: 0.9 },
  player: { fill: '#ff7b7b', stroke: '#3a0a0a', size: 38, scale: 1.1 },
  heal: { fill: '#8dffae', stroke: '#0b3a1a', size: 34, scale: 1 },
});

export function styleOf(kind) {
  return FLOATER_STYLE[kind] || FLOATER_STYLE.hit;
}

/** Sayı alfası: ilk anda tam, ömrün son yarısında söner. */
export function floaterAlpha(t, life) {
  if (!(life > 0)) return 0;
  const k = t / life;
  if (k <= 0.45) return 1;
  return Math.max(0, 1 - (k - 0.45) / 0.55);
}

/** Pop ölçeği: ilk 0,12 sn'de 1,35 → 1. */
export function floaterPop(t, reduced) {
  if (reduced || t >= 0.12) return 1;
  return 1 + 0.35 * (1 - t / 0.12);
}

function defaultCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Yuva i → atlastaki hücre (sütun, satır) ve doku ofset/tekrarı (flipY'li doku: v alttan). */
export function atlasCell(i) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return {
    col, row, ox: col / COLS, oy: 1 - (row + 1) / ROWS, rx: 1 / COLS, ry: 1 / ROWS,
  };
}

function draw(ctx, text, st, i) {
  const cx = (i % COLS) * W;
  const cy = Math.floor(i / COLS) * H;
  ctx.clearRect(cx, cy, W, H);
  ctx.font = '800 ' + st.size + 'px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, st.size * 0.18);
  ctx.strokeStyle = st.stroke;
  ctx.strokeText(text, cx + W / 2, cy + H / 2 + 2);
  ctx.fillStyle = st.fill;
  ctx.fillText(text, cx + W / 2, cy + H / 2 + 2);
}

export function createFloaters(THREE, parent, opts) {
  const o = opts || {};
  const make = o.makeCanvas || defaultCanvas;
  const reduced = !!o.reducedMotion;
  const group = new THREE.Group();
  group.name = 'hasar-sayilari';
  parent.add(group);
  const sync = createFloaterSync(CAP);
  const sprites = [];
  const textures = [];
  let visible = true;
  let disposed = false;
  const stats = { active: 0 };
  // tek paylaşılan atlas tuvali (24 ayrı hızlandırmalı tuval kurmak yavaş); CPU tuvali: willReadFrequently
  const canvas = make(W * COLS, H * ROWS);
  let ctx = null;
  if (canvas && canvas.getContext) {
    try {
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    } catch {
      ctx = canvas.getContext('2d');
    }
  }
  if (ctx) {
    // yazı tipi ilk kullanımda saniyeye varan donma yapabilir (sistem yazı tipi yüklenir): açılış sırasında ısıt
    try {
      draw(ctx, '0123456789.', FLOATER_STYLE.crit, 0);
      draw(ctx, 'Engellendi', FLOATER_STYLE.block, 1);
      ctx.clearRect(0, 0, W * COLS, H * ROWS);
    } catch {
      ctx = null;
    }
  }
  let base = null;
  if (canvas && THREE.CanvasTexture) {
    base = new THREE.CanvasTexture(canvas);
    base.colorSpace = THREE.SRGBColorSpace;
    base.minFilter = THREE.LinearFilter;
    base.generateMipmaps = false;
  }
  for (let i = 0; i < CAP; i++) {
    let tex = null;
    if (base) {
      tex = i === 0 ? base : base.clone();
      const c = atlasCell(i);
      tex.repeat.set(c.rx, c.ry);
      tex.offset.set(c.ox, c.oy);
    }
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.visible = false;
    sp.renderOrder = 40;
    sp.frustumCulled = false;
    group.add(sp);
    sprites.push(sp);
    textures.push(tex);
  }
  let dirty = false;

  function update(list, cam) {
    if (disposed) return;
    if (!visible) {
      for (let i = 0; i < sprites.length; i++) sprites[i].visible = false;
      stats.active = 0;
      return;
    }
    dirty = false;
    sync.update(list);
    stats.active = sync.active;
    const cx = cam ? cam.x : 0;
    const cy = cam ? cam.y : 0;
    const cz = cam ? cam.z : 0;
    for (let i = 0; i < CAP; i++) {
      const s = sync.slots[i];
      const sp = sprites[i];
      if (!s.used) {
        sp.visible = false;
        continue;
      }
      const n = s.src;
      if (n.kind === 'player' && o.hidePlayer && o.hidePlayer()) {
        sp.visible = false; // hasarsız modda oyuncuya "hasar" sayısı gösterilmez
        continue;
      }
      const dx = n.x - cx;
      const dy = n.y - cy;
      const dz = n.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > SHOW_DIST * SHOW_DIST) {
        sp.visible = false;
        continue;
      }
      const st = styleOf(n.kind);
      if (s.fresh && ctx) {
        draw(ctx, n.text, st, i);
        dirty = true;
      }
      const dist = Math.sqrt(d2);
      const k = (0.34 + dist * 0.045) * st.scale * floaterPop(n.t, reduced);
      sp.scale.set(k * (W / H), k, 1);
      sp.position.set(n.x, n.y, n.z);
      sp.material.opacity = floaterAlpha(n.t, n.life);
      sp.visible = true;
    }
    if (dirty) {
      for (let i = 0; i < textures.length; i++) if (textures[i]) textures[i].needsUpdate = true;
    }
  }

  return {
    update,
    stats,
    /** Shader derleme ısınması: ilk sprite'ı kısa süre görünür yap. */
    warm(on) {
      sprites[0].visible = !!on;
      if (on) sprites[0].material.opacity = 0.01;
    },
    setVisible(b) { visible = !!b; },
    clear() {
      sync.clear();
      for (let i = 0; i < sprites.length; i++) sprites[i].visible = false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      parent.remove(group);
      for (let i = 0; i < sprites.length; i++) {
        sprites[i].material.dispose();
        if (textures[i] && textures[i] !== base) textures[i].dispose();
      }
      if (base) base.dispose();
    },
  };
}
