/*
 * KEŞİF render — devrilen ağaç animasyon matematiği (saf; three yok → node'da test edilir).
 *
 *   fallDuration(height) → sn            1,2–1,8 sn (ağaç boyuna göre)
 *   fallPose(t, T) → {angle, phase, k}   angle radyan (0 = dik, π/2 = yatık). phase 'tip' | 'bounce' | 'done'. k: 0..1 ilerleme
 *   crownPoint(hinge, dir, height, angle, out) → out   ağacın tepe noktasının dünya konumu
 *   tipPoint(hinge, dir, height, out) → out            yatınca tepenin yere değeceği nokta
 *   pathState(px, pz, hinge, dir, height) → {along, lateral}   oyuncunun düşüş koridoruna göre konumu
 *   shakeAmplitude(height, dist) → [0, 0.05]           kamera sarsıntısı (uzaklık 36 bloktan sonra 0)
 *   popOrder(cells) → indeks dizisi                    dev ağaç çöküşü: üstten alta, aynı katta konuma göre (belirlenimci)
 *
 * Tasarım: düşüş "ease-in" (yavaş başlar, hızlanır: gövde çatırdar); %80 sürede yere değer, kalan %20 sönümlü küçük sekme.
 */
import { TREE_TUNING } from '../sim/treeData.js';

const HALF_PI = Math.PI / 2;
const TIP_SHARE = 0.8;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function fallDuration(height) {
  const k = clamp((height - 4) / 16, 0, 1);
  return TREE_TUNING.fallMin + (TREE_TUNING.fallMax - TREE_TUNING.fallMin) * k;
}

export function fallPose(t, T) {
  if (!(T > 0) || t >= T) return { angle: HALF_PI, phase: 'done', k: 1 };
  const k = clamp(t / T, 0, 1);
  if (k < TIP_SHARE) {
    const u = k / TIP_SHARE;
    // çatırtı: ilk anlarda küçük titreme + üstel hızlanma
    const wob = u < 0.28 ? Math.sin(u * 95) * 0.012 * (1 - u / 0.28) : 0;
    return { angle: HALF_PI * Math.pow(u, 2.15) + wob, phase: 'tip', k };
  }
  const v = (k - TIP_SHARE) / (1 - TIP_SHARE);
  // sönümlü sekme: yerden hafifçe kalkar ve iner
  return { angle: HALF_PI - 0.085 * Math.sin(Math.PI * v) * (1 - v * 0.6), phase: 'bounce', k };
}

export function crownPoint(hinge, dir, height, angle, out) {
  const s = Math.sin(angle);
  out.x = hinge.x + dir.dx * s * height;
  out.y = hinge.y + Math.cos(angle) * height;
  out.z = hinge.z + dir.dz * s * height;
  return out;
}

export function tipPoint(hinge, dir, height, out) {
  out.x = hinge.x + dir.dx * height;
  out.y = hinge.y;
  out.z = hinge.z + dir.dz * height;
  return out;
}

/** along: menteşeden devrilme yönündeki mesafe; lateral: yana uzaklık (işaretli, sağ = +). */
export function pathState(px, pz, hinge, dir, height) {
  const vx = px - hinge.x;
  const vz = pz - hinge.z;
  return {
    along: vx * dir.dx + vz * dir.dz,
    lateral: vx * -dir.dz + vz * dir.dx,
    height,
  };
}

export function shakeAmplitude(height, dist) {
  if (!(dist >= 0)) return 0;
  const near = clamp(1 - dist / 36, 0, 1);
  return clamp(0.012 + height * 0.0022, 0, 0.05) * near;
}

/** Dev ağaç çöküşü sırası: yüksekten alçağa; eşit yükseklikte (x, z) sıralı. */
export function popOrder(cells) {
  const idx = [];
  for (let i = 0; i < cells.length; i++) idx.push(i);
  idx.sort((a, b) => cells[b].y - cells[a].y || cells[a].x - cells[b].x || cells[a].z - cells[b].z);
  return idx;
}
