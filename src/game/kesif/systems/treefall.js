/*
 * KEŞİF — "treefall" sistemi (order 22, blocks'tan sonra): doğal ağaç devirme + yaprak çürümesi + fidan büyümesi.
 * gameSystems.js bu dosyayı otomatik yükler (createSystem). Saf sim: sim/treefall.js, treeGrow.js, treeDrops.js, treeData.js.
 *
 *   Tetik      : world 'blockChange' (kayıtlı, kütük → kütük değil): kırma, ışın tüfeği, büyü, patlama… HER yol. Sıraya girer;
 *                sabit adımda en çok bir tespit. Oyuncunun koyduğu / yapıya ait kütükler asla devrilmez (bkz. sim/treefall.js).
 *   Devrilme   : bloklar görselin altında bütçeli kaldırılır (dünyaya KAYITLI → kayıt tutarlı); menteşe etrafında 1,2–1,8 sn ease-in
 *                devrilme + sekme, çatırtı/çarpma sesi, parçacık, sarsıntı (kısıtlı harekette yok), oyuncu zarar görmeden yana itilir,
 *                yaratıklar hafif hasar alır; bitince eşyalar yere saçılır. > 300 blokluk dev ağaç: 1,5 sn'ye yayılı üstten alta çöküş.
 *   Çürüme     : kütüğe ≤ 4 adımda bağlı olmayan yapraklar birkaç sn'ye yayılı kurur (şansla sopa/fidan/elma).
 *   Fidan      : 'Fidan' blokları çimen/toprağa dikilir; yüklü ve aydınlıkta 50–120 sn sonra küçük bir ağaç olur.
 *   Yalnız macera modunda etkin (insa/harita yok). Olaylar: treeFelled, treeFallDone, treeGrown.
 *   serialize/restore : {v, rem:[x,y,z,…], drops:[{item,count,x,y,z}], sap, grown}; yarım kalan devrilme yüklemede hemen tamamlanır.
 *   G'ye eklenen : G.treefall {state, fellNow(x,y,z), counts(), flush()}.
 */
import { isLogId } from '../sim/treefall.js';
import {
  active, createState,
} from './treefallCore.js';
import {
  enqueueBreak, fellNow, flushAll, poseFalls, processQueue, updateFalls, updateRemoval,
} from './treefallFell.js';
import { flushDecay, tickDecay } from './treefallDecay.js';
import {
  noteBlockChange, restoreSaplings, serializeSaplings, tickSaplings,
} from './treefallSapling.js';
import { applyShake } from './treefallFx.js';

const SAVE_REM_MAX = 6000;

export function createSystem(G) {
  const S = createState();
  let unsub = null;
  let restoredDrops = [];

  function counts() {
    return {
      queued: S.queue.length,
      active: S.active.length,
      removing: S.removing.length,
      saplings: S.saplings.size,
      decayPending: S.decay.length + S.decayScans.length,
      felled: S.stats.felled,
      grown: S.stats.grown,
      decayed: S.stats.decayed,
      popped: S.stats.popped,
      skipped: S.stats.skipped,
      grownTrees: S.grownTrees.length,
      claimed: S.claimed.size,
    };
  }

  function onBlockChange(e) {
    if (S.busy || !active(G)) return;
    if (e.record === false) return;
    if (isLogId(e.oldId) && !isLogId(e.newId)) enqueueBreak(G, S, e.x, e.y, e.z);
    noteBlockChange(G, S, e);
  }

  function spawnRestored() {
    if (restoredDrops.length === 0 || !G.world) return;
    const rest = [];
    for (let i = 0; i < restoredDrops.length; i++) {
      const d = restoredDrops[i];
      if (G.world.getBlock(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z)) === null) {
        rest.push(d);
        continue;
      }
      if (G.em && typeof G.em.spawnItem === 'function') {
        G.em.spawnItem(d.item, d.count, d.x, d.y, d.z, { vx: 0, vy: 2, vz: 0, delay: 0.3 });
      } else if (G.inventory) {
        G.inventory.addStack(d.item, d.count);
      }
    }
    restoredDrops = rest;
  }

  const sys = {
    name: 'treefall',
    order: 22,

    init() {
      G.treefall = {
        state: S,
        fellNow: (x, y, z) => fellNow(G, S, x, y, z),
        counts,
        flush: () => {
          flushAll(G, S);
          flushDecay(G, S);
        },
      };
      if (G.world && typeof G.world.on === 'function') unsub = G.world.on('blockChange', onBlockChange);
    },

    /** Boyut değişmeden önce (eski dünya hâlâ canlı): yarım kalan devirme/çürüme kuyruğu tamamlanır. */
    beforeDimension() {
      flushAll(G, S);
      flushDecay(G, S);
    },

    /** Boyut değişti: abonelik yeni dünyaya; eski dünyanın geçici kuyrukları temizlenir (fidanlar overworld'e aittir ve dönüşte sürer). */
    onDimension() {
      if (unsub) unsub();
      unsub = null;
      S.queue.length = 0;
      S.queued.clear();
      S.claimed.clear();
      S.busy = false;
      S.decayScans.length = 0;
      S.decay.length = 0;
      S.decayHeld.clear();
      S.pendingDrops.length = 0;
      if (G.world && typeof G.world.on === 'function') unsub = G.world.on('blockChange', onBlockChange);
    },

    fixedUpdate(_G, dt) {
      if (!active(G)) return;
      if (restoredDrops.length > 0) spawnRestored();
      processQueue(G, S, dt);
      updateRemoval(G, S, dt);
      updateFalls(G, S, dt);
      tickDecay(G, S, dt);
      tickSaplings(G, S, dt);
    },

    frameUpdate(_G, dt, alpha) {
      if (S.active.length > 0) poseFalls(S, alpha, 1 / 60);
      applyShake(G, S, dt);
    },

    api() {
      return {
        getTreeFallStats: () => counts(),
      };
    },

    serialize() {
      if (!G.world) return null;
      // yarım kalan kaldırmalar ve henüz bırakılmamış eşyalar kayda yazılır; yüklemede hemen tamamlanır
      const rem = [];
      const drops = [];
      for (let i = 0; i < S.removing.length; i++) {
        const e = S.removing[i];
        for (let k = e.removeI; k < e.cells.length && rem.length < SAVE_REM_MAX; k++) {
          const c = e.cells[e.order ? e.order[k] : k];
          rem.push(c.x, c.y, c.z);
        }
      }
      for (let i = 0; i < S.active.length; i++) {
        const e = S.active[i];
        const t = e.tip || e.result.hinge;
        for (let k = 0; k < (e.drops || []).length && drops.length < 40; k++) {
          drops.push({
            item: e.drops[k].item, count: e.drops[k].count, x: t.x, y: t.y + 1, z: t.z,
          });
        }
      }
      for (let i = 0; i < restoredDrops.length && drops.length < 80; i++) drops.push(restoredDrops[i]);
      const sg = serializeSaplings(S);
      return {
        v: 1, rem, drops, sap: sg.sap, grown: sg.grown,
      };
    },

    restore(_G, obj) {
      restoreSaplings(G, S, obj);
      restoredDrops = [];
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj.rem) && G.world && typeof G.world.applyEdits === 'function') {
        const list = [];
        for (let i = 0; i + 2 < obj.rem.length && list.length < SAVE_REM_MAX; i += 3) {
          const x = obj.rem[i]; const y = obj.rem[i + 1]; const z = obj.rem[i + 2];
          if (Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z)) list.push([x, y, z, 0]);
        }
        if (list.length > 0) G.world.applyEdits(list);
      }
      if (Array.isArray(obj.drops)) {
        for (let i = 0; i < obj.drops.length && restoredDrops.length < 80; i++) {
          const d = obj.drops[i];
          if (d && typeof d.item === 'string' && d.count > 0 && Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.z)) {
            restoredDrops.push({
              item: d.item, count: Math.min(64, Math.floor(d.count)), x: d.x, y: d.y, z: d.z,
            });
          }
        }
      }
    },

    dispose() {
      if (unsub) unsub();
      unsub = null;
      S.active.forEach((e) => { if (e.obj) e.obj.dispose(); });
      S.active.length = 0;
      if (G.treefall) G.treefall = null;
    },
  };
  return sys;
}

