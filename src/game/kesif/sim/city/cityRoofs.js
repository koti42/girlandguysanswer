/*
 * KEŞİF sim/city — ÇATI İÇERİĞİ (Faz 2, interiors_d). Saf, belirlenimci (yalnız subHash akışları); yalnız pencere (chunk dilimi) içini yazar.
 * Kabuk (cityBuildings: çatı döşemesi, korkuluk, anten, helipad, gökyüzü köprüsü, dış merdiven) olduğu gibi kalır; burada:
 *   - çatı süsleri: klima birimleri, bacalar, su depoları, güneş panelleri, anten çiftliği (direkler + çanak), holo reklam, kasa yığınları,
 *     çatı bahçesi (yatak, çalı, ışık dizisi + ağaç/bank propları), helipad (rüzgâr tulumu, köşe ışıkları), asansör makine kulübesi (kule çekirdeği üstü)
 *   - 8 çatı parkuru içeriği (cityRoofRoutes): kontrol karoları, tahta plak çıkıntılar, bitiş sandığı, kanca kristalleri, süzülme kulesi
 *   - Merkez/Teknoloji kuleleri arası gökyüzü köprüleri (cityRoofBridges)
 *  Süs yerleşimi serbest-ızgara ile yapılır: korkuluk/anten/helipad/çekirdek/çip/kontrol şeritleri ayrılır, çakışma olmaz.
 *
 *  emitRoofContent(w, plan, lot, bp)             cityGen kancası (her bina için; kabuktan SONRA)
 *  roofPropSpecs(citySeed, rect) → PropSpec[]    propPlan kancası (bahçe ağaç/bank/saksı; lotId ≥ 600000)
 *  roofDecor(plan, lot, bp) → {ops, props, theme}   çatı süsü planı (önbellekli)
 *  roofGardenFor(bp) → {x0,z0,x1,z1,y} | null     açık hava çatı bahçesi alanı (interiors_b)
 *  roofAccessOf(bp) → [{kind:'asansor', x,z,y}]   kule çekirdeği çatı durağı çapaları (locks_hack asansör durakları)
 *  roofDiscovery(plan) → {routes:[{id,start,finish,pads}], chips[60] (kind 'cati'), bridges}   keşif/parkur çapaları (cityPois ile aynı çip konumları)
 *  ROOF_THEMES
 */
import { B } from '../blocks.js';
import { ID } from './cityEmit.js';
import { ARCHETYPES } from './archetypes.js';
import { getCityPlan, lotsInRect, pois } from './cityPlan.js';
import { emitRouteLot, roofRouteContent, routeOfLot } from './cityRoofRoutes.js';
import { emitSkybridgesWindow, skybridgesOf } from './cityRoofBridges.js';
import { planBuilding } from './buildingPlan.js';
import {
  PSEUDO, UT, hh, mkSpec,
} from './cityContentKit.js';

export const ROOF_THEMES = Object.freeze(['kule', 'bahce', 'teknik', 'depo', 'pazar', 'ev']);

const CRATE = B.PLANKS_OAK;

/* ------------------------------------------------------------------------------------------------
 * Serbest ızgara
 * ---------------------------------------------------------------------------------------------- */
class Grid {
  constructor(rect) {
    this.x0 = rect.x0;
    this.z0 = rect.z0;
    this.w = rect.x1 - rect.x0;
    this.d = rect.z1 - rect.z0;
    this.m = new Uint8Array(this.w * this.d);
  }

  claim(x0, z0, x1, z1) {
    const xa = Math.max(x0, this.x0);
    const xb = Math.min(x1, this.x0 + this.w);
    const za = Math.max(z0, this.z0);
    const zb = Math.min(z1, this.z0 + this.d);
    for (let z = za; z < zb; z++) for (let x = xa; x < xb; x++) this.m[(z - this.z0) * this.w + (x - this.x0)] = 1;
  }

  free(x0, z0, x1, z1) {
    if (x0 < this.x0 || z0 < this.z0 || x1 > this.x0 + this.w || z1 > this.z0 + this.d) return false;
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (this.m[(z - this.z0) * this.w + (x - this.x0)]) return false;
    return true;
  }

  /** [x0,x1)×[z0,z1) boşsa (pay hücreleri boş olmak ZORUNDA değil) paylı olarak talep eder ve true döner. */
  take(x0, z0, x1, z1, pad) {
    const p = pad === undefined ? 1 : pad;
    if (!this.free(x0, z0, x1, z1)) return false;
    this.claim(x0 - p, z0 - p, x1 + p, z1 + p);
    return true;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Bileşenler (dünya koordinatı; y = çatı ayak seviyesi (kat zemini bloğunun üstü))
 * ---------------------------------------------------------------------------------------------- */
function hvac(ops, x, z, y, c) {
  ops.push([x, y, z, x + 2, y + 1, z + 2, c === 0 ? ID.WHITE : ID.FACADE_LIGHT]);
  ops.push([x, y + 1, z, x + 2, y + 2, z + 2, B.SLAB]);
  ops.push([x, y + 1, z + 1, x + 1, y + 2, z + 2, ID.FACADE_DARK]); // fan ızgarası
}

function chimney(ops, x, z, y, h) {
  ops.push([x, y, z, x + 1, y + h, z + 1, B.BRICK]);
  ops.push([x, y + h, z, x + 1, y + h + 1, z + 1, ID.IRON]);
}

function tank(ops, x, z, y, color) {
  // 3×3: 4 köşe bacak (2), gövde artı biçimi (2 yüksek), kapak plakası; yüzünde merdiven (z+3)
  [[0, 0], [2, 0], [0, 2], [2, 2]].forEach((q) => ops.push([x + q[0], y, z + q[1], x + q[0] + 1, y + 2, z + q[1] + 1, ID.IRON]));
  ops.push([x, y + 2, z + 1, x + 3, y + 4, z + 2, color]);
  ops.push([x + 1, y + 2, z, x + 2, y + 4, z + 3, color]);
  ops.push([x + 1, y + 4, z + 1, x + 2, y + 5, z + 2, B.SLAB]);
  ops.push([x + 1, y, z + 3, x + 2, y + 4, z + 4, B.LADDER]);
}

function solar(ops, x, z, y, n) {
  for (let k = 0; k < n; k++) {
    const px = x + k * 4;
    ops.push([px, y, z, px + 3, y + 1, z + 1, ID.IRON]);
    ops.push([px, y, z + 1, px + 3, y + 1, z + 2, B.SLAB]);
    ops.push([px, y + 1, z + 1, px + 3, y + 2, z + 2, B.GLASS_BLUE]);
    ops.push([px, y + 1, z, px + 3, y + 2, z + 1, B.SLAB]);
    ops.push([px + 1, y + 2, z + 1, px + 2, y + 3, z + 2, ID.NEON_CYAN]); // sensör
  }
}

function crates(ops, x, z, y, hv) {
  const n = 1 + (hv % 2);
  ops.push([x, y, z, x + 2, y + n, z + 1, CRATE]);
  if (hv % 3 === 0) ops.push([x, y + n, z, x + 1, y + n + 1, z + 1, CRATE]);
  ops.push([x + 1, y, z + 1, x + 2, y + 1, z + 2, B.CONCRETE_YELLOW]);
}

function mast(ops, x, z, y, h) {
  ops.push([x, y, z, x + 1, y + 3, z + 1, ID.IRON]);
  ops.push([x, y + 3, z, x + 1, y + h, z + 1, B.FENCE]);
  ops.push([x, y + h, z, x + 1, y + h + 1, z + 1, ID.NEON_PINK]);
}

function dish(ops, x, z, y, dir) {
  // 3×3 artı biçimli çanak (dikey düzlem), direğin yanında; dir 0: +z yönüne bakar, 1: +x
  if (dir === 0) {
    ops.push([x - 1, y + 1, z + 1, x + 2, y + 2, z + 2, ID.WHITE]);
    ops.push([x, y, z + 1, x + 1, y + 3, z + 2, ID.WHITE]);
    ops.push([x, y + 1, z + 1, x + 1, y + 2, z + 2, B.COPPER_BLOCK]);
  } else {
    ops.push([x + 1, y + 1, z - 1, x + 2, y + 2, z + 2, ID.WHITE]);
    ops.push([x + 1, y, z, x + 2, y + 3, z + 1, ID.WHITE]);
    ops.push([x + 1, y + 1, z, x + 2, y + 2, z + 1, B.COPPER_BLOCK]);
  }
}

function holoSign(ops, x, z, y, alongX) {
  if (alongX) {
    ops.push([x, y, z, x + 1, y + 2, z + 1, ID.IRON]);
    ops.push([x + 4, y, z, x + 5, y + 2, z + 1, ID.IRON]);
    ops.push([x, y + 2, z, x + 5, y + 4, z + 1, ID.BLACK]);
    ops.push([x + 1, y + 2, z, x + 4, y + 4, z + 1, ID.HOLO]);
  } else {
    ops.push([x, y, z, x + 1, y + 2, z + 1, ID.IRON]);
    ops.push([x, y, z + 4, x + 1, y + 2, z + 5, ID.IRON]);
    ops.push([x, y + 2, z, x + 1, y + 4, z + 5, ID.BLACK]);
    ops.push([x, y + 2, z + 1, x + 1, y + 4, z + 4, ID.HOLO]);
  }
}

function planter(ops, x, z, y, len, alongX, hv) {
  const bush = [B.LEAVES_OAK, B.LEAVES_CHERRY, B.LEAVES_AUTUMN_ORANGE, B.LEAVES_BIRCH][hv & 3];
  if (alongX) {
    ops.push([x, y, z, x + len, y + 1, z + 1, B.PLANKS_ACACIA]);
    ops.push([x, y + 1, z, x + len, y + 2, z + 1, bush]);
  } else {
    ops.push([x, y, z, x + 1, y + 1, z + len, B.PLANKS_ACACIA]);
    ops.push([x, y + 1, z, x + 1, y + 2, z + len, bush]);
  }
}

function lightPost(ops, x, z, y) {
  ops.push([x, y, z, x + 1, y + 3, z + 1, B.FENCE]);
  ops.push([x, y + 3, z, x + 1, y + 4, z + 1, B.LANTERN]);
}

function windsock(ops, x, z, y) {
  ops.push([x, y, z, x + 1, y + 5, z + 1, ID.IRON]);
  ops.push([x + 1, y + 4, z, x + 2, y + 5, z + 1, B.CLOTH_ORANGE]);
  ops.push([x + 2, y + 4, z, x + 3, y + 5, z + 1, B.CLOTH_WHITE]);
  ops.push([x + 3, y + 4, z, x + 4, y + 5, z + 1, B.CLOTH_ORANGE]);
}

/* ------------------------------------------------------------------------------------------------
 * Plan
 * ---------------------------------------------------------------------------------------------- */
function topTier(bp) {
  return bp.tiers.reduce((m, t) => (t.f1 > m.f1 || (t.f1 === m.f1 && t.w * t.d > m.w * m.d) ? t : m), bp.tiers[0]);
}

function themeOf(lot, A0) {
  if (A0.tower) return 'kule';
  if (lot.district === 'pazar' || lot.district === 'gece_pazari') return 'pazar';
  if (A0.roof === 'bahce') return 'bahce';
  if (A0.roof === 'egimli') return 'ev';
  if (lot.district === 'teknoloji') return 'teknik';
  return 'depo';
}

const DECOR = new WeakMap();

export function roofDecor(plan, lot, bp) {
  const hit = DECOR.get(bp);
  if (hit) return hit;
  const A0 = ARCHETYPES[bp.archetype];
  const out = { ops: [], props: [], theme: null, rect: null, y: 0 };
  if (!A0 || !A0.building || bp.hill || !bp.tiers || !bp.tiers.length || !bp.roof) {
    DECOR.set(bp, out);
    return out;
  }
  const seed = plan.seed;
  const tt = topTier(bp);
  const rect = { x0: tt.x0, z0: tt.z0, x1: tt.x0 + tt.w, z1: tt.z0 + tt.d };
  const y = bp.roof.y;
  const theme = themeOf(lot, A0);
  out.theme = theme;
  out.rect = rect;
  out.y = y;
  const g = new Grid(rect);
  // kenar payı (korkuluk/çit): 1 hücre
  g.claim(rect.x0, rect.z0, rect.x1, rect.z0 + 1);
  g.claim(rect.x0, rect.z1 - 1, rect.x1, rect.z1);
  g.claim(rect.x0, rect.z0, rect.x0 + 1, rect.z1);
  g.claim(rect.x1 - 1, rect.z0, rect.x1, rect.z1);
  const r = bp.roof;
  if (r.helipad) g.claim(r.helipad.x0 - 2, r.helipad.z0 - 2, r.helipad.x1 + 2, r.helipad.z1 + 2);
  if (r.antenna) g.claim(Math.floor(r.antenna.x) - 1, Math.floor(r.antenna.z) - 1, Math.floor(r.antenna.x) + 2, Math.floor(r.antenna.z) + 2);
  (bp.core || []).forEach((c) => g.claim(c.x0 - 2, c.z0 - 2, c.x1 + 2, c.z1 + 2));
  (bp.anchors.chips || []).forEach((c) => { if (c.slot === 'roof') g.claim(Math.floor(c.x) - 1, Math.floor(c.z) - 1, Math.floor(c.x) + 2, Math.floor(c.z) + 2); });
  const route = routeOfLot(plan, lot.id);
  if (route) {
    (route.lanes.get(lot.id) || []).forEach((l) => g.claim(l.x0, l.z0, l.x1, l.z1));
    route.pads.forEach((p) => { if (p.lot === lot.id) g.claim(Math.floor(p.x) - 2, Math.floor(p.z) - 2, Math.floor(p.x) + 3, Math.floor(p.z) + 3); });
    if (route.finish.lot === lot.id) {
      const f = route.finish;
      g.claim(f.chest.x - 3, f.chest.z - 3, f.chest.x + 4, f.chest.z + 4);
      g.claim(f.beacon.x - 1, f.beacon.z - 1, f.beacon.x + 2, f.beacon.z + 2);
      g.claim(f.pylon.x - 3, f.pylon.z - 3, f.pylon.x + 4, f.pylon.z + 4);
    }
    route.alt.grapple.forEach((a) => {
      if (route.pads[a.to].lot === lot.id) g.claim(a.anchor.x - 1, a.anchor.z - 1, a.anchor.x + 2, a.anchor.z + 2);
    });
    if (bp.extStair) g.claim(bp.extStair.top.x - 1, bp.extStair.top.z - 1, bp.extStair.top.x + 2, bp.extStair.top.z + 2);
  }
  const ops = out.ops;
  const hv = (k) => hh(seed, lot.id * 32 + k, UT.RF_KIND);
  const wx = rect.x1 - rect.x0;
  const wz = rect.z1 - rect.z0;
  const tries = (fn, n, k0) => {
    let placed = 0;
    for (let t = 0; t < n * 6 && placed < n; t++) {
      const x = rect.x0 + 1 + (hh(seed, lot.id * 64 + k0 + t, UT.RF_POS) % Math.max(1, wx - 2));
      const z = rect.z0 + 1 + (hh(seed, lot.id * 64 + k0 + t, UT.RF_POS + 1) % Math.max(1, wz - 2));
      if (fn(x, z, hv(k0 + t))) placed++;
    }
    return placed;
  };
  const route3 = !!route; // rota çatılarında en çok 3 küçük süs (parkur açık kalsın)
  const maxHv = route3 ? 2 : 4;
  const slot = { n: 0 };
  const base = PSEUDO.roof + lot.id;
  const pushProp = (kind, x, z, yaw, variant) => out.props.push(mkSpec(base, slot.n++, kind, x, y, z, yaw, variant));
  // 1) plan çapaları (cityplan roofItems): klima / baca / anten / saksı / bank / arka tabela
  (bp.anchors.roofItems || []).forEach((it, q) => {
    const x = Math.floor(it.x);
    const z = Math.floor(it.z);
    const c = hv(8 + q) & 1;
    if (it.kind === 'klima') { if (g.take(x, z, x + 2, z + 2, 1)) hvac(ops, x, z, y, c); } else if (it.kind === 'baca') { if (g.take(x, z, x + 1, z + 1, 1)) chimney(ops, x, z, y, 2 + (hv(q) % 2)); } else if (it.kind === 'saksi') {
      if (g.take(x, z, x + 1, z + 1, 0)) pushProp('saksi', x + 0.5, z + 0.5, hv(q) & 3, hv(q + 3) & 7);
    } else if (it.kind === 'bank') {
      const al = (hv(q) & 1) === 0;
      if (g.take(x, z, al ? x + 2 : x + 1, al ? z + 1 : z + 2, 0)) pushProp('bank', al ? x + 1 : x + 0.5, al ? z + 0.5 : z + 1, al ? ((hv(q + 1) & 1) ? 0 : 2) : ((hv(q + 1) & 1) ? 1 : 3), hv(q) & 7);
    } else if (it.kind === 'tabela_arka') {
      const al = wx >= wz;
      if (g.take(x, z, al ? x + 5 : x + 1, al ? z + 1 : z + 5, 1)) holoSign(ops, x, z, y, al);
    }
  });
  // 2) tema bileşenleri
  const free = (w2, d2) => (x, z) => g.take(x, z, x + w2, z + d2, 1);
  if (theme === 'kule') {
    tries((x, z, h) => { if (!free(1, 1)(x, z)) return false; mast(ops, x, z, y, 5 + (h % 5)); if (h & 1) dish(ops, x, z, y + 3, (h >> 1) & 1); return true; }, 3, 100);
    tries((x, z, h) => { if (!free(2, 2)(x, z)) return false; hvac(ops, x, z, y, h & 1); return true; }, maxHv, 120);
    if (A0.roof === 'helipad' && r.helipad) {
      const hp = r.helipad;
      [[hp.x0 - 1, hp.z0 - 1], [hp.x1, hp.z0 - 1], [hp.x0 - 1, hp.z1], [hp.x1, hp.z1]].forEach((q) => {
        if (q[0] >= rect.x0 && q[0] < rect.x1 && q[1] >= rect.z0 && q[1] < rect.z1) { ops.push([q[0], y, q[1], q[0] + 1, y + 2, q[1] + 1, ID.IRON]); ops.push([q[0], y + 2, q[1], q[0] + 1, y + 3, q[1] + 1, ID.NEON_AMBER]); }
      });
      const sx = hp.x1 + 1;
      const sz = hp.z0 - 1;
      if (sx + 4 < rect.x1 && sz > rect.z0 && g.free(sx, sz, sx + 4, sz + 1)) windsock(ops, sx, sz, y);
    }
    if (hv(40) % 100 < 55 && wx >= 14 && wz >= 10) tries((x, z) => { if (!free(7, 2)(x, z)) return false; solar(ops, x, z, y, 2); return true; }, 1, 140);
  } else if (theme === 'bahce' || theme === 'ev') {
    tries((x, z, h) => { const al = (h & 1) === 0; const len = 3 + (h % 3); if (!g.take(x, z, al ? x + len : x + 1, al ? z + 1 : z + len, 0)) return false; planter(ops, x, z, y, len, al, h >> 3); return true; }, route3 ? 1 : 4, 100);
    if (!route3 && theme === 'bahce') {
      tries((x, z) => { if (!g.take(x, z, x + 1, z + 1, 1)) return false; lightPost(ops, x, z, y); return true; }, 2, 110);
      tries((x, z, h) => { if (!g.take(x - 1, z - 1, x + 2, z + 2, 0)) return false; pushProp('agac', x + 0.5, z + 0.5, h & 3, h & 7); return true; }, 1 + (hv(50) % 2), 130);
    }
    if (theme === 'ev') {
      tries((x, z) => { if (!free(1, 1)(x, z)) return false; chimney(ops, x, z, y, 3); return true; }, 1, 150);
      // eğimli çatı (kırmızı kademeler y..y+1): klima yerine ince bir uydu çanağı direği
      tries((x, z, h) => { if (!free(1, 1)(x, z)) return false; ops.push([x, y, z, x + 1, y + 4, z + 1, ID.IRON]); dish(ops, x, z, y + 2, h & 1); return true; }, route3 ? 0 : 1, 160);
    } else tries((x, z, h) => { if (!free(2, 2)(x, z)) return false; hvac(ops, x, z, y, h & 1); return true; }, maxHv - 1, 120);
  } else if (theme === 'pazar') {
    tries((x, z, h) => { if (!free(2, 2)(x, z)) return false; hvac(ops, x, z, y, h & 1); return true; }, maxHv, 100);
    if (!route3) tries((x, z) => { if (!g.take(x, z, x + 1, z + 1, 1)) return false; lightPost(ops, x, z, y); return true; }, 2, 130);
    if (!route3 && hv(41) % 100 < 50) tries((x, z) => { const al = wx >= wz; if (!g.take(x, z, al ? x + 5 : x + 1, al ? z + 1 : z + 5, 1)) return false; holoSign(ops, x, z, y, al); return true; }, 1, 150);
    tries((x, z, h) => { if (!g.take(x, z, x + 3, z + 1, 0)) return false; planter(ops, x, z, y, 3, true, h >> 3); return true; }, 1, 170);
  } else if (theme === 'teknik') {
    tries((x, z) => { if (!free(7, 2)(x, z)) return false; solar(ops, x, z, y, 2); return true; }, route3 ? 1 : 2, 100);
    tries((x, z, h) => { if (!free(2, 2)(x, z)) return false; hvac(ops, x, z, y, h & 1); return true; }, maxHv, 120);
    if (!route3) tries((x, z, h) => { if (!free(1, 1)(x, z)) return false; mast(ops, x, z, y, 6 + (h % 4)); return true; }, 2, 140);
  } else { // depo / konteyner / liman
    tries((x, z, h) => { if (!free(3, 4)(x, z)) return false; tank(ops, x, z, y, h & 1 ? B.CONCRETE_BLUE : B.CONCRETE_ORANGE); return true; }, route3 ? 0 : 1, 100);
    tries((x, z, h) => { if (!free(2, 2)(x, z)) return false; crates(ops, x, z, y, h); return true; }, maxHv, 120);
    tries((x, z, h) => { if (!free(2, 2)(x, z)) return false; hvac(ops, x, z, y, h & 1); return true; }, 1, 140);
    if (!route3) tries((x, z) => { if (!free(1, 1)(x, z)) return false; chimney(ops, x, z, y, 2); return true; }, 2, 160);
  }
  // 3) kule çekirdeği makine kulübesi (6×6; kapı yok, süs): çekirdek hücreleri üst katın çatısıyla aynı seviyedeyse
  (bp.core || []).forEach((c) => {
    const inTop = c.x0 >= rect.x0 && c.x1 <= rect.x1 && c.z0 >= rect.z0 && c.z1 <= rect.z1;
    if (!inTop) return;
    const x0 = c.x0 - 1;
    const z0 = c.z0 - 1;
    const x1 = c.x1 + 1;
    const z1 = c.z1 + 1;
    ops.push([x0, y, z0, x1, y + 3, z1, ID.WHITE]);
    ops.push([x0, y + 3, z0, x1, y + 4, z1, ID.BLACK]);
    ops.push([x0, y + 1, z0 + 2, x0 + 1, y + 2, z0 + 3, ID.WINDOW_COOL]);
    ops.push([x1 - 1, y + 1, z0 + 2, x1, y + 2, z0 + 3, ID.WINDOW_COOL]);
    ops.push([x0 + 2, y + 3, z0, x0 + 4, y + 4, z0 + 1, ID.NEON_CYAN]);
  });
  DECOR.set(bp, out);
  return out;
}

/** Açık hava çatı bahçesi alanı (kenardan 2 içeride); yalnız 'bahce' çatılarda. */
export function roofGardenFor(bp) {
  if (!bp || !bp.roof || bp.roof.kind !== 'bahce' || !bp.tiers || !bp.tiers.length) return null;
  const tt = topTier(bp);
  return { x0: tt.x0 + 2, z0: tt.z0 + 2, x1: tt.x0 + tt.w - 2, z1: tt.z0 + tt.d - 2, y: bp.roof.y };
}

/** Kule çekirdeği çatı durağı çapaları (asansör durakları için). */
export function roofAccessOf(bp) {
  const out = [];
  if (!bp || !bp.core || !bp.roof) return out;
  bp.core.forEach((c) => out.push({ kind: 'asansor', x: Math.floor((c.x0 + c.x1) / 2), z: Math.floor((c.z0 + c.z1) / 2), y: bp.roof.y, part: c.part }));
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Emisyon + propPlan kancası
 * ---------------------------------------------------------------------------------------------- */
export function emitRoofContent(w, plan, lot, bp) {
  const A0 = ARCHETYPES[bp.archetype];
  if (!A0 || !A0.building || bp.hill || !bp.roof) return;
  const fx0 = bp.x0;
  const fz0 = bp.z0;
  if (!w.touches(fx0 - 7, fz0 - 7, fx0 + bp.w + 7, fz0 + bp.d + 7)) return;
  emitRouteLot(w, plan, lot, bp);
  const D = roofDecor(plan, lot, bp);
  const ops = D.ops;
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o[0] >= w.x1 || o[3] <= w.x0 || o[2] >= w.z1 || o[5] <= w.z0) continue;
    w.box(o[0], o[1], o[2], o[3], o[4], o[5], o[6]);
  }
}

/** Çatı keşif çapaları: 8 parkur (başlangıç + bitiş sandığı + kontrol noktaları), 60 çatı çipi (cityPois 'cati': yalnız parkur çatıları), köprü sayısı. */
export function roofDiscovery(plan) {
  const routes = roofRouteContent(plan).map((R) => ({
    id: R.id, district: R.district, start: R.start, finish: R.finish.chest, pads: R.pads.map((p) => ({ x: p.x, y: p.y, z: p.z, lot: p.lot })), grapple: R.alt.grapple.map((g) => g.anchor), glide: R.alt.glide.pylon,
  }));
  const chips = pois(plan.seed).filter((p) => p.type === 'chip' && p.kind === 'cati');
  const keys = new Set();
  allLotsOf(plan).forEach((lot) => skybridgesOf(plan, lot).forEach((b) => keys.add(b.key)));
  return { routes, chips, bridges: keys.size };
}

function allLotsOf(plan) {
  return plan.lotsIndex.all().filter((l) => ARCHETYPES[l.archetype].tower);
}

/** Pencere başına bir kez (parsel döngüsünden sonra): kuleler arası gökyüzü köprüleri. */
export function emitRoofWindow(w, plan) {
  emitSkybridgesWindow(w, plan);
}

/** propPlan kancası: rect kesişen parsellerin çatı proplarını döner. */
export function roofPropSpecs(citySeed, rect) {
  const plan = getCityPlan(citySeed);
  const out = [];
  const lots = lotsInRect(citySeed, rect.x0, rect.z0, rect.x1, rect.z1);
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (!lot.built || lot.hill) continue;
    const A0 = ARCHETYPES[lot.archetype];
    if (!A0 || !A0.building || A0.special) continue;
    const bp = planBuilding(plan, lot);
    const D = roofDecor(plan, lot, bp);
    for (let k = 0; k < D.props.length; k++) out.push(D.props[k]);
  }
  return out;
}

