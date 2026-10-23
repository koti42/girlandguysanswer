/*
 * KEŞİF sim/city — KASA ('Kasa', y −110..−90) İÇERİĞİ (Faz 2, interiors_d). Saf, belirlenimci; yalnız pencere (chunk dilimi) içini yazar.
 * Kabuk (24×24×20 salon, 3×3 ışık, kasa bacası lab çekirdek odasından) olduğu gibi kalır; burada:
 *   - zemin: eş merkezli kareler + camgöbeği halka; duvar: koyu etek, dolap plakaları, aralıklı neon şerit; 4 köşe sütunu; ışıklar 9 → 4 (≤4/oda)
 *   - 'Diyar Işığı' sunağı: kuzey ucunda 5×5 kaide, cam silindir içinde neon ışık sütunu; önündeki bilgi terminali = ödül çapası
 *   - kasa kapağı: baca üzerinde (y −27) sürgülü kapak (239), açıkken merdiven; kilit 'vt' (Kart-3, kademe 3); okuyucu çekirdek odasında bir kaidede
 *
 *  emitVaultContent(w, plan)
 *  vaultData(plan) → {id, rect, center, door:Door, reward:{anchor,trigger,event,claim,flag}, pedestal, props:[]}
 *  vaultPropSpecs(plan, rect, out)
 */
import { B } from '../blocks.js';
import { ID } from './cityEmit.js';
import { LAB } from './cityUndergroundPlan.js';
import { labFrame } from './cityUndergroundLabs.js';
import {
  PSEUDO, mkLock, mkSpec,
} from './cityContentKit.js';

const KEEP_LIGHTS = [[4, 4], [20, 4], [4, 20], [20, 20]];

export function vaultData(plan) {
  if (plan._ugVault) return plan._ugVault;
  const V = plan.underground.vault;
  const L = plan.underground.labs[V.labId];
  const fr = labFrame(L);
  const R0 = fr.room(0);
  const cx = V.shaft.x;
  const cz = V.shaft.z;
  const hatchY = LAB.y0 - 3; // −27: kasa bacasında kapak
  const door = {
    id: 'vhatch', kind: 'hatch', x: cx, y: hatchY, z: cz, axis: 'z', w: 1, h: 1, cells: [{ x: cx, y: hatchY, z: cz, closed: ID.DOOR, open: B.LADDER }],
    lock: mkLock('vt', 'kart', 3, { card: 3, lab: V.labId, room: 'kasa' }), hidden: false, exitFree: true, deep: { x: cx, y: V.y0, z: cz }, lab: V.labId, role: 'vault',
  };
  // okuyucu kaidesi: çekirdek odasında (u=8,w=4) hücresi, yüz +w
  const pc = R0.cell(8, 4);
  const pr = R0.pt(8.5, 5.0625);
  const pedestal = { x: pc[0], z: pc[1], y: R0.y0, reader: { x: pr[0], y: R0.y0 + 1.25, z: pr[1], yaw: fr.yawPlus } };
  const reward = {
    anchor: { x: cx + 0.5, y: V.y0, z: cz - 4.5 },
    trigger: { x0: cx - 3, z0: cz - 7, x1: cx + 4, z1: cz - 3, y0: V.y0, y1: V.y0 + 4 },
    event: 'diyarIsigi',
    claim: 'neon:easter',
    flag: 'easterClaim',
    name: 'Diyar Işığı',
  };
  const out = {
    id: V.id, rect: { x0: V.x0, z0: V.z0, x1: V.x1, z1: V.z1, y0: V.y0, y1: V.y1 }, center: { x: cx, z: cz }, door, reward, pedestal,
  };
  Object.defineProperty(plan, '_ugVault', { value: out, enumerable: false, configurable: true, writable: true });
  return out;
}

/** Çekirdek odası merkez sütunu hücre aralığı için yardımcı: kasa kapağı kaidesi + okuyucu. */
function emitPedestal(w, plan) {
  const D = vaultData(plan);
  const p = D.pedestal;
  if (!w.touches(p.x, p.z, p.x + 1, p.z + 1)) return;
  w.col(p.x, p.z, p.y, p.y + 2, ID.IRON);
  w.set(p.x, p.y + 1, p.z, ID.FACADE_DARK);
}

export function emitVaultContent(w, plan) {
  const V = plan.underground.vault;
  const D = vaultData(plan);
  // kapak (baca): lab/baca penceresinde
  if (w.touches(D.door.x, D.door.z, D.door.x + 1, D.door.z + 1) && w.touchesY(D.door.y, D.door.y + 1)) {
    const c = D.door.cells[0];
    w.set(c.x, c.y, c.z, c.closed);
  }
  if (w.touchesY(LAB.y0 - 2, LAB.y0 + 4)) emitPedestal(w, plan);
  if (!w.touches(V.x0 - 1, V.z0 - 1, V.x1 + 1, V.z1 + 1) || !w.touchesY(V.y0 - 2, V.y1 + 1)) return;
  const cx = D.center.x;
  const cz = D.center.z;
  const x0 = Math.max(V.x0, w.x0);
  const x1 = Math.min(V.x1, w.x1);
  const z0 = Math.max(V.z0, w.z0);
  const z1 = Math.min(V.z1, w.z1);
  // zemin: eş merkezli kareler
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      const r = Math.max(Math.abs(x - cx), Math.abs(z - cz));
      let id = ID.FACADE_DARK;
      if (r <= 1) id = ID.IRON;
      else if (r <= 3) id = ID.POLISHED;
      else if (r === 4) id = ID.NEON_CYAN;
      else if (r <= 6) id = ID.POLISHED;
      else if (r === 7) id = ID.BLACK;
      else if (r === 11) id = ID.IRON;
      w.set(x, V.y0 - 1, z, id);
    }
  }
  // duvarlar: iç yüz hücreleri (|d|=12 halka dışı kabuk; kasa kabuğunun FACADE_DARK'ı) — etek + dolap plakaları + neon şerit
  const sides = [[V.x0 - 1, null], [V.x1, null], [null, V.z0 - 1], [null, V.z1]];
  for (let s = 0; s < 4; s++) {
    for (let t = 0; t < 24; t++) {
      const x = sides[s][0] !== null ? sides[s][0] : V.x0 + t;
      const z = sides[s][1] !== null ? sides[s][1] : V.z0 + t;
      if (x < w.x0 || x >= w.x1 || z < w.z0 || z >= w.z1) continue;
      for (let y = V.y0; y <= V.y0 + 9; y++) {
        let id = null;
        if (y <= V.y0 + 1) id = ID.FACADE_DARK;
        else if (y <= V.y0 + 6 && (t & 3) !== 3) id = ((t >> 2) & 1) === 0 ? ID.FACADE_LIGHT : ID.IRON;
        else if (y === V.y0 + 9 && (t & 3) < 2) id = ID.NEON_PINK;
        if (id !== null && w.get(x, y, z) !== 0) w.set(x, y, z, id);
      }
    }
  }
  // köşe sütunları 2×2 (±10..±11)
  const corners = [[V.x0, V.z0], [V.x1 - 2, V.z0], [V.x0, V.z1 - 2], [V.x1 - 2, V.z1 - 2]];
  for (let c = 0; c < 4; c++) {
    const [px, pz] = corners[c];
    if (!w.touches(px, pz, px + 2, pz + 2)) continue;
    w.box(px, V.y0, pz, px + 2, V.y1, pz + 2, ID.FACADE_DARK);
    w.box(px, V.y0 + 3, pz, px + 2, V.y0 + 4, pz + 2, ID.NEON_CYAN);
  }
  // ışıklar: 9 → 4 (köşe lambaları kalır; diğerleri tavan bloğuna)
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      const lx = V.x0 + 4 + a * 8;
      const lz = V.z0 + 4 + b * 8;
      const keep = KEEP_LIGHTS.some((k) => V.x0 + k[0] === lx && V.z0 + k[1] === lz);
      if (!keep && lx >= w.x0 && lx < w.x1 && lz >= w.z0 && lz < w.z1 && w.get(lx, V.y1, lz) === ID.LIGHT) w.set(lx, V.y1, lz, ID.FACADE_DARK);
    }
  }
  // Diyar Işığı sunağı: kuzey ucunda 5×5 kaide + cam silindir + ışık sütunu
  const ax = cx;
  const az = cz - 8;
  if (w.touches(ax - 2, az - 2, ax + 3, az + 3)) {
    w.box(ax - 2, V.y0, az - 2, ax + 3, V.y0 + 1, az + 3, ID.IRON);
    w.box(ax - 1, V.y0 + 1, az - 1, ax + 2, V.y0 + 2, az + 2, ID.POLISHED);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const mid = dx === 0 && dz === 0;
        for (let y = V.y0 + 2; y <= V.y0 + 7; y++) w.set(ax + dx, y, az + dz, mid ? ID.NEON_PINK : B.GLASS_PURPLE);
        w.set(ax + dx, V.y0 + 8, az + dz, ID.IRON);
      }
    }
  }
}

const PROP_CACHE = new WeakMap();
export function vaultPropSpecs(plan, rect, out) {
  const V = plan.underground.vault;
  if (!(V.x0 - 2 < rect.x1 && V.x1 + 2 > rect.x0 && V.z0 - 2 < rect.z1 && V.z1 + 2 > rect.z0)) return out;
  let list = PROP_CACHE.get(V);
  if (!list) {
    const D = vaultData(plan);
    const base = PSEUDO.vault;
    list = [];
    let n = 0;
    const add = (kind, x, y, z, yaw, variant, extra) => list.push(mkSpec(base, n++, kind, x, y, z, yaw, variant, extra));
    for (let i = 0; i < 5; i++) {
      add('dolap_sirali', V.x0 + 0.35, V.y0, V.z0 + 4 + 3.4 * i, 1, i % 3);
      add('dolap_sirali', V.x1 - 0.35, V.y0, V.z0 + 4 + 3.4 * i, 3, (i + 1) % 3);
    }
    add('bilgi_terminali', D.reward.anchor.x, V.y0, D.reward.anchor.z, 0, 1, { reward: 'diyarIsigi' });
    add('bilgi_terminali', V.x0 + 12.5, V.y0, V.z1 - 0.5, 2, 0);
    add('mini_robot', V.x0 + 16.5, V.y0, V.z1 - 3.5, 2, 1);
    // okuyucu (çekirdek odası kaidesi)
    const p = D.pedestal.reader;
    add('kart_okuyucu', p.x, p.y, p.z, p.yaw, 2, { lockId: 'vt' });
    list.forEach((s) => { if (s.kind === 'kart_okuyucu') s.lotId = PSEUDO.vault + 1; });
    PROP_CACHE.set(V, list);
  }
  for (let k = 0; k < list.length; k++) out.push(list[k]);
  return out;
}
