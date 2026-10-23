/*
 * KEŞİF sim/city — BİNA PLANI (parsel → kabuk planı). Saf, belirlenimci (yalnız subHash alt akışları), önbellekli. Sözleşme §7 `planBuilding`.
 *
 *  planBuilding(plan, lot) → BuildingPlan
 *    {id, lot, archetype, district, open:bool, owner:Owner|null, ownerId, x0,z0,w,d (ayak izi), y0:64, floors, floorH:4, height, top (çatı ayak y'si),
 *     front:'n'|'s'|'e'|'w', style, tiers:[{part,x0,z0,w,d,f0,f1,y0,y1,solid?}], bridges:[{f,x0,z0,x1,z1,y0,y1}], core:[{x0,z0,x1,z1,f0,f1}],
 *     volumes:[{role:'fuaye'|'serbest'|'sky_lobi'|'ofis_kapali'|'cati',f0,f1,x0,z0,x1,z1,y0,y1,part}],   (iç hacim REZERV; Faz 2 rooms[]'u doldurur)
 *     rooms:[], doors:[Door], locks:[], props:[PropSpec], interior:{kind,variant,owner,x0,z0,x1,z1,y0,y1}|null,
 *     roof:{kind,y,parapet,lift,antenna:{x,z,y,h}|null,helipad:{x0,z0,x1,z1,y}|null},
 *     anchors:{signs:[{face,slot,kind,x,y,z,w,h,yaw,floor,u}], roofItems:[{kind,x,y,z,yaw}], chips:[{slot,x,y,z}]},
 *     extStair:null|{face,flights,landing,top,rise}, stalls?:[…], features?:[…], hill?:Hill, stationEntrance?:Entrance, facade:[plan×4]}
 *  Plan nesneleri DEĞİŞTİRİLMEZ (önbellekten dönen paylaşılan nesne).
 *
 * PropSpec = {id:u32, kind, x,y,z (hücre/1 ondalık), yaw:0..3 (0 = −z'ye bakar, 1 = +x, 2 = +z, 3 = −x), variant:0..7, flags, lot, slot, w?, h?}
 */
import { ARCHETYPES, FLOOR_H, INTERIOR_FOOT, interiorFits } from './archetypes.js';
import { facadePlan, makeStyle } from './buildingFacade.js';
import { blankOf, containerCuts, footprintOf } from './cityLots.js';
import { FACE_YAW, TAG, sh, stream } from './cityPlanKit.js';
import { getOwner } from './ownerData.js';

export const SIGN_KINDS = Object.freeze({ tabela: 'tabela', billboard: 'billboard' });
const YAW_OF = FACE_YAW;
const FACE_OF = Object.freeze({ n: 0, e: 1, s: 2, w: 3 });
const FACE_VEC = Object.freeze({ n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] });

/** PropSpec (sim/props/propPlan.normalizeSpec girdisi): kimlik (lotId,slot) çiftidir; id'yi propPlan üretir. */
export function mkProp(lotId, slot, kind, x, y, z, yaw, variant, extra) {
  const p = { kind, x, y, z, yaw, variant, lotId, slot };
  if (extra) Object.assign(p, extra);
  return p;
}

/* ------------------------------------------------------------------------------------------------
 * Kademeler
 * ---------------------------------------------------------------------------------------------- */
function tier(part, rect, f0, f1) {
  return {
    part, x0: rect.x0, z0: rect.z0, w: rect.x1 - rect.x0, d: rect.z1 - rect.z0, f0, f1, y0: 64 + FLOOR_H * f0, y1: 64 + FLOOR_H * f1,
  };
}
const inset = (r, a) => ({ x0: r.x0 + a, z0: r.z0 + a, x1: r.x1 - a, z1: r.z1 - a });

function tiersFor(seed, lot, A0, fp, F, st) {
  const tiers = [];
  const bridges = [];
  const key = lot.archetype;
  const W = fp.x1 - fp.x0;
  const D = fp.z1 - fp.z0;
  if (key === 'kule_ikiz') {
    const alongX = W >= D;
    const L = alongX ? W : D;
    const g = 6 + st.i(5);
    const a = Math.floor((L - g) / 2);
    const b = L - g - a;
    const rA = alongX ? { x0: fp.x0, x1: fp.x0 + a, z0: fp.z0, z1: fp.z1 } : { x0: fp.x0, x1: fp.x1, z0: fp.z0, z1: fp.z0 + a };
    const rB = alongX ? { x0: fp.x1 - b, x1: fp.x1, z0: fp.z0, z1: fp.z1 } : { x0: fp.x0, x1: fp.x1, z0: fp.z1 - b, z1: fp.z1 };
    const fB = Math.max(Math.ceil(F * (0.8 + 0.2 * st.f())), 6);
    const fA = F;
    const upper = (r, f, part) => {
      // %65'inde bir kez 3 blok geri çekilen üst kademe
      if (f >= 16 && st.chance(0.65)) {
        const cut = Math.floor(f * (0.55 + 0.2 * st.f()));
        tiers.push(tier(part, r, 0, cut));
        tiers.push(tier(part, inset(r, 3), cut, f));
      } else tiers.push(tier(part, r, 0, f));
    };
    upper(rA, fA, 0);
    upper(rB, Math.min(fB, F), 1);
    const fMin = Math.min(fA, Math.min(fB, F));
    for (let f = 11; f < fMin - 1; f += 12) {
      const y0 = 64 + FLOOR_H * f - 1;
      if (alongX) {
        const zc = Math.floor((fp.z0 + fp.z1) / 2);
        bridges.push({ f, x0: rA.x1, x1: rB.x0, z0: zc - 1, z1: zc + 2, y0, y1: y0 + 4 });
      } else {
        const xc = Math.floor((fp.x0 + fp.x1) / 2);
        bridges.push({ f, x0: xc - 1, x1: xc + 2, z0: rA.z1, z1: rB.z0, y0, y1: y0 + 4 });
      }
    }
    return { tiers, bridges };
  }
  if (key === 'kule_spiral') {
    const base = Math.min(8, F);
    tiers.push(tier(0, fp, 0, base));
    let size = Math.min(W, D) - 4;
    size -= size & 1;
    let f = base;
    let k = 0;
    const corners = [[1, -1], [1, 1], [-1, 1], [-1, -1]]; // KD, GD, GB, KB
    let prev = fp;
    while (f < F) {
      const nf = Math.min(F, f + 8);
      size = Math.max(10, size - 6);
      const c = corners[k % 4];
      const s = Math.min(size, prev.x1 - prev.x0, prev.z1 - prev.z0);
      const r = {
        x0: c[0] > 0 ? prev.x1 - s : prev.x0,
        x1: c[0] > 0 ? prev.x1 : prev.x0 + s,
        z0: c[1] > 0 ? prev.z1 - s : prev.z0,
        z1: c[1] > 0 ? prev.z1 : prev.z0 + s,
      };
      tiers.push(tier(0, r, f, nf));
      prev = r;
      f = nf;
      k++;
    }
    return { tiers, bridges };
  }
  if (key === 'kule_cam' || key === 'kule_helipad') {
    const want = key === 'kule_helipad' ? 2 : 2 + st.i(2);
    const minTop = key === 'kule_helipad' ? 20 : 12;
    let prev = fp;
    let f = 0;
    for (let t = 0; t < want; t++) {
      const last = t === want - 1;
      let nf = F;
      if (!last) {
        nf = Math.max(f + 4, Math.floor(F * (0.45 + 0.3 * t + 0.1 * st.f())));
        if (nf > F - 3) nf = F; // üstte en az 3 kat kalmalı
      }
      const a = 3 + st.i(3);
      const nx = inset(prev, a);
      const fits = nx.x1 - nx.x0 >= minTop && nx.z1 - nx.z0 >= minTop;
      if (!last && (!fits || nf >= F)) {
        tiers.push(tier(0, prev, f, F));
        f = F;
        break;
      }
      tiers.push(tier(0, prev, f, nf));
      f = nf;
      if (!last) prev = nx;
    }
    return { tiers, bridges };
  }
  if (key === 'konteyner_yigini') {
    // yığınlar ön yüz boyunca bitişik (kapı hangi parçada olursa olsun duvar var)
    const alongX = lot.front === 'n' || lot.front === 's';
    const cuts = containerCuts(alongX ? W : D);
    const tall = st.i(cuts.length);
    for (let q = 0; q < cuts.length; q++) {
      const a = cuts[q][0];
      const b = cuts[q][1];
      const r = alongX ? { x0: fp.x0 + a, x1: fp.x0 + b, z0: fp.z0, z1: fp.z1 } : { x0: fp.x0, x1: fp.x1, z0: fp.z0 + a, z1: fp.z0 + b };
      const f = q === tall || lot.roof ? F : Math.max(1, F - st.i(3));
      tiers.push(tier(q, r, 0, f));
    }
    return { tiers, bridges };
  }
  // tek kademeli kutu; ≥10 katlı ofis/apartmanlarda tepede 2 blok geri çekilen kat
  if (F >= 10 && (key === 'ofis_blok' || key === 'apartman' || key === 'lab_binasi') && W > 12 && D > 12 && st.chance(0.6)) {
    const cut = F - Math.max(1, Math.floor(F * 0.15));
    tiers.push(tier(0, fp, 0, cut));
    tiers.push(tier(0, inset(fp, 2), cut, F));
    return { tiers, bridges };
  }
  tiers.push(tier(0, fp, 0, F));
  return { tiers, bridges };
}

/* ------------------------------------------------------------------------------------------------
 * İç hacimler (rezerv)
 * ---------------------------------------------------------------------------------------------- */
function tierRectAtFloor(tiers, part, f) {
  for (let q = 0; q < tiers.length; q++) {
    const t = tiers[q];
    if (t.part === part && f >= t.f0 && f < t.f1) return t;
  }
  return null;
}

function volumesFor(tiers, A0) {
  const vols = [];
  const parts = {};
  tiers.forEach((t) => { parts[t.part] = true; });
  Object.keys(parts).forEach((pk) => {
    const part = Number(pk);
    const top = tiers.filter((t) => t.part === part).reduce((m, t) => Math.max(m, t.f1), 0);
    const mk = (role, f0, f1) => {
      for (let f = f0; f < f1;) {
        const t = tierRectAtFloor(tiers, part, f);
        if (!t) break;
        const e = Math.min(f1, t.f1);
        vols.push({
          role, f0: f, f1: e, x0: t.x0 + 1, z0: t.z0 + 1, x1: t.x0 + t.w - 1, z1: t.z0 + t.d - 1, y0: 64 + FLOOR_H * f, y1: 64 + FLOOR_H * e - 1, part,
        });
        f = e;
      }
    };
    if (A0.tower && top >= 8) {
      mk('fuaye', 0, 3);
      const lobbies = [];
      for (let f = 14; f < top - 1; f += 15) lobbies.push(f);
      let cur = 3;
      lobbies.forEach((lf) => {
        mk('ofis_kapali', cur, lf);
        mk('sky_lobi', lf, lf + 1);
        cur = lf + 1;
      });
      mk('ofis_kapali', cur, top);
    } else mk('serbest', 0, top);
  });
  return vols;
}

/* ------------------------------------------------------------------------------------------------
 * Çıpalar
 * ---------------------------------------------------------------------------------------------- */
function wallPoint(face, fp, u) {
  // yüz düzlemi hücre merkezi ve dışa bakan yaw
  if (face === 'n') return { x: fp.x0 + u + 0.5, z: fp.z0 };
  if (face === 's') return { x: fp.x0 + u + 0.5, z: fp.z1 };
  if (face === 'w') return { x: fp.x0, z: fp.z0 + u + 0.5 };
  return { x: fp.x1, z: fp.z0 + u + 0.5 };
}

/** Kademenin `face` duvarı ayak izi düzleminde ise duvarın yüz boyunca [u0,u1) aralığı (ayak izi başından), değilse null. */
function wallSpan(t, face, fp) {
  if (face === 'n') return t.z0 === fp.z0 ? { u0: t.x0 - fp.x0, u1: t.x0 + t.w - fp.x0 } : null;
  if (face === 's') return t.z0 + t.d === fp.z1 ? { u0: t.x0 - fp.x0, u1: t.x0 + t.w - fp.x0 } : null;
  if (face === 'w') return t.x0 === fp.x0 ? { u0: t.z0 - fp.z0, u1: t.z0 + t.d - fp.z0 } : null;
  return t.x0 + t.w === fp.x1 ? { u0: t.z0 - fp.z0, u1: t.z0 + t.d - fp.z0 } : null;
}

/** [u0,u1) yuvasının `floor` katında duvarla desteklenen en geniş alt aralığı (köşelerden 1 içeride) | null. */
function backedSpan(tiers, face, fp, floor, u0, u1) {
  let best = null;
  let bo = 0;
  for (let q = 0; q < tiers.length; q++) {
    const t = tiers[q];
    if (floor < t.f0 || floor >= t.f1) continue;
    const sp = wallSpan(t, face, fp);
    if (!sp) continue;
    const a = Math.max(u0, sp.u0 + 1);
    const b = Math.min(u1, sp.u1 - 1);
    if (b - a > bo) {
      bo = b - a;
      best = { u0: a, u1: b };
    }
  }
  return bo >= 5 ? best : null;
}

function signAnchors(lot, A0, fp, F, style, roadFaces, tiers) {
  const out = [];
  let slot = 0;
  const faces = ['n', 'e', 's', 'w'];
  for (let q = 0; q < 4; q++) {
    const f = faces[q];
    if (!roadFaces[f]) continue;
    const alongX = f === 'n' || f === 's';
    const len = alongX ? fp.x1 - fp.x0 : fp.z1 - fp.z0;
    const fpn = facadePlan(style, len, F, f === lot.front ? A0.signs : Math.min(1, A0.signs));
    for (let s = 0; s < fpn.signSlots.length; s++) {
      const sl = fpn.signSlots[s];
      if (sl.u1 - sl.u0 < 5) continue;
      const kind = A0.tower && s === 0 ? SIGN_KINDS.billboard : SIGN_KINDS.tabela;
      // tercih edilen kattan aşağı doğru, duvarla DESTEKLENEN ilk kat (kademe geri çekilmesi/ikiz boşluğu/alçak parça havada tabela bırakmaz)
      let floor = kind === SIGN_KINDS.billboard ? Math.max(1, Math.floor(F * 0.45)) : sl.f0;
      let span = null;
      for (; floor >= 0 && span === null; floor--) span = backedSpan(tiers, f, fp, floor, sl.u0, sl.u1);
      floor++;
      if (span === null) continue;
      const um = Math.floor((span.u0 + span.u1) / 2);
      const pt = wallPoint(f, fp, um);
      const w = Math.min(span.u1 - span.u0, kind === SIGN_KINDS.billboard ? 12 : 10);
      const h = kind === SIGN_KINDS.billboard ? 6 : 3;
      const fv = FACE_VEC[f];
      const off = kind === SIGN_KINDS.billboard ? 0.25 : 0.125; // prop derinliğinin yarısı: duvara yapışık
      out.push({
        face: FACE_OF[f], slot: slot++, kind, x: pt.x + fv[0] * off, y: 64 + FLOOR_H * floor + (kind === SIGN_KINDS.billboard ? 1 : 3), z: pt.z + fv[1] * off, w, h,
        yaw: YAW_OF[f], floor, u: um,
      });
    }
  }
  return out;
}

function roofAnchors(seed, lot, A0, top, roof, helipad) {
  const out = [];
  const st = stream(seed, lot.id, TAG.B_ROOF);
  const rect = top; // üst kademe dikdörtgeni
  const wx = rect.x1 - rect.x0;
  const wz = rect.z1 - rect.z0;
  if (wx < 5 || wz < 5) return out;
  const n = A0.tower ? 2 + st.i(3) : 2 + st.i(4);
  const kinds = A0.roof === 'bahce' ? ['saksi', 'saksi', 'bank', 'klima'] : A0.roof === 'tente' ? ['klima', 'tabela_arka', 'klima'] : ['klima', 'klima', 'baca', 'anten'];
  for (let q = 0; q < n; q++) {
    const x = rect.x0 + 2 + st.i(Math.max(1, wx - 4));
    const z = rect.z0 + 2 + st.i(Math.max(1, wz - 4));
    if (helipad && x >= helipad.x0 - 1 && x < helipad.x1 + 1 && z >= helipad.z0 - 1 && z < helipad.z1 + 1) continue;
    out.push({ kind: kinds[st.i(kinds.length)], x: x + 0.5, y: roof.y, z: z + 0.5, yaw: st.i(4) });
  }
  if (lot.roof && lot.roof.total && lot.roof.order === lot.roof.total - 1) {
    out.push({ kind: 'sandik', x: (rect.x0 + rect.x1) / 2, y: roof.y, z: (rect.z0 + rect.z1) / 2, yaw: 0 });
  }
  return out;
}

function chipAnchors(seed, lot, A0, fp, roofTop, roofY, door) {
  const out = [];
  const st = stream(seed, lot.id, TAG.B_CHIP);
  const wx = roofTop.x1 - roofTop.x0;
  const wz = roofTop.z1 - roofTop.z0;
  if (A0.chipSlots.indexOf('roof') >= 0 && wx >= 4 && wz >= 4) {
    out.push({ slot: 'roof', x: roofTop.x0 + 1.5 + st.i(Math.max(1, wx - 3)), y: roofY, z: roofTop.z0 + 1.5 + st.i(Math.max(1, wz - 3)) });
  }
  if (A0.chipSlots.indexOf('back') >= 0 && (lot.setback.b >= 1 || lot.d - (fp.z1 - fp.z0) >= 1)) {
    const fv = FACE_VEC[lot.front];
    const bx = fv[0] !== 0 ? (fv[0] > 0 ? fp.x0 - 1 : fp.x1) : (fp.x0 + fp.x1) / 2;
    const bz = fv[1] !== 0 ? (fv[1] > 0 ? fp.z0 - 1 : fp.z1) : (fp.z0 + fp.z1) / 2;
    out.push({ slot: 'back', x: Math.floor(bx) + 0.5, y: 64, z: Math.floor(bz) + 0.5 });
  }
  if (A0.chipSlots.indexOf('door') >= 0 && door) {
    const side = st.chance(0.5) ? 2 : -2;
    const ax = door.axis === 'x' ? door.front.x + side : door.front.x;
    const az = door.axis === 'x' ? door.front.z : door.front.z + side;
    out.push({ slot: 'door', x: ax + 0.5, y: 64, z: az + 0.5 });
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * İç mekân rezervi
 * ---------------------------------------------------------------------------------------------- */
function interiorReserve(seed, lot, A0, tiers, door) {
  if (!door || !A0.interiors.length) return null;
  // kapının bulunduğu parça (zemin kat kademesi)
  const t0 = tiers.find((t) => t.f0 === 0 && door.inside.x >= t.x0 && door.inside.x < t.x0 + t.w && door.inside.z >= t.z0 && door.inside.z < t.z0 + t.d) || tiers[0];
  let kind = null;
  const ow = lot.owner ? getOwner(lot.owner) : null;
  const bw = t0.w - 2;
  const bd = t0.d - 2;
  if (ow && A0.interiors.indexOf(ow.interior) >= 0 && interiorFits(ow.interior, bw, bd)) kind = ow.interior;
  if (!kind) {
    const fit = A0.interiors.filter((k) => interiorFits(k, bw, bd));
    if (!fit.length) return null;
    kind = fit[sh(seed, lot.id, TAG.B_INT) % fit.length];
  }
  const f = INTERIOR_FOOT[kind];
  const alongX = door.axis === 'x';
  // rezerv w (kapı çizgisi boyunca), d (içeri); bina içinde, kapıyı kapsar
  let w = alongX ? Math.max(f[0], f[1]) : Math.max(f[0], f[1]);
  let d = Math.min(f[0], f[1]);
  if (!(w <= (alongX ? bw : bd) && d <= (alongX ? bd : bw))) {
    w = Math.min(f[0], f[1]);
    d = Math.max(f[0], f[1]);
  }
  const fv = FACE_VEC[door.face];
  const along = alongX ? door.x : door.z;
  const lo0 = alongX ? t0.x0 + 1 : t0.z0 + 1;
  const hi0 = alongX ? t0.x0 + t0.w - 1 : t0.z0 + t0.d - 1;
  let a0 = Math.round(along - w / 2);
  a0 = Math.max(lo0, Math.min(hi0 - w, a0));
  let r;
  if (alongX) {
    r = fv[1] < 0 ? { x0: a0, x1: a0 + w, z0: t0.z0 + 1, z1: t0.z0 + 1 + d } : { x0: a0, x1: a0 + w, z0: t0.z0 + t0.d - 1 - d, z1: t0.z0 + t0.d - 1 };
  } else {
    r = fv[0] < 0 ? { x0: t0.x0 + 1, x1: t0.x0 + 1 + d, z0: a0, z1: a0 + w } : { x0: t0.x0 + t0.w - 1 - d, x1: t0.x0 + t0.w - 1, z0: a0, z1: a0 + w };
  }
  return {
    kind, variant: sh(seed, lot.id, TAG.B_INT + 1) % 3, owner: lot.owner, part: t0.part, x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, y0: 64, y1: 64 + f[2],
  };
}

/* ------------------------------------------------------------------------------------------------
 * Dış merdiven (çatı parkuru başlangıcı)
 * ---------------------------------------------------------------------------------------------- */
/**
 * Dar ön yüz için ÜÇ KOLLU merdiven (ön boşluk 3 sıra: dış, orta, iç): A dış sırada, sahanlık, B orta sırada geri, sahanlık, C iç sırada ileri.
 * Genişlik ceil(yükseklik/3)+1 hücre: 12 geniş parselde kapı (len−5..len−3) merdivenle çakışmaz. İki kollu sürüm (extStairFor) sığmadığında kullanılır.
 */
function extStairThree(face, fp, rise, atStart, alongX, fv, rowIn) {
  const nA = Math.ceil(rise / 3);
  const nB = Math.ceil((rise - nA) / 2);
  const nC = rise - nA - nB;
  const step = fv[alongX ? 1 : 0];
  const rowMid = rowIn + step;
  const rowOut = rowMid + step;
  const dirA = atStart ? 1 : -1;
  const lo = (alongX ? fp.x0 : fp.z0) + 1;
  const hi = (alongX ? fp.x1 : fp.z1) - 1;
  const startA = atStart ? lo : hi - 1;
  const cell = (u, row) => (alongX ? { x: u, z: row } : { x: row, z: u });
  const flights = [];
  for (let i = 0; i < nA; i++) flights.push(Object.assign(cell(startA + dirA * i, rowOut), { y: 64 + i + 1, flight: 'A' }));
  const land1 = startA + dirA * nA;
  const landing = Object.assign(cell(land1, rowOut), { y: 64 + nA, cells: [cell(land1, rowOut), cell(land1, rowMid)] });
  for (let i = 0; i < nB; i++) flights.push(Object.assign(cell(land1 - dirA * i, rowMid), { y: 64 + nA + i + 1, flight: 'B' }));
  const land2 = land1 - dirA * nB;
  const landing2 = Object.assign(cell(land2, rowMid), { y: 64 + nA + nB, cells: [cell(land2, rowMid), cell(land2, rowIn)] });
  for (let i = 0; i < nC; i++) flights.push(Object.assign(cell(land2 + dirA * i, rowIn), { y: 64 + nA + nB + i + 1, flight: 'C' }));
  const topU = land2 + dirA * (nC - 1);
  return {
    face, rise, flights, landing, landing2, top: Object.assign(cell(topU, rowIn), { y: 64 + rise }), dirA,
  };
}

function extStairFor(lot, fp, rise) {
  const face = lot.front;
  const nA = Math.ceil(rise / 2);
  const nB = rise - nA;
  const alongX = face === 'n' || face === 's';
  const door = lot.door;
  // kapıdan uzak taraf: kapı fp başında/sonunda ise merdiven ters uçta
  const len = alongX ? fp.x1 - fp.x0 : fp.z1 - fp.z0;
  const doorU = door ? door.u : len;
  const atStart = doorU > len / 2 ? 1 : 0; // kapı uzakta → merdiven başta
  const flights = [];
  const fv = FACE_VEC[face];
  if (len < nA + 7 && lot.setback && lot.setback.f >= 3) {
    // iki kollu merdiven + kapı sığmıyor (QA2: 12-13 geniş parsellerde merdiven kapı önünü kapatıyordu) → üç kollu
    const wallC3 = alongX ? (face === 'n' ? fp.z0 : fp.z1 - 1) : face === 'w' ? fp.x0 : fp.x1 - 1;
    return extStairThree(face, fp, rise, atStart, alongX, fv, wallC3 + fv[alongX ? 1 : 0]);
  }
  // iç sıra (duvara bitişik) ve dış sıra (kaldırıma doğru): duvar koordinatı
  const wallC = alongX ? (face === 'n' ? fp.z0 : fp.z1 - 1) : face === 'w' ? fp.x0 : fp.x1 - 1;
  const rowIn = wallC + fv[alongX ? 1 : 0];
  const rowOut = rowIn + fv[alongX ? 1 : 0];
  const lo = (alongX ? fp.x0 : fp.z0) + 1;
  const hi = (alongX ? fp.x1 : fp.z1) - 1;
  const s0 = atStart ? lo : hi - nA - 1;
  const dirA = atStart ? 1 : -1;
  const cell = (u, row) => (alongX ? { x: u, z: row } : { x: row, z: u });
  // A: dış sırada s0'dan dirA yönünde nA basamak (y 65 …); sahanlık; B: iç sırada geri dönüş nB basamak
  const startA = s0 + (dirA > 0 ? 0 : nA);
  for (let i = 0; i < nA; i++) flights.push(Object.assign(cell(startA + dirA * i, rowOut), { y: 64 + i + 1, flight: 'A' }));
  const landU = startA + dirA * nA;
  const landing = Object.assign(cell(landU, rowOut), { y: 64 + nA, cells: [cell(landU, rowOut), cell(landU, rowIn)] });
  for (let i = 0; i < nB; i++) flights.push(Object.assign(cell(landU - dirA * (i), rowIn), { y: 64 + nA + i + 1, flight: 'B' }));
  const topU = landU - dirA * (nB - 1);
  return { face, rise, flights, landing, top: Object.assign(cell(topU, rowIn), { y: 64 + rise }), dirA };
}

/* ------------------------------------------------------------------------------------------------
 * Açık parsel (park / pazar tezgâhı)
 * ---------------------------------------------------------------------------------------------- */
function openLot(seed, lot) {
  const out = { props: [], features: [], stalls: [] };
  const st = stream(seed, lot.id, TAG.P_PARK);
  const w = lot.w;
  const d = lot.d;
  if (lot.archetype === 'pazar_tezgahi') {
    // iki sıra 4×3 tezgâh, orta koridor 3 geniş
    const alongX = lot.front === 'n' || lot.front === 's';
    const L = alongX ? w : d;
    const T = alongX ? d : w;
    const stall = 4;
    const depth = 3;
    const rowsN = T >= 12 ? 2 : 1;
    let slot = 0;
    for (let r = 0; r < rowsN; r++) {
      for (let u = 1; u + stall <= L - 1; u += stall + 2) {
        const t0 = r === 0 ? 1 : T - 1 - depth;
        const rect = alongX ? { x0: lot.x0 + u, x1: lot.x0 + u + stall, z0: lot.z0 + t0, z1: lot.z0 + t0 + depth }
          : { x0: lot.x0 + t0, x1: lot.x0 + t0 + depth, z0: lot.z0 + u, z1: lot.z0 + u + stall };
        out.stalls.push(Object.assign(rect, { h: 3, cloth: 83 + st.i(6), slot: slot++ }));
      }
    }
    return out;
  }
  // park: ağaçlar (8×8 kafes hash), bank, saksı; ortada 3 genişlikli yol
  let slot = 0;
  const pathX = Math.floor((lot.x0 + lot.x1) / 2);
  const pathZ = Math.floor((lot.z0 + lot.z1) / 2);
  out.features.push({ kind: 'yol', x0: pathX - 1, x1: pathX + 2, z0: lot.z0, z1: lot.z1 }, { kind: 'yol', x0: lot.x0, x1: lot.x1, z0: pathZ - 1, z1: pathZ + 2 });
  for (let gx = lot.x0 + 3; gx < lot.x1 - 2; gx += 6) {
    for (let gz = lot.z0 + 3; gz < lot.z1 - 2; gz += 6) {
      const x = gx + st.r(-1, 1);
      const z = gz + st.r(-1, 1);
      if (Math.abs(x - pathX) <= 2 || Math.abs(z - pathZ) <= 2) continue;
      if (!st.chance(0.75)) continue;
      out.props.push(mkProp(lot.id, slot++, 'agac', x + 0.5, 64, z + 0.5, st.i(4), st.i(8)));
    }
  }
  const nb = 1 + st.i(3);
  for (let q = 0; q < nb; q++) {
    const horizontal = st.chance(0.5);
    const x = horizontal ? lot.x0 + 3 + st.i(Math.max(1, w - 6)) : pathX + (st.chance(0.5) ? 2 : -3);
    const z = horizontal ? pathZ + (st.chance(0.5) ? 2 : -3) : lot.z0 + 3 + st.i(Math.max(1, d - 6));
    if (x < lot.x0 + 1 || x >= lot.x1 - 1 || z < lot.z0 + 1 || z >= lot.z1 - 1) continue;
    out.props.push(mkProp(lot.id, slot++, 'bank', x + 0.5, 64, z + 0.5, horizontal ? (z > pathZ ? 2 : 0) : (x > pathX ? 3 : 1), st.i(8)));
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Ana işlev
 * ---------------------------------------------------------------------------------------------- */
export function planBuilding(plan, lot) {
  const cache = plan._bplans;
  const hit = cache.get(lot.id);
  if (hit && hit.archetype === lot.archetype && hit.owner === (lot.owner ? getOwner(lot.owner) : null)) return hit;
  const seed = plan.seed;
  const A0 = ARCHETYPES[lot.archetype];
  const ow = lot.owner ? getOwner(lot.owner) : null;
  const base = {
    id: lot.id, lot: lot.id, archetype: lot.archetype, district: lot.district, open: !A0.building && !A0.special, owner: ow, ownerId: lot.owner, front: lot.front,
    y0: 64, floors: lot.floors, floorH: FLOOR_H, height: lot.floors * FLOOR_H, rooms: [], locks: [], doors: [], props: [], tiers: [], bridges: [], core: [],
    volumes: [], interior: null, anchors: { signs: [], roofItems: [], chips: [] }, roof: null, extStair: null, facade: [],
  };
  if (lot.hill) {
    const hill = plan.hill;
    const out = Object.assign(base, {
      open: false, x0: lot.x0, z0: lot.z0, w: lot.w, d: lot.d, hill, top: hill.maxY,
      tiers: hill.levels.map((l) => ({
        part: 0, x0: l.x0, z0: l.z0, w: l.x1 - l.x0, d: l.z1 - l.z0, f0: 0, f1: 0, y0: 64, y1: l.y, solid: true, k: l.k,
      })),
      roof: { kind: 'bahce', y: hill.maxY, parapet: 0, lift: 0, antenna: null, helipad: null },
    });
    out.anchors.chips = [{ slot: 'park', x: hill.top.x + 0.5, y: hill.maxY, z: hill.top.z + 3.5 }];
    cache.set(lot.id, out);
    return out;
  }
  if (!A0.building && !A0.special) {
    const o = openLot(seed, lot);
    const out = Object.assign(base, { x0: lot.x0, z0: lot.z0, w: lot.w, d: lot.d, props: o.props, stalls: o.stalls, features: o.features, top: 64 });
    out.anchors.chips = A0.chipSlots.indexOf('park') >= 0 ? [{ slot: 'park', x: lot.x0 + lot.w / 2 + 0.5, y: 64, z: lot.z0 + lot.d / 2 + 0.5 }] : [];
    cache.set(lot.id, out);
    return out;
  }
  const fp = footprintOf(lot);
  const F = lot.floors;
  const st = stream(seed, lot.id, TAG.B_TIER);
  const style = makeStyle(seed, lot, lot.archetype, A0, blankOf(plan, lot));
  const tb = tiersFor(seed, lot, A0, fp, F, st);
  const tiers = tb.tiers;
  const topTier = tiers.reduce((m, t) => (t.f1 > m.f1 || (t.f1 === m.f1 && t.w * t.d > m.w * m.d) ? t : m), tiers[0]);
  const lift = lot.roof ? lot.roof.lift : 0;
  const roofY = 64 + FLOOR_H * F + lift;
  const volumes = volumesFor(tiers, A0);
  const door = lot.door ? Object.assign({}, lot.door, { part: 0 }) : null;
  if (door) {
    const tt = tiers.find((t) => t.f0 === 0 && door.inside.x >= t.x0 && door.inside.x < t.x0 + t.w && door.inside.z >= t.z0 && door.inside.z < t.z0 + t.d);
    if (tt) door.part = tt.part;
  }
  const core = [];
  if (A0.tower && F >= 8) {
    const parts = {};
    tiers.forEach((t) => { if (!parts[t.part]) parts[t.part] = t; });
    Object.keys(parts).forEach((pk) => {
      const t = parts[pk];
      const cx = Math.floor(t.x0 + t.w / 2) - 2;
      const cz = Math.floor(t.z0 + t.d / 2) - 2;
      const f1 = tiers.filter((q) => q.part === Number(pk)).reduce((m, q) => Math.max(m, q.f1), 0);
      core.push({ part: Number(pk), x0: cx, z0: cz, x1: cx + 4, z1: cz + 4, f0: 0, f1 });
    });
  }
  // çatı
  const topRect = { x0: topTier.x0, z0: topTier.z0, x1: topTier.x0 + topTier.w, z1: topTier.z0 + topTier.d };
  let helipad = null;
  if (A0.roof === 'helipad') {
    const hs = 15;
    const hx = Math.floor((topRect.x0 + topRect.x1) / 2 - hs / 2);
    const hz = Math.floor((topRect.z0 + topRect.z1) / 2 - hs / 2);
    helipad = { x0: hx, z0: hz, x1: hx + hs, z1: hz + hs, y: roofY };
  }
  let antenna = null;
  if (A0.tower && !helipad && F >= 8) {
    const h = Math.min(8 + sh(seed, lot.id, TAG.B_ANT) % 17, 340 - roofY);
    if (h > 0) antenna = { x: topRect.x0 + Math.floor((topRect.x1 - topRect.x0) / 2) + 0.5, z: topRect.z0 + Math.floor((topRect.z1 - topRect.z0) / 2) + 0.5, y: roofY, h };
  }
  const roof = { kind: A0.roof, y: roofY, parapet: lot.roof ? 0 : (A0.roof === 'egimli' ? 0 : 1), lift, antenna, helipad };
  const interior = interiorReserve(seed, lot, A0, tiers, door);
  // yüzler: yola bakan yüzler (ön + parsel köşesi yan yüzler)
  const roadFaces = { n: false, e: false, s: false, w: false };
  roadFaces[lot.front] = true;
  const fp4 = [];
  const faceLen = { n: fp.x1 - fp.x0, s: fp.x1 - fp.x0, e: fp.z1 - fp.z0, w: fp.z1 - fp.z0 };
  ['n', 'e', 's', 'w'].forEach((f) => fp4.push(facadePlan(style, faceLen[f], F, A0.signs)));
  const signs = A0.signs > 0 ? signAnchors(lot, A0, fp, F, style, roadFaces, tiers) : [];
  const props = signs.map((s, q) => mkProp(lot.id, 32 + q, s.kind, s.x, s.y, s.z, s.yaw, sh(seed, lot.id * 8 + q, TAG.B_SIGN) & 7,
    ow && q === 0 ? { district: lot.district, brand: ow.brand } : { district: lot.district }));
  const out = Object.assign(base, {
    x0: fp.x0, z0: fp.z0, w: fp.x1 - fp.x0, d: fp.z1 - fp.z0, style, tiers, bridges: tb.bridges, core, volumes, doors: door ? [door] : [], props, interior,
    roof, top: roofY, facade: fp4,
  });
  out.anchors = {
    signs, roofItems: A0.tower || A0.roof !== 'egimli' ? roofAnchors(seed, lot, A0, topRect, roof, helipad) : [],
    chips: chipAnchors(seed, lot, A0, fp, topRect, roofY, door),
  };
  if (lot.roof && lot.roof.start) out.extStair = extStairFor(lot, fp, FLOOR_H * F + lift);
  if (lot.station) {
    const u = plan.underground;
    const stn = u && u.metro.stations[lot.station.id];
    if (stn) out.stationEntrance = stn.entrances.find((e) => e.lot === lot.id) || null;
  }
  cache.set(lot.id, out);
  return out;
}
