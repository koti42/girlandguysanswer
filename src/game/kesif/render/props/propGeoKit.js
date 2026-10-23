/*
 * KEŞİF render/props — İÇ MEKÂN GEOMETRİ ARAÇ TAKIMI (three'siz; GeoBuilder üstünde). Mobilya modelleri bu paletten ve yardımcılardan kurulur.
 *
 * Köşe malzemesi aMat = [yayma 0..1, tür, grup, kapalıyken yayma 0..1] (propGeo.js'teki biçimden FARKLI olarak iç mekân çizicisi grup kodlarını
 * kullanır; propBake.js bayt olarak paketler, propShadersBaked.js çözer):
 *   tür   0 gövde · 1 neon (ton = prop tonu) · 2 marka tabelası (ana atlas) · 3 kendi renginde yayıcı · 5 ekran (desenli neon) · 6 nabız yayıcı
 *         · 7 holo yüzü (yalnız holo geometride) · 8 pano yazısı (iç mekân atlası)
 *   grup  0 her zaman · 32+maske GÜÇ (durum bit maskesinde açık)  · 96+maske GÖRÜNÜR (yalnız maskedeki durumlarda çizilir)
 *         · 160+maske KAYAR (görünür + açılma animasyonu: aAnim yönü × açıklık)
 * Koordinatlar çapaya göre (taban merkezi, yaw 0 → ön yüz +Z). Yapı yardımcıları tek tek `b.box/prism…` çağrılarına iner (alçak poli).
 */
import { GeoBuilder, SKIP } from './propGeo.js';

export { GeoBuilder, SKIP };

/**
 * İç mekân geometri kurucusu: GeoBuilder + köşe başına animasyon vektörü (`anim`, blok): kayar kapı yaprakları gibi SLIDE grubundaki parçalar
 * açıklık × anim kadar öteler. `setAnim(dx,dy,dz)` sonraki çizimlerin vektörünü ayarlar (0,0,0 = sabit).
 */
export class IGeo extends GeoBuilder {
  constructor() {
    super();
    this.anim = [];
    this._an = [0, 0, 0];
  }

  setAnim(dx, dy, dz) {
    this._an = [dx, dy, dz];
    return this;
  }

  tri(a, b, c, hint, color, mat, uvs) {
    super.tri(a, b, c, hint, color, mat, uvs);
    for (let i = 0; i < 3; i++) this.anim.push(this._an[0], this._an[1], this._an[2]);
    return this;
  }
}

/** Renk paleti (sRGB onaltılık). */
export const C = Object.freeze({
  black: 0x161a27,
  panel: 0x1b2032,
  steelDark: 0x2b3349,
  steel: 0x4a5472,
  steelMid: 0x67728f,
  steelLight: 0x93a0bf,
  chrome: 0xbcc7de,
  white: 0xf2f6ff,
  cream: 0xe9dfcf,
  paper: 0xf2ead8,
  glass: 0x7fb7d8,
  glassDark: 0x24384a,
  woodLight: 0xb98a5a,
  wood: 0x8a5f3b,
  woodDark: 0x6a4630,
  woodDeep: 0x4a3426,
  leafA: 0x2f9a62,
  leafB: 0x3fbf78,
  leafC: 0x1f7a52,
  soil: 0x2a1f1a,
  clay: 0xb4663f,
  red: 0xe5484d,
  orange: 0xf08a2c,
  yellow: 0xffc933,
  green: 0x3bd77a,
  mint: 0x7fe3c1,
  cyan: 0x28f0ff,
  blue: 0x3b7bff,
  purple: 0x8a5cff,
  pink: 0xff3fa8,
  warm: 0xffe0a0,
  skin: 0xd9a77c,
});

export const FABRIC = Object.freeze([0x7d4e8a, 0x35456b, 0xa8505f, 0x3d8b78, 0xc08a3e, 0x4a5a90, 0x8a3d6a, 0x2f7a66]);
export const WOODS = Object.freeze([0x8a5f3b, 0x6a4630, 0xb98a5a, 0x4a3426, 0x9c7048, 0x6e5a48, 0xc9a06a, 0x5c4033]);
export const PASTEL = Object.freeze([0xf2c6d8, 0xc6e4f2, 0xf2e6c6, 0xc6f2d6, 0xe0c6f2, 0xf2d6c6, 0xd6e0f2, 0xf2f2c6]);
export const NEONS = Object.freeze([0x28f0ff, 0xff3fa8, 0xffae2b, 0xc8ff3a, 0x8a5cff, 0x3bd77a, 0xff6a3d, 0x3b7bff]);

export const fab = (v) => FABRIC[v & 7];
export const wd = (v) => WOODS[v & 7];

/** Malzeme kurucuları. */
export const M = Object.freeze({
  body: [0, 0, 0, 0],
  neon: (e) => [e === undefined ? 1 : e, 1, 0, 0],
  neonP: (mask, e, off) => [e === undefined ? 1 : e, 1, 32 + mask, off || 0],
  glow: (e) => [e === undefined ? 1 : e, 3, 0, 0],
  glowP: (mask, e, off) => [e === undefined ? 1 : e, 3, 32 + mask, off || 0],
  screen: (mask, e) => [e === undefined ? 1 : e, 5, mask === undefined ? 0 : 32 + mask, 0.05],
  pulse: (e) => [e === undefined ? 1 : e, 6, 0, 0],
  /** Yazı yüzleri: w = yüz en-boy oranı / 8 (gölgelendirici metni oranına göre sığdırır). */
  sign: (aspect) => [1, 2, 0, (aspect || 1) / 8],
  board: (aspect) => [1, 8, 0, (aspect || 1) / 8],
  /** gövdeyi yalnız maskedeki durumlarda göster. */
  vis: (mask) => [0, 0, 96 + mask, 0],
  visGlow: (mask, e) => [e === undefined ? 1 : e, 3, 96 + mask, 0],
  visNeon: (mask, e) => [e === undefined ? 1 : e, 1, 96 + mask, 0],
  slide: (mask) => [0, 0, 160 + mask, 0],
  slideNeon: (mask, e) => [e === undefined ? 1 : e, 1, 160 + mask, 0],
  holo: (e, mask) => [e === undefined ? 1 : e, 7, mask === undefined ? 0 : 32 + mask, 0],
});

/** Değerleri çarpışma/boyut kutusuna sığdırmak için sıkıştırır. */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Üst kenarları pahlı kutu: üst yüz bev kadar içe girer (4 eğik yüz). */
export function chamfBox(b, x0, y0, z0, x1, y1, z1, color, mat, bev, topColor) {
  const e = bev === undefined ? 0.05 : bev;
  const tc = topColor === undefined ? color : topColor;
  b.box(x0, y0, z0, x1, y1 - e, z1, color, mat, SKIP.PY);
  const a = x0 + e; const c = x1 - e; const d = z0 + e; const f = z1 - e; const y = y1 - e;
  b.quad([x0, y, z1], [x1, y, z1], [c, y1, f], [a, y1, f], [0, 0.7, 0.7], color, mat);
  b.quad([x1, y, z0], [x0, y, z0], [a, y1, d], [c, y1, d], [0, 0.7, -0.7], color, mat);
  b.quad([x0, y, z0], [x0, y, z1], [a, y1, f], [a, y1, d], [-0.7, 0.7, 0], color, mat);
  b.quad([x1, y, z1], [x1, y, z0], [c, y1, d], [c, y1, f], [0.7, 0.7, 0], color, mat);
  b.quad([a, y1, f], [c, y1, f], [c, y1, d], [a, y1, d], [0, 1, 0], tc, mat);
}

/** Dikey silindir (n kenarlı prizma). */
export function cyl(b, cx, cz, y0, y1, r, n, color, mat, capTop, capBottom, rot) {
  b.prism(cx, cz, y0, y1, r, r, n, color, mat, capTop !== false, !!capBottom, rot);
}

/** Dört bacak (kare kesit t). */
export function legs(b, x0, z0, x1, z1, yTop, t, color, mat, inset) {
  const i = inset || 0;
  const m = mat || M.body;
  b.box(x0 + i, 0, z0 + i, x0 + i + t, yTop, z0 + i + t, color, m, SKIP.NY);
  b.box(x1 - i - t, 0, z0 + i, x1 - i, yTop, z0 + i + t, color, m, SKIP.NY);
  b.box(x0 + i, 0, z1 - i - t, x0 + i + t, yTop, z1 - i, color, m, SKIP.NY);
  b.box(x1 - i - t, 0, z1 - i - t, x1 - i, yTop, z1 - i, color, m, SKIP.NY);
}

/** İnce neon çubuk (kutu); yönü eksenler belirler. */
export function bar(b, x0, y0, z0, x1, y1, z1, color, mat) {
  b.box(x0, y0, z0, x1, y1, z1, color === undefined ? C.cyan : color, mat || M.neon(1));
}

/** Ön yüze (+Z, dir=1) ya da arka yüze (-Z) bakan düz dikdörtgen. */
export function face(b, x0, y0, x1, y1, z, dir, color, mat, uvs) {
  if (dir >= 0) b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], color, mat, uvs);
  else b.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], [0, 0, -1], color, mat, uvs);
}

/** Yüzü +X (dir=1) ya da -X (dir=-1) bakan düz dikdörtgen (z0..z1, y0..y1, x sabit). */
export function sideFace(b, z0, y0, z1, y1, x, dir, color, mat) {
  if (dir >= 0) b.quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], [1, 0, 0], color, mat);
  else b.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], [-1, 0, 0], color, mat);
}

/** Üst yüz (+Y) düz dikdörtgen. */
export function topFace(b, x0, z0, x1, z1, y, color, mat) {
  b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], color, mat);
}

/** Zar yüzü (1..6 nokta) +Z yüzüne: merkez (cx,cy), kenar s, düzlem z. Zemin açık kâğıt, noktalar koyu. */
export function dicePips(b, cx, cy, z, s, n, pipColor) {
  const h = s / 2;
  const p = s * 0.2;
  const sets = [
    [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  ];
  b.quad([cx - h, cy - h, z], [cx + h, cy - h, z], [cx + h, cy + h, z], [cx - h, cy + h, z], [0, 0, 1], C.white, M.body);
  const pts = sets[clamp(n | 0, 1, 6) - 1];
  const r = s * 0.075;
  for (let i = 0; i < pts.length; i++) {
    const px = cx + pts[i][0] * p * 1.4;
    const py = cy + pts[i][1] * p * 1.4;
    b.quad([px - r, py - r, z + 0.003], [px + r, py - r, z + 0.003], [px + r, py + r, z + 0.003], [px - r, py + r, z + 0.003], [0, 0, 1], pipColor === undefined ? C.black : pipColor, M.body);
  }
}

/** Rafı/tezgâhı dolduran "kitap sırası": x0..x1 boyunca renkli dikey sırtlar (yükseklikleri belirlenimci). */
export function bookRow(b, x0, x1, y0, z0, z1, seed, hMax) {
  let x = x0;
  let i = 0;
  const cols = [0xc0504a, 0x3b7bff, 0xf0b24c, 0x3d8b78, 0x8a5cff, 0xe9dfcf, 0xff6a9a, 0x4aa8c0];
  while (x < x1 - 0.04) {
    const w = 0.06 + ((seed * 7 + i * 13) % 5) * 0.016;
    const h = (hMax || 0.34) - (((seed + i * 5) % 4) * 0.035);
    const xe = Math.min(x1, x + w);
    b.box(x, y0, z0, xe, y0 + h, z1, cols[(seed + i * 3) % cols.length], M.body, SKIP.NY | SKIP.NZ | SKIP.NX | SKIP.PX);
    x = xe + 0.006;
    i++;
  }
}

/** Basit yaprak topu (ico) + gövde: bitki yardımcısı. */
export function bush(b, cx, cy, cz, r, color, sy) {
  b.ico(cx, cy, cz, r, color, M.body, sy);
}

/** Atlas yüzü için uv (v tuvalin üstünden; sol-alt köşe p0). */
export const SIGN_UV = Object.freeze([[0, 1], [1, 1], [1, 0], [0, 0]]);

/** x–y düzleminde dışbükey profili z0..z1 boyunca çıkarır (yan kenarlar + isteğe bağlı iki kapak). skip: 1 (−z kapak), 2 (+z kapak). */
export function extrudeZ(b, z0, z1, pts, color, mat, skip) {
  let cx = 0;
  let cy = 0;
  pts.forEach((p) => { cx += p[0]; cy += p[1]; });
  cx /= pts.length;
  cy /= pts.length;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % n];
    const hx = (a[0] + c[0]) / 2 - cx;
    const hy = (a[1] + c[1]) / 2 - cy;
    b.quad([a[0], a[1], z0], [c[0], c[1], z0], [c[0], c[1], z1], [a[0], a[1], z1], [hx, hy, 0], color, mat);
  }
  for (let side = 0; side < 2; side++) {
    if ((skip | 0) & (side + 1)) continue;
    const z = side === 0 ? z0 : z1;
    const hint = [0, 0, side === 0 ? -1 : 1];
    for (let i = 1; i < n - 1; i++) b.tri([pts[0][0], pts[0][1], z], [pts[i][0], pts[i][1], z], [pts[i + 1][0], pts[i + 1][1], z], hint, color, mat);
  }
}
