/*
 * KEŞİF mobs sistemi — saf yardımcılar (three/DOM yok; node'da test edilir).
 *
 *   heldKind(key)                       elde tutulan eşyanın dövüş rolü: 'none'|'melee'|'bow'|'gun'|'portal'|'shield'
 *   swingKindFor(key)                   birinci şahıs savurma türü ('slash'|'attack'|'punch')
 *   ammoInfo(inv, key)                  {need, have, ok} cephane durumu (yaratıcı envanter sınırsız)
 *   fireRayGunSafe(em, cs, body, look, key, inv, opts)   fireRayGun'ın harita-modu güvenli sürümü (blok kırma kapatılabilir)
 *   createAssist() / assistActive()     art arda ölümde geçici kolaylaştırma ("ölünce zorluk azalır")
 *   pickDifficulty(o)                   'easy'|'normal'
 *   nextPortalColor(prev, handled)      portal tabancası renk sırası (mavi → turuncu → mavi …)
 *   slowDisplace(prev, cur, f, out)     yavaşlatma etkisi: adımın yatay yer değiştirmesini f ile ölçekler
 *   deriveWorldRefs(structs, defeated)  yapı listesinden {arenas, safes}
 *   litFactor(sky, block)               yaratık gövdesi ışık çarpanı (mağarada kararır)
 *   combatLevelStep(cur, target, dt)    müzik gerilimi yumuşatması
 *   chunkOffsets(r)                     merkeze uzaklığa göre sıralı chunk ofsetleri (nüfuslandırma taraması)
 *   createDeathMarker / stepDeathMarker ölüm noktası ışık sütunu durumu
 *   shouldEvictFromSafe(...)            kamp güvenli bölgesinde düşman tespiti
 *   claimFor(...)                       saldırı/kullan girdisinin savaşa ait olup olmadığı
 *   modelCapFor(tier) / capDistance()   aynı anda görünür model sınırı (çizim çağrısı bütçesi)
 */
import { ITEMS } from '../sim/items.js';
import { CELL_SHOTS, weaponStats } from '../sim/combat.js';
import { fireBeam } from '../sim/entitiesProjectiles.js';

export const TICK = 1 / 60;

/* ------------------------------------------------------------------------------------------------
 * Eşya rolü
 * ---------------------------------------------------------------------------------------------- */
export function heldKind(key) {
  const it = key ? ITEMS[key] : null;
  if (!it) return 'none';
  if (it.ability === 'portalGun') return 'portal';
  if (it.shield) return 'shield';
  const w = it.weapon;
  if (w && w.ranged) return w.hitscan ? 'gun' : 'bow';
  return w ? 'melee' : 'none';
}

export function swingKindFor(key) {
  const it = key ? ITEMS[key] : null;
  if (!it || !it.weapon) return 'punch';
  return it.model === 'sword' ? 'slash' : 'attack';
}

/** Cephane: ranged silahın w.ammo eşyası. Sınırsız envanterde (yaratıcı) her zaman tamam. */
export function ammoInfo(inv, key) {
  const it = key ? ITEMS[key] : null;
  const w = it && it.weapon;
  const need = w && w.ammo ? w.ammo : null;
  if (!need) return { need: null, have: 0, ok: true };
  if (inv && inv.infinite) return { need, have: 999, ok: true };
  const have = inv ? inv.count(need) : 0;
  return { need, have, ok: have > 0 };
}

/**
 * Işın tüfeği (sim/combat.fireRayGun ile aynı kurallar: her CELL_SHOTS atış 1 hücre) — fark: opts.blocks=false ise
 * bloklara hasar verilmez (paylaşılan harita salt-okunur). → {fired, reason?, result, broke}
 */
export function fireRayGunSafe(em, cs, body, look, key, inv, opts) {
  const o = opts || {};
  const w = weaponStats(key);
  if (!w.hitscan) return { fired: false, reason: 'ışın silahı değil' };
  if (cs.atkCd > 0) return { fired: false, reason: 'bekleme' };
  if (cs.cells <= 0) {
    const a = ammoInfo(inv, key);
    if (!a.ok) return { fired: false, reason: 'cephane yok' };
    if (inv && a.need && !inv.infinite) inv.remove(a.need, 1);
    cs.cells = CELL_SHOTS;
  }
  cs.cells--;
  cs.atkCd = w.cooldown;
  const ex = body.x;
  const ey = body.y + (body.eyeH || 1.62) - 0.1;
  const ez = body.z;
  const result = fireBeam(em, ex, ey, ez, look.x, look.y, look.z, {
    range: w.reach,
    damage: w.damage,
    team: 'player',
    blockDamage: w.blockDamage && o.blocks !== false,
    blockPower: w.cooldown,
    knock: 3,
    weapon: key,
  });
  let broke = false;
  const it = ITEMS[key];
  if (inv && it && it.durability) broke = !!inv.damageHeld(1);
  return { fired: true, result, broke };
}

/* ------------------------------------------------------------------------------------------------
 * Kolaylaştırma ve zorluk
 * ---------------------------------------------------------------------------------------------- */
export const ASSIST = Object.freeze({ deaths: 3, window: 600, hold: 480 });

export function createAssist() {
  return { deaths: [], until: 0 };
}

/** t: oyun saniyesi. Pencere içindeki ölüm sayısı eşiğe varınca `hold` sn kolaylaştırma açılır. */
export function assistOnDeath(a, t) {
  a.deaths.push(t);
  while (a.deaths.length > 0 && t - a.deaths[0] > ASSIST.window) a.deaths.shift();
  if (a.deaths.length >= ASSIST.deaths) a.until = t + ASSIST.hold;
  return assistActive(a, t);
}

export function assistActive(a, t) {
  return t < a.until;
}

export function assistReset(a) {
  a.deaths.length = 0;
  a.until = 0;
}

/** o: {easy, mode, assist} → 'easy' | 'normal'. Harita modu her zaman kolay (hasarsız). */
export function pickDifficulty(o) {
  if (o.easy || o.mode === 'harita' || o.assist) return 'easy';
  return 'normal';
}

/* ------------------------------------------------------------------------------------------------
 * Portal tabancası
 * ---------------------------------------------------------------------------------------------- */
export function nextPortalColor(prev, handled) {
  if (!handled) return prev === 'turuncu' ? 'turuncu' : 'mavi';
  return prev === 'mavi' ? 'turuncu' : 'mavi';
}

export const PORTAL_HEX = Object.freeze({ mavi: 0x3a8fff, turuncu: 0xff9a3a });
export const PORTAL_RANGE = 48;

/* ------------------------------------------------------------------------------------------------
 * Hareket / ışık / müzik
 * ---------------------------------------------------------------------------------------------- */
/** Yavaşlatma: prev→cur yatay yer değiştirmesini f (0..1) ile ölçekler (dikey dokunulmaz). */
export function slowDisplace(prev, cur, f, out) {
  const k = f < 0 ? 0 : f > 1 ? 1 : f;
  out.x = prev.x + (cur.x - prev.x) * k;
  out.z = prev.z + (cur.z - prev.z) * k;
  return out;
}

export function litFactor(sky, block) {
  const s = (sky > 15 ? 15 : sky < 0 ? 0 : sky) / 15;
  const b = (block > 15 ? 15 : block < 0 ? 0 : block) / 15;
  return 0.3 + 0.7 * (s > b ? s : b);
}

export function combatLevelStep(cur, target, dt) {
  if (target > cur) return Math.min(target, cur + dt * 1.5);
  return Math.max(target, cur - dt * 0.25);
}

/** Yakındaki düşman tehdidi 0..1 (avlanan düşman sayısı × 0.4). */
export function threatFromCount(n, boss) {
  if (boss) return 1;
  return n <= 0 ? 0 : Math.min(1, 0.35 + n * 0.2);
}

/* ------------------------------------------------------------------------------------------------
 * Çizim bütçesi: aynı anda görünür yaratık modeli sayısı (çizim çağrısı ≲ 250)
 * ---------------------------------------------------------------------------------------------- */
export const MODEL_CAP = Object.freeze({ low: 10, medium: 18, high: 30 });
/** Aynı anda çizilen yerdeki eşya modeli sınırı (her biri ≈3 çizim çağrısı). */
export const DROP_CAP = Object.freeze({ low: 18, medium: 30, high: 48 });

export function dropCapFor(tier) {
  return DROP_CAP[tier] || DROP_CAP.medium;
}

export function modelCapFor(tier, override) {
  if (override > 0) return Math.floor(override);
  return MODEL_CAP[tier] || MODEL_CAP.medium;
}

/**
 * Görünür model sınırı için eşik uzaklık: dists[0..n) içinde cap'inci en küçük uzaklık (+pay); n ≤ cap ise sınırsız.
 * scratch: yeniden kullanılan Float32Array/Array (dists değişmez).
 */
export function capDistance(dists, n, cap, scratch) {
  if (n <= cap) return Infinity;
  for (let i = 0; i < n; i++) scratch[i] = dists[i];
  for (let i = 1; i < n; i++) {
    const v = scratch[i];
    let j = i - 1;
    while (j >= 0 && scratch[j] > v) {
      scratch[j + 1] = scratch[j];
      j--;
    }
    scratch[j + 1] = v;
  }
  return scratch[cap - 1] + 0.5;
}

/* ------------------------------------------------------------------------------------------------
 * Girdi sahipliği: savaş mı, blok kırma/yerleştirme mi?
 * ---------------------------------------------------------------------------------------------- */
/**
 * kind: heldKind; hasMobTarget: nişan bir yaratığa (erişimde, duvarsız) mı; blockInteractive: nişandaki blok etkileşimli mi.
 * → {attack, use}: true = savaş sistemi bu girdiyi tüketti (blok sistemi yok saymalı).
 */
export function claimFor(kind, hasMobTarget, blockInteractive, placeHeld, blocking) {
  let attack = false;
  let use = false;
  if (kind === 'bow' || kind === 'gun' || kind === 'portal') attack = true;
  else if (kind === 'melee' || kind === 'none' || kind === 'shield') attack = !!hasMobTarget;
  // portal: etkileşimli bloğa (kol, sandık…) sağ tık ateşlenmez; blok kullanımı sürer
  if (kind === 'portal') use = !blockInteractive;
  else if (kind === 'shield') use = !!blocking;
  else if ((kind === 'bow' || kind === 'gun') && placeHeld && !blockInteractive) use = true;
  return { attack, use };
}

/* ------------------------------------------------------------------------------------------------
 * Yapı verisi → arena ve güvenli bölge listeleri
 * ---------------------------------------------------------------------------------------------- */
/**
 * structs: structuresInRegion çıktısı; defeated: {zone:true}. → {arenas:[{x,z,r,done,zone,key,y,name}], safes:[{x,z,r}]}
 * Arena: bossarena yapılarının `boss` alanı; safe: safeRadius > 0 olan yapılar.
 */
export function deriveWorldRefs(structs, defeated, out) {
  const o = out || { arenas: [], safes: [] };
  o.arenas.length = 0;
  o.safes.length = 0;
  const list = structs || [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s) continue;
    if (s.boss && Number.isFinite(s.boss.x) && Number.isFinite(s.boss.z)) {
      const b = s.boss;
      o.arenas.push({
        x: b.x, z: b.z, r: b.radius > 0 ? b.radius : 22, done: !!(defeated && defeated[b.zone]), zone: b.zone, key: b.key, y: b.y, name: b.name,
      });
    }
    if (s.safeRadius > 0) o.safes.push({ x: s.x, z: s.z, r: s.safeRadius });
  }
  return o;
}

export function inCircle(list, x, z, pad) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const dx = x - a.x;
    const dz = z - a.z;
    const r = a.r + (pad || 0);
    if (dx * dx + dz * dz <= r * r) return a;
  }
  return null;
}

/** Güvenli bölgede, avlanmayan düşman (boss/minyon hariç) çıkarılsın mı? */
export function shouldEvictFromSafe(ent, safes) {
  if (!ent || ent.dead || ent.def.boss || ent.minion || !ent.def.hostile) return false;
  return !!inCircle(safes, ent.x, ent.z, 0);
}

/* ------------------------------------------------------------------------------------------------
 * Chunk taraması
 * ---------------------------------------------------------------------------------------------- */
const offsetCache = new Map();
/** (dx,dz) ofsetleri, |ofset| ≤ r, merkezden uzağa sıralı (önbellekli; DEĞİŞTİRME). */
export function chunkOffsets(r) {
  let list = offsetCache.get(r);
  if (list) return list;
  list = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz <= r * r + 1) list.push([dx, dz]);
    }
  }
  list.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
  offsetCache.set(r, list);
  return list;
}

/* ------------------------------------------------------------------------------------------------
 * Ölüm noktası işareti
 * ---------------------------------------------------------------------------------------------- */
export const DEATH_MARKER = Object.freeze({ life: 300, grace: 6, emptyHold: 2.5, radius: 3.5 });

export function createDeathMarker(x, y, z, life) {
  return {
    x, y, z, t: 0, life: life > 0 ? life : DEATH_MARKER.life, empty: 0, done: false, pulse: 0,
  };
}

/** itemsNear: işaretin çevresinde yerde eşya var mı. Bittiğinde m.done = true. */
export function stepDeathMarker(m, dt, itemsNear) {
  m.t += dt;
  m.pulse += dt;
  if (m.t >= m.life) m.done = true;
  if (m.t > DEATH_MARKER.grace) {
    if (itemsNear) m.empty = 0;
    else {
      m.empty += dt;
      if (m.empty >= DEATH_MARKER.emptyHold) m.done = true;
    }
  }
  return m;
}

/* ------------------------------------------------------------------------------------------------
 * Kamera sarsıntısı (görsel; sim'e dokunmaz)
 * ---------------------------------------------------------------------------------------------- */
/** s: {amp, t, dur}; yeni darbe daha güçlüyse yer değiştirir. reduced → hiç sarsıntı. */
export function addShake(s, amp, dur, reduced) {
  if (reduced || !(amp > 0)) return s;
  const cur = s.t > 0 ? s.amp * (s.t / s.dur) : 0;
  if (amp >= cur) {
    s.amp = amp;
    s.t = dur;
    s.dur = dur;
  }
  return s;
}

/** Sarsıntı büyüklüğü 0..amp (doğrusal sönüm). */
export function shakeNow(s, dt) {
  if (s.t <= 0) return 0;
  s.t = Math.max(0, s.t - dt);
  return s.amp * (s.t / s.dur);
}

/** Uzaklığa göre sarsıntı: yakında tam, uzakta (maxD) sıfır. */
export function shakeByDistance(amp, dist, maxD) {
  if (dist >= maxD) return 0;
  const k = 1 - dist / maxD;
  return amp * k * k;
}
