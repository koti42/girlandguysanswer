/*
 * KEŞİF sim/city/interior — YEREL ÇERÇEVE (kapı duvarına göre döndürülmüş/aynalanmış iç mekân koordinatları). Saf, belirlenimci.
 *
 * Her iç mekân, bina planının ayırdığı dikdörtgende (`bp.interior`) YEREL koordinatlarla tasarlanır; çerçeve bunu dünyaya çevirir:
 *   u  : kapı duvarı boyunca SAĞA (içeri bakan oyuncunun sağı), 0..W-1          (ayna açıksa soldan sağa tersine)
 *   v  : kapı duvarından İÇERİ,  0..D-1   (v = -1 kapı duvarının kendisi: sokak kapısı burada)
 *   ly : kat satırı, 0 = ilk hava satırı (y0 = 64), H-1 = en üst hava satırı; tavan satırı = H; zemin satırı = -1
 *   hücre (i,j) [i,i+1)×[j,j+1) kaplar; sürekli nokta (i+0.5, j+0.5) hücre merkezidir.
 * Yerel yön (ly kodu):  0 içeri (+v) · 1 sağ (+u) · 2 kapı duvarına (-v) · 3 sol (-u).   `frame.yaw(ly)` → dünya prop yaw'ı (0:+Z 1:+X 2:-Z 3:-X).
 *
 *  makeFrame(bp, lot, opts?) -> Frame | null     opts {mirror?:bool, h?:number (istenen net yükseklik)}
 *  Frame {face, W, D, H, maxH, mirror, x0,z0,x1,z1 (dünya dikdörtgeni, yarı açık), y0 (=64), floorY (=63), ceilY (=y0+H), bounds {x0,y0,z0,x1,y1,z1},
 *         door {u,w:3,h:3, x,z (duvar hücre merkezi), axis, ok}, adj {l,r,b}, obstacles [{u0,v0,u1,v1, x0,z0,x1,z1}], part,
 *         cell(u,v)->[x,z] · rect(u0,v0,u1,v1)->[x0,z0,x1,z1] · pt(u,v)->[x+.5,z+.5] · local(x,z)->[u,v] · yaw(ly) · inRect(u,v)
 *         isObstacle(u,v) · obstacleAt(u0,v0,u1,v1) (rect içine kırpılmış engeller) · isSolid(u,v) · solidAt(...) (çekirdeğin TAM ayak izi: halka hücreleri dahil) · wx(u,v) · wz(u,v)}
 *
 * Kule çekirdeği (asansör bacası, `bp.core`) ayrılan dikdörtgene taşıyorsa ENGEL (obstacle) olarak bildirilir: o hücrelere yazılmaz, oda/prop
 * planlayıcıları kaçınır. `adj`: dikdörtgenin o kenarı bina dış duvarına bitişik mi (değilse tavan/bölme duvarını iç mekân kendi kurar).
 */

const Y0 = 64;
/* kapı duvarı yüzüne göre: içeri bakan yaw ve sağa bakan yaw */
const YAWS = Object.freeze({ n: [0, 3], s: [2, 1], e: [3, 2], w: [1, 0] });

export const FRAME_FLOOR_Y = Y0 - 1;
export const FRAME_Y0 = Y0;

function tierAtFloor0(bp, part, x, z) {
  const ts = bp.tiers || [];
  for (let q = 0; q < ts.length; q++) {
    const t = ts[q];
    if (t.f0 === 0 && t.part === part && x >= t.x0 && x < t.x0 + t.w && z >= t.z0 && z < t.z0 + t.d) return t;
  }
  for (let q = 0; q < ts.length; q++) if (ts[q].f0 === 0 && x >= ts[q].x0 && x < ts[q].x0 + ts[q].w && z >= ts[q].z0 && z < ts[q].z0 + ts[q].d) return ts[q];
  return null;
}

function maxClearHeight(bp, part, x, z) {
  const vs = bp.volumes || [];
  let best = 0;
  for (let q = 0; q < vs.length; q++) {
    const v = vs[q];
    if (v.f0 !== 0) continue;
    if (x < v.x0 || x >= v.x1 || z < v.z0 || z >= v.z1) continue;
    if (v.part === part || best === 0) best = v.y1 - Y0;
  }
  return best > 0 ? best : 3;
}

class Frame {
  constructor(o) {
    Object.assign(this, o);
  }

  /** yerel hücre → [x, z] (dünya hücre indeksi). */
  cell(u, v) {
    const ru = this.mirror ? this.W - 1 - u : u;
    return this._raw(ru, v);
  }

  _raw(ru, v) {
    switch (this.face) {
      case 'n': return [this.x1 - 1 - ru, this.z0 + v];
      case 's': return [this.x0 + ru, this.z1 - 1 - v];
      case 'e': return [this.x1 - 1 - v, this.z1 - 1 - ru];
      default: return [this.x0 + v, this.z0 + ru];
    }
  }

  wx(u, v) {
    return this.cell(u, v)[0];
  }

  wz(u, v) {
    return this.cell(u, v)[1];
  }

  pt(u, v) {
    const c = this.cell(Math.floor(u), Math.floor(v));
    return [c[0] + 0.5, c[1] + 0.5];
  }

  /** Sürekli yerel nokta (u,v) (hücre köşesi tamsayı) → dünya sürekli [x,z]. */
  point(u, v) {
    const a = this.cell(Math.floor(u), Math.floor(v));
    const fu = u - Math.floor(u);
    const fv = v - Math.floor(v);
    // hücre içi ofset: yerel +u / +v yönlerinin dünya karşılıkları
    const eu = this.dir(1);
    const ev = this.dir(0);
    // hücre yerel köşesi (u,v) → dünya köşesi: hücrenin yerel (0,0) köşesi
    const cx = a[0] + (eu[0] < 0 || ev[0] < 0 ? 1 : 0);
    const cz = a[1] + (eu[1] < 0 || ev[1] < 0 ? 1 : 0);
    return [cx + eu[0] * fu + ev[0] * fv, cz + eu[1] * fu + ev[1] * fv];
  }

  /** Yerel yön (0 içeri,1 sağ,2 kapı,3 sol) → dünya birim vektörü [dx, dz]. */
  dir(ly) {
    const y = this.yaw(ly);
    return y === 0 ? [0, 1] : y === 1 ? [1, 0] : y === 2 ? [0, -1] : [-1, 0];
  }

  /** Yarı açık yerel dikdörtgen → dünya yarı açık [x0,z0,x1,z1]. */
  rect(u0, v0, u1, v1) {
    const a = this.cell(u0, v0);
    const b = this.cell(u1 - 1, v1 - 1);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]) + 1, Math.max(a[1], b[1]) + 1];
  }

  /** Dünya hücresi → yerel [u, v] (ayna dahil). */
  local(x, z) {
    let ru;
    let v;
    switch (this.face) {
      case 'n': ru = this.x1 - 1 - x; v = z - this.z0; break;
      case 's': ru = x - this.x0; v = this.z1 - 1 - z; break;
      case 'e': ru = this.z1 - 1 - z; v = this.x1 - 1 - x; break;
      default: ru = z - this.z0; v = x - this.x0; break;
    }
    return [this.mirror ? this.W - 1 - ru : ru, v];
  }

  /** Yerel yön kodu → dünya prop yaw'ı. */
  yaw(ly) {
    const base = YAWS[this.face];
    const right = this.mirror ? (base[1] + 2) & 3 : base[1];
    switch (ly & 3) {
      case 0: return base[0];
      case 1: return right;
      case 2: return (base[0] + 2) & 3;
      default: return (right + 2) & 3;
    }
  }

  inRect(u, v) {
    return u >= 0 && u < this.W && v >= 0 && v < this.D;
  }

  /** Çekirdek (tam, kırpılmamış) bloklu hücre mi — halka/komşu hücreler dahil; yazıcılar bununla atlar. */
  isSolid(u, v) {
    const ob = this.solids;
    for (let i = 0; i < ob.length; i++) if (u >= ob[i].u0 && u < ob[i].u1 && v >= ob[i].v0 && v < ob[i].v1) return true;
    return false;
  }

  solidAt(u0, v0, u1, v1) {
    const ob = this.solids;
    for (let i = 0; i < ob.length; i++) if (u0 < ob[i].u1 && u1 > ob[i].u0 && v0 < ob[i].v1 && v1 > ob[i].v0) return true;
    return false;
  }

  isObstacle(u, v) {
    const ob = this.obstacles;
    for (let i = 0; i < ob.length; i++) if (u >= ob[i].u0 && u < ob[i].u1 && v >= ob[i].v0 && v < ob[i].v1) return true;
    return false;
  }

  /** Yerel dikdörtgen [u0,u1)×[v0,v1) bir engelle kesişiyor mu. */
  obstacleAt(u0, v0, u1, v1) {
    const ob = this.obstacles;
    for (let i = 0; i < ob.length; i++) if (u0 < ob[i].u1 && u1 > ob[i].u0 && v0 < ob[i].v1 && v1 > ob[i].v0) return true;
    return false;
  }

  /** Dünya hücresi bu çerçevenin dikdörtgeni içinde mi. */
  inWorldRect(x, z) {
    return x >= this.x0 && x < this.x1 && z >= this.z0 && z < this.z1;
  }
}

/**
 * @param {object} bp planBuilding sonucu (bp.interior + bp.doors[0] gerekir)
 * @param {object} [lot] parsel (şimdilik yalnız kimlik için)
 * @param {{mirror?:boolean, h?:number}} [opts]
 */
export function makeFrame(bp, lot, opts) {
  const o = opts || {};
  const it = bp && bp.interior;
  const door = bp && bp.doors && bp.doors[0];
  if (!it || !door) return null;
  const face = door.face;
  if (!YAWS[face]) return null;
  const x0 = it.x0;
  const z0 = it.z0;
  const x1 = it.x1;
  const z1 = it.z1;
  const alongX = face === 'n' || face === 's';
  const W = alongX ? x1 - x0 : z1 - z0;
  const D = alongX ? z1 - z0 : x1 - x0;
  if (W < 3 || D < 3) return null;
  const mirror = !!o.mirror;
  const part = it.part === undefined ? 0 : it.part;
  const maxH = maxClearHeight(bp, part, door.inside.x, door.inside.z);
  let H = Number.isFinite(o.h) ? Math.floor(o.h) : (it.y1 - it.y0);
  if (!(H >= 3)) H = 3;
  if (H > maxH) H = maxH;
  const t0 = tierAtFloor0(bp, part, door.inside.x, door.inside.z);
  const fr = new Frame({
    face, W, D, H, maxH, mirror, part, lotId: bp.id,
    x0, z0, x1, z1, y0: Y0, floorY: Y0 - 1, ceilY: Y0 + H,
    bounds: { x0, y0: Y0, z0, x1, y1: Y0 + H, z1 },
    door: null, adj: { l: true, r: true, b: true }, obstacles: [], solids: [], tier: t0,
  });
  // sokak kapısı (yerel)
  const dl = fr.local(door.x, door.z);
  fr.door = {
    u: dl[0], w: 3, h: 3, x: door.x, z: door.z, axis: door.axis, face, front: door.front, inside: door.inside, ok: dl[0] - 1 >= 0 && dl[0] + 1 < W,
  };
  // kenar bitişikliği: halka hücresi (u=-1 / u=W / v=D) kademenin dış duvar halkasında mı
  if (t0) {
    const rim = (x, z) => x === t0.x0 || x === t0.x0 + t0.w - 1 || z === t0.z0 || z === t0.z0 + t0.d - 1;
    const mid = (D / 2) | 0;
    const mu = (W / 2) | 0;
    const side = (cu, cv) => {
      const [x, z] = fr.cell(cu, cv);
      return rim(x, z);
    };
    fr.adj = { l: side(-1, mid), r: side(W, mid), b: side(mu, D) };
  }
  // kule çekirdeği engelleri
  const cores = bp.core || [];
  for (let q = 0; q < cores.length; q++) {
    const c = cores[q];
    if (c.part !== undefined && c.part !== part) continue;
    if (c.x0 >= x1 || c.x1 <= x0 || c.z0 >= z1 || c.z1 <= z0) continue;
    const ix0 = Math.max(c.x0, x0);
    const iz0 = Math.max(c.z0, z0);
    const ix1 = Math.min(c.x1, x1);
    const iz1 = Math.min(c.z1, z1);
    const a = fr.local(ix0, iz0);
    const b = fr.local(ix1 - 1, iz1 - 1);
    const sa = fr.local(c.x0, c.z0);
    const sb = fr.local(c.x1 - 1, c.z1 - 1);
    fr.solids.push({
      u0: Math.min(sa[0], sb[0]), v0: Math.min(sa[1], sb[1]), u1: Math.max(sa[0], sb[0]) + 1, v1: Math.max(sa[1], sb[1]) + 1,
    });
    fr.obstacles.push({
      u0: Math.min(a[0], b[0]), v0: Math.min(a[1], b[1]), u1: Math.max(a[0], b[0]) + 1, v1: Math.max(a[1], b[1]) + 1,
      x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1,
    });
  }
  return fr;
}
