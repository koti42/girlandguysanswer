/*
 * KEŞİF render — chunkManager yardımcıları (SAF: three/DOM yok, node'da test edilir).
 *
 *   spiralOffsets(R)                      yarıçapı R (chunk) olan diskteki (dx,dz) ofsetleri, merkezden dışa sıralı
 *   chunkPriority(dx, dz, fx, fz)         küçük = önce; mesafe + bakış yönü ağırlıklı
 *   frustumPlanes(projEl, viewEl, out)    projeksiyon*görünüm matrislerinden 6 düzlem (normalleştirilmiş)
 *   sphereVisible(planes, x, y, z, r)     küre frustum içinde mi
 *   boxVisible(planes, box)               eksen hizalı kutu (box: [minx,miny,minz,maxx,maxy,maxz]) frustum içinde mi (küreden çok daha sıkı)
 *   boxDistance(box, x, y, z)             noktanın kutuya en yakın mesafesi
 *   neighborIds(cx, cz)                   8 komşu için kimlik/koordinat (mesher yön adlarıyla)
 *   NB_DIRS                               [{key, dx, dz}] — mesher komşu anahtarları
 *   sortByScore / clamp / ema             küçük yardımcılar
 */

/** Mesher komşu anahtarları: n=(cx,cz-1) s=(cx,cz+1) e=(cx+1,cz) w=(cx-1,cz) ve köşeler. */
export const NB_DIRS = Object.freeze([
  Object.freeze({ key: 'n', dx: 0, dz: -1 }),
  Object.freeze({ key: 's', dx: 0, dz: 1 }),
  Object.freeze({ key: 'e', dx: 1, dz: 0 }),
  Object.freeze({ key: 'w', dx: -1, dz: 0 }),
  Object.freeze({ key: 'ne', dx: 1, dz: -1 }),
  Object.freeze({ key: 'nw', dx: -1, dz: -1 }),
  Object.freeze({ key: 'se', dx: 1, dz: 1 }),
  Object.freeze({ key: 'sw', dx: -1, dz: 1 }),
]);

const spiralCache = new Map();

/**
 * Yarıçapı R (tam sayı, chunk) olan diskteki ofsetler (dx²+dz² ≤ (R+0.5)²), merkezden dışa; eşit mesafede açıya göre.
 * @returns {{count:number, dx:Int16Array, dz:Int16Array, dist:Float32Array}} (önbelleğe alınır; DEĞİŞTİRME)
 */
export function spiralOffsets(R) {
  const r = Math.max(0, Math.floor(R));
  const hit = spiralCache.get(r);
  if (hit) return hit;
  const list = [];
  const lim = (r + 0.5) * (r + 0.5);
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= lim) list.push({ dx, dz, d2, a: Math.atan2(dz, dx) });
    }
  }
  list.sort((p, q) => (p.d2 - q.d2) || (p.a - q.a));
  const out = {
    count: list.length,
    dx: new Int16Array(list.length),
    dz: new Int16Array(list.length),
    dist: new Float32Array(list.length),
  };
  for (let i = 0; i < list.length; i++) {
    out.dx[i] = list[i].dx;
    out.dz[i] = list[i].dz;
    out.dist[i] = Math.sqrt(list[i].d2);
  }
  spiralCache.set(r, out);
  return out;
}

/**
 * Yükleme/mesh önceliği (küçük = önce). (dx,dz): oyuncunun chunk'ından (kesirli) fark; (fx,fz): birim bakış yönü (xz).
 * Yakındaki chunk'lar (≤1.5) mutlak öncelik alır (ayağın altı hemen dolsun); önde olanlar arkadakilerden ucuzdur.
 */
export function chunkPriority(dx, dz, fx, fz) {
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1e-6) return 0;
  if (d <= 1.5) return d * 0.2;
  const c = (dx * fx + dz * fz) / d; // -1..1
  return d * (1.15 - 0.45 * c);
}

/**
 * Frustum düzlemleri: m = proj * view (sütun-ana, three Matrix4.elements düzeni). out: Float64Array(24) [a,b,c,d]×6.
 * Düzlem normali içeri bakar; nokta içeride ⇔ a*x+b*y+c*z+d ≥ 0.
 */
const _m = new Float64Array(16);
export function frustumPlanes(projEl, viewEl, out) {
  const a = projEl;
  const b = viewEl;
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      _m[c * 4 + r] = s;
    }
  }
  const m = _m;
  const set = (i, x, y, z, w) => {
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    out[i * 4] = x / l;
    out[i * 4 + 1] = y / l;
    out[i * 4 + 2] = z / l;
    out[i * 4 + 3] = w / l;
  };
  set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]); // sol
  set(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]); // sağ
  set(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]); // alt
  set(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]); // üst
  set(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]); // yakın
  set(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]); // uzak
  return out;
}

/** Küre (merkez x,y,z; yarıçap r) frustum içinde ya da kesişiyor mu? */
export function sphereVisible(planes, x, y, z, r) {
  for (let i = 0; i < 6; i++) {
    const o = i * 4;
    if (planes[o] * x + planes[o + 1] * y + planes[o + 2] * z + planes[o + 3] < -r) return false;
  }
  return true;
}

/**
 * Kutu frustum testi (p-köşe): kutu bir düzlemin tamamen dışındaysa görünmez. Chunk mesh'i yatayda 16×16 ama dikeyde çok uzun
 * olabileceğinden küre testi (yarıçap = yarı köşegen) gereksiz çok chunk'ı geçirir; bu test dar kutuyu kullanır.
 */
export function boxVisible(planes, box) {
  for (let i = 0; i < 6; i++) {
    const o = i * 4;
    const a = planes[o];
    const b = planes[o + 1];
    const c = planes[o + 2];
    const x = a >= 0 ? box[3] : box[0];
    const y = b >= 0 ? box[4] : box[1];
    const z = c >= 0 ? box[5] : box[2];
    if (a * x + b * y + c * z + planes[o + 3] < 0) return false;
  }
  return true;
}

/** Nokta (x,y,z) ile kutu arasındaki en kısa mesafe (içerideyse 0). */
export function boxDistance(box, x, y, z) {
  const dx = x < box[0] ? box[0] - x : x > box[3] ? x - box[3] : 0;
  const dy = y < box[1] ? box[1] - y : y > box[4] ? y - box[4] : 0;
  const dz = z < box[2] ? box[2] - z : z > box[5] ? z - box[5] : 0;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Dizi içinde score alanına göre artan sırala (yerinde). */
export function sortByScore(arr) {
  arr.sort((a, b) => a.score - b.score);
  return arr;
}

/** Kapalı aralıkta sıkıştır. */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** İşlem süresi için üstel hareketli ortalama. */
export function ema(prev, sample, k = 0.2) {
  return prev <= 0 ? sample : prev + (sample - prev) * k;
}
