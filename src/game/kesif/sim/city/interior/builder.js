/*
 * KEŞİF sim/city/interior — INTERIOR İNŞA EDİCİ (yerel koordinattan dünya `Interior`ına). Saf, belirlenimci. Sözleşme §8.
 *
 * Tür modülünün plan(lot, rng, variant, ctx) işlevi: `const b = new InteriorBuilder(ctx)`; odalar/kapılar/proplar/ışıklar yerel koordinatla eklenir,
 * `b.build()` doğrulanabilir bir Interior (graph.js şeması) döndürür. ctx = {frame, bp, lot, kind, variant, seed}. Hiçbir yerde rastgelelik yok:
 * rng çağıranın tohumlu akışıdır.
 *
 *  b.W/D/H · b.frame · b.rooms (yerel) · b.owner · b.mood
 *  room(id, [u0,v0,u1,v1], o?)           o {y0=0, y1=H (kat satırı), role}  — çerçeve içinde, çakışmasız olmalı (atar: hata mesajı)
 *  zone(id, [u0,v0,u1,v1], role)         duvarsız bölge (bilgi)
 *  door(id, aId, bId, spec) -> door      spec {axis:'u'|'v' (duvarın uzandığı yerel eksen), line (duvar çizgisi), c (orta hücre), w=1|3, kind='door'|'arch',
 *                                        lock?:Lock, prop=true (kind 'door' için kapı propu ekler), y=0, h=3}
 *  vertical(id, aId, bId, spec)          spec {kind:'stair'|'ladder'|'hatch', from:[u,v], to:[u,v], rect:[u0,v0,u1,v1], y=0}
 *  lockPad(door, side, kind)             kapı yanına duvar propu: kod_paneli | kart_okuyucu | hack_terminali (kilit türüne göre); side 'a'|'b'
 *  prop(key, u, v, ly, o?) -> spec|null  GEÇERSİZ/çakışan yerleşimde null. o {variant, du, dv (hücre içi kayma), y (satır), side (duvar propu için duvar yönü ly), data, force}
 *  wallProp(key, u, v, side, o?)         (u,v) oda hücresi, side = o hücreden DUVARA yerel yön (0..3); prop duvara yaslanır, öne (odaya) bakar
 *  canPlace(key, u, v, ly, o?) -> bool
 *  light(roomId, u, v, type, o?) -> light|null   (oda başına ≤4) · lightGrid(roomId, n, type) -> light[]  (düzenli dağıtım)    accent(u0,v0,u1,v1,y0,y1, block) · chip(slot,u,v,y) · signature(u,v,y)
 *  build() -> Interior       b.dropped: kapı önü/çakışma nedeniyle son süzgeçte atılan proplar
 */
import { getCatalogDef } from '../../props/propCatalog.js';
import { getPropDef, rotateBox, worldBoxes } from '../../props/propDefs.js';
import { OWNER_BY_INTERIOR, getOwner } from '../ownerData.js';
import {
  CLEAR_DEPTH, CLEAR_HEIGHT, CLEAR_WIDTH, MAX_LIGHTS_PER_ROOM, STREET_DOOR_ID, doorClearanceBoxes, planReachability,
} from './graph.js';
import { LIGHT_TYPES } from './kit.js';

export const PROP_SLOT0 = 64;
/** Koruma kipinde (guard) bir prop yerleşimi sonrası plan düzeyi ulaşılabilir hava bunun altına düşerse yerleşim geri alınır. */
export const GUARD_MIN = 0.85;
const EPS = 1e-6;

function defOf(key) {
  return getCatalogDef(key) || getPropDef(key);
}

function ovl(a, b) {
  return a[0] < b[3] - EPS && a[3] > b[0] + EPS && a[1] < b[4] - EPS && a[4] > b[1] + EPS && a[2] < b[5] - EPS && a[5] > b[2] + EPS;
}

function footprint(def, x, y, z, yaw) {
  const hw = def.size[0] / 2;
  const hd = def.size[2] / 2;
  const r = rotateBox([-hw, 0, -hd, hw, def.size[1], hd], yaw, [0, 0, 0, 0, 0, 0]);
  r[0] += x; r[3] += x; r[1] += y; r[4] += y; r[2] += z; r[5] += z;
  return r;
}

export class InteriorBuilder {
  constructor(ctx) {
    const fr = ctx.frame;
    this.ctx = ctx;
    this.frame = fr;
    this.bp = ctx.bp;
    this.lot = ctx.lot;
    this.kind = ctx.kind;
    this.variant = ctx.variant | 0;
    this.W = fr.W;
    this.D = fr.D;
    this.H = fr.H;
    this.rooms = [];
    this.zones = [];
    this._doors = [];
    this._graph = [];
    this._props = [];
    this._boxes = []; // prop çarpışma kutuları (süzgeç için)
    this._lights = [];
    this._accents = [];
    this._chips = [];
    this._sig = null;
    this._slot = PROP_SLOT0;
    this.dropped = [];
    /** true (varsayılan): tüm odalar grafla bağlandıktan sonra, odaları/hücreleri sokaktan kopartan çarpışmalı prop reddedilir. */
    this.guard = ctx.guard !== false;
    const ownerKind = OWNER_BY_INTERIOR[this.kind] || null;
    this.owner = ctx.bp && ctx.bp.owner ? ctx.bp.owner : (ctx.bp && ctx.bp.ownerId ? getOwner(ctx.bp.ownerId) : null);
    this.mood = ownerKind ? { hue: ownerKind.mood.hue, light: ownerKind.mood.light, ambient: ownerKind.mood.ambient } : { hue: 'beyaz', light: 10, ambient: 'vent' };
    this.base = fr.y0;
  }

  /* ------------------------------------------------------------------------------------------ odalar */
  room(id, rect, o) {
    const op = o || {};
    const [u0, v0, u1, v1] = rect;
    const y0 = op.y0 === undefined ? 0 : op.y0;
    const y1 = op.y1 === undefined ? this.H : op.y1;
    if (!(u0 >= 0 && v0 >= 0 && u1 <= this.W && v1 <= this.D && u1 > u0 && v1 > v0 && y1 - y0 >= 2 && y0 >= 0 && y1 <= this.H)) {
      throw new Error('InteriorBuilder.room(' + id + '): çerçeve dışı/geçersiz ' + JSON.stringify(rect) + ' y ' + y0 + '..' + y1);
    }
    for (let i = 0; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      if (r.id === id) throw new Error('InteriorBuilder.room: kimlik yinelendi ' + id);
      if (u0 < r.u1 && u1 > r.u0 && v0 < r.v1 && v1 > r.v0 && y0 < r.y1 && y1 > r.y0) throw new Error('InteriorBuilder.room(' + id + '): ' + r.id + ' ile çakışıyor');
    }
    const w = this.frame.rect(u0, v0, u1, v1);
    const room = {
      id, u0, v0, u1, v1, y0, y1, role: op.role || 'oda', wx0: w[0], wz0: w[1], wx1: w[2], wz1: w[3],
    };
    this.rooms.push(room);
    return room;
  }

  zone(id, rect, role) {
    const w = this.frame.rect(rect[0], rect[1], rect[2], rect[3]);
    this.zones.push({ id, x0: w[0], z0: w[1], x1: w[2], z1: w[3], role: role || 'bolge', u0: rect[0], v0: rect[1], u1: rect[2], v1: rect[3] });
  }

  _room(id) {
    for (let i = 0; i < this.rooms.length; i++) if (this.rooms[i].id === id) return this.rooms[i];
    throw new Error('InteriorBuilder: bilinmeyen oda ' + id);
  }

  /* ------------------------------------------------------------------------------------------ kapılar */
  door(id, aId, bId, spec) {
    this._room(aId);
    this._room(bId);
    const f = this.frame;
    const kind = spec.kind || 'door';
    const w = spec.w || 1;
    const cu = spec.axis === 'u' ? spec.c : spec.line;
    const cv = spec.axis === 'u' ? spec.line : spec.c;
    const cell = f.cell(cu, cv);
    const alongU = spec.axis === 'u';
    const worldAxis = (f.face === 'n' || f.face === 's') === alongU ? 'x' : 'z';
    const d = {
      id, kind, x: cell[0], y: this.base + (spec.y || 0), z: cell[1], axis: worldAxis, w, h: spec.h || 3,
    };
    if (spec.lock) d.lock = spec.lock;
    d.lu = cu;
    d.lv = cv;
    d.lax = spec.axis;
    this._doors.push(d);
    this._graph.push([aId, bId, id]);
    if (kind === 'door' && spec.prop !== false) {
      const key = w === 3 ? 'kapi_genis' : 'kapi';
      d.propSlot = this._slot++;
      this._props.push({
        kind: key, x: cell[0] + 0.5, y: d.y, z: cell[1] + 0.5, yaw: worldAxis === 'x' ? 0 : 1, variant: (this.variant + this._doors.length) & 7,
        lotId: this.lot.id, slot: d.propSlot,
      });
    }
    return d;
  }

  vertical(id, aId, bId, spec) {
    this._room(aId);
    this._room(bId);
    const f = this.frame;
    const a = f.cell(spec.from[0], spec.from[1]);
    const b = f.cell(spec.to[0], spec.to[1]);
    const r = spec.rect ? f.rect(spec.rect[0], spec.rect[1], spec.rect[2], spec.rect[3]) : [a[0], a[1], a[0] + 1, a[1] + 1];
    const d = {
      id, kind: spec.kind || 'stair', x: a[0], y: this.base + (spec.y || 0), z: a[1], axis: 'x', w: 1, h: 3, from: [a[0], a[1]], to: [b[0], b[1]], rect: { x0: r[0], z0: r[1], x1: r[2], z1: r[3] },
    };
    this._doors.push(d);
    this._graph.push([aId, bId, id]);
    return d;
  }

  /** Kapı yanına kilit düzeneği (duvar propu). side 'a' → kapının A odası tarafı, 'b' → B odası tarafı. Yer yoksa null. */
  lockPad(door, side, kind) {
    const key = kind === 'kart' ? 'kart_okuyucu' : kind === 'mini_hack' ? 'hack_terminali' : 'kod_paneli';
    const half = (door.w - 1) / 2;
    const off = half + 1;
    const gr = this._graph.find((e) => e[2] === door.id);
    if (!gr) return null;
    const roomId = side === 'b' ? gr[1] : gr[0];
    const room = this._room(roomId);
    const inRoom = (u, v) => u >= room.u0 && u < room.u1 && v >= room.v0 && v < room.v1;
    const cand = [];
    for (let s = -1; s <= 1; s += 2) {
      const p = (door.lax === 'u' ? door.lu : door.lv) + s * off;
      if (door.lax === 'u') {
        cand.push([p, door.lv - 1, 0], [p, door.lv + 1, 2]);
      } else {
        cand.push([door.lu - 1, p, 1], [door.lu + 1, p, 3]);
      }
    }
    for (let i = 0; i < cand.length; i++) {
      const c = cand[i];
      if (!inRoom(c[0], c[1])) continue;
      const r = this.wallProp(key, c[0], c[1], c[2], { y: 1, room: roomId });
      if (r) return r;
    }
    return null;
  }

  /* ------------------------------------------------------------------------------------------ proplar */
  _normal(key, u, v, ly, o) {
    const def = defOf(key);
    if (!def) return null;
    const f = this.frame;
    const op = o || {};
    const mount = def.mount || 'floor';
    let side = op.side;
    let yaw;
    let x;
    let z;
    let y = this.base + (op.y === undefined ? (mount === 'surface' ? 0.875 : 0) : op.y);
    const c = f.pt(u, v);
    if (mount === 'wall' || side !== undefined) {
      if (side === undefined) return null;
      const dv = f.dir(side & 3);
      const back = 0.5 - def.size[2] / 2 + 0.0625;
      x = c[0] + dv[0] * back + (op.du || 0) * f.dir(1)[0] + (op.dv || 0) * f.dir(0)[0];
      z = c[1] + dv[1] * back + (op.du || 0) * f.dir(1)[1] + (op.dv || 0) * f.dir(0)[1];
      yaw = f.yaw((side + 2) & 3);
      if (op.y === undefined) y = this.base + 1;
    } else {
      x = c[0] + (op.du || 0) * f.dir(1)[0] + (op.dv || 0) * f.dir(0)[0];
      z = c[1] + (op.du || 0) * f.dir(1)[1] + (op.dv || 0) * f.dir(0)[1];
      yaw = f.yaw(ly);
      if (mount === 'ceiling') y = this.base + this.H - def.size[1];
    }
    return { def, x, y, z, yaw, mount };
  }

  canPlace(key, u, v, ly, o) {
    return this._try(key, u, v, ly, o, false) !== null;
  }

  _try(key, u, v, ly, o, commit) {
    const n = this._normal(key, u, v, ly, o);
    if (!n) return null;
    const { def, x, y, z, yaw, mount } = n;
    const f = this.frame;
    const wall = mount === 'wall' || (o && o.side !== undefined);
    const tol = wall ? 0.5 : 0.001;
    const fp = footprint(def, x, y, z, yaw);
    const B = f.bounds;
    if (fp[0] < B.x0 - tol || fp[3] > B.x1 + tol || fp[2] < B.z0 - tol || fp[5] > B.z1 + tol || fp[1] < B.y0 - 0.001 || fp[4] > B.y1 + 0.001) return null;
    // oda içinde mi (çapa hücresi + ayak izi o odanın dikdörtgeninde)
    const rid = o && o.room;
    let room = null;
    for (let i = 0; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      if (rid !== undefined && r.id !== rid) continue;
      const cx = Math.floor(wall ? x - (f.dir((o.side & 3))[0] * 0.3) : x);
      const cz = Math.floor(wall ? z - (f.dir((o.side & 3))[1] * 0.3) : z);
      if (cx >= r.wx0 && cx < r.wx1 && cz >= r.wz0 && cz < r.wz1 && y >= this.base + r.y0 - 0.001 && y < this.base + r.y1) { room = r; break; }
    }
    if (!room) return null;
    if (fp[0] < room.wx0 - tol || fp[3] > room.wx1 + tol || fp[2] < room.wz0 - tol || fp[5] > room.wz1 + tol) return null;
    for (let i = 0; i < f.obstacles.length; i++) {
      const ob = f.obstacles[i];
      if (fp[0] < ob.x1 - EPS && fp[3] > ob.x0 + EPS && fp[2] < ob.z1 - EPS && fp[5] > ob.z0 + EPS) return null;
    }
    const boxes = def.colliders.length ? worldBoxes(def, x, y, z, yaw, []) : [];
    // yüzeyde duran (surface) ve kolliderı olmayan proplar çakışma denetiminden muaf
    for (let b = 0; b < boxes.length; b++) {
      for (let k = 0; k < this._boxes.length; k++) if (ovl(boxes[b], this._boxes[k].box)) return null;
      for (let q = 0; q < this._doors.length; q++) {
        const d = this._doors[q];
        if (d.from || d.kind === 'street') continue;
        if (ovl(boxes[b], doorClearanceBoxes(d)[0])) return null;
      }
      for (let q = 0; q < this._doors.length; q++) {
        const d = this._doors[q];
        if (d.rect && boxes[b][0] < d.rect.x1 - EPS && boxes[b][3] > d.rect.x0 + EPS && boxes[b][2] < d.rect.z1 - EPS && boxes[b][5] > d.rect.z0 + EPS) return null;
      }
      if (ovl(boxes[b], this._streetClear())) return null;
    }
    if (!commit) return { x, y, z, yaw, boxes };
    const spec = {
      kind: def.key, x, y, z, yaw, variant: (o && o.variant !== undefined ? o.variant : this.variant) & 7, lotId: this.lot.id, slot: this._slot++,
    };
    if (o && o.data !== undefined) spec.data = o.data;
    this._props.push(spec);
    const nb = this._boxes.length;
    for (let b = 0; b < boxes.length; b++) this._boxes.push({ box: boxes[b], slot: spec.slot });
    if (boxes.length && this.guard && this._guardReady()) {
      const snap = this._assemble(false);
      const r = planReachability(snap);
      if (r.unreachableRooms.length || r.startBlocked || r.fraction < GUARD_MIN) {
        this._props.pop();
        this._boxes.length = nb;
        this._slot--;
        return null;
      }
    }
    return spec;
  }

  _streetClear() {
    if (this._sc) return this._sc;
    const d = this.frame.door;
    this._sc = doorClearanceBoxes({ x: d.x, z: d.z, y: this.base, axis: d.axis })[0];
    return this._sc;
  }

  prop(key, u, v, ly, o) {
    return this._try(key, u, v, ly, o, true);
  }

  wallProp(key, u, v, side, o) {
    return this._try(key, u, v, 0, Object.assign({}, o, { side }), true);
  }

  /* ------------------------------------------------------------------------------------------ ışık, aksan, çip, imza */
  light(roomId, u, v, type, o) {
    const room = this._room(roomId);
    const t = LIGHT_TYPES[type];
    if (!t) return null;
    let n = 0;
    for (let i = 0; i < this._lights.length; i++) if (this._lights[i].room === roomId) n++;
    if (n >= MAX_LIGHTS_PER_ROOM) return null;
    if (!(u >= room.u0 && u < room.u1 && v >= room.v0 && v < room.v1)) return null;
    if (this.frame.obstacles.length && this.frame.isObstacle(u, v)) return null;
    const c = this.frame.cell(u, v);
    const yTop = this.base + room.y1;
    const y = type === 'panel' ? yTop : yTop - 1 - ((o && o.drop) || 0);
    const l = { x: c[0], y, z: c[1], room: roomId, type, level: t.level };
    this._lights.push(l);
    return l;
  }

  /**
   * Odaya n (1..4) ışığı düzenli dağıtır (1: orta · 2: uzun eksende 1/4–3/4 · 3: üçgen · 4: dörtlü ızgara); engel hücresindeyse en yakın boş hücre.
   * Dönen: yerleşen ışıklar (üst sınır MAX_LIGHTS_PER_ROOM).
   */
  lightGrid(roomId, n, type, o) {
    const r = this._room(roomId);
    const w = r.u1 - r.u0;
    const d = r.v1 - r.v0;
    const q = (a, b2) => [r.u0 + Math.min(w - 1, Math.floor(w * a)), r.v0 + Math.min(d - 1, Math.floor(d * b2))];
    const spots = n <= 1 ? [q(0.5, 0.5)]
      : n === 2 ? (w >= d ? [q(0.25, 0.5), q(0.75, 0.5)] : [q(0.5, 0.25), q(0.5, 0.75)])
        : n === 3 ? [q(0.25, 0.3), q(0.75, 0.3), q(0.5, 0.75)] : [q(0.25, 0.25), q(0.75, 0.25), q(0.25, 0.75), q(0.75, 0.75)];
    const out = [];
    for (let i = 0; i < spots.length && i < MAX_LIGHTS_PER_ROOM; i++) {
      let placed = null;
      for (let dv = 0; dv <= 2 && !placed; dv++) {
        for (let du = 0; du <= 2 && !placed; du++) {
          for (let sgn = 0; sgn < 4 && !placed; sgn++) {
            const uu = spots[i][0] + (sgn & 1 ? -du : du);
            const vv = spots[i][1] + (sgn & 2 ? -dv : dv);
            placed = this.light(roomId, uu, vv, type, o);
          }
        }
      }
      if (placed) out.push(placed);
    }
    return out;
  }

  accent(u0, v0, u1, v1, y0, y1, block) {
    const r = this.frame.rect(u0, v0, u1, v1);
    this._accents.push({
      kind: 'strip', x0: r[0], y0: this.base + y0, z0: r[1], x1: r[2], y1: this.base + y1, z1: r[3], block,
    });
  }

  chip(slot, u, v, y) {
    const c = this.frame.pt(u, v);
    this._chips.push({ slot, x: c[0], y: this.base + (y || 0), z: c[1] });
  }

  signature(u, v, y) {
    const ow = OWNER_BY_INTERIOR[this.kind];
    if (!ow) return null;
    const c = this.frame.pt(u, v);
    this._sig = {
      key: ow.signature.key, name: ow.signature.name, itemKey: ow.signature.itemKey, existing: ow.signature.existing, x: c[0], y: this.base + (y || 0), z: c[1],
    };
    return this._sig;
  }

  /* ------------------------------------------------------------------------------------------ çıktı */
  _guardReady() {
    if (!this.rooms.length) return false;
    const f = this.frame;
    const ec = f.local(f.door.inside.x, f.door.inside.z);
    const er = this.rooms.find((r) => ec[0] >= r.u0 && ec[0] < r.u1 && ec[1] >= r.v0 && ec[1] < r.v1 && r.y0 === 0);
    if (!er) return false;
    const seen = new Set([er.id]);
    const q = [er.id];
    while (q.length) {
      const c = q.pop();
      for (let i = 0; i < this._graph.length; i++) {
        const e = this._graph[i];
        const o = e[0] === c ? e[1] : e[1] === c ? e[0] : null;
        if (o && !seen.has(o)) { seen.add(o); q.push(o); }
      }
    }
    return seen.size === this.rooms.length;
  }

  build() {
    return this._assemble(true);
  }

  _assemble(final) {
    const f = this.frame;
    const door = f.door;
    const rooms = this.rooms.map((r) => ({
      id: r.id, x0: r.wx0, y0: this.base + r.y0, z0: r.wz0, x1: r.wx1, y1: this.base + r.y1, z1: r.wz1, role: r.role,
    }));
    const doors = [{
      id: STREET_DOOR_ID, kind: 'street', x: door.x, y: this.base, z: door.z, axis: door.axis, w: 3, h: 3,
    }];
    this._doors.forEach((d) => {
      const c = Object.assign({}, d);
      delete c.lu;
      delete c.lv;
      delete c.lax;
      doors.push(c);
    });
    // son süzgeç: kapı önü / örtüşme (kapılar sonradan eklenmiş olabilir)
    const props = [];
    for (let i = 0; i < this._props.length; i++) {
      const p = this._props[i];
      if (!final) { props.push(p); continue; } // koruma anlık görüntüsü: yerleşimde zaten denetlendi
      const def = defOf(p.kind);
      const bx = def && def.colliders.length ? worldBoxes(def, p.x, p.y, p.z, p.yaw, []) : [];
      let bad = false;
      const exempt = def && (def.tags.indexOf('door') >= 0 || def.tags.indexOf('lockpad') >= 0);
      if (!exempt) {
        for (let b = 0; b < bx.length && !bad; b++) {
          for (let q = 0; q < doors.length && !bad; q++) {
            const d = doors[q];
            if (d.from) {
              if (d.rect && bx[b][0] < d.rect.x1 - EPS && bx[b][3] > d.rect.x0 + EPS && bx[b][2] < d.rect.z1 - EPS && bx[b][5] > d.rect.z0 + EPS) bad = true;
            } else if (ovl(bx[b], doorClearanceBoxes(d)[0])) bad = true;
          }
        }
      }
      if (bad) {
        if (final) this.dropped.push(p);
      } else props.push(p);
    }
    const entryCell = f.local(door.inside.x, door.inside.z);
    let entry = null;
    for (let i = 0; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      if (entryCell[0] >= r.u0 && entryCell[0] < r.u1 && entryCell[1] >= r.v0 && entryCell[1] < r.v1 && r.y0 === 0) { entry = { room: r.id, door: STREET_DOOR_ID }; break; }
    }
    return {
      v: 1,
      kind: this.kind,
      variant: this.variant,
      lotId: this.lot.id,
      ownerId: this.bp.ownerId || null,
      owner: this.owner,
      signature: this._sig,
      mood: this.mood,
      bounds: { x0: f.bounds.x0, y0: f.bounds.y0, z0: f.bounds.z0, x1: f.bounds.x1, y1: f.bounds.y1, z1: f.bounds.z1 },
      rooms,
      graph: this._graph.map((e) => e.slice()),
      doors,
      props,
      lights: this._lights.slice(),
      chips: this._chips.slice(),
      accents: this._accents.slice(),
      zones: this.zones.map((z) => ({ id: z.id, x0: z.x0, z0: z.z0, x1: z.x1, z1: z.z1, role: z.role })),
      obstacles: f.obstacles.map((o) => ({ x0: o.x0, z0: o.z0, x1: o.x1, z1: o.z1 })),
      entry,
      streetInside: { x: door.inside.x, z: door.inside.z },
      geometry: { W: f.W, D: f.D, H: f.H, face: f.face, mirror: f.mirror },
    };
  }
}

export { CLEAR_DEPTH, CLEAR_HEIGHT, CLEAR_WIDTH };
