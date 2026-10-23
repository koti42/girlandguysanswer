/*
 * KEŞİF sim — sarmal merdiven (saf). Tapınak kuyusu (aşağı) ve gözcü kulesi (yukarı) ortak kullanır.
 *
 * Yerel çerçevede (lx sağ, lz ileri) merkez (cx,cz) çevresinde halka r ∈ [rIn, rOut]. Açı a, +lz yönünden +lx'e doğru ölçülür:
 *   lx = cx + r·sin a,  lz = cz + r·cos a.   Üst basamak açısı topAngle'dır; derinlik u arttıkça açı a = topAngle + 2π·u.
 * Basamak yüksekliği: tepe y = yTop − round(D·u/U); aynı sütunda her tur D/U blok farkla üst üste (kafa boşluğu ≥ 5).
 * Komşu hücreler arası fark ≤ 1 (yürünür). Halka dışında merkez sütun ve duvar çağıranın işidir.
 */
import { B } from './blocks.js';

export const TAU = Math.PI * 2;

/** Tur sayısı: D/U ≈ 8 (6,2–10,5 aralığı), 0,25'in katı. */
export function helixTurns(D) {
  return Math.max(0.75, Math.round((D / 8) * 4) / 4);
}

/** Üstten alta: tur başına yükseklik. */
export function helixPerTurn(D) {
  return D / helixTurns(D);
}

function normAngle(a) {
  let r = a % TAU;
  if (r < 0) r += TAU;
  return r;
}

/** Hücrenin (dx,dz merkeze göre) açısı. */
export function cellAngle(dx, dz) {
  return normAngle(Math.atan2(dx, dz));
}

/** u parametresindeki merkez hattı açısı. */
export function angleAtU(topAngle, u) {
  return normAngle(topAngle + TAU * u);
}

/** Basamak üst yüksekliği (indeks) */
export function stepDrop(u, D, U) {
  return Math.round((D * u) / U);
}

/**
 * Halkayı çizer. o: {cx,cz,rIn,rOut,yTop,D,U,topAngle, stepId, altId}
 * Hacmi (basamakların üstü) çağıran önceden oymuş olmalı. Döner {count}.
 */
export function buildHelix(L, o) {
  const { cx, cz, rIn, rOut, yTop, D, U, topAngle } = o;
  const stepId = o.stepId;
  const altId = o.altId === undefined ? stepId : o.altId;
  const ri2 = rIn * rIn;
  const ro2 = rOut * rOut;
  const R = Math.ceil(rOut);
  let count = 0;
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 < ri2 || d2 > ro2) continue;
      const a = cellAngle(dx, dz);
      const u0 = normAngle(a - topAngle + 1e-7) / TAU; // sınırdaki (tam eksen) hücreler üst basamağa ait
      for (let m = 0; u0 + m <= U + 1e-9; m++) {
        const idx = stepDrop(u0 + m, D, U);
        const ly = yTop - idx;
        const id = ((dx + dz + m) & 1) === 0 ? stepId : altId;
        if (L.set(cx + dx, ly, cz + dz, id)) count++;
      }
    }
  }
  return { count };
}

/** Merkez hattı üzerinde u için {lx,ly,lz} (basamak üstü). */
export function helixPoint(o, u, r) {
  const a = angleAtU(o.topAngle, u);
  const rr = r === undefined ? (o.rIn + o.rOut) / 2 : r;
  return {
    lx: o.cx + Math.round(rr * Math.sin(a)),
    lz: o.cz + Math.round(rr * Math.cos(a)),
    ly: o.yTop - stepDrop(u, o.D, o.U),
  };
}

/**
 * Halkanın dış kenarında korkuluk: d² ∈ (r2Lo, r2Hi]; giriş sektörü (topAngle ± openHalf) hariç. ly'de tek katman.
 */
export function buildRailing(L, o, ly, openHalf, r2Lo, r2Hi, id) {
  const R = Math.ceil(Math.sqrt(r2Hi)) + 1;
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2Lo || d2 > r2Hi) continue;
      const a = cellAngle(dx, dz);
      let da = Math.abs(a - o.topAngle);
      if (da > Math.PI) da = TAU - da;
      if (da <= openHalf) continue;
      L.set(o.cx + dx, ly, o.cz + dz, id === undefined ? B.FENCE : id);
    }
  }
}
