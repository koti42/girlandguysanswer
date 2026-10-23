/*
 * KEŞİF sim/city — YERALTI İÇERİĞİ GİRİŞ NOKTASI (Faz 2, interiors_d). Sözleşme §7 "Yeraltı", §8, §11.
 *
 * Kabuk (cityUndergroundShell) sonrası çağrılır; içerik DÜNYA koordinatlı, pencereye kırpılır (chunk = kesit belirlenimciliği):
 *   kanalizasyon (tünel giydirmesi, 121 kavşak odası, 30 gizli oda) · metro (istasyon duvarı/adı, tren, bilet kapıları, personel odası) ·
 *   12 laboratuvar (tema, bulkhead kapıları, giriş kapağı) · kasa (Diyar Işığı sunağı, kapak)
 *
 *  emitUndergroundContent(w, plan)               cityGen kancası (yüzey bandı + derin kesitler)
 *  undergroundPropSpecs(citySeed, rect) → PropSpec[]   propPlan kancası (rect {x0,z0,x1,z1}: kesişen alanlar; id kimliği (lotId≥500000, slot))
 *  undergroundDoors / undergroundLocks / lockGraph / solveUnderground   (cityUndergroundLocks)
 *  undergroundDiscovery(plan) → {hiddenRooms[30], graffiti[18], vault:{reward}, stats}
 *  undergroundZoneAt(plan,x,y,z) → {kind,id,name,mood}|null   yeraltı bölge sorgusu (HUD/ambiyans/ışık: dim kanal, soğuk metro, steril lab)
 *  UG_SHARE                                        keşif payları
 */
import { getCityPlan, pois } from './cityPlan.js';
import { sewerExtras as extrasOf } from './cityUndergroundExtra.js';
import { LAB_THEMES, labData } from './cityUndergroundLabs.js';
import { HR_THEMES } from './cityUndergroundExtra.js';
import { emitSewerContent, hiddenAnchors, junctionAnchors, sewerPropSpecs } from './cityUndergroundSewer.js';
import { emitMetroContent, metroPropSpecs } from './cityUndergroundMetro.js';
import { emitLabContent, labPropSpecs } from './cityUndergroundLabs.js';
import { stationName } from './cityUndergroundMetro.js';
import { emitVaultContent, vaultData, vaultPropSpecs } from './cityUndergroundVault.js';
import { UT, hh } from './cityContentKit.js';

export {
  lockGraph, solveUnderground, undergroundDoors, undergroundLocks,
} from './cityUndergroundLocks.js';
export { sewerExtras } from './cityUndergroundExtra.js';

/** Keşif payları (sözleşme §11): gizli oda 30 (hepsi yeraltı), kanalizasyon çipi 40 (cityPois), kanal grafiti paneli ≤18 (90'ın payı). */
export const UG_SHARE = Object.freeze({ hiddenRooms: 30, sewerChips: 40, graffiti: 18 });

export function emitUndergroundContent(w, plan) {
  emitSewerContent(w, plan);
  emitMetroContent(w, plan);
  emitLabContent(w, plan);
  emitVaultContent(w, plan);
}

/** Yeraltı proplarının PropSpec'leri (kesişen alanlar); çapa chunk'ı sahiplenme propPlan'da yapılır. */
export function undergroundPropSpecs(citySeed, rect) {
  const plan = getCityPlan(citySeed);
  const out = [];
  sewerPropSpecs(plan, rect, out);
  metroPropSpecs(plan, rect, out);
  labPropSpecs(plan, rect, out);
  vaultPropSpecs(plan, rect, out);
  return out;
}

/** Grafiti duvarlarından UG_SHARE.graffiti tanesi (hash sırasıyla) resmî keşif noktasıdır; kalanlar boş duvar (süs). */
export function undergroundDiscovery(plan) {
  const jg = junctionAnchors(plan);
  const order = jg.map((g, i) => ({ g, i, h: hh(plan.seed, i, UT.DG_PICK) }));
  order.sort((a, b) => a.h - b.h || a.i - b.i);
  const graffiti = order.slice(0, UG_SHARE.graffiti).map((e) => e.g);
  const chips = pois(plan.seed).filter((p) => p.type === 'chip' && p.kind === 'kanal');
  return {
    hiddenRooms: hiddenAnchors(plan),
    graffiti,
    blankWalls: jg.length,
    chips,
    vault: vaultData(plan).reward,
    stats: { hiddenRooms: UG_SHARE.hiddenRooms, graffiti: graffiti.length, chips: chips.length },
  };
}

const MOOD = Object.freeze({
  kanal: Object.freeze({ hue: 'kehribar', light: 'dim', ambient: 'kanal' }),
  metro: Object.freeze({ hue: 'camgobegi', light: 'cool', ambient: 'metro' }),
  lab: Object.freeze({ hue: 'beyaz', light: 'steril', ambient: 'lab' }),
  kasa: Object.freeze({ hue: 'mor', light: 'steril', ambient: 'kasa' }),
  gizli: Object.freeze({ hue: 'sicak', light: 'dim', ambient: 'kanal' }),
});

/** (x,y,z) hücresi yeraltında hangi bölgede: kasa | lab | gizli oda | kavşak odası | metro (istasyon) | kanalizasyon; yoksa null. O(lab+istasyon). */
export function undergroundZoneAt(plan, x, y, z) {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  if (fy >= 60) return null;
  const V = plan.underground.vault;
  if (fy >= V.y0 - 1 && fy <= V.y1 && fx >= V.x0 && fx < V.x1 && fz >= V.z0 && fz < V.z1) return { kind: 'kasa', id: V.id, name: 'Kasa', mood: MOOD.kasa };
  const LD = labData(plan);
  for (let i = 0; i < plan.underground.labs.length; i++) {
    const L = plan.underground.labs[i];
    for (let k = 0; k < L.rooms.length; k++) {
      const r = L.rooms[k];
      if (fx >= r.x0 && fx < r.x1 && fz >= r.z0 && fz < r.z1 && fy >= r.y0 - 1 && fy <= r.y1) {
        return { kind: 'lab', id: L.id, name: LAB_THEMES[LD.labs[i].theme].name, room: r.k, mood: MOOD.lab };
      }
    }
  }
  if (fy >= 29 && fy <= 38) {
    const ex = extrasOf(plan);
    const l = ex.itemsIn(fx, fz, fx + 1, fz + 1, 0);
    for (let q = 0; q < l.length; q++) {
      const b = l[q].box;
      if (fx >= b.x0 && fx < b.x1 && fz >= b.z0 && fz < b.z1 && fy >= b.y0 && fy < b.y1) {
        if (l[q].type === 'hr') return { kind: 'gizli_oda', id: l[q].ref.id, name: HR_THEMES[l[q].ref.theme].name, mood: MOOD.gizli };
        if (l[q].type === 'jr') return { kind: 'kavsak', id: l[q].ref.id, name: 'Kavşak Odası', mood: MOOD.kanal };
      }
    }
    const lines = plan.underground.sewer.lines;
    for (let q = 0; q < lines.length; q++) {
      const ln = lines[q];
      const along = ln.axis === 'z' ? fz : fx;
      const across = ln.axis === 'z' ? fx : fz;
      if (along >= ln.a - 4 && along <= ln.b + 4 && across >= ln.c - 3 && across <= ln.c + 3) return { kind: 'kanalizasyon', id: ln.axis + ln.c, name: 'Kanalizasyon', mood: MOOD.kanal };
    }
  }
  if (fy >= 41 && fy <= 53) {
    const sts = plan.underground.metro.stations;
    for (let s0 = 0; s0 < sts.length; s0++) {
      const st = sts[s0];
      for (let q = 0; q < st.boxes.length; q++) {
        const b = st.boxes[q];
        if (fx >= b.x0 - 2 && fx < b.x1 + 2 && fz >= b.z0 - 2 && fz < b.z1 + 2) return { kind: 'istasyon', id: st.id, name: stationName(st), mood: MOOD.metro };
      }
    }
    if (Math.abs(fx) <= 6 + 4 && Math.abs(fz) <= 350) return { kind: 'metro', id: 'mor', name: 'Mor Hat', mood: MOOD.metro };
    if (Math.abs(fz) <= 6 + 4 && Math.abs(fx) <= 350) return { kind: 'metro', id: 'turuncu', name: 'Turuncu Hat', mood: MOOD.metro };
  }
  return null;
}
