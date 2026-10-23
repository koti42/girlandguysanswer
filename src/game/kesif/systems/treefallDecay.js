/*
 * KEŞİF "treefall" sistemi — yaprak çürümesi: kütüğe ≤ 4 adımda bağlı olmayan doğal yapraklar birkaç saniyeye yayılarak kurur,
 * düşerken sopa/fidan/elma (şansa bağlı; Servet/Verimlilik/Yağmacı etkisiyle) bırakır.
 *
 *   scheduleDecay(G,S,box)      kutu çevresini (kütük kırıldı / ağaç devrildi) tarama kuyruğuna ekle
 *   tickDecay(G,S,dt)           sabit adım: en çok bir kutu tara (bütçeli), zamanı gelen yaprakları kaldır (adım başına ≤ 6)
 *   decayDrops / flushDecay     kayıt/yükleme: bekleyenleri hemen uygula
 *
 * Doğal olmayan (oyuncunun koyduğu) yapraklar, yapı sınırı içindekiler ve yüklenmemiş chunk yakınındakiler çürümez. Çürüyen yaprak için
 * `blockBroken` yayılmaz; dünyaya kaydedilir (record) → kayıt tutarlı.
 */
import { findOrphanLeaves, isLeafId } from '../sim/treefall.js';
import { dropBoost, leafDrops } from '../sim/treeDrops.js';
import { TREE_TUNING } from '../sim/treeData.js';
import { hash3 } from '../sim/rng.js';
import { cellKey, naturalOpts, rngFor } from './treefallCore.js';
import { reduced, sfx } from './treefallFx.js';

const POS = { x: 0, y: 0, z: 0 };

export function scheduleDecay(G, S, box) {
  if (S.decayScans.length >= 16) return;
  S.decayScans.push({
    x0: box.x0, x1: box.x1, y0: box.y0, y1: box.y1, z0: box.z0, z1: box.z1,
  });
}

function delayFor(G, x, y, z) {
  const h = hash3(x, y, z, (G.world.seed | 0) ^ 0x51d3a7);
  const k = (h & 1023) / 1024;
  return TREE_TUNING.decayMin + (TREE_TUNING.decayMax - TREE_TUNING.decayMin) * k;
}

function scanOne(G, S) {
  const box = S.decayScans.shift();
  if (!box) return;
  const base = { x: (box.x0 + box.x1) >> 1, z: (box.z0 + box.z1) >> 1 };
  const o = naturalOpts(G, S, base);
  o.max = Math.max(1, TREE_TUNING.decayQueue - S.decay.length);
  const orphans = findOrphanLeaves(G.world, box, o);
  for (let i = 0; i < orphans.length; i++) {
    const c = orphans[i];
    const k = cellKey(c.x, c.y, c.z);
    if (S.decayHeld.has(k) || S.decay.length >= TREE_TUNING.decayQueue) continue;
    S.decayHeld.add(k);
    S.decay.push({
      x: c.x, y: c.y, z: c.z, id: c.id, t: delayFor(G, c.x, c.y, c.z),
    });
  }
}

function removeLeaf(G, S, d, rng) {
  const w = G.world;
  S.decayHeld.delete(cellKey(d.x, d.y, d.z));
  if (w.getBlock(d.x, d.y, d.z) !== d.id || !isLeafId(d.id)) return false;
  S.busy = true;
  const ok = w.setBlock(d.x, d.y, d.z, 0);
  S.busy = false;
  if (!ok) return false;
  S.grown.delete(cellKey(d.x, d.y, d.z));
  S.stats.decayed++;
  POS.x = d.x + 0.5; POS.y = d.y + 0.5; POS.z = d.z + 0.5;
  if (G.particles && G.particles.blockBreak && (S.stats.decayed & 1) === 0) G.particles.blockBreak(d.id, POS, reduced(G) ? 0.4 : 0.6);
  if ((S.stats.decayed & 7) === 0) sfx(G, 'leaf:rustle', POS.x, POS.y, POS.z, 0.45);
  if (G.mode !== 'insa') {
    const list = leafDrops(d.id, rng, dropBoost(G.mods) * 0.7, [], { n: 1 });
    for (let i = 0; i < list.length; i++) {
      if (G.em && typeof G.em.spawnItem === 'function') {
        G.em.spawnItem(list[i].item, list[i].count, POS.x, POS.y, POS.z, {
          vx: (rng() - 0.5) * 0.8, vy: 1.4, vz: (rng() - 0.5) * 0.8, delay: 0.5,
        });
      }
    }
  }
  return true;
}

export function tickDecay(G, S, dt) {
  if (S.decayScans.length > 0 && S.decay.length < TREE_TUNING.decayQueue) scanOne(G, S);
  if (S.decay.length === 0) return;
  let removed = 0;
  for (let i = S.decay.length - 1; i >= 0; i--) {
    const d = S.decay[i];
    d.t -= dt;
    if (d.t > 0 || removed >= 6) continue;
    S.decay.splice(i, 1);
    if (removeLeaf(G, S, d, rngFor(G, d.x, d.y, d.z, 5))) removed++;
  }
}

/** Kayıt/yükleme öncesi: bekleyen çürümeleri hemen uygula (tarama kuyruğu atılır; sonraki kırılmalar yeniden tarar). */
export function flushDecay(G, S) {
  while (S.decayScans.length > 0 && S.decay.length < TREE_TUNING.decayQueue) scanOne(G, S);
  for (let i = 0; i < S.decay.length; i++) removeLeaf(G, S, S.decay[i], rngFor(G, S.decay[i].x, S.decay[i].y, S.decay[i].z, 5));
  S.decay.length = 0;
  S.decayHeld.clear();
}
