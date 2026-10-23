/*
 * KEŞİF blok sistemi — envanter / sandık api yüzeyi (addendum §E; adresler 's12' çanta+hotbar, 'a0' zırh, 'c5' sandık).
 *
 *   createInventoryApi(G, S, helpers) → {
 *     getInventorySnapshot, moveStack, dropSlot, equipArmor, unequipArmor, selectHotbar, useSlot, setCreativeSlot, clearSlot, getChest }
 *   parseAddr(addr) → {kind:'s'|'a'|'c', index} | null           ('slotN'/'armorN'/'chestN' de okunur)
 *   tossItem(G,S,item,count,dur)                                  oyuncunun önüne fırlatır (Q tuşu / dropSlot)
 *
 * moveStack(from,to,{half}): aynı yığılabilir eşya birleşir (artan kalır), farklıysa yer değiştirir; half:true yığının yarısını taşır
 * (farklı eşya üstüne yarım taşıma yok). Zırh yuvası yalnız o yuvaya ait zırhı kabul eder. Sandık adresi yalnız sandık açıkken geçerlidir.
 * Her değişiklik envanter dinleyicilerini (çekirdek: hotbar/zırh senkronu) ve 'inventoryChanged'i (kare başına bir kez) tetikler.
 * Yaratıcı modda (sınırsız envanter) eşya yere fırlatılmaz; clearSlot yuvayı siler. Macera'da clearSlot eşyayı yere atar (yok etmez).
 */
import {
  ARMOR_SLOTS, ITEMS, itemByKey, maxDurability,
} from '../sim/items.js';
import { eatNow } from './blocksEat.js';
import { cloneEnch, magicDescribe } from '../sim/magicEnchant.js';
import { CHEST_SIZE } from './blocksChest.js';
import { maxCharge, techDescribe } from '../sim/techCharge.js';

const ADDR_KINDS = {
  s: 's', slot: 's', a: 'a', armor: 'a', c: 'c', chest: 'c',
};

export function parseAddr(addr) {
  if (typeof addr !== 'string') return null;
  const m = /^(slot|armor|chest|s|a|c)(\d{1,3})$/.exec(addr);
  if (!m) return null;
  return { kind: ADDR_KINDS[m[1]], index: Number(m[2]) };
}

function viewSlot(s) {
  if (!s || !s.item || !(s.count > 0)) {
    return {
      item: null, count: 0, dur: null, maxDur: 0,
    };
  }
  const v = {
    item: s.item, count: s.count, dur: s.dur === undefined ? null : s.dur, maxDur: maxDurability(s.item),
  };
  if (s.ench) {
    v.ench = cloneEnch(s.ench); // büyülü eşya: {anahtar: seviye} + ipucu satırları (mor metin)
    v.lines = magicDescribe(s);
  }
  if (s.charge !== undefined) {
    // teknoloji eşyası: şarj/yakıt (yuva görünümünde şarj çubuğu + ipucu satırları)
    v.charge = s.charge;
    v.maxCharge = maxCharge(s.item);
    v.techLines = techDescribe(s);
  }
  return v;
}

export function tossItem(G, S, item, count, dur, ench, charge) {
  if (!G.em || typeof G.em.spawnItem !== 'function' || !G.body) return false;
  const l = G.look;
  const o = { vx: l.x * 4.2, vy: 2.4 + l.y * 3, vz: l.z * 4.2, delay: 1.6 };
  if (dur !== undefined && dur !== null) o.dur = dur;
  if (ench) o.ench = ench;
  if (charge !== undefined && charge !== null) o.charge = charge;
  const e = G.eyeSim || G.body;
  const ey = G.eyeSim ? e.y - 0.3 : G.body.y + 1.2;
  return !!G.em.spawnItem(item, count, e.x + l.x * 0.5, ey, e.z + l.z * 0.5, o);
}

function armorIndexFor(item) {
  const it = itemByKey(item);
  return it && it.armor ? ARMOR_SLOTS.indexOf(it.armor.slot) : -1;
}

export function createInventoryApi(G, S) {
  const inv = () => G.inventory;

  /** Adresin bulunduğu dizi (zırh/çanta/sandık) ya da null. */
  function listOf(kind) {
    if (kind === 's') return inv().slots;
    if (kind === 'a') return inv().armor;
    if (kind === 'c') return S.chestPos ? G.chests.get(S.chestPos.x + ',' + S.chestPos.y + ',' + S.chestPos.z) || null : null;
    return null;
  }

  function accepts(kind, index, slot) {
    if (kind !== 'a') return true;
    return armorIndexFor(slot.item) === index;
  }

  function touch() {
    G._invDirty = true;
    inv()._emit();
  }

  /** Sandığa eşya koyma: 'chestStored' olayı (görev: "sandığa bir eşya koy"). Yalnız çantadan sandığa. */
  function moveStack(from, to, opts) {
    const f = parseAddr(from);
    const t = parseAddr(to);
    const src = f && f.kind !== 'c' ? listOf(f.kind) : null;
    const moved = src && src[f.index] ? src[f.index] : null;
    const item = moved ? moved.item : null;
    const ok = moveStackInner(from, to, opts);
    if (ok && item && t && t.kind === 'c' && f.kind !== 'c') G.emit({ type: 'chestStored', item });
    return ok;
  }

  function moveStackInner(from, to, opts) {
    const f = parseAddr(from);
    const t = parseAddr(to);
    if (!f || !t || (f.kind === t.kind && f.index === t.index)) return false;
    const fl = listOf(f.kind);
    const tl = listOf(t.kind);
    if (!fl || !tl || f.index >= fl.length || t.index >= tl.length) return false;
    const a = fl[f.index];
    if (!a) return false;
    const b = tl[t.index];
    const half = !!(opts && opts.half) && a.count > 1 && a.dur === undefined;
    const n = half ? Math.floor(a.count / 2) : a.count;
    if (!accepts(t.kind, t.index, a)) return false;
    const it = itemByKey(a.item);
    if (!b) {
      if (half) {
        tl[t.index] = { item: a.item, count: n };
        a.count -= n;
      } else {
        tl[t.index] = a;
        fl[f.index] = null;
      }
      touch();
      return true;
    }
    const mergeable = b.item === a.item && a.dur === undefined && b.dur === undefined && it && it.stack > 1;
    if (mergeable) {
      const room = it.stack - b.count;
      if (room > 0) {
        const m = Math.min(room, n);
        b.count += m;
        a.count -= m;
        if (a.count <= 0) fl[f.index] = null;
        touch();
        return true;
      }
    }
    if (half) return false;
    if (!accepts(f.kind, f.index, b)) return false;
    tl[t.index] = a;
    fl[f.index] = b;
    touch();
    return true;
  }

  function dropSlot(addr, count) {
    const p = parseAddr(addr);
    if (!p || p.kind === 'c' || inv().infinite) return false;
    const list = listOf(p.kind);
    const s = list ? list[p.index] : null;
    if (!s) return false;
    const n = count === undefined || count === null ? s.count : Math.max(1, Math.min(s.count, Math.floor(count)));
    const dur = s.dur;
    if (!tossItem(G, S, s.item, n, dur, s.ench, s.charge)) return false;
    s.count -= n;
    if (s.count <= 0) list[p.index] = null;
    touch();
    return true;
  }

  function equipArmor(addr) {
    const p = parseAddr(addr);
    if (!p || p.kind !== 's') return false;
    return inv().equip(p.index);
  }

  function unequipArmor(index) {
    let i = index;
    if (typeof index === 'string') {
      const p = parseAddr(index);
      if (!p || p.kind !== 'a') return false;
      i = p.index;
    }
    if (!(i >= 0 && i < inv().armorSize)) return false;
    return inv().unequip(i);
  }

  function selectHotbar(i) {
    const n = Math.floor(Number(i));
    if (Number.isFinite(n)) inv().selected = n;
    return inv().selected;
  }

  function useSlot(addr) {
    const p = parseAddr(addr);
    if (!p || p.kind !== 's') return false;
    const s = inv().slotAt(p.index);
    if (!s) return false;
    const it = ITEMS[s.item];
    if (!it) return false;
    // büyü sistemi: iksir (içer) / mana kristali (kullan); asa için undefined → eline alma akışı
    if (typeof G.magicUseSlot === 'function') {
      const r = G.magicUseSlot(p.index);
      if (r !== undefined) return r;
    }
    // teknoloji: jetpack'e Enerji Hücresi yükle (undefined → eline alma / giyme akışı)
    if (typeof G.techUseSlot === 'function') {
      const r = G.techUseSlot(p.index);
      if (r !== undefined) return r;
    }
    if (it.food) return eatNow(G, S, p.index);
    if (it.armor) return inv().equip(p.index);
    if (p.index < inv().hotbarSize) {
      inv().selected = p.index;
      return true;
    }
    // çantadaki eşya: seçili hotbar yuvasıyla yer değiştir (eline al)
    return inv().swap(p.index, inv().selected);
  }

  function setCreativeSlot(index, itemKey) {
    if (!inv().infinite) return false;
    const i = Math.floor(Number(index));
    const it = itemByKey(itemKey);
    if (!it || !(i >= 0 && i < inv().size)) return false;
    return inv().setSlot(i, it.key, it.stack);
  }

  function clearSlot(addr) {
    const p = parseAddr(addr);
    if (!p) return false;
    const list = listOf(p.kind);
    if (!list || p.index >= list.length || !list[p.index]) return false;
    if (inv().infinite || p.kind === 'c') {
      list[p.index] = null;
      touch();
      return true;
    }
    return dropSlot(addr);
  }

  function getInventorySnapshot() {
    const v = inv();
    const slots = new Array(v.size);
    for (let i = 0; i < v.size; i++) slots[i] = viewSlot(v.slots[i]);
    const armor = new Array(v.armorSize);
    for (let i = 0; i < v.armorSize; i++) armor[i] = viewSlot(v.armor[i]);
    return {
      slots, armor, selected: v.selected, heat: Math.round(v.heat), creative: !!v.infinite,
    };
  }

  function getChest() {
    if (!S.chestPos) return null;
    const list = listOf('c');
    if (!list) return null;
    const slots = new Array(CHEST_SIZE);
    for (let i = 0; i < CHEST_SIZE; i++) slots[i] = viewSlot(list[i]);
    return { pos: { x: S.chestPos.x, y: S.chestPos.y, z: S.chestPos.z }, slots };
  }

  return {
    getInventorySnapshot,
    moveStack,
    dropSlot,
    equipArmor,
    unequipArmor,
    selectHotbar,
    useSlot,
    setCreativeSlot,
    clearSlot,
    getChest,
  };
}
