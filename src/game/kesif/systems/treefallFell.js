/*
 * KEŞİF "treefall" sistemi — devirme akışı: kırılan kütük → tespit → (görsel + bütçeli dünya kaldırma) → animasyon → eşyalar.
 *
 *   enqueueBreak(G,S,x,y,z)        kırılan kütük konumunu sıraya al (blockChange dinleyicisi çağırır)
 *   processQueue(G,S,dt)           sabit adım: en çok bir tespit; tamamlanınca devirmeyi başlatır ya da yaprak çürümesi tarar
 *   updateFalls(G,S,dt)            animasyon + oyuncuyu kenara itme + çarpma etkileri + bitiş (eşya)
 *   updateRemoval(G,S,dt)          dünya bloklarını bütçeli kaldırır (normal ağaç: görselin altında, birkaç ms; dev ağaç: 1,5 sn'ye yayılı)
 *   flushAll(G,S)                  bekleyen her şeyi hemen uygula (kayıt/yükleme/ölüm)
 *   fellNow(G,S,x,y,z,opts)        (test/harness) belirtilen kütük tabanını hemen kır ve devir
 *
 * Güvenlik/oyun kuralları: kütük kırıldığında 26 komşulu kütük bileşeni desteksizse ve ≥ 3 doğal yaprağı varsa devrilir (sim/treefall.js).
 * Oyuncu yolundaysa zarar görmeden yana itilir; yaratıklar çarpmada hafif hasar + geri tepme alır (patron hariç). Devrilen bloklar için
 * `blockBroken` olayı YAYILMAZ (bulmaca/ilerleme tetiklenmez); `treeFelled` olayı yayılır.
 */
import { detectTreeFall } from '../sim/treefall.js';
import { computeFellDrops, stackify } from '../sim/treeDrops.js';
import { TREE_TUNING } from '../sim/treeData.js';
import { BLOCKS } from '../sim/blocks.js';
import { applyKnockback } from '../sim/physics.js';
import {
  crownPoint, fallDuration, fallPose, pathState, popOrder, shakeAmplitude, tipPoint,
} from '../render/treeFallAnim.js';
import {
  active, breakerNear, cellKey, naturalOpts, rngFor,
} from './treefallCore.js';
import {
  addShake, angleAt, createFallVisual, disposeVisual, leafBurst, poseVisual, reduced, sfx,
} from './treefallFx.js';
import { scheduleDecay } from './treefallDecay.js';

const TMP = { x: 0, y: 0, z: 0 };
const TIP = { x: 0, y: 0, z: 0 };

export function enqueueBreak(G, S, x, y, z) {
  const k = cellKey(x, y, z);
  if (S.queued.has(k)) return;
  if (S.queue.length >= TREE_TUNING.maxQueue) {
    S.stats.skipped++;
    return;
  }
  S.queued.add(k);
  S.queue.push({
    x, y, z, tries: 0, delay: 0,
  });
}

function overlapsClaimed(S, r) {
  if (S.claimed.size === 0) return false;
  for (let i = 0; i < r.logs.length; i++) if (S.claimed.has(cellKey(r.logs[i].x, r.logs[i].y, r.logs[i].z))) return true;
  return false;
}

/** Yatış yüksekliği: gövde hattı boyunca en yüksek zemin üstü; menteşe yüksekliğine göre fark (yamaç/çukur). */
function restOffset(G, r) {
  const w = G.world;
  if (typeof w.surfaceY !== 'function') return 0;
  const H = r.height;
  const floorY = w.yMin !== undefined ? w.yMin : 0; // yüklü olmayan sütun yMin − 1 (eski sözleşme: −1) döner
  let best = -Infinity;
  for (let s = 0; s <= H; s += 2) {
    const x = Math.floor(r.hinge.x + r.dx * s);
    const z = Math.floor(r.hinge.z + r.dz * s);
    const sy = w.surfaceY(x, z, { ignoreFoliage: true });
    if (sy >= floorY) best = Math.max(best, sy + 1);
  }
  if (best === -Infinity) return 0;
  return Math.max(-H, Math.min(H, best - r.hinge.y));
}

function startFall(G, S, r) {
  const T = TREE_TUNING;
  const entry = {
    id: S.nextId++,
    result: r,
    big: r.big,
    T: r.big ? T.bigDuration : fallDuration(r.height),
    t: 0,
    angle: 0,
    prevAngle: 0,
    dy: 0,
    obj: null,
    tris: 0,
    axis: null,
    leafId: r.leaves.length > 0 ? r.leaves[0].id : 0,
    logId: r.logs[0].id,
    flags: {
      snap: false, creak1: false, creak2: false, leaf1: false, leaf2: false, impact: false, mobs: false,
    },
    cells: null,
    order: null,
    removeI: 0,
    drops: null,
    pushT: 0,
    popT: 0,
    fresh: true,
    done: false,
  };
  entry.cells = r.logs.concat(r.leaves);
  entry.order = r.big ? popOrder(entry.cells) : null;
  const base = r.base;
  const held = G.inventory && typeof G.inventory.heldItem === 'function' ? G.inventory.heldItem() : null;
  const dropsRaw = computeFellDrops(r, rngFor(G, base.x, base.y, base.z, 17), { heldKey: held, mods: G.mods });
  entry.drops = G.mode === 'insa' ? [] : stackify(dropsRaw.items, { maxStacks: T.maxDropStacks, stack: T.dropStack });
  for (let i = 0; i < entry.cells.length; i++) S.claimed.add(cellKey(entry.cells[i].x, entry.cells[i].y, entry.cells[i].z));
  if (!r.big) {
    entry.dy = restOffset(G, r);
    if (!createFallVisual(G, entry)) entry.obj = null;
    else poseVisual(entry, 0);
  }
  S.active.push(entry);
  S.removing.push(entry);
  S.stats.felled++;
  tipPoint(r.hinge, r, r.height, TIP);
  entry.tip = { x: TIP.x, y: r.hinge.y + entry.dy, z: TIP.z };
  if (G.accessibility && typeof G.speak === 'function') G.speak('Ağaç devriliyor.');
  sfx(G, 'tree:snap', r.hinge.x, r.hinge.y + 1, r.hinge.z, 0.9);
  entry.flags.snap = true;
  // devrilen kütükler 'kırılmış' sayılır (görev: İlk Odunlar, başarım sayaçları); tür başına tek toplu olay
  const byId = {};
  for (let i = 0; i < r.logs.length; i++) byId[r.logs[i].id] = (byId[r.logs[i].id] || 0) + 1;
  Object.keys(byId).forEach((id) => {
    G.emit({
      type: 'blockBroken', id: Number(id), count: byId[id], by: 'treefall', x: r.base.x, y: r.base.y, z: r.base.z,
    });
  });
  G.emit({
    type: 'treeFelled', trees: 1, logs: r.logs.length, leaves: r.leaves.length, species: BLOCKS[r.species] ? BLOCKS[r.species].key : null,
    x: r.base.x, y: r.base.y, z: r.base.z, big: r.big,
  });
  return entry;
}

function processOne(G, S, item) {
  const base = { x: item.x, y: item.y, z: item.z };
  const opts = naturalOpts(G, S, base);
  opts.breaker = breakerNear(G, item.x, item.z);
  const r = detectTreeFall(G.world, base, opts);
  if (!r) {
    const R = TREE_TUNING.leafSteps; // bir kütük kalkınca ≤ 4 adımdaki yaprakların bağı değişebilir
    scheduleDecay(G, S, {
      x0: base.x - R, x1: base.x + R, y0: base.y - R, y1: base.y + R, z0: base.z - R, z1: base.z + R,
    });
    return;
  }
  if (overlapsClaimed(S, r) || S.active.length >= TREE_TUNING.maxActive) {
    if (item.tries++ < 80) {
      item.delay = 0.25;
      S.queue.push(item);
      S.queued.add(cellKey(item.x, item.y, item.z));
    }
    return;
  }
  startFall(G, S, r);
}

export function processQueue(G, S, dt) {
  if (S.queue.length === 0) return;
  let handled = 0;
  const n = S.queue.length;
  for (let i = 0; i < n && handled < 1; i++) {
    const item = S.queue.shift();
    S.queued.delete(cellKey(item.x, item.y, item.z));
    if (item.delay > 0) {
      item.delay -= dt;
      S.queue.push(item);
      S.queued.add(cellKey(item.x, item.y, item.z));
      continue;
    }
    handled++;
    processOne(G, S, item);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Dünya bloklarını kaldırma
 * ---------------------------------------------------------------------------------------------- */
function removeCells(G, S, entry, maxCount, maxMs) {
  const w = G.world;
  const cells = entry.cells;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  let n = 0;
  S.busy = true;
  while (entry.removeI < cells.length && n < maxCount) {
    const c = cells[entry.order ? entry.order[entry.removeI] : entry.removeI];
    const k = cellKey(c.x, c.y, c.z);
    const cur = w.getBlock(c.x, c.y, c.z);
    if (cur === c.id) {
      if (!w.setBlock(c.x, c.y, c.z, 0) && w.getBlock(c.x, c.y, c.z) === null && typeof w.applyEdits === 'function') {
        w.applyEdits([[c.x, c.y, c.z, 0]]);
      }
    } else if (cur === null && typeof w.applyEdits === 'function') {
      w.applyEdits([[c.x, c.y, c.z, 0]]);
    }
    S.claimed.delete(k);
    if (S.grown.size > 0) S.grown.delete(k);
    entry.removeI++;
    n++;
    if ((n & 7) === 0 && maxMs > 0 && typeof performance !== 'undefined' && performance.now() - t0 > maxMs) break;
  }
  S.busy = false;
  return n;
}

export function updateRemoval(G, S, dt) {
  for (let i = S.removing.length - 1; i >= 0; i--) {
    const e = S.removing[i];
    if (e.fresh) {
      e.fresh = false; // tespit + mesh kurulan adımda kaldırma yapılmaz: yük iki adıma yayılır
      continue;
    }
    if (e.big) {
      const per = Math.ceil(e.cells.length / Math.max(1, e.T * 60)) * Math.max(1, Math.round(dt * 60));
      removeCells(G, S, e, per, 4);
    } else {
      removeCells(G, S, e, 1e9, 5);
    }
    if (e.removeI >= e.cells.length) S.removing.splice(i, 1);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Etkiler
 * ---------------------------------------------------------------------------------------------- */
function pushPlayer(G, entry, angle) {
  const b = G.body;
  if (!b || !G.player || G.player.dead || angle < 0.1) return;
  const r = entry.result;
  const ps = pathState(b.x, b.z, r.hinge, r, r.height);
  const cur = Math.sin(angle) * r.height;
  if (ps.along < -1.2 || ps.along > Math.min(r.height + 1.5, cur + 3.2)) return;
  if (Math.abs(ps.lateral) > 2.3) return;
  if (b.y > r.hinge.y + Math.cos(angle) * ps.along + 2.5 + r.height * 0.5) return;
  const sgn = ps.lateral >= 0 ? 1 : -1;
  // yana (eksene dik) it; zarar yok
  applyKnockback(b, -r.dz * sgn, r.dx * sgn, 5.2, 0);
}

function hitMobs(G, entry) {
  const em = G.em;
  if (!em || typeof em.queryMobs !== 'function' || typeof em.damage !== 'function') return;
  const r = entry.result;
  const H = r.height;
  const mx = r.hinge.x + r.dx * H * 0.6;
  const mz = r.hinge.z + r.dz * H * 0.6;
  const list = em.queryMobs(mx, mz, H * 0.5 + 3);
  for (let i = 0; i < list.length && i < 12; i++) {
    const e = list[i];
    if (e.def && e.def.boss) continue;
    const ps = pathState(e.x, e.z, r.hinge, r, H);
    if (ps.along < H * 0.3 || ps.along > H + 2 || Math.abs(ps.lateral) > 2.6) continue;
    const dmg = e.def && e.def.passive ? 1 : 3;
    // geri tepme kaynağı: gövde ekseni üzerindeki en yakın nokta (yana fırlar)
    const ax = r.hinge.x + r.dx * ps.along;
    const az = r.hinge.z + r.dz * ps.along;
    em.damage(e.id, dmg, {
      kind: 'env', x: ax, z: az, strength: 5.5,
    });
  }
}

function dropAll(G, S, entry) {
  const r = entry.result;
  const list = entry.drops || [];
  if (list.length === 0) return;
  const rng = rngFor(G, r.base.x, r.base.y, r.base.z, 91);
  const w = G.world;
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const s = r.height * (0.2 + 0.72 * ((i + 0.5) / n));
    const lat = (rng() - 0.5) * 2.6;
    const x = r.hinge.x + r.dx * s - r.dz * lat;
    const z = r.hinge.z + r.dz * s + r.dx * lat;
    let gy = r.hinge.y + entry.dy;
    if (typeof w.surfaceY === 'function') {
      const sy = w.surfaceY(Math.floor(x), Math.floor(z), { ignoreFoliage: true });
      if (sy >= (w.yMin !== undefined ? w.yMin : 0)) gy = sy + 1;
    }
    if (G.em && typeof G.em.spawnItem === 'function') {
      const a = rng() * Math.PI * 2;
      const sp = 0.4 + rng() * 0.9;
      G.em.spawnItem(list[i].item, list[i].count, x, gy + 0.7, z, {
        vx: Math.cos(a) * sp, vy: 2.2 + rng() * 1.2, vz: Math.sin(a) * sp, delay: 0.55,
      });
    } else if (G.inventory) {
      G.inventory.addStack(list[i].item, list[i].count);
    }
  }
  S.stats.logsDropped += r.logs.length;
}

function finish(G, S, entry) {
  if (entry.done) return;
  entry.done = true;
  if (entry.removeI < entry.cells.length) removeCells(G, S, entry, 1e9, 0);
  const idx = S.removing.indexOf(entry);
  if (idx >= 0) S.removing.splice(idx, 1);
  disposeVisual(entry);
  dropAll(G, S, entry);
  const b = entry.result.bounds;
  const R = TREE_TUNING.leafSteps; // devrilmeye katılmayan dış yapraklar (> 4 adım) ve komşu taçlar çürüsün
  scheduleDecay(G, S, {
    x0: b.x0 - R, x1: b.x1 + R, y0: b.y0 - R, y1: b.y1 + R, z0: b.z0 - R, z1: b.z1 + R,
  });
  G.emit({
    type: 'treeFallDone', x: entry.result.base.x, y: entry.result.base.y, z: entry.result.base.z, logs: entry.result.logs.length,
  });
}

function impact(G, S, entry) {
  const r = entry.result;
  const f = entry.flags;
  f.impact = true;
  const tip = entry.tip;
  sfx(G, 'tree:crash', tip.x, tip.y + 0.5, tip.z, 1, 0.95 + Math.min(0.25, 6 / (r.height + 8)));
  leafBurst(G, entry, tip.x, tip.y + 1, tip.z, 7, 1.3);
  leafBurst(G, entry, (tip.x + r.hinge.x) * 0.5, tip.y + 0.6, (tip.z + r.hinge.z) * 0.5, 3, 0.9);
  const b = G.body;
  if (b) addShake(G, S, shakeAmplitude(r.height, Math.hypot(b.x - tip.x, b.z - tip.z)), 0.4);
  hitMobs(G, entry);
  f.mobs = true;
}

function updateOneFall(G, S, entry, dt) {
  const r = entry.result;
  const f = entry.flags;
  entry.prevAngle = entry.angle;
  entry.t += dt;
  const pose = fallPose(entry.t, entry.T);
  entry.angle = pose.angle;
  const k = pose.k;
  if (!f.creak1 && k >= 0.1) {
    f.creak1 = true;
    sfx(G, 'tree:creak', r.hinge.x, r.hinge.y + r.height * 0.4, r.hinge.z, 0.9, 1);
  }
  if (!f.creak2 && k >= 0.5) {
    f.creak2 = true;
    sfx(G, 'tree:creak', r.hinge.x + r.dx * 2, r.hinge.y + r.height * 0.5, r.hinge.z + r.dz * 2, 0.7, 0.88);
  }
  if ((!f.leaf1 && k >= 0.4) || (!f.leaf2 && k >= 0.65)) {
    if (!f.leaf1) f.leaf1 = true;
    else f.leaf2 = true;
    crownPoint(r.hinge, r, r.height, pose.angle, TMP);
    leafBurst(G, entry, TMP.x, TMP.y, TMP.z, 3, 0.7);
    sfx(G, 'leaf:rustle', TMP.x, TMP.y, TMP.z, 0.6);
  }
  if (!f.impact && pose.phase !== 'tip') impact(G, S, entry);
  if (pose.phase === 'tip') {
    entry.pushT -= dt;
    if (entry.pushT <= 0) {
      entry.pushT = 0.06;
      pushPlayer(G, entry, pose.angle);
    }
  }
  if (entry.t >= entry.T) finish(G, S, entry);
}

function updateOneCollapse(G, S, entry, dt) {
  const r = entry.result;
  const f = entry.flags;
  entry.t += dt;
  const k = Math.min(1, entry.t / entry.T);
  if (!f.creak1) {
    f.creak1 = true;
    sfx(G, 'tree:creak', r.hinge.x, r.hinge.y + r.height * 0.5, r.hinge.z, 1, 0.8);
  }
  entry.popT -= dt;
  if (entry.popT <= 0 && k < 1) {
    entry.popT = reduced(G) ? 0.16 : 0.08;
    const i = Math.min(entry.cells.length - 1, entry.removeI);
    const c = entry.cells[entry.order[Math.max(0, i)]];
    TMP.x = c.x + 0.5; TMP.y = c.y + 0.5; TMP.z = c.z + 0.5;
    leafBurst(G, entry, TMP.x, TMP.y, TMP.z, 2, 0.8);
    S.stats.popped++;
    if ((S.stats.popped & 3) === 0) sfx(G, 'leaf:rustle', TMP.x, TMP.y, TMP.z, 0.5);
  }
  if (!f.impact && k >= 0.92) {
    f.impact = true;
    sfx(G, 'tree:crash', r.hinge.x, r.hinge.y + 0.5, r.hinge.z, 1, 0.8);
    leafBurst(G, entry, r.hinge.x, r.hinge.y + 1, r.hinge.z, 7, 1.4);
    const b = G.body;
    if (b) addShake(G, S, shakeAmplitude(r.height, Math.hypot(b.x - r.hinge.x, b.z - r.hinge.z)), 0.5);
    hitMobs(G, entry);
  }
  if (entry.t >= entry.T) finish(G, S, entry);
}

export function updateFalls(G, S, dt) {
  for (let i = S.active.length - 1; i >= 0; i--) {
    const e = S.active[i];
    if (e.big) updateOneCollapse(G, S, e, dt);
    else updateOneFall(G, S, e, dt);
    if (e.done) S.active.splice(i, 1);
  }
}

/** Karelik poz (alpha ile yumuşatma). */
export function poseFalls(S, alpha, dt) {
  for (let i = 0; i < S.active.length; i++) {
    const e = S.active[i];
    if (e.big || !e.obj) continue;
    poseVisual(e, angleAt(e, alpha, dt));
  }
}

export function flushAll(G, S) {
  let guard = 64;
  while (S.queue.length > 0 && guard-- > 0) {
    const item = S.queue.shift();
    S.queued.delete(cellKey(item.x, item.y, item.z));
    processOne(G, S, item);
  }
  for (let i = S.active.length - 1; i >= 0; i--) {
    const e = S.active[i];
    if (!e.flags.impact) {
      e.flags.impact = true;
      e.flags.mobs = true;
    }
    finish(G, S, e);
  }
  S.active.length = 0;
  S.removing.length = 0;
}

/** (test/harness) Kütüğü hemen kır ve devrilmeyi başlat. Dönüş: entry | null. */
export function fellNow(G, S, x, y, z) {
  if (!active(G)) return null;
  const id = G.world.getBlock(x, y, z);
  if (id) {
    S.busy = true;
    G.world.setBlock(x, y, z, 0);
    S.busy = false;
  }
  const base = { x, y, z };
  const opts = naturalOpts(G, S, base);
  opts.breaker = breakerNear(G, x, z);
  const r = detectTreeFall(G.world, base, opts);
  return r ? startFall(G, S, r) : null;
}

