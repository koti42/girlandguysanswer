/*
 * KEŞİF sim/city/interior — interiors_b testleri için YARDIMCILAR (yalnız test dosyaları ve galeri betikleri içe aktarır).
 *  asciiPlan(interior, frame?)  yerel (u,v) kuş bakışı metin planı: oda hücresi '.', duvar '#', çekirdek 'C', prop ilk harf (çarpışmalı BÜYÜK, çarpışmasız küçük), kapı '+', kilitli kapı 'L'
 *  emissiveCount(blocks, bounds) yazılmış hacimdeki ışık/ışıma (EMIT_LUT>0) hücre sayısı
 *  decodeVolume(bw, interior)    BigWriter hacminden {air, solid, emit, blocks:Map} sayımı
 */
import { EMIT_LUT } from '../../blocks.js';
import { frameOf } from './index.js';
import { getCatalogDef } from '../../props/propCatalog.js';
import { getPropDef, worldBoxes } from '../../props/propDefs.js';

export function asciiPlan(it, frameIn) {
  const f = frameIn || frameOf(it);
  const grid = [];
  for (let v = -1; v <= f.D; v++) {
    const row = [];
    for (let u = -1; u <= f.W; u++) row.push('#');
    grid.push(row);
  }
  const at = (u, v) => (u >= -1 && u <= f.W && v >= -1 && v <= f.D ? grid[v + 1] : null);
  const toLocal = (x, z) => f.local(Math.floor(x), Math.floor(z));
  it.rooms.forEach((r) => {
    for (let x = r.x0; x < r.x1; x++) {
      for (let z = r.z0; z < r.z1; z++) {
        const [u, v] = toLocal(x, z);
        const row = at(u, v);
        if (row) row[u + 1] = '.';
      }
    }
  });
  (it.obstacles || []).forEach((o) => {
    for (let x = o.x0; x < o.x1; x++) {
      for (let z = o.z0; z < o.z1; z++) {
        const [u, v] = toLocal(x, z);
        const row = at(u, v);
        if (row) row[u + 1] = 'C';
      }
    }
  });
  it.doors.forEach((d) => {
    if (d.kind === 'street') return;
    const half = ((d.w || 1) - 1) / 2;
    for (let k = -half; k <= half; k++) {
      const x = d.axis === 'x' ? d.x + k : d.x;
      const z = d.axis === 'x' ? d.z : d.z + k;
      const [u, v] = toLocal(x, z);
      const row = at(u, v);
      if (row && !d.from) row[u + 1] = d.lock ? 'L' : '+';
    }
  });
  it.props.forEach((p) => {
    const def = getCatalogDef(p.kind) || getPropDef(p.kind);
    if (!def) return;
    const boxes = def.colliders.length ? worldBoxes(def, p.x, p.y, p.z, p.yaw, []) : null;
    const ch = String(p.kind).charAt(0);
    if (boxes) {
      boxes.forEach((b) => {
        for (let x = Math.floor(b[0] + 1e-6); x < Math.ceil(b[3] - 1e-6); x++) {
          for (let z = Math.floor(b[2] + 1e-6); z < Math.ceil(b[5] - 1e-6); z++) {
            const [u, v] = toLocal(x, z);
            const row = at(u, v);
            if (row && row[u + 1] !== 'C') row[u + 1] = def.tags.indexOf('door') >= 0 ? '+' : ch.toUpperCase();
          }
        }
      });
    } else {
      const [u, v] = toLocal(p.x, p.z);
      const row = at(u, v);
      if (row && row[u + 1] === '.') row[u + 1] = ch.toLowerCase();
    }
  });
  (it.lights || []).forEach((l) => {
    const [u, v] = toLocal(l.x, l.z);
    const row = at(u, v);
    if (row && row[u + 1] === '.') row[u + 1] = '*';
  });
  return grid.map((r) => r.join('')).join('\n');
}

/** Hacimdeki (bounds) ışıma bloğu hücre sayısı; get(x,y,z) → blok kimliği. */
export function emissiveCount(get, b) {
  let n = 0;
  for (let y = b.y0; y < b.y1 + 1; y++) {
    for (let z = b.z0 - 1; z <= b.z1; z++) {
      for (let x = b.x0 - 1; x <= b.x1; x++) {
        if (EMIT_LUT[get(x, y, z)] > 0) n++;
      }
    }
  }
  return n;
}

export function volumeStats(get, b) {
  const blocks = new Map();
  let air = 0;
  let solid = 0;
  for (let y = b.y0; y < b.y1; y++) {
    for (let z = b.z0; z < b.z1; z++) {
      for (let x = b.x0; x < b.x1; x++) {
        const id = get(x, y, z);
        blocks.set(id, (blocks.get(id) || 0) + 1);
        if (id === 0) air++;
        else solid++;
      }
    }
  }
  return { air, solid, blocks };
}
