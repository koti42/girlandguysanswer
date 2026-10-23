/*
 * KEŞİF sim/city/interior — KAT PLANI ALGORİTMALARI (yerel koordinat, saf, rng tohumlu). Sözleşme §8 "BSP, koridor, loft açık plan, L".
 *
 * Oda kutusu {id, u0,v0,u1,v1, role?} yarı açık HAVA dikdörtgenidir; komşu odalar arasında 1 kalın duvar çizgisi bulunur.
 * Komşuluk {a, b, axis:'u'|'v', line, lo, hi}: axis 'u' → duvar u boyunca uzanır (v = line sabit); axis 'v' → duvar v boyunca uzanır (u = line sabit);
 * [lo,hi) iki odanın duvar boyunca ortak aralığı. `rng` = cityPlanKit.stream arayüzü {f(), i(n), r(lo,hi), chance(p), pick(arr)}.
 *
 *  bsp(rect, rng, o) -> {rooms, adj}           o: {minU=4, minV=4, maxRooms=6, noWall:[rect], splitMin=0.35, splitMax=0.65}
 *  corridor(W, D, rng, o) -> {rooms, adj}      ön salon + koridor + iki yan oda sütunu. o: {doorU, cw=3, frontD, minRoom=4, noWall}
 *  lshape(W, D, rng, o) -> {rooms, adj, voids} L biçimi: ön kol + yan kol; voids yazıcının dolduracağı (ya da bahçe) dikdörtgenler
 *  zones(rect, rng, n, o) -> [{id,u0,v0,u1,v1}]  duvarsız bölgeler (açık plan; kesin parçalama, boşluk yok). o: {minU=3, minV=3, ids}
 *  loft(W, D, H, rng, o) -> {rooms, door, stair, floor, D1, m}|null   açık plan loft: ön salon (tam yükseklik) + arka bölüm (alt: satır 0..m-1, asma: m+1..H-1) + merdiven
 *  doorSpots(entry, w, avoid) -> [c]            komşuluk üzerinde kapı merkez adayları (w genişlik; avoid: engel dikdörtgenleri)
 *  pickDoor(entry, rng, w, avoid) -> {c, w}|null   (3 geniş yer yoksa 1 geniş)
 *  spanning(rooms, adj, entryId, rng, o) -> [{a,b,adj,c,w}]   o: {extra=0 (döngü), w=1|3, avoid, filter(adj)->bool}  entry'den yayılan kapı ağacı (+ döngüler)
 *  roomAt(rooms, u, v) -> oda|null · rectOf(room)
 */

export function rectOf(r) {
  return [r.u0, r.v0, r.u1, r.v1];
}

export function roomAt(rooms, u, v) {
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (u >= r.u0 && u < r.u1 && v >= r.v0 && v < r.v1) return r;
  }
  return null;
}

function hits(a, b) {
  return a.u0 < b.u1 && a.u1 > b.u0 && a.v0 < b.v1 && a.v1 > b.v0;
}

/** Komşuluk hesabı: guillotine bölüntüsünde ortak duvar çizgileri. */
export function computeAdj(rooms) {
  const adj = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      // dikey duvar (u sabit)
      let lo = Math.max(a.v0, b.v0);
      let hi = Math.min(a.v1, b.v1);
      if (hi > lo) {
        if (a.u1 + 1 === b.u0) adj.push({ a: a.id, b: b.id, axis: 'v', line: a.u1, lo, hi });
        else if (b.u1 + 1 === a.u0) adj.push({ a: b.id, b: a.id, axis: 'v', line: b.u1, lo, hi });
      }
      lo = Math.max(a.u0, b.u0);
      hi = Math.min(a.u1, b.u1);
      if (hi > lo) {
        if (a.v1 + 1 === b.v0) adj.push({ a: a.id, b: b.id, axis: 'u', line: a.v1, lo, hi });
        else if (b.v1 + 1 === a.v0) adj.push({ a: b.id, b: a.id, axis: 'u', line: b.v1, lo, hi });
      }
    }
  }
  return adj;
}

function lineBlocked(axis, line, lo, hi, bad) {
  if (!bad || !bad.length) return false;
  const seg = axis === 'v' ? { u0: line, u1: line + 1, v0: lo, v1: hi } : { u0: lo, u1: hi, v0: line, v1: line + 1 };
  for (let i = 0; i < bad.length; i++) if (hits(seg, bad[i])) return true;
  return false;
}

function asRects(list) {
  return (list || []).map((q) => (Array.isArray(q) ? { u0: q[0], v0: q[1], u1: q[2], v1: q[3] } : q));
}

export function bsp(rect, rng, o) {
  const op = o || {};
  const minU = op.minU || 4;
  const minV = op.minV || 4;
  const maxRooms = op.maxRooms || 6;
  const lo = op.splitMin === undefined ? 0.35 : op.splitMin;
  const hi = op.splitMax === undefined ? 0.65 : op.splitMax;
  const noWall = asRects(op.noWall);
  const leaves = [{ u0: rect[0], v0: rect[1], u1: rect[2], v1: rect[3] }];
  let guard = 0;
  while (leaves.length < maxRooms && guard++ < 64) {
    // en büyük bölünebilir yaprak
    const order = leaves.map((r, i) => ({ i, a: (r.u1 - r.u0) * (r.v1 - r.v0) })).sort((p, q) => q.a - p.a || p.i - q.i);
    let done = false;
    for (let k = 0; k < order.length && !done; k++) {
      const r = leaves[order[k].i];
      const w = r.u1 - r.u0;
      const d = r.v1 - r.v0;
      const canU = w >= 2 * minU + 1;
      const canV = d >= 2 * minV + 1;
      if (!canU && !canV) continue;
      let axis;
      if (canU && canV) axis = w > d * 1.25 ? 'v' : d > w * 1.25 ? 'u' : (rng.chance(0.5) ? 'v' : 'u');
      else axis = canU ? 'v' : 'u';
      for (let tries = 0; tries < 6 && !done; tries++) {
        let line;
        if (axis === 'v') {
          const a = Math.max(r.u0 + minU, Math.round(r.u0 + (w - 1) * lo));
          const b = Math.min(r.u1 - minU - 1, Math.round(r.u0 + (w - 1) * hi));
          if (b < a) break;
          line = a + rng.i(b - a + 1);
          if (lineBlocked('v', line, r.v0, r.v1, noWall)) continue;
          leaves.splice(order[k].i, 1, { u0: r.u0, v0: r.v0, u1: line, v1: r.v1 }, { u0: line + 1, v0: r.v0, u1: r.u1, v1: r.v1 });
        } else {
          const a = Math.max(r.v0 + minV, Math.round(r.v0 + (d - 1) * lo));
          const b = Math.min(r.v1 - minV - 1, Math.round(r.v0 + (d - 1) * hi));
          if (b < a) break;
          line = a + rng.i(b - a + 1);
          if (lineBlocked('u', line, r.u0, r.u1, noWall)) continue;
          leaves.splice(order[k].i, 1, { u0: r.u0, v0: r.v0, u1: r.u1, v1: line }, { u0: r.u0, v0: line + 1, u1: r.u1, v1: r.v1 });
        }
        done = true;
      }
    }
    if (!done) break;
  }
  const rooms = leaves.map((r, i) => Object.assign({ id: 'r' + i }, r));
  return { rooms, adj: computeAdj(rooms) };
}

export function corridor(W, D, rng, o) {
  const op = o || {};
  const cw = op.cw || 3;
  const minRoom = op.minRoom || 4;
  const doorU = op.doorU === undefined ? (W >> 1) : op.doorU;
  let fd = op.frontD || Math.max(4, Math.min(D - 2 * minRoom - 1, Math.round(D * 0.3)));
  if (fd < 3) fd = 3;
  let cu0 = Math.max(minRoom + 1, Math.min(W - minRoom - 1 - cw, doorU - (cw >> 1)));
  if (cu0 < minRoom + 1) cu0 = minRoom + 1;
  const cu1 = cu0 + cw;
  const rooms = [{ id: 'hall', u0: 0, v0: 0, u1: W, v1: fd, role: 'hall' }];
  const bandV0 = fd + 1;
  rooms.push({ id: 'koridor', u0: cu0, v0: bandV0, u1: cu1, v1: D, role: 'corridor' });
  const split = (u0, u1, side) => {
    const n = Math.max(1, Math.floor((D - bandV0 + 1) / (minRoom + 1 + rng.i(2))));
    const total = D - bandV0;
    const cnt = Math.min(n, Math.max(1, Math.floor((total + 1) / (minRoom + 1))));
    let v = bandV0;
    for (let i = 0; i < cnt; i++) {
      const left = cnt - i;
      const remain = D - v;
      const size = left === 1 ? remain : Math.max(minRoom, Math.round((remain - (left - 1)) / left));
      const v1 = left === 1 ? D : v + size;
      rooms.push({ id: side + i, u0, v0: v, u1, v1, role: 'room' });
      v = v1 + 1;
    }
  };
  if (cu0 - 1 >= minRoom) split(0, cu0 - 1, 'sol');
  if (W - (cu1 + 1) >= minRoom) split(cu1 + 1, W, 'sag');
  return { rooms, adj: computeAdj(rooms) };
}

export function lshape(W, D, rng, o) {
  const op = o || {};
  const minArm = op.minArm || 4;
  const d1 = Math.max(minArm, Math.min(D - minArm - 1, Math.round(D * (0.4 + 0.2 * rng.f()))));
  const w2 = Math.max(minArm, Math.min(W - 3, Math.round(W * (0.4 + 0.2 * rng.f()))));
  const left = op.flip === true;
  const rooms = [{ id: 'on', u0: 0, v0: 0, u1: W, v1: d1, role: 'front' }];
  let voidRect;
  if (!left) {
    rooms.push({ id: 'yan', u0: 0, v0: d1 + 1, u1: w2, v1: D, role: 'side' });
    voidRect = { u0: w2, v0: d1 + 1, u1: W, v1: D };
  } else {
    rooms.push({ id: 'yan', u0: W - w2, v0: d1 + 1, u1: W, v1: D, role: 'side' });
    voidRect = { u0: 0, v0: d1 + 1, u1: W - w2, v1: D };
  }
  return { rooms, adj: computeAdj(rooms), voids: [voidRect] };
}

/**
 * Asma katlı açık plan (loft). H ≥ 5, W ≥ 10, D ≥ 9 gerekir (aksi null). Odalar y aralıklıdır (yerel kat satırı): 'on' [0,H) tam yükseklik ön salon;
 * 'arka' alt (0..m) ve 'asma' üst (m+1..H) aynı ayak izi; m = döşeme satırı (varsayılan 2, yani yükselme m+1 = 3 blok, 6 hücrelik yarım basamak).
 * door: 'on'↔'arka' 3 geniş geçit (h = m); stair: Kit.stair girdisi + builder.vertical(from,to,rect) alanları. Kullanım:
 *   kit.box(0, D1+1, W, D, m, m+1, zemin) → kit.stair(stair) ; b.vertical('m1','arka','asma',{kind:'stair', from, to, rect})
 */
export function loft(W, D, H, rng, o) {
  const op = o || {};
  const m = op.floorRow || 2;
  const rise = m + 1;
  const run = rise * 2;
  if (H < m + 3 || W < run + 3 || D < 9) return null;
  const D1 = Math.max(4, Math.min(D - 5, Math.round(D * (0.4 + 0.1 * rng.f()))));
  const rooms = [
    { id: 'on', u0: 0, v0: 0, u1: W, v1: D1, y0: 0, y1: H, role: 'on' },
    { id: 'arka', u0: 0, v0: D1 + 1, u1: W, v1: D, y0: 0, y1: m, role: 'arka' },
    { id: 'asma', u0: 0, v0: D1 + 1, u1: W, v1: D, y0: m + 1, y1: H, role: 'asma' },
  ];
  const doorU = op.doorU === undefined ? (W >> 1) : op.doorU;
  const c = Math.max(2, Math.min(W - 3, doorU));
  const door = {
    axis: 'u', line: D1, c, w: 3, h: m, kind: 'arch',
  };
  const left = rng.chance(0.5);
  const dir = left ? 1 : 3;
  const u = left ? 1 : W - 2;
  const v = D1 + 2;
  const du = left ? 1 : -1;
  const lastU = u + du * (run - 1);
  const stair = {
    u, v, dir, rise, width: 2, y0: 0, hole: m,
  };
  const spec = {
    kind: 'stair',
    from: [u - du, v],
    to: [lastU + du, v],
    rect: [Math.min(u, lastU), v, Math.max(u, lastU) + 1, v + 2],
  };
  return {
    rooms, door, stair, spec, floor: { rect: [0, D1 + 1, W, D], row: m }, D1, m,
  };
}

export function zones(rect, rng, n, o) {
  const op = o || {};
  const minU = op.minU || 3;
  const minV = op.minV || 3;
  const leaves = [{ u0: rect[0], v0: rect[1], u1: rect[2], v1: rect[3] }];
  let guard = 0;
  while (leaves.length < n && guard++ < 64) {
    let bi = -1;
    let ba = -1;
    for (let i = 0; i < leaves.length; i++) {
      const r = leaves[i];
      const a = (r.u1 - r.u0) * (r.v1 - r.v0);
      if ((r.u1 - r.u0 >= 2 * minU || r.v1 - r.v0 >= 2 * minV) && a > ba) { ba = a; bi = i; }
    }
    if (bi < 0) break;
    const r = leaves[bi];
    const w = r.u1 - r.u0;
    const d = r.v1 - r.v0;
    const alongU = w >= 2 * minU && (d < 2 * minV || w >= d);
    if (alongU) {
      const cut = r.u0 + Math.max(minU, Math.min(w - minU, Math.round(w * (0.35 + 0.3 * rng.f()))));
      leaves.splice(bi, 1, { u0: r.u0, v0: r.v0, u1: cut, v1: r.v1 }, { u0: cut, v0: r.v0, u1: r.u1, v1: r.v1 });
    } else {
      const cut = r.v0 + Math.max(minV, Math.min(d - minV, Math.round(d * (0.35 + 0.3 * rng.f()))));
      leaves.splice(bi, 1, { u0: r.u0, v0: r.v0, u1: r.u1, v1: cut }, { u0: r.u0, v0: cut, u1: r.u1, v1: r.v1 });
    }
  }
  return leaves.map((r, i) => Object.assign({ id: (op.ids && op.ids[i]) || 'z' + i }, r));
}

/** Komşuluk üzerinde kapı merkez adayları (w ∈ {1,3}); avoid: engel dikdörtgenleri (yerel). Kenarlardan 1 hücre içeride. */
export function doorSpots(entry, w, avoid) {
  const half = (w - 1) / 2;
  const bad = asRects(avoid);
  const out = [];
  for (let c = entry.lo + half + (w > 1 ? 1 : 0); c <= entry.hi - 1 - half - (w > 1 ? 1 : 0); c++) {
    let ok = true;
    for (let k = -half; k <= half && ok; k++) {
      const p = c + k;
      // duvar hücresi ve iki yan hücre engelsiz olmalı
      const cells = entry.axis === 'v'
        ? [{ u0: entry.line, u1: entry.line + 1, v0: p, v1: p + 1 }, { u0: entry.line - 1, u1: entry.line, v0: p, v1: p + 1 }, { u0: entry.line + 1, u1: entry.line + 2, v0: p, v1: p + 1 }]
        : [{ u0: p, u1: p + 1, v0: entry.line, v1: entry.line + 1 }, { u0: p, u1: p + 1, v0: entry.line - 1, v1: entry.line }, { u0: p, u1: p + 1, v0: entry.line + 1, v1: entry.line + 2 }];
      for (let i = 0; i < cells.length && ok; i++) for (let q = 0; q < bad.length; q++) if (hits(cells[i], bad[q])) { ok = false; break; }
    }
    if (ok) out.push(c);
  }
  return out;
}

export function pickDoor(entry, rng, w, avoid) {
  let ww = w;
  let spots = doorSpots(entry, ww, avoid);
  if (!spots.length && ww > 1) {
    ww = 1;
    spots = doorSpots(entry, 1, avoid);
  }
  return spots.length ? { c: spots[rng.i(spots.length)], w: ww } : null;
}

/** Entry odasından yayılan kapı ağacı (+ `extra` döngü). Dönen kenar: {a,b,adj,c,w} (a→b yönü yayılma yönü). */
export function spanning(rooms, adj, entryId, rng, o) {
  const op = o || {};
  const w = op.w || 1;
  const filter = op.filter || (() => true);
  const usable = adj.filter(filter);
  const seen = new Set([entryId]);
  const edges = [];
  const used = new Set();
  let frontier = [entryId];
  let guard = 0;
  while (frontier.length && guard++ < 200) {
    // rastgele bir sınır odası seç → kullanılmamış komşuluklardan birini genişlet
    const cand = [];
    for (let f = 0; f < frontier.length; f++) {
      for (let i = 0; i < usable.length; i++) {
        const e = usable[i];
        if (used.has(i)) continue;
        if (e.a === frontier[f] && !seen.has(e.b)) cand.push([i, e.a, e.b]);
        else if (e.b === frontier[f] && !seen.has(e.a)) cand.push([i, e.b, e.a]);
      }
    }
    if (!cand.length) break;
    const pick = cand[rng.i(cand.length)];
    const e = usable[pick[0]];
    const dp = pickDoor(e, rng, w, op.avoid);
    used.add(pick[0]);
    if (!dp) continue; // kapı konamıyor: başka komşuluk dene
    seen.add(pick[2]);
    edges.push({ a: pick[1], b: pick[2], adj: e, c: dp.c, w: dp.w });
    frontier.push(pick[2]);
  }
  const extra = op.extra || 0;
  for (let n = 0; n < extra; n++) {
    const rest = usable.map((e, i) => i).filter((i) => !used.has(i) && seen.has(usable[i].a) && seen.has(usable[i].b));
    if (!rest.length) break;
    const i = rest[rng.i(rest.length)];
    used.add(i);
    const e = usable[i];
    const dp = pickDoor(e, rng, 1, op.avoid);
    if (dp) edges.push({ a: e.a, b: e.b, adj: e, c: dp.c, w: dp.w });
  }
  return edges;
}
