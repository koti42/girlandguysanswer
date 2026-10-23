/*
 * KEŞİF render — yaratık geometri araç takımı.
 *
 * Yaratıklar küp değil, pürüzsüz ilkellerden (süperelipsoid, devir yüzeyi, tüp, kristal, levha) kurulur
 * ve her kemik (animasyon düğümü) için TEK bir köşe-renkli ağa birleştirilir (çizim çağrısı az).
 * Gölgeleme köşe rengine pişirilir (alta bakan yüzler koyu, hafif doku gürültüsü).
 *
 * three bu modüle parametre olarak verilir (getKit(THREE)); böylece node'da testte ve tarayıcıda aynı kod çalışır.
 * Geometri önbelleği türe/varyanta/detaya göre paylaşılır (sayaçlı); malzemeler model başına klonlanır
 * (vuruş parlaması ve ölüm çözülmesi her yaratıkta bağımsız olsun diye).
 *
 * Eksenler: +Y yukarı, ön = -Z, sağ = +X. Pozitif rotation.x, aşağı sarkan bir uzvun ucunu öne (-Z) savurur.
 */

import {
  DETAIL_Q, TAU, clamp, hash1, lerp,
} from './mobMath.js';
import { createRigRuntime } from './mobRig.js';

export * from './mobMath.js';

const kits = new WeakMap();

/** three modül nesnesine bağlı araç takımı (modül başına bir kez kurulur). */
export function getKit(THREE) {
  let kit = kits.get(THREE);
  if (!kit) {
    kit = buildKit(THREE);
    kits.set(THREE, kit);
  }
  return kit;
}

function buildKit(THREE) {
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler();
  const V = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const DIR = new THREE.Vector3();
  const colorCache = new Map();
  const tmpColor = new THREE.Color();

  /** hex (sRGB) → [r,g,b] doğrusal; dizi verilirse olduğu gibi. */
  function rgb(c) {
    if (Array.isArray(c)) return c;
    let v = colorCache.get(c);
    if (!v) {
      tmpColor.setHex(c);
      v = [tmpColor.r, tmpColor.g, tmpColor.b];
      colorCache.set(c, v);
    }
    return v;
  }
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  /* ---------------------------------------------------------------- yüzey üreticileri */

  /**
   * Halka ızgarası → {P, I}. rings[j] = {pole:[x,y,z]} | {pts:[x,y,z,...]} (W nokta).
   * Aşağıdan yukarıya, açı arttıkça (cos, sin) → dış yüzey normalleri dışa bakar.
   * closed: son halka ilk halkaya bağlanır (simit).
   */
  function ringGrid(rings, W, closed) {
    const P = [];
    const I = [];
    const start = [];
    for (let j = 0; j < rings.length; j++) {
      start.push(P.length / 3);
      const r = rings[j];
      if (r.pole) P.push(r.pole[0], r.pole[1], r.pole[2]);
      else for (let k = 0; k < r.pts.length; k++) P.push(r.pts[k]);
    }
    const jmax = closed ? rings.length : rings.length - 1;
    for (let j = 0; j < jmax; j++) {
      const j2 = (j + 1) % rings.length;
      const A = rings[j];
      const B = rings[j2];
      const sa = start[j];
      const sb = start[j2];
      for (let w = 0; w < W; w++) {
        const w2 = (w + 1) % W;
        if (A.pole && B.pole) continue;
        if (A.pole) I.push(sa, sb + w, sb + w2);
        else if (B.pole) I.push(sa + w, sb, sa + w2);
        else {
          const a = sa + w;
          const b = sa + w2;
          const c = sb + w;
          const d = sb + w2;
          I.push(a, c, b, b, c, d);
        }
      }
    }
    return { P, I };
  }

  /** Normalleri yüz toplamıyla hesaplar (yumuşak). */
  function smoothNormals(P, I) {
    const N = new Float32Array(P.length);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3;
      const b = I[t + 1] * 3;
      const c = I[t + 2] * 3;
      const ux = P[b] - P[a];
      const uy = P[b + 1] - P[a + 1];
      const uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a];
      const vy = P[c + 1] - P[a + 1];
      const vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz;
      N[b] += nx; N[b + 1] += ny; N[b + 2] += nz;
      N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    for (let i = 0; i < N.length; i += 3) {
      const l = Math.hypot(N[i], N[i + 1], N[i + 2]);
      if (l < 1e-12) { N[i] = 0; N[i + 1] = 1; N[i + 2] = 0; } else { N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
    }
    return N;
  }

  const sgnPow = (v, e) => (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), e);

  class MeshBuilder {
    /** opts: {glow:boolean (gölgesiz/HDR), q:detay çarpanı} */
    constructor(opts = {}) {
      this.glow = !!opts.glow;
      this.q = opts.q || 1;
      this.pos = [];
      this.nor = [];
      this.col = [];
      this.idx = [];
    }

    get vertexCount() { return this.pos.length / 3; }
    get triangleCount() { return this.idx.length / 3; }
    /** Detay çarpanıyla ölçeklenmiş kesit sayısı. */
    seg(n, min = 5) { return Math.max(min, Math.round(n * this.q)); }

    /* Ortak: ölçek → normal → döndür/taşı → renk → ekle. */
    _commit(P, I, o) {
      let Pf = P;
      let If = I;
      const s = o.s;
      if (s) {
        const sx = typeof s === 'number' ? s : s[0];
        const sy = typeof s === 'number' ? s : s[1];
        const sz = typeof s === 'number' ? s : s[2];
        for (let i = 0; i < P.length; i += 3) { P[i] *= sx; P[i + 1] *= sy; P[i + 2] *= sz; }
      }
      let N;
      if (o.flat) {
        Pf = [];
        If = [];
        N = [];
        for (let t = 0; t < I.length; t += 3) {
          const a = I[t] * 3;
          const b = I[t + 1] * 3;
          const c = I[t + 2] * 3;
          const ux = P[b] - P[a];
          const uy = P[b + 1] - P[a + 1];
          const uz = P[b + 2] - P[a + 2];
          const vx = P[c] - P[a];
          const vy = P[c + 1] - P[a + 1];
          const vz = P[c + 2] - P[a + 2];
          let nx = uy * vz - uz * vy;
          let ny = uz * vx - ux * vz;
          let nz = ux * vy - uy * vx;
          const l = Math.hypot(nx, ny, nz);
          if (l < 1e-12) continue; // dejenere yüz (kutup halkası)
          nx /= l; ny /= l; nz /= l;
          const base = Pf.length / 3;
          Pf.push(P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2]);
          N.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
          If.push(base, base + 1, base + 2);
        }
      } else {
        N = smoothNormals(P, I);
      }
      if (o.q) Q.copy(o.q);
      else if (o.rot) { E.set(o.rot[0], o.rot[1], o.rot[2], 'XYZ'); Q.setFromEuler(E); } else Q.identity();
      const p = o.p || [0, 0, 0];
      const n = Pf.length / 3;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 1; i < Pf.length; i += 3) {
        if (Pf[i] < minY) minY = Pf[i];
        if (Pf[i] > maxY) maxY = Pf[i];
      }
      const spanY = maxY - minY || 1;
      const cTop = rgb(o.c === undefined ? 0xffffff : o.c);
      const cBot = o.c2 === undefined ? cTop : rgb(o.c2);
      const gain = this.glow ? (o.i === undefined ? 1 : o.i) : 1;
      const ao = this.glow ? 0 : (o.ao === undefined ? 0.34 : o.ao);
      const noise = this.glow ? 0 : (o.noise === undefined ? 0.025 : o.noise);
      const base = this.pos.length / 3;
      for (let i = 0; i < n; i++) {
        const x = Pf[i * 3];
        const y = Pf[i * 3 + 1];
        const z = Pf[i * 3 + 2];
        V.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).applyQuaternion(Q);
        const nx = V.x;
        const ny = V.y;
        const nz = V.z;
        let col;
        if (o.cfn) {
          const r = o.cfn(x, y, z, nx, ny, nz);
          col = rgb(r);
        } else if (o.c2 === undefined) col = cTop;
        else col = mix3(cBot, cTop, (y - minY) / spanY);
        V.set(x, y, z).applyQuaternion(Q);
        const wx = V.x + p[0];
        const wy = V.y + p[1];
        const wz = V.z + p[2];
        let m = gain;
        if (ao > 0) m *= 1 - ao * (0.5 - 0.5 * ny);
        if (noise > 0) m *= 1 + (hash1(wx * 13.7 + wy * 7.3 + wz * 19.1) - 0.5) * 2 * noise;
        this.pos.push(wx, wy, wz);
        this.nor.push(nx, ny, nz);
        this.col.push(col[0] * m, col[1] * m, col[2] * m);
      }
      for (let i = 0; i < If.length; i++) this.idx.push(If[i] + base);
      return this;
    }

    /**
     * Süperelipsoid (e=1 elipsoid, e<1 yuvarlak kutu). o: {p,rot,s,c,c2,e,w,h,cfn,flat,ao,noise,i}.
     * e tek sayı ya da [enlem, boylam].
     */
    ellipsoid(rx, ry, rz, o = {}) {
      const W = this.seg(o.w || 18);
      const H = this.seg(o.h || 11, 3);
      const e1 = Array.isArray(o.e) ? o.e[0] : (o.e === undefined ? 1 : o.e);
      const e2 = Array.isArray(o.e) ? o.e[1] : (o.e === undefined ? 1 : o.e);
      const rings = [{ pole: [0, -ry, 0] }];
      for (let j = 1; j < H; j++) {
        const v = -Math.PI / 2 + (j * Math.PI) / H;
        const cv = sgnPow(Math.cos(v), e1);
        const sv = sgnPow(Math.sin(v), e1);
        const pts = [];
        for (let w = 0; w < W; w++) {
          const u = (w * TAU) / W;
          pts.push(rx * cv * sgnPow(Math.cos(u), e2), ry * sv, rz * cv * sgnPow(Math.sin(u), e2));
        }
        rings.push({ pts });
      }
      rings.push({ pole: [0, ry, 0] });
      const g = ringGrid(rings, W, false);
      return this._commit(g.P, g.I, o);
    }

    /**
     * Devir yüzeyi (Y ekseni): profile = [[yarıçap, y], ...] aşağıdan yukarıya.
     * o.rad(açı, halkaIndeksi) → yarıçap çarpanı (tırtıklı etek, yaprak vb.). o.closed: simit.
     */
    lathe(profile, o = {}) {
      const W = o.sides ? o.sides : this.seg(o.w || 14);
      const rings = [];
      for (let j = 0; j < profile.length; j++) {
        const r = profile[j][0];
        const y = profile[j][1];
        if (r < 1e-6 && !o.closed) rings.push({ pole: [0, y, 0] });
        else {
          const pts = [];
          for (let w = 0; w < W; w++) {
            const u = (w * TAU) / W;
            const m = o.rad ? o.rad(u, j) : 1;
            pts.push(r * m * Math.cos(u), y, r * m * Math.sin(u));
          }
          rings.push({ pts });
        }
      }
      const g = ringGrid(rings, W, !!o.closed);
      return this._commit(g.P, g.I, o);
    }

    /** İki nokta arası yuvarlak uçlu konik uzuv. */
    limb(p0, p1, r0, r1, o = {}) {
      DIR.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const L = DIR.length();
      if (L < 1e-6) return this;
      DIR.divideScalar(L);
      const cap = Math.max(2, this.seg(o.cap || 4, 2));
      const prof = [];
      for (let k = 0; k <= cap; k++) {
        const a = -Math.PI / 2 + (k * Math.PI / 2) / cap;
        prof.push([r0 * Math.cos(a), r0 * Math.sin(a)]);
      }
      const mid = o.mid || 0;
      for (let k = 1; k <= mid; k++) {
        const t = k / (mid + 1);
        prof.push([lerp(r0, r1, t) * (o.bulge ? 1 + o.bulge * Math.sin(t * Math.PI) : 1), L * t]);
      }
      for (let k = 0; k <= cap; k++) {
        const a = (k * Math.PI / 2) / cap;
        prof.push([r1 * Math.cos(a), L + r1 * Math.sin(a)]);
      }
      const q = new THREE.Quaternion().setFromUnitVectors(UP, DIR);
      return this.lathe(prof, { ...o, q, p: p0 });
    }

    /** Sivri koni: p0 taban merkezi, p1 uç. */
    spike(p0, p1, r, o = {}) {
      DIR.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const L = DIR.length();
      if (L < 1e-6) return this;
      DIR.divideScalar(L);
      const prof = [[0, 0], [r, 0]];
      const mid = o.mid || 0;
      for (let k = 1; k <= mid; k++) {
        const t = k / (mid + 1);
        prof.push([r * (1 - t) * (o.belly ? 1 + o.belly * Math.sin(t * Math.PI) : 1), L * t]);
      }
      prof.push([0, L]);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, DIR);
      return this.lathe(prof, { w: 8, ...o, q, p: p0 });
    }

    /**
     * Yol boyunca tüp. points: [[x,y,z],...]; radii: sayı | dizi | (t)=>r. Uçlar yuvarlak kapanır.
     * Paralel taşıma çatısı (burulma yok).
     */
    tube(points, radii, o = {}) {
      const W = this.seg(o.w || 8, 4);
      const n = points.length;
      if (n < 2) return this;
      const rad = typeof radii === 'function' ? radii : Array.isArray(radii)
        ? (t) => {
          const f = t * (radii.length - 1);
          const i = Math.min(radii.length - 2, Math.floor(f));
          return lerp(radii[i], radii[i + 1], f - i);
        }
        : () => radii;
      const rings = [];
      let nx = 0;
      let ny = 0;
      let nz = 0;
      const frames = [];
      for (let i = 0; i < n; i++) {
        const a = points[Math.max(0, i - 1)];
        const b = points[Math.min(n - 1, i + 1)];
        let tx = b[0] - a[0];
        let ty = b[1] - a[1];
        let tz = b[2] - a[2];
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl; ty /= tl; tz /= tl;
        if (i === 0) {
          // başlangıç normali: tanjanta en az paralel eksen
          const ax = Math.abs(tx) < 0.8 ? 1 : 0;
          const ay = ax ? 0 : 1;
          const d = ax * tx + ay * ty;
          nx = ax - tx * d; ny = ay - ty * d; nz = -tz * d;
        } else {
          const d = nx * tx + ny * ty + nz * tz;
          nx -= tx * d; ny -= ty * d; nz -= tz * d;
        }
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        frames.push([tx, ty, tz, nx, ny, nz]);
      }
      const cap0 = rad(0);
      const f0 = frames[0];
      rings.push({ pole: [points[0][0] - f0[0] * cap0 * 0.7, points[0][1] - f0[1] * cap0 * 0.7, points[0][2] - f0[2] * cap0 * 0.7] });
      for (let i = 0; i < n; i++) {
        const f = frames[i];
        const r = Math.max(0.0005, rad(i / (n - 1)));
        // B = N × T
        const bx = f[4] * f[2] - f[5] * f[1];
        const by = f[5] * f[0] - f[3] * f[2];
        const bz = f[3] * f[1] - f[4] * f[0];
        const pts = [];
        for (let w = 0; w < W; w++) {
          const u = (w * TAU) / W;
          const c = Math.cos(u) * r;
          const s = Math.sin(u) * r;
          pts.push(points[i][0] + f[3] * c + bx * s, points[i][1] + f[4] * c + by * s, points[i][2] + f[5] * c + bz * s);
        }
        rings.push({ pts });
      }
      const capN = rad(1);
      const fl = frames[n - 1];
      rings.push({ pole: [points[n - 1][0] + fl[0] * capN * 0.7, points[n - 1][1] + fl[1] * capN * 0.7, points[n - 1][2] + fl[2] * capN * 0.7] });
      const g = ringGrid(rings, W, false);
      return this._commit(g.P, g.I, o);
    }

    /** Simit (Y ekseni etrafında). R büyük yarıçap, r tüp yarıçapı. */
    torus(R, r, o = {}) {
      const prof = [];
      const m = this.seg(o.m || 8, 4);
      for (let k = 0; k < m; k++) {
        const a = (k * TAU) / m;
        prof.push([R + r * Math.cos(a), r * Math.sin(a)]);
      }
      return this.lathe(prof, { w: o.w || 20, ...o, closed: true });
    }

    /** Yüzeyleri düz gölgeli kristal (altıgen prizma + sivri uç). */
    crystal(len, r, o = {}) {
      const sides = o.sides || 6;
      const tip = o.tip === undefined ? 0.3 : o.tip;
      const prof = [[0, 0], [r * (o.base === undefined ? 0.85 : o.base), 0], [r, len * (1 - tip) * 0.18], [r, len * (1 - tip)], [0, len]];
      return this.lathe(prof, { ...o, sides, flat: true, noise: o.noise === undefined ? 0.03 : o.noise });
    }

    /**
     * Levha (kanat, yaprak, zar): fn(u,v) → [x,y,z]; u,v 0..1; nu×nv bölüm.
     * o.cfn(u,v) yerine _commit'in cfn'si (x,y,z,...) kullanılır; bu yüzden renk için o.cu(u,v) → renk.
     */
    sheet(nu, nv, fn, o = {}) {
      const P = [];
      const I = [];
      const UV = [];
      for (let j = 0; j <= nv; j++) {
        for (let i = 0; i <= nu; i++) {
          const p = fn(i / nu, j / nv);
          P.push(p[0], p[1], p[2]);
          UV.push(i / nu, j / nv);
        }
      }
      const row = nu + 1;
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          const a = j * row + i;
          const b = a + 1;
          const c = a + row;
          const d = c + 1;
          if (o.flip) I.push(a, b, c, b, d, c);
          else I.push(a, c, b, b, c, d);
        }
      }
      const opts = { ...o };
      if (o.cu) {
        // köşe sırası _commit'te korunur (flat değilse) → u,v ile renk eşle
        let k = 0;
        opts.cfn = () => { const r = o.cu(UV[k * 2], UV[k * 2 + 1]); k++; return r; };
        opts.flat = false;
      }
      return this._commit(P, I, opts);
    }

    /** Birikmiş geometriyi BufferGeometry'ye çevirir. */
    build() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
      const big = this.pos.length / 3 > 65535;
      geo.setIndex(new THREE.BufferAttribute(big ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      return geo;
    }
  }

  /* ---------------------------------------------------------------- dinamik tüp (kamçı, sarmaşık, kuyruk) */

  /**
   * Her karede noktaları değişen tüp. pts (Float32Array, (segments+1)*3) doldurulur, refresh() çağrılır.
   * Ayırma yok; renk (taban→uç gradyanı) sabittir.
   */
  class Tendril {
    constructor(o) {
      this.segments = o.segments || 10;
      this.radial = o.radial || 6;
      const S = this.segments;
      const W = this.radial;
      this.pts = new Float32Array((S + 1) * 3);
      this.radii = new Float32Array(S + 1);
      const rf = o.radius || (() => 0.1);
      for (let i = 0; i <= S; i++) this.radii[i] = rf(i / S);
      const nv = (S + 1) * W;
      this.positions = new Float32Array(nv * 3);
      this.normals = new Float32Array(nv * 3);
      const colors = new Float32Array(nv * 3);
      const c0 = rgb(o.color0 === undefined ? 0x4a3a22 : o.color0);
      const c1 = rgb(o.color1 === undefined ? c0 : o.color1);
      const gain = o.gain || 1;
      for (let i = 0; i <= S; i++) {
        const t = i / S;
        for (let w = 0; w < W; w++) {
          const k = (i * W + w) * 3;
          const j = 0.92 + 0.16 * hash1(i * 7.1 + w * 3.3 + (o.seed || 0));
          colors[k] = lerp(c0[0], c1[0], t) * j * gain;
          colors[k + 1] = lerp(c0[1], c1[1], t) * j * gain;
          colors[k + 2] = lerp(c0[2], c1[2], t) * j * gain;
        }
      }
      const idx = [];
      for (let i = 0; i < S; i++) {
        for (let w = 0; w < W; w++) {
          const w2 = (w + 1) % W;
          const a = i * W + w;
          const b = i * W + w2;
          const c = (i + 1) * W + w;
          const d = (i + 1) * W + w2;
          idx.push(a, c, b, b, c, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      this.posAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
      this.norAttr = new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', this.posAttr);
      geo.setAttribute('normal', this.norAttr);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1));
      this.geometry = geo;
      this.triangles = idx.length / 3;
      this.mesh = new THREE.Mesh(geo, o.material);
      this.mesh.frustumCulled = false;
      this.mesh.name = o.name || 'tendril';
      // Başlangıç: +Y'ye düz uzan (geçerli sınırlar için)
      for (let i = 0; i <= S; i++) {
        this.pts[i * 3 + 1] = (i / S) * (o.length || 1);
      }
      this.refresh();
    }

    set(i, x, y, z) {
      const k = i * 3;
      this.pts[k] = x; this.pts[k + 1] = y; this.pts[k + 2] = z;
    }

    refresh() {
      const S = this.segments;
      const W = this.radial;
      const p = this.pts;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (let i = 0; i <= S; i++) {
        const a = Math.max(0, i - 1) * 3;
        const b = Math.min(S, i + 1) * 3;
        let tx = p[b] - p[a];
        let ty = p[b + 1] - p[a + 1];
        let tz = p[b + 2] - p[a + 2];
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl; ty /= tl; tz /= tl;
        if (i === 0) {
          const ax = Math.abs(tx) < 0.8 ? 1 : 0;
          const ay = ax ? 0 : 1;
          const d = ax * tx + ay * ty;
          nx = ax - tx * d; ny = ay - ty * d; nz = -tz * d;
        } else {
          const d = nx * tx + ny * ty + nz * tz;
          nx -= tx * d; ny -= ty * d; nz -= tz * d;
        }
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        const bx = ny * tz - nz * ty;
        const by = nz * tx - nx * tz;
        const bz = nx * ty - ny * tx;
        const r = this.radii[i];
        const cx = p[i * 3];
        const cy = p[i * 3 + 1];
        const cz = p[i * 3 + 2];
        for (let w = 0; w < W; w++) {
          const u = (w * TAU) / W;
          const c = Math.cos(u);
          const s = Math.sin(u);
          const dx = nx * c + bx * s;
          const dy = ny * c + by * s;
          const dz = nz * c + bz * s;
          const k = (i * W + w) * 3;
          this.positions[k] = cx + dx * r;
          this.positions[k + 1] = cy + dy * r;
          this.positions[k + 2] = cz + dz * r;
          this.normals[k] = dx;
          this.normals[k + 1] = dy;
          this.normals[k + 2] = dz;
        }
      }
      this.posAttr.needsUpdate = true;
      this.norAttr.needsUpdate = true;
      // Sınır küresi: taban noktası + en uzak nokta (ucuz, ayırmasız)
      const bs = this.geometry.boundingSphere || (this.geometry.boundingSphere = new THREE.Sphere());
      let mx = 0;
      let my = 0;
      let mz = 0;
      for (let i = 0; i <= S; i++) { mx += p[i * 3]; my += p[i * 3 + 1]; mz += p[i * 3 + 2]; }
      mx /= S + 1; my /= S + 1; mz /= S + 1;
      let rr = 0;
      for (let i = 0; i <= S; i++) rr = Math.max(rr, Math.hypot(p[i * 3] - mx, p[i * 3 + 1] - my, p[i * 3 + 2] - mz));
      bs.center.set(mx, my, mz);
      bs.radius = rr + 0.3;
    }

    dispose() {
      this.geometry.dispose();
    }
  }


  const kit = {
    THREE,
    MeshBuilder,
    Tendril,
    rgb,
  };
  Object.assign(kit, createRigRuntime(THREE, kit));
  return kit;
}

/* ------------------------------------------------------------------------------------------------
 * Uzuv yardımcıları (iki kemikli bacak/kol) — builder dosyaları ortak kullanır.
 * ---------------------------------------------------------------------------------------------- */

/**
 * İki kemikli uzuv kurar: {hip, knee}. Uzuv aşağı (-Y) sarkar; build ile üst/alt parçalar verilir.
 * upper(b,g) kalça düğümüne (pivot 0,0,0), lower(b,g) diz düğümüne (pivot 0,-upperLen,0) çizilir.
 */
export function makeLimb(rig, name, parent, pivot, upperLen, buildUpper, buildLower, o = {}) {
  const hip = rig.part(name + 'Hip', parent, pivot, buildUpper, { pk: o.pkUpper || name + 'Hip', mats: o.mats });
  const knee = rig.part(name + 'Knee', hip, [0, -upperLen, 0], buildLower, { pk: o.pkLower || name + 'Knee', mats: o.mats });
  return { hip, knee };
}

/**
 * Yürüyüş salınımı: kalça öne/arkaya, diz kalkarken bükülür.
 * phase: yürüyüş fazı (rad), amp: kalça genliği, kneeAmp: diz bükülmesi, sign: dizin büküm yönü.
 */
export function swingLimb(limb, phase, amp, kneeAmp, kneeSign = 1, rest = 0) {
  limb.hip.rotation.x = rest + Math.sin(phase) * amp;
  const lift = Math.max(0, Math.cos(phase));
  limb.knee.rotation.x = -kneeSign * lift * kneeAmp * clamp(amp / 0.05, 0, 1);
}

/**
 * Göz: koyu/renkli küre (ışıklı) + küçük parlak vurgu (ışımalı) → canlı bakış.
 * o: {c, ry, rz, hi:false, glow:true (gözün kendisi ışıma ağında), i (ışıma şiddeti)}
 */
export function eye(b, g, x, y, z, r, o = {}) {
  const rz = r * (o.rz || 0.8);
  if (o.glow) {
    g.ellipsoid(r, r * (o.ry || 1), rz, { p: [x, y, z], c: o.c === undefined ? 0xffffff : o.c, i: o.i || 1.6, w: 8, h: 6 });
  } else {
    b.ellipsoid(r, r * (o.ry || 1), rz, { p: [x, y, z], c: o.c === undefined ? 0x15110f : o.c, w: 8, h: 6, ao: 0, noise: 0 });
  }
  if (o.hi !== false && !o.glow) {
    const sx = x < 0 ? -1 : 1;
    g.ellipsoid(r * 0.3, r * 0.3, r * 0.2, { p: [x - sx * r * 0.12, y + r * 0.34, z - rz * 0.8], c: 0xffffff, i: 1.3, w: 6, h: 4 });
  }
}
