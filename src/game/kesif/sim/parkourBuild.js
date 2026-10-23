/*
 * KEŞİF sim — parkur üretici + erişilebilirlik doğrulayıcı (saf; belirlenimci; chunk kesitli çizim).
 *
 * Bir parkur, merkezdeki ışık kulesinin çevresinde İÇE ve YUKARI doğru sarmallanan sıçrama platformları zinciridir:
 * başlangıç plakası (zeminde) → kontrol noktaları → kule tepesinde bitiş sandığı. Her kademenin kendi mekaniği vardır:
 *   1 Bronz   geniş sabit platformlar, 1 hücre boşluk
 *   2 Gümüş   ince/küçük platformlar, kaygan buz, 2 hücre boşluk
 *   3 Altın   yok olan (cam) platformlar, 1×1 sütunlar, dar kirişler
 *   4 Elmas   1×1 sütunlar, buz kirişler, yok olanlar + KANCA kısayolları (alternatif yol var)
 *   5 Kuantum sınıra yakın boşluklar, tek bloklar, her şey + KANCA ve PLANÖR halkası kısayolları
 *
 * Güvenlik: ana yol (başlangıçtan bitişe) YALNIZCA yürüme/koşu-sıçrama ile geçilebilir; kanca/planör bölümleri sadece
 * isteğe bağlı kısayollardır. validateCourse() her boşluğu fizik sabitlerinden türetilen erişim sınırıyla (kademeye özgü
 * güvenlik payı) sınar. Dinamik (yok olan) platformlar oyun tarafından uygulanmasa bile katıdır (yanlış durumda kilitlenme yok).
 *
 * Fizik (physics.js PLAYER): g=30, zıplama hızı √(2·30·1,25) ≈ 8,66 b/s (tepe 1,25 blok), koşu 5,6 b/s.
 */
import { B } from './blocks.js';
import { hash32, seededRandom, stringSeedToInt } from './rng.js';
import { chooseAnchor, simGlide } from './parkourGrapple.js';

/** Ardışık yok olan platformların görünme başlangıçları arasındaki fark (sn). */
export const VANISH_STEP = 0.9;

export const JUMP = Object.freeze({
  gravity: 30,
  vy: Math.sqrt(2 * 30 * 1.25),
  peak: 1.25,
  sprint: 5.6,
  walk: 4.3,
  grappleRange: 28,
  glideSpeed: 9,
  glideFall: 2.2,
});

/**
 * Yükseklik farkı dy'de (iniş yüzeyi − kalkış yüzeyi) koşu-sıçramasında kat edilen yatay mesafe (kenardan kenara üst sınır).
 * Ulaşılamaz (dy > tepe) → −1.
 */
export function maxJumpReach(dy, speed) {
  const v = JUMP.vy;
  const g = JUMP.gravity;
  const disc = v * v - 2 * g * dy;
  if (disc < 0) return -1;
  const t = (v + Math.sqrt(disc)) / g;
  return (speed || JUMP.sprint) * t;
}

/** Kademe tablosu. ratio: izin verilen boşluğun maksimum erişime oranı. */
export const PARKOUR_TIERS = Object.freeze([
  null,
  Object.freeze({
    tier: 1, key: 'bronz', name: 'Bronz', n: 14, rise: 9, cpEvery: 6, ratio: 0.52, gaps: [1], rho0: 15, rho1: 6,
    kinds: [['stone', 10]], minSize: 3, cp: [4, 4], blocks: { top: B.CONCRETE_ORANGE, edge: B.COPPER_BLOCK },
  }),
  Object.freeze({
    tier: 2, key: 'gumus', name: 'Gümüş', n: 20, rise: 15, cpEvery: 7, ratio: 0.64, gaps: [1, 2], rho0: 17, rho1: 6,
    kinds: [['stone', 5], ['ice', 3], ['beam', 3]], minSize: 2, cp: [4, 4], blocks: { top: B.CONCRETE_WHITE, edge: B.LIGHT_BLOCK },
  }),
  Object.freeze({
    tier: 3, key: 'altin', name: 'Altın', n: 28, rise: 24, cpEvery: 8, ratio: 0.76, gaps: [1, 2], rho0: 18, rho1: 6,
    kinds: [['stone', 3], ['vanish', 4], ['beam', 3], ['pillar', 2], ['ice', 2]], minSize: 1, cp: [3, 3],
    blocks: { top: B.CONCRETE_YELLOW, edge: B.GOLD_BLOCK },
  }),
  Object.freeze({
    tier: 4, key: 'mavi', name: 'Elmas', n: 36, rise: 32, dip: 0.26, cpEvery: 9, ratio: 0.87, gaps: [2, 3], rho0: 19, rho1: 6,
    kinds: [['pillar', 4], ['beam', 3], ['vanish', 4], ['ice', 3], ['stone', 2]], minSize: 1, cp: [3, 3],
    blocks: { top: B.CONCRETE_BLUE, edge: B.DIAMOND_BLOCK }, grapple: 2,
  }),
  Object.freeze({
    tier: 5, key: 'mor', name: 'Kuantum', n: 46, rise: 42, dip: 0.3, cpEvery: 10, ratio: 0.955, gaps: [2, 3], rho0: 20, rho1: 6,
    kinds: [['pillar', 5], ['beam', 3], ['vanish', 4], ['ice', 4], ['stone', 1]], minSize: 1, cp: [3, 3],
    blocks: { top: B.CONCRETE_PURPLE, edge: B.QUANTUM_BLOCK }, grapple: 3, glide: true,
  }),
]);

/* ------------------------------------------------------------------------------------------------
 * Geometri yardımcıları
 * ---------------------------------------------------------------------------------------------- */
/** İki platform dikdörtgeni arasındaki boş uzaklık (hücre cinsinden sürekli): bitişik = 0, 1 boş hücre = 1. */
export function gapBetween(a, b) {
  const dx = Math.max(0, b.x0 - (a.x1 + 1), a.x0 - (b.x1 + 1));
  const dz = Math.max(0, b.z0 - (a.z1 + 1), a.z0 - (b.z1 + 1));
  return Math.sqrt(dx * dx + dz * dz);
}

function overlapXZ(a, b, pad) {
  const p = pad || 0;
  return a.x1 + p >= b.x0 && a.x0 - p <= b.x1 && a.z1 + p >= b.z0 && a.z0 - p <= b.z1;
}

function makePlat(kind, cxI, czI, w, d, y) {
  const x0 = Math.round(cxI - (w - 1) / 2);
  const z0 = Math.round(czI - (d - 1) / 2);
  return { kind, x0, z0, x1: x0 + w - 1, z1: z0 + d - 1, y, w, d };
}

function platCenter(p) {
  return { x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2 };
}

function sizeFor(kind, tier, rng, rest) {
  if (rest) return tier <= 2 ? [4, 4] : [3, 3];
  switch (kind) {
    case 'stone':
      if (tier === 1) return rng.pick([[3, 3], [4, 3], [3, 4]]);
      if (tier === 2) return rng.pick([[2, 2], [3, 2], [2, 3], [3, 3]]);
      return rng.pick([[2, 2], [3, 2], [2, 3]]);
    // kaygan buz en az 2 geniş: 1 hücre genişliğinde buz şeridine inip durmak fizikte tutturulamıyordu (botlu erişim testi)
    case 'ice': return tier <= 3 ? rng.pick([[2, 2], [3, 2]]) : rng.pick([[2, 2], [3, 2], [2, 3]]);
    case 'beam': return rng.pick([[1, 4], [4, 1], [1, 3], [3, 1]]);
    case 'vanish': return tier <= 3 ? [2, 2] : rng.pick([[2, 2], [2, 1]]);
    default: return [1, 1];
  }
}

function weightedKind(rng, kinds) {
  const w = kinds.map((k) => k[1]);
  return kinds[rng.weighted(w)][0];
}

/* ------------------------------------------------------------------------------------------------
 * Zincir üretimi
 * ---------------------------------------------------------------------------------------------- */
function profileY(T, p, dip) {
  let y = T.rise * p;
  if (dip && p > 0.42 && p < 0.72) {
    const s = Math.sin((Math.PI * (p - 0.42)) / 0.3);
    y -= dip * s * s;
  }
  return y;
}

function reachOk(T, gap, dy, platB) {
  const reach = maxJumpReach(dy);
  if (reach < 0) return false;
  const small = platB.w * platB.d === 1;
  const ratio = small ? Math.min(T.ratio, 0.9) : T.ratio;
  return gap <= ratio * reach + 1e-9;
}

/** Aday yerleşim: hedef noktaya en yakın, tüm kısıtları sağlayan tam sayı konumu arar. */
function bestPlacement(T, list, cur, kind, sz, dy, target, g, cx, cz) {
  const cc = platCenter(cur);
  const R = Math.ceil(Math.max(cur.w, cur.d) / 2 + Math.max(sz[0], sz[1]) / 2 + 4);
  let best = null;
  let bestScore = Infinity;
  const y = cur.y + dy;
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      const nx = Math.round(cc.x) + dx;
      const nz = Math.round(cc.z) + dz;
      const cand = makePlat(kind, nx, nz, sz[0], sz[1], y);
      const gap = gapBetween(cur, cand);
      if (gap < 1 || !reachOk(T, gap, dy, cand)) continue;
      if (Math.hypot(nx - cx, nz - cz) < 5.4) continue;
      let bad = false;
      for (let i = 0; i < list.length - 1 && !bad; i++) {
        if (overlapXZ(cand, list[i], 2) && Math.abs(cand.y - list[i].y) < 6) bad = true;
      }
      if (bad) continue;
      const score = Math.hypot(nx - target.x, nz - target.z) + Math.abs(gap - g) * 1.6;
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }
  }
  return best;
}

function tryGenerate(T, p, rng, attempt) {
  const { cx, cz, floorY } = p;
  const dip = (T.tier >= 4 && attempt < 5) ? T.rise * T.dip : 0;
  const dir = rng.next() < 0.5 ? 1 : -1;
  const th0 = rng.next() * Math.PI * 2;
  const startC = { x: cx + Math.cos(th0) * T.rho0, z: cz + Math.sin(th0) * T.rho0 };
  const start = makePlat('start', startC.x, startC.z, 5, 5, floorY);
  const list = [start];
  let cur = start;
  let theta = th0;
  const N = T.n;
  for (let k = 1; k <= N; k++) {
    const prog = k / (N + 1);
    const rest = k % T.cpEvery === 0 && k < N;
    const kind = rest ? 'stone' : weightedKind(rng, T.kinds);
    const sz = sizeFor(kind, T.tier, rng, rest);
    const rho = T.rho0 + (T.rho1 - T.rho0) * Math.pow(prog, 0.85);
    const yT = floorY + profileY(T, prog, dip);
    const dy0 = Math.max(-2, Math.min(1, Math.round(yT - cur.y)));
    const g = T.gaps[Math.floor(rng.next() * T.gaps.length)];
    const half = Math.max(cur.w, cur.d) / 2 + Math.max(sz[0], sz[1]) / 2;
    const dth = ((half + g) / Math.max(4, rho)) * dir;
    const target = { x: cx + Math.cos(theta + dth) * rho, z: cz + Math.sin(theta + dth) * rho };
    let placed = null;
    const dys = dy0 > 0 ? [dy0, 0, -1] : (dy0 < 0 ? [dy0, 0] : [0, -1]);
    for (let i = 0; i < dys.length && !placed; i++) {
      placed = bestPlacement(T, list, cur, kind, sz, dys[i], target, g, cx, cz);
    }
    if (!placed) return null;
    if (rest) placed.rest = true;
    list.push(placed);
    const c2 = platCenter(placed);
    theta = Math.atan2(c2.z - cz, c2.x - cx);
    cur = placed;
  }
  // bitiş platformu: merkezde, kulenin tepesinde
  const fin = makePlat('finish', cx, cz, 5, 5, 0);
  for (let dy = 1; dy >= -1; dy--) {
    fin.y = cur.y + dy;
    const gap = gapBetween(cur, fin);
    if (gap >= 1 && reachOk(T, gap, dy, fin) && !overlapXZ(cur, fin, 0)) {
      let bad = false;
      for (let i = 0; i < list.length - 1 && !bad; i++) {
        if (overlapXZ(fin, list[i], 1) && Math.abs(fin.y - list[i].y) < 6) bad = true;
      }
      if (bad) continue;
      list.push(fin);
      return list;
    }
  }
  return null;
}

/**
 * Kesin geçerli yedek: 4 hücre aralıklı kafes üzerinde içe sarmal (3×3 platform + 1 hücre boşluk). Halkalar xz'de
 * çakışmaz (kafa çarpması imkânsız), her boşluk tam 1, yükselme her 3 platformda +1.
 */
function fallbackGenerate(T, p) {
  const { cx, cz, floorY } = p;
  const pos = [];
  for (let m = 3; m >= 1; m--) {
    const h = 4 * m;
    for (let x = -h; x < h; x += 4) pos.push([x, -h]);
    for (let z = -h; z < h; z += 4) pos.push([h, z]);
    for (let x = h; x > -h; x -= 4) pos.push([x, h]);
    const stop = m === 1 ? 0 : -h + 4;
    for (let z = h; z >= stop; z -= 4) pos.push([-h, z]);
  }
  const list = [makePlat('start', cx - 17, cz - 12, 5, 5, floorY)];
  let y = floorY;
  const lastIdx = pos.length - 1;
  pos.forEach((q, k) => {
    if (k % 3 === 2) y += 1;
    const plat = makePlat('stone', cx + q[0], cz + q[1], 3, 3, y);
    if ((k + 1) % T.cpEvery === 0 && k < lastIdx) plat.rest = true;
    list.push(plat);
  });
  list.push(makePlat('finish', cx, cz, 3, 3, y));
  return list;
}

/* ------------------------------------------------------------------------------------------------
 * Kısayollar (kanca / planör) — yalnızca isteğe bağlı; ana yol bunlarsız tamam
 * ---------------------------------------------------------------------------------------------- */
function planShortcuts(T, list, rng) {
  const grapple = [];
  const glideRings = [];
  const N = list.length;
  if (T.grapple) {
    const used = new Set();
    // Demir noktası HEDEF platformun üstüne asılır (parkourGrapple.js): ortaya asılan demir oyuncuyu boşlukta bırakıyordu.
    // Hedef: ayakta durulabilen düz taş platform (buz/yok olan/kiriş/sütun değil); gerçek fizikte kanıtlanan demir seçilir.
    for (let tries = 0; tries < 80 && grapple.length < T.grapple * 3; tries++) {
      const i = 2 + Math.floor(rng.next() * Math.max(1, N - 12));
      if (used.has(i)) continue;
      const a = list[i];
      const ca = platCenter(a);
      let j = -1;
      for (let d = 4; d <= 7 && j < 0; d++) {
        const q = list[i + d];
        if (!q || i + d >= N - 1) break;
        const cq = platCenter(q);
        const dist = Math.hypot(cq.x - ca.x, cq.z - ca.z);
        if (q.kind === 'stone' && q.w * q.d >= 4 && dist <= JUMP.grappleRange - 8 && dist >= 8) j = i + d;
      }
      if (j < 0) continue;
      used.add(i);
      for (let u = i - 1; u <= i + 1; u++) used.add(u);
      grapple.push({ from: i, to: j });
    }
  }
  if (T.glide) {
    const cands = [];
    for (let i = 1; i < N - 6; i++) {
      for (let j = i + 6; j < N - 1; j++) {
        const a = list[i];
        const b = list[j];
        const ca = platCenter(a);
        const cb = platCenter(b);
        const dist = Math.hypot(cb.x - ca.x, cb.z - ca.z);
        const drop = a.y - b.y;
        if (dist < 12 || dist > 34 || drop < dist / 4.3 + 1.5) continue;
        // hedef: planör frenlenemez (≈9 b/s); yalnız düz taş (≥2×2) platforma iniş kanıtlanabilir
        if (b.kind !== 'stone' || b.w * b.d < 4) continue;
        cands.push({ i, j, score: drop - dist * 0.1 });
      }
    }
    cands.sort((u, v) => v.score - u.score);
    const clashes = (r) => list.some((q) => {
      const dx = Math.max(q.x0 - r.x, 0, r.x - q.x1);
      const dz = Math.max(q.z0 - r.z, 0, r.z - q.z1);
      return Math.hypot(dx, dz) < 2.7 && Math.abs(r.y - q.y) <= 3;
    });
    for (let c = 0; c < cands.length && glideRings.length < 8; c++) {
      const a = list[cands[c].i];
      const b = list[cands[c].j];
      const ca = platCenter(a);
      const cb = platCenter(b);
      const ring = [];
      for (let r = 1; r <= 3; r++) {
        const t = r / 4;
        ring.push({
          x: Math.round(ca.x + (cb.x - ca.x) * t),
          y: Math.round(a.y + 2 - (a.y + 2 - (b.y + 3)) * t),
          z: Math.round(ca.z + (cb.z - ca.z) * t),
          dx: cb.x - ca.x,
          dz: cb.z - ca.z,
        });
      }
      if (!ring.some(clashes)) glideRings.push({ from: cands[c].i, to: cands[c].j, rings: ring });
    }
  }
  return { grapple, glide: glideRings };
}

/* ------------------------------------------------------------------------------------------------
 * Yazıcı arayüzü (fn(setBlock) için)
 * ---------------------------------------------------------------------------------------------- */
/** setBlock(x,y,z,id) fonksiyonunu ChunkW benzeri yazıcıya çevirir (chunk kırpması yok). */
export function makeFnWriter(setBlock, baseY) {
  const W = {
    bx0: -1e9, bz0: -1e9, bx1: 1e9, bz1: 1e9,
    has: () => true,
    set(x, y, z, id) { setBlock(x, y, z, id); return true; },
    setAir(x, y, z, id) { setBlock(x, y, z, id); return true; },
    get: () => 0,
    fill(x0, y0, z0, x1, y1, z1, id) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
          for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) setBlock(x, y, z, id);
        }
      }
    },
    paint(x0, y0, z0, x1, y1, z1, fn) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
          for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
            const id = fn(x, y, z);
            if (id !== null && id !== undefined && id >= 0) setBlock(x, y, z, id);
          }
        }
      }
    },
    cyl(cx, cz, y0, y1, r, id) {
      const rr = r * r + r;
      W.paint(cx - r, y0, cz - r, cx + r, y1, cz + r, (x, y, z) => {
        const dx = x - cx;
        const dz = z - cz;
        return dx * dx + dz * dz <= rr ? id : -1;
      });
    },
    disc(cx, cz, y, r, id) { W.cyl(cx, cz, y, y, r, id); },
    ringWall() {},
    line() {},
    ground: () => baseY,
    groundBlock: () => B.GRASS,
    pillarDown(x, topY, z, id) {
      for (let y = topY; y >= baseY; y--) setBlock(x, y, z, id);
    },
  };
  return W;
}

/* ------------------------------------------------------------------------------------------------
 * Ana üretici
 * ---------------------------------------------------------------------------------------------- */
/**
 * makeCourse({seed, id, tier, zone, cx, cz, floorY, pal}) → course
 *   (cx,cz) merkez (kule), floorY = zemin bloğu y'si (düzlenmiş plaza). Aynı girdi → aynı parkur.
 */
export function makeCourse(p) {
  const tier = Math.max(1, Math.min(5, p.tier | 0));
  const T = PARKOUR_TIERS[tier];
  const base = hash32(((p.seed | 0) ^ stringSeedToInt('parkur:' + p.id)) | 0);
  const params = { cx: p.cx, cz: p.cz, floorY: p.floorY };
  let list = null;
  let attempt = 0;
  for (; attempt < 16 && !list; attempt++) {
    const rng = seededRandom(hash32(base + attempt * 0x9e3779b1));
    list = tryGenerate(T, params, rng, attempt);
    if (list) {
      const v = validateList(T, list, params);
      if (v.length) list = null;
    }
  }
  let fallback = false;
  if (!list) {
    list = fallbackGenerate(T, params);
    fallback = true;
  }
  const rng2 = seededRandom(hash32(base ^ 0x5c0b5));
  const sc = planShortcuts(T, list, rng2);
  return assembleCourse(p, T, list, sc, fallback, attempt);
}

/** Yedek (kafes) parkuru doğrudan üretir — testler ve ana üretici başarısız olursa kullanılır. */
export function makeFallbackCourse(p) {
  const tier = Math.max(1, Math.min(5, p.tier | 0));
  const T = PARKOUR_TIERS[tier];
  const list = fallbackGenerate(T, { cx: p.cx, cz: p.cz, floorY: p.floorY });
  const sc = planShortcuts(T, list, seededRandom(hash32((p.seed | 0) ^ 0x5c0b5)));
  return assembleCourse(p, T, list, sc, true, 0);
}

function validateList(T, list, params) {
  const errs = [];
  const n = list.length;
  for (let i = 1; i < n; i++) {
    const a = list[i - 1];
    const b = list[i];
    const gap = gapBetween(a, b);
    const dy = b.y - a.y;
    if (dy > 1) errs.push('dy>1 @' + i);
    if (dy < -3) errs.push('dy<-3 @' + i);
    if (gap < 1 - 1e-9) errs.push('gap<1 @' + i);
    if (!reachOk(T, gap, dy, b)) errs.push('gap>reach @' + i);
  }
  void params;
  return errs;
}

function assembleCourse(p, T, list, sc, fallback, attempts) {
  const tier = T.tier;
  const startP = list[0];
  const finP = list[list.length - 1];
  const sc0 = platCenter(startP);
  const fc = platCenter(finP);
  const cps = [];
  list.forEach((q, i) => {
    if (q.rest) {
      const c = platCenter(q);
      cps.push({ index: i, x: Math.floor(c.x), y: q.y + 1, z: Math.floor(c.z) });
    }
  });
  const dynamics = [];
  let vi = 0;
  list.forEach((q, i) => {
    if (q.kind === 'vanish') {
      const cells = [];
      for (let z = q.z0; z <= q.z1; z++) for (let x = q.x0; x <= q.x1; x++) cells.push({ x, y: q.y, z });
      // Faz: ardışık yok olan platformların görünme pencereleri DALGA gibi 0,9 sn arayla art arda açılır (platform k+1, k'den 0,9 sn
      // sonra belirir): komşu çiftin ortak görünme süresi 1,7 sn. Eski 1,7 sn'lik faz kayması çifti 0,4–0,9 sn'lik pencereye sıkıştırıp
      // 2×1 küçük platformlarda insan için (ve QA botu için) imkânsız zamanlama yaratıyordu.
      const cyc = 2.6 + 1.3;
      const startAt = (vi * VANISH_STEP) % cyc;
      dynamics.push({
        index: i, kind: 'vanish', cells, on: 2.6, off: 1.3, phase: Math.round(((cyc - startAt) % cyc) * 1000) / 1000, block: vanishBlock(tier),
      });
      vi++;
    }
  });
  let minX = 1e9;
  let minZ = 1e9;
  let maxX = -1e9;
  let maxZ = -1e9;
  let maxY = 0;
  let minY = 999;
  for (const q of list) {
    minX = Math.min(minX, q.x0);
    minZ = Math.min(minZ, q.z0);
    maxX = Math.max(maxX, q.x1);
    maxZ = Math.max(maxZ, q.z1);
    maxY = Math.max(maxY, q.y);
    minY = Math.min(minY, q.y);
  }
  const rect = { x0: minX - 2, z0: minZ - 2, x1: maxX + 2, z1: maxZ + 2 };
  const beamTop = Math.min(120, maxY + 34);
  const chest = { x: Math.floor(fc.x) - 1, y: finP.y + 1, z: Math.floor(fc.z) };
  const course = {
    id: p.id,
    tier,
    tierName: T.name,
    zone: p.zone | 0,
    seed: p.seed | 0,
    center: { x: p.cx, z: p.cz },
    floorY: p.floorY,
    rect,
    start: { x: Math.floor(sc0.x), y: startP.y + 1, z: Math.floor(sc0.z) },
    end: { x: Math.floor(fc.x) + 1, y: finP.y + 1, z: Math.floor(fc.z) },
    checkpoints: cps,
    platforms: list,
    chest,
    grapple: [],
    glide: [],
    dynamics,
    fallMargin: 3.5,
    maxY,
    minY,
    beam: { x: Math.floor(fc.x), z: Math.floor(fc.z), y0: finP.y + 1, y1: beamTop },
    fallback,
    attempts,
    signs: [],
    build(W) {
      buildCourse(course, W);
    },
    blocks(setBlock) {
      buildCourse(course, makeFnWriter(setBlock, p.floorY));
    },
  };
  // kanca kısayolları: aday (from,to) çiftleri için demir noktası TÜM parkur blokları (fener, kule, ışık hüzmesi) dahil gerçek
  // fizikte kanıtlanır; kanıtlanamayan çift atılır (parkourGrapple.js)
  if (sc.grapple.length > 0) {
    const map = new Map();
    course.blocks((x, y, z, id) => { map.set(x + ',' + y + ',' + z, id); });
    const world = {
      getBlock: (x, y, z) => map.get(x + ',' + y + ',' + z) || 0,
      set: (x, y, z, id) => { if (id) map.set(x + ',' + y + ',' + z, id); else map.delete(x + ',' + y + ',' + z); },
    };
    const taken = new Set();
    for (let k = 0; k < sc.grapple.length && course.grapple.length < T.grapple; k++) {
      const c = sc.grapple[k];
      if (taken.has(c.from)) continue;
      const an = chooseAnchor(list, c.from, c.to, world);
      if (!an) continue;
      for (let u = c.from - 1; u <= c.from + 1; u++) taken.add(u);
      course.grapple.push({ from: c.from, to: c.to, x: an.x, y: an.y, z: an.z });
    }
  }
  // planör kısayolu: aday halkalar çizilmiş parkur blokları (halka ışıkları dahil) üzerinde gerçek fizikte kanıtlanır; ilk kullanılabilir kalır
  for (let k = 0; k < sc.glide.length && course.glide.length === 0; k++) {
    const cand = sc.glide[k];
    course.glide = [cand];
    const gmap = new Map();
    course.blocks((x, y, z, id) => { gmap.set(x + ',' + y + ',' + z, id); });
    const gw = { getBlock: (x, y, z) => gmap.get(x + ',' + y + ',' + z) || 0 };
    if (!simGlide(gw, list, cand.from, cand.to, cand.rings).ok) course.glide = [];
  }
  // başlangıç tabelası: başlangıç platformunun yanında
  // tabela ilk sıçrama şeridine düşmesin (gerçek fizikte çarpışır): ilk platformun TERS yanında dursun
  const nxt = list[1];
  const sdx = nxt ? (nxt.x0 + nxt.x1) / 2 - (startP.x0 + startP.x1) / 2 : 1;
  const sdz = nxt ? (nxt.z0 + nxt.z1) / 2 - (startP.z0 + startP.z1) / 2 : 0;
  const signAt = Math.abs(sdx) >= Math.abs(sdz)
    ? { x: sdx > 0 ? startP.x0 - 1 : startP.x1 + 1, z: startP.z0 }
    : { x: startP.x0, z: sdz > 0 ? startP.z0 - 1 : startP.z1 + 1 };
  course.signs.push({
    x: signAt.x, y: startP.y + 1, z: signAt.z,
    text: 'Parkur — ' + T.name + ': Plakadan başla, kontrol noktalarına bas, kulenin tepesindeki sandığa ulaş. '
      + 'Düşersen son kontrol noktasına dönersin.',
  });
  return course;
}

function vanishBlock(tier) {
  switch (tier) {
    case 3: return B.GLASS_YELLOW;
    case 4: return B.GLASS_BLUE;
    case 5: return B.GLASS_PURPLE;
    default: return B.GLASS_WHITE;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Çizim
 * ---------------------------------------------------------------------------------------------- */
function buildCourse(c, W) {
  const T = PARKOUR_TIERS[c.tier];
  const topId = T.blocks.top;
  const edge = T.blocks.edge;
  const list = c.platforms;
  if (!W.has(c.rect.x0, c.rect.z0, c.rect.x1, c.rect.z1)) return;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (!W.has(q.x0 - 1, q.z0 - 1, q.x1 + 1, q.z1 + 1)) continue;
    const big = q.w * q.d >= 4;
    switch (q.kind) {
      case 'ice':
        W.fill(q.x0, q.y, q.z0, q.x1, q.y, q.z1, B.SLIPPERY_ICE);
        if (big) W.fill(q.x0, q.y - 1, q.z0, q.x1, q.y - 1, q.z1, B.ICE);
        break;
      case 'vanish':
        W.fill(q.x0, q.y, q.z0, q.x1, q.y, q.z1, dynamicBlock(c, i));
        break;
      case 'beam':
        W.fill(q.x0, q.y, q.z0, q.x1, q.y, q.z1, B.POLISHED);
        W.fill(q.x0, q.y - 1, q.z0, q.x1, q.y - 1, q.z1, edge === B.LIGHT_BLOCK ? B.LIGHT_BLOCK : B.POLISHED);
        break;
      case 'pillar':
        W.set(q.x0, q.y, q.z0, topId);
        W.set(q.x0, q.y - 1, q.z0, B.PILLAR);
        W.set(q.x0, q.y - 2, q.z0, edge === B.QUANTUM_BLOCK ? B.QUANTUM_BLOCK : B.POLISHED);
        break;
      default: {
        // start / stone / finish
        W.fill(q.x0, q.y, q.z0, q.x1, q.y, q.z1, topId);
        if (big) {
          W.fill(q.x0, q.y - 1, q.z0, q.x1, q.y - 1, q.z1, B.POLISHED);
          // parlak kenar köşeleri
          W.set(q.x0, q.y, q.z0, edge);
          W.set(q.x1, q.y, q.z0, edge);
          W.set(q.x0, q.y, q.z1, edge);
          W.set(q.x1, q.y, q.z1, edge);
        }
      }
    }
  }
  // başlangıç: plaka + meşaleler + tabela + temel
  const s = list[0];
  const sx = Math.floor((s.x0 + s.x1) / 2);
  const sz = Math.floor((s.z0 + s.z1) / 2);
  W.set(sx, s.y, sz, B.POLISHED);
  W.set(sx, s.y + 1, sz, B.PARKOUR_START);
  W.set(s.x0, s.y + 1, s.z0, B.TORCH);
  W.set(s.x1, s.y + 1, s.z1, B.TORCH);
  for (let i = 0; i < c.signs.length; i++) W.set(c.signs[i].x, c.signs[i].y, c.signs[i].z, B.SIGN);
  // kontrol noktaları
  for (let i = 0; i < c.checkpoints.length; i++) {
    const k = c.checkpoints[i];
    W.set(k.x, k.y, k.z, B.PARKOUR_CHECKPOINT);
    const q = list[k.index];
    W.set(q.x0, q.y + 1, q.z0, B.LANTERN);
    W.set(q.x1, q.y + 1, q.z1, B.LANTERN);
  }
  // merkez kule + bitiş
  const f = list[list.length - 1];
  const tx = Math.floor((f.x0 + f.x1) / 2);
  const tz = Math.floor((f.z0 + f.z1) / 2);
  if (W.has(tx - 2, tz - 2, tx + 2, tz + 2)) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        W.pillarDown(tx + dx, f.y - 2, tz + dz, ((dx + dz) & 1) === 0 ? B.PILLAR : B.POLISHED);
      }
    }
    for (let y = c.floorY + 3; y < f.y - 2; y += 5) {
      W.set(tx + 2, y, tz, B.LANTERN);
      W.set(tx - 2, y, tz, B.LANTERN);
      W.set(tx, y, tz + 2, B.LANTERN);
      W.set(tx, y, tz - 2, B.LANTERN);
    }
    W.set(tx + 2, f.y + 1, tz + 2, B.LANTERN);
    W.set(tx - 2, f.y + 1, tz - 2, B.LANTERN);
    W.set(tx + 1, f.y + 1, tz, B.PARKOUR_END);
    W.set(tx - 1, f.y + 1, tz, B.REWARD_CHEST);
    W.set(tx, f.y, tz, edgeId(c));
  }
  // ışık hüzmesi (kule ekseninde): renkli cam + her 4 blokta ışık
  const b = c.beam;
  if (W.has(b.x - 1, b.z - 1, b.x + 1, b.z + 1)) {
    const blk = beaconId(c.tier);
    for (let y = b.y0 + 2; y <= b.y1; y++) W.set(b.x, y, b.z, ((y - b.y0) & 3) === 3 ? B.LIGHT_BLOCK : blk);
    W.set(b.x + 1, b.y1, b.z, B.LIGHT_BLOCK);
    W.set(b.x - 1, b.y1, b.z, B.LIGHT_BLOCK);
    W.set(b.x, b.y1, b.z + 1, B.LIGHT_BLOCK);
    W.set(b.x, b.y1, b.z - 1, B.LIGHT_BLOCK);
  }
  // kanca noktaları + planör halkaları
  for (let i = 0; i < c.grapple.length; i++) {
    const g = c.grapple[i];
    W.set(g.x, g.y, g.z, B.AMETHYST);
    W.set(g.x, g.y + 1, g.z, B.LIGHT_BLOCK);
  }
  for (let i = 0; i < c.glide.length; i++) {
    const rs = c.glide[i].rings;
    for (let r = 0; r < rs.length; r++) drawRing(W, rs[r]);
  }
}

function edgeId(c) {
  return PARKOUR_TIERS[c.tier].blocks.edge;
}

function beaconId(tier) {
  switch (tier) {
    case 1: return B.GLASS_ORANGE;
    case 2: return B.GLASS_WHITE;
    case 3: return B.GLASS_YELLOW;
    case 4: return B.GLASS_BLUE;
    default: return B.GLASS_PURPLE;
  }
}

function drawRing(W, r) {
  // Halka, geçiş yönüne dik düşey düzlemde (yarıçap 2)
  const len = Math.hypot(r.dx, r.dz) || 1;
  const ux = r.dx / len;
  const uz = r.dz / len;
  const px = -uz;
  const pz = ux;
  const pts = [[2, 0], [-2, 0], [0, 2], [0, -2], [1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4]];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i][0];
    const b = pts[i][1];
    W.set(Math.round(r.x + px * a), Math.round(r.y + b), Math.round(r.z + pz * a), B.LIGHT_BLOCK);
  }
}

function dynamicBlock(c, i) {
  const d = c.dynamics.find((e) => e.index === i);
  return d ? d.block : B.GLASS_WHITE;
}

/* ------------------------------------------------------------------------------------------------
 * Doğrulayıcı
 * ---------------------------------------------------------------------------------------------- */
/**
 * Ana yolun her boşluğunun kademeye özgü erişim payı içinde olduğunu kanıtlar.
 * Döner {ok, errors:[...], stats:{maxRatio, maxGap, platforms, checkpoints}}.
 */
export function validateCourse(course) {
  const T = PARKOUR_TIERS[course.tier];
  const list = course.platforms;
  const errors = [];
  let maxRatio = 0;
  let maxGap = 0;
  if (!T) errors.push('geçersiz kademe');
  if (!list || list.length < 4) errors.push('çok kısa');
  if (errors.length) return { ok: false, errors, stats: {} };
  const n = list.length;
  for (let i = 1; i < n; i++) {
    const a = list[i - 1];
    const b = list[i];
    const gap = gapBetween(a, b);
    const dy = b.y - a.y;
    const reach = maxJumpReach(dy);
    const small = b.w * b.d === 1;
    const ratio = small ? Math.min(T.ratio, 0.9) : T.ratio;
    if (dy > 1) errors.push('adım ' + i + ': yükselme ' + dy + ' > 1');
    if (dy < -3) errors.push('adım ' + i + ': düşüş ' + dy + ' < -3');
    if (reach < 0) errors.push('adım ' + i + ': ulaşılamaz yükseklik');
    else {
      const r = gap / reach;
      if (r > maxRatio) maxRatio = r;
      if (gap > ratio * reach + 1e-9) errors.push('adım ' + i + ': boşluk ' + gap.toFixed(2) + ' > ' + (ratio * reach).toFixed(2));
    }
    if (gap > maxGap) maxGap = gap;
    if (gap < 1 - 1e-9) errors.push('adım ' + i + ': platformlar bitişik/çakışık');
    if (b.kind === 'ice' && Math.min(b.w, b.d) < 2) errors.push('adım ' + i + ': buz platformu en az 2 geniş olmalı');
    if (b.w * b.d < T.minSize && b.kind !== 'pillar' && b.kind !== 'beam' && b.kind !== 'vanish') {
      errors.push('adım ' + i + ': iniş yüzeyi çok küçük');
    }
  }
  // kafa çarpması / çakışma
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      const a = list[i];
      const b = list[j];
      if (overlapXZ(a, b, 1) && Math.abs(a.y - b.y) < 5) errors.push('platform ' + i + ' ile ' + j + ' çakışıyor/kafa çarpar');
    }
  }
  // kontrol noktası aralığı
  const cpIdx = [0].concat(course.checkpoints.map((c) => c.index)).concat([n - 1]);
  for (let i = 1; i < cpIdx.length; i++) {
    if (cpIdx[i] - cpIdx[i - 1] > T.cpEvery + 1) errors.push('kontrol noktaları arası çok uzun: ' + cpIdx[i - 1] + '→' + cpIdx[i]);
  }
  // sınırlar
  for (let i = 0; i < n; i++) {
    const q = list[i];
    if (q.y < 2 || q.y > 118) errors.push('platform ' + i + ' yükseklik sınırı dışında');
    if (q.x0 < course.rect.x0 || q.x1 > course.rect.x1 || q.z0 < course.rect.z0 || q.z1 > course.rect.z1) {
      errors.push('platform ' + i + ' alan dışında');
    }
  }
  // kısayollar: yalnız ana yol platformlarını bağlar ve fiziksel sınırlar içinde
  for (const g of course.grapple) {
    const a = list[g.from];
    const b = list[g.to];
    if (!a || !b) { errors.push('kanca kısayolu geçersiz'); continue; }
    const ca = platCenter(a);
    const cb = platCenter(b);
    if (Math.hypot(cb.x - ca.x, cb.z - ca.z) > JUMP.grappleRange) errors.push('kanca menzil dışı');
    if (g.to - g.from < 3) errors.push('kanca kısayolu çok kısa');
  }
  for (const g of course.glide) {
    const a = list[g.from];
    const b = list[g.to];
    if (!a || !b || g.rings.length !== 3) { errors.push('planör kısayolu geçersiz'); continue; }
    const ca = platCenter(a);
    const cb = platCenter(b);
    const dist = Math.hypot(cb.x - ca.x, cb.z - ca.z);
    if (a.y - b.y < dist / JUMP.glideSpeed * JUMP.glideFall) errors.push('planör kısayolu: yükseklik yetersiz');
  }
  if (T.tier < 4 && (course.grapple.length || course.glide.length)) errors.push('kanca/planör yalnız son kademelerde');
  return {
    ok: errors.length === 0,
    errors,
    stats: { maxRatio, maxGap, platforms: n, checkpoints: course.checkpoints.length },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Dinamik (yok olan) platformlar — zamanın saf işlevi
 * ---------------------------------------------------------------------------------------------- */
/** t (sn) anında yok olan platformların istenen blokları: [{x,y,z,id}] (görünür → blok, kayıp → 0). */
export function parkourDynamics(course, tSec) {
  const out = [];
  for (let i = 0; i < course.dynamics.length; i++) {
    const d = course.dynamics[i];
    const cyc = d.on + d.off;
    let ph = (tSec + d.phase) % cyc;
    if (ph < 0) ph += cyc;
    const visible = ph < d.on;
    const id = visible ? d.block : 0;
    for (let k = 0; k < d.cells.length; k++) {
      const c = d.cells[k];
      out.push({ x: c.x, y: c.y, z: c.z, id });
    }
  }
  return out;
}

/** world.setBlock ile yalnızca değişenleri uygular (düzenleme kaydı tutmaz). Döner uygulanan sayı. */
export function applyParkourDynamics(course, tSec, world) {
  const want = parkourDynamics(course, tSec);
  let n = 0;
  for (let i = 0; i < want.length; i++) {
    const w = want[i];
    const cur = world.getBlock(w.x, w.y, w.z);
    if (cur === null || cur === w.id) continue;
    if (cur !== 0 && cur !== w.id && cur !== B.AIR && !isDynamicBlock(cur)) continue;
    world.setBlock(w.x, w.y, w.z, w.id, { record: false });
    n++;
  }
  return n;
}

function isDynamicBlock(id) {
  return id >= B.GLASS_WHITE && id <= B.GLASS_PURPLE;
}

/**
 * Düşme sıfırlama: oyuncu parkur alanındaysa ve son kontrol noktasından fallMargin'den fazla aşağıdaysa hedef noktayı döner
 * ({x,y,z}); değilse null. lastCp = son basılan kontrol noktası dizini (−1: başlangıç).
 */
export function parkourFallReset(course, pos, lastCp) {
  const r = course.rect;
  if (pos.x < r.x0 - 4 || pos.x > r.x1 + 4 || pos.z < r.z0 - 4 || pos.z > r.z1 + 4) return null;
  const target = lastCp >= 0 && course.checkpoints[lastCp] ? course.checkpoints[lastCp] : course.start;
  // Eşik, son kontrol noktasının değil O KESİMİN (son nokta → sonraki nokta) en alçak platformunun altındadır: kademe 4-5'in
  // çukur (dip) profili platformları son noktanın 7 blok altına indirir; eskiden orada duran oyuncu anında geri ışınlanıyor,
  // kuantum parkuru tamamlanamıyordu (gerçek GPU oyun testi).
  const floorY = Math.min(target.y, segmentFloorY(course, lastCp));
  if (pos.y < floorY - course.fallMargin) return { x: target.x + 0.5, y: target.y, z: target.z + 0.5 };
  return null;
}

/** lastCp'den sonraki kontrol noktasına (yoksa bitişe) kadar olan platformların en alçak ayakta durma yüksekliği. */
export function segmentFloorY(course, lastCp) {
  const L = course.platforms;
  const cps = course.checkpoints || [];
  if (!L || L.length === 0) return Infinity;
  const a = lastCp >= 0 && cps[lastCp] ? cps[lastCp].index : 0;
  const b = lastCp + 1 < cps.length ? cps[lastCp + 1].index : L.length - 1;
  let m = Infinity;
  for (let i = Math.max(0, a); i <= Math.min(L.length - 1, b); i++) m = Math.min(m, L[i].y + 1);
  return m;
}
