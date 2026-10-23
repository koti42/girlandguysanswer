/*
 * KEŞİF sim/city/interior — 7–11. TÜRLER (garaj atölyesi, kulüp, market, çatı bahçesi, kitap-kafe) İÇİN ORTAK YARDIMCILAR (interiors_b).
 * Saf, belirlenimci, worker-güvenli. Tür modülleri (`kinds/*.js`) yalnız bunu + builder/kit/kitPlan/graph/registry/frame/locks içe aktarır.
 *
 * BuilderB = InteriorBuilder + ETKİN KOORDİNAT (kabuk cephesine bitişik yan/arka kenarlara 1 hücre ASTAR payı: o astar hücreleri iç mekânın kendi duvarıdır,
 * cephe değişmez). Tür planı yalnız ETKİN koordinatla (u ∈ [0,uw), v ∈ [0,ud); kapı edu) çalışır; BuilderB gerçek yerel koordinata çevirir:
 *   uw/ud/edu · ou (u kayması) · H      etkin boyutlar
 *   room(id,[u0,v0,u1,v1],o) · rr(id)   oda (etkin) · odanın GERÇEK yerel dikdörtgeni (yayım yazıcıları gerçek koordinat kullanır)
 *   door(id,a,b,spec)                   spec.axis 'u' → c etkin u; 'v' → line etkin u
 *   put(key,u,v,ly,o)                   (u,v)=ayak izinin sol-alt hücresi; ayak izi hücre dikdörtgenine ortalanır; o.flush 0..3 duvara yasla; o.du/dv ek kayma
 *   run(key,u,v,n,axis,ly,o) · place(key,u,v,ly,o) (hücre merkezi, kayma yok) · wall(key,u,v,side,o) (o.span) · atBack/atFront/atLeft/atRight(key,u,v,o)
 *   putFirst(key,[[u,v,ly,o]…]) ilk yerleşeni dener · trim(max,keepKinds) prop sayısını sınırlar
 *   pad(keys,target,rng,rooms?) duvar diplerine rastgele mobilya ekleyip prop sayısını hedefe tamamlar
 *   lamp(roomId,u,v,type,o) · accent(u0,v0,u1,v1,y0,y1,block) · chip(slot,u,v,y) · signature(u,v,y) · anchor(type,u,v,ly,y,extra) · post(u,v,ly,room)
 *   lockedDoor(id,a,b,spec,lk) kilitli iç kapı + kilit düzeneği + Interior.locks kaydı · clueNote(lockId,u,v,side,room) kod_notu (data=clueRefOf)
 *   fit(tercihU,w,v0,v1) çekirdekten kaçan u · doorC(odaDikdörtgeni, çizgi, tercih, w) çekirdekten uzak kapı merkezi · coreRect() çekirdek (etkin) · hiddenDoor(id,a,b,spec) gizli kapı (gizli_kapi_raf) · setHidden({room,door,lock?}) · coreAt([u0,v0,u1,v1]) etkin dikdörtgen çekirdeğe değiyor mu
 *   build()  → Interior (+ anchors, layout, ownerPost, locks, clues, hidden, ambient, kindOwnerId)
 * Deco                                  yayım: yazılabilir halka boyama (Deco.ring), cephe hücrelerine dokunmaz
 * brandSign(b)                          sahibin dükkân adı → tabela dizini (neon_tabela_ic `data`)
 */
import { InteriorBuilder } from './builder.js';
import { getCatalogDef } from '../../props/propCatalog.js';
import { getPropDef } from '../../props/propDefs.js';
import { signIndexOf } from '../../props/propSigns.js';
import { OWNER_BY_INTERIOR } from '../ownerData.js';
import { clueRefOf, makeLock } from './locks.js';

const EPS = 1e-6;

export function inRect(r, u, v) {
  return u >= r[0] && u < r[2] && v >= r[1] && v < r[3];
}

function defOf(key) {
  return getCatalogDef(key) || getPropDef(key);
}

export class BuilderB extends InteriorBuilder {
  constructor(ctx, opts) {
    super(ctx);
    const f = ctx.frame;
    const lining = !(opts && opts.lining === false);
    this.ou = lining && f.adj.l ? 1 : 0;
    const mr = lining && f.adj.r ? 1 : 0;
    this.mb = lining && f.adj.b ? 1 : 0;
    this.uw = f.W - this.ou - mr;
    this.ud = f.D - this.mb;
    this.edu = f.door.u - this.ou;
    this._reals = {};
    this._anchors = [];
    this._lockRecs = [];
    this._clues = [];
    this._post = null;
    this._hidden = null;
    this._lockN = 0;
    this.layout = {};
    this.missing = [];
    this.placed = 0;
    this.unplaced = [];
  }

  /* ------------------------------------------------------------------------------------------ odalar, kapılar */
  room(id, rect, o) {
    const r = [rect[0] + this.ou, rect[1], rect[2] + this.ou, rect[3]];
    const room = super.room(id, r, o);
    this._reals[id] = r;
    return room;
  }

  /** Odanın GERÇEK yerel dikdörtgeni [u0,v0,u1,v1] (yayım için). */
  rr(id) {
    return this._reals[id].slice();
  }

  door(id, aId, bId, spec) {
    const s = Object.assign({}, spec);
    if (s.axis === 'u') s.c += this.ou;
    else s.line += this.ou;
    return super.door(id, aId, bId, s);
  }

  /** Kule çekirdeği (tam ayak izi) ETKİN koordinatta [u0,v0,u1,v1] ya da null. */
  coreRect() {
    const f = this.frame;
    const q = f.solids.length ? f.solids[0] : (f.obstacles.length ? f.obstacles[0] : null);
    return q ? [q.u0 - this.ou, q.v0, q.u1 - this.ou, q.v1] : null;
  }

  /** Etkin dikdörtgen kule çekirdeğine (engel) değiyor mu. */
  coreAt(r) {
    return this.frame.obstacleAt(r[0] + this.ou, r[1], r[2] + this.ou, r[3]);
  }

  /** Genişlik w'lik [u0,u0+w) × [v0,v1) bandı çekirdeğe değmeyecek şekilde tercih edilen u'ya (pref) en yakın yere kaydırır; [1, uw-1-w] içinde (önce 1 hücre pay, sonra paysız). Yer yoksa -1. */
  fit(pref, w, v0, v1) {
    const lo = 1;
    const hi = this.uw - 1 - w;
    const cand = [];
    for (let u = lo; u <= hi; u++) cand.push(u);
    cand.sort((a, c) => Math.abs(a - pref) - Math.abs(c - pref) || a - c);
    for (let m = 1; m >= 0; m--) {
      for (let i = 0; i < cand.length; i++) if (!this.coreAt([cand[i] - m, v0 - m, cand[i] + w + m, v1 + m])) return cand[i];
    }
    return -1;
  }

  /**
   * Odanın bir kenar duvarında (axis 'u': v=line çizgisi; oda u aralığı [r[0],r[2]) ETKİN) kapı merkezi için çekirdekten uzak aday: tercih (pref) önce, sonra dışa.
   * w: kapı genişliği (1|3). Hiç yoksa pref.
   */
  doorC(r, line, pref, w) {
    const half = ((w || 1) - 1) / 2;
    const lo = r[0] + half;
    const hi = r[2] - 1 - half;
    const cand = [];
    for (let c = lo; c <= hi; c++) cand.push(c);
    cand.sort((a, b) => Math.abs(a - pref) - Math.abs(b - pref) || a - b);
    for (let i = 0; i < cand.length; i++) {
      const c = cand[i];
      if (!this.coreAt([c - half - 1, line - 1, c + half + 2, line + 2])) return c;
    }
    return Math.max(lo, Math.min(hi, pref));
  }

  /* ------------------------------------------------------------------------------------------ yerleştirme */
  _cells(key, ly, o) {
    const def = defOf(key);
    if (!def) return null;
    const op = o || {};
    const odd = (ly & 1) === 1;
    const fu = odd ? def.size[2] : def.size[0];
    const fv = odd ? def.size[0] : def.size[2];
    const cu = Math.max(1, Math.ceil(fu - EPS));
    const cv = Math.max(1, Math.ceil(fv - EPS));
    let du = (cu - 1) / 2;
    let dv = (cv - 1) / 2;
    if (op.flush === 0) dv += (cv - fv) / 2;
    else if (op.flush === 2) dv -= (cv - fv) / 2;
    else if (op.flush === 1) du += (cu - fu) / 2;
    else if (op.flush === 3) du -= (cu - fu) / 2;
    return {
      def, fu, fv, cu, cv, du, dv,
    };
  }

  put(key, u, v, ly, o) {
    const c = this._cells(key, ly, o);
    if (!c) {
      this.missing.push(key);
      return null;
    }
    const op = o || {};
    const o2 = Object.assign({}, op, { du: c.du + (op.du || 0), dv: c.dv + (op.dv || 0) });
    delete o2.flush;
    const r = this.prop(key, u + this.ou, v, ly, o2);
    if (r) this.placed++;
    else this.unplaced.push(key + '@' + u + ',' + v);
    return r;
  }

  /** Hücre merkezine koyar (kayma yok; o.du/dv geçerli). */
  place(key, u, v, ly, o) {
    const r = this.prop(key, u + this.ou, v, ly, o);
    if (r) this.placed++;
    else this.unplaced.push(key + '@' + u + ',' + v);
    return r;
  }

  /** Yan yana n tane (axis 'u' | 'v'); adım = o.step ya da ayak izi hücre sayısı. Yerleşen sayısı. */
  run(key, u, v, n, axis, ly, o) {
    const c = this._cells(key, ly, o);
    if (!c) {
      this.missing.push(key);
      return 0;
    }
    const op = o || {};
    const step = op.step || (axis === 'u' ? c.cu : c.cv);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const o2 = Object.assign({}, op);
      delete o2.step;
      delete o2.variants;
      if (op.variants) o2.variant = op.variants[i % op.variants.length];
      if (this.put(key, axis === 'u' ? u + i * step : u, axis === 'v' ? v + i * step : v, ly, o2)) k++;
    }
    return k;
  }

  /** Duvar propu: side = hücreden duvara yerel yön. span = duvar boyunca hücre sayısı (geniş tanımı ortalar). */
  wall(key, u, v, side, o) {
    const def = defOf(key);
    if (!def) {
      this.missing.push(key);
      return null;
    }
    const op = o || {};
    const span = op.span || Math.max(1, Math.ceil(def.size[0] - EPS));
    const t = (span - 1) / 2;
    const o2 = Object.assign({}, op);
    delete o2.span;
    if ((side & 1) === 0) o2.du = (o2.du || 0) + t;
    else o2.dv = (o2.dv || 0) + t;
    const r = this.wallProp(key, u + this.ou, v, side, o2);
    if (r) this.placed++;
    else this.unplaced.push(key + '#' + u + ',' + v);
    return r;
  }

  /* duvara yaslı yerleştirme kısayolları (arka = +v, ön = kapı duvarı = -v, sol = -u, sağ = +u); ön yüz odaya bakar */
  atBack(key, u, v, o) {
    return this.put(key, u, v, 2, Object.assign({ flush: 0 }, o));
  }

  atFront(key, u, v, o) {
    return this.put(key, u, v, 0, Object.assign({ flush: 2 }, o));
  }

  atLeft(key, u, v, o) {
    return this.put(key, u, v, 1, Object.assign({ flush: 3 }, o));
  }

  atRight(key, u, v, o) {
    return this.put(key, u, v, 3, Object.assign({ flush: 1 }, o));
  }

  /** Gizli kapı: kapı hücreleri (3 geniş) + `gizli_kapi_raf` propu (builder.door 'kapi' propu yerine). */
  hiddenDoor(id, aId, bId, spec) {
    const d = this.door(id, aId, bId, Object.assign({}, spec, { kind: 'door', prop: false, w: 3 }));
    const def = defOf('gizli_kapi_raf');
    if (!def) {
      this.missing.push('gizli_kapi_raf');
      return d;
    }
    d.propSlot = this._slot++;
    d.hidden = true;
    const hl = makeLock(this.lockId(), 'serbest', 0, {});
    d.lock = hl;
    this._lockRecs.push({
      id: hl.id, kind: 'serbest', tier: 0, data: hl.data, door: id, clue: null, pad: -1,
    });
    this._props.push({
      kind: 'gizli_kapi_raf', x: d.x + 0.5, y: d.y, z: d.z + 0.5, yaw: this.frame.yaw(spec.axis === 'u' ? 2 : 3), variant: 0, lotId: this.lot.id, slot: d.propSlot,
    });
    return d;
  }

  /**
   * Prop sayısı hedefe (target; kapı/kilit düzenekleri dahil) ulaşana dek odaların duvar diplerine keys'ten rastgele mobilya ekler (yerleşemeyen denemeler atlanır).
   * rng: planın tohumlu akışı. rooms: oda kimlikleri (varsayılan hepsi). Dönen: eklenen sayı.
   */
  pad(keys, target, rng, rooms) {
    const ids = rooms || Object.keys(this._reals);
    let added = 0;
    for (let t = 0; t < 240 && this._props.length < target; t++) {
      const id = ids[rng.i(ids.length)];
      const r = this._reals[id];
      const u0 = r[0] - this.ou;
      const u1 = r[2] - this.ou;
      const v0 = r[1];
      const v1 = r[3];
      const key = keys[rng.i(keys.length)];
      const w = rng.i(4);
      const variant = rng.i(4);
      let p = null;
      if (w === 0) p = this.atBack(key, u0 + rng.i(u1 - u0), v1 - 1, { variant });
      else if (w === 1) p = this.atRight(key, u1 - 1, v0 + rng.i(v1 - v0), { variant });
      else if (w === 2) p = this.atFront(key, u0 + rng.i(u1 - u0), v0, { variant });
      else p = this.atLeft(key, u0, v0 + rng.i(v1 - v0), { variant });
      if (p) added++;
    }
    return added;
  }

  /**
   * Adayları sırayla dener (her aday {u,v,ly,o}); ilk yerleşeni döndürür. Hepsi başarısızsa null.
   */
  putFirst(key, cands) {
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      const r = this.put(key, c[0], c[1], c[2], c[3]);
      if (r) {
        this.lastCand = c;
        return r;
      }
    }
    return null;
  }

  /**
   * Prop sayısını max'a indirir: sondan başlayarak zorunlu olmayan (kapı, kilit düzeneği, kod notu, keepKinds) propları siler.
   * Çalışmadan önce planın asıl mobilyaları yerleşmiş olmalıdır; pad() ile eklenenler en sonda olduğundan önce onlar gider.
   */
  trim(max, keepKinds) {
    const keep = keepKinds || [];
    for (let i = this._props.length - 1; i >= 0 && this._props.length > max; i--) {
      const p = this._props[i];
      const def = defOf(p.kind);
      if (keep.indexOf(p.kind) >= 0) continue;
      if (def && (def.tags.indexOf('door') >= 0 || def.tags.indexOf('lockpad') >= 0 || def.tags.indexOf('zorunlu') >= 0)) continue;
      if (this._clues.some((c) => c.slot === p.slot)) continue;
      this._props.splice(i, 1);
      this._boxes = this._boxes.filter((q) => q.slot !== p.slot);
    }
  }

  /* ------------------------------------------------------------------------------------------ ışık, aksan, çip, imza, çapa */
  lamp(roomId, u, v, type, o) {
    return this.light(roomId, u + this.ou, v, type, o);
  }

  accent(u0, v0, u1, v1, y0, y1, block) {
    return super.accent(u0 + this.ou, v0, u1 + this.ou, v1, y0, y1, block);
  }

  chip(slot, u, v, y) {
    return super.chip(slot, u + this.ou, v, y);
  }

  signature(u, v, y) {
    return super.signature(u + this.ou, v, y);
  }

  anchor(type, u, v, ly, y, extra) {
    const c = this.frame.pt(u + this.ou, v);
    const a = Object.assign({
      type, x: c[0], y: this.base + (y || 0), z: c[1], yaw: this.frame.yaw(ly),
    }, extra || null);
    this._anchors.push(a);
    return a;
  }

  /** Sahip duruş noktası (Interior.ownerPost; çapa 'owner' da eklenir). */
  post(u, v, ly, room) {
    const c = this.frame.pt(u + this.ou, v);
    this._post = {
      x: c[0], y: this.base, z: c[1], yaw: this.frame.yaw(ly), room,
    };
    this._anchors.push(Object.assign({ type: 'owner' }, this._post));
    return this._post;
  }

  /* ------------------------------------------------------------------------------------------ kilit */
  /** Kilit kimliği: 'l' + parsel(36'lık) + sıra harfi (locks.js ID_RE ve dim kayıt anahtarı kuralıyla uyumlu). */
  lockId() {
    return 'l' + (this.lot.id >>> 0).toString(36) + String.fromCharCode(97 + (this._lockN++ % 26));
  }

  /**
   * Kilitli iç kapı: kapı + kilit düzeneği (duvar propu) + Interior.locks kaydı. lk = {kind:'kod'|'mini_hack'|'serbest', tier, data?, pad:'a'|'b'}.
   * Dönüş {door, lock, pad}.
   */
  lockedDoor(id, aId, bId, spec, lk) {
    const lock = makeLock(this.lockId(), lk.kind, lk.tier, lk.data || {});
    const d = this.door(id, aId, bId, Object.assign({}, spec, { lock, kind: spec.kind || 'door' }));
    const pad = this.lockPad(d, lk.pad || 'a', lk.kind);
    this._lockRecs.push({
      id: lock.id, kind: lock.kind, tier: lock.tier, data: lock.data, door: id, clue: null, pad: pad ? pad.slot : -1,
    });
    return { door: d, lock, pad };
  }

  /** kod_notu: kilit ipucu (data = clueRefOf(kilit) → locks.assignClues eşleşir). side = hücreden duvara yön. */
  clueNote(lockId, u, v, side, room, o) {
    const r = this.wall('kod_notu', u, v, side, Object.assign({ room, data: clueRefOf(lockId), span: 1 }, o));
    const rec = this._lockRecs.find((q) => q.id === lockId);
    if (r && rec) rec.clue = { type: 'prop', key: 'kod_notu', room, slot: r.slot };
    if (r) {
      this._clues.push({
        lockId, slot: r.slot, room, x: r.x, y: r.y, z: r.z,
      });
    }
    return r;
  }

  /** Gizli oda bildirimi: {room, door, lock?}. */
  setHidden(h) {
    this._hidden = h;
  }

  /** (x,z) dünya noktası bir çarpışma kutusunun (ayak–baş aralığı) ya da çekirdeğin içinde mi. */
  _blockedAt(x, z, y) {
    const f = this.frame;
    for (let i = 0; i < f.obstacles.length; i++) {
      const o = f.obstacles[i];
      if (x >= o.x0 && x < o.x1 && z >= o.z0 && z < o.z1) return true;
    }
    for (let i = 0; i < this._boxes.length; i++) {
      const q = this._boxes[i].box;
      if (x > q[0] + EPS && x < q[3] - EPS && z > q[2] + EPS && z < q[5] - EPS && q[4] > y + 0.5 && q[1] < y + 1.8) return true;
    }
    return false;
  }

  /**
   * Çapaları (sahip, satıcı, park yeri) ve çipleri çarpışma kutusu/çekirdek içinde kalmayacak şekilde, aynı odada en yakın boş hücreye taşır.
   * (Önce yerleşen prop, sonra çapa kuralı: planlayıcı çapayı tercih eder, prop ayak izi kazanırsa çapa kayar.)
   */
  _settle() {
    const f = this.frame;
    const fix = (p, roomId) => {
      if (!this._blockedAt(p.x, p.z, p.y)) return;
      const l = f.local(Math.floor(p.x), Math.floor(p.z));
      let room = roomId ? this._reals[roomId] : null;
      if (!room) {
        const ids = Object.keys(this._reals);
        for (let i = 0; i < ids.length; i++) {
          const r = this._reals[ids[i]];
          if (l[0] >= r[0] && l[0] < r[2] && l[1] >= r[1] && l[1] < r[3]) { room = r; break; }
        }
      }
      if (!room) return;
      for (let rad = 1; rad <= 5; rad++) {
        for (let dv = -rad; dv <= rad; dv++) {
          for (let du = -rad; du <= rad; du++) {
            if (Math.max(Math.abs(du), Math.abs(dv)) !== rad) continue;
            const u = l[0] + du;
            const v = l[1] + dv;
            if (u < room[0] || u >= room[2] || v < room[1] || v >= room[3]) continue;
            const c = f.pt(u, v);
            if (this._blockedAt(c[0], c[1], p.y)) continue;
            // iç kapıların önüne (3 geniş × 2 derin) konmaz
            let nearDoor = false;
            for (let q = 0; q < this._doors.length && !nearDoor; q++) {
              const d = this._doors[q];
              if (d.from) continue;
              if (Math.abs(d.x + 0.5 - c[0]) < 2 && Math.abs(d.z + 0.5 - c[1]) < 2) nearDoor = true;
            }
            if (nearDoor) continue;
            p.x = c[0];
            p.z = c[1];
            return;
          }
        }
      }
    };
    this._anchors.forEach((a) => fix(a, a.room));
    if (this._post) {
      const a = this._anchors.find((q) => q.type === 'owner');
      fix(this._post, this._post.room);
      if (a) {
        a.x = this._post.x;
        a.z = this._post.z;
      }
    }
    this._chips.forEach((c) => fix(c, null));
  }

  build() {
    this._settle();
    const it = super.build();
    const ow = OWNER_BY_INTERIOR[this.kind] || null;
    it.anchors = this._anchors.map((a) => Object.assign({}, a));
    it.layout = this.layout;
    it.ownerPost = this._post ? Object.assign({}, this._post) : null;
    it.locks = this._lockRecs.map((l) => Object.assign({}, l));
    it.clues = this._clues.map((c) => Object.assign({}, c));
    it.hidden = this._hidden || null;
    it.ambient = it.mood.ambient;
    it.kindOwnerId = ow ? ow.id : null;
    return it;
  }
}

/**
 * Yan şerit seçimi: kapı (3 geniş, etkin u) hangi yan salonun içinde kalırsa şerit öbür yana konur. Dönüş {right, sw}: right=true → şerit sağda
 * (salon [0, W-sw-1)), false → solda (salon [sw+1, W)). Salon dar kalıyorsa şerit genişliği swMax→4'e düşer.
 */
export function pickStrip(W, du, swMax) {
  for (let sw = swMax; sw >= 4; sw--) {
    if (du + 1 <= W - sw - 2) return { right: true, sw };
    if (du - 1 >= sw + 1) return { right: false, sw };
  }
  return { right: du < W / 2, sw: 4 };
}

/** Sahibin (ya da türün varsayılan sahibinin) dükkân adı → SIGN dizini (iç neon tabela `data`). */
export function brandSign(b) {
  const ow = b.owner || OWNER_BY_INTERIOR[b.kind] || null;
  if (!ow) return 0;
  const i = signIndexOf('brand', ow.brand);
  return i < 0 ? 0 : i;
}

/* ------------------------------------------------------------------------------------------------
 * Deco — yazılabilir halka denetimli yazıcı. Kabuğun dış halkasına (bina cephesi) bitişik kenarlara DOKUNMAZ (cephe değişmez).
 * ---------------------------------------------------------------------------------------------- */
export class Deco {
  constructor(kit, frame) {
    this.k = kit;
    this.f = frame;
  }

  /** (u,v) halka hücresi yazılabilir mi (kabuk cephesi değil mi). */
  free(u, v) {
    const f = this.f;
    if (v < 0) return false;
    if (u < 0 && f.adj.l) return false;
    if (u >= f.W && f.adj.r) return false;
    if (v >= f.D && f.adj.b) return false;
    return true;
  }

  /**
   * Odanın (GERÇEK yerel dikdörtgen [u0,v0,u1,v1]) etrafındaki 1 kalın duvar halkasının iç yüzünü boyar (y0..y1 kat satırı).
   * fn(side, t, y, u, v) → blok kimliği | undefined. side: 0 arka (v1), 1 sağ (u1), 2 ön (v0-1), 3 sol (u0-1); t halka boyunca 0 tabanlı sıra.
   * Köşeler iki kenara da girer (ön/arka kenar u0-1..u1 kapsar). Yazılamayan (cephe) ve duvar olmayan (hava) hücreler atlanır.
   */
  ring(rect, y0, y1, fn) {
    const [u0, v0, u1, v1] = rect;
    for (let u = u0 - 1; u <= u1; u++) {
      if (this.free(u, v1)) this._ringCell(u, v1, y0, y1, (y) => fn(0, u - u0 + 1, y, u, v1));
      if (this.free(u, v0 - 1)) this._ringCell(u, v0 - 1, y0, y1, (y) => fn(2, u - u0 + 1, y, u, v0 - 1));
    }
    for (let v = v0; v < v1; v++) {
      if (this.free(u1, v)) this._ringCell(u1, v, y0, y1, (y) => fn(1, v - v0, y, u1, v));
      if (this.free(u0 - 1, v)) this._ringCell(u0 - 1, v, y0, y1, (y) => fn(3, v - v0, y, u0 - 1, v));
    }
  }

  _ringCell(u, v, y0, y1, fy) {
    const k = this.k;
    const f = this.f;
    for (let y = y0; y < y1; y++) {
      const id = fy(y);
      if (id === undefined || id === null) continue;
      if (f.solids.length && f.isSolid(u, v)) continue;
      if (k.get(u, v, y) === 0) continue;
      k.set(u, v, y, id);
    }
  }
}

/** a ve b dikdörtgenleri (yerel, yarı açık) kesişiyor mu. */
export function rectsHit(a, b) {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}
