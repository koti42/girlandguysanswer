/*
 * KEŞİF blok sistemi — sandıklar: dünya konumuna bağlı sanal envanter (G.chests: "x,y,z" → 27 yuva).
 *
 *   CHEST_SIZE = 27
 *   chestKey(x,y,z)
 *   lootAt(G, x,y,z)                 yapı verisindeki belirlenimci ganimet [{item,count}] (macera; yoksa [])
 *   slotsFromLoot(list)              → 27 yuvalık dizi ({item,count,dur?}|null)
 *   openChestSlots(G, x,y,z)         yoksa ganimetle doldurup G.chests'e yazar; döner: slots
 *   takeChestContents(G, x,y,z)      sandık kırılırken: içeriği [{item,count,dur?}] verir ve kaydı siler
 *   serializeChests(G) / restoreChests(G, data)       kayıt (yalnız açılmış/değişmiş sandıklar)
 *
 * Ganimet yalnız (dünya tohumu, konum) ile belirlenir (loot.lootForChest); sandık bir kez açılınca içeriği
 * G.chests'te yaşar → yeniden açınca aynı (alınmış) hali görülür. Yerleştirilen sandıklar boş başlar.
 */
import { structuresInRegion } from '../sim/structures.js';
import { itemByKey } from '../sim/items.js';
import { cloneEnch, sanitizeEnch } from '../sim/magicEnchant.js';
import { sanitizeCharge, startCharge } from '../sim/techCharge.js';

export const CHEST_SIZE = 27;

export function chestKey(x, y, z) {
  return x + ',' + y + ',' + z;
}

/** Yapı tanımındaki bu sandığın ganimeti; macera dışı modlarda ve yapı sandığı değilse []. */
export function lootAt(G, x, y, z) {
  if (G.mode !== 'macera' || !G.world) return [];
  let found = null;
  try {
    const list = structuresInRegion(G.world.seed, x, z, x, z);
    for (let i = 0; i < list.length && !found; i++) {
      const cs = list[i].chests || [];
      for (let k = 0; k < cs.length; k++) {
        if (cs[k].x === x && cs[k].y === y && cs[k].z === z) {
          found = cs[k].loot;
          break;
        }
      }
    }
  } catch {
    found = null;
  }
  return found || [];
}

export function slotsFromLoot(list) {
  const slots = new Array(CHEST_SIZE).fill(null);
  let n = 0;
  for (let i = 0; i < list.length && n < CHEST_SIZE; i++) {
    const it = itemByKey(list[i].item);
    if (!it) continue;
    let left = Math.max(1, Math.floor(list[i].count));
    while (left > 0 && n < CHEST_SIZE) {
      const c = it.durability ? 1 : Math.min(it.stack, left);
      const s = { item: it.key, count: c };
      if (it.durability) s.dur = list[i].dur !== undefined ? list[i].dur : it.durability;
      if (it.tech && it.tech.chargeMax > 0) s.charge = list[i].charge !== undefined ? sanitizeCharge(list[i].charge, it.key) : startCharge(it.key); // teknoloji eşyası şarjlı gelir
      slots[n++] = s;
      left -= c;
    }
  }
  return slots;
}

export function openChestSlots(G, x, y, z) {
  const key = chestKey(x, y, z);
  let slots = G.chests.get(key);
  if (!slots) {
    slots = slotsFromLoot(lootAt(G, x, y, z));
    G.chests.set(key, slots);
  }
  return slots;
}

/** Kırılan sandığın içeriği (ve henüz açılmamış yapı sandığının ganimeti). Kaydı siler. */
export function takeChestContents(G, x, y, z) {
  const key = chestKey(x, y, z);
  const slots = G.chests.get(key) || slotsFromLoot(lootAt(G, x, y, z));
  G.chests.delete(key);
  const out = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s && s.count > 0) {
      const d = s.dur !== undefined ? { item: s.item, count: s.count, dur: s.dur } : { item: s.item, count: s.count };
      if (s.ench) d.ench = cloneEnch(s.ench); // büyülü eşya sandık kırılınca da büyüsünü korur
      if (s.charge !== undefined) d.charge = s.charge; // şarjlı teknoloji eşyası şarjını korur
      out.push(d);
    }
  }
  return out;
}

export function serializeChests(G) {
  const out = [];
  G.chests.forEach((slots, key) => {
    out.push([key, slots.map((s) => {
      if (!s) return 0;
      // şarjlı eşya: [item,1,dur|0,ench|0,charge] (saveSanitize / Inventory.toJSON ile aynı)
      if (s.charge !== undefined) return [s.item, 1, s.dur === undefined ? 0 : s.dur, s.ench ? cloneEnch(s.ench) : 0, s.charge];
      if (s.dur === undefined) return [s.item, s.count];
      return s.ench ? [s.item, s.count, s.dur, s.ench] : [s.item, s.count, s.dur];
    })]);
  });
  return out;
}

export function restoreChests(G, data) {
  G.chests.clear();
  if (!Array.isArray(data)) return;
  for (let i = 0; i < data.length && i < 4096; i++) {
    const e = data[i];
    if (!Array.isArray(e) || typeof e[0] !== 'string' || !/^-?\d+,-?\d+,-?\d+$/.test(e[0]) || !Array.isArray(e[1])) continue;
    const slots = new Array(CHEST_SIZE).fill(null);
    for (let k = 0; k < CHEST_SIZE && k < e[1].length; k++) {
      const r = e[1][k];
      if (!Array.isArray(r)) continue;
      const it = itemByKey(r[0]);
      const c = Math.floor(Number(r[1]));
      if (!it || !(c >= 1)) continue;
      const s = { item: it.key, count: Math.min(c, it.stack) };
      if (it.durability) {
        const d = Math.floor(Number(r[2]));
        s.dur = Number.isFinite(d) ? Math.max(1, Math.min(it.durability, d)) : it.durability;
        s.count = 1;
        const en = r.length > 3 ? sanitizeEnch(r[3], it.key) : null;
        if (en) s.ench = en;
      }
      if (it.tech && it.tech.chargeMax > 0) {
        s.count = 1;
        s.charge = sanitizeCharge(r[4], it.key);
      }
      slots[k] = s;
    }
    G.chests.set(e[0], slots);
  }
}
