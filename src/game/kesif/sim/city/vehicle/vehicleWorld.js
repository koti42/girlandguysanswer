/*
 * KEŞİF sim/city/vehicle — ARAÇ ↔ DÜNYA ÇARPIŞMASI (saf; three/DOM/Math.random/Date.now yok, worker-güvenli, es2020, tahsissiz sıcak yol).
 * vehiclePhysics.js'in yardımcıları:
 *
 *   groundHeight(world, x, z, yTop, depth, liquidSurface) → yükseklik | NaN (yüklenmemiş) | −Infinity (derinlikte zemin yok)
 *        (x,z) noktasının ALTINDAKİ en yüksek taşıyıcı yüzey (blok çarpışma kutuları; üst yüzü ≤ yTop); liquidSurface: sıvı yüzeyi de zemin sayılır (hover).
 *   gatherObstacles(world, cc, g) → n        araç etrafındaki engel kutularını modül tamponuna toplar (voxel çarpışma kutuları, ColliderIndex kutuları,
 *        su kenarı "korkuluğu"). Yüklenmemiş hücre = tam katı (physics.moveBox ile aynı kural).
 *   resolveObb(v, d, n, stepAllow, hSub, bounceOnHard) → CONTACT   OBB (araç ayak izi) ↔ engelleri SAT ile çözer: konumu iter, hızın normal bileşenini keser (kayma)
 *   obbFree(world, cc, x, y, z, yaw, d, ignoreId, stepAllow) → bool       verilen pozda araç hiçbir engelle kesişmiyor mu (doğma/çıkış/ışınlama)
 *
 * Engel kuralı (tünelleme yok): araç alt-adımda ≤ 0,35 m ilerler; engel kutuları 1 blok kalınlığında ya da daha ince ise SAT iç içe geçmeyi
 * geri iter (en küçük örtüşme ekseni). Voxel kutuları, tepesi (araç y + step) altındaysa ZEMİN sayılır (basamak/döşeme/rampa), üstündeyse duvardır;
 * ColliderIndex kutuları (prop/araç/yaya) tepesi y + 0,3 üstündeyse her zaman engeldir.
 */
import { BLOCKS } from '../../blocks.js';

export const MAX_OBS = 320;
const EPS = 1e-6;
/**
 * gTop (en yüksek tekerlek teması) en çok y + gtopCap(d) sayılır (QA5-A2): 45° rampada ön aks merkezden en çok wheelbase/2 yüksektedir; fazlası tekerleğin katı kütle
 * içinde (duvara gömülü) olduğunu gösterir. Sınırsız gTop, kütle içindeki tekerlekte her karede bir basamak payı tırmanıp aracı duvardan yukarı ışınlıyordu.
 */
export function gtopCap(d) {
  return d.wheelbase * 0.5 + 0.1;
}

/** Engel tamponu: [x0,y0,z0,x1,y1,z1] × MAX_OBS; tür: 0 voxel · 1 prop/collider · 2 su kenarı korkuluğu · 3 yumuşak collider (yaya vb.) · 4 yüklenmemiş (null) hücre. */
export const OBS = new Float64Array(MAX_OBS * 6);
export const OBS_KIND = new Uint8Array(MAX_OBS);
export const OBS_ID = new Uint32Array(MAX_OBS);
const _cq = new Float64Array(64 * 6);

/** gatherObstacles sonucu sayaçları (testler/ölçüm). */
export const STATS = { gathered: 0, truncated: 0, rails: 0 };

export function groundHeight(world, x, z, yTop, depth, liquidSurface) {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  const lx = x - cx;
  const lz = z - cz;
  const yStart = Math.floor(yTop);
  const yEnd = Math.floor(yTop - depth);
  for (let cy = yStart; cy >= yEnd; cy--) {
    const id = world.getBlock(cx, cy, cz);
    if (id === null || id === undefined) return NaN;
    if (id === 0) continue;
    const b = BLOCKS[id];
    if (!b) continue;
    if (b.liquid) {
      if (liquidSurface) {
        const top = cy + 0.88;
        if (top <= yTop + EPS) return top;
      }
      continue;
    }
    const boxes = b.collision;
    let best = -Infinity;
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i];
      if (lx >= bx[0] - EPS && lx <= bx[3] + EPS && lz >= bx[2] - EPS && lz <= bx[5] + EPS) {
        const top = cy + bx[4];
        if (top <= yTop + EPS && top > best) best = top;
      }
    }
    if (best > -Infinity) return best;
  }
  return -Infinity;
}

/** Sütunda (cx,cz) y'nin altında yakın zemin yok ve altında SU var mı? (kanal kenarı) */
function waterDropColumn(world, cx, cz, yBase) {
  let cy = Math.floor(yBase) - 1;
  const lo = cy - 26;
  for (let n = 0; n < 3 && cy >= lo; n++, cy--) {
    const id = world.getBlock(cx, cy, cz);
    if (id === null || id === undefined) return false;
    if (id !== 0) {
      const b = BLOCKS[id];
      if (b && !b.liquid && b.collision.length > 0) return false; // yakın bir zemin var: küçük çukur (araç düşer, su yok)
      if (b && b.liquid) return true;
    }
  }
  for (; cy >= lo; cy--) {
    const id = world.getBlock(cx, cy, cz);
    if (id === null || id === undefined) return false;
    if (id === 0) continue;
    const b = BLOCKS[id];
    if (!b) continue;
    if (b.liquid) return true;
    if (b.collision.length > 0) return false;
  }
  return false;
}

/**
 * g: {x0,z0,x1,z1 (aranan yatay dikdörtgen), y (araç alt yüzü), h (yükseklik), step (basamak payı), rails (bool), ignoreId}
 * Dönüş: engel sayısı (OBS/OBS_KIND/OBS_ID doldurulur).
 */
export function gatherObstacles(world, cc, g) {
  let n = 0;
  const yLo = g.y - 0.3;
  const yHi = g.y + g.h + 0.8;
  const c0 = Math.floor(g.x0);
  const c1 = Math.floor(g.x1);
  const d0 = Math.floor(g.z0);
  const d1 = Math.floor(g.z1);
  const cyLo = Math.floor(yLo);
  const cyHi = Math.floor(yHi);
  const supLo = g.y - 0.55;
  const supHi = g.y + g.step + EPS;
  let trunc = 0;
  let rails = 0;
  for (let cx = c0; cx <= c1; cx++) {
    for (let cz = d0; cz <= d1; cz++) {
      let supported = false;
      for (let cy = cyHi; cy >= cyLo; cy--) {
        const id = world.getBlock(cx, cy, cz);
        if (id === null || id === undefined) {
          supported = true;
          if (n < MAX_OBS) {
            const o = n * 6;
            OBS[o] = cx; OBS[o + 1] = cy; OBS[o + 2] = cz; OBS[o + 3] = cx + 1; OBS[o + 4] = cy + 1; OBS[o + 5] = cz + 1;
            OBS_KIND[n] = 4; // yüklenmemiş hücre: tam katı, basamak sayılmaz (QA5-A2)
            OBS_ID[n] = 0;
            n++;
          } else trunc++;
          continue;
        }
        if (id === 0) continue;
        const b = BLOCKS[id];
        if (!b || b.liquid) continue;
        const boxes = b.collision;
        for (let i = 0; i < boxes.length; i++) {
          const bx = boxes[i];
          const top = cy + bx[4];
          if (top >= supLo && top <= supHi) supported = true;
          if (top <= yLo) continue;
          if (n < MAX_OBS) {
            const o = n * 6;
            OBS[o] = cx + bx[0]; OBS[o + 1] = cy + bx[1]; OBS[o + 2] = cz + bx[2];
            OBS[o + 3] = cx + bx[3]; OBS[o + 4] = top; OBS[o + 5] = cz + bx[5];
            OBS_KIND[n] = 0;
            OBS_ID[n] = 0;
            n++;
          } else trunc++;
        }
      }
      if (!supported && g.rails && waterDropColumn(world, cx, cz, g.y)) {
        if (n < MAX_OBS) {
          const o = n * 6;
          OBS[o] = cx; OBS[o + 1] = g.y - 0.4; OBS[o + 2] = cz; OBS[o + 3] = cx + 1; OBS[o + 4] = g.y + g.h + 0.4; OBS[o + 5] = cz + 1;
          OBS_KIND[n] = 2;
          OBS_ID[n] = 0;
          n++;
          rails++;
        } else trunc++;
      }
    }
  }
  if (cc && cc.size > 0) {
    const m = cc.queryRaw(g.x0, yLo, g.z0, g.x1, yHi, g.z1, _cq, 64);
    for (let i = 0; i < m; i++) {
      const id = cc.ids[i];
      if (g.ignoreId !== undefined && id === g.ignoreId) continue;
      if (n >= MAX_OBS) { trunc++; continue; }
      const q = i * 6;
      const o = n * 6;
      OBS[o] = _cq[q]; OBS[o + 1] = _cq[q + 1]; OBS[o + 2] = _cq[q + 2]; OBS[o + 3] = _cq[q + 3]; OBS[o + 4] = _cq[q + 4]; OBS[o + 5] = _cq[q + 5];
      OBS_KIND[n] = g.isSoft && g.isSoft(id) ? 3 : 1;
      OBS_ID[n] = id;
      n++;
    }
  }
  STATS.gathered = n;
  STATS.truncated += trunc;
  STATS.rails = rails;
  return n;
}

/** Temas özeti (resolveObb çıktısı; paylaşılan nesne). */
export const CONTACT = {
  hit: false, // en az bir engel itildi
  count: 0, // itilen engel sayısı
  impact: 0, // en büyük normal hız (m/s, ≥ 0)
  nx: 0, nz: 0, // en büyük çarpışmanın normali (engelden araca)
  kind: 0, // o engelin türü
  id: 0, // o engelin collider kimliği (0 = voxel)
  soft: false,
  unresolved: false, // yineleme sınırında hâlâ iç içe
  torque: 0, // yaw hız darbesi (rad/s; sınırlı)
  rail: false,
};

/**
 * OBB ↔ engel SAT çözümü: resolveObb(v, d, n, stepAllow, hSub, bounceOnHard). v: {x,y,z,yaw,vx,vz}, d: sınıf tanımı, n: engel sayısı, hSub: alt-adım süresi.
 * Konum v.x/v.z'de itilir, hız bileşeni (v.vx,v.vz) normal yönünde kesilir; sonuç CONTACT'a yazılır.
 * stepAllow: voxel engeller için tepe ≤ y+stepAllow ZEMİN sayılır (çarpmaz).
 */
export function resolveObb(v, d, n, stepAllow, hSub, bounceOnHard) {
  const c = CONTACT;
  c.hit = false; c.count = 0; c.impact = 0; c.nx = 0; c.nz = 0; c.kind = 0; c.id = 0; c.soft = false; c.unresolved = false; c.torque = 0; c.rail = false;
  const hl = d.length * 0.5 * 0.98;
  const hw = d.width * 0.5 * 0.96;
  const yb = d.hover === 0 && v.gTop > v.y ? (v.gTop < v.y + gtopCap(d) ? v.gTop : v.y + gtopCap(d)) : v.y; // basamak payı: tekerlekliler en yüksek tekerlek temasından (eğimli gövde); süzülenler doğrudan y
  const yt = v.y + d.height;
  for (let iter = 0; iter < 6; iter++) {
    const sy = Math.sin(v.yaw);
    const cy = Math.cos(v.yaw);
    const fx = -sy;
    const fz = -cy;
    const rx = cy;
    const rz = -sy;
    const hx = hl * Math.abs(fx) + hw * Math.abs(rx);
    const hz = hl * Math.abs(fz) + hw * Math.abs(rz);
    const bx0 = v.x - hx;
    const bx1 = v.x + hx;
    const bz0 = v.z - hz;
    const bz1 = v.z + hz;
    let bestDepth = 0.002;
    let bestI = -1;
    let bnx = 0;
    let bnz = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      const k = OBS_KIND[i];
      const top = OBS[o + 4];
      if (k === 0) {
        if (top <= yb + stepAllow + EPS) continue;
      } else if (k === 4) {
        if (top <= yb + 0.05) continue; // ayak seviyesinin altındaki yüklenmemiş zemin (mevcut davranış); üstü basamak payıyla bile aşılamaz
      } else if (k === 1 || k === 3) {
        if (top <= yb + 0.3) continue;
      }
      if (OBS[o + 1] >= yt - 0.02) continue;
      if (OBS[o] >= bx1 || OBS[o + 3] <= bx0 || OBS[o + 2] >= bz1 || OBS[o + 5] <= bz0) continue;
      const ex = (OBS[o + 3] - OBS[o]) * 0.5;
      const ez = (OBS[o + 5] - OBS[o + 2]) * 0.5;
      const dx = v.x - (OBS[o] + ex);
      const dz = v.z - (OBS[o + 2] + ez);
      // eksen X
      const oX = hx + ex - Math.abs(dx);
      if (oX <= 0) continue;
      const oZ = hz + ez - Math.abs(dz);
      if (oZ <= 0) continue;
      const df = dx * fx + dz * fz;
      const oF = hl + ex * Math.abs(fx) + ez * Math.abs(fz) - Math.abs(df);
      if (oF <= 0) continue;
      const dr = dx * rx + dz * rz;
      const oR = hw + ex * Math.abs(rx) + ez * Math.abs(rz) - Math.abs(dr);
      if (oR <= 0) continue;
      // en küçük örtüşme ekseni (dünya eksenleri hafif tercih edilir: duvar boyunca doğal kayma)
      let md = oX;
      let nxx = dx >= 0 ? 1 : -1;
      let nzz = 0;
      if (oZ < md) { md = oZ; nxx = 0; nzz = dz >= 0 ? 1 : -1; }
      const sF = oF * 1.06;
      if (sF < md) { md = oF; nxx = df >= 0 ? fx : -fx; nzz = df >= 0 ? fz : -fz; }
      const sR = oR * 1.06;
      if (sR < md) { md = oR; nxx = dr >= 0 ? rx : -rx; nzz = dr >= 0 ? rz : -rz; }
      if (md > bestDepth) {
        bestDepth = md;
        bestI = i;
        bnx = nxx;
        bnz = nzz;
      }
    }
    if (bestI < 0) return c;
    if (iter === 5) {
      c.unresolved = true;
      return c;
    }
    // itme
    v.x += bnx * (bestDepth + 0.003);
    v.z += bnz * (bestDepth + 0.003);
    const vn = v.vx * bnx + v.vz * bnz;
    const kind = OBS_KIND[bestI];
    c.hit = true;
    c.count++;
    if (vn < 0) {
      const impact = -vn;
      const hard = bounceOnHard && impact > 6 && kind !== 2 && kind !== 3;
      const e = hard ? 0.2 : 0;
      v.vx -= (1 + e) * vn * bnx;
      v.vz -= (1 + e) * vn * bnz;
      // teğet sürtünme (kazıma)
      const sc = kind === 2 ? 0.6 : kind === 3 ? 0.2 : 1.6;
      const tvx = v.vx - (v.vx * bnx + v.vz * bnz) * bnx;
      const tvz = v.vz - (v.vx * bnx + v.vz * bnz) * bnz;
      const kf = Math.min(0.5, sc * (0.4 + impact * 0.15) * hSub);
      v.vx -= tvx * kf;
      v.vz -= tvz * kf;
      if (impact > c.impact) {
        c.impact = impact;
        c.nx = bnx;
        c.nz = bnz;
        c.kind = kind;
        c.id = OBS_ID[bestI];
        c.soft = kind === 3;
        c.rail = kind === 2;
        // yaw darbesi: -n yönündeki en derin köşe
        const sy2 = Math.sin(v.yaw);
        const cy2 = Math.cos(v.yaw);
        const fx2 = -sy2;
        const fz2 = -cy2;
        const rx2 = cy2;
        const rz2 = -sy2;
        const sf = (-bnx * fx2 - bnz * fz2) >= 0 ? 1 : -1;
        const sr = (-bnx * rx2 - bnz * rz2) >= 0 ? 1 : -1;
        const lx = fx2 * hl * sf + rx2 * hw * sr;
        const lz = fz2 * hl * sf + rz2 * hw * sr;
        const tau = (bnx * impact) * lz - (bnz * impact) * lx; // F = n·impact; τ = Fx·lz − Fz·lx
        c.torque = kind === 3 || kind === 2 ? 0 : Math.max(-1.4, Math.min(1.4, tau * 0.07));
      }
    }
  }
  return c;
}

/** Poz boş mu (engelle kesişmiyor mu)? Doğma/çıkış/ışınlama güvenliği için. Zemin şartı aranmaz. 1 cm'ye kadar temas (fizik kabuğu 2 mm) kesişme sayılmaz. */
export function obbFree(world, cc, x, y, z, yaw, d, ignoreId, stepAllow, yClimb) {
  const yc = yClimb !== undefined && yClimb > y ? (yClimb < y + gtopCap(d) ? yClimb : y + gtopCap(d)) : y; // basamak payı referansı (en yüksek tekerlek teması; yoksa y)
  const hl = d.length * 0.5 * 0.98;
  const hw = d.width * 0.5 * 0.96;
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const fx = -sy;
  const fz = -cy;
  const rx = cy;
  const rz = -sy;
  const hx = hl * Math.abs(fx) + hw * Math.abs(rx);
  const hz = hl * Math.abs(fz) + hw * Math.abs(rz);
  const g = {
    x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, y, h: d.height, step: stepAllow, rails: false, ignoreId,
  };
  const n = gatherObstacles(world, cc, g);
  const yt = y + d.height;
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    const k = OBS_KIND[i];
    const top = OBS[o + 4];
    if (k === 0) {
      if (top <= yc + stepAllow + EPS) continue;
    } else if (k === 4) {
      if (top <= yc + 0.05) continue;
    } else if (top <= yc + 0.3) continue;
    if (OBS[o + 1] >= yt - 0.02) continue;
    if (OBS[o] >= x + hx || OBS[o + 3] <= x - hx || OBS[o + 2] >= z + hz || OBS[o + 5] <= z - hz) continue;
    const ex = (OBS[o + 3] - OBS[o]) * 0.5;
    const ez = (OBS[o + 5] - OBS[o + 2]) * 0.5;
    const dx = x - (OBS[o] + ex);
    const dz = z - (OBS[o + 2] + ez);
    if (hx + ex - Math.abs(dx) <= 0.01) continue;
    if (hz + ez - Math.abs(dz) <= 0.01) continue;
    if (hl + ex * Math.abs(fx) + ez * Math.abs(fz) - Math.abs(dx * fx + dz * fz) <= 0.01) continue;
    if (hw + ex * Math.abs(rx) + ez * Math.abs(rz) - Math.abs(dx * rx + dz * rz) <= 0.01) continue;
    return false;
  }
  return true;
}
