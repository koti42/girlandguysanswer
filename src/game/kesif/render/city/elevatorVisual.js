/*
 * KEŞİF render/city — ASANSÖR KABİNİ görseli (sözleşme §1.11; Neon Meridyen kule çekirdekleri). Kabin fiziği dinamik prop'tur (sim/city/elevators);
 * prop çizicisinde kabin için mesh tanımı olmadığından bu dosya kabinin KENDİ görselini çizer: tek birleşik geometri (vertexColors, MeshBasicMaterial,
 * toneMapped:false, fog:true — mob düşme efektleriyle aynı malzeme ailesi: yeni shader programı yok) → 1 çizim çağrısı / kabin.
 *
 *   createElevatorVisual(THREE, opts?) → { group, setY(platformTop), setXZ(x,z), setLit(0..1), dispose() }
 *   opts.face 'n'|'e'|'s'|'w' = kapının bulunduğu yüz: kabin o yüzde AÇIKTIR (kapı açıklığı görünsün); diğer üç yüzde ince duvar kaplaması + tavan ışık paneli
 *   (kuyu karanlık değil: yolcu kabinin içini görür, dışarıdan açık kapıdan aydınlık kabin görünür).
 *   Kabin: koyu çelik zemin plakası (2×2, 0.25), camgöbeği neon kenar bandı, sıcak orta işaret, açık gri duvar kaplaması + neon dikey şerit, tavan ışık paneli (y+3).
 *   Yanıp sönme YOK (strobo yasak): setLit yalnız parlaklığı yumuşak değiştirir. Zemin üst yüzü = setY.
 */
/* MeshBasicMaterial köşe renkleri DOĞRUSAL uzayda (çıkışta sRGB'ye çevrilir): koyu değerler ekranda göründüğünden çok daha açık çıkar → küçük sayılar */
const STEEL = [0.013, 0.018, 0.032];
const STEEL_TOP = [0.03, 0.04, 0.076];
const NEON = [0.02, 0.42, 0.6];
const WARM = [0.6, 0.45, 0.15];
const PANEL = [0.045, 0.06, 0.1];
const RAIL = [0.18, 0.22, 0.32];
const CEIL = [0.32, 0.34, 0.38];
const H = 3;

function box(pos, col, x0, y0, z0, x1, y1, z1, c, top) {
  const t = top || c;
  const f = (a, b, d, e, g, h, i, j, k, l, m, n, color, mul) => {
    pos.push(a, b, d, e, g, h, i, j, k, a, b, d, i, j, k, l, m, n);
    for (let q = 0; q < 6; q++) col.push(color[0] * mul, color[1] * mul, color[2] * mul);
  };
  f(x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0, t, 1); // +Y
  f(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, c, 0.45); // -Y
  f(x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1, c, 0.82); // +X
  f(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, c, 0.82); // -X
  f(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, c, 0.7); // +Z
  f(x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0, c, 0.7); // -Z
}

export function createElevatorVisual(THREE, opts) {
  const face = opts && opts.face ? opts.face : null;
  const pos = [];
  const col = [];
  // zemin plakası: yerel y 0 = platform ÜST yüzü; plaka altına 0.25 uzanır
  box(pos, col, -0.98, -0.25, -0.98, 0.98, 0, 0.98, STEEL, STEEL_TOP);
  const e = 0.07;
  box(pos, col, -0.98, 0, -0.98, 0.98, 0.02, -0.98 + e, NEON);
  box(pos, col, -0.98, 0, 0.98 - e, 0.98, 0.02, 0.98, NEON);
  box(pos, col, -0.98, 0, -0.98 + e, -0.98 + e, 0.02, 0.98 - e, NEON);
  box(pos, col, 0.98 - e, 0, -0.98 + e, 0.98, 0.02, 0.98 - e, NEON);
  box(pos, col, -0.5, 0, -0.04, 0.5, 0.012, 0.04, WARM);
  box(pos, col, -0.04, 0, -0.5, 0.04, 0.012, 0.5, WARM);
  // duvar kaplaması (kapı yüzü hariç): kuyu iç yüzüne 0.04 içeride ince panel + ortada dikey neon şerit
  const t = 0.05;
  const lo = -1 + 0.03;
  const hi = 1 - 0.03;
  const side = (key, x0, z0, x1, z1) => {
    if (face === key) return;
    box(pos, col, x0, 0.02, z0, x1, H, z1, PANEL);
  };
  side('n', lo, lo, hi, lo + t);
  side('s', lo, hi - t, hi, hi);
  side('w', lo, lo, lo + t, hi);
  side('e', hi - t, lo, hi, hi);
  const strip = (key, x0, z0, x1, z1) => {
    if (face === key) return;
    box(pos, col, x0, 0.4, z0, x1, H - 0.4, z1, NEON);
  };
  strip('n', -0.03, lo + t, 0.03, lo + t + 0.02);
  strip('s', -0.03, hi - t - 0.02, 0.03, hi - t);
  strip('w', lo + t, -0.03, lo + t + 0.02, 0.03);
  strip('e', hi - t - 0.02, -0.03, hi - t, 0.03);
  // tutunma barı (yatay, belden): kapı yüzü hariç her duvarda
  const rail = (key, x0, z0, x1, z1) => {
    if (face === key) return;
    box(pos, col, x0, 0.95, z0, x1, 1.02, z1, RAIL);
  };
  rail('n', lo + 0.1, lo + t, hi - 0.1, lo + t + 0.05);
  rail('s', lo + 0.1, hi - t - 0.05, hi - 0.1, hi - t);
  rail('w', lo + t, lo + 0.1, lo + t + 0.05, hi - 0.1);
  rail('e', hi - t - 0.05, lo + 0.1, hi - t, hi - 0.1);
  // tavan ışık paneli (altına bakan yüz parlak): kapı yüzünde de lento
  box(pos, col, lo, H, lo, hi, H + 0.06, hi, STEEL, CEIL);
  box(pos, col, -0.5, H - 0.02, -0.5, 0.5, H, 0.5, CEIL);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, toneMapped: false, fog: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = true;
  mesh.name = 'asansor-kabini';
  const group = new THREE.Group();
  group.name = 'asansor';
  group.add(mesh);
  let lit = 1;
  let disposed = false;
  return {
    group,
    mesh,
    setY(y) {
      group.position.y = y;
    },
    setXZ(x, z) {
      group.position.x = x;
      group.position.z = z;
    },
    setLit(v) {
      lit = v < 0 ? 0 : v > 1 ? 1 : v;
      const k = 0.55 + 0.45 * lit;
      mat.color.setRGB(k, k, k);
    },
    get lit() {
      return lit;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (group.parent) group.parent.remove(group);
      geo.dispose();
      mat.dispose();
    },
  };
}
