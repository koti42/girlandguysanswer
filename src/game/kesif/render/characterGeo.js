/*
 * KEŞİF karakter geometri araçları (saf; yalnızca three geometri/matematik sınıfları, WebGL yok).
 *
 * Rafine insansı karakter "kutu birleştirme" yerine heykel gibi kurulur:
 *   - sweep: y ekseni boyunca eliptik kesitli, Catmull-Rom ile yumuşatılmış gövde/uzuv/baş yüzeyi,
 *   - ellipsoid: kutupları tek köşe olan, dikişsiz (komşu köşeler paylaşımlı) elipsoit,
 *   - tube: serbest yol boyunca yarıçap profilli boru (saç tutamı, kaş, burun sırtı, parmak),
 *   - SkinBuilder: parçaları tek tamponda toplar, yumuşak normal hesaplar, köşe rengi ve
 *     köşe başına en çok 4 kemik ağırlığı yazar (eklem bölgelerinde yumuşak geçiş).
 *
 * Parça biçimi: { pos:number[], idx:number[] } (üçgen listesi, saat yönünün tersi = dış yüz).
 * Dinlenme pozunda kemik matrisi saf öteleme olduğundan bağlama (bind) ters matrisleri
 * kemiğin dünya konumunun negatifidir; bu dosya yalnızca dinlenme uzayında çalışır.
 */
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/* ------------------------------------------------------------------------------------------------
 * Renk yardımcıları (three sRGB → doğrusal dönüşümünü Color.set ile yapar)
 * ---------------------------------------------------------------------------------------------- */
const _ca = new THREE.Color();
const _cb = new THREE.Color();
export function shade(color, f) {
  return _ca.set(color).multiplyScalar(f).getHex();
}
export function mixHex(a, b, t) {
  return _ca.set(a).lerp(_cb.set(b), t).getHex();
}

/* ------------------------------------------------------------------------------------------------
 * Kesit yeniden örnekleme (Catmull-Rom)
 * ---------------------------------------------------------------------------------------------- */
function cr(p0, p1, p2, p3, u) {
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

/**
 * Anahtar kesitleri {y,rx,rz,cx?,cz?} (y artan) → sub kat daha sık, yumuşak kesit listesi.
 * Yarıçaplar en az 0.0006 (kapak kutbu çökmesin).
 */
export function resampleSections(keys, sub = 3) {
  const n = keys.length;
  const out = [];
  const ch = ['y', 'rx', 'rz', 'cx', 'cz'];
  const val = (k, f) => (f === 'cx' || f === 'cz' ? keys[k][f] || 0 : keys[k][f]);
  for (let i = 0; i < n - 1; i++) {
    const steps = i === n - 2 ? sub : sub; // son parça sonda +1 ile kapanır
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      const sec = {};
      for (let c = 0; c < ch.length; c++) {
        const f = ch[c];
        const p0 = val(Math.max(0, i - 1), f);
        const p1 = val(i, f);
        const p2 = val(i + 1, f);
        const p3 = val(Math.min(n - 1, i + 2), f);
        sec[f] = f === 'y' ? lerp(p1, p2, u) : cr(p0, p1, p2, p3, u);
      }
      out.push(sec);
    }
  }
  const last = keys[n - 1];
  out.push({ y: last.y, rx: last.rx, rz: last.rz, cx: last.cx || 0, cz: last.cz || 0 });
  for (let i = 0; i < out.length; i++) {
    out[i].rx = Math.max(0.0006, out[i].rx);
    out[i].rz = Math.max(0.0006, out[i].rz);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Parçalar
 * ---------------------------------------------------------------------------------------------- */

/**
 * y ekseni boyunca süpürülmüş eliptik yüzey. keys: resampleSections girdisi.
 * opts: seg (radyal bölüm), sub (anahtarlar arası ek örnek), capBottom/capTop (varsayılan true).
 * Halka j=0 +x yönünde başlar, +z'ye doğru döner. Dış yüz normalleri dışarı bakar.
 */
export function sweep(keys, opts = {}) {
  const seg = opts.seg || 14;
  const secs = resampleSections(keys, opts.sub || 3);
  const pos = [];
  const idx = [];
  for (let i = 0; i < secs.length; i++) {
    const s = secs[i];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU;
      pos.push(s.cx + s.rx * Math.cos(a), s.y, s.cz + s.rz * Math.sin(a));
    }
  }
  for (let i = 0; i < secs.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      const c = (i + 1) * seg + j;
      const d = (i + 1) * seg + ((j + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  if (opts.capBottom !== false) {
    const s = secs[0];
    const ci = pos.length / 3;
    pos.push(s.cx, s.y, s.cz);
    for (let j = 0; j < seg; j++) idx.push(ci, j, (j + 1) % seg);
  }
  if (opts.capTop !== false) {
    const k = secs.length - 1;
    const s = secs[k];
    const ci = pos.length / 3;
    pos.push(s.cx, s.y, s.cz);
    for (let j = 0; j < seg; j++) idx.push(ci, k * seg + ((j + 1) % seg), k * seg + j);
  }
  return { pos, idx };
}

/**
 * Orijinde elipsoit (yarıçaplar rx,ry,rz). Kutuplar tek köşe. deform(x,y,z,out) verilirse köşe taşınır.
 */
export function ellipsoid(rx, ry, rz, opts = {}) {
  const seg = opts.seg || 12;
  const rings = opts.rings || 8;
  const pos = [];
  const idx = [];
  const out = [0, 0, 0];
  const put = (x, y, z) => {
    if (opts.deform) {
      out[0] = x; out[1] = y; out[2] = z;
      opts.deform(x, y, z, out);
      pos.push(out[0], out[1], out[2]);
    } else pos.push(x, y, z);
  };
  put(0, ry, 0);
  for (let i = 1; i < rings; i++) {
    const th = (i / rings) * Math.PI;
    const st = Math.sin(th);
    const ct = Math.cos(th);
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU;
      put(rx * st * Math.cos(a), ry * ct, rz * st * Math.sin(a));
    }
  }
  put(0, -ry, 0);
  const bot = pos.length / 3 - 1;
  // üst kapak: kutup 0
  for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
  for (let i = 0; i < rings - 2; i++) {
    for (let j = 0; j < seg; j++) {
      const a = 1 + i * seg + j;
      const b = 1 + i * seg + ((j + 1) % seg);
      const c = 1 + (i + 1) * seg + j;
      const d = 1 + (i + 1) * seg + ((j + 1) % seg);
      // halkalar yukarıdan aşağı: a,b üstte; c,d altta (sweep sargısının eşleniği)
      idx.push(c, a, d, d, a, b);
    }
  }
  const lastRing = 1 + (rings - 2) * seg;
  for (let j = 0; j < seg; j++) idx.push(bot, lastRing + j, lastRing + ((j + 1) % seg));
  return { pos, idx };
}

/**
 * Yol boyunca boru. points: [[x,y,z],...] (≥2), radius: sayı | (t0..1)=>r.
 * cap: 'round' (uçta küçük kubbe tepesi) | 'flat' | 'none'.
 * opts.normalAt(x,y,z,out): yüzey normali verilirse kesit yüzeye yatık şerit olur (kalınlık = r*flat);
 * saç tutamı/kaş gibi yüzeye oturan parçalar için.
 */
export function tube(points, radius, opts = {}) {
  const seg = opts.seg || 8;
  const n = points.length;
  const rf = typeof radius === 'function' ? radius : () => radius;
  const pos = [];
  const idx = [];
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const Bn = new THREE.Vector3();
  const P = new THREE.Vector3();
  const _sn = new THREE.Vector3();
  const nrm = [0, 0, 1];
  const tangentAt = (i, out) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    return out.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  };
  tangentAt(0, T);
  // başlangıç normali: T'ye en dik dünya ekseni
  const ax = Math.abs(T.x) < 0.8 ? [1, 0, 0] : [0, 1, 0];
  N.set(ax[0], ax[1], ax[2]);
  N.addScaledVector(T, -N.dot(T)).normalize();
  const tangents = [];
  for (let i = 0; i < n; i++) {
    tangentAt(i, T);
    tangents.push(T.clone());
    N.addScaledVector(T, -N.dot(T));
    if (N.lengthSq() < 1e-8) N.set(0, 0, 1).addScaledVector(T, -T.z);
    N.normalize();
    Bn.crossVectors(N, T);
    if (opts.normalAt) {
      opts.normalAt(points[i][0], points[i][1], points[i][2], nrm);
      _sn.set(nrm[0], nrm[1], nrm[2]);
      _sn.addScaledVector(T, -_sn.dot(T));
      if (_sn.lengthSq() > 1e-8) {
        Bn.copy(_sn.normalize());
        N.crossVectors(T, Bn).normalize();
      }
    }
    const r = rf(n === 1 ? 0 : i / (n - 1));
    const flat = opts.flat === undefined ? 1 : opts.flat;
    P.set(points[i][0], points[i][1], points[i][2]);
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU;
      const c = Math.cos(a) * r;
      const s = Math.sin(a) * r * flat;
      pos.push(P.x + N.x * c + Bn.x * s, P.y + N.y * c + Bn.y * s, P.z + N.z * c + Bn.z * s);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      const c = (i + 1) * seg + j;
      const d = (i + 1) * seg + ((j + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  const capMode = opts.cap || 'round';
  if (capMode !== 'none') {
    const r0 = rf(0);
    const r1 = rf(1);
    const ext0 = capMode === 'round' ? r0 * 0.7 : 0;
    const ext1 = capMode === 'round' ? r1 * 0.7 : 0;
    const p0 = points[0];
    const ci = pos.length / 3;
    pos.push(p0[0] - tangents[0].x * ext0, p0[1] - tangents[0].y * ext0, p0[2] - tangents[0].z * ext0);
    for (let j = 0; j < seg; j++) idx.push(ci, j, (j + 1) % seg);
    const pe = points[n - 1];
    const te = tangents[n - 1];
    const ce = pos.length / 3;
    pos.push(pe[0] + te.x * ext1, pe[1] + te.y * ext1, pe[2] + te.z * ext1);
    const k = (n - 1) * seg;
    for (let j = 0; j < seg; j++) idx.push(ce, k + ((j + 1) % seg), k + j);
  }
  return { pos, idx };
}

/** Kenar yumuşatmalı kutu benzeri: ellipsoid'in "süper" kuvvetli hali (yuvarlak köşeli blok). */
export function softBox(rx, ry, rz, opts = {}) {
  const p = opts.power || 3;
  return ellipsoid(rx, ry, rz, {
    seg: opts.seg || 12,
    rings: opts.rings || 8,
    deform: (x, y, z, out) => {
      // birim küreye göre normalize et, süper-elips normuyla dışa it
      const nx = x / rx;
      const ny = y / ry;
      const nz = z / rz;
      const l2 = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const lp = Math.pow(Math.pow(Math.abs(nx / l2), p) + Math.pow(Math.abs(ny / l2), p) + Math.pow(Math.abs(nz / l2), p), 1 / p) || 1;
      const k = 1 / lp;
      out[0] = (nx / l2) * k * rx;
      out[1] = (ny / l2) * k * ry;
      out[2] = (nz / l2) * k * rz;
    },
  });
}

/* ------------------------------------------------------------------------------------------------
 * Normal hesabı
 * ---------------------------------------------------------------------------------------------- */
export function computeNormals(pos, idx) {
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a];
    const vy = pos[c + 1] - pos[a + 1];
    const vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    nor[a] += nx; nor[a + 1] += ny; nor[a + 2] += nz;
    nor[b] += nx; nor[b + 1] += ny; nor[b + 2] += nz;
    nor[c] += nx; nor[c + 1] += ny; nor[c + 2] += nz;
  }
  for (let i = 0; i < nor.length; i += 3) {
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1;
    nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l;
  }
  return nor;
}

/* ------------------------------------------------------------------------------------------------
 * Ağırlık üreticileri: (x,y,z) => [[kemikAdı, ağırlık], ...]
 * ---------------------------------------------------------------------------------------------- */
/**
 * Zincir (yukarıdan aşağıya): [{bone}, {bone, y, band}, ...]. i>=1 girdisi, chain[i-1] ile chain[i]
 * arasındaki eklemin y'si ve yarı bant genişliği. Bant içinde smoothstep ile yumuşak geçiş.
 */
export function chainWeights(chain) {
  const n = chain.length;
  const c = new Array(n).fill(0);
  return (x, y) => {
    for (let i = 1; i < n; i++) c[i] = smooth01((chain[i].y + chain[i].band - y) / (2 * chain[i].band));
    const res = [];
    for (let i = 0; i < n; i++) {
      const hi = i === 0 ? 1 : c[i];
      const lo = i === n - 1 ? 0 : c[i + 1];
      const w = hi - lo;
      if (w > 1e-4) res.push([chain[i].bone, w]);
    }
    return res.length ? res : [[chain[n - 1].bone, 1]];
  };
}

/** Taban ağırlıklara ek etki bindirir: extra(x,y,z) → [[kemik,w]]; toplamı (≤1) kadar taban küçülür. */
export function withExtra(base, extra) {
  return (x, y, z) => {
    const e = extra(x, y, z);
    if (!e || !e.length) return base(x, y, z);
    let raw = 0;
    for (let i = 0; i < e.length; i++) raw += e[i][1];
    const s = Math.min(1, raw);
    if (s <= 1e-4) return base(x, y, z);
    const out = base(x, y, z).map((p) => [p[0], p[1] * (1 - s)]);
    for (let i = 0; i < e.length; i++) out.push([e[i][0], (e[i][1] / raw) * s]);
    return out;
  };
}

/* ------------------------------------------------------------------------------------------------
 * SkinBuilder
 * ---------------------------------------------------------------------------------------------- */
const MESH_KEYS = ['body', 'hair', 'gloss', 'glow'];
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();

export class SkinBuilder {
  /** bones: kemik adı dizisi (skinIndex sırası). */
  constructor(bones) {
    this.index = {};
    bones.forEach((b, i) => { this.index[b] = i; });
    this.ch = {};
    MESH_KEYS.forEach((k) => {
      this.ch[k] = { pos: [], nor: [], col: [], si: [], sw: [], skin: [], idx: [] };
    });
    this._c = new THREE.Color();
  }

  /**
   * piece: {pos,idx}. o:
   *   color      hex (varsayılan beyaz)
   *   colorFn    (x,y,z,nx,ny,nz,c:THREE.Color) → c'yi yerinde değiştirir (doğrusal uzay)
   *   weights    kemik adı | (x,y,z)=>[[kemik,w],...]
   *   mesh       'body'|'hair'|'gloss'|'glow'
   *   skin       0..1 (deri alt-yüzey parıltısı maskesi)
   *   xf         {pos:[x,y,z], rot:[x,y,z], scale:n|[x,y,z]} (kemik uzayında değil, dinlenme uzayında)
   *   flat       true → normalleri parça düzeyinde hesaplama yerine köşe başına (varsayılan yumuşak)
   */
  add(piece, o = {}) {
    const ch = this.ch[o.mesh || 'body'];
    const src = piece.pos;
    const nv = src.length / 3;
    const pos = new Array(src.length);
    if (o.xf) {
      const r = o.xf.rot || [0, 0, 0];
      _e.set(r[0], r[1], r[2]);
      _q.setFromEuler(_e);
      const sc = o.xf.scale;
      if (typeof sc === 'number') _s.set(sc, sc, sc);
      else if (sc) _s.set(sc[0], sc[1], sc[2]);
      else _s.set(1, 1, 1);
      const p = o.xf.pos || [0, 0, 0];
      _p.set(p[0], p[1], p[2]);
      _m4.compose(_p, _q, _s);
      for (let i = 0; i < nv; i++) {
        _v.set(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]).applyMatrix4(_m4);
        pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
      }
    } else {
      for (let i = 0; i < src.length; i++) pos[i] = src[i];
    }
    let idx = piece.idx;
    // yansıtmalı ölçek (negatif) üçgen sargısını tersine çevirir: düzelt
    if (o.xf && typeof o.xf.scale !== 'number' && o.xf.scale) {
      const sg = Math.sign(o.xf.scale[0]) * Math.sign(o.xf.scale[1]) * Math.sign(o.xf.scale[2]);
      if (sg < 0) {
        idx = idx.slice();
        for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      }
    }
    const nor = computeNormals(pos, idx);
    const base = ch.pos.length / 3;
    const c = this._c;
    const wf = o.weights === undefined ? 'hips' : o.weights;
    const skin = o.skin || 0;
    for (let i = 0; i < nv; i++) {
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      c.set(o.color === undefined ? 0xffffff : o.color);
      if (o.colorFn) o.colorFn(x, y, z, nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2], c);
      ch.pos.push(x, y, z);
      ch.nor.push(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
      ch.col.push(c.r, c.g, c.b);
      ch.skin.push(skin);
      let pairs = typeof wf === 'string' ? [[wf, 1]] : wf(x, y, z);
      if (pairs.length > 4) {
        pairs = pairs.slice().sort((a, b) => b[1] - a[1]).slice(0, 4);
      }
      let sum = 0;
      for (let k = 0; k < pairs.length; k++) sum += Math.max(0, pairs[k][1]);
      if (sum <= 0) { pairs = [['hips', 1]]; sum = 1; }
      for (let k = 0; k < 4; k++) {
        if (k < pairs.length) {
          const bi = this.index[pairs[k][0]];
          ch.si.push(bi === undefined ? 0 : bi);
          ch.sw.push(Math.max(0, pairs[k][1]) / sum);
        } else {
          ch.si.push(0);
          ch.sw.push(0);
        }
      }
    }
    for (let i = 0; i < idx.length; i++) ch.idx.push(idx[i] + base);
    return this;
  }

  /** → { body, hair, gloss, glow: BufferGeometry|null, triangles } */
  build() {
    const out = { triangles: 0 };
    MESH_KEYS.forEach((k) => {
      const ch = this.ch[k];
      if (!ch.pos.length) { out[k] = null; return; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ch.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(ch.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(ch.col, 3));
      g.setAttribute('aSkin', new THREE.Float32BufferAttribute(ch.skin, 1));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ch.si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(ch.sw, 4));
      g.setIndex(ch.idx.length / 3 > 0 && ch.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(ch.idx, 1) : new THREE.Uint16BufferAttribute(ch.idx, 1));
      g.computeBoundingBox();
      g.computeBoundingSphere();
      out[k] = g;
      out.triangles += ch.idx.length / 3;
    });
    return out;
  }
}
