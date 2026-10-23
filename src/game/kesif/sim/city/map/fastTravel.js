/*
 * KEŞİF sim/city/map — HIZLI SEYAHAT KURALLARI (photo_map, Neon Meridyen Faz 4). SAF, es2020. Sunucu yok: Kredi şehir-yerel, jetona ASLA çevrilmez.
 *
 * Yalnız BULUNMUŞ Boyut Terminalleri ve BULUNMUŞ metro durakları arasında. Kural sırası (ilk eşleşen kazanır; test matrisi bu sırayı sabitler):
 *   bilinmiyor → sehir → olu → gecis → arayuz → gorev → arac → tehlike → kilitli → bekle → ayni → kredi → tamam
 *
 *   FAST_TRAVEL {cost 5, cooldown 10, blackout 3, blackoutReduced 0.4, minDist 12, timeout 6 (ilerleme duraklaması), maxHold 25, dangerSeconds 8}
 *   travelNodes(seed, tmask, mmask) → [{id:'t0'..'t15'|'m0'..'m4', kind:'terminal'|'metro', index, name, x, y, z, yaw}]   yalnız bulunmuşlar
 *   nodeById(seed, id) → düğüm | null (bulunmuşluk BAKMAZ; yalnız geçerli kimlik)        parseNodeId(id) → {kind, index} | null
 *   travelRules(ctx) → {ok, reason, message}
 *      ctx {node (hedef düğüm | null), found (bool), inCity, dead, transition, ui ('none' beklenir), mission, driving, danger, lockedInterior, cooldown (kalan sn), kredi, dist (hedefe m)}
 *   insideLockedRoom(seed, x, y, z, solved) → bool       iç mekân odası KİLİTLİ bir kapının derin tarafındaysa (çözülmemiş kilit)
 *   dangerNow(inp) → bool   inp {combat (0..1), hurtFlash, boss, sinceHurt (sn)}
 */
import { getCityPlan } from '../cityPlan.js';
import { interiorAt } from '../interior/lockLookup.js';
import { doorSides } from '../interior/locks.js';
import { terminalName } from '../cityNames.js';
import { stationList } from './mapFog.js';

export const FAST_TRAVEL = Object.freeze({
  cost: 5,
  cooldown: 10,
  blackout: 3,
  blackoutReduced: 0.4,
  minDist: 12,
  timeout: 6, // parça yükleme İLERLEMESİ bu kadar sn durursa başlangıca dön
  maxHold: 25, // ilerleme sürse bile mutlak üst sınır (takılı kalma yok)
  dangerSeconds: 8,
});

export const TRAVEL_MESSAGES = Object.freeze({
  bilinmiyor: 'Bu yeri henüz keşfetmedin.',
  sehir: 'Hızlı seyahat yalnız Neon Meridyen\'de.',
  olu: 'Şu an hızlı seyahat edemezsin.',
  gecis: 'Boyut geçişi sürerken hızlı seyahat kapalı.',
  arayuz: 'Önce açık paneli kapat.',
  gorev: 'Görev sürerken hızlı seyahat kapalı. Görevi bırakabilirsin.',
  arac: 'Önce araçtan in.',
  tehlike: 'Etrafta tehlike var; biraz uzaklaşınca dene.',
  kilitli: 'Kilitli bir odadasın; önce dışarı çık.',
  bekle: 'Hızlı seyahat dinleniyor.',
  ayni: 'Zaten buradasın.',
  kredi: 'Yeterli Kredin yok.',
  tamam: 'Hazır.',
});

/** Düğüm kimliği: t0..t15 (terminal), m0..m4 (metro durağı). */
export function parseNodeId(id) {
  if (typeof id !== 'string') return null;
  const m = /^([tm])(\d{1,2})$/.exec(id);
  if (!m) return null;
  const index = Number(m[2]);
  if (m[1] === 't') return index <= 15 ? { kind: 'terminal', index } : null;
  return index <= 28 ? { kind: 'metro', index } : null;
}

function terminalNode(plan, i) {
  const t = plan.terminals[i];
  return {
    id: 't' + i, kind: 'terminal', index: i, name: terminalName(i), x: t.x, y: t.y, z: t.z, yaw: t.yaw || 0,
  };
}

/** Metro duraklarında ayakta durulan zemin: tünel zemini y44 → ayak y45. */
export const METRO_FOOT_Y = 45;

function metroNode(seed, i) {
  const st = stationList(seed)[i];
  if (!st) return null;
  return {
    id: 'm' + i, kind: 'metro', index: i, name: st.name, x: st.x, y: METRO_FOOT_Y, z: st.z, yaw: 0,
  };
}

export function nodeById(seed, id) {
  const p = parseNodeId(id);
  if (!p) return null;
  if (p.kind === 'terminal') {
    const plan = getCityPlan(seed);
    return p.index < plan.terminals.length ? terminalNode(plan, p.index) : null;
  }
  return metroNode(seed, p.index);
}

export function travelNodes(seed, tmask, mmask) {
  const plan = getCityPlan(seed);
  const out = [];
  const tm = (tmask | 0) & 0xffff;
  for (let i = 0; i < plan.terminals.length && i < 16; i++) {
    if (i === 0 || ((tm >> i) & 1) === 1) out.push(terminalNode(plan, i));
  }
  const mm = mmask | 0;
  const st = stationList(seed);
  for (let i = 0; i < st.length && i < 29; i++) {
    if (((mm >> i) & 1) === 1) out.push(metroNode(seed, i));
  }
  return out;
}

export function travelRules(ctx) {
  const c = ctx || {};
  const fail = (reason) => ({ ok: false, reason, message: TRAVEL_MESSAGES[reason] });
  if (!c.node || c.found !== true) return fail('bilinmiyor');
  if (!c.inCity) return fail('sehir');
  if (c.dead) return fail('olu');
  if (c.transition) return fail('gecis');
  if (c.ui && c.ui !== 'none' && c.ui !== 'map') return fail('arayuz');
  if (c.mission) return fail('gorev');
  if (c.driving) return fail('arac');
  if (c.danger) return fail('tehlike');
  if (c.lockedInterior) return fail('kilitli');
  if (typeof c.cooldown === 'number' && c.cooldown > 0) {
    const r = fail('bekle');
    r.message = TRAVEL_MESSAGES.bekle + ' ' + Math.ceil(c.cooldown) + ' sn.';
    return r;
  }
  if (typeof c.dist === 'number' && c.dist < FAST_TRAVEL.minDist) return fail('ayni');
  if (!(typeof c.kredi === 'number' && c.kredi >= FAST_TRAVEL.cost)) return fail('kredi');
  return { ok: true, reason: 'tamam', message: TRAVEL_MESSAGES.tamam };
}

export function dangerNow(inp) {
  const i = inp || {};
  if (i.boss) return true;
  if (typeof i.combat === 'number' && i.combat > 0.15) return true;
  if (typeof i.hurtFlash === 'number' && i.hurtFlash > 0.05) return true;
  return typeof i.sinceHurt === 'number' && i.sinceHurt >= 0 && i.sinceHurt < FAST_TRAVEL.dangerSeconds;
}

/**
 * (x,y,z) bir iç mekân odasında ve o odaya giden kapılardan biri KİLİTLİ (serbest değil) + çözülmemiş + oda kapının DERİN tarafı mı?
 * solved(lockId) → bool. İç mekân yoksa ya da oda bulunamazsa false (açık sokak asla kilitli sayılmaz).
 */
export function insideLockedRoom(seed, x, y, z, solved) {
  if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) return false;
  let hit = null;
  try {
    hit = interiorAt(seed, x, z);
  } catch {
    hit = null;
  }
  if (!hit || !hit.it || !Array.isArray(hit.it.rooms)) return false;
  const room = hit.it.rooms.find((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1 && y >= r.y0 - 0.5 && y < r.y1 + 1);
  if (!room) return false;
  const sides = doorSides(hit.it);
  let locked = false;
  sides.forEach((s) => {
    const lk = s.door && s.door.lock;
    if (!lk || !lk.id || lk.kind === 'serbest') return;
    if (s.deep !== room.id) return;
    if (typeof solved === 'function' && solved(lk.id)) return;
    locked = true;
  });
  return locked;
}
