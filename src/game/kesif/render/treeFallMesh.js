/*
 * KEŞİF render — devrilen ağaç görseli. Kaldırılacak ağaç blokları (kütük + yaprak: hepsi küp) kendi küçük küp mesher'ımızla tek bir
 * birleştirilmiş geometriye çevrilir; dünyanın atlas malzemeleri (opak/kesik) AYNEN kullanılır (aynı doku, biyom tonu, ışık).
 * Chunk mesher'ının iç yerleşimine (kesit/indeks düzeni) BAĞIMLI DEĞİLDİR: yalnızca öznitelik adları (MESH_ATTRIBUTES), atlas uv tablosu
 * ve BIOME_TINTS ortak sözleşmedir.
 *
 *   meshTreeBlocks(cells, hinge, sample, uvTable) → {opaque, cutout, transparent, bounds, stats}   (saf; three yok → test edilir)
 *       cells   [{x,y,z,id}]    hinge {x,y,z} (köşe konumları menteşeye göre yazılır)
 *       sample  {light(x,y,z)→bayt (üst 4 bit gökyüzü, alt 4 bit blok), biome(x,z)→id}
 *   createFallObject(THREE, mesh, materials, hinge) → { group, tris, dispose() }
 *       group.position = menteşe → group.quaternion döndürmek ağacı menteşeden yatırır.
 *
 * Yüz yönü/doku düzeni mesherCore.emitFace ile aynıdır (0:+X 1:−X 2:+Y 3:−Y 4:+Z 5:−Z). Komşu opaksa yüz çizilmez; aynı yaprak türleri
 * arası (cullSame) çizilmez. Köşe AO'su yalnız ağaç hücrelerinden (3 komşu kesişimi) hesaplanır.
 */
import { BLOCKS } from '../sim/blocks.js';
import { BIOME_TINTS } from './mesherCore.js';
import { MESH_ATTRIBUTES, PASS_NAMES } from './mesher.js';
import { createChunkGeometry } from './materials.js';

const NAX = [0, 0, 1, 1, 2, 2];
const NSG = [1, -1, 1, -1, 1, -1];
const UAX = [2, 2, 0, 0, 0, 0];
const USG = [-1, 1, 1, 1, 1, -1];
const VAX = [1, 1, 2, 2, 1, 1];
const VSG = [1, 1, -1, 1, 1, 1];
const SU = [0, 1, 1, 0];
const SV = [0, 0, 1, 1];
const NRM = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const DIR = NRM;
const AO_CURVE = [0.46, 0.64, 0.82, 1];

function srgb2lin(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function hexLin(h) {
  return [srgb2lin(((h >> 16) & 255) / 255), srgb2lin(((h >> 8) & 255) / 255), srgb2lin((h & 255) / 255)];
}

const key = (x, y, z) => x + ',' + y + ',' + z;

function newPass() {
  return {
    pos: [], nrm: [], uv: [], col: [], lit: [], flg: [], idx: [], vc: 0,
  };
}

function finish(p) {
  const IndexArray = p.vc <= 65535 ? Uint16Array : Uint32Array;
  return {
    pos: new Float32Array(p.pos),
    normal: new Float32Array(p.nrm),
    uv: new Float32Array(p.uv),
    color: new Float32Array(p.col),
    light: new Float32Array(p.lit),
    flags: new Float32Array(p.flg),
    index: new IndexArray(p.idx),
    vertexCount: p.vc,
    indexCount: p.idx.length,
  };
}

export function meshTreeBlocks(cells, hinge, sample, uvTable) {
  const occ = new Map();
  for (let i = 0; i < cells.length; i++) occ.set(key(cells[i].x, cells[i].y, cells[i].z), cells[i].id);
  const passes = [newPass(), newPass(), newPass()];
  const tintCache = new Map();
  const foliage = (biome) => {
    let t = tintCache.get(biome);
    if (!t) {
      const arr = BIOME_TINTS.foliage;
      t = hexLin(arr[biome] !== undefined ? arr[biome] : arr[0]);
      tintCache.set(biome, t);
    }
    return t;
  };
  const mn = [1e9, 1e9, 1e9];
  const mx = [-1e9, -1e9, -1e9];
  let faces = 0;
  const idsAt = (x, y, z) => occ.get(key(x, y, z)) || 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const rec = BLOCKS[c.id];
    if (!rec || !rec.tiles) continue;
    const pass = rec.layer === 'transparent' ? 2 : rec.layer === 'cutout' ? 1 : 0;
    const P = passes[pass];
    // ışık: hücrenin ve komşu hücrelerin en parlağı (opak hücre ışık tutmaz)
    let sk = 0;
    let bk = 0;
    for (let d = 0; d < 6; d++) {
      const v = sample.light(c.x + DIR[d][0], c.y + DIR[d][1], c.z + DIR[d][2]);
      if (v >> 4 > sk) sk = v >> 4;
      if ((v & 15) > bk) bk = v & 15;
    }
    const own = sample.light(c.x, c.y, c.z);
    if (own >> 4 > sk) sk = own >> 4;
    if ((own & 15) > bk) bk = own & 15;
    const tint = rec.tint === 'foliage' ? foliage(sample.biome(c.x, c.z)) : null;
    for (let d = 0; d < 6; d++) {
      const nid = idsAt(c.x + DIR[d][0], c.y + DIR[d][1], c.z + DIR[d][2]);
      if (nid) {
        const nr = BLOCKS[nid];
        if (nr && nr.opaque) continue;
        if (rec.cullSame && nid === c.id) continue;
      }
      const tile = d === 2 ? rec.tiles.top : d === 3 ? rec.tiles.bottom : rec.tiles.side;
      const o4 = tile * 4;
      const tu0 = uvTable[o4];
      const tv0 = uvTable[o4 + 1];
      const du = uvTable[o4 + 2] - tu0;
      const dv = uvTable[o4 + 3] - tv0;
      const nax = NAX[d];
      const ua = UAX[d];
      const va = VAX[d];
      const us = USG[d];
      const vs = VSG[d];
      const base = P.vc;
      const aoK = [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const su = SU[k];
        const sv = SV[k];
        const cp = [0, 0, 0];
        cp[nax] = NSG[d] > 0 ? 1 : 0;
        cp[ua] = us > 0 ? (su ? 1 : 0) : (su ? 0 : 1);
        cp[va] = vs > 0 ? (sv ? 1 : 0) : (sv ? 0 : 1);
        const ut = us > 0 ? cp[ua] : 1 - cp[ua];
        const vt = vs > 0 ? cp[va] : 1 - cp[va];
        // AO: yüzün önündeki hücrede, bu köşeye komşu iki yan ve çapraz hücre
        const sx = su ? 1 : -1;
        const sy = sv ? 1 : -1;
        const ax = [0, 0, 0];
        const bx = [0, 0, 0];
        ax[ua] = sx * (us > 0 ? 1 : -1);
        bx[va] = sy * (vs > 0 ? 1 : -1);
        const fx = c.x + DIR[d][0];
        const fy = c.y + DIR[d][1];
        const fz = c.z + DIR[d][2];
        const o1 = idsAt(fx + ax[0], fy + ax[1], fz + ax[2]) ? 1 : 0;
        const o2 = idsAt(fx + bx[0], fy + bx[1], fz + bx[2]) ? 1 : 0;
        const oc = idsAt(fx + ax[0] + bx[0], fy + ax[1] + bx[1], fz + ax[2] + bx[2]) ? 1 : 0;
        const ao = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
        const aoc = AO_CURVE[ao];
        aoK[k] = aoc * (0.35 + (0.65 * Math.max(sk, bk)) / 15);
        const px = c.x - hinge.x + cp[0];
        const py = c.y - hinge.y + cp[1];
        const pz = c.z - hinge.z + cp[2];
        P.pos.push(px, py, pz);
        P.nrm.push(NRM[d][0], NRM[d][1], NRM[d][2]);
        P.uv.push(tu0 + du * ut, tv0 + dv * vt);
        const r = tint ? tint[0] : 1;
        const g = tint ? tint[1] : 1;
        const b = tint ? tint[2] : 1;
        P.col.push(r * aoc, g * aoc, b * aoc, aoc);
        P.lit.push(sk / 15, bk / 15);
        P.flg.push(0, 0, 0, 0);
        if (px < mn[0]) mn[0] = px;
        if (py < mn[1]) mn[1] = py;
        if (pz < mn[2]) mn[2] = pz;
        if (px > mx[0]) mx[0] = px;
        if (py > mx[1]) mx[1] = py;
        if (pz > mx[2]) mx[2] = pz;
      }
      if (aoK[0] + aoK[2] > aoK[1] + aoK[3]) P.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else P.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      P.vc += 4;
      faces++;
    }
  }
  const opaque = finish(passes[0]);
  const cutout = finish(passes[1]);
  const transparent = finish(passes[2]);
  const empty = faces === 0;
  const min = empty ? [0, 0, 0] : mn;
  const max = empty ? [0, 0, 0] : mx;
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const rr = Math.sqrt((max[0] - center[0]) ** 2 + (max[1] - center[1]) ** 2 + (max[2] - center[2]) ** 2);
  return {
    opaque,
    cutout,
    transparent,
    bounds: {
      min, max, center, radius: rr,
    },
    stats: { faces, triangles: (opaque.indexCount + cutout.indexCount + transparent.indexCount) / 3 },
  };
}

const ORDER = [0, 1, 101];

export function createFallObject(THREE, mesh, materials, hinge) {
  const group = new THREE.Group();
  group.name = 'kesif-agac-devrilme';
  group.position.set(hinge.x, hinge.y, hinge.z);
  const mats = [materials.opaque, materials.cutout, materials.transparent];
  const geos = [];
  for (let k = 0; k < 3; k++) {
    const pass = mesh[PASS_NAMES[k]];
    const geo = pass && pass.vertexCount > 0 ? createChunkGeometry(THREE, pass, mesh.bounds) : null;
    if (!geo) continue;
    geos.push(geo);
    const m = new THREE.Mesh(geo, mats[k]);
    m.frustumCulled = false;
    m.renderOrder = ORDER[k];
    group.add(m);
  }
  return {
    group,
    tris: mesh.stats.triangles,
    dispose() {
      if (group.parent) group.parent.remove(group);
      for (let i = 0; i < geos.length; i++) geos[i].dispose();
      geos.length = 0;
      group.clear();
    },
  };
}

export { MESH_ATTRIBUTES };
