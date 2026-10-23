/*
 * KEŞİF sim — Anahtar Tapınağı çizimi (saf). Yerleşim/plan: structuresTemple.js.
 *
 * Yüzeyde yuvarlak bir "Rotunda" kule (kubbe + ışık hüzmesi) ve içinde merkez sütun çevresinde AŞAĞI inen sarmal merdiven;
 * kuyunun dibinden yeraltına uzanan zincir: (tünel) → bulmaca odası 1..n → ganimet odası → Anahtar Kristali sunak odası;
 * sunak odasının köşesinden asma sarmaşıklı bir çıkış bacası yüzeye çıkar (kısayol).
 *
 * Yerel çerçeve (chain): origin = 1. odanın origin'i (ly=0 yeraltı ayakta durulan hücre; ly=-1 zemin bloğu).
 * Kule merkezi yerel (0, TOWER_Z). yS = yüzey zemin bloğunun yerel y'si (= D−1).
 */
import { B, isSolid } from './blocks.js';
import { buildChamber, buildPuzzleRoom, makeCtx } from './puzzles/index.js';
import { buildBeacon, hf } from './structuresKit.js';
import { heightAt } from './worldgen.js';
import { TAU, angleAtU, buildHelix, buildRailing, helixPoint } from './structuresStairs.js';
import {
  circleShape, rampShape, rectShape, terraform, unionShape,
} from './structuresTerrain.js';

export const TOWER_Z = -17;
export const HALL_R = 8;
export const WALL_R = 10;
export const PLAZA_R = 12;
export const SHAFT_R = 5;
export const TERRACE_MARGIN = 6;
/** Tamsayı yarıçap r için kullanılan "d² ≤ r²+r" eşiği (ChunkW.cyl/ringWall ile aynı) → helis halkası için gerçek yarıçap. */
const rad = (r) => Math.sqrt(r * r + r);
const SHAFT_D2 = SHAFT_R * SHAFT_R + SHAFT_R; // 30
const HALL_D2 = HALL_R * HALL_R + HALL_R; // 72

/** Yerel kutu → dünya dikdörtgeni (xz). */
export function localRect(L, lx0, lz0, lx1, lz1) {
  const ax = L.wx(lx0, lz0);
  const bx = L.wx(lx1, lz1);
  const az = L.wz(lx0, lz0);
  const bz = L.wz(lx1, lz1);
  return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
}

function chance(L, lx, lz, p, salt) {
  return hf(L.wx(lx, lz), 0, L.wz(lx, lz), salt) < p;
}

/** Zemin deseni: ızgara + seyrek ikinci malzeme. */
function floorId(L, p, lx, lz, ly) {
  if (((lx + lz) & 1) === 0) return chance(L, lx, lz, 0.12, 31 + ly) ? p.wallAlt : p.floor;
  return p.floorAlt;
}

/** Dairesel koordinat yardımcısı. */
function polar(cx, cz, r, a) {
  return { lx: cx + Math.round(r * Math.sin(a)), lz: cz + Math.round(r * Math.cos(a)) };
}

/**
 * Yüzey kulesi + terasın tamamı. T = plan.tower: {cx,cz,yS,D,U,topAngle,dirX,dirZ,avenue}
 */
export function drawTower(L, T, p) {
  const { cx, cz, yS, D, U, topAngle } = T;
  const W = L.W;
  const R = Math.ceil(PLAZA_R + 1);
  if (!W.has(L.wx(cx, cz) - R - 20, L.wz(cx, cz) - R - 20, L.wx(cx, cz) + R + 20, L.wz(cx, cz) + R + 20)) {
    // chunk kule/avenüye değmiyorsa hızlı çıkış (avenü +20 payı)
    return;
  }
  const ux = T.dirX;
  const uz = T.dirZ;
  const vx = uz;
  const vz = -ux;

  /* 0) zemin: plaza + avenü düzleştirme, avenü sonunda erişim rampası */
  const wAt = (lx, lz) => ({ x: L.wx(lx, lz), z: L.wz(lx, lz) });
  const centerW = wAt(cx, cz);
  const plaza = circleShape(centerW.x, centerW.z, PLAZA_R);
  const s0 = wAt(cx + ux * (PLAZA_R - 2) - vx * 4, cz + uz * (PLAZA_R - 2) - vz * 4);
  const s1 = wAt(cx + ux * (PLAZA_R + T.avenue) + vx * 4, cz + uz * (PLAZA_R + T.avenue) + vz * 4);
  const strip = rectShape(Math.min(s0.x, s1.x), Math.min(s0.z, s1.z), Math.max(s0.x, s1.x), Math.max(s0.z, s1.z));
  const e0 = wAt(cx + ux * (PLAZA_R + T.avenue), cz + uz * (PLAZA_R + T.avenue));
  const dw = wAt(cx + ux * 10, cz + uz * 10);
  const ramp = rampShape(e0.x, e0.z, dw.x - centerW.x > 0 ? 1 : (dw.x - centerW.x < 0 ? -1 : 0),
    dw.z - centerW.z > 0 ? 1 : (dw.z - centerW.z < 0 ? -1 : 0), 4, T.ramp || 14, 0.5);
  terraform(W, unionShape([plaza, strip, ramp]), L.oy + yS, TERRACE_MARGIN);

  /* 1) kuyu: oy + zemin */
  L.cyl(cx, cz, 0, yS, SHAFT_R, 0);
  L.cyl(cx, cz, -1, -1, SHAFT_R + 2, p.floor);
  L.cyl(cx, cz, -3, -2, SHAFT_R + 3, p.base);
  /* 2) kuyu duvarı (yer altı) + ledge zemini */
  L.ringWall(cx, cz, -2, yS - 1, SHAFT_R, SHAFT_R + 2, p.wall);
  L.paint(cx - 9, yS - 2, cz - 9, cx + 9, yS, cz + 9, (lx, ly, lz) => {
    const dx = lx - cx;
    const dz = lz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 <= SHAFT_D2 || d2 > HALL_D2) return -1;
    if (ly < yS) return d2 > (SHAFT_R + 2) * (SHAFT_R + 2) + SHAFT_R + 2 ? p.base : -1;
    if (d2 > 38.4 && d2 <= 47.6) return p.glow; // halka kakma
    return floorId(L, p, lx, lz, 0);
  });

  /* 3) salon: hava + duvar + pencere */
  L.cyl(cx, cz, yS + 1, yS + 13, HALL_R, 0);
  L.ringWall(cx, cz, yS - 2, yS - 1, HALL_R, WALL_R, p.base);
  L.paint(cx - 11, yS, cz - 11, cx + 11, yS + 12, cz + 11, (lx, ly, lz) => {
    const dx = lx - cx;
    const dz = lz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 <= HALL_D2 || d2 > WALL_R * WALL_R + WALL_R) return -1;
    const k = ly - yS;
    if (k === 0 || k === 6 || k === 12) return p.trim;
    return chance(L, lx, lz, 0.16, 5 + ly) ? p.wallAlt : p.wall;
  });
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * (TAU / 8);
    const q = polar(cx, cz, 9.5, a);
    const da = Math.abs(Math.atan2(Math.sin(a - topAngle), Math.cos(a - topAngle)));
    if (da < 0.5) continue;
    L.fill(q.lx, yS + 6, q.lz, q.lx, yS + 9, q.lz, p.glass);
  }
  // kapı
  const door = (t0, t1, s0, s1, y0, y1, id) => {
    for (let t = t0; t <= t1; t++) {
      for (let s = s0; s <= s1; s++) {
        const lx = Math.round(cx + ux * t + vx * s);
        const lz = Math.round(cz + uz * t + vz * s);
        L.fill(lx, y0, lz, lx, y1, lz, id);
      }
    }
  };
  door(8, 12, -2, 2, yS + 6, yS + 6, p.trim);
  door(9, 11, -2, -2, yS + 1, yS + 5, p.pillar);
  door(9, 11, 2, 2, yS + 1, yS + 5, p.pillar);
  door(9, 11, -2, 2, yS + 5, yS + 5, p.trim);
  door(8, 12, -1, 1, yS + 1, yS + 4, 0); // açıklık
  door(10, 11, -1, 1, yS + 6, yS + 6, p.glow);
  door(11, 11, -3, -3, yS + 1, yS + 1, p.torch);
  door(11, 11, 3, 3, yS + 1, yS + 1, p.torch);

  /* 4) kubbe */
  const radii = [10, 9, 8, 6, 5, 3, 2];
  for (let k = 0; k < radii.length; k++) {
    const y = yS + 13 + k;
    L.cyl(cx, cz, y, y, radii[k], (k & 1) === 0 ? p.roof : p.roofAlt);
  }
  L.ringWall(cx, cz, yS + 13, yS + 13, 10, 11, p.trim);
  L.ringWall(cx, cz, yS + 12, yS + 12, 10, 11, p.trim);
  // kubbe çevresi parlak şerit
  for (let k = 0; k < 16; k++) {
    const q = polar(cx, cz, 10.6, k * (TAU / 16));
    L.set(q.lx, yS + 13, q.lz, p.glow);
  }

  /* 5) merkez sütun (zeminden zirveye) + sivri uç */
  L.paint(cx - 2, -1, cz - 2, cx + 2, yS + 30, cz + 2, (lx, ly, lz) => {
    const dx = lx - cx;
    const dz = lz - cz;
    const d2 = dx * dx + dz * dz;
    if (ly > yS + 20) return d2 <= 1 ? (ly > yS + 26 ? p.glow : p.pillar) : -1;
    if (d2 > 6) return -1;
    if (ly > yS + 12 + 7 && d2 > 2) return -1;
    return (ly + 3) % 6 === 0 ? p.glow : p.pillar;
  });
  L.cyl(cx, cz, yS + 27, yS + 28, 1, p.glow);

  /* 6) sarmal merdiven */
  const helix = {
    cx, cz, rIn: Math.sqrt(6.5), rOut: rad(SHAFT_R), yTop: yS, D, U, topAngle, stepId: p.floor, altId: p.floorAlt,
  };
  buildHelix(L, helix);
  // dış korkuluk + duvar fenerleri
  buildRailing(L, helix, yS + 1, 0.95, SHAFT_D2 + 0.5, (SHAFT_R + 1) * (SHAFT_R + 1) + SHAFT_R + 1, p.fence);
  for (let u = 0.18; u < U; u += 0.5) {
    const pt = helixPoint(helix, u, 6.0);
    L.set(pt.lx, pt.ly + 2, pt.lz, p.lamp);
  }
  // son basamağın altı ışıklı
  const bot = polar(cx, cz, 3.6, angleAtU(topAngle, U));
  L.set(bot.lx, -1, bot.lz, p.glow);

  /* 7) salon süsleri: fener direkleri */
  for (let k = 0; k < 8; k++) {
    const a = k * (TAU / 8);
    const da = Math.abs(Math.atan2(Math.sin(a - topAngle), Math.cos(a - topAngle)));
    if (da < 0.3) continue;
    const q = polar(cx, cz, 7.2, a);
    L.fill(q.lx, yS + 1, q.lz, q.lx, yS + 3, q.lz, p.pillar);
    L.set(q.lx, yS + 4, q.lz, p.lamp);
  }

  /* 8) dış sütun halkası ve plaza */
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * (TAU / 8);
    const q = polar(cx, cz, 11.8, a);
    L.fill(q.lx, yS + 1, q.lz, q.lx, yS + 8, q.lz, p.pillar);
    L.set(q.lx, yS + 9, q.lz, p.trim);
    L.set(q.lx, yS + 10, q.lz, p.lamp);
    L.set(q.lx, yS, q.lz, p.trim);
  }
  L.paint(cx - 14, yS, cz - 14, cx + 14, yS, cz + 14, (lx, ly, lz) => {
    const dx = lx - cx;
    const dz = lz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 <= WALL_R * WALL_R + WALL_R || d2 > PLAZA_R * PLAZA_R + PLAZA_R) return -1;
    if (d2 > 11.2 * 11.2 && d2 <= 11.9 * 11.9) return p.glow;
    return floorId(L, p, lx, lz, 1);
  });

  /* 9) avenü: kapıdan dışarı sütunlu yol */
  for (let t = Math.floor(PLAZA_R) - 1; t <= PLAZA_R + T.avenue; t++) {
    for (let s = -2; s <= 2; s++) {
      const lx = Math.round(cx + ux * t + vx * s);
      const lz = Math.round(cz + uz * t + vz * s);
      L.set(lx, yS, lz, s === 0 && ((t - 12) % 3 === 0) ? p.glow : (Math.abs(s) === 2 ? p.trim : p.floor));
    }
    if ((t - 12) % 4 === 0) {
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const lx = Math.round(cx + ux * t + vx * 3.5 * sgn);
        const lz = Math.round(cz + uz * t + vz * 3.5 * sgn);
        L.fill(lx, yS + 1, lz, lx, yS + 5, lz, p.pillar);
        L.set(lx, yS + 6, lz, p.lamp);
        L.set(lx, yS, lz, p.trim);
      }
    }
  }

  /* 10) tabela */
  const sg = T.sign;
  L.set(sg.lx, sg.ly, sg.lz, B.SIGN);

  /* 11) ışık hüzmesi */
  const wx = L.wx(cx, cz);
  const wz = L.wz(cx, cz);
  const yTop = L.oy + yS + 29;
  buildBeacon(W, wx, wz, yTop, yTop + 36, T.tier);
}

/**
 * Yeraltı zinciri: tünel kabukları → tünel oyuğu → odalar (bulmaca / ganimet / sunak) → süsler → baca.
 * C = {nodes:[{kind:'room'|'loot'|'altar', id?, type?, difficulty?, w,d,h, lx,lz,dir,facing}], corridors, chests, exitCol, exitY}
 * defer(fn): verilirse çıkış bacası hemen değil, tüm yapı planları çizildikten sonra fn(W) ile yazılır (decorateChunk plan.post).
 */
export function drawChain(L, C, p, env, defer) {
  const W = L.W;
  const zone = env.zone;
  const seed = env.seed;
  const clip = { x0: W.bx0, z0: W.bz0, x1: W.bx1, z1: W.bz1 };
  const bind = {
    setBlock: (x, y, z, id) => W.set(x, y, z, id),
    getBlock: (x, y, z) => W.get(x, y, z),
  };
  const wall = p.wall;

  /* tünel kabukları: kuyudan 1. odaya + bağlantılar */
  const shell = (lx0, lz0, lx1, lz1, h) => {
    L.paint(lx0 - 1, -2, lz0 - 1, lx1 + 1, h + 1, lz1 + 1, (lx, ly) => {
      if (ly === -2) return p.base;
      if (ly === -1) return (lx >= lx0 && lx <= lx1) ? p.floor : wall;
      if (ly >= h) return wall;
      return chance(L, lx, ly, 0.2, 77) ? p.wallAlt : wall;
    });
  };
  const carve = (lx0, lz0, lx1, lz1, h) => {
    L.fill(lx0, 0, lz0, lx1, h - 1, lz1, 0);
  };
  const first = { lx0: -1, lz0: TOWER_Z + 6, lx1: 1, lz1: -5, h: 3 };
  // kuyu ucunda kabuk marjı YOK: tünel doğrudan kuyu halkasına açılır
  L.paint(first.lx0 - 1, -2, first.lz0, first.lx1 + 1, first.h + 1, first.lz1 + 1, (lx, ly, lz) => {
    if (ly === -2) return p.base;
    if (ly === -1) return (lx >= first.lx0 && lx <= first.lx1 && lz <= first.lz1) ? p.floor : wall;
    if (ly >= first.h) return wall;
    return chance(L, lx, lz, 0.2, 77) ? p.wallAlt : wall;
  });
  C.corridors.forEach((c) => shell(c.lx0, c.lz0, c.lx1, c.lz1, c.h));
  carve(first.lx0, first.lz0, first.lx1, first.lz1, first.h);
  C.corridors.forEach((c) => carve(c.lx0, c.lz0, c.lx1, c.lz1, c.h));
  for (let lz = TOWER_Z + 8; lz <= -5; lz += 3) {
    L.set(-1, 1, lz, B.TORCH);
    L.set(1, 1, lz, B.TORCH);
  }
  C.corridors.forEach((c) => {
    if (c.kind === 'u') {
      for (let lx = c.lx0 + 2; lx <= c.lx1 - 2; lx += 3) L.set(lx, 2, c.lz0, p.lamp);
    }
  });

  /* odalar */
  for (let k = 0; k < C.nodes.length; k++) {
    const n = C.nodes[k];
    const o = L.toWorld(n.lx, 0, n.lz);
    // Oda derinliği 30'u aşabilir (hareketli platform salonu zorluk 4–5: 35–41 blok): sabit ±30 penceresi, origin'den >30 blok uzaktaki
    // chunk kesitlerinde odanın son satırlarını (bitiş adası, plaka) HİÇ çizmiyordu → salon tamamlanamıyordu.
    const reach = Math.max(30, (n.d || 0) + 8, (n.w || 0) + 8);
    if (!W.has(o.x - reach, o.z - reach, o.x + reach, o.z + reach)) continue;
    const LN = W.local(o, n.facing);
    if (n.kind === 'room') {
      buildPuzzleRoom(
        { id: n.id, type: n.type, origin: o, facing: n.facing, difficulty: n.difficulty, zone },
        Object.assign({ seed, clip }, bind),
      );
      continue;
    }
    const ctx = makeCtx(Object.assign({
      id: env.id + '#' + n.kind, worldSeed: seed, origin: o, facing: n.facing, zone, difficulty: env.difficulty, clip,
    }, bind));
    if (n.kind === 'loot') {
      buildChamber(ctx, { w: n.w, d: n.d, h: n.h, doorFront: true, doorBack: 'open' });
      decorateLoot(LN, n, p);
    } else {
      buildChamber(ctx, { w: n.w, d: n.d, h: n.h, doorFront: true, doorBack: false });
      decorateAltar(LN, n, p, C, defer);
    }
  }
  for (let i = 0; i < C.chests.length; i++) {
    const c = C.chests[i];
    W.set(c.x, c.y, c.z, c.block);
  }
}

function xRange(w) {
  const x0 = -((w - 1) >> 1);
  return { x0, x1: x0 + w - 1 };
}

function decorateLoot(LN, n, p) {
  const { x0, x1 } = xRange(n.w);
  const lzb = n.d - 1;
  for (let lx = x0 + 1; lx <= x1 - 1; lx += 2) {
    LN.set(lx, 0, lzb, p.log);
    LN.set(lx, 1, lzb, B.BOOKSHELF);
    LN.set(lx, 2, lzb, B.BOOKSHELF);
  }
  for (let lz = 1; lz < lzb; lz++) {
    LN.set(0, -1, lz, p.accent);
    LN.set(1, -1, lz, p.accent2);
    LN.set(-1, -1, lz, p.accent2);
  }
}

function decorateAltar(LN, n, p, C, defer) {
  const W = LN.W;
  const ac = n.d >> 1;
  LN.fill(-2, -1, ac - 2, 2, -1, ac + 2, p.trim);
  LN.fill(-1, -1, ac - 1, 1, -1, ac + 1, p.glow);
  for (const [qx, qz] of [[3, 3], [-3, 3], [3, -3], [-3, -3], [5, 0], [-5, 0]]) {
    LN.fill(qx, 0, ac + qz, qx, 3, ac + qz, p.pillar);
    LN.set(qx, 4, ac + qz, p.lamp);
  }
  LN.set(0, 0, ac, B.ALTAR);
  LN.set(0, 1, ac, B.CRYSTAL_ROCK);
  LN.set(1, 0, ac, p.torch);
  LN.set(-1, 0, ac, p.torch);
  for (let k = 0; k < 16; k++) {
    const s = k * (TAU / 16);
    LN.set(Math.round(4.5 * Math.sin(s)), -1, ac + Math.round(4.5 * Math.cos(s)), p.glow);
  }
  // çıkış bacası (sarmaşık) — sunak odasının köşesinden yüzeye. defer verilirse baca tüm planlardan sonra yazılır (plan.post).
  const chimney = (WW) => drawChimney(WW, LN, C, p);
  if (defer) defer(chimney);
  else chimney(W);
}

function drawChimney(W, LN, C, p) {
  const ex = C.exitCol;
  const exw = { x: LN.wx(ex.lx, ex.lz), z: LN.wz(ex.lx, ex.lz) };
  if (!W.has(exw.x - 2, exw.z - 2, exw.x + 2, exw.z + 2)) return;
  const g = W.ground(exw.x, exw.z);
  const yTop0 = (g > 0 ? g : C.exitY) + 1;
  // Baca ağzı doğal zeminde (g) değil, DİĞER yapıların (kule terası dolgusu) ya da 3B arazinin (çıkıntı) kapattığı yerde de
  // sonlanabilir: tarama zemin yüksekliğini heightAt'tan alıyordu, teras dolgusu ağzı 25 blok kayanın altına gömüyordu (QA: tohum
  // başına tapınakların ~%20'sinin çıkışı kapalı). Sütun, açık gökyüzüne (ilk boş hücre) kadar sarmaşıkla uzatılır.
  // Ağızdan yana çıkış olana dek (komşu hücrede iki blok boşluk + altı katı) sarmaşık uzatılır: çıkıntının ince bir levha olduğu yerde
  // sütun levhayı geçse de çevresi kayayla çevrili bir kuyuya açılıyordu, oyuncu yukarı tırmanamıyordu.
  const clear = (x, y, z) => {
    const id = W.get(x, y, z);
    return id === 0 || id === null || id === undefined || !isSolid(id);
  };
  const stepOut = (x, y, z) => {
    if (!clear(x, y, z) || !clear(x, y + 1, z)) return false;
    const b = W.get(x, y - 1, z);
    return !!b && isSolid(b);
  };
  const yMax = Math.min(W.top - 2, yTop0 + 70);
  // 1) sütunu kapatan dolgu/çıkıntıyı geç: ilk boş hücreye kadar
  let yAir = yTop0;
  for (let y = yTop0 + 1; y <= yMax; y++) {
    const id = W.get(exw.x, y, exw.z);
    if (id === 0 || id === null || id === undefined) break;
    yAir = y;
  }
  // 2a) baca çukur/yarık (kanyon, düden) tabanına açılıyorsa: komşu sütunların zemin yüksekliği (kenar) üstüne çıkılır. W.ground doğal
  //      zemindir; heightAt'ın görmediği çukurlar için kenar yüksekliği buradan gelir (en çok 30 blok).
  let rim = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const gg = W.ground(exw.x + dx, exw.z + dz);
    if (gg > rim) rim = gg;
  }
  // çukur genişse komşu sütunlar da çukur tabanındadır: kenar yüksekliği kesin dünya yükseklik işlevinden, 3–4 blok ötedeki halkadan
  if (W.ctx && W.ctx.seed !== undefined && W.ctx.seed !== null) {
    const ring = [];
    for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3], [4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, -3], [3, -3], [-3, 3]]) {
      ring.push(heightAt(W.ctx.seed, exw.x + dx, exw.z + dz));
    }
    ring.sort((a, b) => a - b);
    const med = ring[ring.length >> 1]; // ortanca: tek yanlı tepe sarmaşığı gereksiz yükseltmesin
    if (med > rim) rim = med;
  }
  const yRim = Math.min(rim + 1, yAir + 30);
  // çukur tabanındaki komşu sütunlar kenar yüksekliğine kadar doldurulur: sarmaşık tepesi kenarla aynı hizada, yana yürünebilir
  if (yRim > yAir + 1) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dz === 0) continue;
        const x = exw.x + dx;
        const z = exw.z + dz;
        const g2 = W.ground(x, z);
        if (g2 < 1 || g2 >= yRim - 1) continue;
        const fillId = W.groundFill(x, z);
        for (let y = g2 + 1; y < yRim - 1; y++) W.set(x, y, z, fillId);
        W.set(x, yRim - 1, z, W.groundTop(x, z));
      }
    }
  }
  // 2b) yana çıkış (komşuda iki blok boşluk + altı katı) bulunana dek en çok 24 blok daha uzat; bulunmazsa 1. adımdaki yükseklik kalır
  let yTop = Math.max(yAir, yRim);
  for (let y = yTop; y <= Math.min(yMax, yTop + 24); y++) {
    const colFree = clear(exw.x, y + 1, exw.z); // sütunun üstü açık (tavan yok)
    if (colFree && (stepOut(exw.x + 1, y, exw.z) || stepOut(exw.x - 1, y, exw.z) || stepOut(exw.x, y, exw.z + 1) || stepOut(exw.x, y, exw.z - 1))) {
      yTop = y;
      break;
    }
  }
  const top = yTop - LN.oy;
  LN.fill(ex.lx, 0, ex.lz, ex.lx, top, ex.lz, 0);
  for (let ly = 0; ly <= top; ly++) LN.set(ex.lx, ly, ex.lz, B.VINE);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const x = LN.wx(ex.lx + dx, ex.lz + dz);
      const z = LN.wz(ex.lx + dx, ex.lz + dz);
      const gg = W.ground(x, z);
      if (gg > 0 && gg >= yTop - 3 && gg <= yTop + 1) W.set(x, gg, z, p.trim);
    }
  }
  W.set(exw.x + 1, yTop, exw.z, p.lamp);
  W.set(exw.x - 1, yTop, exw.z, p.lamp);
}
