/*
 * KEŞİF render/props — PROSEDÜREL ALÇAK POLİ GEOMETRİ (three; sim'den bağımsız). Sözleşme KESIF_CITY_CONTRACT §6.
 *
 *   createPropGeometries(THREE) → Map<slotKey, {key, def, group, body:BufferGeometry, holo:BufferGeometry|null, tris, holoTris}>
 *       Tanım başına (agaç gibi geometri varyantı olanlarda varyant grubu başına) 1 gövde + isteğe bağlı holo geometri; tek malzemeyle çizilir.
 *   slotKeyFor(def, variant) → 'lamba' | 'agac:1' …       geometri varyant grubu (yalnız `agac`: variant&4)
 *   PROP_MODEL_BUILDERS[meshKey] → (b: GeoBuilder) → void   saf geometri tarifleri (test: GeoBuilder'a karşı, THREE'siz)
 *   class GeoBuilder        box/prism/cone/octa/ico/quad/tri/extrude → build(THREE) (yalnız burada three gerekir)
 *
 * Köşe öznitelikleri (hepsi düz gölgeli, indekssiz):  position, normal, uv, aColor (doğrusal rgb), aMat (vec4)
 *   aMat.x = ışık yayma gücü 0..1      aMat.y = tür: 0 gövde · 1 neon (örnek rengiyle boyanır) · 2 tabela yüzü (atlas) · 3 kendi renginde yayıcı
 *                                                    · 4 trafik lambası (aMat.z = lamba 1 kırmızı/2 sarı/3 yeşil)
 *   aMat.z = grup (tür 4: lamba no; tür 1/3: 9 = durumla nabız; tür 1: 5 = ekran deseni)      aMat.w = durum 0 iken yayma çarpanı (1 = hep açık)
 * Koordinatlar çapaya göre (taban merkezi); yaw 0 → ön yüz +Z. Çarpışma kutularıyla (propDefs) hizalıdır.
 */
import { PROP_LIST } from '../../sim/props/propDefs.js';

export const MAT_BODY = 0;
export const MAT_NEON = 1;
export const MAT_SIGN = 2;
export const MAT_GLOW = 3;
export const MAT_LAMP = 4;
export const GROUP_PULSE = 9;
/** aMat.z = 5: neon ekran (arayüz çubukları deseni, shader üretir). */
export const GROUP_SCREEN = 5;

/* ------------------------------------------------------------------------------------------------
 * Renk paleti (sRGB onaltılık; build() doğrusala çevirir)
 * ---------------------------------------------------------------------------------------------- */
const P = Object.freeze({
  steelDark: 0x1f2433,
  steel: 0x343c52,
  steelLight: 0x59647f,
  chrome: 0x8c97b0,
  black: 0x0d0f17,
  panel: 0x10131f,
  wood: 0x8a5f3b,
  woodDark: 0x6a4630,
  binGreen: 0x2f7a66,
  binDark: 0x1f5547,
  vendor: 0x2b3352,
  vendorDark: 0x161a2d,
  trunk: 0x6b4a33,
  leafA: 0x2f9a62,
  leafB: 0x3fbf78,
  leafC: 0x1f7a52,
  potA: 0x7d4e8a,
  potB: 0x35456b,
  soil: 0x2a1f1a,
  warm: 0xffe0a0,
  white: 0xf2f6ff,
  signPanel: 0x0b0e1a,
  frameCool: 0x28f0ff,
  red: 0xff3b3b,
  yellow: 0xffc933,
  green: 0x3bff7a,
  screen: 0x28f0ff,
});

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function hexRgb(hex) {
  return [
    srgbToLinear(((hex >> 16) & 255) / 255),
    srgbToLinear(((hex >> 8) & 255) / 255),
    srgbToLinear((hex & 255) / 255),
  ];
}

/* ------------------------------------------------------------------------------------------------
 * GeoBuilder
 * ---------------------------------------------------------------------------------------------- */
const FACE_NY = 1;
const FACE_PY = 2;
const FACE_NX = 4;
const FACE_PX = 8;
const FACE_NZ = 16;
const FACE_PZ = 32;
export const SKIP = Object.freeze({
  NY: FACE_NY, PY: FACE_PY, NX: FACE_NX, PX: FACE_PX, NZ: FACE_NZ, PZ: FACE_PZ,
});

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.mat = [];
  }

  get tris() {
    return this.pos.length / 9;
  }

  /** Üçgen; hint (dışa bakan vektör) ile sarmal yönü düzeltilir. uv: [u,v]×3. mat: [x,y,z,w]. */
  tri(a, b, c, hint, color, mat, uvs) {
    let p1 = b;
    let p2 = c;
    let u1 = uvs ? uvs[1] : [1, 0];
    let u2 = uvs ? uvs[2] : [0, 1];
    const u0 = uvs ? uvs[0] : [0, 0];
    let ux = p1[0] - a[0];
    let uy = p1[1] - a[1];
    let uz = p1[2] - a[2];
    let vx = p2[0] - a[0];
    let vy = p2[1] - a[1];
    let vz = p2[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
      const t = p1; p1 = p2; p2 = t;
      const tu = u1; u1 = u2; u2 = tu;
      ux = p1[0] - a[0]; uy = p1[1] - a[1]; uz = p1[2] - a[2];
      vx = p2[0] - a[0]; vy = p2[1] - a[1]; vz = p2[2] - a[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
    }
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const rgb = hexRgb(color);
    const pts = [a, p1, p2];
    const uvl = [u0, u1, u2];
    for (let i = 0; i < 3; i++) {
      this.pos.push(pts[i][0], pts[i][1], pts[i][2]);
      this.nor.push(nx, ny, nz);
      this.uv.push(uvl[i][0], uvl[i][1]);
      this.col.push(rgb[0], rgb[1], rgb[2]);
      this.mat.push(mat[0], mat[1], mat[2], mat[3]);
    }
    return this;
  }

  /** Dörtgen (p0..p3 dönüşlü sırada); uv varsayılan (0,0)(1,0)(1,1)(0,1). */
  quad(p0, p1, p2, p3, hint, color, mat, uvs) {
    const u = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    this.tri(p0, p1, p2, hint, color, mat, [u[0], u[1], u[2]]);
    this.tri(p0, p2, p3, hint, color, mat, [u[0], u[2], u[3]]);
    return this;
  }

  /** Eksen hizalı kutu; skip: SKIP bayrakları (görünmeyen yüzler atılır). */
  box(x0, y0, z0, x1, y1, z1, color, mat, skip) {
    const s = skip | 0;
    if (!(s & FACE_PX)) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], color, mat);
    if (!(s & FACE_NX)) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], color, mat);
    if (!(s & FACE_PY)) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], color, mat);
    if (!(s & FACE_NY)) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], color, mat);
    if (!(s & FACE_PZ)) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], color, mat);
    if (!(s & FACE_NZ)) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], color, mat);
    return this;
  }

  /** n kenarlı kesik koni/prizma (yalnız yan yüzler; capTop/capBottom ile kapaklar). rot: başlangıç açısı. */
  prism(cx, cz, y0, y1, r0, r1, n, color, mat, capTop, capBottom, rot) {
    const a0 = rot || 0;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      const b = a0 + ((i + 1) / n) * Math.PI * 2;
      const m = (a + b) / 2;
      const hint = [Math.cos(m), 0, Math.sin(m)];
      const p0 = [cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0];
      const p1 = [cx + Math.cos(b) * r0, y0, cz + Math.sin(b) * r0];
      const p2 = [cx + Math.cos(b) * r1, y1, cz + Math.sin(b) * r1];
      const p3 = [cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1];
      if (r1 > 1e-6) this.quad(p0, p1, p2, p3, hint, color, mat);
      else this.tri(p0, p1, p3, hint, color, mat);
    }
    if (capTop && r1 > 1e-6) this.fan(cx, cz, y1, r1, n, [0, 1, 0], color, mat, a0);
    if (capBottom) this.fan(cx, cz, y0, r0, n, [0, -1, 0], color, mat, a0);
    return this;
  }

  fan(cx, cz, y, r, n, hint, color, mat, rot) {
    const a0 = rot || 0;
    const c = [cx, y, cz];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      const b = a0 + ((i + 1) / n) * Math.PI * 2;
      this.tri(c, [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r], [cx + Math.cos(b) * r, y, cz + Math.sin(b) * r], hint, color, mat);
    }
    return this;
  }

  cone(cx, cz, y0, y1, r, n, color, mat, capBottom, rot) {
    return this.prism(cx, cz, y0, y1, r, 0, n, color, mat, false, capBottom, rot);
  }

  /** Sekizyüzlü (8 üçgen). */
  octa(cx, cy, cz, r, color, mat) {
    const v = [[cx + r, cy, cz], [cx - r, cy, cz], [cx, cy + r, cz], [cx, cy - r, cz], [cx, cy, cz + r], [cx, cy, cz - r]];
    const faces = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
    faces.forEach((f) => {
      const a = v[f[0]]; const b = v[f[1]]; const c = v[f[2]];
      this.tri(a, b, c, [(a[0] + b[0] + c[0]) / 3 - cx, (a[1] + b[1] + c[1]) / 3 - cy, (a[2] + b[2] + c[2]) / 3 - cz], color, mat);
    });
    return this;
  }

  /** Yirmiyüzlü (20 üçgen); sy: dikey ölçek. */
  ico(cx, cy, cz, r, color, mat, sy) {
    const t = (1 + Math.sqrt(5)) / 2;
    const l = Math.sqrt(1 + t * t);
    const k = r / l;
    const syy = sy || 1;
    const raw = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    const v = raw.map((p) => [cx + p[0] * k, cy + p[1] * k * syy, cz + p[2] * k]);
    const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    f.forEach((i) => {
      const a = v[i[0]]; const b = v[i[1]]; const c = v[i[2]];
      this.tri(a, b, c, [(a[0] + b[0] + c[0]) / 3 - cx, (a[1] + b[1] + c[1]) / 3 - cy, (a[2] + b[2] + c[2]) / 3 - cz], color, mat);
    });
    return this;
  }

  /**
   * Dışbükey çokgen profili (z,y) düzleminde x0..x1 boyunca çıkarır: yan kapaklar + kenar dörtgenleri.
   * pts: [[z,y],…] (sıra önemsiz değil: dışbükey, tutarlı yönde). skip: kapakları atlamak için 1 (−x), 2 (+x).
   */
  extrude(x0, x1, pts, color, mat, skipCaps) {
    let cz = 0;
    let cy = 0;
    pts.forEach((p) => { cz += p[0]; cy += p[1]; });
    cz /= pts.length;
    cy /= pts.length;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const mz = (a[0] + b[0]) / 2 - cz;
      const my = (a[1] + b[1]) / 2 - cy;
      this.quad([x0, a[1], a[0]], [x1, a[1], a[0]], [x1, b[1], b[0]], [x0, b[1], b[0]], [0, my, mz], color, mat);
    }
    for (let side = 0; side < 2; side++) {
      if ((skipCaps | 0) & (side + 1)) continue;
      const x = side === 0 ? x0 : x1;
      const hint = [side === 0 ? -1 : 1, 0, 0];
      for (let i = 1; i < n - 1; i++) {
        this.tri([x, pts[0][1], pts[0][0]], [x, pts[i][1], pts[i][0]], [x, pts[i + 1][1], pts[i + 1][0]], hint, color, mat);
      }
    }
    return this;
  }

  /** Kenar çizgileri/çerçeve için yardımcı: x0..x1, y0..y1 dikdörtgen çerçevesi (kalınlık t), z düzleminde, yüz +Z (dir=1) ya da −Z (dir=−1). */
  frameZ(x0, y0, x1, y1, t, z, dir, color, mat) {
    const h = [0, 0, dir];
    const f = (a0, b0, a1, b1) => {
      if (dir > 0) this.quad([a0, b0, z], [a1, b0, z], [a1, b1, z], [a0, b1, z], h, color, mat);
      else this.quad([a1, b0, z], [a0, b0, z], [a0, b1, z], [a1, b1, z], h, color, mat);
    };
    f(x0, y1 - t, x1, y1);
    f(x0, y0, x1, y0 + t);
    f(x0, y0 + t, x0 + t, y1 - t);
    f(x1 - t, y0 + t, x1, y1 - t);
    return this;
  }

  /** THREE.BufferGeometry (öznitelikler: position, normal, uv, aColor, aMat). */
  build(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mat, 4));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Tarifler (meshKey → builder). `b` GeoBuilder. Sonuçta gövde (b) ve isteğe bağlı holo (h) üretilir.
 * ---------------------------------------------------------------------------------------------- */
const M = {
  body: [0, MAT_BODY, 0, 1],
  neon: (e, off) => [e === undefined ? 1 : e, MAT_NEON, 0, off === undefined ? 1 : off],
  neonPulse: [1, MAT_NEON, GROUP_PULSE, 1],
  glow: (e) => [e === undefined ? 1 : e, MAT_GLOW, 0, 1],
  sign: [1, MAT_SIGN, 0, 1],
  lamp: (n) => [1, MAT_LAMP, n, 1],
};

function lamba(b) {
  b.box(-0.2, 0, -0.2, 0.2, 0.3, 0.2, P.steelDark, M.body, SKIP.NY);
  b.prism(0, 0, 0.3, 5.5, 0.1, 0.065, 6, P.steel, M.body, false, false);
  b.box(-0.04, 5.38, 0, 0.04, 5.5, 1.05, P.steel, M.body, SKIP.NZ);
  b.box(-0.17, 5.28, 0.7, 0.17, 5.4, 1.3, P.steelDark, M.body, SKIP.NY);
  b.box(-0.2, 5.4, 0.65, 0.2, 5.46, 1.35, P.steelLight, M.body, SKIP.NY);
  b.quad([-0.14, 5.275, 1.26], [0.14, 5.275, 1.26], [0.14, 5.275, 0.74], [-0.14, 5.275, 0.74], [0, -1, 0], P.warm, M.glow(1));
  // ek: kafanın yan ve uç yüzlerinde ışıma şeridi (göz hizasından da görünür)
  b.quad([0.1715, 5.3, 0.74], [0.1715, 5.3, 1.26], [0.1715, 5.36, 1.26], [0.1715, 5.36, 0.74], [1, 0, 0], P.warm, M.glow(1));
  b.quad([-0.1715, 5.3, 1.26], [-0.1715, 5.3, 0.74], [-0.1715, 5.36, 0.74], [-0.1715, 5.36, 1.26], [-1, 0, 0], P.warm, M.glow(1));
  b.quad([-0.17, 5.3, 1.3005], [0.17, 5.3, 1.3005], [0.17, 5.37, 1.3005], [-0.17, 5.37, 1.3005], [0, 0, 1], P.warm, M.glow(1));
  b.prism(0, 0, 1.15, 1.21, 0.108, 0.108, 6, P.frameCool, M.neon(0.8), false, false);
}

function bank(b) {
  b.box(-0.875, 0.42, -0.3125, 0.875, 0.5, 0.25, P.wood, M.body, SKIP.NY);
  b.box(-0.875, 0.55, -0.3125, 0.875, 0.95, -0.22, P.woodDark, M.body, SKIP.NY);
  b.box(-0.8, 0, -0.28, -0.7, 0.42, 0.22, P.steelDark, M.body, SKIP.NY);
  b.box(0.7, 0, -0.28, 0.8, 0.42, 0.22, P.steelDark, M.body, SKIP.NY);
  b.box(-0.8, 0.355, 0.22, 0.8, 0.4, 0.25, P.frameCool, M.neon(0.9), SKIP.NY);
}

function copKutusu(b) {
  b.prism(0, 0, 0, 0.82, 0.27, 0.3, 6, P.binGreen, M.body, false, false, Math.PI / 6);
  b.box(-0.3, 0.82, -0.3, 0.3, 0.94, 0.3, P.binDark, M.body, SKIP.NY);
  b.prism(0, 0, 0.5, 0.56, 0.307, 0.307, 6, P.frameCool, M.neon(0.8), false, false, Math.PI / 6);
}

function trafikDiregi(b) {
  b.box(-0.2, 0, -0.2, 0.2, 0.25, 0.2, P.steelDark, M.body, SKIP.NY);
  b.prism(0, 0, 0.25, 6.3, 0.1, 0.07, 6, P.steel, M.body, false, false);
  b.box(0, 5.85, -0.05, 2.2, 5.95, 0.05, P.steel, M.body, SKIP.PX | SKIP.NX);
  b.box(1.7, 5.25, -0.17, 2.3, 6.25, -0.13, P.chrome, M.body, SKIP.NY);
  b.box(1.8, 5.3, -0.13, 2.2, 6.2, 0.15, P.black, M.body, SKIP.NY);
  b.quad([1.9, 5.92, 0.152], [2.1, 5.92, 0.152], [2.1, 6.12, 0.152], [1.9, 6.12, 0.152], [0, 0, 1], P.red, M.lamp(1));
  b.quad([1.9, 5.62, 0.152], [2.1, 5.62, 0.152], [2.1, 5.82, 0.152], [1.9, 5.82, 0.152], [0, 0, 1], P.yellow, M.lamp(2));
  b.quad([1.9, 5.35, 0.152], [2.1, 5.35, 0.152], [2.1, 5.55, 0.152], [1.9, 5.55, 0.152], [0, 0, 1], P.green, M.lamp(3));
}

function otomat(b) {
  b.box(-0.5, 0, -0.4375, 0.5, 2.0, 0.4375, P.vendor, M.body, SKIP.NY);
  b.quad([-0.42, 0.72, 0.4385], [0.12, 0.72, 0.4385], [0.12, 1.82, 0.4385], [-0.42, 1.82, 0.4385], [0, 0, 1], P.vendorDark, M.body);
  b.quad([-0.38, 1.52, 0.4395], [0.08, 1.52, 0.4395], [0.08, 1.78, 0.4395], [-0.38, 1.78, 0.4395], [0, 0, 1], P.red, [0.9, MAT_GLOW, GROUP_PULSE, 1]);
  b.quad([-0.38, 1.17, 0.4395], [0.08, 1.17, 0.4395], [0.08, 1.43, 0.4395], [-0.38, 1.43, 0.4395], [0, 0, 1], P.yellow, [0.9, MAT_GLOW, GROUP_PULSE, 1]);
  b.quad([-0.38, 0.78, 0.4395], [0.08, 0.78, 0.4395], [0.08, 1.08, 0.4395], [-0.38, 1.08, 0.4395], [0, 0, 1], P.green, [0.9, MAT_GLOW, GROUP_PULSE, 1]);
  b.quad([0.2, 1.0, 0.4385], [0.42, 1.0, 0.4385], [0.42, 1.7, 0.4385], [0.2, 1.7, 0.4385], [0, 0, 1], P.steelDark, M.body);
  b.quad([-0.3, 0.2, 0.4385], [0.2, 0.2, 0.4385], [0.2, 0.5, 0.4385], [-0.3, 0.5, 0.4385], [0, 0, 1], P.black, M.body);
  b.quad([-0.46, 1.86, 0.4385], [0.46, 1.86, 0.4385], [0.46, 1.95, 0.4385], [-0.46, 1.95, 0.4385], [0, 0, 1], P.frameCool, M.neon(1));
  b.quad([-0.47, 0.05, 0.4385], [-0.43, 0.05, 0.4385], [-0.43, 1.82, 0.4385], [-0.47, 1.82, 0.4385], [0, 0, 1], P.frameCool, M.neon(0.9));
  b.quad([0.43, 0.05, 0.4385], [0.47, 0.05, 0.4385], [0.47, 1.82, 0.4385], [0.43, 1.82, 0.4385], [0, 0, 1], P.frameCool, M.neon(0.9));
}

function tabela(b) {
  b.box(-1.5, 0, -0.125, 1.5, 1.0, 0.125, P.signPanel, M.body);
  // ön yüz (+Z): atlas dikdörtgeni; v=0 üstte
  b.quad([-1.4, 0.08, 0.1255], [1.4, 0.08, 0.1255], [1.4, 0.92, 0.1255], [-1.4, 0.92, 0.1255], [0, 0, 1], P.white, M.sign, [[0, 1], [1, 1], [1, 0], [0, 0]]);
  // arka yüz (−Z): yazı geriden okunur (u ters)
  b.quad([1.4, 0.08, -0.1255], [-1.4, 0.08, -0.1255], [-1.4, 0.92, -0.1255], [1.4, 0.92, -0.1255], [0, 0, -1], P.white, M.sign, [[0, 1], [1, 1], [1, 0], [0, 0]]);
  b.frameZ(-1.46, 0.02, 1.46, 0.98, 0.05, 0.1258, 1, P.frameCool, M.neon(1));
  b.frameZ(-1.46, 0.02, 1.46, 0.98, 0.05, -0.1258, -1, P.frameCool, M.neon(1));
}

function billboard(b, h) {
  b.box(-2.5, 0, -0.125, -2.25, 1.0, 0.125, P.steel, M.body, SKIP.NY);
  b.box(2.25, 0, -0.125, 2.5, 1.0, 0.125, P.steel, M.body, SKIP.NY);
  b.box(-3.0, 0.5, -0.25, 3.0, 3.5, 0.25, P.signPanel, M.body, SKIP.NY);
  b.frameZ(-2.92, 0.58, 2.92, 3.42, 0.07, 0.2512, 1, P.frameCool, M.neon(1));
  if (h) {
    // holo yüz (+Z); v=0 üstte
    h.quad([-2.85, 0.65, 0.2525], [2.85, 0.65, 0.2525], [2.85, 3.35, 0.2525], [-2.85, 3.35, 0.2525], [0, 0, 1], P.white, M.sign, [[0, 1], [1, 1], [1, 0], [0, 0]]);
  }
}

function terminal(b) {
  b.box(-0.4375, 0, -0.3125, 0.4375, 0.25, 0.3125, P.steelDark, M.body, SKIP.NY);
  b.box(-0.35, 0.25, -0.25, 0.35, 1.2, 0.25, P.steel, M.body, SKIP.NY);
  b.extrude(-0.42, 0.42, [[0.3, 1.2], [0.12, 1.85], [-0.3, 1.85], [-0.3, 1.2]], P.steelDark, M.body);
  // eğik ekran: başlığın eğik ön yüzünün 4 mm dışında (z-çakışması yok)
  const zAt = (y) => 0.3 - (y - 1.2) * (0.18 / 0.65) + 0.004;
  b.quad([-0.36, 1.27, zAt(1.27)], [0.36, 1.27, zAt(1.27)], [0.36, 1.8, zAt(1.8)], [-0.36, 1.8, zAt(1.8)], [0, 0.18, 0.65], P.screen, [1, MAT_NEON, GROUP_SCREEN, 0.3]);
  b.box(-0.08, 1.85, -0.08, 0.08, 1.93, 0.08, P.frameCool, M.neonPulse);
  b.quad([-0.2, 0.65, 0.2505], [0.2, 0.65, 0.2505], [0.2, 0.9, 0.2505], [-0.2, 0.9, 0.2505], [0, 0, 1], P.green, [0.9, MAT_GLOW, 0, 0.3]);
  b.quad([-0.33, 0.32, 0.2515], [-0.29, 0.32, 0.2515], [-0.29, 1.15, 0.2515], [-0.33, 1.15, 0.2515], [0, 0, 1], P.frameCool, M.neon(0.8));
  b.quad([0.29, 0.32, 0.2515], [0.33, 0.32, 0.2515], [0.33, 1.15, 0.2515], [0.29, 1.15, 0.2515], [0, 0, 1], P.frameCool, M.neon(0.8));
}

function boyutTerminali(b, h) {
  b.box(-1.5, 0, -0.5, -1.0, 3.5, 0.5, P.steelDark, M.body, SKIP.NY);
  b.box(1.0, 0, -0.5, 1.5, 3.5, 0.5, P.steelDark, M.body, SKIP.NY);
  b.box(-1.0, 3.0, -0.5, 1.0, 3.5, 0.5, P.steel, M.body);
  b.quad([-0.998, 0.02, -0.4], [-0.998, 0.02, 0.4], [-0.998, 3.0, 0.4], [-0.998, 3.0, -0.4], [1, 0, 0], P.frameCool, M.neon(1));
  b.quad([0.998, 0.02, 0.4], [0.998, 0.02, -0.4], [0.998, 3.0, -0.4], [0.998, 3.0, 0.4], [-1, 0, 0], P.frameCool, M.neon(1));
  b.quad([-1.0, 2.998, -0.4], [1.0, 2.998, -0.4], [1.0, 2.998, 0.4], [-1.0, 2.998, 0.4], [0, -1, 0], P.frameCool, M.neon(1));
  b.extrude(-0.5, 0.5, [[0.75, 0], [0.75, 0.9], [0.45, 1.25], [0.25, 1.25], [0.25, 0]], P.steel, M.body);
  const zAt = (y) => 0.75 - (y - 0.9) * (0.3 / 0.35) + 0.004;
  b.quad([-0.42, 0.93, zAt(0.93)], [0.42, 0.93, zAt(0.93)], [0.42, 1.24, zAt(1.24)], [-0.42, 1.24, zAt(1.24)], [0, 0.3, 0.35], P.screen, [1, MAT_NEON, GROUP_SCREEN, 0.5]);
  b.quad([-1.4, 0.012, -0.55], [1.4, 0.012, -0.55], [1.4, 0.012, -0.45], [-1.4, 0.012, -0.45], [0, 1, 0], P.frameCool, M.neon(0.8));
  b.quad([-1.4, 0.012, 0.85], [1.4, 0.012, 0.85], [1.4, 0.012, 0.95], [-1.4, 0.012, 0.95], [0, 1, 0], P.frameCool, M.neon(0.8));
  if (h) {
    // portal düzlemi: iki yönlü, toplamsal (tür 2'den ayrı: holo shader HOLO_MODE=1)
    h.quad([-0.99, 0.04, 0], [0.99, 0.04, 0], [0.99, 2.99, 0], [-0.99, 2.99, 0], [0, 0, 1], P.frameCool, [1, MAT_NEON, 0, 1]);
  }
}

function agacPine(b) {
  b.prism(0, 0, 0, 2.2, 0.17, 0.12, 6, P.trunk, M.body, false, false);
  b.cone(0, 0, 1.3, 3.2, 1.25, 7, P.leafC, M.body, true, 0.2);
  b.cone(0, 0, 2.4, 4.5, 0.95, 7, P.leafA, M.body, false, 0.6);
  b.cone(0, 0, 3.6, 5.8, 0.6, 7, P.leafB, M.body, false, 1.0);
  b.octa(0.7, 2.1, 0.55, 0.07, P.warm, M.glow(1));
  b.octa(-0.55, 2.9, -0.5, 0.07, P.warm, M.glow(1));
}

function agacRound(b) {
  b.prism(0, 0, 0, 2.5, 0.2, 0.13, 6, P.trunk, M.body, false, false);
  b.ico(0, 3.6, 0, 1.45, P.leafA, M.body, 0.85);
  b.ico(0.7, 4.6, 0.25, 1.0, P.leafB, M.body, 0.9);
  b.octa(0.9, 2.7, 0.6, 0.07, P.warm, M.glow(1));
  b.octa(-0.8, 3.1, -0.55, 0.07, P.warm, M.glow(1));
}

function cit(b) {
  b.box(-1.0, 0, -0.0625, -0.9, 1.45, 0.0625, P.steelDark, M.body, SKIP.NY);
  b.box(0.9, 0, -0.0625, 1.0, 1.45, 0.0625, P.steelDark, M.body, SKIP.NY);
  b.box(-0.9, 1.3, -0.03, 0.9, 1.4, 0.03, P.frameCool, M.neon(0.9), SKIP.NY | SKIP.PX | SKIP.NX);
  b.box(-0.9, 0.78, -0.025, 0.9, 0.84, 0.025, P.steelLight, M.body, SKIP.NY | SKIP.PX | SKIP.NX);
}

function saksi(b) {
  b.prism(0, 0, 0, 0.6, 0.3, 0.42, 6, P.potA, M.body, false, false);
  b.fan(0, 0, 0.58, 0.4, 6, [0, 1, 0], P.soil, M.body);
  b.prism(0, 0, 0.55, 0.62, 0.43, 0.43, 6, P.frameCool, M.neon(0.8), false, false);
  // yapraklar: 4 kenarlı ince koniler, farklı boy/yön
  b.cone(0, 0, 0.58, 1.2, 0.12, 4, P.leafB, M.body, false, 0.3);
  b.cone(0.17, 0.05, 0.58, 0.95, 0.09, 4, P.leafA, M.body, false, 0.9);
  b.cone(-0.16, -0.08, 0.58, 1.0, 0.09, 4, P.leafC, M.body, false, 0.1);
  b.cone(0.0, 0.2, 0.58, 0.85, 0.08, 4, P.leafB, M.body, false, 0.5);
}

export const PROP_MODEL_BUILDERS = Object.freeze({
  lamba,
  bank,
  cop_kutusu: copKutusu,
  trafik_diregi: trafikDiregi,
  otomat,
  tabela,
  billboard,
  terminal,
  boyut_terminali: boyutTerminali,
  agac: agacPine,
  'agac:1': agacRound,
  cit,
  saksi,
});

/** Geometri varyant grubu: yalnız ağaç (variant bit 2). */
export function slotKeyFor(def, variant) {
  if (def.key === 'agac') return (variant & 4) !== 0 ? 'agac:1' : 'agac';
  return def.key;
}

const HOLO_KEYS = Object.freeze({ billboard: true, boyut_terminali: true });

/** Tüm geometriler (THREE gerekir). Anahtar: slotKey. */
export function createPropGeometries(THREE) {
  const out = new Map();
  PROP_LIST.forEach((def) => {
    const keys = def.key === 'agac' ? ['agac', 'agac:1'] : [def.key];
    keys.forEach((k, group) => {
      const fn = PROP_MODEL_BUILDERS[k];
      if (!fn) return;
      const b = new GeoBuilder();
      const h = HOLO_KEYS[def.key] ? new GeoBuilder() : null;
      fn(b, h);
      out.set(k, {
        key: k,
        def,
        group,
        body: b.build(THREE),
        holo: h && h.tris > 0 ? h.build(THREE) : null,
        tris: b.tris,
        holoTris: h ? h.tris : 0,
      });
    });
  });
  return out;
}
