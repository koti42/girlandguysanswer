/*
 * KEŞİF content sistemi — kapı/bariyer açma ANİMASYONLARI ve güvenli blok yazımı.
 *
 *   setBlockSafe(G, x, y, z, id, record=true) → bool     chunk yüklüyse world.setBlock, değilse bekleyen düzenleme (applyEdits)
 *   startOpenAnim(S, cells, opts)                          hücreleri sırayla havaya çevirir (yukarıdan aşağı, ortadan kenara)
 *       opts: {expect: blokId (yalnız bu blok silinir), seconds: 3, silent, instantFar: 120, onDone(), sound:'door', pitch:0.55}
 *   fixedAnims(S, dt)                                      her sabit adım: ilerler; yakındaysa toz + gürleme sesi
 *   flushAnims(S)                                          kalanları hemen bitirir (dispose/test)
 *
 * Oyuncu 120 bloktan uzaktaysa animasyon atlanır (anında açılır). Toz parçacığı hücre başına değil, yaklaşık her 2 hücrede bir.
 */
export function setBlockSafe(G, x, y, z, id, record) {
  const w = G.world;
  if (!w) return false;
  const cur = w.getBlock(x, y, z);
  if (cur === null) {
    if (typeof w.applyEdits === 'function') {
      w.applyEdits([[x, y, z, id]]);
      return true;
    }
    return false;
  }
  if (cur === id) return true;
  return w.setBlock(x, y, z, id, record === false ? { record: false } : undefined);
}

export function startOpenAnim(S, cells, opts) {
  const G = S.G;
  const o = opts || {};
  const list = cells.slice();
  // yukarıdan aşağı; aynı yükseklikte merkezden kenara
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < list.length; i++) {
    cx += list[i].x;
    cz += list[i].z;
  }
  cx /= Math.max(1, list.length);
  cz /= Math.max(1, list.length);
  list.sort((a, b) => (b.y - a.y) || (Math.abs(a.x - cx) + Math.abs(a.z - cz)) - (Math.abs(b.x - cx) + Math.abs(b.z - cz)));
  const b = G.body;
  let near = true;
  if (b && list.length > 0) {
    const dx = b.x - cx;
    const dz = b.z - cz;
    near = dx * dx + dz * dz <= (o.instantFar || 120) * (o.instantFar || 120);
  }
  const anim = {
    cells: list, done: 0, t: 0, seconds: near && !o.silent ? (o.seconds || 3) : 0, expect: o.expect, onDone: o.onDone || null,
    sound: o.sound || 'door', pitch: o.pitch || 0.55, soundT: 0, near, silent: !!o.silent, cx, cz,
  };
  if (anim.seconds === 0) {
    finishAnim(S, anim);
    return anim;
  }
  S.anims.push(anim);
  return anim;
}

function removeCell(S, anim, c, dust) {
  const G = S.G;
  const cur = G.world.getBlock(c.x, c.y, c.z);
  if (cur === null) {
    G.world.applyEdits([[c.x, c.y, c.z, 0]]);
    return;
  }
  if (cur === 0) return;
  if (anim.expect !== undefined && cur !== anim.expect) return;
  G.world.setBlock(c.x, c.y, c.z, 0);
  if (dust) S.fx.blockDust(cur, c.x, c.y, c.z);
}

function finishAnim(S, anim) {
  for (let i = anim.done; i < anim.cells.length; i++) removeCell(S, anim, anim.cells[i], false);
  anim.done = anim.cells.length;
  if (anim.onDone) {
    const f = anim.onDone;
    anim.onDone = null;
    f();
  }
}

export function fixedAnims(S, dt) {
  if (S.anims.length === 0) return;
  const G = S.G;
  const b = G.body;
  for (let k = S.anims.length - 1; k >= 0; k--) {
    const a = S.anims[k];
    a.t += dt;
    const frac = Math.min(1, a.t / a.seconds);
    const want = Math.ceil(frac * a.cells.length);
    while (a.done < want) {
      const c = a.cells[a.done];
      removeCell(S, a, c, (a.done & 1) === 0);
      a.done++;
    }
    a.soundT -= dt;
    if (a.soundT <= 0 && !a.silent && b) {
      a.soundT = 0.45;
      S.fx.sound(a.sound, a.cx + 0.5, b.y + 1, a.cz + 0.5, a.pitch);
    }
    if (frac >= 1) {
      S.anims.splice(k, 1);
      finishAnim(S, a);
    }
  }
}

export function flushAnims(S) {
  while (S.anims.length > 0) {
    const a = S.anims.pop();
    finishAnim(S, a);
  }
}
