/*
 * KEŞİF sim — TEKNOLOJİ: Tarayıcı (saf). Çevredeki cevher, yapı ve canlıları bulur; her tarama şarj harcar.
 *
 *   scanArea(acc, center, opts?) → {pings, cells, truncated}
 *       acc: {getBlock(x,y,z)→id|null, structures?(x,z,radius)→[{type,name,x,y,z}], mobs?(x,y,z,radius)→[{type,name,x,y,z,hostile}]}
 *       ping: {type:'maden'|'yapı'|'canlı', kind, name, color, x,y,z, dx,dy,dz, dist, yaw, rank}
 *         yaw: bu hedefe bakan yaw (yaw 0 = −Z, + sola): arayüz oyuncunun yaw'ıyla farkını gösterir.
 *   tickScanner(tech, inv, dt, ctx) → olay | null          ctx: {pos:{x,y,z}, acc, scanner?}
 *       Çubukta Tarayıcı varken her SCANNER.period sn'de bir (şarj ≥ maliyet) otomatik tarar; olay {type:'scanPing', count, cost, charge}.
 *   pingNow(tech, inv, ctx) → {ok, reason?, event?}          elle tarama (zamanlayıcıyı sıfırlar)
 *   scannerHud(tech, inv) → {charge, max, pings, nextIn, empty} | null
 *
 * Maden taraması küresel, duvarlardan geçer (radius 24). Aynı türden yakın (clusterGap) cevherler tek işaret olur; tür başına en çok 5,
 * toplam en çok 24 işaret (yakından uzağa).
 */
import { SCANNER, SCAN_ORES } from './techData.js';
import { chargeOf, drainSlot, findCarried, maxCharge } from './techCharge.js';

const PER_KIND = 5;

export function scanArea(acc, center, opts) {
  const o = opts || {};
  const r = o.radius > 0 ? Math.min(48, o.radius) : SCANNER.radius;
  const maxPings = o.maxPings > 0 ? o.maxPings : SCANNER.maxPings;
  const gap2 = (o.clusterGap > 0 ? o.clusterGap : SCANNER.clusterGap) ** 2;
  const maxCells = o.maxCells > 0 ? o.maxCells : SCANNER.maxCells;
  const cx = Math.floor(center.x);
  const cy = Math.floor(center.y);
  const cz = Math.floor(center.z);
  const hits = [];
  let cells = 0;
  let truncated = false;
  const r2 = r * r;
  outer:
  for (let dy = -r; dy <= r; dy++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        if (++cells > maxCells) {
          truncated = true;
          break outer;
        }
        const id = acc.getBlock(cx + dx, cy + dy, cz + dz);
        if (id === null || id === undefined || id < 24 || id > 32) continue;
        const ore = SCAN_ORES[id];
        if (ore) hits.push({ ore, d2, x: cx + dx, y: cy + dy, z: cz + dz });
      }
    }
  }
  hits.sort((a, b) => a.d2 - b.d2 || a.y - b.y || a.x - b.x || a.z - b.z);
  const pings = [];
  const perKind = Object.create(null);
  for (let i = 0; i < hits.length && pings.length < maxPings; i++) {
    const h = hits[i];
    const kind = h.ore.kind;
    if ((perKind[kind] || 0) >= PER_KIND) continue;
    let dup = false;
    for (let j = 0; j < pings.length; j++) {
      const p = pings[j];
      if (p.kind !== kind) continue;
      const ddx = p.x - h.x;
      const ddy = p.y - h.y;
      const ddz = p.z - h.z;
      if (ddx * ddx + ddy * ddy + ddz * ddz <= gap2) {
        dup = true;
        break;
      }
    }
    if (dup) continue;
    perKind[kind] = (perKind[kind] || 0) + 1;
    pings.push(makePing('maden', kind, h.ore.name + ' Cevheri', h.ore.color, h.x + 0.5, h.y + 0.5, h.z + 0.5, center, h.ore.rank));
  }
  if (typeof acc.structures === 'function') {
    const list = acc.structures(center.x, center.z, r) || [];
    for (let i = 0; i < list.length && pings.length < maxPings + 8; i++) {
      const s = list[i];
      if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
      pings.push(makePing('yapı', String(s.type || 'yapı'), String(s.name || s.type || 'Yapı'), 0xffd84a, s.x, Number.isFinite(s.y) ? s.y : center.y, s.z, center, 8));
    }
  }
  if (typeof acc.mobs === 'function') {
    const list = acc.mobs(center.x, center.y, center.z, r) || [];
    for (let i = 0; i < list.length && pings.length < maxPings + 16; i++) {
      const m = list[i];
      if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.z)) continue;
      pings.push(makePing('canlı', String(m.type || 'canlı'), String(m.name || m.type || 'Canlı'), m.hostile ? 0xff4a4a : 0x6aff8a, m.x, Number.isFinite(m.y) ? m.y : center.y, m.z, center, m.hostile ? 6 : 2));
      pings[pings.length - 1].hostile = !!m.hostile;
    }
  }
  pings.sort((a, b) => a.dist - b.dist || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  return { pings, cells, truncated };
}

function makePing(type, kind, name, color, x, y, z, c, rank) {
  const dx = x - c.x;
  const dy = y - c.y;
  const dz = z - c.z;
  return {
    type,
    kind,
    name,
    color,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    z: Math.round(z * 100) / 100,
    dx: Math.round(dx * 100) / 100,
    dy: Math.round(dy * 100) / 100,
    dz: Math.round(dz * 100) / 100,
    dist: Math.round(Math.hypot(dx, dy, dz) * 10) / 10,
    yaw: Math.atan2(-dx, -dz),
    rank,
  };
}

function runScan(tech, carried, ctx) {
  const cost = SCANNER.cost;
  drainSlot(carried.slot, cost);
  const res = scanArea(ctx.acc, ctx.pos, ctx.scanner);
  tech.scanner.pings = res.pings;
  tech.scanner.at = tech.time;
  tech.scanner.t = 0;
  return {
    type: 'scanPing', count: res.pings.length, cost, charge: chargeOf(carried.slot), truncated: res.truncated,
  };
}

export function tickScanner(tech, inv, dt, ctx) {
  const sc = tech.scanner;
  const carried = findCarried(inv, 'scanner', { hotbarOnly: true });
  if (sc.pings.length > 0 && tech.time - sc.at > SCANNER.period + 4) sc.pings = [];
  if (!carried) {
    sc.t = 0;
    return null;
  }
  sc.t += Math.max(0, Math.min(5, dt));
  if (sc.t < SCANNER.period) return null;
  if (chargeOf(carried.slot) < SCANNER.cost) {
    sc.t = SCANNER.period; // şarj gelince hemen
    return null;
  }
  if (!ctx || !ctx.acc || !ctx.pos) return null;
  const ev = runScan(tech, carried, ctx);
  if (inv && typeof inv._emit === 'function') inv._emit();
  return ev;
}

export function pingNow(tech, inv, ctx) {
  const carried = findCarried(inv, 'scanner', { hotbarOnly: true });
  if (!carried) return { ok: false, reason: 'yok', message: 'Çubukta Tarayıcı yok.' };
  if (chargeOf(carried.slot) < SCANNER.cost) return { ok: false, reason: 'sarj', message: 'Tarayıcının şarjı bitti.' };
  if (!ctx || !ctx.acc || !ctx.pos) return { ok: false, reason: 'dunya', message: 'Dünya erişimi yok.' };
  const event = runScan(tech, carried, ctx);
  if (inv && typeof inv._emit === 'function') inv._emit();
  return { ok: true, event, pings: tech.scanner.pings };
}

export function scannerHud(tech, inv) {
  const carried = findCarried(inv, 'scanner', { hotbarOnly: true });
  if (!carried) return null;
  const charge = chargeOf(carried.slot);
  return {
    charge,
    max: maxCharge(carried.slot.item),
    pings: tech.scanner.pings,
    nextIn: Math.max(0, Math.round((SCANNER.period - tech.scanner.t) * 10) / 10),
    empty: charge < SCANNER.cost,
  };
}
