/*
 * KEŞİF render/city — YAYA GEOMETRİ YAPICI KİTİ (SAF: three/DOM yok; düğümde test edilir). crowdGeo.js bu kitle vatandaş/şemsiye modellerini kurar.
 *
 * Model uzayı: +X sağ, +Y yukarı, −Z ileri (yaw 0 = −Z), orijin = ayak tabanı ortası.
 * Köşe öznitelikleri (Float32): position(3) normal(3) aMat(4: slot, parça, varyant, bayrak) aPivot(3); indeks Uint16.
 *   slot    → gölgelendirici malzeme (crowdGeo.SLOT)
 *   parça   → 0 gövde/kök · 1 sol bacak · 2 sağ bacak · 3 sol kol · 4 sağ kol · 5 baş (boyun ekseni)
 *   varyant → 0 her zaman; aksi grup·16 + değer (grup 1 saç · 2 şapka · 3 aksesuar · 4 üst stili · 5 alt stili): örnek özniteliği seçtiğinden farklıysa köşe gizlenir
 *   bayrak  → 1 alt uzuv (diz/dirsek bükülür) · 2 el/ayak ucu
 *   aPivot  → parçanın dönme ekseni (kalça/omuz/boyun); alt uzuv ekseni gölgelendiricide pivot − (0, uzuv boyu, 0)
 */

export class CG {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.mat = [];
    this.piv = [];
    this.idx = [];
    this.cur = {
      slot: 0, part: 0, variant: 0, flags: 0, pivot: [0, 0, 0],
    };
  }

  set(o) {
    const c = this.cur;
    if (o.slot !== undefined) c.slot = o.slot;
    if (o.part !== undefined) c.part = o.part;
    if (o.variant !== undefined) c.variant = o.variant;
    if (o.flags !== undefined) c.flags = o.flags;
    if (o.pivot !== undefined) c.pivot = o.pivot;
    return this;
  }

  get tris() {
    return this.idx.length / 3;
  }

  get verts() {
    return this.pos.length / 3;
  }

  vert(x, y, z, nx, ny, nz) {
    const c = this.cur;
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.mat.push(c.slot, c.part, c.variant, c.flags);
    this.piv.push(c.pivot[0], c.pivot[1], c.pivot[2]);
    return this.pos.length / 3 - 1;
  }

  tri(a, b, c) {
    this.idx.push(a, b, c);
  }

  /** Düz gölgeli kutu (24 köşe, 12 üçgen). sx,sy,sz = tam boyutlar; taper: üst yüzü (1−taper) ölçekler; rotY: y ekseninde dönüş (rad). */
  box(cx, cy, cz, sx, sy, sz, o) {
    const op = o || {};
    const tp = op.taper || 0;
    const rot = op.rotY || 0;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const tx = 1 - tp;
    const P = (x, y, z) => {
      const k = y > 0 ? tx : 1;
      const px = x * k;
      const pz = z * k;
      return [cx + px * cs + pz * sn, cy + y, cz - px * sn + pz * cs];
    };
    const faces = [
      [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1]],
      [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1]],
      [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [1, 0, 0]],
      [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-1, 0, 0]],
      [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz], [0, 1, 0]],
      [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [0, -1, 0]],
    ];
    for (let f = 0; f < 6; f++) {
      const F = faces[f];
      const n = F[4];
      const nx = n[0] * cs + n[2] * sn;
      const nz = -n[0] * sn + n[2] * cs;
      const i0 = this.vert(...P(F[0][0], F[0][1], F[0][2]), nx, n[1], nz);
      const i1 = this.vert(...P(F[1][0], F[1][1], F[1][2]), nx, n[1], nz);
      const i2 = this.vert(...P(F[2][0], F[2][1], F[2][2]), nx, n[1], nz);
      const i3 = this.vert(...P(F[3][0], F[3][1], F[3][2]), nx, n[1], nz);
      this.tri(i0, i1, i2);
      this.tri(i0, i2, i3);
    }
    return this;
  }

  /**
   * Halka dizisi (loft). rings: [{y, cx, cz, rx, rz}] (alttan üste ya da tersi; yön otomatik düzeltilir: dış normal dışarı). n: kenar sayısı. cap: 'top'|'bottom'|'both'|'none'.
   * Pürüzsüz normaller (komşu köşelerden). a0/a1: yay aralığı (rad; verilmezse tam daire; kısmi halka açık bırakır). Başlangıç açısı 0 = +X, π/2 = +Z (arka).
   */
  loft(rings, n, o) {
    const op = o || {};
    const cap = op.cap || 'none';
    const a0 = op.a0 === undefined ? 0 : op.a0;
    const a1 = op.a1 === undefined ? Math.PI * 2 : op.a1;
    const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
    const cols = full ? n : n + 1;
    const R = rings.length;
    const grid = [];
    for (let j = 0; j < R; j++) {
      const r = rings[j];
      const row = [];
      for (let k = 0; k < cols; k++) {
        const a = a0 + ((a1 - a0) * k) / n;
        row.push([r.cx + Math.cos(a) * r.rx, r.y, r.cz + Math.sin(a) * r.rz]);
      }
      grid.push(row);
    }
    // normaller: komşu farkları
    const nrm = [];
    for (let j = 0; j < R; j++) {
      const row = [];
      for (let k = 0; k < cols; k++) {
        const jp = Math.min(R - 1, j + 1);
        const jm = Math.max(0, j - 1);
        const kp = full ? (k + 1) % cols : Math.min(cols - 1, k + 1);
        const km = full ? (k - 1 + cols) % cols : Math.max(0, k - 1);
        const tv = [grid[jp][k][0] - grid[jm][k][0], grid[jp][k][1] - grid[jm][k][1], grid[jp][k][2] - grid[jm][k][2]];
        const th = [grid[j][kp][0] - grid[j][km][0], grid[j][kp][1] - grid[j][km][1], grid[j][kp][2] - grid[j][km][2]];
        // dış normal: th × tv (halka saat yönünün tersi artan açı, yukarı artan y için dışarı)
        let nx = th[1] * tv[2] - th[2] * tv[1];
        let ny = th[2] * tv[0] - th[0] * tv[2];
        let nz = th[0] * tv[1] - th[1] * tv[0];
        const ctr = [rings[j].cx, rings[j].y, rings[j].cz];
        const out = [grid[j][k][0] - ctr[0], 0, grid[j][k][2] - ctr[2]];
        if (nx * out[0] + ny * out[1] + nz * out[2] < 0) {
          nx = -nx; ny = -ny; nz = -nz;
        }
        if (rings[j].rx < 1e-3 && rings[j].rz < 1e-3) {
          const other = rings[j === 0 ? Math.min(1, R - 1) : j - 1];
          nx = 0; ny = rings[j].y >= other.y ? 1 : -1; nz = 0;
        }
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        row.push([nx / l, ny / l, nz / l]);
      }
      nrm.push(row);
    }
    const base = this.pos.length / 3;
    for (let j = 0; j < R; j++) {
      for (let k = 0; k < cols; k++) {
        const g = grid[j][k];
        const m = nrm[j][k];
        this.vert(g[0], g[1], g[2], m[0], m[1], m[2]);
      }
    }
    const nk = full ? cols : cols - 1;
    for (let j = 0; j < R - 1; j++) {
      for (let k = 0; k < nk; k++) {
        const k2 = (k + 1) % cols;
        const a = base + j * cols + k;
        const b = base + j * cols + k2;
        const c = base + (j + 1) * cols + k2;
        const d = base + (j + 1) * cols + k;
        // sarım: dış yüz görünür (dışa bakan normal ile uyumlu)
        const flip = rings[R - 1].y < rings[0].y ? -1 : 1;
        if (flip > 0) {
          this.tri(a, c, b);
          this.tri(a, d, c);
        } else {
          this.tri(a, b, c);
          this.tri(a, c, d);
        }
      }
    }
    const capRing = (jIdx, up) => {
      const r = rings[jIdx];
      if (!full || r.rx < 1e-4) return;
      const ci = this.vert(r.cx, r.y, r.cz, 0, up, 0);
      const bi = this.pos.length / 3;
      for (let k = 0; k < cols; k++) {
        const g = grid[jIdx][k];
        this.vert(g[0], g[1], g[2], 0, up, 0);
      }
      for (let k = 0; k < cols; k++) {
        const k2 = (k + 1) % cols;
        if (up > 0) this.tri(ci, bi + k2, bi + k);
        else this.tri(ci, bi + k, bi + k2);
      }
    };
    const topIdx = rings[R - 1].y >= rings[0].y ? R - 1 : 0;
    const botIdx = topIdx === 0 ? R - 1 : 0;
    if (cap === 'top' || cap === 'both') capRing(topIdx, 1);
    if (cap === 'bottom' || cap === 'both') capRing(botIdx, -1);
    return this;
  }

  /** Elipsoid (üst yarı: top). nSeg kenar, nRing yarıçap halkası; k0..k1: kutup açısı aralığı (0 = üst kutup, π = alt). */
  ellipsoid(cx, cy, cz, rx, ry, rz, nSeg, nRing, o) {
    const op = o || {};
    const k0 = op.k0 === undefined ? 0 : op.k0;
    const k1 = op.k1 === undefined ? Math.PI : op.k1;
    const rings = [];
    for (let j = 0; j <= nRing; j++) {
      const th = k0 + ((k1 - k0) * j) / nRing;
      const y = cy + Math.cos(th) * ry;
      const r = Math.sin(th);
      rings.push({
        y, cx, cz, rx: Math.max(1e-5, r * rx), rz: Math.max(1e-5, r * rz),
      });
    }
    // aşağıdan yukarıya sırala
    rings.reverse();
    return this.loft(rings, nSeg, { cap: op.cap || 'none', a0: op.a0, a1: op.a1 });
  }

  /** Dikey silindir/koni: y0 (alt) → y1 (üst), r0/r1 yarıçap. */
  cyl(cx, cz, y0, y1, r0, r1, n, o) {
    const op = o || {};
    return this.loft([
      {
        y: y0, cx, cz, rx: r0, rz: op.rz0 || r0,
      },
      {
        y: y1, cx, cz, rx: r1, rz: op.rz1 || r1,
      },
    ], n, { cap: op.cap || 'both' });
  }

  /** Sarımı köşe normallerine uydurur (üçgen yüz normali, köşe normalleri ortalamasına bakar). */
  fixWinding() {
    const P = this.pos;
    const N = this.nrm;
    const I = this.idx;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3;
      const b = I[t + 1] * 3;
      const c = I[t + 2] * 3;
      const ux = P[b] - P[a]; const uy = P[b + 1] - P[a + 1]; const uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a]; const vy = P[c + 1] - P[a + 1]; const vz = P[c + 2] - P[a + 2];
      const fx = uy * vz - uz * vy; const fy = uz * vx - ux * vz; const fz = ux * vy - uy * vx;
      const nx = N[a] + N[b] + N[c]; const ny = N[a + 1] + N[b + 1] + N[c + 1]; const nz = N[a + 2] + N[b + 2] + N[c + 2];
      if (fx * nx + fy * ny + fz * nz < 0) {
        const tmp = I[t + 1];
        I[t + 1] = I[t + 2];
        I[t + 2] = tmp;
      }
    }
    return this;
  }

  finalize() {
    this.fixWinding();
    const position = new Float32Array(this.pos);
    const normal = new Float32Array(this.nrm);
    const aMat = new Float32Array(this.mat);
    const aPivot = new Float32Array(this.piv);
    const index = this.pos.length / 3 > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
    // sınırlar
    let x0 = 1e9; let y0 = 1e9; let z0 = 1e9; let x1 = -1e9; let y1 = -1e9; let z1 = -1e9;
    for (let i = 0; i < position.length; i += 3) {
      if (position[i] < x0) x0 = position[i];
      if (position[i] > x1) x1 = position[i];
      if (position[i + 1] < y0) y0 = position[i + 1];
      if (position[i + 1] > y1) y1 = position[i + 1];
      if (position[i + 2] < z0) z0 = position[i + 2];
      if (position[i + 2] > z1) z1 = position[i + 2];
    }
    return {
      position, normal, aMat, aPivot, index, tris: index.length / 3, verts: position.length / 3, bounds: [x0, y0, z0, x1, y1, z1],
    };
  }
}
