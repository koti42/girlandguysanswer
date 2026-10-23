/*
 * KEŞİF sim — TEKNOLOJİ: tek giriş (barrel). `sim/index.js`e EKLENMEDİ → doğrudan `import … from '../sim/tech.js'`.
 * Belge: scratchpad/KESIF_TECH.md. Sim kuralları: saf, Math.random/Date.now yok, es2020.
 *
 *   createTech(seed) → TechState        techHud(tech, inv, opts?) → {energy, jetpack, charge, scanner, shield}
 */
import { TechState } from './techState.js';
import { jetpackHud, shieldStatus } from './techMods.js';
import { scannerHud } from './techScanner.js';
import { chargeOf, maxCharge, techOf } from './techCharge.js';
import { parseKey } from './techPower.js';

export * from './techData.js';
export * from './techCharge.js';
export * from './techMods.js';
export * from './techScanner.js';
export * from './techPortal.js';
export {
  TechState, machineContents,
} from './techState.js';
export {
  BUTTON_MODES, DRILL_MODES, TYPE_BASE, cleanFreq, createMachine, drillCells, drillTimeFor, furnaceInputs, furnaceRecipe, furnaceTime,
  insertIntoSlots, isMachineType, sanitizeMachine, skyAccess, visualBlockId, visualOn,
} from './techMachines.js';
export {
  buildNetworks, compareKeys, parseKey, posKey, solveNetwork,
} from './techPower.js';

export function createTech(seed) {
  return new TechState({ seed });
}

/**
 * HUD alanları. opts: {pos:{x,y,z}, radius=8}.
 *   energy   {value, max, gen, use, net, live, nodes, name} | null   — pos'a en yakın (radius içinde) makinenin ağı
 *   jetpack  {fuel, max, fraction, empty, cells} | null
 *   charge   {item, name, value, max, fraction} | null               — ELDEKİ şarjlı eşya (jetpack hariç değil)
 *   scanner  {charge, max, pings, nextIn, empty} | null
 *   shield   {pieces, charge, max, fraction} | null
 */
export function techHud(tech, inv, opts) {
  const o = opts || {};
  let energy = null;
  if (tech && o.pos) {
    const r = o.radius > 0 ? o.radius : 8;
    let best = null;
    let bd = r * r;
    tech.machines.forEach((st, key) => {
      const p = parseKey(key);
      if (!p) return;
      const dx = p[0] + 0.5 - o.pos.x;
      const dy = p[1] + 0.5 - o.pos.y;
      const dz = p[2] + 0.5 - o.pos.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d <= bd && tech.nodeNet.has(key)) {
        bd = d;
        best = key;
      }
    });
    if (best) {
      const info = tech.netInfo[tech.nodeNet.get(best)];
      if (info) {
        energy = {
          value: info.stored,
          max: info.cap,
          gen: info.gen,
          use: info.supplied,
          net: Math.round((info.gen - info.supplied) * 100) / 100,
          live: info.live,
          standby: !!info.standby,
          nodes: info.nodes,
          name: tech.machines.get(best).t,
        };
      }
    }
  }
  const held = inv && typeof inv.held === 'function' ? inv.held() : null;
  let charge = null;
  if (held && techOf(held.item) && maxCharge(held.item) > 0) {
    const max = maxCharge(held.item);
    charge = {
      item: held.item, value: chargeOf(held), max, fraction: max > 0 ? Math.min(1, chargeOf(held) / max) : 0,
    };
  }
  const sh = inv ? shieldStatus(inv) : null;
  return {
    energy,
    jetpack: inv ? jetpackHud(inv) : null,
    charge,
    scanner: tech && inv ? scannerHud(tech, inv) : null,
    shield: sh && sh.pieces > 0 ? sh : null,
  };
}
