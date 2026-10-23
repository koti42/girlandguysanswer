/*
 * KEŞİF sim — yaratık yol bulma: ızgara A*-lite (saf).
 *
 * Yalnızca yönlendirme tıkandığında (engel/çukur/duvar) çağrılır; en çok bir arama/kare (EntityManager bütçeler).
 * Pencere 25×25×13 hücre, en çok ~240 genişletme, ön ayrılmış tamponlar (kare başı ayırma yok).
 * Düğüm = yürünebilir ayak hücresi (altı katı, gövde boş). Komşular: 8 yön (köşe kesme yok), 1 basamak çıkma
 * (canJump), maxDrop'a kadar iniş. Hedefe varılamazsa hedefe en yakın düğüme kısmi yol döner.
 */
import { cellSolid, standable } from './mobAIUtil.js';

const R = 12;
const W = R * 2 + 1;
const LV = 13;
const LH = 6;
const N = W * W * LV;
const MAX_HEAP = 1024;
export const PATH_MAX_POINTS = 24;

const gCost = new Float32Array(N);
const parent = new Int32Array(N);
const stamp = new Int32Array(N);
const closed = new Int32Array(N);
let cur = 0;

const chain = new Int32Array(512);
const heapN = new Int32Array(MAX_HEAP);
const heapF = new Float32Array(MAX_HEAP);
let heapSize = 0;

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const DC = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];

function push(n, f) {
  if (heapSize >= MAX_HEAP) return;
  let i = heapSize++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heapF[p] <= f) break;
    heapN[i] = heapN[p];
    heapF[i] = heapF[p];
    i = p;
  }
  heapN[i] = n;
  heapF[i] = f;
}
function pop() {
  const top = heapN[0];
  heapSize--;
  if (heapSize > 0) {
    const n = heapN[heapSize];
    const f = heapF[heapSize];
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= heapSize) break;
      if (c + 1 < heapSize && heapF[c + 1] < heapF[c]) c++;
      if (heapF[c] >= f) break;
      heapN[i] = heapN[c];
      heapF[i] = heapF[c];
      i = c;
    }
    heapN[i] = n;
    heapF[i] = f;
  }
  return top;
}

function heuristic(x, y, z, tx, ty, tz) {
  const dx = Math.abs(x - tx);
  const dz = Math.abs(z - tz);
  const dy = Math.abs(y - ty);
  const mn = dx < dz ? dx : dz;
  return dx + dz - 0.586 * mn + dy * 0.6;
}

/** Yol çıktısı için tampon: {pts: Float32Array(3*PATH_MAX_POINTS), n, reached}. */
export function createPathBuffer() {
  return { pts: new Float32Array(PATH_MAX_POINTS * 3), n: 0, i: 0, reached: false };
}

/**
 * (sx,sy,sz) başlangıç ayak hücresi (tam sayı), (tx,ty,tz) hedef (ondalık olabilir).
 * o: {hc, canJump, maxDrop, avoidWater, ignoreLava, maxNodes=240, goalRadius=1.2}
 * → bulunan nokta sayısı (0: yol yok/başlangıç hedef). out'a x,y,z (hücre merkezi) yazılır, out.i = 0.
 */
export function findPath(world, sx, sy, sz, tx, ty, tz, o, out) {
  out.n = 0;
  out.i = 0;
  out.reached = false;
  const hc = o.hc;
  const maxNodes = o.maxNodes || 240;
  const goalR = o.goalRadius === undefined ? 1.2 : o.goalRadius;
  const maxDrop = o.maxDrop === undefined ? 3 : o.maxDrop;
  const ox = sx - R;
  const oz = sz - R;
  const oy = sy - LH;
  cur++;
  if (cur > 2000000000) {
    stamp.fill(0);
    closed.fill(0);
    cur = 1;
  }
  heapSize = 0;
  const startIdx = (LH * W + R) * W + R;
  gCost[startIdx] = 0;
  parent[startIdx] = -1;
  stamp[startIdx] = cur;
  push(startIdx, heuristic(sx, sy, sz, tx, ty, tz));

  let best = startIdx;
  let bestH = heuristic(sx, sy, sz, tx, ty, tz);
  let found = -1;
  let expanded = 0;
  const hopt = { ignoreLava: !!o.ignoreLava, avoidWater: o.avoidWater !== false };

  while (heapSize > 0 && expanded < maxNodes) {
    const idx = pop();
    if (closed[idx] === cur) continue;
    closed[idx] = cur;
    expanded++;
    const ix = idx % W;
    const iz = ((idx / W) | 0) % W;
    const iy = (idx / (W * W)) | 0;
    const x = ox + ix;
    const z = oz + iz;
    const y = oy + iy;
    const hh = heuristic(x, y, z, tx, ty, tz);
    if (hh < bestH) {
      bestH = hh;
      best = idx;
    }
    if (Math.abs(x + 0.5 - tx) <= goalR && Math.abs(z + 0.5 - tz) <= goalR && Math.abs(y - ty) <= 2) {
      found = idx;
      break;
    }
    const g0 = gCost[idx];
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d];
      const nz = z + DZ[d];
      const nix = ix + DX[d];
      const niz = iz + DZ[d];
      if (nix < 0 || nix >= W || niz < 0 || niz >= W) continue;
      if (d >= 4) {
        // köşe kesme yok: iki dik komşu da gövde seviyesinde açık olmalı
        let blocked = false;
        for (let j = 0; j < hc && !blocked; j++) {
          if (cellSolid(world, x + DX[d], y + j, z) || cellSolid(world, x, y + j, z + DZ[d])) blocked = true;
        }
        if (blocked) continue;
      }
      let ny = y;
      let extra = 0;
      if (standable(world, nx, y, nz, hc, hopt)) {
        ny = y;
      } else if (o.canJump && standable(world, nx, y + 1, nz, hc, hopt) && !cellSolid(world, x, y + hc, z)) {
        ny = y + 1;
        extra = 0.6;
      } else {
        let ok = false;
        for (let dd = 1; dd <= maxDrop; dd++) {
          const cy = y - dd;
          if (!standable(world, nx, cy, nz, hc, hopt)) continue;
          let free = true;
          for (let yy = cy + hc; yy < y + hc; yy++) {
            if (cellSolid(world, nx, yy, nz)) {
              free = false;
              break;
            }
          }
          if (!free) continue;
          ny = cy;
          extra = 0.3 + dd * 0.15;
          ok = true;
          break;
        }
        if (!ok) continue;
      }
      const niy = ny - oy;
      if (niy < 0 || niy >= LV) continue;
      const nidx = (niy * W + niz) * W + nix;
      if (closed[nidx] === cur) continue;
      const ng = g0 + DC[d] + extra;
      if (stamp[nidx] === cur && gCost[nidx] <= ng) continue;
      stamp[nidx] = cur;
      gCost[nidx] = ng;
      parent[nidx] = idx;
      push(nidx, ng + heuristic(nx, ny, nz, tx, ty, tz));
    }
  }

  const end = found >= 0 ? found : best;
  out.reached = found >= 0;
  if (end === startIdx) return 0;
  // zincir: chain[0] = bitiş ... chain[count-1] = ilk adım
  let count = 0;
  for (let n = end; n >= 0 && n !== startIdx && count < chain.length; n = parent[n]) chain[count++] = n;
  const take = count < PATH_MAX_POINTS ? count : PATH_MAX_POINTS;
  for (let i = 0; i < take; i++) {
    const n = chain[count - 1 - i];
    const ix = n % W;
    const iz = ((n / W) | 0) % W;
    const iy = (n / (W * W)) | 0;
    out.pts[i * 3] = ox + ix + 0.5;
    out.pts[i * 3 + 1] = oy + iy;
    out.pts[i * 3 + 2] = oz + iz + 0.5;
  }
  out.n = take;
  return take;
}
