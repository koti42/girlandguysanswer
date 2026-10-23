/*
 * KEŞİF "treefall" sistemi — fidan dikme ve ağaca dönüşme.
 *
 *   noteBlockChange(G,S,e)        blockChange: fidan konduysa kaydet, kalktıysa sil
 *   tickSaplings(G,S,dt)          saniyede bir: yüklü, oyuncuya ≤ 80 blok, ışıklı fidanların yaşını artır; süresi dolanı büyüt
 *   growSapling(G,S,sp)           fidanı tohum ağacına çevir (kütük + yaprak; dünyadaki ağaçlarla aynı şekiller); sonuç 'ok'|'blocked'|'unknown'
 *   serializeSaplings(S) / restoreSaplings(G,S,obj)    {sap:[[x,y,z,tür,yaş,deneme]], grown:[[x,y,z,tür,özet]]}
 *
 * Süre belirlenimci: growTimeFor(tohum, x,y,z) ∈ [50,120] sn (yalnız yüklü + oyuncuya yakınken ilerler; ışık ≥ 9 gerekir). Yer yoksa
 * 30 sn sonra yeniden dener (en çok 8 kez; yer açılınca sapling hâlâ durur ve bir sonraki girişte denenir). Büyüyen ağacın hücreleri
 * `S.grown`a yazılır: doğal sayılır (devrilir, yaprağı çürür); oyuncunun kütükleri sayılmaz.
 */
import { MAP_H } from '../sim/constants.js';
import { isSaplingId, TREE_SPECIES, TREE_TUNING } from '../sim/treeData.js';
import {
  buildTreeCells, growthCheck, growTimeFor, speciesOfSapling, treeHashFor,
} from '../sim/treeGrow.js';
import { isLeafId, isLogId } from '../sim/treefall.js';
import { BLOCKS } from '../sim/blocks.js';
import { cellKey } from './treefallCore.js';
import { hint, reduced, sfx } from './treefallFx.js';

const POS = { x: 0, y: 0, z: 0 };
const NEAR = 80;

export function noteBlockChange(G, S, e) {
  const k = cellKey(e.x, e.y, e.z);
  if (isSaplingId(e.newId)) {
    const sp = speciesOfSapling(e.newId);
    if (sp >= 0 && S.saplings.size < TREE_TUNING.maxSaplings) {
      S.saplings.set(k, {
        x: e.x, y: e.y, z: e.z, sp, age: 0, tries: 0,
      });
      if (!S.hintedSapling) {
        S.hintedSapling = true;
        hint(G, 'Fidan dikildi: açık, aydınlık bir yerde bir süre sonra ağaç olur.', 4);
      }
    }
  } else if (isSaplingId(e.oldId)) {
    S.saplings.delete(k);
  }
}

function replaceableLeafCell(id) {
  if (id === 0) return true;
  const b = BLOCKS[id];
  return !!b && b.shape === 'cross' && b.hardness === 0 && !b.liquid;
}

/** Fidanı ağaca çevirir. 'ok' | 'blocked' | 'unknown'. */
export function growSapling(G, S, s) {
  const w = G.world;
  // tohum ağaç şekilleri (worldgenFlora) y ≥ MAP_H'de kırpılır: çok yüksekte dikilen fidan yarım ağaç olmasın
  if (s.y + 16 >= MAP_H) return 'blocked';
  const hash = treeHashFor(w.seed | 0, s.x, s.y, s.z);
  const cells = buildTreeCells(s.sp, s.x, s.y, s.z, hash);
  const chk = growthCheck((x, y, z) => w.getBlock(x, y, z), cells, s);
  if (chk !== 'ok') return chk;
  S.busy = true;
  const placed = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const cur = w.getBlock(c.x, c.y, c.z);
    if (isLogId(c.id)) {
      if (cur === null) continue;
      if (w.setBlock(c.x, c.y, c.z, c.id)) placed.push(c);
    } else if (isLeafId(c.id)) {
      if (cur !== null && replaceableLeafCell(cur) && w.setBlock(c.x, c.y, c.z, c.id)) placed.push(c);
    }
  }
  S.busy = false;
  for (let i = 0; i < placed.length; i++) S.grown.add(cellKey(placed[i].x, placed[i].y, placed[i].z));
  S.grownTrees.push({
    x: s.x, y: s.y, z: s.z, sp: s.sp, h: hash,
  });
  if (S.grownTrees.length > TREE_TUNING.maxGrown) S.grownTrees.shift();
  S.saplings.delete(cellKey(s.x, s.y, s.z));
  S.stats.grown++;
  POS.x = s.x + 0.5; POS.y = s.y + 1.5; POS.z = s.z + 0.5;
  sfx(G, 'leaf:rustle', POS.x, POS.y, POS.z, 0.7);
  if (G.particles) {
    const col = TREE_SPECIES[s.sp].color;
    if (G.particles.magicBurst) G.particles.magicBurst(POS, col, { radius: reduced(G) ? 1.2 : 2.2, scale: 0.7 });
  }
  G.emit({
    type: 'treeGrown', species: TREE_SPECIES[s.sp].key, x: s.x, y: s.y, z: s.z, logs: placed.filter((c) => isLogId(c.id)).length,
  });
  return 'ok';
}

export function tickSaplings(G, S, dt) {
  S.sapT += dt;
  if (S.sapT < 1) return;
  const step = S.sapT;
  S.sapT = 0;
  if (S.saplings.size === 0) return;
  const w = G.world;
  const b = G.body;
  const seed = w.seed | 0;
  S.saplings.forEach((s, k) => {
    const id = w.getBlock(s.x, s.y, s.z);
    if (id === null) return;
    if (!isSaplingId(id)) {
      S.saplings.delete(k);
      return;
    }
    if (b) {
      const dx = b.x - s.x;
      const dz = b.z - s.z;
      if (dx * dx + dz * dz > NEAR * NEAR) return;
    }
    const light = w.getLight(s.x, s.y, s.z);
    if ((light >> 4) < TREE_TUNING.growLight && (light & 15) < 12) return;
    s.age += step;
    const need = growTimeFor(seed, s.x, s.y, s.z);
    if (s.age < need || s.tries >= 8) return;
    const r = growSapling(G, S, s);
    if (r === 'blocked') {
      s.tries++;
      if (b && !s.hinted && Math.hypot(b.x - s.x, b.z - s.z) < 8) {
        s.hinted = true;
        hint(G, 'Fidanın büyümesi için üstünde ve çevresinde yer yok.', 4);
      }
      s.age = Math.max(0, need - 30);
    } else if (r === 'unknown') {
      s.age = Math.max(0, need - 5);
    }
  });
}

export function serializeSaplings(S) {
  const sap = [];
  S.saplings.forEach((s) => {
    if (sap.length < TREE_TUNING.maxSaplings) sap.push([s.x, s.y, s.z, s.sp, Math.floor(s.age), s.tries]);
  });
  const grown = S.grownTrees.map((g) => [g.x, g.y, g.z, g.sp, g.h >>> 0]);
  return { sap, grown };
}

function int(v) {
  return Number.isInteger(v) ? v : null;
}

export function restoreSaplings(G, S, obj) {
  S.saplings.clear();
  S.grown.clear();
  S.grownTrees.length = 0;
  if (!obj) return;
  const sap = Array.isArray(obj.sap) ? obj.sap : [];
  for (let i = 0; i < sap.length && S.saplings.size < TREE_TUNING.maxSaplings; i++) {
    const a = sap[i];
    if (!Array.isArray(a) || a.length < 4) continue;
    const x = int(a[0]); const y = int(a[1]); const z = int(a[2]); const sp = int(a[3]);
    if (x === null || y === null || z === null || sp === null || sp < 0 || sp >= TREE_SPECIES.length) continue;
    S.saplings.set(cellKey(x, y, z), {
      x, y, z, sp, age: Math.max(0, Math.min(1000, Number(a[4]) || 0)), tries: Math.max(0, Math.min(8, Number(a[5]) || 0)),
    });
  }
  const grown = Array.isArray(obj.grown) ? obj.grown : [];
  for (let i = 0; i < grown.length && S.grownTrees.length < TREE_TUNING.maxGrown; i++) {
    const a = grown[i];
    if (!Array.isArray(a) || a.length < 5) continue;
    const x = int(a[0]); const y = int(a[1]); const z = int(a[2]); const sp = int(a[3]); const h = Number(a[4]);
    if (x === null || y === null || z === null || sp === null || sp < 0 || sp >= TREE_SPECIES.length || !Number.isFinite(h)) continue;
    S.grownTrees.push({
      x, y, z, sp, h: h >>> 0,
    });
    const cells = buildTreeCells(sp, x, y, z, h >>> 0);
    for (let j = 0; j < cells.length; j++) S.grown.add(cellKey(cells[j].x, cells[j].y, cells[j].z));
  }
}
