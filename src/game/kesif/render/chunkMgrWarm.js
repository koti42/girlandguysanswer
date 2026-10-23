/*
 * KEŞİF render — görünmeyen (arkada/tıkalı) chunk mesh'lerini seçme (GPU'ya önceden yükleme için; saf mantık, three yok).
 *
 *   pickHiddenBands(recs, x, y, z, far, max, isDone, out) → out (en yakından başlayarak ≤ max mesh)
 *
 * Neden: mesh geometrisi GPU'ya ilk ÇİZİLDİĞİNDE yüklenir. Kamera ilk kez geri döndüğünde (180° dönüş, üçüncü şahıs-önden kamera, uçarken
 * yön değişimi) arkada biriken ~170 mesh tek karede yüklenir (gerçek RTX 3060'ta ~100 ms). Çizilmeyen ama sis mesafesi içindeki
 * mesh'ler kare başına birkaç tane, tek piksellik makasla önceden yüklenirse sıçrama yayılır.
 */

/**
 * recs: Map|{forEach} (sütun kaydı: bands[] bant kaydı: {hasMesh, visible, meshes[3], sphere:{x,y,z,r}}).
 * isDone(mesh): bu mesh'in (geometrisinin) yüklemesi yapıldı mı. out: yeniden kullanılan dizi.
 */
export function pickHiddenBands(recs, x, y, z, far, max, isDone, out) {
  out.length = 0;
  if (!(max > 0)) return out;
  // ayırmasız seçim: en yakın `max` aday (ekleme sırasıyla küçük diziyi tutar); sıralama/ara dizi yok
  const bestD = SCRATCH_D;
  const bestM = SCRATCH_M;
  const cap = max > SCRATCH_CAP ? SCRATCH_CAP : max;
  let n = 0;
  recs.forEach((rec) => {
    const bands = rec.bands;
    if (!bands) return;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      if (!b || !b.hasMesh || b.visible) continue;
      const s = b.sphere;
      const dx = s.x - x;
      const dy = s.y - y;
      const dz = s.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - s.r;
      if (d > far) continue;
      if (n === cap && d >= bestD[n - 1]) continue;
      let pick = null;
      for (let p = 0; p < 3; p++) {
        const m = b.meshes[p];
        if (m && m.geometry && !isDone(m)) {
          pick = m; // bant başına bir adım: aynı bantın diğer geçişleri sonraki karede
          break;
        }
      }
      if (!pick) continue;
      let j = n < cap ? n : n - 1;
      while (j > 0 && bestD[j - 1] > d) {
        bestD[j] = bestD[j - 1];
        bestM[j] = bestM[j - 1];
        j--;
      }
      bestD[j] = d;
      bestM[j] = pick;
      if (n < cap) n++;
    }
  });
  for (let i = 0; i < n; i++) {
    out.push(bestM[i]);
    bestM[i] = null; // (referans tutma)
  }
  return out;
}

const SCRATCH_CAP = 16;
const SCRATCH_D = new Float64Array(SCRATCH_CAP);
const SCRATCH_M = new Array(SCRATCH_CAP).fill(null);
