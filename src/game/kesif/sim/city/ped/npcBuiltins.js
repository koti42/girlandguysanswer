/*
 * KEŞİF sim/city/ped — YERLEŞİK EFEKT İŞLEYİCİLERİ (npc_vendors). SAF (oyun nesneleri `host` ile gelir; Inventory/cüzdan arayüzü yeterli).
 *
 *   installBuiltins(bus, host) → off()      give take kredi flag rel vendor garage hint heal end işleyicilerini kurar
 *   host: {city() → dims.neon.city blobu, inv {count, canAdd, add, remove}, wallet {get, spend, add}, emit(e), drop?(item, n),
 *          queue(uiReq {ui:'vendor'|'garage', id?}), hintText?(text), heal?(hp, food) → bool, day() → gün}
 * Kredi hediyesi (n>0) günde ≤150 (SHOP_LIMITS.creditGift); aşan kısım verilmez (ileti: "Bugünlük bu kadar."). Harcama (n<0) başarısızsa {ok:false} → seçenek iptal olur.
 */
import { ITEMS } from '../../items.js';
import { NPC_HINTS } from './npcData.js';
import {
  SHOP_LIMITS, bumpRel, setFlag, shopOf, rollDay,
} from './npcSave.js';

export function installBuiltins(bus, host) {
  const offs = [];
  const on = (k, fn) => offs.push(bus.on(k, fn));

  on('give', (e) => {
    const it = ITEMS[e.item];
    if (!it) return { ok: false, reason: 'yok' };
    const left = host.inv.add(e.item, e.n);
    if (left > 0 && typeof host.drop === 'function') host.drop(e.item, left);
    return { ok: true, msg: it.name + ' x' + e.n + ' alındı.' + (left > 0 ? ' (Çanta dolu: yere düştü.)' : '') };
  });

  on('take', (e) => {
    const it = ITEMS[e.item];
    if (!it || host.inv.count(e.item) < e.n || !host.inv.remove(e.item, e.n)) return { ok: false, reason: 'yetersiz', msg: 'Yeterli eşyan yok.' };
    return { ok: true };
  });

  on('kredi', (e) => {
    if (e.n < 0) {
      if (!host.wallet.spend(-e.n, 'diyalog')) return { ok: false, reason: 'kredi', msg: 'Yeterli Kredin yok.' };
      return { ok: true, msg: e.n + ' Kredi harcandı.' };
    }
    const city = host.city();
    const s = shopOf(city);
    if (s) rollDay(city, host.day ? host.day() : 0);
    const used = s ? s.kg : 0;
    const give = Math.max(0, Math.min(e.n, SHOP_LIMITS.creditGift - used));
    if (give <= 0) return { ok: true, msg: 'Bugünlük bu kadar Kredi hediyesi yeter.' };
    if (!host.wallet.add(give, 'diyalog')) return { ok: false, reason: 'cuzdan' };
    if (s) s.kg = used + give;
    return { ok: true, msg: '+' + give + ' Kredi.' };
  });

  on('flag', (e) => {
    const ok = setFlag(host.city(), e.key, e.v);
    if (ok) host.emit({ type: 'npcFlag', key: e.key, v: e.v === true ? 1 : e.v === false ? 0 : e.v });
    return { ok };
  });

  on('rel', (e, ctx) => {
    const id = ctx && ctx.npc ? ctx.npc.id : '';
    if (!id) return { ok: false, reason: 'npc' };
    bumpRel(host.city(), id, e.d);
    return { ok: true };
  });

  on('vendor', (e, ctx) => {
    const id = e.id || (ctx && ctx.npc ? ctx.npc.id : '');
    if (!id) return { ok: false, reason: 'npc' };
    host.queue({ ui: 'vendor', id });
    return { ok: true };
  });

  on('garage', () => {
    host.queue({ ui: 'garage' });
    return { ok: true };
  });

  on('hint', (e) => {
    const t = Object.prototype.hasOwnProperty.call(NPC_HINTS, e.id) ? NPC_HINTS[e.id] : '';
    if (!t) return { ok: false, reason: 'yok' };
    if (typeof host.hintText === 'function') host.hintText(t);
    return { ok: true };
  });

  on('heal', (e) => {
    if (typeof host.heal !== 'function') return { ok: false, reason: 'yok' };
    const did = host.heal(e.hp || 0, e.food || 0);
    return did ? { ok: true, msg: 'Kendini iyi hissediyorsun.' } : { ok: true, msg: 'Zaten formdasın.' };
  });

  on('end', () => ({ ok: true }));

  return () => offs.forEach((o) => o());
}
