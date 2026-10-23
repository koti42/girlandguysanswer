/*
 * KEŞİF — portaloda ("Portal Odası"): saf mantık (yerleşim üretici + portal işlevleri + soyut çözücü). DOM/three yok.
 *
 * Portal sistemi (render-to-texture YOK; yalnızca ışınlanma):
 *   placePortal(state, face, color) → {ok, reason, message, state, portal, removed}        (SAF: girdiyi değiştirmez)
 *   teleportTarget(state, fromPortal) → {x,y,z, yaw, yawDelta, nx,nz, cell, portal} | null (SAF)
 *   portalAt(state, x,y,z) → 'mavi' | 'turuncu' | null
 *   rotateVelocity(vx, vz, yawDelta) → [vx', vz']       hız yönünü portal dönüşüne göre çevirir (yaw: 0 = −Z, + sola)
 *   findPanel(panels, x,y,z, nx,nz), frontCells(panel)
 *   planSolution(layout) → {placements, steps, plan:[…]} | null        zone/panel grafı üzerinde soyut en az-şarj çözümü
 *
 * state (JSON): { panels:[…DÜNYA koord.], portals:{mavi:null|P, turuncu:null|P}, charges, max, … }
 *   panel: { id, acc:'mavi'|'turuncu'|'her', zone, vis:[zone…], nx,nz (yüz normali, dünya), box:{x0,y0,z0,x1,y1,z1} (duvar hücreleri) }
 *   P:     { color, panel, x,y,z (alt ön hücre), nx,nz, cells:[{x,y,z},{x,y+1,z}] }
 *
 * Kurallar: portal yalnızca beyaz DİK paneller üzerinde (ny=0), panelin kabul ettiği renkte açılır. Her başarılı yerleştirme 1 şarj
 * harcar (aynı renk portal taşınır); geçersiz atış şarj harcamaz. Portal 1×2 hücredir ve duvarın önündeki hücreleri kaplar.
 * Çıkış noktası, çıkış portalının bir hücre ilerisidir (hemen geri ışınlanmayı önler).
 *
 * layout (YEREL çerçeve, belirlenimli; ayna rng ile): { topo:'A'|'B', w,d,h, x0,x1, pit:{lz0,lz1}|null, rz, pfz, mirror,
 *   platform:{lx0,lx1,lz0,lz1,top}, ledge|null, stairs:{lx0,lx1,rows:[lz…]}, goal:{lx,lz},
 *   panels:[{id,acc,wall:'L'|'R'|'B',a0,a1,ly0,ly1,zone,vis}], decoys:[{wall,a0,a1,ly0,ly1}],
 *   zones:[{id,lx0,lx1,lz0,lz1,y}], drops:[[from,to]…], dispenser, reset, dial:{lz,ly0} }
 */
import { localXRange } from './kitGeometry.js';
import { chamberSize } from './kitChamber.js';
import { clamp, yawOfDir } from './ps2Shared.js';

export const PORTAL_MAX_CHARGES = 3;
export const PLATFORM_TOP = 5;
export const LEDGE_TOP = 3;
export const PORTAL_GRACE = 15;

const LEVELS = {
  1: {
    topo: 'A', pit: false, rz: 1, panelW: 4,
  },
  2: {
    topo: 'A', pit: true, rz: 9, panelW: 3,
  },
  3: {
    topo: 'B', pit: false, rz: 3, panelW: 3,
  },
  4: {
    topo: 'B', pit: true, rz: 9, panelW: 3,
  },
  5: {
    topo: 'B', pit: true, rz: 9, panelW: 2,
  },
};

export function clampPortalDifficulty(d) {
  const n = Math.round(Number(d));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, n));
}

export function portalSize(difficulty) {
  const c = LEVELS[clampPortalDifficulty(difficulty)];
  const pfz = c.rz + 4;
  return chamberSize(9, pfz + 5, 10);
}

/** Panel üreticisi kısayolu. */
function panel(id, acc, wall, a0, a1, ly0, ly1, zone, vis) {
  return {
    id, acc, wall, a0, a1, ly0, ly1, zone, vis,
  };
}

/** Yerleşim (kanonik yön: platform sağda, çıkıntı solda); mirror=true ise tüm lx işaretleri çevrilir. */
export function portalLayout(difficulty, rng) {
  const diff = clampPortalDifficulty(difficulty);
  const c = LEVELS[diff];
  const size = portalSize(diff);
  const xr = localXRange(size.w);
  const rz = c.rz;
  const pfz = rz + 4;
  const D = pfz + 5;
  const mirror = rng.next() < 0.5;
  const pit = c.pit ? { lz0: 5, lz1: rz - 1 } : null;
  const platform = {
    lx0: 2, lx1: 4, lz0: pfz, lz1: D - 1, top: PLATFORM_TOP,
  };
  const stairs = { lx0: 3, lx1: 4, rows: [rz, rz + 1, rz + 2, rz + 3] };
  const goal = { lx: 3, lz: pfz + 2 };
  const pw = c.panelW;
  const panels = [];
  const decoys = [];
  let ledge = null;
  const zones = [];
  const drops = [];
  const sEnd = c.pit ? 4 : D - 1;
  zones.push({
    id: 'S', lx0: xr.x0, lx1: xr.x1, lz0: 0, lz1: sEnd, y: 0,
  });
  zones.push({
    id: 'P', lx0: platform.lx0, lx1: platform.lx1, lz0: platform.lz0, lz1: platform.lz1, y: PLATFORM_TOP,
  });
  if (c.topo === 'A') {
    if (!c.pit) {
      panels.push(panel('E', 'her', 'L', 2, 5, 0, 2, 'S', ['S']));
      panels.push(panel('X', 'her', 'R', pfz + 1, pfz + 3, 6, 8, 'P', ['S']));
      decoys.push({
        wall: 'L', a0: 7, a1: 9, ly0: 0, ly1: 2,
      });
    } else {
      panels.push(panel('E', 'her', 'L', 1, 3, 0, 2, 'S', ['S']));
      panels.push(panel('E2', 'her', 'R', 1, 3, 0, 2, 'S', ['S']));
      panels.push(panel('X', 'her', 'R', pfz + 1, pfz + 3, 6, 8, 'P', ['S', 'R']));
      panels.push(panel('X2', 'her', 'L', rz + 2, rz + 5, 0, 2, 'R', ['S', 'R']));
      decoys.push({
        wall: 'L', a0: 5, a1: 7, ly0: 0, ly1: 2,
      }, {
        wall: 'R', a0: 5, a1: 7, ly0: 3, ly1: 5,
      });
      zones.push({
        id: 'R', lx0: xr.x0, lx1: xr.x1, lz0: rz, lz1: D - 1, y: 0,
      });
    }
  } else {
    ledge = {
      lx0: -4, lx1: -2, lz0: pfz + 1, lz1: D - 1, top: LEDGE_TOP,
    };
    zones.push({
      id: 'L', lx0: ledge.lx0, lx1: ledge.lx1, lz0: ledge.lz0, lz1: ledge.lz1, y: LEDGE_TOP,
    });
    const a0 = pw === 2 ? 2 : 1;
    panels.push(panel('F', 'mavi', 'L', a0, a0 + pw - 1, 0, 2, 'S', ['S', 'L']));
    const gx0 = pw === 2 ? -3 : -4;
    panels.push(panel('G', 'turuncu', 'B', gx0, gx0 + pw - 1, 3, 5, 'L', ['S', 'L']));
    const xx0 = pw === 2 ? 3 : 2;
    panels.push(panel('X', 'mavi', 'B', xx0, xx0 + pw - 1, 6, 8, 'P', ['S', 'L']));
    drops.push(['L', c.pit ? 'R' : 'S']);
    if (c.pit) {
      zones.push({
        id: 'R', lx0: xr.x0, lx1: xr.x1, lz0: rz, lz1: D - 1, y: 0,
      });
      panels.push(panel('D2', 'her', 'L', rz + 2, rz + 1 + pw, 0, 2, 'R', ['S', 'R']));
      decoys.push({
        wall: 'L', a0: 5, a1: 8, ly0: 0, ly1: 2,
      }, {
        wall: 'R', a0: 5, a1: 8, ly0: 0, ly1: 2,
      }, {
        wall: 'R', a0: rz + 2, a1: rz + 5, ly0: 0, ly1: 2,
      });
      if (diff >= 5) {
        decoys.push({
          wall: 'L', a0: 5, a1: 8, ly0: 3, ly1: 5,
        }, {
          wall: 'B', a0: 0, a1: 1, ly0: 4, ly1: 6,
        });
        panels.push(panel('F2', 'mavi', 'R', 4, 4, 0, 2, 'S', ['S']));
      }
    } else {
      decoys.push({
        wall: 'R', a0: 2, a1: 4, ly0: 0, ly1: 2,
      });
    }
  }
  const layout = {
    topo: c.topo,
    w: size.w,
    d: size.d,
    h: size.h,
    x0: xr.x0,
    x1: xr.x1,
    pit,
    rz,
    pfz,
    mirror: false,
    platform,
    ledge,
    stairs,
    goal,
    panels,
    decoys,
    zones,
    drops,
    dispenser: { lx: 3, lz: 0 },
    reset: { lx: -3, lz: 0 },
    dial: { lz: 0, ly0: 1 },
  };
  return mirror ? mirrorLayout(layout) : layout;
}

function mirrorRange(a0, a1) {
  return [-a1, -a0];
}

/** lx işaretini çevirir (platform ↔ çıkıntı yer değiştirir). */
export function mirrorLayout(L) {
  const m = JSON.parse(JSON.stringify(L));
  m.mirror = !L.mirror;
  const flipBox = (b) => {
    const r = mirrorRange(b.lx0, b.lx1);
    b.lx0 = r[0];
    b.lx1 = r[1];
  };
  flipBox(m.platform);
  if (m.ledge) flipBox(m.ledge);
  flipBox(m.stairs);
  m.goal.lx = -m.goal.lx;
  m.dispenser.lx = -m.dispenser.lx;
  m.reset.lx = -m.reset.lx;
  for (let i = 0; i < m.zones.length; i++) {
    if (m.zones[i].id === 'P' || m.zones[i].id === 'L') flipBox(m.zones[i]);
  }
  const flipPanel = (p) => {
    if (p.wall === 'L') p.wall = 'R';
    else if (p.wall === 'R') p.wall = 'L';
    else {
      const r = mirrorRange(p.a0, p.a1);
      p.a0 = r[0];
      p.a1 = r[1];
    }
  };
  for (let i = 0; i < m.panels.length; i++) flipPanel(m.panels[i]);
  for (let i = 0; i < m.decoys.length; i++) flipPanel(m.decoys[i]);
  return m;
}

/* ------------------------------------------------------------------------------------------------
 * Portal işlevleri (saf)
 * ---------------------------------------------------------------------------------------------- */
export function findPanel(panels, x, y, z, nx, nz) {
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    const b = p.box;
    if (p.nx !== nx || p.nz !== nz) continue;
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && z >= b.z0 && z <= b.z1) return p;
  }
  return null;
}

/** Panelin her duvar hücresinin önündeki (hava) hücreler: [{wx,wy,wz (duvar), x,y,z (ön)}]. */
export function frontCells(p) {
  const out = [];
  const b = p.box;
  for (let y = b.y0; y <= b.y1; y++) {
    for (let z = b.z0; z <= b.z1; z++) {
      for (let x = b.x0; x <= b.x1; x++) {
        out.push({
          wx: x, wy: y, wz: z, x: x + p.nx, y, z: z + p.nz,
        });
      }
    }
  }
  return out;
}

function otherColor(c) {
  return c === 'mavi' ? 'turuncu' : 'mavi';
}

function cellsOverlap(a, b) {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (a[i].x === b[j].x && a[i].y === b[j].y && a[i].z === b[j].z) return true;
    }
  }
  return false;
}

function fail(state, reason, message) {
  return {
    ok: false, reason, message, state, portal: null, removed: null,
  };
}

/**
 * Portal yerleştirir (saf). face: {x,y,z (vurulan duvar hücresi), nx,ny,nz (yüz normali, dışa)}; color 'mavi'|'turuncu'.
 * Başarılıysa yeni state (portals + charges güncel) döner; reddedilirse state AYNEN döner ve şarj harcanmaz.
 */
export function placePortal(state, face, color) {
  if (color !== 'mavi' && color !== 'turuncu') return fail(state, 'renk-gecersiz', 'Portal rengi geçersiz.');
  if (!face || !Number.isFinite(face.x) || !Number.isFinite(face.y) || !Number.isFinite(face.z)) {
    return fail(state, 'yuzey', 'Portal için bir yüzey vurmalısın.');
  }
  const ny = face.ny || 0;
  const nx = face.nx || 0;
  const nz = face.nz || 0;
  if (ny !== 0 || (nx === 0 && nz === 0)) return fail(state, 'yatay', 'Portal yalnızca beyaz DİK duvarlara açılır.');
  const p = findPanel(state.panels, face.x, face.y, face.z, nx, nz);
  if (!p) return fail(state, 'panel', 'Bu yüzey portal tutmaz. Beyaz panelleri dene.');
  if (p.acc !== 'her' && p.acc !== color) {
    return fail(state, 'renk', 'Bu panel yalnızca ' + p.acc + ' portal tutar (' + (p.acc === 'mavi' ? 'daire' : 'üçgen') + ' işaretli).');
  }
  const b = p.box;
  if (b.y1 - b.y0 < 1) return fail(state, 'kucuk', 'Panel portal için çok küçük.');
  const yb = clamp(face.y, b.y0, b.y1 - 1);
  const x = face.x + p.nx;
  const z = face.z + p.nz;
  const cells = [{ x, y: yb, z }, { x, y: yb + 1, z }];
  const portal = {
    color, panel: p.id, x, y: yb, z, nx: p.nx, nz: p.nz, cells,
  };
  const old = state.portals[color];
  if (old && old.x === x && old.y === yb && old.z === z) return fail(state, 'ayni', 'Portal zaten burada.');
  const other = state.portals[otherColor(color)];
  if (other && cellsOverlap(other.cells, cells)) return fail(state, 'ustuste', 'Portallar üst üste gelemez.');
  if (state.charges <= 0) return fail(state, 'sarj', 'Şarjın bitti.');
  const portals = Object.assign({}, state.portals);
  portals[color] = portal;
  const next = Object.assign({}, state, { portals, charges: state.charges - 1 });
  return {
    ok: true,
    reason: '',
    message: (color === 'mavi' ? 'Mavi' : 'Turuncu') + ' portal açıldı. Kalan şarj: ' + next.charges + '.',
    state: next,
    portal,
    removed: old || null,
  };
}

/** Hücre bir portalın içinde mi? */
export function portalAt(state, x, y, z) {
  const cols = ['mavi', 'turuncu'];
  for (let i = 0; i < 2; i++) {
    const p = state.portals[cols[i]];
    if (!p) continue;
    for (let k = 0; k < p.cells.length; k++) {
      if (p.cells[k].x === x && p.cells[k].y === y && p.cells[k].z === z) return cols[i];
    }
  }
  return null;
}

function wrapAngle(a) {
  let v = a;
  while (v > Math.PI) v -= 2 * Math.PI;
  while (v <= -Math.PI) v += 2 * Math.PI;
  return v;
}

/**
 * Giriş portalından diğer portala ışınlanma hedefi (saf). fromPortal: 'mavi'|'turuncu' ya da portal nesnesi.
 * Döner: { x,y,z (AYAK konumu: çıkış hücresinin merkezi), cell, yaw (çıkış yönüne bakan yaw), yawDelta (bakış/hız dönüşü),
 *          nx,nz (çıkış yönü), portal (çıkış portalı) } | null (diğer portal yoksa).
 */
export function teleportTarget(state, fromPortal) {
  const from = typeof fromPortal === 'string' ? state.portals[fromPortal] : fromPortal;
  if (!from) return null;
  const to = state.portals[otherColor(from.color)];
  if (!to) return null;
  const cx = to.x + to.nx;
  const cz = to.z + to.nz;
  const yawDelta = wrapAngle(yawOfDir(to.nx, to.nz) - yawOfDir(-from.nx, -from.nz));
  return {
    x: cx + 0.5,
    y: to.y,
    z: cz + 0.5,
    cell: { x: cx, y: to.y, z: cz },
    yaw: yawOfDir(to.nx, to.nz),
    yawDelta,
    nx: to.nx,
    nz: to.nz,
    portal: to,
  };
}

/** Hız (yatay) vektörünü yaw dönüşü kadar çevirir (yaw: 0 = −Z, + sola). */
export function rotateVelocity(vx, vz, yawDelta) {
  const c = Math.cos(yawDelta);
  const s = Math.sin(yawDelta);
  return [vx * c + vz * s, vz * c - vx * s];
}

/* ------------------------------------------------------------------------------------------------
 * Soyut çözücü (zone/panel grafı): en az şarjlı çözümü bulur
 * ---------------------------------------------------------------------------------------------- */
function walkEdges(L) {
  // aynı zone içi yürüme; yükseklikten aşağı inme (drops); S ve R çukurla ayrık
  return L.drops;
}

export function planSolution(L, maxCharges) {
  const panels = L.panels;
  const zoneIds = L.zones.map((z) => z.id);
  const maxC = maxCharges === undefined ? PORTAL_MAX_CHARGES : maxCharges;
  const edges = walkEdges(L);
  const startKey = { z: 'S', b: -1, o: -1, c: maxC };
  const keyOf = (s) => s.z + '|' + s.b + '|' + s.o + '|' + s.c;
  const best = new Map();
  best.set(keyOf(startKey), { cost: 0, prev: null, act: null });
  const frontier = [{ s: startKey, cost: 0 }];
  const accepts = (p, color) => p.acc === 'her' || p.acc === color;
  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const cur = frontier.shift();
    const k = keyOf(cur.s);
    if (best.get(k).cost < cur.cost) continue;
    if (cur.s.z === 'P') {
      const plan = [];
      let kk = k;
      while (kk !== null) {
        const r = best.get(kk);
        if (r.act) plan.push(r.act);
        kk = r.prev;
      }
      plan.reverse();
      return { placements: cur.cost, steps: plan.length, plan };
    }
    const push = (s, cost, act) => {
      const nk = keyOf(s);
      const ex = best.get(nk);
      if (ex && ex.cost <= cost) return;
      best.set(nk, { cost, prev: k, act });
      frontier.push({ s, cost });
    };
    // atış
    if (cur.s.c > 0) {
      for (let pi = 0; pi < panels.length; pi++) {
        const p = panels[pi];
        if (p.vis.indexOf(cur.s.z) < 0) continue;
        for (let ci = 0; ci < 2; ci++) {
          const color = ci === 0 ? 'mavi' : 'turuncu';
          if (!accepts(p, color)) continue;
          const mine = ci === 0 ? cur.s.b : cur.s.o;
          const theirs = ci === 0 ? cur.s.o : cur.s.b;
          if (mine === pi || theirs === pi) continue;
          const s = {
            z: cur.s.z, b: ci === 0 ? pi : cur.s.b, o: ci === 1 ? pi : cur.s.o, c: cur.s.c - 1,
          };
          push(s, cur.cost + 1, { act: 'shoot', color, panel: p.id, zone: cur.s.z });
        }
      }
    }
    // portaldan geç
    if (cur.s.b >= 0 && cur.s.o >= 0) {
      if (panels[cur.s.b].zone === cur.s.z) {
        push({ z: panels[cur.s.o].zone, b: cur.s.b, o: cur.s.o, c: cur.s.c }, cur.cost, { act: 'walk-portal', from: 'mavi', to: panels[cur.s.o].zone });
      }
      if (panels[cur.s.o].zone === cur.s.z) {
        push({ z: panels[cur.s.b].zone, b: cur.s.b, o: cur.s.o, c: cur.s.c }, cur.cost, { act: 'walk-portal', from: 'turuncu', to: panels[cur.s.b].zone });
      }
    }
    // inme
    for (let i = 0; i < edges.length; i++) {
      if (edges[i][0] === cur.s.z && zoneIds.indexOf(edges[i][1]) >= 0) {
        push({
          z: edges[i][1], b: cur.s.b, o: cur.s.o, c: cur.s.c,
        }, cur.cost, { act: 'drop', to: edges[i][1] });
      }
    }
  }
  return null;
}
