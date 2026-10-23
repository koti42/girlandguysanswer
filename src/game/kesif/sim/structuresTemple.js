/*
 * KEŞİF sim — Anahtar Tapınağı planı (yer seçimi, bulmaca zinciri, tanım). Çizim: structuresTempleBuild.js.
 *
 * Her bölgede ZONES[z].temples adet (anchor) bulunur; her biri 3–5 bulmaca odasından geçip Anahtar Kristali sunağına varır.
 * Zincir YERALTINDADIR ve şeritler halinde kıvrılır (küçük ayak izi); yüzeyde yuvarlak bir kule + avenü + plaza düzlenmiş
 * terasta durur. Kule kuyusu sarmal merdivenle zincire iner; sunak odasından sarmaşıklı baca yüzeye çıkar.
 */
import { SEA_LEVEL, ZONES } from './constants.js';
import { hash2 } from './rng.js';
import { heightAt } from './worldgen.js';
import {
  chamberSize, clampDifficulty, getPuzzle, puzzleTypesForDifficulty, registeredPuzzleTypes,
} from './puzzles/index.js';
import { FACINGS, localToWorld } from './puzzles/kitGeometry.js';
import { NullW, paletteFor } from './structuresKit.js';
import {
  beaconEntry, boxOf, chestEntry, makePlan, signEntry,
} from './structuresPlan.js';
import {
  HALL_R, PLAZA_R, TERRACE_MARGIN, TOWER_Z, WALL_R, drawChain, drawTower, localRect,
} from './structuresTempleBuild.js';
import { layoutNodes } from './structuresTempleLayout.js';
import { helixTurns } from './structuresStairs.js';
import { heightApprox, siteStats } from './structuresTerrain.js';

/** Bölgeye göre oda zorlukları (artan). */
const DIFFS = [
  [1, 1, 2],
  [1, 2, 2, 3],
  [2, 2, 3, 4],
  [3, 3, 4, 4, 5],
  [3, 4, 4, 5, 5],
];

const LOOT = { w: 9, d: 7, h: 5 };
const ALTAR = { w: 13, d: 13, h: 8 };
const AVENUE = 8;
const RAMP = 14;

function roomCount(zone, rng) {
  switch (zone) {
    case 0: return 3;
    case 1: return rng.next() < 0.5 ? 3 : 4;
    case 2: return 4;
    case 3: return rng.next() < 0.5 ? 4 : 5;
    default: return 5;
  }
}

/** Bulmaca zincirini seç: [{type,difficulty,w,d,h}] (kayıt boşsa []). */
export function pickChain(env, count) {
  if (registeredPuzzleTypes().length === 0) return [];
  const diffs = DIFFS[Math.min(DIFFS.length - 1, env.zone)].slice(0, count);
  while (diffs.length < count) diffs.push(diffs[diffs.length - 1]);
  const used = new Set();
  const out = [];
  for (let k = 0; k < count; k++) {
    let pool = puzzleTypesForDifficulty(diffs[k]).filter((t) => !used.has(t));
    if (pool.length === 0) pool = puzzleTypesForDifficulty(diffs[k]);
    if (pool.length === 0) pool = registeredPuzzleTypes();
    const type = pool[Math.floor(env.rng.next() * pool.length)];
    const impl = getPuzzle(type);
    const d = clampDifficulty(impl, diffs[k]);
    const fp = impl.footprint(d);
    const sz = chamberSize(fp.w, fp.d, fp.h);
    used.add(type);
    out.push({ type, difficulty: d, w: sz.w, d: sz.d, h: sz.h });
  }
  return out;
}

function topAngleFor(U) {
  const k = (((-Math.round(U * 4)) % 4) + 4) % 4;
  return k * (Math.PI / 2);
}

/** Yerel kutuyu dünya dikdörtgenine çevirmek için (y=0 sahte çerçeve). */
function frameAt(o1x, o1z, f) {
  return NullW.local({ x: o1x, y: 0, z: o1z }, f);
}

/** Aday: kule merkezi (tx,tz), yön f. Döner {score,...} | null. */
function evalCandidate(env, tx, tz, f, lay, Hmax, dr) {
  const fv = FACINGS[f];
  const o1 = { x: tx + 17 * fv.fx, y: 0, z: tz + 17 * fv.fz };
  const ts = siteStats(env.seed, tx, tz, 10, 10, 4, 4);
  if (ts.wet > (env.force ? 0.9 : (env.relaxed ? 0.5 : 0.3))) { env.why('t-wet'); return null; }
  if (ts.range > (env.force ? 45 : (env.relaxed ? 20 : 12))) { env.why('t-range'); return null; }
  const Ys = Math.max(SEA_LEVEL + 2, Math.round(ts.median));
  if (Ys > 84) { env.why('high'); return null; }
  // zincir kutusu boyunca örnekler
  const b = lay.bbox;
  let ymin = 999;
  let wet = 0;
  let n = 0;
  for (let lz = b.lz0; lz <= b.lz1 + 7; lz += 8) {
    for (let lx = b.lx0; lx <= b.lx1 + 7; lx += 8) {
      const p = localToWorld(o1, f, Math.min(lx, b.lx1), 0, Math.min(lz, b.lz1));
      const h = heightApprox(env.seed, p.x, p.z);
      if (h < ymin) ymin = h;
      if (h < SEA_LEVEL + 2) wet++;
      n++;
    }
  }
  if (wet / n > (env.force ? 1.01 : (env.relaxed ? 0.8 : 0.5))) { env.why('c-wet'); return null; }
  const Ymax = Math.min(Ys - 9, ymin - Hmax - 6);
  const Y0 = env.deepY(dr, Ymax, Hmax + 3);
  if (Y0 < 8) { env.why('y0'); return null; }
  const D = Ys - Y0;
  const U = helixTurns(D);
  return {
    score: ts.range * 3 + (wet / n) * 40 + ts.wet * 80 + D * 0.6,
    tx, tz, f, o1x: o1.x, o1z: o1.z, Ys, Y0, D, U, topAngle: topAngleFor(U), ymin, ts,
  };
}

/** Derin dikdörtgen (zincir + kuyu + tünel): yalnızca (o1, f) ve yerleşime bağlı. */
function deepRect(o1x, o1z, f, lay) {
  const L = frameAt(o1x, o1z, f);
  const b = lay.bbox;
  const chain = localRect(L, b.lx0, b.lz0, b.lx1, b.lz1);
  const shaft = localRect(L, -9, TOWER_Z - 9, 9, TOWER_Z + 9);
  const tunnel = localRect(L, -3, TOWER_Z + 5, 3, -3);
  return {
    x0: Math.min(chain.x0, shaft.x0, tunnel.x0) - 2,
    z0: Math.min(chain.z0, shaft.z0, tunnel.z0) - 2,
    x1: Math.max(chain.x1, shaft.x1, tunnel.x1) + 2,
    z1: Math.max(chain.z1, shaft.z1, tunnel.z1) + 2,
  };
}

/** Çıkış bacasının yüzey ağzı (dünya x,z): sunak düğümünün çerçevesinde. */
function exitColumn(lay, o1x, o1z, f) {
  const L0 = frameAt(o1x, o1z, f);
  const altN = lay.nodes[lay.nodes.length - 1];
  const o = L0.toWorld(altN.lx, 0, altN.lz);
  const AL = NullW.local(o, altN.dir === 1 ? f : (f + 2) & 3);
  const w = AL.toWorld(-((altN.w - 1) >> 1) + 1, 0, altN.d - 2);
  return { x: w.x, z: w.z };
}

/** Yüzey (kule + avenü + rampa) dikdörtgeni. */
function surfRect(c) {
  const L = frameAt(c.o1x, c.o1z, c.f);
  const ux = Math.round(Math.sin(c.topAngle));
  const uz = Math.round(Math.cos(c.topAngle));
  const cx = L.wx(0, TOWER_Z);
  const cz = L.wz(0, TOWER_Z);
  const R = PLAZA_R + TERRACE_MARGIN + 3;
  const ext = PLAZA_R + AVENUE + RAMP + 6;
  const ex = L.wx(ux * ext, TOWER_Z + uz * ext);
  const ez = L.wz(ux * ext, TOWER_Z + uz * ext);
  return {
    x0: Math.min(cx - R, ex - 6), z0: Math.min(cz - R, ez - 6), x1: Math.max(cx + R, ex + 6), z1: Math.max(cz + R, ez + 6),
  };
}

function unionRect(a, b) {
  return {
    x0: Math.min(a.x0, b.x0), z0: Math.min(a.z0, b.z0), x1: Math.max(a.x1, b.x1), z1: Math.max(a.z1, b.z1),
  };
}

export const TEMPLE = {
  key: 'anahtartapinagi',
  name: 'Anahtar Tapınağı',
  plan(env) {
    const n0 = roomCount(env.zone, env.rng);
    const rooms = pickChain(env, n0);
    const nodes = rooms.map((r, i) => Object.assign({ kind: 'room', idx: i }, r));
    nodes.push(Object.assign({ kind: 'loot' }, LOOT));
    nodes.push(Object.assign({ kind: 'altar' }, ALTAR));
    const lays = [34, 56, 96].map((m) => layoutNodes(nodes, m));
    const Hmax = Math.max(...nodes.map((n) => n.h));

    const cands = env.cands(env.force ? 90 : (env.relaxed ? 60 : 44), env.force ? 70 : (env.relaxed ? 48 : 34), env.force ? 70 : (env.relaxed ? 48 : 34));
    let best = null;
    const rot = hash2(env.ci, env.cj, env.seed) & 3;
    for (let ci = 0; ci < cands.length; ci++) {
      for (let li = 0; li < lays.length; li++) {
        const lay = lays[li];
        for (let k = 0; k < 4; k++) {
          const f = (k + rot) & 3;
          const fv = FACINGS[f];
          const o1x = cands[ci].x + 17 * fv.fx;
          const o1z = cands[ci].z + 17 * fv.fz;
          const dr = deepRect(o1x, o1z, f, lay);
          if (!env.rectOk(dr, null, 'deep')) { env.why('deepFail'); continue; }
          const c = evalCandidate(env, cands[ci].x, cands[ci].z, f, lay, Hmax, dr);
          if (!c) continue;
          c.score += ci * 0.3 + Math.max(dr.x1 - dr.x0, dr.z1 - dr.z0) * 0.3 + Math.hypot(cands[ci].x - env.desired.x, cands[ci].z - env.desired.z) * 0.12;
          const sr = surfRect(c);
          if (!env.rectOk(sr)) { env.why('surfFail'); continue; }
          const ec = exitColumn(lay, c.o1x, c.o1z, f);
          const pad = {
            x0: ec.x - 4, z0: ec.z - 4, x1: ec.x + 4, z1: ec.z + 4,
          };
          if (!env.rectOk(pad)) { env.why('exitFail'); continue; }
          if (!env.force && heightAt(env.seed, ec.x, ec.z) < SEA_LEVEL + 1) { env.why('exitWet'); continue; }
          // çıkış ağzı uçurum kenarında olmasın: çevresindeki yüzey en çok 4 blok değişmeli (aksi halde sarmaşık tepesinden yana yürünemez)
          if (!env.force) {
            let lo = 1e9;
            let hi = -1e9;
            for (let dz = -4; dz <= 4; dz += 2) {
              for (let dx = -4; dx <= 4; dx += 2) {
                const hh = heightAt(env.seed, ec.x + dx, ec.z + dz);
                if (hh < lo) lo = hh;
                if (hh > hi) hi = hh;
              }
            }
            if (hi - lo > 4) { env.why('exitSteep'); continue; }
          }
          c.pad = pad;
          c.rect = unionRect(sr, dr);
          c.surf = sr;
          c.deep = dr;
          c.lay = lay;
          if (!best || c.score < best.score) best = c;
        }
      }
    }
    if (!best) return null;
    return finishPlan(env, best, best.lay);
  },
};

function finishPlan(env, c, lay) {
  env.biome = env.biomeAt(c.tx, c.tz);
  const pal = paletteFor(env.zone, env.biome);
  const O1 = { x: c.o1x, y: c.Y0 + 1, z: c.o1z };
  const L0 = NullW.local(O1, c.f);
  const yS = c.Ys - O1.y;
  const ux = Math.round(Math.sin(c.topAngle));
  const uz = Math.round(Math.cos(c.topAngle));

  // düğümlere facing ve kimlik ata
  const nodes = lay.nodes.map((n) => Object.assign({}, n, {
    facing: n.dir === 1 ? c.f : (c.f + 2) & 3,
  }));
  const puzzles = [];
  nodes.forEach((n) => {
    if (n.kind !== 'room') return;
    n.id = env.id + '#' + (puzzles.length + 1);
    const o = L0.toWorld(n.lx, 0, n.lz);
    puzzles.push({
      id: n.id,
      type: n.type,
      origin: { x: o.x, y: o.y, z: o.z },
      facing: n.facing,
      difficulty: n.difficulty,
      zone: env.zone,
      structureId: env.id,
    });
  });

  // ganimet odası sandıkları: arka duvar önü
  const lootN = nodes.find((n) => n.kind === 'loot');
  const LL = NullW.local(L0.toWorld(lootN.lx, 0, lootN.lz), lootN.facing);
  const chests = [];
  [-2, 0, 2].forEach((lx, i) => {
    const p = LL.toWorld(lx, 0, lootN.d - 2);
    chests.push(chestEntry(env, p.x, p.y, p.z, { kind: i === 0 ? 'ödül' : 'sandık', block: i === 0 ? 'ödül' : 'sandık', index: i }));
  });

  // sunak
  const altN = nodes.find((n) => n.kind === 'altar');
  const AL = NullW.local(L0.toWorld(altN.lx, 0, altN.lz), altN.facing);
  const ac = altN.d >> 1;
  const altarW = AL.toWorld(0, 0, ac);
  const exitCol = { lx: -((altN.w - 1) >> 1) + 1, lz: altN.d - 2 };
  const exW = AL.toWorld(exitCol.lx, 0, exitCol.lz);
  const exitY = Math.max(heightAt(env.seed, exW.x, exW.z), SEA_LEVEL) + 1;

  // kule + tabela
  const towerW = L0.toWorld(0, 0, TOWER_Z);
  const sg = {
    lx: Math.round(ux * (PLAZA_R - 2) - uz * 3),
    ly: yS + 1,
    lz: Math.round(TOWER_Z + uz * (PLAZA_R - 2) + ux * 3),
  };
  const sgW = L0.toWorld(sg.lx, sg.ly, sg.lz);
  const text = env.name + ' — ' + ZONES[env.zone].name + ': Kuyudan aşağı in ve bulmaca odalarını sırayla çöz. '
    + 'Sondaki sunakta Anahtar Kristali seni bekliyor; dönüşte köşedeki sarmaşıkla yüzeye çıkabilirsin.';
  const tier = Math.max(1, Math.min(5, env.difficulty));
  const roofY = c.Ys + 13 + 7;
  const entr = L0.toWorld(ux * (PLAZA_R + 3), 0, TOWER_Z + uz * (PLAZA_R + 3));
  const T = {
    cx: 0, cz: TOWER_Z, yS, D: c.D, U: c.U, topAngle: c.topAngle, dirX: ux, dirZ: uz, avenue: AVENUE, ramp: RAMP, sign: sg, tier,
  };
  const C = {
    nodes,
    corridors: lay.corridors,
    chests,
    exitCol,
    exitY,
  };
  const pub = {
    name: env.name,
    x: towerW.x,
    y: c.Ys + 1,
    z: towerW.z,
    bounds: boxOf(c.rect.x0, c.Y0 - 3, c.rect.z0, c.rect.x1, Math.min(120, roofY + 44), c.rect.z1),
    crystalId: env.id,
    altar: { x: altarW.x, y: altarW.y, z: altarW.z },
    crystal: { x: altarW.x, y: altarW.y + 1, z: altarW.z },
    entrance: { x: entr.x, y: c.Ys + 1, z: entr.z },
    exit: { x: exW.x, y: exitY, z: exW.z },
    tower: {
      x: towerW.x, z: towerW.z, radius: WALL_R, hallRadius: HALL_R, floorY: c.Ys,
    },
    chain: {
      facing: c.f, floorY: c.Y0, origin: { x: O1.x, y: O1.y, z: O1.z }, rooms: puzzles.length, lanes: lay.lanes.length,
    },
    puzzles,
    chests,
    signs: [signEntry(sgW.x, sgW.y, sgW.z, text)],
    beacon: beaconEntry(towerW.x, towerW.z, roofY + 8, Math.min(120, roofY + 44), tier),
    tags: ['yeraltı', 'bulmaca', 'kristal'],
  };
  let pendingPost = null;
  const build = (W) => {
    pendingPost = null;
    if (!W.has(c.rect.x0, c.rect.z0, c.rect.x1, c.rect.z1)) return;
    const L = W.local(O1, c.f);
    drawTower(L, T, pal);
    drawChain(L, C, pal, env, (fn) => {
      pendingPost = fn;
    });
  };
  const plan = makePlan(env, Object.assign({}, pub, {
    rect: c.rect, surf: c.surf, surfParts: [c.surf, c.pad], deep: c.deep, build,
  }));
  const Hm = Math.max(...nodes.map((n) => n.h));
  plan.deepBand = { y0: c.Y0 - 3, y1: c.Y0 + Hm + 3 };
  // çıkış bacası (sarmaşık sütunu) sunaktan yüzeye uzanır: başka bir yer altı yapısının odası/duvarı bacayı kesmesin diye baca,
  // tüm planlar çizildikten SONRA (plan.post) yazılır
  plan.post = (W) => {
    if (pendingPost) {
      const f = pendingPost;
      pendingPost = null;
      f(W);
    }
  };
  return plan;
}
