/*
 * KEŞİF sim/city — 12 GİZLİ LABORATUVAR İÇERİĞİ (Faz 2, interiors_d). Saf, belirlenimci; yalnız pencere (chunk dilimi) içini yazar.
 * Kabuk (3 oda 16×12×6, odalar arası 6 basamaklı inen merdiven, servis bacası, 4 tavan ışığı/oda) olduğu gibi kalır.
 *
 * Yerel koordinat (lab, oda k): u = zincir yönünde (0 = sokağa yakın uç … 15), w = enine (0..11). Oda k=2 giriş salonu (sunucu), k=1 çalışma alanı
 * (robot/tezgâh; ilk 6 u hücresi merdiven), k=0 çekirdek (tanklar; ilk 6 hücre merdiven; merkez sütun HER ZAMAN boş: kasa bacası/test).
 *  - bulkhead (k=2/k=1 son sütunu u=15): 12 geniş duvar + 3×3 sürgülü kapı (239) → kilitli kapı
 *  - giriş kapağı (servis bacası, kanalizasyon zemini): 'gizli' (zemin gibi görünür) ya da 'kod' (ızgara kapak + tuş takımı)
 *  - tema (6): robotik, veri, enerji, biyo-bahçe, optik, ses — vurgu rengi, eşya kümesi, tank ışığı
 *
 *  emitLabContent(w, plan)
 *  labData(plan)  → {labs:[{id,theme,name,accent,rooms[],entry:Door,d1:Door|null,d2:Door,props…}], doors[]}
 *  labPropSpecs(plan, rect, out)
 *  labFrame(L)    → yerel dönüşümler (testler/GPU betiği)
 */
import { B } from '../blocks.js';
import { ID } from './cityEmit.js';
import { LAB } from './cityUndergroundPlan.js';
import {
  PSEUDO, UT, dirYaw, hh, hi, mkLock, mkSpec, codeOf,
} from './cityContentKit.js';

export const LAB_THEMES = Object.freeze([
  Object.freeze({ key: 'robotik', name: 'Robotik Laboratuvarı', neon: ID.NEON_AMBER, glass: B.GLASS_ORANGE, accent: B.CONCRETE_ORANGE }),
  Object.freeze({ key: 'veri', name: 'Veri Laboratuvarı', neon: ID.NEON_CYAN, glass: B.GLASS_BLUE, accent: B.CONCRETE_BLUE }),
  Object.freeze({ key: 'enerji', name: 'Enerji Laboratuvarı', neon: ID.NEON_LIME, glass: B.GLASS_GREEN, accent: B.CONCRETE_GREEN }),
  Object.freeze({ key: 'biyo', name: 'Biyo-Bahçe Laboratuvarı', neon: ID.NEON_LIME, glass: B.GLASS_GREEN, accent: B.CONCRETE_GREEN }),
  Object.freeze({ key: 'optik', name: 'Optik Laboratuvarı', neon: ID.NEON_PINK, glass: B.GLASS_PURPLE, accent: B.CONCRETE_PURPLE }),
  Object.freeze({ key: 'ses', name: 'Ses Laboratuvarı', neon: ID.NEON_PINK, glass: B.GLASS_PURPLE, accent: B.CONCRETE_PURPLE }),
]);

const ROOM_ROLE = Object.freeze({ 2: 'salon', 1: 'calisma', 0: 'cekirdek' });
const ROOM_NAME = Object.freeze({ 2: 'Giriş Salonu', 1: 'Çalışma Alanı', 0: 'Çekirdek' });

/* ------------------------------------------------------------------------------------------------
 * Yerel dönüşüm
 * ---------------------------------------------------------------------------------------------- */
export function labFrame(L) {
  const z = L.axis === 'z'; // yol z boyunca → zincir x yönünde
  const s = L.side;
  const rooms = {};
  L.rooms.forEach((r) => { rooms[r.k] = r; });
  const dir = z ? [s, 0] : [0, s];
  const acr = z ? [0, 1] : [1, 0];
  function room(k) {
    const r = rooms[k];
    const near = z ? (s > 0 ? r.x0 : r.x1) : (s > 0 ? r.z0 : r.z1);
    const a0 = z ? r.z0 : r.x0;
    return {
      r,
      k,
      y0: r.y0,
      y1: r.y1,
      cell(u, wv) {
        const along = s > 0 ? near + u : near - 1 - u;
        const across = a0 + wv;
        return z ? [along, across] : [across, along];
      },
      pt(u, wv) {
        const along = near + s * u;
        const across = a0 + wv;
        return z ? [along, across] : [across, along];
      },
      /** yerel hücre dikdörtgeni [u0,u1)×[w0,w1) → dünya yarı açık dikdörtgen */
      rect(u0, w0, u1, w1) {
        const a = this.cell(u0, w0);
        const b = this.cell(u1 - 1, w1 - 1);
        return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]) + 1, z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) + 1 };
      },
    };
  }
  return {
    room, dir, acr, yawFar: dirYaw(dir[0], dir[1]), yawNear: dirYaw(-dir[0], -dir[1]), yawPlus: dirYaw(acr[0], acr[1]), yawMinus: dirYaw(-acr[0], -acr[1]),
  };
}

function themeOf(plan, L) {
  return (L.id + hi(plan.seed, 0, UT.LB_THEME, LAB_THEMES.length)) % LAB_THEMES.length;
}

/* ------------------------------------------------------------------------------------------------
 * Kapılar, kilitler
 * ---------------------------------------------------------------------------------------------- */
const GAMES = Object.freeze(['simon', 'levers', 'dice']);
const D_CLOSED = ID.DOOR;

/** Bulkhead kapısı: oda k'nın son sütunu (u=15), w 5..7, 3×3. */
function bulkheadDoor(plan, L, k, fr, lock, id) {
  const R = fr.room(k);
  const cells = [];
  for (let wv = 5; wv <= 7; wv++) {
    const c = R.cell(15, wv);
    for (let h = 0; h < 3; h++) cells.push({ x: c[0], y: R.y0 + h, z: c[1], closed: D_CLOSED, open: ID.DOOR_OPEN });
  }
  const mid = R.cell(15, 6);
  const deep = fr.room(k - 1).cell(0, 6);
  return {
    id, kind: 'door', x: mid[0], y: R.y0, z: mid[1], axis: L.axis === 'z' ? 'z' : 'x', w: 3, h: 3, cells, lock, hidden: false, exitFree: true,
    deep: { x: deep[0], y: R.y0 - 1, z: deep[1] }, lab: L.id, role: 'bulkhead' + k,
  };
}

function entryHatch(plan, L) {
  const sh = L.shaft;
  const id = 'le' + L.id;
  const hidden = L.entry.kind === 'gizli';
  const cells = hidden
    ? [{ x: sh.x, y: 30, z: sh.z, closed: ID.COBBLE, open: B.LADDER }, { x: sh.x, y: 31, z: sh.z, closed: 0, open: B.LADDER }]
    : [{ x: sh.x, y: 30, z: sh.z, closed: D_CLOSED, open: B.LADDER }];
  let lock;
  let pad = null;
  let clue = null;
  if (hidden) {
    lock = mkLock(id, 'serbest', 0, { reveal: 'tarayici', range: 12, lab: L.id });
  } else {
    const digits = 3 + (hh(plan.seed, L.id, UT.LB_CODE) & 1);
    const code = codeOf(plan.seed, 100 + L.id, digits);
    // tuş takımı: tünel duvarında (kapak tarafı), kapağın 2–3 hücre yanında; ipucu notu karşı duvarda 5 hücre ötede
    const along = L.axis === 'z' ? sh.z : sh.x;
    const nearNodeD = (v) => Math.abs(v - Math.round(v / 80) * 80);
    let da = 2.5;
    if (nearNodeD(along + da) < 5) da = -2.5;
    let dc = -4.5;
    if (nearNodeD(along + dc) < 5) dc = 5.5;
    const plane = (sd) => (sd > 0 ? L.line + 3 - 0.0625 : L.line - 2 + 0.0625);
    const yawOf = (sd) => (L.axis === 'z' ? (sd > 0 ? 3 : 1) : (sd > 0 ? 2 : 0));
    const mkp = (sd, al, y) => (L.axis === 'z' ? { x: plane(sd), y, z: al, yaw: yawOf(sd) } : { x: al, y, z: plane(sd), yaw: yawOf(sd) });
    pad = mkp(L.side, Math.floor(along + da) + 0.5, 32.25);
    clue = mkp(-L.side, Math.floor(along + dc) + 0.5, 32.5);
    lock = mkLock(id, 'kod', 1, {
      lab: L.id, digits, code, pad: { x: pad.x, y: pad.y, z: pad.z }, clue: { x: clue.x, y: clue.y, z: clue.z, text: 'Servis notu: bacanın kodu ' + code.split('').join('-') + '.' },
    });
  }
  return {
    id: 'hatch' + L.id, kind: 'hatch', x: sh.x, y: 30, z: sh.z, axis: L.axis === 'z' ? 'z' : 'x', w: 1, h: 1, cells, lock, hidden, exitFree: true,
    deep: { x: sh.x, y: LAB.y0 + 2 * LAB.step, z: sh.z }, lab: L.id, role: 'entry', pad, clue,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Yerleşim tabloları (proplar): [anahtar, u, w, yön, varyant, y?]; yön: 'f' uzak uç, 'n' yakın uç, '+' w+, '-' w−
 * ---------------------------------------------------------------------------------------------- */
const SLOTS_L = [3.5, 6.5, 9.5, 12.5];
function wallSets(theme, role) {
  const T = LAB_THEMES[theme].key;
  // her kümede iki duvar için (sol, sağ) anahtar listesi
  if (role === 'salon') {
    if (T === 'veri') return [['sunucu_rafi'], ['sunucu_rafi']];
    if (T === 'robotik') return [['sarj_istasyonu', 'dolap_sirali'], ['mini_robot', 'dolap_sirali']];
    if (T === 'enerji') return [['sunucu_rafi', 'kablo_demeti'], ['dolap_sirali', 'sunucu_rafi']];
    if (T === 'biyo') return [['sera_rafi', 'saksi_buyuk'], ['sera_rafi', 'saksi_buyuk']];
    if (T === 'optik') return [['holo_ekran', 'dolap_sirali'], ['holo_ekran', 'tarayici_cihaz']];
    return [['hoparlor', 'dolap_sirali'], ['hoparlor', 'sunucu_rafi']];
  }
  if (role === 'calisma') {
    if (T === 'robotik') return [['is_tezgahi', 'robot_kol'], ['takim_dolabi', 'robot_kol']];
    if (T === 'veri') return [['cok_ekranli_masa', 'is_tezgahi'], ['sunucu_rafi', 'cok_ekranli_masa']];
    if (T === 'enerji') return [['is_tezgahi', 'sarj_istasyonu'], ['takim_dolabi', 'kablo_demeti']];
    if (T === 'biyo') return [['sera_rafi', 'is_tezgahi'], ['sera_rafi', 'akvaryum']];
    if (T === 'optik') return [['is_tezgahi', 'tarayici_cihaz'], ['holo_ekran', 'is_tezgahi']];
    return [['is_tezgahi', 'hoparlor'], ['dj_standi', 'hoparlor']];
  }
  if (T === 'robotik') return [['robot_kol', 'parca_rafi'], ['robot_kol', 'sarj_istasyonu']];
  if (T === 'veri') return [['sunucu_rafi', 'bilgi_terminali'], ['sunucu_rafi', 'cok_ekranli_masa']];
  if (T === 'enerji') return [['sarj_istasyonu', 'kablo_demeti'], ['sarj_istasyonu', 'bilgi_terminali']];
  if (T === 'biyo') return [['akvaryum', 'sera_rafi'], ['akvaryum', 'saksi_buyuk']];
  if (T === 'optik') return [['tarayici_cihaz', 'holo_ekran'], ['tarayici_cihaz', 'bilgi_terminali']];
  return [['hoparlor', 'bilgi_terminali'], ['hoparlor', 'dj_standi']];
}

function roomProps(plan, L, fr, k, out, base, slotRef, isVault) {
  const R = fr.room(k);
  const role = ROOM_ROLE[k];
  const theme = themeOf(plan, L);
  const sets = wallSets(theme, role);
  const slots = k === 2 ? SLOTS_L : k === 1 ? [7.5, 10.5, 13.5] : [7.5];
  const mk = (kind, u, wv, yaw, variant, y, extra) => {
    const p = R.pt(u, wv);
    out.push(mkSpec(base, slotRef.n++, kind, p[0], y === undefined ? R.y0 : y, p[1], yaw, variant, extra));
  };
  for (let q = 0; q < slots.length; q++) {
    const kl = sets[0][q % sets[0].length];
    const kr = sets[1][q % sets[1].length];
    const v = hh(plan.seed, L.id * 16 + k * 4 + q, UT.LB_PROP) % 3;
    if (!(isVault && k === 1 && q === 2)) mk(kl, slots[q], 0.9, fr.yawPlus, v); // kasa lab: bu yuva Kart-3 dolabına ayrılır
    mk(kr, slots[q], 11.1, fr.yawMinus, v);
  }
  // ada elemanları (koridor w 4..8 serbest; her zaman kenarlara)
  if (k === 2) {
    mk('cok_ekranli_masa', 2.4, 2.6, fr.yawFar, 0);
    mk('bilgi_terminali', 2.4, 9.6, fr.yawFar, 1);
    mk('kod_notu', 0.0625, 3.0, fr.yawFar, 0, R.y0 + 1.5);
  } else if (k === 1) {
    mk('is_tezgahi', 9.0, 3.2, fr.yawPlus, 1);
    mk('robot_kol', 12.2, 3.0, fr.yawFar, 0);
    mk('mini_robot', 9.0, 8.6, fr.yawMinus, 1);
    mk('tarayici_cihaz', 12.2, 9.0, fr.yawMinus, 0);
  } else {
    mk('bilgi_terminali', 9.5, 3.4, fr.yawNear, 0);
    mk('mini_robot', 9.5, 8.6, fr.yawNear, 2);
    mk('holo_ekran', 15.875, 6.0, fr.yawNear, 2, R.y0 + 1.25);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Veri
 * ---------------------------------------------------------------------------------------------- */
export function labData(plan) {
  if (plan._ugLabs) return plan._ugLabs;
  const labs = [];
  const doors = [];
  const vaultLab = plan.underground.vault.labId;
  for (let q = 0; q < plan.underground.labs.length; q++) {
    const L = plan.underground.labs[q];
    const fr = labFrame(L);
    const theme = themeOf(plan, L);
    const entry = entryHatch(plan, L);
    const isVault = L.id === vaultLab;
    // k=2 → k=1 bulkhead yalnız kasa laboratuvarında (Kart-2); k=1 → k=0 bulkhead her labda mini-hack
    const d1 = isVault ? bulkheadDoor(plan, L, 2, fr, mkLock('vd1', 'kart', 2, { card: 2, lab: L.id, room: 'calisma' }), 'bh2_' + L.id) : null;
    const game = GAMES[(L.id + hh(plan.seed, L.id, UT.LB_KIND)) % 3];
    const tier = isVault ? 2 : 1 + (L.id % 3);
    const d2 = bulkheadDoor(plan, L, 1, fr, mkLock('ld' + L.id, 'mini_hack', tier, { game, difficulty: tier, lab: L.id, room: 'cekirdek' }), 'bh1_' + L.id);
    doors.push(entry);
    if (d1) doors.push(d1);
    doors.push(d2);
    labs.push({
      id: L.id,
      district: L.district,
      theme,
      name: LAB_THEMES[theme].name,
      isVault,
      entry,
      d1,
      d2,
      rooms: L.rooms.map((r) => ({ k: r.k, role: ROOM_ROLE[r.k], name: ROOM_NAME[r.k], x0: r.x0, y0: r.y0, z0: r.z0, x1: r.x1, y1: r.y1, z1: r.z1 })),
    });
  }
  Object.defineProperty(plan, '_ugLabs', { value: { labs, doors }, enumerable: false, configurable: true, writable: true });
  return plan._ugLabs;
}

/* ------------------------------------------------------------------------------------------------
 * Emisyon
 * ---------------------------------------------------------------------------------------------- */
function paintRing(w, fr, k, th) {
  const R = fr.room(k);
  // kabuk halkası hücreleri: oda dikdörtgeninin 1 dışı (yalnız FACADE_LIGHT boyanır; açıklıklar/merdiven/kapı korunur)
  const x0 = R.r.x0 - 1;
  const x1 = R.r.x1;
  const z0 = R.r.z0 - 1;
  const z1 = R.r.z1;
  const lo = (v, a) => Math.max(v, a);
  for (let z = lo(z0, w.z0); z <= Math.min(z1, w.z1 - 1); z++) {
    for (let x = lo(x0, w.x0); x <= Math.min(x1, w.x1 - 1); x++) {
      const onRing = x === x0 || x === x1 || z === z0 || z === z1;
      if (!onRing) continue;
      const along = ((x * 7 + z * 13) & 3) === 0;
      if (w.get(x, R.y0, z) === ID.FACADE_LIGHT) {
        w.set(x, R.y0, z, ID.FACADE_DARK);
        if (w.get(x, R.y0 + 1, z) === ID.FACADE_LIGHT) w.set(x, R.y0 + 1, z, ID.FACADE_DARK);
      }
      if (along && w.get(x, R.y0 + 3, z) === ID.FACADE_LIGHT) w.set(x, R.y0 + 3, z, th.neon);
    }
  }
}

function floorPattern(w, fr, k, th, skip) {
  const R = fr.room(k);
  const u0 = k === 2 ? 0 : 6; // merdiven hücrelerine dokunma
  for (let u = u0; u < 16; u++) {
    for (let wv = 0; wv < 12; wv++) {
      const c = R.cell(u, wv);
      if (c[0] < w.x0 || c[0] >= w.x1 || c[1] < w.z0 || c[1] >= w.z1) continue;
      if (skip && c[0] === skip.x && c[1] === skip.z) continue; // kasa bacası zemini deler
      let id = ((u + wv) & 1) === 0 ? ID.POLISHED : ID.WHITE;
      if (wv === 4 || wv === 7) id = th.accent; // koridor çizgileri
      if (wv > 4 && wv < 7 && (u & 1) === 0) id = ID.POLISHED;
      w.set(c[0], R.y0 - 1, c[1], id);
    }
  }
}

function emitBulkhead(w, fr, k, door, th) {
  const R = fr.room(k);
  // 12 geniş duvar sütunu u=15; kapı açıklığı hücreleri (door.cells) 239
  for (let wv = 0; wv < 12; wv++) {
    const c = R.cell(15, wv);
    if (c[0] < w.x0 || c[0] >= w.x1 || c[1] < w.z0 || c[1] >= w.z1) continue;
    for (let y = R.y0; y < R.y1; y++) w.set(c[0], y, c[1], ID.FACADE_DARK);
    if (wv >= 5 && wv <= 7) w.set(c[0], R.y0 + 3, c[1], th.neon); // kapı başlığı
    if (wv === 4 || wv === 8) for (let y = R.y0; y < R.y0 + 3; y++) w.set(c[0], y, c[1], th.accent);
  }
  for (let i = 0; i < door.cells.length; i++) {
    const c = door.cells[i];
    w.set(c.x, c.y, c.z, c.closed);
  }
}

function tank(w, cx, cz, y0, th, h) {
  // 3×3 köşesi kesik, h yüksek cam silindir; ortada ışıklı çekirdek; taban/tepe demir
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const corner = Math.abs(dx) === 1 && Math.abs(dz) === 1;
      const x = cx + dx;
      const z = cz + dz;
      w.set(x, y0, z, ID.IRON);
      w.set(x, y0 + h + 1, z, ID.IRON);
      if (corner) continue;
      for (let y = y0 + 1; y <= y0 + h; y++) w.set(x, y, z, dx === 0 && dz === 0 ? th.neon : th.glass);
    }
  }
}

function emitLabRooms(w, plan, lab, L) {
  const fr = labFrame(L);
  const th = LAB_THEMES[lab.theme];
  for (let k = 2; k >= 0; k--) {
    const R = fr.room(k);
    const rr = R.r;
    if (!w.touches(rr.x0 - 1, rr.z0 - 1, rr.x1 + 1, rr.z1 + 1) || !w.touchesY(rr.y0 - 1, rr.y1 + 1)) continue;
    paintRing(w, fr, k, th);
    floorPattern(w, fr, k, th, k === 0 && lab.isVault ? plan.underground.vault.shaft : null);
    // tavan ışık panelleri yanına neon şeridi (aksan): tavan satırında aralıklı
    if (k === 2 || k === 1) {
      const door = k === 2 ? lab.d1 : lab.d2;
      if (door) emitBulkhead(w, fr, k, door, th);
      else if (k === 2) {
        // kasa dışı labda k=2 sonunda kapı yok: açıklık
      }
    }
    if (k === 0) {
      // çekirdek: iki tank, merkez sütun (u=8 w=6 çevresi) boş; yanlarda
      const t1 = R.cell(13, 2);
      const t2 = R.cell(13, 9);
      if (w.touches(t1[0] - 1, t1[1] - 1, t1[0] + 2, t1[1] + 2)) tank(w, t1[0], t1[1], R.y0, th, 3);
      if (w.touches(t2[0] - 1, t2[1] - 1, t2[0] + 2, t2[1] + 2)) tank(w, t2[0], t2[1], R.y0, th, 3);
    }
  }
}

function emitEntry(w, lab) {
  const e = lab.entry;
  for (let i = 0; i < e.cells.length; i++) {
    const c = e.cells[i];
    w.set(c.x, c.y, c.z, c.closed);
  }
  // giriş kapağının etrafı: gizli kapakta işaret yok; kodlu kapakta kapak çerçevesi neon
}

export function emitLabContent(w, plan) {
  if (!w.touchesY(LAB.y0 - 3, 33)) return;
  const D = labData(plan);
  for (let q = 0; q < D.labs.length; q++) {
    const lab = D.labs[q];
    const L = plan.underground.labs[q];
    const b = L.box;
    if (w.touches(b.x0 - 2, b.z0 - 2, b.x1 + 2, b.z1 + 2) && w.touchesY(LAB.y0 - 2, LAB.y0 + LAB.rooms * LAB.step + 2)) emitLabRooms(w, plan, lab, L);
    const sh = L.shaft;
    if (w.touches(sh.x, sh.z, sh.x + 1, sh.z + 1)) emitEntry(w, lab);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Proplar
 * ---------------------------------------------------------------------------------------------- */
const PROP_CACHE = new WeakMap();

function labProps(plan, lab, L) {
  const hit = PROP_CACHE.get(lab);
  if (hit) return hit;
  const fr = labFrame(L);
  const out = [];
  const base = PSEUDO.lab + lab.id;
  const slotRef = { n: 0 };
  for (let k = 2; k >= 0; k--) roomProps(plan, L, fr, k, out, base, slotRef, lab.isVault);
  // kilit düzenekleri: bulkhead okuyucuları (oda içi yüz, kapının yanı)
  const addPad = (door, k, key) => {
    if (!door) return;
    const R = fr.room(k);
    const p = R.pt(14.9375, 4.4);
    out.push(mkSpec(base, slotRef.n++, key, p[0], R.y0 + 1.25, p[1], fr.yawNear, 0, { lockId: door.lock.id }));
  };
  addPad(lab.d1, 2, 'kart_okuyucu');
  addPad(lab.d2, 1, 'hack_terminali');
  // kasa laboratuvarı: Kart-3 dolabı çalışma alanında (kapı 1 arkasında); kasa kapağı terminali çekirdek odasında
  if (lab.isVault) {
    const R1 = fr.room(1);
    const p = R1.pt(13.5, 0.9);
    out.push(mkSpec(base, 90, 'dolap_sirali', p[0], R1.y0, p[1], fr.yawPlus, 2, { gives: 'kart_3' }));
  }
  // giriş kapağı: kodlu kapakta tuş takımı + (karşı duvarda) kod notu
  if (lab.entry.lock.kind === 'kod') {
    const pd = lab.entry.pad;
    const cl = lab.entry.clue;
    out.push(mkSpec(base, slotRef.n++, 'kod_paneli', pd.x, pd.y, pd.z, pd.yaw, 0, { lockId: lab.entry.lock.id }));
    out.push(mkSpec(base, slotRef.n++, 'kod_notu', cl.x, cl.y, cl.z, cl.yaw, 0, { lockId: lab.entry.lock.id }));
  }
  PROP_CACHE.set(lab, out);
  return out;
}

function overlapRect(a, r) {
  return a.x0 < r.x1 && a.x1 > r.x0 && a.z0 < r.z1 && a.z1 > r.z0;
}

export function labPropSpecs(plan, rect, out) {
  const D = labData(plan);
  for (let q = 0; q < D.labs.length; q++) {
    const L = plan.underground.labs[q];
    if (!overlapRect({ x0: L.box.x0 - 2, x1: L.box.x1 + 2, z0: L.box.z0 - 2, z1: L.box.z1 + 2 }, rect)) continue;
    const list = labProps(plan, D.labs[q], L);
    for (let k = 0; k < list.length; k++) out.push(list[k]);
  }
  return out;
}

export { ROOM_ROLE };
