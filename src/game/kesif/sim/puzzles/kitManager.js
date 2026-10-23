/*
 * KEŞİF bulmaca altyapısı — PuzzleManager (saf; DOM/three yok).
 *
 * Oyun, yakındaki yapıların bulmacalarını `register(id, desc)` ile kaydeder; manager
 *   - konum dizini kurar (build'in döndürdüğü `anchors` içindeki {x,y,z}'ler tam eşleşir; yoksa oda kutusu),
 *   - `handleInteract(ev)` ile olayı sahibi bulmacaya yönlendirir ve sonucu (state + efektler) uygular,
 *   - `update(dt, playerPos)` ile yarıçap içindeki (varsayılan 48 blok) bulmacaları tick'ler,
 *   - `serialize()/restore(map)` ile durumu JSON'a çevirir/geri yükler (kayıt),
 *   - çözülünce emit({type:'puzzleSolved', id, puzzleType, zone, structureId}) yayar.
 *
 * Kayıttan yükleme SIRASI serbesttir: restore(map) henüz kaydedilmemiş bulmacaların durumunu "bekleyen" olarak tutar,
 * register() sırasında uygular; serialize() bekleyenleri de yazar (kayıt hiçbir bulmacayı unutmaz).
 *
 * Çalışma zamanı yazımları world.setBlock (kayıtlı düzenleme) ile yapılır; chunk yüklü değilse world.applyEdits ile
 * düzenleme olarak biriktirilir (chunk üretilince uygulanır).
 */
import { toSeedInt } from '../rng.js';
import { zoneIndexAt } from '../constants.js';
import { clampDifficulty, getPuzzle } from './kitRegistry.js';
import { makeCtx } from './kitCtx.js';
import { applyEffects } from './kitEffects.js';
import { boxContains, distToBox, roomBounds } from './kitGeometry.js';

/** Tek update çağrısında işlenen en büyük dt (sn); sekme dönüşünde dev adımları engeller. */
const MAX_DT = 0.25;
const MAX_ANCHORS = 4096;

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function noop() {}

function volume(b) {
  return (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) * (b.z1 - b.z0 + 1);
}

/** anchors içindeki tüm {x,y,z} (sonlu sayı) nesnelerini dizine ekler. */
function collectAnchors(node, out, depth) {
  if (!node || typeof node !== 'object' || depth > 6 || out.length >= MAX_ANCHORS) return;
  if (Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z)) {
    out.push(Math.floor(node.x) + ',' + Math.floor(node.y) + ',' + Math.floor(node.z));
  }
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) collectAnchors(node[keys[i]], out, depth + 1);
}

export class PuzzleManager {
  /**
   * @param {{world?, emit?:(evt)=>void, seed?, spawnEntity?, radius?:number, strict?:boolean, onError?:Function}} o
   *   strict: bulmaca hatalarını yutmak yerine fırlatır (testler); onError(err, {id, phase}) hata kancası.
   */
  constructor(o) {
    const opt = o || {};
    this.world = opt.world || null;
    this.seed = opt.seed !== undefined ? opt.seed : (this.world ? this.world.seed : 0);
    this.radius = opt.radius > 0 ? opt.radius : 48;
    this.strict = !!opt.strict;
    this.time = 0;
    this.errors = [];
    this.skipped = [];
    /** Geçersiz (atlanan) efekt sayacı; bulmaca hatası teşhisi için. */
    this.skippedEffects = 0;
    this._emit = typeof opt.emit === 'function' ? opt.emit : null;
    this._spawn = typeof opt.spawnEntity === 'function' ? opt.spawnEntity : null;
    this._onError = typeof opt.onError === 'function' ? opt.onError : null;
    this._entries = new Map();
    this._anchors = new Map();
    this._pending = new Map();
    this._listeners = { solved: [], effect: [], message: [] };
    this._seedInt = toSeedInt(this.seed);
  }

  /* ---------------------------------------------------------------------------------------------
   * Olaylar
   * ------------------------------------------------------------------------------------------- */
  /** 'solved' (puzzleSolved olayı) | 'effect' (blok-dışı her efekt) | 'message' ({kind:'message',text,puzzleId}). */
  on(type, cb) {
    const list = this._listeners[type];
    if (!list || typeof cb !== 'function') return noop;
    list.push(cb);
    return () => {
      const i = list.indexOf(cb);
      if (i >= 0) list.splice(i, 1);
    };
  }

  _fire(type, payload) {
    const list = this._listeners[type];
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](payload);
      } catch (err) {
        this._fail(payload && payload.puzzleId !== undefined ? payload.puzzleId : (payload && payload.id), 'listener', err);
      }
    }
  }

  _fail(id, phase, err) {
    this.errors.push({ id, phase, error: err });
    if (this._onError) {
      try {
        this._onError(err, { id, phase });
      } catch {
        // hata kancasının hatası yutulur
      }
    }
    if (this.strict) throw err;
  }

  /* ---------------------------------------------------------------------------------------------
   * Dünya erişimi (bulmaca ctx'i ve efektler bunları kullanır)
   * ------------------------------------------------------------------------------------------- */
  /** Çalışma zamanı blok yazımı: yüklüyse world.setBlock, değilse bekleyen düzenleme. */
  setBlock(x, y, z, id) {
    const w = this.world;
    if (!w) return false;
    if (w.getBlock(x, y, z) === null) {
      if (typeof w.applyEdits === 'function') w.applyEdits([[x, y, z, id]]);
      return true;
    }
    return w.setBlock(x, y, z, id);
  }

  getBlock(x, y, z) {
    return this.world ? this.world.getBlock(x, y, z) : null;
  }

  spawnEntity(type, x, y, z, opts) {
    return this._spawn ? this._spawn(type, x, y, z, opts) : null;
  }

  /* ---------------------------------------------------------------------------------------------
   * Kayıt
   * ------------------------------------------------------------------------------------------- */
  /**
   * Bulmacayı kaydeder (aynı id ikinci kez → mevcut görünümü döner). Tip kayıtlı değilse ya da kurulum hata verirse null.
   * desc: { type, origin:{x,y,z}, facing?, difficulty?, zone?, structureId? }
   */
  register(id, desc) {
    if (this._entries.has(id)) return this.get(id);
    const d = desc || {};
    const impl = getPuzzle(d.type);
    if (!impl) {
      this.skipped.push({ id, type: d.type });
      return null;
    }
    if (!d.origin || !Number.isFinite(d.origin.x) || !Number.isFinite(d.origin.y) || !Number.isFinite(d.origin.z)) {
      this.skipped.push({ id, type: d.type, reason: 'origin' });
      return null;
    }
    const origin = { x: Math.floor(d.origin.x), y: Math.floor(d.origin.y), z: Math.floor(d.origin.z) };
    const difficulty = clampDifficulty(impl, d.difficulty === undefined ? 1 : d.difficulty);
    const zone = d.zone === undefined || d.zone === null ? zoneIndexAt(origin.x, origin.z) : d.zone;
    const base = {
      id, world: this.world, worldSeed: this._seedInt, origin, facing: d.facing, difficulty, zone,
    };
    const entry = {
      id,
      type: d.type,
      impl,
      origin,
      facing: 0,
      difficulty,
      zone,
      structureId: d.structureId === undefined ? null : d.structureId,
      state: null,
      solved: false,
      initialJson: '',
      anchors: {},
      bounds: null,
      innerVol: 0,
      outerVol: 0,
      anchorKeys: [],
      failed: false,
      ctx: null,
    };
    // Çalışma ctx'i (kalıcı; tick'te nesne üretilmez)
    entry.ctx = makeCtx(Object.assign({}, base, {
      setBlock: (x, y, z, v) => this.setBlock(x, y, z, v),
      getBlock: (x, y, z) => this.getBlock(x, y, z),
      spawnEntity: (t, x, y, z, o) => this.spawnEntity(t, x, y, z, o),
    }));
    entry.facing = entry.ctx.facing;
    // Kuru çalıştırma: yazımsız build → başlangıç durumu + anchors
    let res;
    try {
      const dry = makeCtx(Object.assign({}, base, { setBlock: noop, getBlock: () => null, spawnEntity: noop }));
      res = impl.build(dry) || {};
      const fp = impl.footprint(difficulty);
      entry.bounds = roomBounds(origin, entry.facing, fp, fp.margin === undefined ? 2 : fp.margin);
    } catch (err) {
      this._fail(id, 'build', err);
      return null;
    }
    entry.state = clone(res.state === undefined ? {} : res.state);
    entry.initialJson = JSON.stringify(entry.state);
    entry.anchors = res.anchors || {};
    entry.innerVol = volume(entry.bounds.inner);
    entry.outerVol = volume(entry.bounds.outer);
    collectAnchors(entry.anchors, entry.anchorKeys, 0);
    this._entries.set(id, entry);
    for (let i = 0; i < entry.anchorKeys.length; i++) this._anchors.set(entry.anchorKeys[i], id);
    const p = this._pending.get(id);
    if (p) this._applyRestore(entry, p);
    return this.get(id);
  }

  has(id) {
    return this._entries.has(id);
  }

  /** {id,type,solved,state,zone,origin,facing,difficulty,structureId,anchors,bounds} | null. `state` canlıdır (kopya değil). */
  get(id) {
    const e = this._entries.get(id);
    if (!e) return null;
    return {
      id: e.id,
      type: e.type,
      solved: e.solved,
      state: e.state,
      zone: e.zone,
      origin: e.origin,
      facing: e.facing,
      difficulty: e.difficulty,
      structureId: e.structureId,
      anchors: e.anchors,
      bounds: e.bounds,
    };
  }

  /** Kayıtlı bulmaca kimlikleri. */
  list() {
    return Array.from(this._entries.keys());
  }

  get size() {
    return this._entries.size;
  }

  isSolved(id) {
    const e = this._entries.get(id);
    if (e) return e.solved;
    const p = this._pending.get(id);
    return !!(p && p.solved);
  }

  /** Kaydı siler (uzaklaşınca bellek için). Değişmiş/çözülmüş durum "bekleyen"e taşınır, kayıt kaybolmaz. */
  unregister(id) {
    const e = this._entries.get(id);
    if (!e) return false;
    if (e.solved || JSON.stringify(e.state) !== e.initialJson) {
      this._pending.set(id, { type: e.type, state: clone(e.state), solved: e.solved });
    }
    for (let i = 0; i < e.anchorKeys.length; i++) {
      if (this._anchors.get(e.anchorKeys[i]) === id) this._anchors.delete(e.anchorKeys[i]);
    }
    this._entries.delete(id);
    return true;
  }

  /* ---------------------------------------------------------------------------------------------
   * Konum → bulmaca
   * ------------------------------------------------------------------------------------------- */
  /** (x,y,z) hücresine sahip bulmaca kimliği | null (anchor tam eşleşme → iç kutu → dış kutu; eşitlikte en küçük). */
  ownerAt(x, y, z) {
    const e = this._findAt(Math.floor(x), Math.floor(y), Math.floor(z));
    return e ? e.id : null;
  }

  _findAt(x, y, z) {
    const a = this._anchors.get(x + ',' + y + ',' + z);
    if (a !== undefined) {
      const e = this._entries.get(a);
      if (e) return e;
    }
    let best = null;
    let bestInner = false;
    let bestVol = Infinity;
    for (const e of this._entries.values()) {
      const inner = boxContains(e.bounds.inner, x, y, z);
      if (!inner && !boxContains(e.bounds.outer, x, y, z)) continue;
      const vol = inner ? e.innerVol : e.outerVol;
      if ((inner && !bestInner) || (inner === bestInner && vol < bestVol)) {
        best = e;
        bestInner = inner;
        bestVol = vol;
      }
    }
    return best;
  }

  /** (x,y,z)'ye en yakın bulmaca (oda kutusuna uzaklık ≤ r, varsayılan 32) | null. */
  nearest(x, y, z, r) {
    const lim = r === undefined ? 32 : r;
    let best = null;
    let bestD = Infinity;
    for (const e of this._entries.values()) {
      const dd = distToBox(e.bounds.outer, x, y, z);
      if (dd <= lim && dd < bestD) {
        best = e.id;
        bestD = dd;
      }
    }
    return best;
  }

  /* ---------------------------------------------------------------------------------------------
   * Etkileşim
   * ------------------------------------------------------------------------------------------- */
  /**
   * Olayı sahibi bulmacaya yollar. ev: {type:'use'|'step'|'blockPlaced'|'blockBroken'|'entity'|'beam'|'portalShot',
   * x,y,z, item?, entityId?, playerId?, puzzleId?}. Döner: olay işlendi mi (durum değişti ya da efekt üretildi;
   * bulmaca `handled:boolean` döndürürse o geçerli). true ise çağıran normal blok işlevlerine geçmez.
   */
  handleInteract(ev) {
    if (!ev || typeof ev !== 'object') return false;
    let entry = null;
    if (ev.puzzleId !== undefined) entry = this._entries.get(ev.puzzleId) || null;
    if (!entry) {
      if (!Number.isFinite(ev.x) || !Number.isFinite(ev.y) || !Number.isFinite(ev.z)) return false;
      entry = this._findAt(Math.floor(ev.x), Math.floor(ev.y), Math.floor(ev.z));
    }
    if (!entry || entry.failed) return false;
    return this._interact(entry, ev);
  }

  /** Kolaylık: konuma basış/yürüme olayı ('step'). info: {playerId?, entityId?}. */
  step(x, y, z, info) {
    return this.handleInteract(Object.assign({ type: 'step', x, y, z }, info));
  }

  _interact(entry, ev) {
    const ev2 = Object.assign({}, ev);
    if (Number.isFinite(ev2.x)) ev2.x = Math.floor(ev2.x);
    if (Number.isFinite(ev2.y)) ev2.y = Math.floor(ev2.y);
    if (Number.isFinite(ev2.z)) ev2.z = Math.floor(ev2.z);
    entry.ctx.time = this.time;
    const before = JSON.stringify(entry.state);
    let res;
    try {
      res = entry.impl.interact(entry.ctx, entry.state, ev2) || {};
    } catch (err) {
      this._fail(entry.id, 'interact', err);
      return false;
    }
    if (res.state !== undefined) entry.state = res.state;
    const changed = JSON.stringify(entry.state) !== before;
    const effects = res.effects;
    const had = Array.isArray(effects) && effects.length > 0;
    this._runEffects(entry, effects);
    this._checkSolved(entry);
    if (typeof res.handled === 'boolean') return res.handled;
    return changed || had;
  }

  /* ---------------------------------------------------------------------------------------------
   * Zaman
   * ------------------------------------------------------------------------------------------- */
  /** dt sn. playerPos verilirse yalnız yarıçap içindeki bulmacalar tick'lenir; verilmezse hepsi. */
  update(dt, playerPos) {
    if (!(dt > 0)) return;
    const step = dt > MAX_DT ? MAX_DT : dt;
    this.time += step;
    const r = this.radius;
    for (const e of this._entries.values()) {
      if (e.failed) continue;
      if (playerPos && distToBox(e.bounds.outer, playerPos.x, playerPos.y, playerPos.z) > r) continue;
      this._tick(e, step);
    }
  }

  _tick(entry, dt) {
    entry.ctx.time = this.time;
    let res;
    try {
      res = entry.impl.tick(entry.ctx, entry.state, dt);
    } catch (err) {
      entry.failed = !this.strict;
      this._fail(entry.id, 'tick', err);
      return;
    }
    if (res) {
      if (res.state !== undefined) entry.state = res.state;
      if (res.effects && res.effects.length > 0) this._runEffects(entry, res.effects);
    }
    this._checkSolved(entry);
  }

  /* ---------------------------------------------------------------------------------------------
   * Efekt / çözüm / sıfırlama
   * ------------------------------------------------------------------------------------------- */
  _runEffects(entry, effects) {
    if (!effects || effects.length === 0) return;
    const sink = {
      setBlock: (x, y, z, id) => this.setBlock(x, y, z, id),
      spawnEntity: (t, x, y, z, o) => this.spawnEntity(t, x, y, z, o),
      onEffect: (e) => {
        this._fire('effect', e);
        if (e.kind === 'message') this._fire('message', e);
      },
    };
    const out = applyEffects(sink, effects, { puzzleId: entry.id });
    this.skippedEffects += out.skipped;
    if (out.solved) this._markSolved(entry);
    if (out.reset) this.reset(entry.id);
  }

  _checkSolved(entry) {
    if (entry.solved) return;
    let ok = false;
    try {
      ok = !!entry.impl.isSolved(entry.state);
    } catch (err) {
      this._fail(entry.id, 'isSolved', err);
    }
    if (ok) this._markSolved(entry);
  }

  _markSolved(entry) {
    if (entry.solved) return;
    entry.solved = true;
    const evt = {
      type: 'puzzleSolved',
      id: entry.id,
      puzzleType: entry.type,
      zone: entry.zone,
      structureId: entry.structureId,
    };
    if (this._emit) {
      try {
        this._emit(evt);
      } catch (err) {
        this._fail(entry.id, 'emit', err);
      }
    }
    this._fire('solved', evt);
  }

  /**
   * Bulmacayı başlangıç durumuna döndürür (impl.restore ile blokları da geri kurar). Çözülmüş bulmaca
   * `force` olmadan sıfırlanmaz (ilerleme kaybolmasın). Döner: sıfırlandı mı.
   */
  reset(id, o) {
    const e = this._entries.get(id);
    if (!e) return false;
    const force = !!(o && o.force);
    if (e.solved && !force) return false;
    e.state = JSON.parse(e.initialJson);
    if (force) e.solved = false;
    e.ctx.time = this.time;
    try {
      e.impl.restore(e.ctx, e.state);
    } catch (err) {
      this._fail(id, 'reset', err);
      return false;
    }
    return true;
  }

  /** (x,y,z) yakınındaki (r ≤ 32) bulmacayı sıfırlar; api.resetNearestPuzzle için. */
  resetNearest(x, y, z, r) {
    const id = this.nearest(x, y, z, r);
    return id === null ? false : this.reset(id);
  }

  /** Bulmaca ipucu (Türkçe) | ''. */
  hintFor(id) {
    const e = this._entries.get(id);
    if (!e) return '';
    try {
      return e.impl.hint(e.state) || '';
    } catch (err) {
      this._fail(id, 'hint', err);
      return '';
    }
  }

  /** Yakındaki (r ≤ 24) bulmacanın ipucu | null; api.getPuzzleHint için. */
  hintNear(x, y, z, r) {
    const id = this.nearest(x, y, z, r === undefined ? 24 : r);
    if (id === null) return null;
    const t = this.hintFor(id);
    return t === '' ? null : t;
  }

  /* ---------------------------------------------------------------------------------------------
   * Kayıt
   * ------------------------------------------------------------------------------------------- */
  _applyRestore(entry, p) {
    this._pending.delete(entry.id);
    if (!p || p.type !== entry.type) return false;
    entry.state = clone(p.state);
    entry.solved = !!p.solved;
    if (entry.solved || JSON.stringify(entry.state) !== entry.initialJson) {
      entry.ctx.time = this.time;
      try {
        entry.impl.restore(entry.ctx, entry.state);
      } catch (err) {
        this._fail(entry.id, 'restore', err);
        return false;
      }
    }
    return true;
  }

  /** {id:{type,state,solved}} — kayıtlı tüm bulmacalar + henüz kaydedilmemiş bekleyenler (JSON-güvenli kopya). */
  serialize() {
    const out = {};
    this._pending.forEach((p, id) => {
      out[id] = { type: p.type, state: clone(p.state), solved: p.solved };
    });
    for (const e of this._entries.values()) {
      out[e.id] = { type: e.type, state: clone(e.state), solved: e.solved };
    }
    return out;
  }

  /** serialize() çıktısını yükler. Kayıtlı olanlara hemen, olmayanlara register() anında uygulanır. Yüklenen sayıyı döner. */
  restore(map) {
    this._pending.clear();
    if (!map || typeof map !== 'object') return 0;
    let n = 0;
    const ids = Object.keys(map);
    for (let i = 0; i < ids.length; i++) {
      const p = map[ids[i]];
      if (!p || typeof p !== 'object' || typeof p.type !== 'string' || p.state === undefined) continue;
      const rec = { type: p.type, state: clone(p.state), solved: !!p.solved };
      const entry = this._entries.get(ids[i]);
      if (entry) {
        if (this._applyRestore(entry, rec)) n++;
      } else {
        this._pending.set(ids[i], rec);
        n++;
      }
    }
    return n;
  }
}
