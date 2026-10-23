/*
 * KEŞİF sim — Anahtar Tapınağı yeraltı zinciri yerleşimi (saf). Oda zinciri "şeritler" (lane) halinde kıvrılır:
 * şerit 0 +lz yönünde, şerit 1 −lz yönünde (U dönüşü), şerit 2 yine +lz … böylece zincirin ayak izi küçük kalır.
 *
 * Koordinatlar: şerit-0 çerçevesinde yerel (lx, lz). Düğüm: {kind, w,d,h, lane, dir(+1|−1), lx(eksen), lz(origin)}.
 * dir=+1: oda +lz yönüne bakar (origin.facing = f); dir=−1: facing = (f+2)&3, oda −lz yönünde uzar.
 */
export const LANE_MAX = 34;

const half = (w) => (w >> 1) + 1;

/** nodes: [{kind,w,d,h,...}] sırayla zincir. Döner {nodes, corridors, bbox, lanes}. */
export function layoutNodes(inputNodes, laneMax) {
  const LM = laneMax || LANE_MAX;
  const nodes = inputNodes.map((n) => Object.assign({}, n));
  // 1) şeritlere dağıt
  const lanes = [];
  let cur = null;
  let len = 0;
  nodes.forEach((n) => {
    if (!cur || (cur.nodes.length > 0 && len + n.d + 6 > LM)) {
      cur = { index: lanes.length, dir: lanes.length % 2 === 0 ? 1 : -1, nodes: [] };
      lanes.push(cur);
      len = 0;
    }
    cur.nodes.push(n);
    len += n.d + 6;
  });
  // 2) geometri
  const corridors = [];
  let X = 0;
  let prev = null;
  let prevEnd = 0; // önceki şeridin son onaylı yaklaşım hücresi (lz)
  const out = [];
  lanes.forEach((lane, li) => {
    const maxW = Math.max(...lane.nodes.map((n) => n.w));
    if (prev) X += half(prev.maxW) + half(maxW) + 6;
    lane.X = X;
    lane.maxW = maxW;
    let off;
    if (li === 0) {
      off = 0;
    } else {
      const Tz = prev.dir === 1 ? prevEnd + 2 : prevEnd - 2;
      // U dönüş koridoru: önceki şerit ekseninden bu şeridin eksenine
      corridors.push({
        lx0: prev.X - 1, lx1: X + 1, lz0: Tz - 1, lz1: Tz + 1, h: 3, kind: 'u',
      });
      off = prev.dir === 1 ? Tz - 4 : Tz + 4;
    }
    lane.nodes.forEach((n, ni) => {
      n.lane = li;
      n.dir = lane.dir;
      n.lx = X;
      n.lz = off;
      n.facingFlip = lane.dir === -1;
      out.push(n);
      const a2 = lane.dir === 1 ? off + n.d + 2 : off - n.d - 3; // arka yaklaşım alt hücre
      const a3 = lane.dir === 1 ? off + n.d + 3 : off - n.d - 2;
      const endCell = lane.dir === 1 ? a3 : a2;
      if (ni + 1 < lane.nodes.length) {
        corridors.push({
          lx0: X - 1, lx1: X + 1, lz0: Math.min(a2, a3), lz1: Math.max(a2, a3), h: 3, kind: 'link',
        });
        off = lane.dir === 1 ? off + n.d + 6 : off - n.d - 6;
      } else {
        prevEnd = endCell;
      }
    });
    prev = lane;
  });
  // 3) sınırlayıcı kutu (yerel)
  let lx0 = 1e9;
  let lx1 = -1e9;
  let lz0 = 1e9;
  let lz1 = -1e9;
  out.forEach((n) => {
    const hw = half(n.w) + 2;
    lx0 = Math.min(lx0, n.lx - hw);
    lx1 = Math.max(lx1, n.lx + hw);
    const a = n.dir === 1 ? n.lz - 4 : n.lz - n.d - 3;
    const b = n.dir === 1 ? n.lz + n.d + 3 : n.lz + 4;
    lz0 = Math.min(lz0, a);
    lz1 = Math.max(lz1, b);
  });
  corridors.forEach((c) => {
    lx0 = Math.min(lx0, c.lx0 - 2);
    lx1 = Math.max(lx1, c.lx1 + 2);
    lz0 = Math.min(lz0, c.lz0 - 2);
    lz1 = Math.max(lz1, c.lz1 + 2);
  });
  return { nodes: out, corridors, bbox: { lx0, lz0, lx1, lz1 }, lanes };
}
