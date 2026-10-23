/*
 * KEŞİF content sistemi — ortak durum nesnesi (S) ve sabitler.
 *
 *   createContentState(G, fx) → S
 *
 * S, content alt modüllerinin (contentStructures/Puzzles/Parkour/Seal/Boss/Progress/Map) tek durum nesnesidir; G.content = S
 * olarak dışa açılır (diğer sistemler OKUYABİLİR):
 *   S.structs   Map id → kayıt {id, def, type, zone, x,y,z, bounds, dist, puzzleIds[], puzzlesOn, discovered}  (≈256 blok içindeki yapılar)
 *   S.known     Map id → {id,type,name,x,y,z,zone,exact} KALICI harita işaretleri (hiç görülmüş yapılar; yaklaşık olanlar exact:false)
 *   S.courses   etkin parkur durumları [{id, course, def, lastCp, active, t0, done, ...}]
 *   S.sealZones Map zone → {rec, sockets[], gateOpen}   S.arenaList = G.arenas
 *   Ek G alanları (content kurar; yoksa oluşturur): G.structureChests Map "x,y,z"→sandık tanımı, G.structureSigns Map "x,y,z"→
 *   {text,name,structureId}, G.safeZones [{id,x,z,r}], G.arenas [{id,zone,key,name,x,y,z,r,done,unlocked,...}].
 */

/** Yapıların yüklenme yarıçapı (blok) ve boşaltma yarıçapı. */
export const REGION_R = 160;
export const UNLOAD_R = 256;
/** Bulmacalar bu uzaklıkta (yapı sınır kutusuna) kaydedilir / bu uzaklıktan sonra kayıttan düşer. */
export const PUZZLE_ON_R = 80;
export const PUZZLE_OFF_R = 150;
/** Yapı keşfi (yatay, blok). */
export const DISCOVER_R = 24;
/** 'step' olayı gereken sistem blokları (plaka, basılı plaka). */
export const NOTABLE = ['anahtartapinagi', 'muhursunagi', 'bossarena', 'parkur'];

export function createContentState(G, fx) {
  return {
    G,
    fx,
    mode: G.mode,
    seed: G.seed,
    structs: new Map(),
    known: new Map(),
    cellsDone: new Set(),
    cellQueue: [],
    lastCellKey: '',
    lastX: -1e9,
    lastZ: -1e9,
    regQueue: [],
    hooks: { add: [], remove: [] },
    slowT: 0,
    regionT: 0,
    // bulmaca
    useTick: -1,
    useKey: '',
    lastUse: { tick: -1, x: 0, y: 0, z: 0, handled: false },
    useHandlers: [],
    useInterest: {},
    edgeTick: -100,
    pushT: 0,
    mobT: 0,
    portalShotTick: -1,
    lastBroken: { x: 0, y: 0, z: 0, tick: -10 },
    lastPlateKey: '',
    // parkur
    courses: [],
    dynT: 0,
    // mühür / boss
    sealZones: new Map(),
    anims: [],
    pendingUnlocks: [],
    crystalAt: new Map(),
    altars: new Map(),
    // ilerleme
    hintOwn: null,
    questT: 0,
    hintT: 0,
    rewardT: 0,
    victoryT: -1,
    ready: false,
    guideCache: { t: -10, value: null, key: '' },
    // harita
    map: null,
    version: 1,
  };
}

/** Tek bir G.emit güvenli kısayolu. */
export function emit(S, evt) {
  if (S.G && typeof S.G.emit === 'function') S.G.emit(evt);
}
