/*
 * KEŞİF render — ChunkManager planlama yardımcıları: komşu maskesi, sütun oklüzyon kutusu, sütun başına bant planı.
 * (chunkManager.js'den ayrıldı; durum `P` nesnesiyle geçer: world, store, culler, win, py, fx, fz, meshList, secList, bütçeler.)
 */
import { bandCount, bandRange } from './chunkMgrCore.js';
import { NB_DIRS, chunkPriority } from './chunkMgrQueue.js';
import { makeBandRec } from './chunkMgrWorld.js';
import {
  DEEP_VIEW_CHUNKS, INTERIOR_NEAR_CHUNKS, WINDOW_SLACK, bandTrivial, neededSections,
} from './chunkMgrBands.js';

const NB_COUNT = NB_DIRS.length;
/** Uzak mesh kademesi (chunk): bu mesafeden uzaktaki bantlarda mağara içi yüzler kaba (nicelenmiş) birleşir; histerezis. */
const LOD_FAR_ENTER = 3.0;
const LOD_FAR_EXIT = 2.5;
/** Çok uzak kademe (2): küçük çapraz bitkiler atlanır. */
const LOD_FLORA_ENTER = 4.0;
const LOD_FLORA_EXIT = 3.5;

export function neighborMask(world, rec) {
  let mask = 0;
  for (let i = 0; i < NB_COUNT; i++) {
    if (world.hasChunk(rec.cx + NB_DIRS[i].dx, rec.cz + NB_DIRS[i].dz)) mask |= 1 << i;
  }
  return mask;
}

/** Eksik komşular üretilebilir mi? (hepsi yüklü ya da üretilemez ise mesh'e hazır) */
export function neighborsSettled(world, rec, mask) {
  if (mask === 255) return true;
  for (let i = 0; i < NB_COUNT; i++) {
    if ((mask >> i) & 1) continue;
    if (world.canGenerate(rec.cx + NB_DIRS[i].dx, rec.cz + NB_DIRS[i].dz)) return false;
  }
  return true;
}

export function anyBandInflight(rec) {
  if (!rec.bands) return false;
  for (let i = 0; i < rec.bands.length; i++) if (rec.bands[i] && rec.bands[i].meshInflight) return true;
  return false;
}

/** Sütun oklüzyon kutusu: gömülü olmayan, mesh'li bantların birleşimi. */
export function updateColBox(rec) {
  if (!rec.bands) {
    rec.hasMesh = false;
    return;
  }
  let any = false;
  const bx = rec.box;
  for (let i = 0; i < rec.bands.length; i++) {
    const b = rec.bands[i];
    if (!b || !b.hasMesh || b.interior) continue;
    const s = b.box;
    if (!any) {
      bx[0] = s[0];
      bx[1] = s[1];
      bx[2] = s[2];
      bx[3] = s[3];
      bx[4] = s[4];
      bx[5] = s[5];
      any = true;
    } else {
      if (s[1] < bx[1]) bx[1] = s[1];
      if (s[4] > bx[4]) bx[4] = s[4];
      if (s[0] < bx[0]) bx[0] = s[0];
      if (s[3] > bx[3]) bx[3] = s[3];
      if (s[2] < bx[2]) bx[2] = s[2];
      if (s[5] > bx[5]) bx[5] = s[5];
    }
  }
  rec.hasMesh = any;
  rec.meshedAny = rec.meshedAny || any;
}

export function bandStamp(ch, band) {
  return ch.sectionsVersion(band.s0, band.s0 + band.ns - 1);
}

export function lodFor(d, ml) {
  return d >= (ml === 2 ? LOD_FLORA_EXIT : LOD_FLORA_ENTER) ? 2 : d >= (ml >= 1 ? LOD_FAR_EXIT : LOD_FAR_ENTER) ? 1 : 0;
}

export function planColumn(P, rec, ch, d, rx, rz, meshR, aboveGround) {
  const n = ch.sectionCount;
  const nb = bandCount(n);
  if (!rec.bands) rec.bands = new Array(nb).fill(null);
  let pending = 0;
  let needSecs = null;
  let wantLo = 1e9; // istenen bantların gereken kesit aralığı: bunlar bellek penceresinden bağımsız ASLA bırakılmaz (üret-bırak döngüsü olmasın)
  let wantHi = -1;
  const mask = neighborMask(P.world, rec);
  const settled = neighborsSettled(P.world, rec, mask);
  for (let b = 0; b < nb; b++) {
    const r = bandRange(b, n);
    const baseY = ch.yMin + r.s0 * 16;
    const topY = baseY + r.ns * 16 - 1;
    let band = rec.bands[b];
    const had = band !== null && (band.hasMesh || band.meshedVersion >= 0);
    const slack = had ? WINDOW_SLACK : 0;
    let want = topY >= P.win.lo - slack && baseY <= P.win.hi + slack;
    if (!want && aboveGround && topY >= rec.hmMin - 8 && baseY <= rec.hmMax + 48) want = true;
    const interior = topY < rec.hmMin - 2;
    if (want) {
      const lim = interior ? (aboveGround ? INTERIOR_NEAR_CHUNKS : DEEP_VIEW_CHUNKS) : meshR;
      if (d > lim + (had ? 0.7 : 0)) want = false;
    }
    if (!want) {
      if (band) {
        band.wanted = false;
        if (band.hasMesh && !band.meshInflight) {
          P.store.clear(band);
          updateColBox(rec);
        }
        if (!band.meshInflight) {
          band.meshedVersion = -1;
          band.nbMask = -1;
        }
      }
      continue;
    }
    if (!band) {
      band = makeBandRec(rec, b, n, ch.yMin);
      rec.bands[b] = band;
      P.culler.dirtyBands();
    }
    band.wanted = true;
    band.interior = interior;
    band.dist = d;
    // dikey komşular dahil gereken kesitler üretilmiş mi?
    const sr = neededSections(n, r.s0, r.ns);
    if (sr[0] < wantLo) wantLo = sr[0];
    if (sr[1] > wantHi) wantHi = sr[1];
    let miss = false;
    for (let si = sr[0]; si <= sr[1]; si++) {
      if (ch.secGen[si] === 0) {
        if (needSecs === null) needSecs = [];
        needSecs.push(si);
        miss = true;
      }
    }
    if (miss) {
      pending++;
      continue;
    }
    const stamp = bandStamp(ch, band);
    const key = stamp * 512 + mask;
    if (band.trivialStamp !== key) {
      band.trivial = bandTrivial(P.world, ch, r.s0, r.ns);
      band.trivialStamp = key;
    }
    if (band.trivial) {
      if (band.hasMesh) {
        P.store.clear(band);
        updateColBox(rec);
      }
      band.meshedVersion = stamp;
      band.nbMask = mask;
      continue;
    }
    if (band.meshInflight) {
      pending++;
      continue;
    }
    let lod = lodFor(d, band.meshedLod);
    // şehir: kademe 2 (uzak bitki atlama) kademe 1 ile bayt-aynı mesh üretir (2776 bant örneğinde 1 fark) → boşuna yeniden mesh + yükleme olmasın (perf_tuner, Faz 5)
    if (lod === 2 && P.cityMesh) lod = 1;
    if (band.meshedVersion === stamp && band.nbMask === mask && band.meshedLod === lod) continue;
    pending++;
    if (!settled) continue;
    band.wantLod = lod;
    band.score = chunkPriority(rx, rz, P.fx, P.fz) + Math.abs((baseY + topY) * 0.5 - P.py) * 0.012;
    P.meshList.push(band);
  }
  rec.pending = pending;
  rec.planned = true;
  if (needSecs !== null && !rec.secInflight && P.deepSections > 0) {
    const uniq = Array.from(new Set(needSecs)).sort((a, c) => a - c);
    rec.score = chunkPriority(rx, rz, P.fx, P.fz);
    P.secList.push({ rec, sis: uniq });
  }
  // pencere dışına çıkan derin kesitleri bırak (düzenlemeler World'de kalır); yüklü derin kesitleri say
  for (let si = 0; si < P.deepSections; si++) {
    if (ch.secGen[si] === 0) continue;
    const y0 = ch.yMin + si * 16;
    if (P.unloadBudget > 0 && !rec.secInflight && (y0 + 15 < P.win.keepLo || y0 > P.win.keepHi) && (si < wantLo || si > wantHi)) {
      if (P.world.unloadSection(rec.cx, rec.cz, si)) {
        P.unloadBudget--;
        continue;
      }
    }
    P.sectionCount++;
  }
}

