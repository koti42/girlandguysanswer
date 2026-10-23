/*
 * KEŞİF render/city — ARAÇ GEOMETRİ YAPICI KİTİ (SAF: three/DOM yok; düğümde test edilir). vehicleModels.js, bu kitle kurulan ham dizileri BufferGeometry'ye çevirir.
 *
 * Model uzayı: +X sağ, +Y yukarı, −Z ileri (yaw 0 = −Z), orijin = aracın yatay ortası, y = 0 tekerlek temas düzlemi (fizik `v.y` ile aynı).
 * Köşe öznitelikleri (hepsi Float32): position(3) normal(3) aColor(3, DOĞRUSAL albedo × AO) aMat(4: slot, yayma, bayrak, hasar eşiği) aPivot(3) uv(2).
 *   slot  → SLOT sabitleri (gölgelendirici renk/malzeme seçer)       yayma → temel yayma çarpanı (lamba durumu gölgelendiricide eklenir)
 *   bayrak (bit maskesi) → F_STEER 1 (ön tekerlek yönelir) · F_SPIN 2 (tekerlek döner) · F_DRIVER 4 (sürücü; kapatılabilir) · F_INTERIOR 8 (iç mekân) · F_BIKE 16 (motor: yatış)
 *   aPivot → tekerlek göbeği / yönelme ekseni noktası (F_STEER/F_SPIN köşeleri)
 *   hasar eşiği → köşe konumundan türeyen 0..1 sayı; gölgelendirici `eşik < hasar` olan köşelerde çizik/leke rengi karışımı yapar (yalnız renk)
 * İki katman: 'solid' (opak) ve 'glass' (yarı saydam cam).
 */

export const SLOT = Object.freeze({
  BODY: 0, ACCENT: 1, TRIM: 2, GLASS: 3, NEON: 4, HEAD: 5, TAIL: 6, REVERSE: 7, INDICATOR: 8, TYRE: 9, RIM: 10, PLATE: 11, CHROME: 12, SKIN: 13,
  CLOTH: 14, INTERIOR: 15, SIGN: 16, ARCH: 17, SEAT: 18, HELMET: 19, HAIR: 20, EXHAUST: 21, SIGNTEXT: 22, UNDER: 23,
});

export const F_STEER = 1;
export const F_SPIN = 2;
export const F_DRIVER = 4;
export const F_INTERIOR = 8;
export const F_BIKE = 16;

const attrs = () => ({
  pos: [], nrm: [], col: [], mat: [], piv: [], uv: [], tris: 0,
});

/** sRGB 0xRRGGBB → doğrusal [r,g,b]. */
export function lin(hex) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a) {
  const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Konumdan türeyen 0..1 sayı (hasar eşiği): 1/12 m ızgarasında hash. */
export function posHash(x, y, z) {
  let h = Math.imul(Math.round(x * 12) | 0, 0x27d4eb2f) ^ Math.imul(Math.round(y * 12) | 0, 0x165667b1) ^ Math.imul(Math.round(z * 12) | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Geo {
  constructor() {
    this.L = { solid: attrs(), glass: attrs() };
    this.sx = 1;
    this.layer = 'solid';
    this.def = {
      slot: SLOT.BODY, emit: 0, col: [1, 1, 1], flags: 0, pivot: null, layer: 'solid',
    };
  }

  get tris() {
    return this.L.solid.tris + this.L.glass.tris;
  }

  /** Geçici varsayılanlarla çalıştır: g.with({flags:F_DRIVER}, () => {...}) */
  with(o, fn) {
    const prev = this.def;
    this.def = Object.assign({}, prev, o);
    try {
      fn();
    } finally {
      this.def = prev;
    }
  }

  /** Aynalı yazma: fn önce olduğu gibi, sonra x → −x (sarım ters) ile bir daha çalışır. */
  sym(fn) {
    const prev = this.sx;
    this.sx = 1;
    fn();
    this.sx = -1;
    fn();
    this.sx = prev;
  }

  /** Tek üçgen. p*: [x,y,z]; n*: normal; o: seçenekler (varsayılanlarla birleşir). */
  tri(p0, p1, p2, n0, n1, n2, o, c0, c1, c2, t0, t1, t2) {
    const d = this.def;
    const slot = o && o.slot !== undefined ? o.slot : d.slot;
    const emit = o && o.emit !== undefined ? o.emit : d.emit;
    const flags = o && o.flags !== undefined ? o.flags : d.flags;
    const layer = o && o.layer !== undefined ? o.layer : d.layer;
    const pivot = o && o.pivot !== undefined ? o.pivot : d.pivot;
    const base = o && o.col ? o.col : d.col;
    const A = this.L[layer];
    const mir = this.sx < 0;
    const P = mir ? [p0, p2, p1] : [p0, p1, p2];
    const N = mir ? [n0, n2, n1] : [n0, n1, n2];
    const C = mir ? [c0, c2, c1] : [c0, c1, c2];
    const T = mir ? [t0, t2, t1] : [t0, t1, t2];
    for (let k = 0; k < 3; k++) {
      const p = P[k];
      const n = N[k];
      const x = mir ? -p[0] : p[0];
      A.pos.push(x, p[1], p[2]);
      A.nrm.push(mir ? -n[0] : n[0], n[1], n[2]);
      const c = C[k] || base;
      A.col.push(c[0], c[1], c[2]);
      A.mat.push(slot, emit, flags, posHash(x, p[1], p[2]));
      if (pivot) A.piv.push(mir ? -pivot[0] : pivot[0], pivot[1], pivot[2]);
      else A.piv.push(0, 0, 0);
      const t = T[k];
      if (t) A.uv.push(t[0], t[1]);
      else A.uv.push(0, 0);
    }
    A.tris++;
  }

  /** Üçgen: sarım, köşe normallerinin ortalamasıyla uyuşmuyorsa ters çevrilir. */
  triAuto(p0, p1, p2, n0, n1, n2, o) {
    const g = cross(sub(p1, p0), sub(p2, p0));
    const nv = [n0[0] + n1[0] + n2[0], n0[1] + n1[1] + n2[1], n0[2] + n1[2] + n2[2]];
    if (dot(g, nv) < 0) this.tri(p0, p2, p1, n0, n2, n1, o);
    else this.tri(p0, p1, p2, n0, n1, n2, o);
  }

  /**
   * Düz yüzlü dörtgen (a,b,c,d dışarıdan bakınca saat yönünün tersi). o.nrm verilmezse hesaplanır. o.uv [[u,v]x4]. o.cols [rgb x4].
   * o.f = 'x+'|'x-'|'y+'|'y-'|'z+'|'z-': normalin o eksendeki isareti zorlanir (kose sirasi gerekirse ters cevrilir; uv/renk birlikte).
   */
  quad(a, b, c, d, o) {
    let A = a;
    let B = b;
    let C = c;
    let D = d;
    let uv = o && o.uv ? o.uv : [];
    let cl = o && o.cols ? o.cols : [];
    if (o && o.f) {
      const axis = 'xyz'.indexOf(o.f[0]);
      const sign = o.f[1] === '+' ? 1 : -1;
      const n0 = cross(sub(b, a), sub(c, a));
      if (n0[axis] * sign < 0) {
        A = d; B = c; C = b; D = a;
        uv = uv.length ? [uv[3], uv[2], uv[1], uv[0]] : uv;
        cl = cl.length ? [cl[3], cl[2], cl[1], cl[0]] : cl;
      }
    }
    const n = o && o.nrm ? o.nrm : norm(cross(sub(B, A), sub(C, A)));
    this.tri(A, B, C, n, n, n, o, cl[0], cl[1], cl[2], uv[0], uv[1], uv[2]);
    this.tri(A, C, D, n, n, n, o, cl[0], cl[2], cl[3], uv[0], uv[2], uv[3]);
  }

  /** `quad` + yönü iç noktadan (hint) dışa doğru zorlar. */
  quadOut(a, b, c, d, hint, o) {
    const n = cross(sub(b, a), sub(c, a));
    const cen = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
    if (dot(n, sub(cen, hint)) < 0) this.quad(d, c, b, a, o && o.uv ? Object.assign({}, o, { uv: [o.uv[3], o.uv[2], o.uv[1], o.uv[0]] }) : o);
    else this.quad(a, b, c, d, o);
  }

  /**
   * Sekiz köşeli gövde (kesik kutu): alt köşeler b0..b3 (üstten bakışla: sol-ön, sağ-ön, sağ-arka, sol-arka), üst köşeler t0..t3 aynı sırayla.
   * o.skip: yüz adları dizisi ['top','bot','front','back','left','right'] · o.faces: {top:{slot..}}
   */
  hull(b, t, o) {
    const opt = o || {};
    const skip = opt.skip || [];
    const c = [0, 0, 0];
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) c[k] += (b[i][k] + t[i][k]) / 8;
    const f = (name, a, bb, cc, dd) => {
      if (skip.indexOf(name) >= 0) return;
      const fo = opt.faces && opt.faces[name] ? Object.assign({}, opt, opt.faces[name]) : opt;
      this.quadOut(a, bb, cc, dd, c, fo);
    };
    f('top', t[0], t[3], t[2], t[1]);
    f('bot', b[0], b[1], b[2], b[3]);
    f('front', b[0], t[0], t[1], b[1]);
    f('back', b[3], b[2], t[2], t[3]);
    f('left', b[0], b[3], t[3], t[0]);
    f('right', b[1], t[1], t[2], b[2]);
  }

  /** Eksene hizalı kutu. */
  box(x0, y0, z0, x1, y1, z1, o) {
    this.hull(
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
      o,
    );
  }

  /** Yamuk kesitli kutu: ön ve arka yüz ayrı ölçülü (taban genişliği/üst genişliği). */
  taper(zF, zB, yb, yt, wbF, wtF, wbB, wtB, o) {
    this.hull(
      [[-wbF, yb, zF], [wbF, yb, zF], [wbB, yb, zB], [-wbB, yb, zB]],
      [[-wtF, yt, zF], [wtF, yt, zF], [wtB, yt, zB], [-wtB, yt, zB]],
      o,
    );
  }

  /**
   * X ekseni boyunca silindir (tekerlek vb.): merkez (cx,cy,cz), yarıçap r, yarım uzunluk hl, seg kenar. Yan yüzler kapak.
   * o.rb: yarıçap oranı sol/sağ kapakta (basamak); o.caps: [sol,sağ] boolean; o.smooth: yumuşak yanal normal.
   */
  cylX(cx, cy, cz, r, hl, seg, o) {
    const opt = o || {};
    const caps = opt.caps || [true, true];
    const sm = opt.smooth !== false;
    const ring = (x, rr) => {
      const pts = [];
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        pts.push([x, cy + Math.cos(a) * rr, cz + Math.sin(a) * rr, Math.cos(a), Math.sin(a)]);
      }
      return pts;
    };
    const L = ring(cx - hl, r);
    const R = ring(cx + hl, r);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const nA = sm ? [0, L[i][3], L[i][4]] : null;
      const nB = sm ? [0, L[j][3], L[j][4]] : null;
      const am = (L[i][3] + L[j][3]) / 2;
      const bm = (L[i][4] + L[j][4]) / 2;
      const nf = norm([0, am, bm]);
      const n0 = nA || nf;
      const n1 = nB || nf;
      // dış yüz: soldan sağa halka; normal radyal
      this.tri([L[i][0], L[i][1], L[i][2]], [L[j][0], L[j][1], L[j][2]], [R[j][0], R[j][1], R[j][2]], n0, n1, n1, opt.tread);
      this.tri([L[i][0], L[i][1], L[i][2]], [R[j][0], R[j][1], R[j][2]], [R[i][0], R[i][1], R[i][2]], n0, n1, n0, opt.tread);
    }
    const cap = (x, ring2, nx, o2) => {
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        const c = [x, cy, cz];
        const pa = [ring2[i][0], ring2[i][1], ring2[i][2]];
        const pb = [ring2[j][0], ring2[j][1], ring2[j][2]];
        const n = [nx, 0, 0];
        const u = (p) => [0.5 + (p[2] - cz) / (2 * r), 0.5 - (p[1] - cy) / (2 * r)];
        if (nx > 0) this.tri(c, pa, pb, n, n, n, o2, undefined, undefined, undefined, [0.5, 0.5], u(pa), u(pb));
        else this.tri(c, pb, pa, n, n, n, o2, undefined, undefined, undefined, [0.5, 0.5], u(pb), u(pa));
      }
    };
    if (caps[0]) cap(cx - hl, L, -1, opt.capL);
    if (caps[1]) cap(cx + hl, R, 1, opt.capR);
  }

  /** Z ekseni boyunca prizma/silindir (itici, nozul): merkez (cx,cy,cz), yarıçaplar [rx,ry], uzunluk zLen (cz'den ±zLen/2), seg. o.capF/o.capB: kapak seçenekleri (null = yok). */
  cylZ(cx, cy, cz, rx, ry, zLen, seg, o) {
    const opt = o || {};
    const z0 = cz - zLen / 2;
    const z1 = cz + zLen / 2;
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push([Math.cos(a), Math.sin(a)]);
    }
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const a = pts[i];
      const b = pts[j];
      const p0 = [cx + a[0] * rx, cy + a[1] * ry, z0];
      const p1 = [cx + b[0] * rx, cy + b[1] * ry, z0];
      const p2 = [cx + b[0] * rx, cy + b[1] * ry, z1];
      const p3 = [cx + a[0] * rx, cy + a[1] * ry, z1];
      const nA = norm([a[0] / rx, a[1] / ry, 0]);
      const nB = norm([b[0] / rx, b[1] / ry, 0]);
      const gn = cross(sub(p1, p0), sub(p2, p0));
      const want = [(nA[0] + nB[0]) / 2, (nA[1] + nB[1]) / 2, 0];
      if (dot(gn, want) >= 0) {
        this.tri(p0, p1, p2, nA, nB, nB, opt.side);
        this.tri(p0, p2, p3, nA, nB, nA, opt.side);
      } else {
        this.tri(p0, p2, p1, nA, nB, nB, opt.side);
        this.tri(p0, p3, p2, nA, nA, nB, opt.side);
      }
    }
    const cap = (z, nz, o2) => {
      if (!o2) return;
      const n = [0, 0, nz];
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        const c = [cx, cy, z];
        const pa = [cx + pts[i][0] * rx, cy + pts[i][1] * ry, z];
        const pb = [cx + pts[j][0] * rx, cy + pts[j][1] * ry, z];
        const gn = cross(sub(pa, c), sub(pb, c));
        const uv = (p) => [0.5 + (p[0] - cx) / (2 * rx), 0.5 - (p[1] - cy) / (2 * ry)];
        if (gn[2] * nz > 0) this.tri(c, pa, pb, n, n, n, o2, undefined, undefined, undefined, [0.5, 0.5], uv(pa), uv(pb));
        else this.tri(c, pb, pa, n, n, n, o2, undefined, undefined, undefined, [0.5, 0.5], uv(pb), uv(pa));
      }
    };
    cap(z0, -1, opt.capF);
    cap(z1, 1, opt.capB);
  }

  /** Köşe sayaç işareti (katman başına); scaleSince ile birlikte (yazıldıktan sonra bir grubu ölçekle). */
  mark() {
    return { solid: this.L.solid.pos.length, glass: this.L.glass.pos.length };
  }

  /** mark() sonrası yazılan köşeleri (ox,oy,oz) noktası çevresinde düzgün ölçekler (normaller korunur). */
  scaleSince(m, k, ox, oy, oz) {
    ['solid', 'glass'].forEach((ln) => {
      const A = this.L[ln];
      for (let i = m[ln]; i < A.pos.length; i += 3) {
        A.pos[i] = ox + (A.pos[i] - ox) * k;
        A.pos[i + 1] = oy + (A.pos[i + 1] - oy) * k;
        A.pos[i + 2] = oz + (A.pos[i + 2] - oz) * k;
      }
    });
  }

  /** Küre benzeri (kafa, miğfer): enlem lat × boylam lon, yarıçaplar [rx,ry,rz]. */
  blob(cx, cy, cz, rx, ry, rz, lat, lon, o) {
    const pt = (i, j) => {
      const a = (i / lat) * Math.PI;
      const b = (j / lon) * Math.PI * 2;
      const sx = Math.sin(a) * Math.cos(b);
      const sy = Math.cos(a);
      const sz = Math.sin(a) * Math.sin(b);
      return { p: [cx + sx * rx, cy + sy * ry, cz + sz * rz], n: norm([sx / rx, sy / ry, sz / rz]) };
    };
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        const a = pt(i, j);
        const b = pt(i, j + 1);
        const c = pt(i + 1, j + 1);
        const d = pt(i + 1, j);
        if (i > 0) this.triAuto(a.p, d.p, c.p, a.n, d.n, c.n, o);
        if (i < lat - 1) this.triAuto(a.p, c.p, b.p, a.n, c.n, b.n, o);
      }
    }
  }
}

/**
 * Halka loft: stations[i] = {z, ring:[[x,y]…]} (aynı nokta sayısı), segmentler i→i+1. Dışa bakan yüzler; yumuşak normaller (kıvrım bayrakları ile kesilir).
 * opts: slotAt(i, j, quadInfo) → {slot, layer, emit, col, skip} | null (null = varsayılan) · crease[j] (halka noktası j'de keskin kenar) · creaseStation[i]
 *       capStart / capEnd: {slot..} (ucu yelpaze ile kapat) · aoFn(x,y,z) → 0..1 çarpan · baseCol [r,g,b]
 */
export function loft(geo, stations, opts) {
  const o = opts || {};
  const S = stations.length;
  const N = stations[0].ring.length;
  const P = stations.map((s) => s.ring.map((r) => [r[0], r[1], s.z]));
  const ctr = P.map((ring) => {
    const c = [0, 0, ring[0][2]];
    ring.forEach((p) => { c[0] += p[0] / N; c[1] += p[1] / N; });
    return c;
  });
  // yüz normalleri
  const FN = [];
  for (let i = 0; i < S - 1; i++) {
    FN.push([]);
    for (let j = 0; j < N; j++) {
      const j2 = (j + 1) % N;
      const a = P[i][j];
      const b = P[i][j2];
      const c = P[i + 1][j];
      const d = P[i + 1][j2];
      let n = cross(sub(b, a), sub(c, a));
      const n2 = cross(sub(d, b), sub(c, b));
      n = [n[0] + n2[0], n[1] + n2[1], n[2] + n2[2]];
      const cen = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
      const mid = [(ctr[i][0] + ctr[i + 1][0]) / 2, (ctr[i][1] + ctr[i + 1][1]) / 2, 0];
      const outv = [cen[0] - mid[0], cen[1] - mid[1], 0];
      let nn = norm(n);
      if (dot(nn, outv) < 0) nn = [-nn[0], -nn[1], -nn[2]];
      FN[i].push(nn);
    }
  }
  const crease = o.crease || [];
  const creaseStation = o.creaseStation || [];
  const baseCol = o.baseCol || [1, 1, 1];
  const vnorm = (qi, qj, ci, cj) => {
    // quad (qi,qj) köşesi (ci,cj) için komşu yüzlerin ortalaması
    const n0 = FN[qi][qj];
    let s = [n0[0], n0[1], n0[2]];
    const di = ci === qi ? -1 : 1;
    const dj = cj === qj ? -1 : 1;
    const qi2 = qi + di;
    const qj2 = (qj + dj + N) % N;
    const stationCrease = !!creaseStation[ci];
    const ringCrease = !!crease[cj % N];
    if (!stationCrease && qi2 >= 0 && qi2 < S - 1) {
      const n = FN[qi2][qj];
      s = [s[0] + n[0], s[1] + n[1], s[2] + n[2]];
    }
    if (!ringCrease) {
      const n = FN[qi][qj2];
      s = [s[0] + n[0], s[1] + n[1], s[2] + n[2]];
      if (!stationCrease && qi2 >= 0 && qi2 < S - 1) {
        const m = FN[qi2][qj2];
        s = [s[0] + m[0], s[1] + m[1], s[2] + m[2]];
      }
    }
    return norm(s);
  };
  const colAt = (p, slotInfo) => {
    const ao = o.aoFn ? o.aoFn(p[0], p[1], p[2]) : 1;
    const bc = slotInfo && slotInfo.col ? slotInfo.col : baseCol;
    return [bc[0] * ao, bc[1] * ao, bc[2] * ao];
  };
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < N; j++) {
      const info = o.slotAt ? o.slotAt(i, j) : null;
      if (info && info.skip) continue;
      const j2 = (j + 1) % N;
      const a = P[i][j];
      const b = P[i][j2];
      const c = P[i + 1][j2];
      const d = P[i + 1][j];
      const nA = vnorm(i, j, i, j);
      const nB = vnorm(i, j, i, j + 1);
      const nC = vnorm(i, j, i + 1, j + 1);
      const nD = vnorm(i, j, i + 1, j);
      const cols = [colAt(a, info), colAt(b, info), colAt(c, info), colAt(d, info)];
      const oo = info || null;
      // sarım: FN dışa bakar; üçgen (a,b,c) normali ile aynı yönde değilse çevir
      const gn = cross(sub(b, a), sub(c, a));
      const flip = dot(gn, FN[i][j]) < 0;
      if (!flip) {
        geo.tri(a, b, c, nA, nB, nC, oo, cols[0], cols[1], cols[2]);
        geo.tri(a, c, d, nA, nC, nD, oo, cols[0], cols[2], cols[3]);
      } else {
        geo.tri(a, c, b, nA, nC, nB, oo, cols[0], cols[2], cols[1]);
        geo.tri(a, d, c, nA, nD, nC, oo, cols[0], cols[3], cols[2]);
      }
    }
  }
  const capFan = (idx, sign, info) => {
    const ring = P[idx];
    const c = [0, 0, ring[0][2]];
    ring.forEach((p) => { c[0] += p[0] / N; c[1] += p[1] / N; });
    const n = [0, 0, sign];
    for (let j = 0; j < N; j++) {
      const j2 = (j + 1) % N;
      const a = ring[j];
      const b = ring[j2];
      const cc = [colAt(c, info), colAt(a, info), colAt(b, info)];
      const gn = cross(sub(a, c), sub(b, c));
      if (gn[2] * sign > 0) geo.tri(c, a, b, n, n, n, info, cc[0], cc[1], cc[2]);
      else geo.tri(c, b, a, n, n, n, info, cc[0], cc[2], cc[1]);
    }
  };
  if (o.capStart) capFan(0, -1, o.capStart);
  if (o.capEnd) capFan(S - 1, 1, o.capEnd);
}

/** Sınır kutusu (iki katman). Çıktı {min:[x,y,z], max:[x,y,z]} ya da boşsa null. filter(slotFlags) ile süzülebilir. */
export function boundsOf(geo, flagMask, flagWant) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let any = false;
  ['solid', 'glass'].forEach((ln) => {
    const A = geo.L[ln];
    for (let i = 0; i < A.pos.length / 3; i++) {
      if (flagMask) {
        const f = A.mat[i * 4 + 2];
        if (((f & flagMask) !== 0) !== !!flagWant) continue;
      }
      for (let k = 0; k < 3; k++) {
        const v = A.pos[i * 3 + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
      any = true;
    }
  });
  return any ? { min, max } : null;
}

/** Ham dizileri Float32Array'lere çevirir. */
export function finalize(geo) {
  const out = {};
  ['solid', 'glass'].forEach((ln) => {
    const A = geo.L[ln];
    out[ln] = {
      position: new Float32Array(A.pos),
      normal: new Float32Array(A.nrm),
      aColor: new Float32Array(A.col),
      aMat: new Float32Array(A.mat),
      aPivot: new Float32Array(A.piv),
      uv: new Float32Array(A.uv),
      tris: A.tris,
    };
  });
  return out;
}
