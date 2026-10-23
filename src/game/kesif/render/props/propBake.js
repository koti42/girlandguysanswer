/*
 * KEŞİF render/props — İÇ MEKÂN PROP PİŞİRME (three'siz, saf tipli diziler; node'da test edilir).
 * Bir chunk'ın iç mekân proplarını TEK köşe tamponuna "pişirir": her örnek, tanımın şablonunu (propGeoInterior.Template) yaw/konumla dönüştürerek
 * köşe öznitelik dizilerine yazar. Böylece yüzlerce tanım ≤ chunk sayısı kadar çizim çağrısıyla çizilir (sözleşme §6: ≤40 çağrı).
 *
 *   bakeChunk(items, ox, oz) → Baked
 *     items[i] = {id, tmpl, x, y, z, yaw (0..3), state, phase (0..255), dev (0..255), mode (0..4), tint [r,g,b] (sRGB 0..255),
 *                 sign [u0,v0,u1,v1] (0..1) | null, light [sky, block] (0..255), stateful: bool}
 *     Baked = {n, tris, pos Float32[n*3] (chunk-yerel: x−ox, y, z−oz), nor Int8[n*4], uv Uint16[n*2], col Uint8[n*4], mat Uint8[n*4], inst Uint8[n*4],
 *              sign Uint16[n*4], light Uint8[n*4], tint Uint8[n*4], anim Int8[n*4], ranges [{id, v0, n, stateful, slide}], bounds {min,max} (yerel),
 *              holo [{id, tmpl, x, y, z, yaw, state, tint}], bytes}
 *   setState(baked, range, state) · setOpen(baked, range, amount 0..1) · setLight(baked, range, sky, block)    yerinde bayt yazar; true = değişti
 *   BYTES_PER_VERTEX
 * Öznitelik sözleşmesi (propShadersBaked.js): normal Int8 normalize · uv Uint16 normalize · aCol Uint8 normalize (sRGB+AO) · aMat Uint8 ham
 * · aInst Uint8 ham [durum, faz, sapma, kip] · aSign Uint16 normalize · aLight Uint8 normalize · aTint Uint8 normalize (sRGB) · aAnim Int8 normalize.
 */
export const BYTES_PER_VERTEX = 12 + 4 + 4 + 4 + 4 + 4 + 8 + 4 + 4 + 4;

const COS = [1, 0, -1, 0];
const SIN = [0, 1, 0, -1];

function q8(v) {
  const r = Math.round(v * 127);
  return r < -127 ? -127 : r > 127 ? 127 : r;
}

export function bakeChunk(items, ox, oz) {
  let n = 0;
  let holoN = 0;
  for (let i = 0; i < items.length; i++) {
    n += items[i].tmpl.n;
    if (items[i].tmpl.holo) holoN++;
  }
  const pos = new Float32Array(n * 3);
  const nor = new Int8Array(n * 4);
  const uv = new Uint16Array(n * 2);
  const col = new Uint8Array(n * 4);
  const mat = new Uint8Array(n * 4);
  const inst = new Uint8Array(n * 4);
  const sign = new Uint16Array(n * 4);
  const light = new Uint8Array(n * 4);
  const tint = new Uint8Array(n * 4);
  const anim = new Int8Array(n * 4);
  const ranges = [];
  const holo = [];
  let x0 = Infinity; let y0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let y1 = -Infinity; let z1 = -Infinity;
  let v = 0;
  for (let it = 0; it < items.length; it++) {
    const m = items[it];
    const t = m.tmpl;
    const k = m.yaw & 3;
    const c = COS[k];
    const s = SIN[k];
    const px = m.x - ox;
    const pz = m.z - oz;
    const sg = m.sign;
    const s0 = sg ? Math.round(sg[0] * 65535) : 0;
    const s1 = sg ? Math.round(sg[1] * 65535) : 0;
    const s2 = sg ? Math.round(sg[2] * 65535) : 65535;
    const s3 = sg ? Math.round(sg[3] * 65535) : 65535;
    const v0 = v;
    let slide = false;
    for (let i = 0; i < t.n; i++, v++) {
      const lx = t.pos[i * 3];
      const ly = t.pos[i * 3 + 1];
      const lz = t.pos[i * 3 + 2];
      const wx = px + lx * c + lz * s;
      const wz = pz - lx * s + lz * c;
      const wy = m.y + ly;
      pos[v * 3] = wx; pos[v * 3 + 1] = wy; pos[v * 3 + 2] = wz;
      if (wx < x0) x0 = wx; if (wx > x1) x1 = wx;
      if (wy < y0) y0 = wy; if (wy > y1) y1 = wy;
      if (wz < z0) z0 = wz; if (wz > z1) z1 = wz;
      const nx = t.nor[i * 3];
      const nz = t.nor[i * 3 + 2];
      nor[v * 4] = q8(nx * c + nz * s);
      nor[v * 4 + 1] = q8(t.nor[i * 3 + 1]);
      nor[v * 4 + 2] = q8(-nx * s + nz * c);
      uv[v * 2] = t.uv[i * 2]; uv[v * 2 + 1] = t.uv[i * 2 + 1];
      col[v * 4] = t.col[i * 4]; col[v * 4 + 1] = t.col[i * 4 + 1]; col[v * 4 + 2] = t.col[i * 4 + 2]; col[v * 4 + 3] = t.col[i * 4 + 3];
      mat[v * 4] = t.mat[i * 4]; mat[v * 4 + 1] = t.mat[i * 4 + 1]; mat[v * 4 + 2] = t.mat[i * 4 + 2]; mat[v * 4 + 3] = t.mat[i * 4 + 3];
      if (t.mat[i * 4 + 2] >= 160) slide = true;
      inst[v * 4] = m.state; inst[v * 4 + 1] = m.phase; inst[v * 4 + 2] = m.dev; inst[v * 4 + 3] = m.mode;
      sign[v * 4] = s0; sign[v * 4 + 1] = s1; sign[v * 4 + 2] = s2; sign[v * 4 + 3] = s3;
      light[v * 4] = m.light[0]; light[v * 4 + 1] = m.light[1];
      tint[v * 4] = m.tint[0]; tint[v * 4 + 1] = m.tint[1]; tint[v * 4 + 2] = m.tint[2];
      if (t.anim) {
        const ax = t.anim[i * 4];
        const az = t.anim[i * 4 + 2];
        anim[v * 4] = Math.round(ax * c + az * s);
        anim[v * 4 + 1] = t.anim[i * 4 + 1];
        anim[v * 4 + 2] = Math.round(-ax * s + az * c);
      }
    }
    ranges.push({
      id: m.id, v0, n: t.n, stateful: !!m.stateful, slide,
    });
    if (t.holo) {
      holo.push({
        id: m.id, tmpl: t, x: m.x, y: m.y, z: m.z, yaw: m.yaw, state: m.state, tint: m.tint,
      });
    }
  }
  if (n === 0) { x0 = y0 = z0 = x1 = y1 = z1 = 0; }
  return {
    n,
    tris: n / 3,
    pos,
    nor,
    uv,
    col,
    mat,
    inst,
    sign,
    light,
    tint,
    anim,
    ranges,
    holo,
    holoCount: holoN,
    bounds: { min: [x0, y0, z0], max: [x1, y1, z1] },
    bytes: n * BYTES_PER_VERTEX,
  };
}

/** Bir örneğin köşe aralığına durum baytı yazar. Değiştiyse true. */
export function setState(baked, range, state) {
  const a = baked.inst;
  const s = state & 255;
  if (a[range.v0 * 4] === s) return false;
  const e = (range.v0 + range.n) * 4;
  for (let i = range.v0 * 4; i < e; i += 4) a[i] = s;
  return true;
}

/** Kayan parça açıklık miktarı 0..1 (aAnim.w). */
export function setOpen(baked, range, amount) {
  const a = baked.anim;
  const w = Math.round((amount < 0 ? 0 : amount > 1 ? 1 : amount) * 127);
  if (a[range.v0 * 4 + 3] === w) return false;
  const e = (range.v0 + range.n) * 4;
  for (let i = range.v0 * 4 + 3; i < e; i += 4) a[i] = w;
  return true;
}

export function setLight(baked, range, sky, block) {
  const a = baked.light;
  if (a[range.v0 * 4] === sky && a[range.v0 * 4 + 1] === block) return false;
  const e = (range.v0 + range.n) * 4;
  for (let i = range.v0 * 4; i < e; i += 4) {
    a[i] = sky;
    a[i + 1] = block;
  }
  return true;
}

/**
 * Holo geometrisi: görünür holo örneklerinin (şablon.holo) birleşik köşe dizileri (dünya-yerel, origin = (ox, oz)). Tek çizim çağrısı.
 * list[i] = {tmpl, x, y, z, yaw, state, tint, phase}
 */
export function bakeHolo(list, ox, oz) {
  let n = 0;
  for (let i = 0; i < list.length; i++) n += list[i].tmpl.holo.n;
  const pos = new Float32Array(n * 3);
  const nor = new Int8Array(n * 4);
  const uv = new Uint16Array(n * 2);
  const mat = new Uint8Array(n * 4);
  const inst = new Uint8Array(n * 4);
  const tint = new Uint8Array(n * 4);
  const col = new Uint8Array(n * 4);
  let v = 0;
  for (let it = 0; it < list.length; it++) {
    const m = list[it];
    const h = m.tmpl.holo;
    const k = m.yaw & 3;
    const c = COS[k];
    const s = SIN[k];
    for (let i = 0; i < h.n; i++, v++) {
      const lx = h.pos[i * 3];
      const lz = h.pos[i * 3 + 2];
      pos[v * 3] = m.x - ox + lx * c + lz * s;
      pos[v * 3 + 1] = m.y + h.pos[i * 3 + 1];
      pos[v * 3 + 2] = m.z - oz - lx * s + lz * c;
      const nx = h.nor[i * 3];
      const nz = h.nor[i * 3 + 2];
      nor[v * 4] = q8(nx * c + nz * s);
      nor[v * 4 + 1] = q8(h.nor[i * 3 + 1]);
      nor[v * 4 + 2] = q8(-nx * s + nz * c);
      uv[v * 2] = h.uv[i * 2]; uv[v * 2 + 1] = h.uv[i * 2 + 1];
      mat[v * 4] = h.mat[i * 4]; mat[v * 4 + 1] = h.mat[i * 4 + 1]; mat[v * 4 + 2] = h.mat[i * 4 + 2]; mat[v * 4 + 3] = h.mat[i * 4 + 3];
      col[v * 4] = h.col[i * 4]; col[v * 4 + 1] = h.col[i * 4 + 1]; col[v * 4 + 2] = h.col[i * 4 + 2]; col[v * 4 + 3] = 255;
      inst[v * 4] = m.state; inst[v * 4 + 1] = m.phase | 0; inst[v * 4 + 2] = 0; inst[v * 4 + 3] = 0;
      tint[v * 4] = m.tint[0]; tint[v * 4 + 1] = m.tint[1]; tint[v * 4 + 2] = m.tint[2];
    }
  }
  return {
    n, tris: n / 3, pos, nor, uv, mat, inst, tint, col,
  };
}
