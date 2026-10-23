/*
 * KEŞİF sim — boss YZ ortak araç seti (saf): arena geometrisi, zemin yüksekliği, tehlike (telegraf) kısayolları,
 * ağırlıklı saldırı seçimi, minyon çağırma. Boss betikleri (mobAIBossA/B) yalnızca bunları kullanır.
 *
 * Tehlike (hazard) = yerde görünür işaret + gecikmeli hasar: em.addHazard(spec, owner). Her tehlike sahibinin
 * ent.fx dizisine de eklenir (render/ses işaretleri okur). spec alanları entitiesHazards.js başlığında.
 */
import { cellSolid, rnd } from './mobAIUtil.js';

/** Evre başına varsayılan hazırlık ölçeği (aşama 1,2,3 → daha hızlı ama okunur). */
export const WINDUP_SCALE = Object.freeze([1, 0.88, 0.78]);

/** (x,z) sütununda yürünebilir zemin yüksekliği (ayak y); yoksa yRef. */
export function groundY(em, x, z, yRef) {
  const w = em.world;
  const fx = Math.floor(x);
  const fz = Math.floor(z);
  let y = Math.floor(yRef) + 4;
  for (let n = 0; n < 14; n++, y--) {
    if (cellSolid(w, fx, y - 1, fz) && !cellSolid(w, fx, y, fz)) return y;
  }
  return yRef;
}

/** Arena merkezine uzaklık. */
export function arenaDist(ent, x, z) {
  const a = ent.arena;
  const dx = x - a.x;
  const dz = z - a.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** (x,z) noktasını arena içine (yarıçap − margin) sıkıştırır; out {x,z}. */
export function clampArena(ent, x, z, margin, out) {
  const a = ent.arena;
  const lim = Math.max(1, a.r - margin);
  let dx = x - a.x;
  let dz = z - a.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > lim) {
    dx = (dx / d) * lim;
    dz = (dz / d) * lim;
  }
  out.x = a.x + dx;
  out.z = a.z + dz;
  return out;
}

/** Ağırlıklı seçim: items [[ad, ağırlık], ...]; ağırlığı ≤0 olanlar elenir; hiçbiri kalmazsa null. */
export function pickWeighted(em, ent, items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) if (items[i][1] > 0) total += items[i][1];
  if (total <= 0) return null;
  let r = rnd(em, ent) * total;
  for (let i = 0; i < items.length; i++) {
    const w = items[i][1];
    if (!(w > 0)) continue;
    if (r < w) return items[i][0];
    r -= w;
  }
  return items[items.length - 1][0];
}

/**
 * İşaretli tehlike kur: varsayılanlarla birleşir, y zeminden alınır. Dönüş: tehlike nesnesi.
 * spec.dmg = def.damage çarpanı DEĞİL, mutlak hasar. Sahip: ent (hasar kaynağı + fx listesi).
 */
export function hazard(em, ent, spec) {
  if (spec.y === undefined) spec.y = groundY(em, spec.x, spec.z, ent.y);
  return em.addHazard(spec, ent);
}

/** Sahibin yaşayan minyon sayısı. */
export function minionCount(em, ent) {
  return em.minionCount(ent.id);
}

/** Minyon çağırır (üst sınır cap); oluşan sayıyı döner. */
export function summon(em, ent, type, x, z, opts) {
  const y = groundY(em, x, z, ent.y);
  const m = em.spawn(type, x, y, z, Object.assign({
    owner: ent.id, minion: true, hpScale: 0.6, aggro: true, skin: opts && opts.skin,
  }, opts));
  return m ? 1 : 0;
}
