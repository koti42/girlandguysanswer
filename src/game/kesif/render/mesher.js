/*
 * KEŞİF render — chunk mesher (SAF fonksiyon; three/DOM yok → Web Worker'da da çalışır).
 *
 *   meshChunk(chunk, neighbors, atlasUV, opts) → {opaque, cutout, transparent, bounds, stats}
 *
 * chunk      Chunk (sim/chunk.js: kesitli sütun) ya da işçi tel nesnesi {cx,cz,yMin,sectionCount,s0,sb:[…],sl:[…],biomeMap}
 *            (sb/sl: kesit başına Uint8Array(4096) | tek tip sayı | null; s0 = ilk dahil edilen kesit). biomeMap indeksi z*16+x.
 *            MESH BANDI: opts.band = {s0, ns} → kesit s0 .. s0+ns-1 (ns ≤ MAX_BAND_SECTIONS=9) meshlenir; çıktı konumları BANDIN
 *            TABANINA göre yereldir (mesh.position = (cx*16, baseY, cz*16); baseY = chunk.yMin + s0*16; mesh.baseY döner).
 *            Band verilmezse: y 0..127 (legacy: tüm chunk; macera: yüzey bandının ilk 8 kesiti).
 * neighbors  {n,s,e,w,ne,nw,se,sw} (aynı biçim, null olabilir). Yönler: n=(cx,cz-1) s=(cx,cz+1) e=(cx+1,cz) w=(cx-1,cz)
 *            ne=(cx+1,cz-1) nw=(cx-1,cz-1) se=(cx+1,cz+1) sw=(cx-1,cz+1).  (Kuzey = -Z, doğu = +X.)
 * atlasUV    (tileIndex)=>[u0,v0,u1,v1] işlevi | düz Float32Array/Array (4*tileCount) | {uvTable}. Verilmezse varsayılan
 *            yerleşim (atlasLayout.js, 32 px) kullanılır. Worker'a yalnız `uvTable` (Float32Array) geçirilir.
 * opts       {ao=true, smoothLight=true, aoCurve=[4], tints:{grass,foliage,water: hex[9]}, nullNeighbor='replicate'|'air'|'solid',
 *             stairs='derived'|'fixed', waterUnderside=true, randomize=true, mergeDark=false, darkLod=0, farFlora=false, city=false}
 *             mergeDark: tam karanlık (ışık örnek hücreleri gökyüzü 0 + blok 0) opak küp yüzlerini düzlemde dikdörtgenlere birleştirir
 *             (mesherDark.js): mağara içleri çok daha az üçgen; görünüm aynı (ışık ≈ uMinLight).
 *             darkLod: 1 = uzak chunk: gökyüzü-0 hava hücreleri sanal taş sayılır (iç yüzler yok, mağara ağzında kapak yüzü kalır);
 *             kalan karanlık yüzlerde blok ışığı nicelenip birleştirilir.
 *             city: Neon Meridyen şehir mesh'i: her köşeye ek öznitelik aCity (Uint8×4, normalized; her geçişte pass.city) yazılır — neon boyası + ıslak yol
 *             yansıma ipucu + pencere grubu (mesherCity.js, bit düzeni sim/cityData.js). Kapalıyken (varsayılan) hiçbir şey eklenmez/değişmez: ana diyar mesh'i bayt-aynı.
 *             farFlora: çok uzak chunk (≥ ~4 chunk): küçük çapraz bitkiler (uzun ot, gelincik, sarı çiçek) çizilmez → üçgen + alfa-testli aşırı çizim azalır.
 *
 * Her geçiş (opaque | cutout | transparent) aktarılabilir tamponlar döndürür (hepsi köşe başına):
 *   pos Float32×3   chunk-yerel konum (mesh.position = (cx*16, 0, cz*16))
 *   normal Float32×3
 *   uv Float32×2    atlas uv (v yukarı artar)
 *   color Float32×4 rgb = biyom tonu(doğrusal) × AO × küçük parlaklık sapması, a = AO
 *   light Float32×2 [gökyüzü, blok] 0..1 (yumuşak; shader gün faktörüyle çarpar)
 *   flags Float32×4 [bitler, a, b, c]  bitler: bkz. FLAG/KIND; a = rüzgâr sallanma ağırlığı | su yüzey ağırlığı, b = su derinliği, c = köpük
 *   city Uint8×4    YALNIZ opts.city: aCity (normalized) — a bit7 ıslak yüzey, bit6 yanık pencere (+grup), bit0–5 neon şiddeti; rgb neon tonu/pencere eşiği
 *   index Uint16Array | Uint32Array (köşe sayısı ≤ 65535 ise Uint16)
 *   vertexCount, indexCount
 */
import { TILE_COUNT, BLOCKS, B } from '../sim/blocks.js';
import { computeAtlasLayout } from './atlasLayout.js';
import {
  S, P, L, SY, SZ, CULL, PASS_LUT, SHAPE_LUT, HAS, KIND_LUT, WIND_LUT, TINT_LUT, NOTOP_TINT, NATURAL_LUT,
  DN, FLAG, FLOW_LUT, SHAPE_ID, passes, resetPasses, fillPadded, buildTintGrid, emitFace, lastFaceAO, hash3,
  BIOME_TINTS, MAX_BAND_SECTIONS,
} from './mesherCore.js';
import {
  resetDark, darkFaceCode, markDark, flushDark, darkCount, plugDarkAir,
} from './mesherDark.js';
import { CITY_MODE_LUT, CITY_MODE, CITY_ROTATE_LUT, cityPrepare } from './mesherCity.js';
import { windowGroup } from '../sim/cityData.js';
import {
  emitCollisionBox, emitPlate, emitStair, emitFence, emitCross, emitVine, emitTorch, emitLantern, emitLiquid,
  stairFacing,
} from './mesherShapes.js';

export { FLAG, KIND, WIND, SHAPE_ID, PASS, BIOME_TINTS, LIQUID_DROP } from './mesherCore.js';
export { stairFacing } from './mesherShapes.js';
export { CITY_FLAG, CITY_MODE } from './mesherCity.js';
export { lastFaceAO };

/** Geometri öznitelikleri: mesh anahtarı → three öznitelik adı/boyutu (materials.createChunkGeometry kullanır). */
export const MESH_ATTRIBUTES = Object.freeze([
  Object.freeze({ key: 'pos', name: 'position', itemSize: 3 }),
  Object.freeze({ key: 'normal', name: 'normal', itemSize: 3 }),
  Object.freeze({ key: 'uv', name: 'uv', itemSize: 2 }),
  Object.freeze({ key: 'color', name: 'aColor', itemSize: 4 }),
  Object.freeze({ key: 'light', name: 'aLight', itemSize: 2 }),
  Object.freeze({ key: 'flags', name: 'aFlags', itemSize: 4 }),
]);
/** Şehir meshlerinde (opts.city) ek öznitelik: aCity Uint8×4, NORMALIZED (shader 0..1). Bit düzeni: sim/cityData.js. */
export const CITY_ATTRIBUTE = Object.freeze({
  key: 'city', name: 'aCity', itemSize: 4, normalized: true, type: 'uint8',
});
export const CITY_MESH_ATTRIBUTES = Object.freeze(MESH_ATTRIBUTES.concat([CITY_ATTRIBUTE]));
/** opts.city'ye göre öznitelik listesi. */
export function meshAttributes(city) {
  return city ? CITY_MESH_ATTRIBUTES : MESH_ATTRIBUTES;
}
export const PASS_NAMES = Object.freeze(['opaque', 'cutout', 'transparent']);

const DEFAULT_LAYOUT = computeAtlasLayout({ tileCount: TILE_COUNT, tileSize: 32 });
const uvCache = new WeakMap();

/** Çeşitli atlasUV biçimlerini düz Float32Array tabloya çevirir. */
export function resolveUvTable(atlasUV) {
  if (!atlasUV) return DEFAULT_LAYOUT.uvTable;
  if (atlasUV instanceof Float32Array) return atlasUV;
  if (typeof atlasUV === 'object' && atlasUV.uvTable) return atlasUV.uvTable;
  let t = uvCache.get(atlasUV);
  if (t) return t;
  t = new Float32Array(TILE_COUNT * 4);
  if (typeof atlasUV === 'function') {
    for (let i = 0; i < TILE_COUNT; i++) {
      const r = atlasUV(i);
      t[i * 4] = r[0];
      t[i * 4 + 1] = r[1];
      t[i * 4 + 2] = r[2];
      t[i * 4 + 3] = r[3];
    }
  } else if (Array.isArray(atlasUV)) {
    for (let i = 0; i < t.length; i++) t[i] = atlasUV[i];
  } else {
    throw new TypeError('meshChunk: atlasUV işlev, Float32Array ya da {uvTable} olmalı');
  }
  uvCache.set(atlasUV, t);
  return t;
}

const grid = new Array(9).fill(null);

/** Karanlık birleştirmeye uygun bloklar: opak geçiş, küp, ışık yaymayan. */
const CAN_MERGE = new Uint8Array(256);
for (let id = 1; id < BLOCKS.length; id++) {
  const r = BLOCKS[id];
  if (r && HAS[id] === 1 && PASS_LUT[id] === 0 && SHAPE_LUT[id] === SHAPE_ID.CUBE && !(r.emission > 0)) CAN_MERGE[id] = 1;
}
const DARK_TILE = BLOCKS[B.STONE] ? BLOCKS[B.STONE].tiles.side : 0;
/** Çok uzak chunk'ta atlanan küçük bitkiler (8 üçgen/adet; 64+ blokta birkaç piksel). Parlayan mantar/çalı/sarmaşık kalır. */
const FAR_FLORA = new Uint8Array(256);
FAR_FLORA[B.TALL_GRASS] = 1;
FAR_FLORA[B.FLOWER_RED] = 1;
FAR_FLORA[B.FLOWER_YELLOW] = 1;

function finishPass(p, city) {
  const vc = p.vc;
  const ic = p.ic;
  const IndexArray = vc <= 65535 ? Uint16Array : Uint32Array;
  const index = new IndexArray(ic);
  for (let i = 0; i < ic; i++) index[i] = p.idx[i];
  const out = {
    pos: p.pos.slice(0, vc * 3),
    normal: p.nrm.slice(0, vc * 3),
    uv: p.uv.slice(0, vc * 2),
    color: p.col.slice(0, vc * 4),
    light: p.lit.slice(0, vc * 2),
    flags: p.flg.slice(0, vc * 4),
    index,
    vertexCount: vc,
    indexCount: ic,
  };
  if (city) out.city = p.cty.slice(0, vc * 4);
  return out;
}

/** ArrayBuffer listesi (postMessage transfer). */
export function collectTransferables(mesh) {
  const out = [];
  PASS_NAMES.forEach((k) => {
    const p = mesh[k];
    if (!p) return;
    out.push(p.pos.buffer, p.normal.buffer, p.uv.buffer, p.color.buffer, p.light.buffer, p.flags.buffer, p.index.buffer);
    if (p.city) out.push(p.city.buffer);
  });
  return out;
}

/** Boş mesh (hiç yüz yok). */
export function isEmptyMesh(mesh) {
  return mesh.opaque.vertexCount + mesh.cutout.vertexCount + mesh.transparent.vertexCount === 0;
}

/**
 * Chunk'ı mesh'ler. Bkz. dosya başı.
 */
export function meshChunk(chunk, neighbors, atlasUV, opts) {
  const o = opts || {};
  const nb = neighbors || {};
  grid[0] = nb.nw || null;
  grid[1] = nb.n || null;
  grid[2] = nb.ne || null;
  grid[3] = nb.w || null;
  grid[4] = chunk;
  grid[5] = nb.e || null;
  grid[6] = nb.sw || null;
  grid[7] = nb.s || null;
  grid[8] = nb.se || null;
  S.uvT = resolveUvTable(atlasUV);
  S.smooth = o.smoothLight !== false;
  const aoOn = o.ao !== false;
  const curve = o.aoCurve;
  if (curve && curve.length >= 4) {
    for (let i = 0; i < 4; i++) S.aoCurve[i] = curve[i];
  } else {
    S.aoCurve[0] = 0.46;
    S.aoCurve[1] = 0.64;
    S.aoCurve[2] = 0.82;
    S.aoCurve[3] = 1;
  }
  const derivedStairs = o.stairs !== 'fixed';
  const underside = o.waterUnderside !== false;
  const randomize = o.randomize !== false;
  const mergeDark = o.mergeDark === true;
  const darkFar = o.darkLod === 1;
  const farFlora = o.farFlora === true;
  const cityOn = o.city === true;
  let s0;
  let ns;
  if (o.band) {
    s0 = o.band.s0 | 0;
    ns = o.band.ns | 0;
  } else {
    s0 = (0 - (chunk.yMin | 0)) >> 4;
    ns = 8;
  }
  if (ns < 1 || ns > MAX_BAND_SECTIONS) throw new RangeError('meshChunk: band en çok ' + MAX_BAND_SECTIONS + ' kesit olabilir');
  const baseY = (chunk.yMin | 0) + s0 * 16;
  S.baseY = baseY;
  resetDark();
  const b = S.bounds;
  b[0] = 1e9;
  b[1] = 1e9;
  b[2] = 1e9;
  b[3] = -1e9;
  b[4] = -1e9;
  b[5] = -1e9;
  resetPasses(cityOn);
  S.city = cityOn;
  const maxY = fillPadded(grid, o.nullNeighbor || 'replicate', s0, ns);
  S.cHue = cityOn ? cityPrepare(P, maxY) : false;
  buildTintGrid(grid, chunk, o.tints || null);
  if (mergeDark && darkFar) plugDarkAir(maxY);
  const wx0 = chunk.cx * 16;
  const wz0 = chunk.cz * 16;
  for (let by = 0; by <= maxY; by++) {
    for (let bz = 0; bz < 16; bz++) {
      for (let bx = 0; bx < 16; bx++) {
        const ci = ((by + 1) * 18 + (bz + 1)) * 18 + bx + 1;
        const id = P[ci];
        if (id === 0 || HAS[id] === 0) continue;
        const shape = SHAPE_LUT[id];
        const row = id * 256;
        if (shape === SHAPE_ID.CUBE) {
          // hızlı elek: tüm yüzler gizliyse atla
          if (CULL[row + P[ci + 1]] && CULL[row + P[ci - 1]] && CULL[row + P[ci + SY]] && CULL[row + P[ci - SY]]
            && CULL[row + P[ci + SZ]] && CULL[row + P[ci - SZ]]) continue;
        }
        const rec = BLOCKS[id];
        S.pass = passes[PASS_LUT[id]];
        S.ci = ci;
        S.id = id;
        S.bx = bx;
        S.by = by;
        S.bz = bz;
        S.tint = TINT_LUT[id];
        S.tintTop = NOTOP_TINT[id] === 1;
        S.aoOn = aoOn && PASS_LUT[id] !== 2;
        S.fbits = (WIND_LUT[id] & FLAG.WIND_MASK) | (KIND_LUT[id] << FLAG.KIND_SHIFT) | (FLOW_LUT[id] ? FLAG.FLOW : 0);
        S.defA = WIND_LUT[id] === 1 ? 1 : 0;
        S.region = null;
        S.vp = null;
        S.jit = 1;
        S.rot = 0;
        S.mir = 0;
        const wx = wx0 + bx;
        const wz = wz0 + bz;
        if (randomize && NATURAL_LUT[id]) {
          const h = hash3(wx, by + baseY, wz);
          S.rot = h & 3;
          S.mir = (h >>> 2) & 1;
          S.jit = 0.975 + (((h >>> 4) & 15) / 15) * 0.05;
        } else if (randomize && WIND_LUT[id] === 1) {
          const h = hash3(wx, by + baseY, wz);
          S.mir = h & 1;
          S.jit = 0.94 + (((h >>> 4) & 15) / 15) * 0.1;
        }
        if (cityOn) {
          const cm = CITY_MODE_LUT[id];
          S.cMode = cm;
          if (cm === CITY_MODE.WINDOW) {
            S.cWin = windowGroup(wx, by + baseY, wz);
            S.mir = hash3(wx, by + baseY, wz) & 1; // iki iç mekân varyantı (yatay ayna)
          } else if (CITY_ROTATE_LUT[id] === 1) {
            // asfalt/kaldırım üst yüzü: 8 yönelim (döndür + ayna) → döşeme ızgarası tekrarı görünmez
            const h = hash3(wx, by + baseY, wz);
            S.rot = h & 3;
            S.mir = (h >>> 2) & 1;
          }
        }
        switch (shape) {
          case SHAPE_ID.CUBE: {
            for (let d = 0; d < 6; d++) {
              const nbi = ci + DN[d];
              if (CULL[row + P[nbi]]) continue;
              if (mergeDark && P[nbi] === 0 && CAN_MERGE[id] === 1 && (L[nbi] >> 4) === 0) {
                const dc = darkFaceCode(ci, d, darkFar);
                if (dc >= 0) {
                  markDark(d, bx, by, bz, dc);
                  continue;
                }
              }
              const tile = d === 2 ? rec.tiles.top : d === 3 ? rec.tiles.bottom : rec.tiles.side;
              emitFace(d, 0, 0, 0, 1, 1, 1, tile);
            }
            break;
          }
          case SHAPE_ID.LIQUID:
            emitLiquid(id, underside);
            break;
          case SHAPE_ID.BOX:
            emitCollisionBox(id);
            break;
          case SHAPE_ID.PLATE:
            emitPlate(id);
            break;
          case SHAPE_ID.STAIR: {
            const k = derivedStairs
              ? stairFacing(P[ci - SZ], P[ci + 1], P[ci + SZ], P[ci - 1])
              : 0;
            emitStair(id, k);
            break;
          }
          case SHAPE_ID.FENCE:
            emitFence(id);
            break;
          case SHAPE_ID.CROSS:
            if (!(farFlora && FAR_FLORA[id] === 1)) emitCross(id, wx, by + baseY, wz);
            break;
          case SHAPE_ID.VINE:
            emitVine(id, wx, by + baseY, wz);
            break;
          case SHAPE_ID.TORCH:
            emitTorch(id);
            break;
          case SHAPE_ID.LANTERN:
            emitLantern(id);
            break;
          default:
            break;
        }
      }
    }
  }
  if (cityOn) S.cMode = 0;
  if (mergeDark && darkCount() > 0) flushDark(DARK_TILE, maxY);
  const opaque = finishPass(passes[0], cityOn);
  const cutout = finishPass(passes[1], cityOn);
  const transparent = finishPass(passes[2], cityOn);
  S.city = false;
  const empty = opaque.vertexCount + cutout.vertexCount + transparent.vertexCount === 0;
  const min = empty ? [0, 0, 0] : [b[0], b[1], b[2]];
  const max = empty ? [0, 0, 0] : [b[3], b[4], b[5]];
  const cxm = (min[0] + max[0]) / 2;
  const cym = (min[1] + max[1]) / 2;
  const czm = (min[2] + max[2]) / 2;
  const dx = max[0] - cxm;
  const dy = max[1] - cym;
  const dz = max[2] - czm;
  return {
    baseY,
    opaque,
    cutout,
    transparent,
    bounds: {
      min,
      max,
      center: [cxm, cym, czm],
      radius: Math.sqrt(dx * dx + dy * dy + dz * dz),
    },
    stats: {
      faces: passes[0].faces + passes[1].faces + passes[2].faces,
      vertices: opaque.vertexCount + cutout.vertexCount + transparent.vertexCount,
      triangles: (opaque.indexCount + cutout.indexCount + transparent.indexCount) / 3,
    },
  };
}

