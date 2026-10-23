/*
 * KEŞİF — terazi ("Denge Odası"): saf mantık (üretici, ölçü, çözülebilirlik). DOM/three yok.
 *
 * Ağırlıklar: taş=1, demir=2, altın=3, kuantum=5 (blocks.js'ten dört ayrı blok türü). Her terazinin iki kefesi vardır; bir kefedeki
 * toplam = ön yüklü GÖRÜNÜR ağırlıklar (fix) + GİZLİ kutular (hid; değer görünmez, yalnızca eğimle anlaşılır) + oyuncunun eklediği (add).
 *   mode 'equal'  : iki kefe eşit ve boş değil
 *   mode 'target' : sol kefe = tL ve sağ kefe = tR
 *   minKinds      : (d5) her kefede en az bu kadar FARKLI görünür ağırlık türü ("kombinasyon" kuralı)
 *
 *   WEIGHTS, WEIGHT_BLOCK, WEIGHT_ITEM, WEIGHT_NAME
 *   panSum(sc, side), visibleSum(sc, side), kindCount(sc, side), tiltOf(sc), targetLayers(sc)
 *   scaleBalanced(spec, sc) → boolean,  allBalanced(lay, state)
 *   solvable(lay, init) → boolean, findSolution(lay, init) → [{L:[n1,n2,n3,n5], R:[…]}] | null  (ortak stok ile kaba kuvvet)
 *   generateTerazi(difficulty, rng) → { lay, init:{stock, sc:[…]} }
 *
 * lay: { w,d,h, x0,x1, rackLz:[…4], stockMax, scales:[{lz, mode, tL,tR, minKinds, showSum, hidden}], emptyLever:{lx,lz}, resetLever:{lx,lz} }
 * init: { stock:[4 sayı: 1,2,3,5 türleri], sc:[{fixL,fixR,hidL,hidR,addL,addR,pL,pR,anim,ok}] }
 */
import { B } from '../blocks.js';
import { localXRange } from './kitGeometry.js';
import { chamberSize } from './kitChamber.js';
import { clamp } from './ps2Shared.js';

export const WEIGHTS = Object.freeze([1, 2, 3, 5]);
export const WEIGHT_BLOCK = Object.freeze({
  1: B.STONE, 2: B.IRON_BLOCK, 3: B.GOLD_BLOCK, 5: B.QUANTUM_BLOCK,
});
export const WEIGHT_ITEM = Object.freeze({
  1: 'blok:taş', 2: 'blok:demir_bloğu', 3: 'blok:altın_bloğu', 5: 'blok:kuantum_bloğu',
});
export const WEIGHT_NAME = Object.freeze({
  1: 'taş', 2: 'demir', 3: 'altın', 5: 'kuantum',
});
export const PAN_CAPACITY = 16;
export const RACK_MAX = 6;
export const HOLD_TIME = 1.0;

export function clampTeraziDifficulty(d) {
  const n = Math.round(Number(d));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, n));
}

export function teraziSize(difficulty) {
  const two = clampTeraziDifficulty(difficulty) >= 5;
  return chamberSize(9, two ? 20 : 12, 10);
}

function sumList(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}

/** Toplam (gizli dahil) ağırlık. side 'L' | 'R'. */
export function panSum(sc, side) {
  return side === 'L' ? sumList(sc.fixL) + sumList(sc.hidL) + sumList(sc.addL) : sumList(sc.fixR) + sumList(sc.hidR) + sumList(sc.addR);
}

/** Görünür toplam (gizli kutular hariç). */
export function visibleSum(sc, side) {
  return side === 'L' ? sumList(sc.fixL) + sumList(sc.addL) : sumList(sc.fixR) + sumList(sc.addR);
}

/** Görünür farklı ağırlık türü sayısı. */
export function kindCount(sc, side) {
  const seen = {};
  const a = side === 'L' ? sc.fixL.concat(sc.addL) : sc.fixR.concat(sc.addR);
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (!seen[a[i]]) {
      seen[a[i]] = true;
      n++;
    }
  }
  return n;
}

export function weightCount(sc, side) {
  return side === 'L' ? sc.fixL.length + sc.hidL.length + sc.addL.length : sc.fixR.length + sc.hidR.length + sc.addR.length;
}

/** Eğim −2..2 (sol ağırsa +). */
export function tiltOf(sc) {
  return clamp(panSum(sc, 'L') - panSum(sc, 'R'), -2, 2);
}

/** Kefelerin hedef katmanları [sol, sağ] (ağır olan aşağıda: katman 0..4, nötr 2). */
export function targetLayers(sc) {
  const t = tiltOf(sc);
  return [2 - t, 2 + t];
}

export function scaleBalanced(spec, sc) {
  const sl = panSum(sc, 'L');
  const sr = panSum(sc, 'R');
  if (sl <= 0 || sr <= 0) return false;
  if (spec.minKinds > 0 && (kindCount(sc, 'L') < spec.minKinds || kindCount(sc, 'R') < spec.minKinds)) return false;
  if (spec.mode === 'target') return sl === spec.tL && sr === spec.tR;
  return sl === sr;
}

export function allBalanced(lay, state) {
  for (let i = 0; i < lay.scales.length; i++) if (!scaleBalanced(lay.scales[i], state.sc[i])) return false;
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * Çözülebilirlik (kaba kuvvet; ortak stok)
 * ---------------------------------------------------------------------------------------------- */
function vectorsUnder(stock, maxTotal) {
  const out = [];
  for (let a = 0; a <= stock[0]; a++) {
    for (let b = 0; b <= stock[1]; b++) {
      for (let c = 0; c <= stock[2]; c++) {
        for (let d = 0; d <= stock[3]; d++) {
          if (a + b + c + d <= maxTotal) out.push([a, b, c, d]);
        }
      }
    }
  }
  return out;
}

function vecSum(v) {
  return v[0] * 1 + v[1] * 2 + v[2] * 3 + v[3] * 5;
}

function withAdds(sc, vl, vr) {
  const mk = (v) => {
    const a = [];
    for (let k = 0; k < 4; k++) for (let i = 0; i < v[k]; i++) a.push(WEIGHTS[k]);
    return a;
  };
  return Object.assign({}, sc, { addL: mk(vl), addR: mk(vr) });
}

function solveFrom(lay, init, idx, stock) {
  if (idx >= lay.scales.length) return [];
  const spec = lay.scales[idx];
  const sc = init.sc[idx];
  const vs = vectorsUnder(stock, PAN_CAPACITY - 4);
  for (let i = 0; i < vs.length; i++) {
    for (let j = 0; j < vs.length; j++) {
      const vl = vs[i];
      const vr = vs[j];
      const rest = [stock[0] - vl[0] - vr[0], stock[1] - vl[1] - vr[1], stock[2] - vl[2] - vr[2], stock[3] - vl[3] - vr[3]];
      if (rest[0] < 0 || rest[1] < 0 || rest[2] < 0 || rest[3] < 0) continue;
      const sl = panSum(sc, 'L') + vecSum(vl);
      const sr = panSum(sc, 'R') + vecSum(vr);
      if (spec.mode === 'target' ? (sl !== spec.tL || sr !== spec.tR) : sl !== sr) continue;
      if (!scaleBalanced(spec, withAdds(sc, vl, vr))) continue;
      const tail = solveFrom(lay, init, idx + 1, rest);
      if (tail) return [{ L: vl, R: vr }].concat(tail);
    }
  }
  return null;
}

/** Ortak stokla tüm teraziler aynı anda dengelenebilir mi? Döner: terazi başına {L:[a,b,c,d], R:[…]} sayım vektörleri | null. */
export function findSolution(lay, init) {
  return solveFrom(lay, init, 0, init.stock.slice());
}

export function solvable(lay, init) {
  return findSolution(lay, init) !== null;
}

/* ------------------------------------------------------------------------------------------------
 * Üretici
 * ---------------------------------------------------------------------------------------------- */
function emptySc(o) {
  return Object.assign({
    fixL: [], fixR: [], hidL: [], hidR: [], addL: [], addR: [], pL: 2, pR: 2, anim: 0, ok: false,
  }, o);
}

function pickW(rng, pool) {
  return pool[rng.int(0, pool.length - 1)];
}

function candidate(diff, rng) {
  const spec = (o) => Object.assign({
    mode: 'equal', tL: 0, tR: 0, minKinds: 0, showSum: false, hidden: false,
  }, o);
  if (diff === 1) {
    return {
      specs: [spec({})],
      scs: [emptySc({ fixL: [pickW(rng, [2, 3])] })],
      stock: [4, 2, 1, 0],
    };
  }
  if (diff === 2) {
    const l = rng.chance(0.5) ? [pickW(rng, [1, 2, 3])] : [pickW(rng, [1, 2]), pickW(rng, [1, 2])];
    const r = [pickW(rng, [1, 3])];
    return {
      specs: [spec({})],
      scs: [emptySc({ fixL: l, fixR: r })],
      stock: [3, 2, 2, 0],
    };
  }
  if (diff === 3) {
    const a = pickW(rng, [1, 2]);
    const b = pickW(rng, [1, 2]);
    return {
      specs: [spec({ mode: 'target', tL: a + rng.int(3, 6), tR: b + rng.int(2, 5), showSum: true })],
      scs: [emptySc({ fixL: [a], fixR: [b] })],
      stock: [4, 2, 2, 0],
    };
  }
  if (diff === 4) {
    return {
      specs: [spec({ hidden: true })],
      scs: [emptySc({ hidL: [pickW(rng, [2, 3])], fixL: rng.chance(0.5) ? [1] : [], fixR: rng.chance(0.5) ? [1] : [] })],
      stock: [3, 3, 2, 1],
    };
  }
  const a = pickW(rng, [1, 2]);
  const b = pickW(rng, [1, 2]);
  return {
    specs: [
      spec({ hidden: true }),
      spec({
        mode: 'target', tL: a + rng.int(4, 6), tR: b + rng.int(3, 6), minKinds: 2, showSum: true,
      }),
    ],
    scs: [
      emptySc({ hidL: [pickW(rng, [2, 3])], fixR: [pickW(rng, [1, 2])] }),
      emptySc({ fixL: [a], fixR: [b] }),
    ],
    stock: [4, 3, 3, 1],
  };
}

function fallback(diff) {
  const mk = (specs, scs, stock) => ({ specs, scs, stock });
  const base = {
    mode: 'equal', tL: 0, tR: 0, minKinds: 0, showSum: false, hidden: false,
  };
  if (diff >= 5) {
    return mk(
      [Object.assign({}, base, { hidden: true }), Object.assign({}, base, {
        mode: 'target', tL: 7, tR: 5, minKinds: 2, showSum: true,
      })],
      [emptySc({ hidL: [2], fixR: [1] }), emptySc({ fixL: [1], fixR: [2] })],
      [4, 3, 3, 1],
    );
  }
  return mk([Object.assign({}, base, diff === 3 ? {
    mode: 'target', tL: 5, tR: 4, showSum: true,
  } : {})], [emptySc({ fixL: [2], fixR: diff === 3 ? [1] : [] })], [4, 2, 2, 1]);
}

/** Üretir: belirlenimli (rng). Ön yüklü durum çözülmüş değildir ve çözülebilirlik kaba kuvvetle doğrulanır. */
export function generateTerazi(difficulty, rng) {
  const diff = clampTeraziDifficulty(difficulty);
  const size = teraziSize(diff);
  const xr = localXRange(size.w);
  let pick = null;
  for (let attempt = 0; attempt < 120 && !pick; attempt++) {
    const c = candidate(diff, rng);
    const lay = { scales: c.specs };
    const init = { stock: c.stock, sc: c.scs };
    let anyBalanced = false;
    for (let i = 0; i < c.specs.length; i++) if (scaleBalanced(c.specs[i], c.scs[i])) anyBalanced = true;
    if (anyBalanced) continue;
    if (!solvable(lay, init)) continue;
    pick = c;
  }
  if (!pick) pick = fallback(diff);
  const scales = pick.specs.map((s, i) => Object.assign({}, s, { lz: 7 + 8 * i }));
  const init = { stock: pick.stock.slice(), sc: pick.scs };
  for (let i = 0; i < init.sc.length; i++) {
    const lay = targetLayers(init.sc[i]);
    init.sc[i].pL = lay[0];
    init.sc[i].pR = lay[1];
  }
  return {
    lay: {
      w: size.w,
      d: size.d,
      h: size.h,
      x0: xr.x0,
      x1: xr.x1,
      rackLz: [0, 1, 2, 3],
      stockMax: RACK_MAX,
      scales,
      emptyLever: { lx: xr.x1, lz: 1 },
      resetLever: { lx: xr.x1, lz: 3 },
    },
    init,
  };
}
