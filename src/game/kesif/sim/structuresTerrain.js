/*
 * KEŞİF sim — yapı zemini: yer seçimi (chunk gerektirmez) + düzleştirme/temel/bitki temizliği (chunk'a yazar).
 *
 * Yer seçimi (plan zamanı): heightAt ızgarasından yükseklik istatistiği (min/maks/ortanca/ıslak oran) → aday merkezler
 * puanlanır; mühür halkası, deniz ve doğuş noktası yakınından kaçınılır. Hepsi yalnız (seed, koordinat)'a bağlıdır.
 *
 * Yazma zamanı: terraform(W, şekil, floorY, marj) — şeklin içi tam floorY'ye düzlenir (çukur doldurulur → asılı bina
 * yok; tepe oyulur → gömülü bina yok), dışında 45° eğimle doğal araziye bağlanır. Bitki/kütük/yaprak şekil+marj+3
 * içinde temizlenir. Tüm işlem, chunk'ın kendi orijinal zemin sütunlarına (W.ground) bakar → chunk bağımsız ve belirlenimli.
 */
import { SEA_LEVEL, ZONES } from './constants.js';
import { B } from './blocks.js';
import { heightAt, biomeKeyAt } from './worldgen.js';
import { SEAL_RING_RADII } from './worldgenTerrain.js';
import { isFloraId } from './structuresKit.js';
import { getGen } from './worldgenTerrain.js';
import {
  GIANT_CELL, TREE_CELL, beginTrees, buildTree, giantInCell, treeInCell,
} from './worldgenFlora.js';

/* ------------------------------------------------------------------------------------------------
 * Şekiller
 * ---------------------------------------------------------------------------------------------- */
export function circleShape(cx, cz, r) {
  return {
    x0: cx - r, z0: cz - r, x1: cx + r, z1: cz + r,
    dist(x, z) {
      const dx = x - cx;
      const dz = z - cz;
      const d = Math.sqrt(dx * dx + dz * dz + 0.0) - r - 0.5;
      return d > 0 ? d : 0;
    },
  };
}

export function rectShape(x0, z0, x1, z1) {
  return {
    x0, z0, x1, z1,
    dist(x, z) {
      const dx = x < x0 ? x0 - x : (x > x1 ? x - x1 : 0);
      const dz = z < z0 ? z0 - z : (z > z1 ? z - z1 : 0);
      return dx === 0 && dz === 0 ? 0 : Math.sqrt(dx * dx + dz * dz);
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * terraform (chunk'a yazar)
 * ---------------------------------------------------------------------------------------------- */
const FILL_DEEP = B.STONE;

/**
 * Rampa parçası: (ox,oz) başlangıcından (dx,dz) birim yönünde `len` boyunca, yanal yarı genişlik `lat`. Platformla çakışan
 * a<0 bölgesi başka parçaya aittir. Eğim `slope` (varsayılan 0,5): yürünebilir giriş yolu; yanlar dikey kalır (kanyon).
 */
export function rampShape(ox, oz, dx, dz, lat, len, slope, rise) {
  const ex = [ox, ox + dx * len, ox - dz * lat, ox + dz * lat, ox + dx * len - dz * lat, ox + dx * len + dz * lat];
  const ez = [oz, oz + dz * len, oz + dx * lat, oz - dx * lat, oz + dz * len + dx * lat, oz + dz * len - dx * lat];
  return {
    x0: Math.min(...ex), z0: Math.min(...ez), x1: Math.max(...ex), z1: Math.max(...ez),
    margin: len,
    slope: slope || 0.5,
    // rise (işaretli blok/blok): verilirse rampa yüzeyi doğal araziyi İZLEMEZ; floorY + round(rise·a) sabit eğimli yüzeydir
    // (yüksekse oyulur, alçaksa dolgu yapılır). Doğal arazideki yarık/uçurum rampayı kesemez: yürünebilirlik kanıtlıdır.
    rise,
    dist(x, z) {
      const a = (x - ox) * dx + (z - oz) * dz;
      if (a < 0) return Infinity;
      const l = Math.abs(-(x - ox) * dz + (z - oz) * dx);
      if (l > lat) return Infinity;
      return a;
    },
  };
}

/**
 * Dünya merkezine (0,0) doğru uzanan erişim rampası. Taban şekil dairesel (r) ya da dikdörtgen ({hx,hz}) olabilir.
 * Döner {part, rect, dir:{x,z}, start:{x,z}} — part terraform union'ına eklenir, rect etki alanına katılır.
 */
export function rampToward(cx, cz, base, o) {
  const op = o || {};
  const len = op.len || 22;
  const lat = op.lat === undefined ? 3 : op.lat;
  let dx = -cx;
  let dz = -cz;
  const n = Math.hypot(dx, dz);
  if (n < 1) {
    dx = 1;
    dz = 0;
  } else {
    dx /= n;
    dz /= n;
  }
  // axis: rampa en yakın EKSEN yönüne oturur. Kapısı/yolu eksene hizalı yapılarda (boss arenası) merkeze bakan çapraz rampa kapıdan
  // yanal olarak kayıyordu: engebeli arazide yol, yanında oyulmuş kanyondan çıkıp kayaya giriyordu (ulaşılamayan boss kapısı).
  if (op.axis && n >= 1) {
    if (Math.abs(dx) > Math.abs(dz)) {
      dx = dx > 0 ? 1 : -1;
      dz = 0;
    } else {
      dz = dz > 0 ? 1 : -1;
      dx = 0;
    }
  }
  let r;
  if (typeof base === 'number') r = base;
  else {
    const ax = Math.abs(dx) < 1e-6 ? Infinity : base.hx / Math.abs(dx);
    const az = Math.abs(dz) < 1e-6 ? Infinity : base.hz / Math.abs(dz);
    r = Math.min(ax, az);
  }
  const ox = cx + dx * r;
  const oz = cz + dz * r;
  const part = rampShape(ox, oz, dx, dz, lat, len, op.slope || 0.5, op.rise);
  return {
    part,
    rect: { x0: Math.floor(part.x0) - 1, z0: Math.floor(part.z0) - 1, x1: Math.ceil(part.x1) + 1, z1: Math.ceil(part.z1) + 1 },
    dir: { x: dx, z: dz },
    start: { x: ox, z: oz },
  };
}

/**
 * Düz platform + erişim rampası kısayolu.
 *   base: sayı (daire yarıçapı) | {x0,z0,x1,z1} (dikdörtgen)
 * Döner {shape, rect (etki alanı), ramp}. rect: platform + margin + 3 + rampa kutusu.
 */
export function platform(cx, cz, base, margin, o) {
  const op = o || {};
  let part;
  let bb;
  let rb;
  if (typeof base === 'number') {
    part = circleShape(cx, cz, base);
    rb = base;
    bb = { x0: cx - base, z0: cz - base, x1: cx + base, z1: cz + base };
  } else {
    part = rectShape(base.x0, base.z0, base.x1, base.z1);
    rb = { hx: (base.x1 - base.x0) / 2, hz: (base.z1 - base.z0) / 2 };
    bb = { x0: base.x0, z0: base.z0, x1: base.x1, z1: base.z1 };
  }
  const reach = margin + 3;
  let rect = { x0: bb.x0 - reach, z0: bb.z0 - reach, x1: bb.x1 + reach, z1: bb.z1 + reach };
  let ramp = null;
  let shape = part;
  if (op.ramp !== false) {
    ramp = rampToward(cx, cz, rb, op);
    shape = unionShape([part, ramp.part]);
    rect = {
      x0: Math.min(rect.x0, ramp.rect.x0), z0: Math.min(rect.z0, ramp.rect.z0),
      x1: Math.max(rect.x1, ramp.rect.x1), z1: Math.max(rect.z1, ramp.rect.z1),
    };
  }
  return { shape, rect, ramp };
}

/** Parçaları birleştirir (her sütunda en az düzleştiren değil, EN ÇOK düzleştiren parça kazanır). */
export function unionShape(parts) {
  return {
    parts,
    x0: Math.min(...parts.map((p) => p.x0)),
    z0: Math.min(...parts.map((p) => p.z0)),
    x1: Math.max(...parts.map((p) => p.x1)),
    z1: Math.max(...parts.map((p) => p.z1)),
  };
}

/* Ağaç ayak izi temizliği: tek chunk'lık sıfır taslak dizisi (blok dizisiyle aynı yükseklik) */
let _scratch = null;
const TREE_REACH = 12; // worldgenFlora.TREE_MARGIN: taç bu kadar uzağa değebilir
const GIANT_REACH = 24; // worldgenFlora.GIANT_MARGIN

/**
 * Gövdesi (tabanı) temizlik alanında kalan ağaçları TÜMÜYLE siler (gövde + taç, taç alan dışına taşsa bile).
 * Eski davranış yalnız alan içindeki sütunların bitkilerini siliyordu: gövdesi silinen ağacın alan dışına taşan tacı
 * havada asılı yaprak halkası olarak kalıyordu (yapı yakınındaki ağaçların ~%23'ü). Ayak izi, ağacın kendi çizimi taslak
 * diziye yeniden çalıştırılarak bulunur ve yalnız değişmemiş (hâlâ o ağacın) hücreler silinir → chunk bağımsız, belirlenimli.
 * inReach(x,z) → bool: terraform'un bitki temizliği sütunu mu?
 */
function clearTreesInReach(W, inReach, rx0, rz0, rx1, rz1) {
  if (!W.ctx || W.ctx.seed === undefined || W.ctx.seed === null) return 0;
  const g = getGen(W.ctx.seed);
  const out = { x: 0, z: 0, y: 0, species: 0, hash: 0, biome: 0 };
  const blocks = W.blocks;
  if (!_scratch || _scratch.length !== blocks.length) _scratch = new Uint8Array(blocks.length);
  const sc = _scratch;
  let removed = 0;
  const visit = (reach, cell, finder, trunkW) => {
    const ca = Math.floor(Math.max(rx0, W.bx0 - reach) / cell);
    const cb = Math.floor(Math.min(rx1, W.bx1 + reach) / cell);
    const za = Math.floor(Math.max(rz0, W.bz0 - reach) / cell);
    const zb = Math.floor(Math.min(rz1, W.bz1 + reach) / cell);
    for (let cz = za; cz <= zb; cz++) {
      for (let cx = ca; cx <= cb; cx++) {
        if (!finder(g, cx, cz, out)) continue;
        if (!inReach(out.x, out.z) && !(trunkW && inReach(out.x + 1, out.z + 1))) continue;
        const tx = out.x;
        const ty = out.y;
        const tz = out.z;
        const xa = Math.max(W.bx0, tx - reach);
        const xb = Math.min(W.bx1, tx + reach);
        const zA = Math.max(W.bz0, tz - reach);
        const zB = Math.min(W.bz1, tz + reach);
        if (xa > xb || zA > zB) continue;
        const ya = Math.max(1, ty - 4);
        const yb = Math.min(W.top, ty + 70);
        beginTrees(sc, W.bx0, W.bz0);
        buildTree(out.species, tx, ty, tz, out.hash);
        for (let y = ya; y <= yb; y++) {
          for (let z = zA; z <= zB; z++) {
            const row = (y << 8) + ((z - W.bz0) << 4) - W.bx0;
            for (let x = xa; x <= xb; x++) {
              const s = sc[row + x];
              if (s === 0) continue;
              sc[row + x] = 0;
              if (blocks[row + x] === s && isFloraId(s)) {
                blocks[row + x] = 0;
                removed++;
              }
            }
          }
        }
      }
    }
  };
  visit(GIANT_REACH, GIANT_CELL, giantInCell, true);
  visit(TREE_REACH, TREE_CELL, treeInCell, false);
  return removed;
}

/**
 * shape.dist(x,z) ≤ 0 → tam floorY; 0 < d ≤ margin → eğimli rampa (slope); d ≤ margin+3 → yalnız bitki temizliği.
 * shape.parts varsa her parça kendi margin/slope değerini taşıyabilir. opts: {slope=1, clearFlora=true}.
 * Döner: etkilenen sütun sayısı.
 */
export function terraform(W, shape, floorY, margin, opts) {
  const o = opts || {};
  const m0 = margin === undefined ? 8 : margin;
  const sl0 = o.slope || 1;
  const parts = shape.parts || [shape];
  let reachMax = 0;
  for (let i = 0; i < parts.length; i++) reachMax = Math.max(reachMax, (parts[i].margin === undefined ? m0 : parts[i].margin) + 3);
  if (!W.has(shape.x0 - reachMax, shape.z0 - reachMax, shape.x1 + reachMax, shape.z1 + reachMax)) return 0;
  const xa = Math.max(W.bx0, Math.floor(shape.x0 - reachMax));
  const xb = Math.min(W.bx1, Math.ceil(shape.x1 + reachMax));
  const za = Math.max(W.bz0, Math.floor(shape.z0 - reachMax));
  const zb = Math.min(W.bz1, Math.ceil(shape.z1 + reachMax));
  const hm = W.chunk.heightMap;
  const blocks = W.blocks;
  let cols = 0;
  for (let z = za; z <= zb; z++) {
    for (let x = xa; x <= xb; x++) {
      const s = W.ground(x, z);
      if (s < 1) continue;
      let adjBest = null;
      let inReach = false;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const m = part.margin === undefined ? m0 : part.margin;
        const d = part.dist(x, z);
        if (d > m + 3) continue;
        inReach = true;
        if (d > m) continue;
        let adj;
        if (d <= 0) adj = 0;
        else if (part.rise !== undefined) adj = Math.round(part.rise * d);
        else {
          const delta = s - floorY;
          const lim = d * (part.slope === undefined ? sl0 : part.slope);
          adj = delta > lim ? lim : (delta < -lim ? -lim : delta);
          adj = Math.round(adj);
        }
        if (adjBest === null || Math.abs(adj) < Math.abs(adjBest)) adjBest = adj;
      }
      if (!inReach) continue;
      const lidx = ((z - W.bz0) << 4) + (x - W.bx0);
      let t = adjBest === null ? s : floorY + adjBest;
      if (t > 126) t = 126;
      if (t < 2) t = 2;
      if (t !== s) {
        cols++;
        const topId = W.groundTop(x, z);
        const fillId = W.groundFill(x, z);
        if (t > s) {
          blocks[(s << 8) + lidx] = fillId;
          for (let y = s + 1; y < t; y++) blocks[(y << 8) + lidx] = (t - y > 4) ? FILL_DEEP : fillId;
          blocks[(t << 8) + lidx] = topId;
        } else {
          for (let y = t + 1; y <= s; y++) blocks[(y << 8) + lidx] = 0;
          blocks[(t << 8) + lidx] = topId;
        }
      }
      if (o.clearFlora !== false) {
        const yTop = Math.min(W.top, Math.max(hm[lidx], s) + 2);
        for (let y = Math.max(t, s) + 1; y <= yTop; y++) {
          const b = blocks[(y << 8) + lidx];
          if (b !== 0 && isFloraId(b)) blocks[(y << 8) + lidx] = 0;
        }
      }
    }
  }
  if (o.clearFlora !== false) {
    // gövdesi alanda kalan ağaçlar tacıyla birlikte tümüyle gider (havada asılı yaprak halkası kalmasın)
    const inReach = (x, z) => {
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.dist(x, z) <= (part.margin === undefined ? m0 : part.margin) + 3) return true;
      }
      return false;
    };
    const n = clearTreesInReach(W, inReach, shape.x0 - reachMax, shape.z0 - reachMax, shape.x1 + reachMax, shape.z1 + reachMax);
    W.writes += n;
  }
  W.writes += cols;
  return cols;
}

/** Yalnız bitki temizliği (düzleştirme olmadan): rect + pad içinde, zeminden yukarı. */
export function clearFloraRect(W, rect, pad) {
  const p = pad || 0;
  if (!W.has(rect.x0 - p, rect.z0 - p, rect.x1 + p, rect.z1 + p)) return 0;
  const xa = Math.max(W.bx0, rect.x0 - p);
  const xb = Math.min(W.bx1, rect.x1 + p);
  const za = Math.max(W.bz0, rect.z0 - p);
  const zb = Math.min(W.bz1, rect.z1 + p);
  const hm = W.chunk.heightMap;
  const blocks = W.blocks;
  let n = 0;
  for (let z = za; z <= zb; z++) {
    for (let x = xa; x <= xb; x++) {
      const lidx = ((z - W.bz0) << 4) + (x - W.bx0);
      const s = Math.max(1, W.ground(x, z));
      for (let y = Math.min(W.top, hm[lidx]); y > s; y--) {
        const b = blocks[(y << 8) + lidx];
        if (b !== 0 && isFloraId(b)) {
          blocks[(y << 8) + lidx] = 0;
          n++;
        }
      }
    }
  }
  return n;
}

/* ------------------------------------------------------------------------------------------------
 * Plan zamanı: yer seçimi
 * ---------------------------------------------------------------------------------------------- */
const HC_STEP = 4;
const HC_REGION = 64;
const HC_N = HC_REGION / HC_STEP + 1; // 17 örnek / eksen (bölge kenarı komşuyla örtüşür → bilineer enterpolasyon bölge içinde kalır)
const HC = new Map();

/**
 * Hızlı yaklaşık zemin yüksekliği: 4 blokluk ızgaradan bilineer (heightAt'in önbellekli, ~50× ucuz karşılığı).
 * Yer seçimi istatistikleri içindir; kesin değer gereken yerde heightAt kullanılır.
 */
export function heightApprox(seed, x, z) {
  const rx = Math.floor(x / HC_REGION);
  const rz = Math.floor(z / HC_REGION);
  let per = HC.get(seed);
  if (!per) {
    if (HC.size >= 4) HC.delete(HC.keys().next().value);
    per = new Map();
    HC.set(seed, per);
  }
  const key = rx * 4096 + rz;
  let g = per.get(key);
  if (!g) {
    if (per.size > 900) per.clear();
    g = new Int16Array(HC_N * HC_N);
    for (let j = 0; j < HC_N; j++) {
      for (let i = 0; i < HC_N; i++) g[j * HC_N + i] = heightAt(seed, rx * HC_REGION + i * HC_STEP, rz * HC_REGION + j * HC_STEP);
    }
    per.set(key, g);
  }
  const fx = (x - rx * HC_REGION) / HC_STEP;
  const fz = (z - rz * HC_REGION) / HC_STEP;
  let i = Math.floor(fx);
  let j = Math.floor(fz);
  if (i >= HC_N - 1) i = HC_N - 2;
  if (j >= HC_N - 1) j = HC_N - 2;
  const tx = fx - i;
  const tz = fz - j;
  const a = g[j * HC_N + i];
  const b = g[j * HC_N + i + 1];
  const c = g[(j + 1) * HC_N + i];
  const d = g[(j + 1) * HC_N + i + 1];
  return Math.round((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz);
}

export function clearHeightCache() {
  HC.clear();
}
/**
 * (x,z) merkezli dikdörtgen yarıçaplı (hx,hz) alanın yükseklik istatistiği. nx×nz ızgara (≥2).
 * Döner {min,max,median,mean,wet,n,range}; wet = (h < SEA+2) sütun oranı.
 */
export function siteStats(seed, x, z, hx, hz, nx, nz) {
  const gx = Math.max(2, nx || 5);
  const gz = Math.max(2, nz || gx);
  const hs = [];
  let min = 999;
  let max = -999;
  let sum = 0;
  let wet = 0;
  for (let j = 0; j < gz; j++) {
    const zz = Math.round(z - hz + (2 * hz * j) / (gz - 1));
    for (let i = 0; i < gx; i++) {
      const xx = Math.round(x - hx + (2 * hx * i) / (gx - 1));
      const h = heightApprox(seed, xx, zz);
      hs.push(h);
      if (h < min) min = h;
      if (h > max) max = h;
      sum += h;
      if (h < SEA_LEVEL + 2) wet++;
    }
  }
  hs.sort((a, b) => a - b);
  const n = hs.length;
  return {
    min, max, median: hs[n >> 1], mean: sum / n, wet: wet / n, n, range: max - min,
  };
}

/** Doğuş noktasından uzak mı: rect, (sx,sz) merkezli r yarıçaplı diske değmiyor. */
export function rectAvoidsDisk(rect, sx, sz, r) {
  const dx = sx < rect.x0 ? rect.x0 - sx : (sx > rect.x1 ? sx - rect.x1 : 0);
  const dz = sz < rect.z0 ? rect.z0 - sz : (sz > rect.z1 ? sz - rect.z1 : 0);
  return dx * dx + dz * dz > r * r;
}

/** Dikdörtgen hiçbir Mühür halkası bandına (R±pad) girmiyor mu? */
export function ringClear(rect, pad) {
  const p = pad === undefined ? 5 : pad;
  const dxMin = rect.x0 > 0 ? rect.x0 : (rect.x1 < 0 ? -rect.x1 : 0);
  const dzMin = rect.z0 > 0 ? rect.z0 : (rect.z1 < 0 ? -rect.z1 : 0);
  const minD = Math.sqrt(dxMin * dxMin + dzMin * dzMin);
  const mx = Math.max(Math.abs(rect.x0), Math.abs(rect.x1));
  const mz = Math.max(Math.abs(rect.z0), Math.abs(rect.z1));
  const maxD = Math.sqrt(mx * mx + mz * mz);
  for (let i = 0; i < SEAL_RING_RADII.length; i++) {
    const R = SEAL_RING_RADII[i];
    if (minD <= R + p && maxD >= R - p) return false;
  }
  return true;
}

/** Merkez (x,z)'nin bölge indeksi için yarıçap yardımcıları. */
export function zoneRadii(zone) {
  const z = ZONES[Math.max(0, Math.min(ZONES.length - 1, zone | 0))];
  return { rIn: z.rIn, rOut: z.rOut };
}

export { biomeKeyAt };
