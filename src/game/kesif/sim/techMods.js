/*
 * KEŞİF sim — TEKNOLOJİ: oyuncu "mods" katkısı (jetpack itişi, elektrikli alet hızı, enerji kalkanı) ve jetpack/kalkan işlevleri.
 * magicMods.computeMods sonunda applyTechMods'u çağırır (kimlik varsayılan). Fizik `mods.thrust/thrustVy`, survival `shieldHook`,
 * blocks.breakTime `mods.digMul` okur.
 *
 *   applyTechMods(mods, inv)                 mods alanları: thrust (itiş ivmesi b/sn², 0 = yok) · thrustVy (azami yükselme hızı)
 *                                            · shield (0..0,72 emilen hasar oranı) · digMul · fallMul
 *   findJetpack(inv) → {slot,index}|null     (çubukta taşınan)         jetpackStatus(inv) → {has, fuel, max, empty, cells}
 *   refuelJetpack(inv) → {ok, added, reason?}                          (1 Enerji Hücresi → +220 yakıt)
 *   tickJetpack(inv, body, opts) → {burned, fuel, max, empty, refueled, event|null}   body.thrustT'yi (itiş süresi) yakıta çevirir
 *   jetpackHud(inv) → {fuel, max, fraction, empty, cells} | null
 *   createShieldHook(inv) → (dmg, type) => kalan hasar     (survival state.shieldHook'a atanır)
 *   shieldStatus(inv) → {pieces, charge, max, fraction}
 *   onBlockBrokenWithTool(inv) → bool      (elektrikli alet kırdığı blok başına şarj harcar)
 *   portalGunStatus(inv) → {has, charge, max, cells, canFire}      portalGunFire(inv) → {ok, reloaded?, charge?, reason?, message?}
 *       (açık dünya portal atışı: 1 şarj; şarj yoksa 1 Enerji Hücresi → +12 şarj. Yerleştirme BAŞARILI olduktan sonra çağır; geçersiz atış bedava)
 */
import {
  ELECTRIC_TOOL, ITEM_CELL, JETPACK, PORTAL_GUN, PORTAL_GUN_ITEM, SHIELD,
} from './techData.js';
import {
  armorWith, chargeOf, consumeHeldCharge, drainSlot, addChargeToSlot, findCarried, maxCharge, techOf,
} from './techCharge.js';

const MAX_SHIELD_FRAC = 0.72;

/** magicMods.IDENTITY_MODS'a eklenen alanlar (kimlik değerleri). */
export const TECH_MOD_KEYS = Object.freeze({ thrust: 0, thrustVy: 0, shield: 0 });

export function applyTechMods(m, inv) {
  if (!inv) return m;
  const held = typeof inv.held === 'function' ? inv.held() : null;
  if (held) {
    const t = techOf(held.item);
    if (t && t.kind === 'elektrikli') m.digMul *= chargeOf(held) > 0 ? ELECTRIC_TOOL.chargedMul : ELECTRIC_TOOL.deadMul;
  }
  const jp = findJetpack(inv);
  if (jp && chargeOf(jp.slot) > 0) {
    m.thrust = JETPACK.accel;
    m.thrustVy = JETPACK.maxVy;
    m.fallMul = Math.min(m.fallMul, JETPACK.fallMul);
  }
  const pieces = armorWith(inv, 'kalkan').filter((p) => chargeOf(p.slot) > 0).length;
  if (pieces > 0) m.shield = Math.min(MAX_SHIELD_FRAC, pieces * SHIELD.perPiece);
  return m;
}

/* ------------------------------------------------------------------------------------------------
 * Jetpack
 * ---------------------------------------------------------------------------------------------- */
export function findJetpack(inv) {
  const f = findCarried(inv, 'jetpack', { hotbarOnly: true });
  return f ? { slot: f.slot, index: f.index } : null;
}

export function jetpackStatus(inv) {
  const jp = findJetpack(inv);
  const cells = inv && typeof inv.count === 'function' ? inv.count(ITEM_CELL) : 0;
  if (!jp) return { has: false, fuel: 0, max: 0, empty: true, cells };
  const fuel = chargeOf(jp.slot);
  return { has: true, fuel, max: maxCharge(jp.slot.item), empty: fuel <= 0, cells };
}

export function jetpackHud(inv) {
  const s = jetpackStatus(inv);
  if (!s.has) return null;
  return { fuel: s.fuel, max: s.max, fraction: s.max > 0 ? Math.min(1, s.fuel / s.max) : 0, empty: s.empty, cells: s.cells };
}

/** 1 Enerji Hücresi tüketip yakıt ekler (en çok hücre başına cellFuel; yer yoksa 'dolu'). */
export function refuelJetpack(inv) {
  const jp = findJetpack(inv);
  if (!jp) return { ok: false, reason: 'yok', message: 'Çubukta jetpack yok.' };
  const max = maxCharge(jp.slot.item);
  const room = max - chargeOf(jp.slot);
  if (room < JETPACK.cellFuel * 0.5) return { ok: false, reason: 'dolu', message: 'Jetpack yakıtı zaten dolu.' };
  if (!inv.infinite && inv.count(ITEM_CELL) < 1) return { ok: false, reason: 'hucre', message: 'Enerji Hücren yok.' };
  if (!inv.infinite && !inv.remove(ITEM_CELL, 1)) return { ok: false, reason: 'hucre', message: 'Enerji Hücren yok.' };
  const added = addChargeToSlot(jp.slot, JETPACK.cellFuel);
  if (typeof inv._emit === 'function') inv._emit();
  return { ok: true, added };
}

/**
 * Fizik adımından sonra çağrılır: body.thrustT (bu adımlarda itiş süresi, sn) yakıta çevrilir ve sıfırlanır (kesir body.fuelAcc'te).
 * opts: {autoRefuel=true}. event: {type:'jetpackFuel', fuel, max, burned, empty} (itiş olduysa ya da yakıt bittiyse).
 */
export function tickJetpack(inv, body, opts) {
  const t = body && body.thrustT > 0 ? body.thrustT : 0;
  if (body) body.thrustT = 0;
  const jp = findJetpack(inv);
  if (!jp) return { burned: 0, fuel: 0, max: 0, empty: true, refueled: false, event: null };
  const max = maxCharge(jp.slot.item);
  let refueled = false;
  if (t > 0 && !(inv && inv.infinite)) {
    // yakıt tamsayıdır: kesirli borç body.fuelAcc'te birikir (her adımda yukarı yuvarlanıp hızlı tükenmesin)
    const owe = (body.fuelAcc || 0) + t * JETPACK.fuelPerSec;
    const whole = Math.floor(owe);
    body.fuelAcc = owe - whole;
    if (whole > 0) drainSlot(jp.slot, whole);
    if (typeof inv._emit === 'function') inv._emit();
    if (chargeOf(jp.slot) <= 0 && (!opts || opts.autoRefuel !== false)) {
      refueled = refuelJetpack(inv).ok;
    }
  }
  const fuel = chargeOf(jp.slot);
  const empty = fuel <= 0;
  const event = t > 0 || (empty && body && body.thrusting)
    ? {
      type: 'jetpackFuel', fuel, max, burned: Math.round(t * 1000) / 1000, empty, refueled,
    }
    : null;
  return {
    burned: t, fuel, max, empty, refueled, event,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Enerji kalkanı (Kuantum Zırhı)
 * ---------------------------------------------------------------------------------------------- */
export function shieldStatus(inv) {
  const pieces = armorWith(inv, 'kalkan');
  let charge = 0;
  let max = 0;
  pieces.forEach((p) => {
    charge += chargeOf(p.slot);
    max += maxCharge(p.slot.item);
  });
  return {
    pieces: pieces.length, charge, max, fraction: max > 0 ? Math.min(1, charge / max) : 0,
  };
}

/**
 * Hasar kancası: şarjlı her Kuantum Zırhı parçası gelen hasarın %18'ini (en çok %72) emer; emilen her can için 6 şarj harcar.
 * Şarj yetmezse emilen miktar şarjın karşılayabildiği kadardır. Döner: kalan (can) hasar. hook.lastAbsorbed son emilen.
 */
export function createShieldHook(inv) {
  const hook = (dmg) => {
    hook.lastAbsorbed = 0;
    if (!(dmg > 0) || !inv || inv.infinite) return dmg;
    const pieces = armorWith(inv, 'kalkan').filter((p) => chargeOf(p.slot) > 0);
    if (pieces.length === 0) return dmg;
    const frac = Math.min(MAX_SHIELD_FRAC, pieces.length * SHIELD.perPiece);
    let total = 0;
    pieces.forEach((p) => { total += chargeOf(p.slot); });
    const absorbed = Math.min(dmg * frac, total / SHIELD.costPerHp);
    if (!(absorbed > 0)) return dmg;
    let need = Math.ceil(absorbed * SHIELD.costPerHp);
    pieces.sort((a, b) => chargeOf(b.slot) - chargeOf(a.slot) || a.index - b.index);
    for (let i = 0; i < pieces.length && need > 0; i++) need -= drainSlot(pieces[i].slot, need);
    hook.lastAbsorbed = absorbed;
    if (typeof inv._emit === 'function') inv._emit();
    return dmg - absorbed;
  };
  hook.lastAbsorbed = 0;
  return hook;
}

/* ------------------------------------------------------------------------------------------------
 * Portal Tabancası (açık dünya)
 * ---------------------------------------------------------------------------------------------- */
function heldPortalGun(inv) {
  const s = inv && typeof inv.held === 'function' ? inv.held() : null;
  return s && s.item === PORTAL_GUN_ITEM ? s : null;
}

export function portalGunStatus(inv) {
  const s = heldPortalGun(inv);
  const cells = inv && typeof inv.count === 'function' ? inv.count(ITEM_CELL) : 0;
  if (!s) return { has: false, charge: 0, max: 0, cells, canFire: false };
  const charge = chargeOf(s);
  return {
    has: true, charge, max: maxCharge(s.item), cells, canFire: !!inv.infinite || charge >= PORTAL_GUN.shotCost || cells > 0,
  };
}

/** Bir portal atışının bedelini öder (eldeki tabanca). Şarj biterse çantadan 1 Enerji Hücresi harcanıp +12 şarj yüklenir. */
export function portalGunFire(inv) {
  const s = heldPortalGun(inv);
  if (!s) return { ok: false, reason: 'yok', message: 'Elinde Portal Tabancası yok.' };
  if (inv.infinite) return { ok: true, reloaded: false, charge: chargeOf(s) };
  let reloaded = false;
  if (chargeOf(s) < PORTAL_GUN.shotCost) {
    if (inv.count(ITEM_CELL) < 1 || !inv.remove(ITEM_CELL, 1)) {
      return { ok: false, reason: 'sarj', message: 'Portal Tabancasının şarjı bitti: Enerji Hücresi gerekli.' };
    }
    addChargeToSlot(s, PORTAL_GUN.cellCharges);
    reloaded = true;
  }
  drainSlot(s, PORTAL_GUN.shotCost);
  if (typeof inv._emit === 'function') inv._emit();
  return { ok: true, reloaded, charge: chargeOf(s) };
}

/** Elektrikli alet bir blok kırdı: 2 şarj harcar. Elde şarjlı elektrikli alet yoksa false (normal aşınma yolu). */
export function onBlockBrokenWithTool(inv) {
  const held = inv && typeof inv.held === 'function' ? inv.held() : null;
  const t = held ? techOf(held.item) : null;
  if (!t || t.kind !== 'elektrikli') return false;
  consumeHeldCharge(inv, ELECTRIC_TOOL.useCost);
  return true;
}
