/*
 * KEŞİF büyü sistemi — dünyadaki Büyü Masaları ve Simya Kazanları: kayıt defteri, parçacık yayıcıları, yakınlık.
 *
 *   createMagicWorld(G) → {
 *     scan()                         world.edits'ten (kayıttan dönen/önceki yerleştirmeler) masa ve kazanları bulur
 *     add(x,y,z,id) / remove(x,y,z)  yerleştirme/kırma olayları
 *     tick(dt, brewList)             yakın yayıcıları günceller (kazan: demlenirken yoğun, iksir rengi)
 *     nearestWithin(kind, r)         oyuncuya en yakın masa|kazan konumu | null
 *     tables / cauldrons             Map "x,y,z" → {x,y,z,emitter}
 *     dispose()
 *   }
 * Yayıcılar render/particles addEmitter('arcane' | 'cauldron') ile çalışır; kamera 30 bloktan uzaktaysa parçacık doğmaz (ucuz).
 */
import { MAGIC_BLOCK_IDS } from '../sim/magicData.js';
import { itemByKey } from '../sim/items.js';

const keyOf = (x, y, z) => x + ',' + y + ',' + z;

export function createMagicWorld(G) {
  const tables = new Map();
  const cauldrons = new Map();
  let acc = 0;
  let unsub = null;
  let bubT = 0.6;
  const sp = { x: 0, y: 0, z: 0 };

  function emitterFor(kind, x, y, z) {
    const pt = G.particles;
    if (!pt || typeof pt.addEmitter !== 'function') return -1;
    if (kind === 'table') return pt.addEmitter('arcane', { x: x + 0.5, y: y + 0.8, z: z + 0.5 }, { color: 0xb88aff });
    return pt.addEmitter('cauldron', { x: x + 0.5, y: y + 0.92, z: z + 0.5 }, { color: 0x5fe08a, radius: 0 });
  }

  function add(x, y, z, id) {
    const map = id === MAGIC_BLOCK_IDS.TABLE ? tables : id === MAGIC_BLOCK_IDS.CAULDRON ? cauldrons : null;
    if (!map) return false;
    const k = keyOf(x, y, z);
    if (map.has(k)) return true;
    map.set(k, { x, y, z, emitter: emitterFor(map === tables ? 'table' : 'cauldron', x, y, z) });
    return true;
  }

  function remove(x, y, z) {
    const k = keyOf(x, y, z);
    [tables, cauldrons].forEach((m) => {
      const e = m.get(k);
      if (!e) return;
      if (e.emitter >= 0 && G.particles && G.particles.removeEmitter) G.particles.removeEmitter(e.emitter);
      m.delete(k);
    });
  }

  function scan() {
    const edits = G.world && G.world.edits;
    if (!edits || typeof edits.forEach !== 'function') return 0;
    let n = 0;
    edits.forEach((v, k) => {
      const id = typeof v === 'number' ? v : v && typeof v === 'object' ? v.id : 0;
      if (id !== MAGIC_BLOCK_IDS.TABLE && id !== MAGIC_BLOCK_IDS.CAULDRON) return;
      const p = String(k).split(',');
      if (p.length !== 3) return;
      const x = Number(p[0]);
      const y = Number(p[1]);
      const z = Number(p[2]);
      if (![x, y, z].every(Number.isFinite)) return;
      if (add(x, y, z, id)) n++;
    });
    return n;
  }

  /** Demlenen yakın kazanlar: aralıklı kabarcık sesi (konumlu; ≈14 blok). */
  function bubbleSounds(dt, brewList) {
    bubT -= dt;
    if (bubT > 0) return;
    bubT = 0.9 + ((G.time.tick * 7) % 13) / 10;
    const b = G.body;
    for (let i = 0; i < brewList.length; i++) {
      const c = brewList[i];
      if (c.done) continue;
      const dx = c.pos.x + 0.5 - b.x;
      const dz = c.pos.z + 0.5 - b.z;
      if (dx * dx + dz * dz > 14 * 14) continue;
      sp.x = c.pos.x + 0.5; sp.y = c.pos.y + 0.9; sp.z = c.pos.z + 0.5;
      G.sound('brew_bubble', sp, { vol: 0.55, pitch: 0.85 + ((i * 5 + G.time.tick) % 7) / 20 });
    }
  }

  /** brewList: BrewManager.list() ({pos, recipeId, done, ...}). */
  function tick(dt, brewList) {
    bubbleSounds(dt, brewList);
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    const pt = G.particles;
    if (!pt || typeof pt.tuneEmitter !== 'function') return;
    cauldrons.forEach((c) => {
      if (c.emitter < 0) return;
      let radius = 0;
      let color = 0x5fe08a;
      for (let i = 0; i < brewList.length; i++) {
        const b = brewList[i];
        if (b.pos.x === c.x && b.pos.y === c.y && b.pos.z === c.z) {
          const it = itemByKey(b.out);
          if (it && typeof it.color === 'number') color = it.color;
          radius = b.done ? 0.35 : 1;
          break;
        }
      }
      pt.tuneEmitter(c.emitter, { radius, color });
    });
  }

  /** world 'blockChange' olaylarını dinler: yerleştirme/kırma/komut/betik hangi yoldan olursa olsun kayıt güncel kalır. */
  function attach(onRemoved) {
    if (unsub || !G.world || typeof G.world.on !== 'function') return;
    unsub = G.world.on('blockChange', (e) => {
      const id = e.newId !== undefined ? e.newId : e.id;
      const k = keyOf(e.x, e.y, e.z);
      const had = tables.has(k) || cauldrons.has(k);
      if (had && ((id === MAGIC_BLOCK_IDS.TABLE && tables.has(k)) || (id === MAGIC_BLOCK_IDS.CAULDRON && cauldrons.has(k)))) return;
      if (had) {
        const wasCauldron = cauldrons.has(k);
        remove(e.x, e.y, e.z);
        if (onRemoved) onRemoved({ x: e.x, y: e.y, z: e.z, cauldron: wasCauldron });
      }
      if (id === MAGIC_BLOCK_IDS.TABLE || id === MAGIC_BLOCK_IDS.CAULDRON) add(e.x, e.y, e.z, id);
    });
  }

  function nearestWithin(kind, r) {
    const map = kind === 'table' ? tables : cauldrons;
    const b = G.body;
    let best = null;
    let bd = r * r;
    map.forEach((e) => {
      const dx = e.x + 0.5 - b.x;
      const dy = e.y + 0.5 - (b.y + 0.9);
      const dz = e.z + 0.5 - b.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d <= bd) {
        bd = d;
        best = e;
      }
    });
    return best;
  }

  return {
    tables,
    cauldrons,
    scan,
    attach,
    add,
    remove,
    tick,
    nearestWithin,
    dispose() {
      if (typeof unsub === 'function') unsub();
      unsub = null;
      [tables, cauldrons].forEach((m) => {
        m.forEach((e) => {
          if (e.emitter >= 0 && G.particles && G.particles.removeEmitter) G.particles.removeEmitter(e.emitter);
        });
        m.clear();
      });
    },
  };
}
