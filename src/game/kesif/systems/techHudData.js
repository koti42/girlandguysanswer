/*
 * KEŞİF tech sistemi — HUD alanları (G.hud.energy / jetpack / charge / scanner / shield / portals). Yalnız macera; ≈ 10 Hz.
 *
 *   writeTechHud(T)        sim/tech.techHud sonucunu HUD'a yazar (macera dışında hepsini boşaltır)
 *   headingTick(T)         tarayıcı okları için oyuncu yönünü her karede günceller (ucuz)
 */
import { itemByKey } from '../sim/items.js';
import { portalGunStatus } from '../sim/techMods.js';
import { PORTAL_GUN_ITEM } from '../sim/techData.js';
import { techHud } from '../sim/tech.js';

const POS = { x: 0, y: 0, z: 0 };
/** yaw → [−π, π] (HUD sınırı ±10; oyuncu yaw'ı ±4π'ye kadar gidebilir). */
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function clear(hud) {
  if (hud.energy) hud.energy = null;
  if (hud.jetpack) hud.jetpack = null;
  if (hud.charge) hud.charge = null;
  if (hud.scanner) hud.scanner = null;
  if (hud.shield) hud.shield = null;
  if (hud.portals) hud.portals = null;
}

export function writeTechHud(T) {
  const G = T.G;
  const hud = G.hud;
  if (G.mode !== 'macera' || !T.tech) {
    clear(hud);
    return;
  }
  const b = G.body;
  POS.x = b.x; POS.y = b.y + 0.9; POS.z = b.z;
  const h = techHud(T.tech, G.inventory, { pos: POS, radius: 8 });
  hud.energy = h.energy;
  hud.jetpack = h.jetpack ? Object.assign({}, h.jetpack, { thrusting: !!T.jet.thrusting }) : null;
  if (h.charge) {
    const it = itemByKey(h.charge.item);
    hud.charge = Object.assign({}, h.charge, { name: it ? it.name : '' });
  } else hud.charge = null;
  if (h.scanner) {
    hud.scanner = {
      charge: h.scanner.charge,
      max: h.scanner.max,
      empty: h.scanner.empty,
      nextIn: h.scanner.nextIn,
      heading: wrap(G.player.yaw),
      pings: h.scanner.pings.slice(0, 8),
    };
  } else hud.scanner = null;
  hud.shield = h.shield;
  const held = G.inventory ? G.inventory.heldItem() : null;
  const gun = held === PORTAL_GUN_ITEM;
  const any = !!(T.tech.portals.mavi || T.tech.portals.turuncu);
  if (gun || any) {
    const st = portalGunStatus(G.inventory);
    hud.portals = {
      held: gun,
      mavi: !!T.tech.portals.mavi,
      turuncu: !!T.tech.portals.turuncu,
      charge: st.charge,
      max: st.max,
      cells: st.cells,
      canFire: st.canFire,
      next: !T.tech.portals.mavi ? 'mavi' : !T.tech.portals.turuncu ? 'turuncu' : 'mavi',
      mode: G.portalMode === 'boyut' ? 'boyut' : 'normal',
    };
  } else hud.portals = null;
}

export function headingTick(T) {
  const s = T.G.hud.scanner;
  if (s) s.heading = wrap(T.G.player.yaw);
}
