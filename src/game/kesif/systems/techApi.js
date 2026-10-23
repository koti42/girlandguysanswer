/*
 * KEŞİF tech sistemi — genel api (KESIF_TECH.md §8 + panel yardımcıları).
 *
 *   getMachineInfo(x?,y?,z?) → bilgi | null    (koordinatsız: açık makine paneli) + panel için hazır listeler:
 *       jenerator: fuels:[{item,count,seconds}] · ocak: smeltables:[{item,count,out}] · pil/sarj: chargeNeed ·
 *       isinlayici/asansor: onPad · matkap: maxDepth
 *   getMachineUi() → {open, pos, type} | null
 *   setMachineConfig(x,y,z,cfg) → {ok, message?}        başarıda HUD yayınlanır
 *   machineAction(x,y,z,{type,…}) → {ok, message?}       bkz. techUse.machineAction
 *   getTechHud() → techHud(...)     refuelJetpack() → {ok,…}     scan() → {ok,…}
 *   shootPortal(color) → bool       ekran ortasından (G.eyeSim + G.look) portal atar; getPortals() → {mavi, turuncu} çerçeveler
 *   getTechInfo() → özet (hata ayıklama/test): makineler, ağlar, portallar, tarayıcı
 */
import { raycastBlocks, createRayHit } from '../sim/raycast.js';
import {
  FREQ_SYMBOLS, GENERATOR_FUEL, TECH_RATES,
} from '../sim/techData.js';
import { furnaceRecipe } from '../sim/techMachines.js';
import { inventoryChargeNeed } from '../sim/techCharge.js';
import { portalGunStatus } from '../sim/techMods.js';
import { techHud } from '../sim/tech.js';
import { machineAction, onPad } from './techUse.js';

const NONE = { ok: false, reason: 'yok', message: 'Şu an yapılamıyor.' };

export function createTechApi(T, gear, pg) {
  const G = T.G;
  const hit = createRayHit();
  const rayOpts = { out: hit };

  function inventoryLists(info) {
    const inv = G.inventory;
    const counts = {};
    for (let i = 0; i < inv.size; i++) {
      const s = inv.slots[i];
      if (s && s.item && s.count > 0) counts[s.item] = (counts[s.item] || 0) + s.count;
    }
    if (info.type === 'jenerator') {
      info.fuels = Object.keys(counts).filter((k) => GENERATOR_FUEL[k]).map((k) => ({ item: k, count: counts[k], seconds: GENERATOR_FUEL[k] }));
    } else if (info.type === 'ocak') {
      info.smeltables = Object.keys(counts).filter((k) => furnaceRecipe(k)).map((k) => {
        const r = furnaceRecipe(k);
        return { item: k, count: counts[k], out: r ? r.out : null, outCount: r ? r.count : 1 };
      });
    } else if (info.type === 'pil' || info.type === 'sarj') {
      info.chargeNeed = Math.round(inventoryChargeNeed(inv));
    } else if (info.type === 'isinlayici' || info.type === 'asansor') {
      info.onPad = onPad(G, info.pos.x, info.pos.y, info.pos.z);
    } else if (info.type === 'matkap') {
      info.maxDepth = TECH_RATES.drill.maxDepth;
    }
    return info;
  }

  function resolvePos(x, y, z) {
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) return { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
    const p = G.techUi && G.techUi.pos;
    return p ? { x: p.x, y: p.y, z: p.z } : null;
  }

  return {
    getMachineInfo(x, y, z) {
      if (G.mode !== 'macera') return null;
      const p = resolvePos(x, y, z);
      if (!p) return null;
      const info = T.tech.machineInfo(p.x, p.y, p.z);
      if (!info || !info.ok) return null;
      info.symbols = info.symbols || null;
      info.freqNames = FREQ_SYMBOLS;
      return inventoryLists(info);
    },
    getMachineUi() {
      const p = G.techUi && G.techUi.pos;
      return G.ui === 'machine' && p ? { open: true, pos: { x: p.x, y: p.y, z: p.z }, type: G.techUi.type || null } : null;
    },
    setMachineConfig(x, y, z, cfg) {
      if (G.mode !== 'macera') return NONE;
      const p = resolvePos(x, y, z);
      if (!p) return NONE;
      const r = T.tech.setMachineConfig(p.x, p.y, p.z, cfg);
      if (r.ok) {
        T.hudDirty = true;
        G.sound('ui_click', undefined, { vol: 0.45 });
      } else G.sound('tech:deny', undefined, { vol: 0.4 });
      return r;
    },
    machineAction(x, y, z, a) {
      const p = resolvePos(x, y, z);
      if (!p) return NONE;
      return machineAction(T, p.x, p.y, p.z, a);
    },
    getTechHud() {
      const b = G.body;
      return techHud(T.tech, G.inventory, { pos: { x: b.x, y: b.y + 0.9, z: b.z }, radius: 8 });
    },
    refuelJetpack() {
      return G.mode === 'macera' ? gear.refuel() : NONE;
    },
    scan() {
      return G.mode === 'macera' ? gear.scanNow() : NONE;
    },
    shootPortal(color) {
      if (G.mode !== 'macera' || (color !== 'mavi' && color !== 'turuncu')) return false;
      if (!portalGunStatus(G.inventory).has) return false;
      const h = raycastBlocks(G.world, G.eyeSim, G.look, 48, rayOpts);
      return h ? pg.shoot(color, h) : false;
    },
    getPortals() {
      return T.tech.portalFrames();
    },
    getTechInfo() {
      const tech = T.tech;
      const nets = tech.netInfo.map((n) => ({
        nodes: n.nodes, machines: n.machines, gen: n.gen, demand: n.demand, supplied: n.supplied, stored: n.stored, cap: n.cap, live: n.live,
      }));
      const machines = [];
      tech.machines.forEach((st, key) => {
        machines.push({
          key, type: st.t, powered: !!tech._powered.get(key), on: !!st.on,
        });
      });
      return {
        machines: machines.length,
        list: machines.slice(0, 64),
        networks: nets,
        portals: tech.portalFrames(),
        scanner: { pings: tech.scanner.pings.length },
        time: tech.time,
        jetpackThrusting: !!T.jet.thrusting,
      };
    },
  };
}
