/*
 * KEŞİF bulmaca altyapısı — test düzeneği (saf; bulmaca yazarlarının testleri için).
 *
 *   const w = new FakeWorld();                  // seyrek, tümü yüklü sahte dünya (hava varsayılan)
 *   const ctx = fakeCtx({ origin:{x:0,y:10,z:0}, facing:1, difficulty:3, zone:2, id:'t1' });
 *   const r = impl.build(ctx);                   // blokları ctx.world'e (FakeWorld) yazar
 *   ctx.world.count(B.LEVER)                     // sayım / cells(id) / getBlock
 *
 *   const h = fakeManager({ seed: 5 });          // strict PuzzleManager + FakeWorld + olay toplayıcılar
 *   buildPuzzleRoom(desc, { seed: 5, setBlock: h.world.writer() });   // odayı dünyaya kur
 *   h.mgr.register('p1', desc); h.mgr.handleInteract({type:'use', x,y,z});
 *   simulate(h.mgr, 2.5, playerPos);             // 60 Hz tick
 *   h.solved / h.effects / h.messages / h.emitted / h.spawned
 *
 * FakeWorld, World'ün bulmaca altyapısının kullandığı yüzeyini taklit eder: getBlock (yüklü değilse null),
 * setBlock, applyEdits (yüklenmemiş chunk'a bekleyen düzenleme), on('blockChange'), edits, seed.
 */
import { PuzzleManager } from './kitManager.js';
import { makeCtx } from './kitCtx.js';

function key(x, y, z) {
  return x + ',' + y + ',' + z;
}

export class FakeWorld {
  /** @param {{seed?:number, loaded?:'all'|Array<[cx,cz]>}} o */
  constructor(o) {
    const opt = o || {};
    this.seed = opt.seed === undefined ? 1 : opt.seed;
    this.blocks = new Map();
    this.edits = new Map();
    this.pendingEdits = new Map();
    this.changes = [];
    this._all = true;
    this._loaded = new Set();
    this._listeners = [];
    if (Array.isArray(opt.loaded)) this.setLoaded(opt.loaded);
  }

  /** Yalnızca verilen chunk'lar yüklü olur ([[cx,cz],…]); diğerleri getBlock'ta null döner. */
  setLoaded(list) {
    this._all = false;
    this._loaded.clear();
    for (let i = 0; i < list.length; i++) this.loadChunk(list[i][0], list[i][1]);
  }

  isLoaded(x, z) {
    return this._all || this._loaded.has((x >> 4) + ',' + (z >> 4));
  }

  /** Chunk'ı "üretilmiş" yapar; bekleyen düzenlemeler uygulanır (gerçek World.ensureChunk gibi). */
  loadChunk(cx, cz) {
    if (this._all) return;
    const k = cx + ',' + cz;
    if (this._loaded.has(k)) return;
    this._loaded.add(k);
    const pend = this.pendingEdits.get(k);
    if (pend) {
      pend.forEach((id, bk) => {
        const p = bk.split(',');
        this._write(Number(p[0]), Number(p[1]), Number(p[2]), id);
      });
      this.pendingEdits.delete(k);
    }
  }

  getBlock(x, y, z) {
    if (!this.isLoaded(x, z)) return null;
    if (y < 0 || y >= 128) return 0;
    return this.blocks.get(key(x, y, z)) || 0;
  }

  _write(x, y, z, id) {
    if (id === 0) this.blocks.delete(key(x, y, z));
    else this.blocks.set(key(x, y, z), id);
  }

  setBlock(x, y, z, id, opts) {
    if (y < 0 || y >= 128 || !(id >= 0 && id <= 127) || !this.isLoaded(x, z)) return false;
    const old = this.blocks.get(key(x, y, z)) || 0;
    if (old === id) return false;
    this._write(x, y, z, id);
    const record = !opts || opts.record !== false;
    if (record) this.edits.set(key(x, y, z), id);
    if (!opts || !opts.silent) {
      const evt = {
        type: 'blockChange', x, y, z, id, newId: id, oldId: old, record,
      };
      this.changes.push(evt);
      for (let i = 0; i < this._listeners.length; i++) this._listeners[i](evt);
    }
    return true;
  }

  applyEdits(list) {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const [x, y, z, id] = list[i];
      this.edits.set(key(x, y, z), id);
      if (this.isLoaded(x, z)) {
        this._write(x, y, z, id);
      } else {
        const ck = (x >> 4) + ',' + (z >> 4);
        let m = this.pendingEdits.get(ck);
        if (!m) {
          m = new Map();
          this.pendingEdits.set(ck, m);
        }
        m.set(key(x, y, z), id);
      }
      n++;
    }
    return n;
  }

  on(type, cb) {
    if (type !== 'blockChange') return () => {};
    this._listeners.push(cb);
    return () => {
      const i = this._listeners.indexOf(cb);
      if (i >= 0) this._listeners.splice(i, 1);
    };
  }

  /** (x,y,z,id) yazan sessiz yazıcı: buildPuzzleRoom/ctx.setBlock için (kayıtsız, olaysız). */
  writer() {
    return (x, y, z, id) => this.setBlock(x, y, z, id, { record: false, silent: true });
  }

  /** id'li blok sayısı. */
  count(id) {
    let n = 0;
    this.blocks.forEach((v) => {
      if (v === id) n++;
    });
    return n;
  }

  /** id'li blokların konumları [{x,y,z}] (sıralı: z,y,x). */
  cells(id) {
    const out = [];
    this.blocks.forEach((v, k) => {
      if (v !== id) return;
      const p = k.split(',');
      out.push({ x: Number(p[0]), y: Number(p[1]), z: Number(p[2]) });
    });
    out.sort((a, b) => (a.z - b.z) || (a.y - b.y) || (a.x - b.x));
    return out;
  }

  /** Belirlenimli özet metin (testlerde iki kurulumu karşılaştırmak için). */
  snapshot() {
    const keys = Array.from(this.blocks.keys()).sort();
    return keys.map((k) => k + '=' + this.blocks.get(k)).join(';');
  }
}

/**
 * Test ctx'i: yazımlar FakeWorld'e (sessiz), `spawned` dizisine doğurmalar toplanır.
 * o: { world?, origin?, facing?, difficulty?, zone?, theme?, id?, seed?, clip?, time? }
 */
export function fakeCtx(o) {
  const opt = o || {};
  const world = opt.world || new FakeWorld({ seed: opt.seed });
  const spawned = [];
  const ctx = makeCtx({
    id: opt.id === undefined ? 'fake' : opt.id,
    world,
    worldSeed: opt.seed !== undefined ? opt.seed : world.seed,
    origin: opt.origin || { x: 0, y: 10, z: 0 },
    facing: opt.facing,
    difficulty: opt.difficulty === undefined ? 1 : opt.difficulty,
    zone: opt.zone === undefined ? 0 : opt.zone,
    theme: opt.theme,
    setBlock: world.writer(),
    getBlock: (x, y, z) => world.getBlock(x, y, z),
    spawnEntity: (type, x, y, z, opts) => {
      spawned.push({ type, x, y, z, opts });
      return null;
    },
    clip: opt.clip,
    time: opt.time,
  });
  ctx.spawned = spawned;
  return ctx;
}

/**
 * Strict PuzzleManager + FakeWorld + olay toplayıcıları.
 * Döner: { mgr, world, solved:[], effects:[], messages:[], emitted:[], spawned:[] }
 */
export function fakeManager(o) {
  const opt = o || {};
  const world = opt.world || new FakeWorld({ seed: opt.seed });
  const h = {
    world, solved: [], effects: [], messages: [], emitted: [], spawned: [],
  };
  h.mgr = new PuzzleManager({
    world,
    seed: opt.seed === undefined ? world.seed : opt.seed,
    radius: opt.radius,
    strict: opt.strict !== false,
    emit: (e) => h.emitted.push(e),
    spawnEntity: (type, x, y, z, opts) => {
      h.spawned.push({ type, x, y, z, opts });
      return null;
    },
  });
  h.mgr.on('solved', (e) => h.solved.push(e));
  h.mgr.on('effect', (e) => h.effects.push(e));
  h.mgr.on('message', (e) => h.messages.push(e));
  return h;
}

/** Manager'ı `seconds` sn boyunca `dt` (varsayılan 1/60) adımlarla ilerletir; adım sayısını döner. */
export function simulate(mgr, seconds, playerPos, dt) {
  const step = dt > 0 ? dt : 1 / 60;
  const n = Math.max(0, Math.round(seconds / step));
  for (let i = 0; i < n; i++) mgr.update(step, playerPos);
  return n;
}
