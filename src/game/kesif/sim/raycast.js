/*
 * KEŞİF sim — voxel ışın izleme (saf; DOM/three yok, worker-güvenli).
 *
 *  - raycastBlocks   Amanatides–Woo DDA. Küp olmayan şekillerde (slab/merdiven/çit/kapı/meşale/çiçek/plaka) blok içi
 *                    seçim kutularını gerçekten keser. Çarpışma kutusu olmayan ama hedeflenebilir bloklar
 *                    (çiçek, meşale, kol, plaka) için küçük seçim kutuları vardır; portal gibi hayalet bloklar atlanır.
 *  - rayAABB         köşegen-sıfır güvenli kutu kesişimi (dilim yöntemi).
 *  - raycastEntities {x,y,z,w,h[,d]} varlıkları (x,z merkez, y ayak) keser.
 *  - blockSelectionBoxes, hasLineOfSight, pickTarget yardımcıları.
 * Kare başı ayırma yok: sonuç için `opts.out` (createRayHit()) verilebilir; verilmezse yeni nesne döner.
 * Dünya: getBlock(x,y,z) → kimlik | null (null = üretilmedi → ışın durur, isabet yok).
 */
import { BLOCKS, CUBE_LUT } from './blocks.js';
import { worldMaxY, worldMinY } from './constants.js';

export const REACH_DEFAULT = 5;

/* ------------------------------------------------------------------------------------------------
 * Seçim kutuları
 * ---------------------------------------------------------------------------------------------- */
const NO_BOXES = [];
const FULL_LIST = [[0, 0, 0, 1, 1, 1]];
const SHAPE_SELECT = {
  cross: [[0.1, 0, 0.1, 0.9, 0.9, 0.9]],
  torch: [[0.375, 0, 0.375, 0.625, 0.75, 0.625]],
  plate: [[0.0625, 0, 0.0625, 0.9375, 0.125, 0.9375]],
};
const selCache = new Array(256).fill(null);
const tallLut = new Uint8Array(256);

function buildSelection(id) {
  const b = BLOCKS[id];
  if (!b || id === 0) return NO_BOXES;
  if (b.collision.length > 0) return b.collision;
  if (b.liquid) return FULL_LIST;
  return SHAPE_SELECT[b.shape] || NO_BOXES;
}
for (let id = 1; id < BLOCKS.length; id++) {
  const bs = buildSelection(id);
  selCache[id] = bs;
  for (let i = 0; i < bs.length; i++) if (bs[i][4] > 1) tallLut[id] = 1;
}

/** Hedeflenebilir blok seçim kutuları (blok-yerel 0..1; çit 1,5 yüksek olabilir). Çerçeve çizimi için de kullanılır. */
export function blockSelectionBoxes(id) {
  return (id > 0 && selCache[id]) || NO_BOXES;
}

/* ------------------------------------------------------------------------------------------------
 * rayAABB
 * ---------------------------------------------------------------------------------------------- */
/**
 * Işın (o + t*d, d birim olmak zorunda değil; t d'nin ölçeğinde) ile kutu kesişimi.
 * → giriş t ≥ 0 (başlangıç kutunun içindeyse 0) ya da -1 (kaçırdı). out verilirse {nx,ny,nz} yüz normali yazılır.
 */
export function rayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, out) {
  let tNear = -Infinity;
  let tFar = Infinity;
  let axis = -1;
  let sign = 0;
  // X
  if (dx === 0) {
    if (ox < minX || ox > maxX) return -1;
  } else {
    let t1 = (minX - ox) / dx;
    let t2 = (maxX - ox) / dx;
    let s = -1;
    if (t1 > t2) {
      const t = t1; t1 = t2; t2 = t; s = 1;
    }
    if (t1 > tNear) { tNear = t1; axis = 0; sign = s; }
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return -1;
  }
  // Y
  if (dy === 0) {
    if (oy < minY || oy > maxY) return -1;
  } else {
    let t1 = (minY - oy) / dy;
    let t2 = (maxY - oy) / dy;
    let s = -1;
    if (t1 > t2) {
      const t = t1; t1 = t2; t2 = t; s = 1;
    }
    if (t1 > tNear) { tNear = t1; axis = 1; sign = s; }
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return -1;
  }
  // Z
  if (dz === 0) {
    if (oz < minZ || oz > maxZ) return -1;
  } else {
    let t1 = (minZ - oz) / dz;
    let t2 = (maxZ - oz) / dz;
    let s = -1;
    if (t1 > t2) {
      const t = t1; t1 = t2; t2 = t; s = 1;
    }
    if (t1 > tNear) { tNear = t1; axis = 2; sign = s; }
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return -1;
  }
  if (tFar < 0) return -1;
  if (tNear < 0) {
    // başlangıç kutunun içinde: yüzü baskın eksenin tersi say
    if (out) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const az = Math.abs(dz);
      out.nx = 0; out.ny = 0; out.nz = 0;
      if (ax >= ay && ax >= az) out.nx = dx > 0 ? -1 : 1;
      else if (ay >= az) out.ny = dy > 0 ? -1 : 1;
      else out.nz = dz > 0 ? -1 : 1;
    }
    return 0;
  }
  if (out) {
    out.nx = axis === 0 ? sign : 0;
    out.ny = axis === 1 ? sign : 0;
    out.nz = axis === 2 ? sign : 0;
  }
  return tNear;
}

/* ------------------------------------------------------------------------------------------------
 * Blok ışını
 * ---------------------------------------------------------------------------------------------- */
export function createRayHit() {
  return {
    x: 0, y: 0, z: 0, id: 0, t: 0, replaceable: false,
    face: { nx: 0, ny: 0, nz: 0 },
    point: { x: 0, y: 0, z: 0 },
    placeAt: { x: 0, y: 0, z: 0 },
  };
}

const _f = { nx: 0, ny: 0, nz: 0 };
let _bt = 0;
let _bnx = 0;
let _bny = 0;
let _bnz = 0;
let _bid = 0;
let _by = 0;

/**
 * Hücredeki (ve çitin yukarı taşan parçası için altındaki) kutuları keser; en yakın isabeti _b* içine yazar.
 * entryT: ışının hücreye girdiği t; lastAxis/lastSign: giriş yüzü (küp hızlı yol).
 */
function testCell(world, id, x, y, z, ox, oy, oz, dx, dy, dz, entryT, entryAxis, entrySign, solidOnly, hitLiquid) {
  _bt = Infinity;
  const b = BLOCKS[id];
  if (b && id !== 0) {
    if (b.liquid && !hitLiquid) {
      // geç
    } else if (CUBE_LUT[id] === 1 || (b.liquid && hitLiquid)) {
      _bt = entryT;
      _bnx = entryAxis === 0 ? entrySign : 0;
      _bny = entryAxis === 1 ? entrySign : 0;
      _bnz = entryAxis === 2 ? entrySign : 0;
      if (entryAxis < 0) {
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        const az = Math.abs(dz);
        _bnx = 0; _bny = 0; _bnz = 0;
        if (ax >= ay && ax >= az) _bnx = dx > 0 ? -1 : 1;
        else if (ay >= az) _bny = dy > 0 ? -1 : 1;
        else _bnz = dz > 0 ? -1 : 1;
      }
      _bid = id;
      _by = y;
    } else {
      const boxes = solidOnly ? b.collision : selCache[id];
      for (let i = 0; i < boxes.length; i++) {
        const c = boxes[i];
        const t = rayAABB(ox, oy, oz, dx, dy, dz, x + c[0], y + c[1], z + c[2], x + c[3], y + c[4], z + c[5], _f);
        if (t >= 0 && t < _bt) {
          _bt = t; _bnx = _f.nx; _bny = _f.ny; _bnz = _f.nz; _bid = id; _by = y;
        }
      }
    }
  }
  // Çit gibi 1'den yüksek kutular: alt hücrenin üst parçası bu hücrede kalır.
  if (y > 0) {
    const bid = world.getBlock(x, y - 1, z);
    if (bid && tallLut[bid]) {
      const boxes = solidOnly ? BLOCKS[bid].collision : selCache[bid];
      for (let i = 0; i < boxes.length; i++) {
        const c = boxes[i];
        if (c[4] <= 1) continue;
        const t = rayAABB(ox, oy, oz, dx, dy, dz, x + c[0], y - 1 + c[1], z + c[2], x + c[3], y - 1 + c[4], z + c[5], _f);
        if (t >= 0 && t < _bt) {
          _bt = t; _bnx = _f.nx; _bny = _f.ny; _bnz = _f.nz; _bid = bid; _by = y - 1;
        }
      }
    }
  }
  return _bt;
}

/**
 * Voxel DDA. origin {x,y,z}, dir {x,y,z} (normalleştirilir), maxDist blok.
 * opts: {hitLiquid=false, solidOnly=false (yalnız çarpışma kutuları: görüş hattı), out}
 * → {x,y,z,id,face:{nx,ny,nz},t,point,placeAt,replaceable} | null.
 * placeAt: yerleştirilecek hücre (yüzün dışı; yer değiştirilebilir ot/çiçekte isabet hücresinin kendisi).
 */
export function raycastBlocks(world, origin, dir, maxDist, opts) {
  const o = opts || null;
  const hitLiquid = !!(o && o.hitLiquid);
  const solidOnly = !!(o && o.solidOnly);
  let dx = dir.x;
  let dy = dir.y;
  let dz = dir.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (!(len > 1e-9)) return null;
  dx /= len; dy /= len; dz /= len;
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const max = maxDist === undefined ? REACH_DEFAULT : maxDist;

  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = dx > 0 ? (x + 1 - ox) * tdx : dx < 0 ? (ox - x) * tdx : Infinity;
  let tmy = dy > 0 ? (y + 1 - oy) * tdy : dy < 0 ? (oy - y) * tdy : Infinity;
  let tmz = dz > 0 ? (z + 1 - oz) * tdz : dz < 0 ? (oz - z) * tdz : Infinity;

  let entryT = 0;
  let entryAxis = -1;
  let entrySign = 0;
  const maxSteps = Math.ceil(max * 3) + 4;
  const wMin = worldMinY(world);
  const wMax = worldMaxY(world);
  for (let step = 0; step <= maxSteps; step++) {
    let id = 0;
    if (y >= wMin && y <= wMax) {
      id = world.getBlock(x, y, z);
      if (id === null || id === undefined) return null;
    }
    // Üstteki çit parçası için alt hücre de bakılır (y-1 okuma testCell içinde)
    const t = testCell(world, id, x, y, z, ox, oy, oz, dx, dy, dz, entryT, entryAxis, entrySign, solidOnly, hitLiquid);
    if (t <= max && t !== Infinity) {
      const hit = (o && o.out) || createRayHit();
      const hb = BLOCKS[_bid];
      const hy = _by;
      hit.x = x;
      hit.y = hy;
      hit.z = z;
      hit.id = _bid;
      hit.t = t;
      hit.face.nx = _bnx; hit.face.ny = _bny; hit.face.nz = _bnz;
      hit.point.x = ox + dx * t; hit.point.y = oy + dy * t; hit.point.z = oz + dz * t;
      hit.replaceable = !!hb && hb.shape === 'cross' && hb.hardness === 0;
      if (hit.replaceable) {
        hit.placeAt.x = x; hit.placeAt.y = hy; hit.placeAt.z = z;
      } else {
        hit.placeAt.x = x + _bnx; hit.placeAt.y = hy + _bny; hit.placeAt.z = z + _bnz;
      }
      return hit;
    }
    // sonraki hücre
    if (tmx < tmy && tmx < tmz) {
      if (tmx > max) break;
      x += sx; entryT = tmx; tmx += tdx; entryAxis = 0; entrySign = -sx;
    } else if (tmy < tmz) {
      if (tmy > max) break;
      y += sy; entryT = tmy; tmy += tdy; entryAxis = 1; entrySign = -sy;
    } else {
      if (tmz > max) break;
      z += sz; entryT = tmz; tmz += tdz; entryAxis = 2; entrySign = -sz;
    }
  }
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Varlık ışını
 * ---------------------------------------------------------------------------------------------- */
const _ef = { nx: 0, ny: 0, nz: 0 };

/**
 * entities: dizi (ya da values() olan koleksiyon) — {x,y,z,w,h[,d]}: x,z merkez, y ayak. dir normalleştirilir.
 * opts: {filter(e)→bool, pad=0 (kutuyu şişirir: dokunmatik hedef yardımı), out}
 * → {entity, t, point:{x,y,z}, face:{nx,ny,nz}} | null  (en yakın)
 */
export function raycastEntities(entities, origin, dir, maxDist, opts) {
  const o = opts || null;
  const filter = o && o.filter;
  const pad = (o && o.pad) || 0;
  let dx = dir.x;
  let dy = dir.y;
  let dz = dir.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (!(len > 1e-9) || !entities) return null;
  dx /= len; dy /= len; dz /= len;
  const max = maxDist === undefined ? REACH_DEFAULT : maxDist;
  let best = null;
  let bt = max;
  let bnx = 0;
  let bny = 0;
  let bnz = 0;
  const visit = (e) => {
    if (!e || (filter && !filter(e))) return;
    const hw = (e.w || 0.6) * 0.5 + pad;
    const hd = (e.d !== undefined ? e.d : (e.w || 0.6)) * 0.5 + pad;
    const t = rayAABB(origin.x, origin.y, origin.z, dx, dy, dz,
      e.x - hw, e.y - pad, e.z - hd, e.x + hw, e.y + (e.h || 1) + pad, e.z + hd, _ef);
    if (t >= 0 && t <= bt) {
      bt = t; best = e; bnx = _ef.nx; bny = _ef.ny; bnz = _ef.nz;
    }
  };
  if (Array.isArray(entities)) {
    for (let i = 0; i < entities.length; i++) visit(entities[i]);
  } else if (typeof entities.values === 'function') {
    for (const e of entities.values()) visit(e);
  } else {
    return null;
  }
  if (!best) return null;
  const hit = (o && o.out) || { entity: null, t: 0, point: { x: 0, y: 0, z: 0 }, face: { nx: 0, ny: 0, nz: 0 } };
  hit.entity = best;
  hit.t = bt;
  hit.point.x = origin.x + dx * bt; hit.point.y = origin.y + dy * bt; hit.point.z = origin.z + dz * bt;
  hit.face.nx = bnx; hit.face.ny = bny; hit.face.nz = bnz;
  return hit;
}

/* ------------------------------------------------------------------------------------------------
 * Yardımcılar
 * ---------------------------------------------------------------------------------------------- */
const _lo = { x: 0, y: 0, z: 0 };
const _ld = { x: 0, y: 0, z: 0 };
const _lh = createRayHit();
const _losOpts = { solidOnly: true, out: _lh };

/** İki nokta arası katı engel yok mu? (mob görüş hattı, ok/ışın ön kontrolü) Üretilmemiş chunk engel sayılmaz. */
export function hasLineOfSight(world, ax, ay, az, bx, by, bz) {
  _ld.x = bx - ax; _ld.y = by - ay; _ld.z = bz - az;
  const d = Math.sqrt(_ld.x * _ld.x + _ld.y * _ld.y + _ld.z * _ld.z);
  if (d < 1e-6) return true;
  _lo.x = ax; _lo.y = ay; _lo.z = az;
  return raycastBlocks(world, _lo, _ld, d, _losOpts) === null;
}

const _pb = { hitLiquid: false, solidOnly: false, out: undefined };
const _pe = { filter: undefined, pad: 0, out: undefined };
const _pick = { kind: null, block: null, entity: null };

/**
 * Nişan hedefi: blok ve varlıktan yakın olanı. opts: {hitLiquid, filter, pad, blockOut, entityOut}.
 * → {kind:'block'|'entity'|null, block, entity} (paylaşılan nesne; hemen oku). Blok varlığın ÖNÜNDEYSE varlık yok sayılır.
 */
export function pickTarget(world, entities, origin, dir, maxDist, opts) {
  const o = opts || {};
  _pb.hitLiquid = !!o.hitLiquid;
  _pb.out = o.blockOut;
  const blockHit = raycastBlocks(world, origin, dir, maxDist, _pb);
  _pe.filter = o.filter;
  _pe.pad = o.pad || 0;
  _pe.out = o.entityOut;
  const lim = blockHit ? blockHit.t : (maxDist === undefined ? REACH_DEFAULT : maxDist);
  const entHit = entities ? raycastEntities(entities, origin, dir, lim, _pe) : null;
  _pick.block = blockHit;
  _pick.entity = entHit;
  _pick.kind = entHit ? 'entity' : blockHit ? 'block' : null;
  return _pick;
}
