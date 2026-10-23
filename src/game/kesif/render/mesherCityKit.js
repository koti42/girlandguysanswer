/*
 * KEŞİF render — mesher `opts.city` testleri için ortak araç takımı (yalnız test/araçlar; üretim kodu içe aktarmaz).
 *
 *   randomOverworldChunk(seed, cx, cz)  Düz biçimli (legacy y 0..127) belirlenimci "arazi + dağınık özel bloklar" chunk'ı:
 *                                       her şekil (merdiven, çit, çapraz bitki, meşale, sıvı, plaka, kapı, cam) ve ışık nibble'ı
 *                                       içerir → mesher'ın tüm yüz üreticilerini kapsar. Şehir kimlikleri (223+) KULLANMAZ.
 *   meshHash(mesh)                      Mesh çıktısının (tüm geçişler, tüm tamponlar) FNV-1a özeti; `city` tamponu HARİÇ.
 *   cityStreet(...)                     Şehir sahneleri (yol + neon + pencere) kurucuları.
 */
import { B, BLOCKS } from '../sim/blocks.js';
import { PASS_NAMES } from './mesher.js';

const VOL = 16 * 16 * 128;
export const kidx = (x, y, z) => ((y * 16) + z) * 16 + x;

/** Küçük belirlenimci rastgele üretici (mulberry32). */
export function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function emptyChunk(cx = 0, cz = 0) {
  const c = {
    cx, cz, blocks: new Uint8Array(VOL), light: new Uint8Array(VOL), biomeMap: new Uint8Array(256),
  };
  c.light.fill(0xf0);
  return c;
}

/** Blok koy; ışık süzgeci 15 olan hücrenin ışığı 0 (gerçek ışık sistemi gibi). */
export function putBlock(c, x, y, z, id, blockLight = -1) {
  const i = kidx(x, y, z);
  c.blocks[i] = id;
  c.light[i] = BLOCKS[id].lightFilter >= 15 ? 0 : 0xf0;
  if (blockLight >= 0) c.light[i] = (c.light[i] & 0xf0) | (blockLight & 15);
}

const SPECIAL = [
  B.STAIRS, B.FENCE, B.TALL_GRASS, B.FLOWER_RED, B.TORCH, B.LANTERN, B.WATER, B.GLASS, B.PRESSURE_PLATE, B.DOOR,
  B.SLAB, B.CHEST, B.VINE, B.ICE, B.LIGHT_BLOCK, B.LEAVES_OAK, B.LAVA, B.BRICK, B.CONCRETE_RED, B.CACTUS, B.MUSHROOM, B.BUSH,
];

export function randomOverworldChunk(seed, cx = 0, cz = 0) {
  const rnd = lcg(seed * 7919 + cx * 31 + cz * 17 + 5);
  const c = emptyChunk(cx, cz);
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      const wx = cx * 16 + x;
      const wz = cz * 16 + z;
      const h = Math.floor(40 + 9 * Math.sin(wx * 0.13 + seed) * Math.cos(wz * 0.1) + 3 * Math.sin(wx * 0.37 + wz * 0.21));
      for (let y = 0; y <= h; y++) {
        c.blocks[kidx(x, y, z)] = y === h ? B.GRASS : y > h - 4 ? B.DIRT : B.STONE;
      }
      for (let y = h + 1; y <= 41; y++) c.blocks[kidx(x, y, z)] = B.WATER;
      c.biomeMap[z * 16 + x] = (seed + (x >> 3) + (z >> 3)) % 6;
      let sky = 15;
      for (let y = 127; y >= 0; y--) {
        const id = c.blocks[kidx(x, y, z)];
        if (id !== 0 && B.WATER !== id) sky = 0;
        c.light[kidx(x, y, z)] = sky << 4;
      }
    }
  }
  // dağınık özel bloklar + rastgele blok ışığı
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(rnd() * 16);
    const z = Math.floor(rnd() * 16);
    let top = 127;
    while (top > 0 && c.blocks[kidx(x, top, z)] === 0) top--;
    const y = Math.min(126, top + 1 + Math.floor(rnd() * 3));
    const id = SPECIAL[Math.floor(rnd() * SPECIAL.length)];
    c.blocks[kidx(x, y, z)] = id;
  }
  for (let i = 0; i < 400; i++) {
    const k = Math.floor(rnd() * VOL);
    if (c.blocks[k] === 0 || rnd() < 0.2) c.light[k] = (c.light[k] & 0xf0) | Math.floor(rnd() * 16);
  }
  return c;
}

/** Mesh çıktısının FNV-1a özeti (city tamponu hariç). */
export function meshHash(m) {
  let h = 0x811c9dc5;
  const feed = (arr) => {
    const u = arr instanceof Uint8Array ? arr : new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < u.length; i++) {
      h ^= u[i];
      h = Math.imul(h, 0x01000193);
    }
  };
  PASS_NAMES.forEach((k) => {
    const p = m[k];
    ['pos', 'normal', 'uv', 'color', 'light', 'flags', 'index'].forEach((f) => feed(p[f]));
    h ^= p.vertexCount;
    h = Math.imul(h, 0x01000193);
    h ^= p.indexCount;
    h = Math.imul(h, 0x01000193);
  });
  return (h >>> 0).toString(16).padStart(8, '0');
}
