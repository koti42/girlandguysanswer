/*
 * KEŞİF oyun bağlamı (G) ve sistem kayıt defteri.
 *
 * Bu dosya, 4 "sistem" ajanının (blocks, mobs, content, session) KODLADIĞI SÖZLEŞMEDİR. Alan adları sabittir.
 *
 * ── Sistem arayüzü ────────────────────────────────────────────────────────────────────────────────────────────────
 *   const sys = {
 *     name: 'blocks',                // zorunlu, benzersiz ("core." öneki çekirdeğe ayrılmıştır)
 *     order: 0,                      // küçük olan önce çalışır (çekirdek: player −100, survival −90, time −80, camera/frame −50..)
 *     init?(G),                      // dünya/render hazır, ilk kare ÖNCESİ (kayıt geri yüklenmeden önce)
 *     onDimension?(G, from, to),     // ZORUNLU (dünyaya bağlı durum tutan sistemler): boyut değişti — from/to DimCtx; abonelikleri yeniden bağla
 *     beforeDimension?(G, from, to), // swap ÖNCESİ (eski dünya hâlâ canlı): bekleyen işi bitir
 *     alwaysRun?: true,              // G.simFrozen iken de fixedUpdate çalışır (yalnız dimension sistemi)
 *     fixedUpdate?(G, dt),           // sabit 60 Hz adım (dt = 1/60); duraklatılmışken ÇAĞRILMAZ
 *     frameUpdate?(G, dt, alpha),    // her çizim karesi (dt gerçek kare süresi sn; duraklatılmışken dt = 0), alpha = adımlar arası 0..1
 *     onEvent?(G, evt),              // G.emit ile yayılan her olay (önce sistemler, sonra progression, sonra callbacks.onEvent)
 *     onAction?(G, action),          // input.consumeEvents() öğeleri (+ çekirdeğin ürettikleri) — {type:'inventory'|'craft'|'hotbarSet'|
 *                                    //   'hotbarDelta'|'camera'|'fly'|'pause'|'drop'|'map'|'ability1'..'ability4', index?, delta?, n?}
 *     api?(G) → {...},               // genel api'ye eklenecek yöntemler (çakışma = hata fırlatır)
 *     serialize?(G) → obj|null,      // kayıt: {sistemAdı: obj} altında saklanır
 *     restore?(G, obj),              // kayıttan yükleme (init'ten sonra, dünya hazırken)
 *     dispose?(G),                   // destroy (ters sırada)
 *   };
 *   G.addSystem(sys);                // createKesifGame içinde, init'ten önce; sonradan eklenirse init hemen çağrılır
 *
 * ── Sistem dosyası kuralı (gameSystems.js otomatik yükler) ───────────────────────────────────────────────────────
 *   systems/blocks.js, systems/mobs.js, systems/content.js, systems/session.js (yoksa atlanır). Her giriş dosyası şunlardan BİRİNİ dışa aktarır:
 *     export function createSystem(G) → sistem | sistem[]      export function createSystems(G) → sistem[]
 *     export default sistem | (G) => sistem | sistem[]          export const system = sistem
 *   Yardımcı dosyaları (blocksBreak.js …) giriş dosyası kendisi içe aktarır. G'ye işlev/alan eklemek serbesttir ama addendum alanlarının
 *   adı/anlamı değişmez. fixedUpdate/frameUpdate içindeki hatalar yutulur (oyun çökmez; konsola ilk 3 kez yazılır; G.opts.strictSystems
 *   = true iken fırlar). api() adı çakışması KURULUMDA hata fırlatır; yalnız selectHotbar, respawn, getWorldCode, markRewardClaimed çekirdek YEDEĞİdir
 *   (sistem aynı adı verirse sistem kazanır).
 *
 * ── Yetenekler ve ilerleme ────────────────────────────────────────────────────────────────────────────────────────
 *   Macera modunda G.abilities.{doubleJump,grapple,glide,portalGun} her sabit adımda G.progression.abilities'ten KOPYALANIR → bir yeteneği
 *   vermek için G.grantAbility(key) (progression.grantAbility + çıktının uygulanması) ya da progression olayları kullan; G.abilities'e doğrudan yazma. G.abilities.fly yalnız
 *   insa modunda true. Kolay mod: G.survival.easy (harita modunda her zaman true).
 *
 * ── G alanları (addendum §G, BİREBİR) ─────────────────────────────────────────────────────────────────────────────
 *   G.THREE, G.opts, G.mode('macera'|'insa'|'harita'), G.seed(int), G.worldCode(str), G.container, G.callbacks
 *   render: G.renderer, G.scene, G.camera, G.sky, G.weatherLayer, G.postfx, G.materials, G.atlas, G.atlasPixels,
 *           G.chunkManager, G.particles, G.highlight, G.quality, G.viewModel(firstPerson), G.character,
 *           G.worldRoot(Group), G.entityRoot(Group)
 *   boyut:  G.dim ('overworld'|'neon'), G.dimMgr (gameDimension.js), G.dimMeta, G.transition (gameTransition.js), G.simFrozen (geçiş boyunca sabit adımlar donar;
 *           yalnız `alwaysRun` sistemler çalışır), G.transitionActive (otomatik kayıt bastırılır), G.portalMode ('normal'|'boyut'), G.dimGate, G.dimStats.
 *           Boyuta BAĞLI alanlar (gameDimension.DIM_BOUND_FIELDS): world, tech, chests, em, spawner, puzzles, props, colliders, crowd, vehicles, clock,
 *           weatherSim, spawn, chunkManager, worldRoot, entityRoot — swap ile atomik yeniden atanır. KURAL: hiçbir sistem G.world'ü (ya da bu alanları)
 *           çağrı ötesinde önbelleğe ALMAZ; world.on abonelikleri ve boyuta bağlı durum `onDimension(G, from, to)` kancasında yeniden kurulur
 *           (isteğe bağlı `beforeDimension(G, from, to)`: eski dünyada bekleyen işi bitirmek için). Bkz. systems/dimension.js.
 *   sim:    G.world (World), G.inventory (Inventory), G.survival, G.body (physics.createPlayerBody), G.abilities,
 *           G.clock (daynight clock), G.weatherSim, G.progression (Progression), G.puzzles (PuzzleManager),
 *           G.em (EntityManager), G.spawner (Spawner), G.combat (combat state), G.chests (Map "x,y,z"→slots[27]),
 *           G.spawn({x,y,z}), G.player {yaw,pitch,cameraMode:'fp'|'tp'|'tpf',flying,sprinting,crouching,dead,deathInfo,
 *           heldKey,blocking,lastCheckpoint}
 *   girdi/ses/hud: G.input, G.audio, G.hud (değişken HUD durum nesnesi — sistemler alanlarını yazar),
 *           G.publishHud(immediate?), G.hudStore
 *   zaman:  G.time {tick, seconds, dt, frame, paused, playTime}
 *   yardımcılar: G.emit(evt), G.sound(name, pos?, opts?), G.fx(name, ...), G.speak(text), G.haptic(style),
 *           G.setUi(name|null), G.getSystem(name), G.addSystem(sys), G.destroyed, G.debug
 *
 * ── Çekirdeğin EK alanları (addendum'daki listeye ek; sistemler okuyabilir) ──────────────────────────────────────
 *   G.inputState      kare başına tek nesne (input.getState() birleşimi): moveX, moveZ, jump, crouch, sprint, breakHeld,
 *                     placeHeld, aimAssist, usingGamepad, touch, locked + KENAR bayrakları jumpPressed, attackPressed,
 *                     placePressed, interactPressed. Kenar bayrakları bir sonraki fixedUpdate geçişine kadar KİLİTLİ tutulur
 *                     (adım atılmayan karede kaybolmaz) ve o geçişten sonra silinir → kenarları fixedUpdate içinde oku.
 *                     lookDX/lookDY çekirdek tarafından yaw/pitch'e uygulanır (sistemler okumaz). UI açıkken (gameplay kapalı)
 *                     tüm alanlar nötrdür. G.inputOverride (nesne) verilirse input yerine o kullanılır (testler).
 *   G.eye / G.look    kare sonu göz konumu {x,y,z} (enterpolasyonlu) ve birim bakış vektörü {x,y,z}; fixedUpdate sırasında
 *                     G.eyeSim (sim konumu: body + eyeH) kullan → G.eyePos(out)
 *   G.fpState         {breaking, eating(−1|0..1), bowCharge, nocked} — sistemler yazar, çekirdek viewModel.update'e iletir
 *   G.charAction      TP karakter eylemi {name:'mine'|'attack'|'bow-draw'|'fire'|'place'|'cheer', progress?, charge?, kind?}|null
 *   G.combatLevel     0..1 savaş yoğunluğu (mobs sistemi yazar): müzik/ortam sesi gerilimi; boss çubuğu varken 1 sayılır
 *   G.worldReady      true: ilk chunk halkası hazır       G.paused: G.time.paused ile aynı     G.ui: geçerli HUD ui adı
 *   G.settings        etkin ayarlar (sensitivity, invertY, fov, viewDist, quality, easy, leftHanded, …)
 *   G.mapMeta         harita/inşa modu: {title?, base, time, size, spawn} | null
 *   G.seedInput       kayda yazılacak tohum girdisi (Dünya Kodu metni ya da sayı): yeniden yüklemede createKesifGame({seed: save.seed})
 *                     aynı dünyayı verir. Oturum kaydı `seed: G.seedInput` yazmalıdır (G.seed çözülmüş tam sayıdır; o da çalışır).
 *   G.requestSave(reason)  oturum kancasına kayıt isteği (session sistemi onSave'i çağırır); G.saveHooks dizisi
 *   G.markDirty(name)  HUD alanı kirli işareti (hotbar | all)       G.reducedMotion, G.accessibility, G.haptics
 *   G.applyProgression(out) progression.onEvent/grantAbility çıktısını uygular (G.emit zaten yapar); G.grantAbility(key) yetenek verir
 *   G.teleport(x,y,z,opts) güvenli ışınlanma (yaw/pitch opts)       G.respawnPlayer(reason) yeniden doğuş (spawn/yatak)
 *   G.setSpawn(x,y,z)  yatak/spawn yenileme                         G.stepFixed(n)   n sabit adım (hata ayıklama/test)
 *   G.scratch          kare başına ayırmayı önlemek için ortak geçici nesneler {v1,v2,v3, ray, rayDir}
 *
 * ── Çekirdeğin üstlendiği işler (SİSTEMLER YAPMAZ) ───────────────────────────────────────────────────────────────
 *   fizik adımı + survival.update + consumePhysicsEvents (düşme/boşluk), gün saati + hava simi, kamera/FOV/sallanma,
 *   karakter + birinci şahıs kol senkronu (G.viewModel.setHeld çekirdekte: G.player.heldKey değişince), adım/iniş/zıplama sesi,
 *   ortam sesi, hotbar seçimi (hotbarSet/hotbarDelta), HUD temel alanları (coords, zone, biome, time, weather, fps, flying,
 *   sprinting, underwater, cameraMode, mode, ui, hp/hunger/oxygen, hotbar, selected, held, abilities), bölge/biyom girişi
 *   (zoneEnter/biomeEntered olayları), progression 'tick' (0,25 sn'de bir), progression çıktısının uygulanması
 *   (unlockZones → world.unlockZone, grantAbilities → G.progression.abilities, giveItems → envanter, rewards → 'reward' olayı,
 *   türetilen olaylar yeniden yayılır), 'death' olayı, G.setUi akışı (pointer lock + gameplay kapatma), pause/auto-pause.
 *
 * ── Sistemlerin üstlendiği işler (ÇEKİRDEK ÇAĞIRMAZ) ─────────────────────────────────────────────────────────────
 *   G.em.update / G.spawner.update / G.puzzles.update / entity modellerinin sahnede sürülmesi (mobs, content),
 *   blok kırma/yerleştirme/kullanma + G.highlight sürme (blocks), yapılar/bulmaca kaydı/parkur/mühür/boss kapısı (content),
 *   kayıt/yükleme/otomatik kayıt/HUD birleştirme (hedef, görev, boss, duyuru, parkur)/UI api/komutlar (session).
 *
 * Çekirdek ayrıca yayımlar: zoneEnter, biomeEntered, death, inventoryChanged, uiChanged, 'playerLanded' {impact}, 'playerHurt'
 * {amount,cause,hp}, 'fall' {distance,damage}. Sistem olayları (blockBroken, mobKilled, puzzleSolved…) sistemlerce yayılır.
 */
import { createSystemRegistry } from './gameRegistry.js';

export { createSystemRegistry };

/** callbacks.onEvent'e iletilen olay türleri (kare başı/yüksek frekanslı olaylar süzülür). */
export const PUBLIC_EVENTS = Object.freeze([
  'inventoryChanged', 'uiChanged', 'zoneEnter', 'zoneUnlocked', 'puzzleSolved', 'crystal', 'bossDefeated', 'achievement',
  'ability', 'parkourDone', 'death', 'saved', 'reward', 'discover', 'questUpdate', 'victory', 'levelUp', 'sealProgress',
  'sealComplete', 'bossDoor', 'bossEngage', 'bossPhase', 'checkpoint', 'biomeEntered', 'respawn', 'mapRevealed',
  'enchanted', 'spellCast', 'potionBrewed', 'effectAdded', 'effectEnded', 'potionDrunk', 'manaCrystalUsed',
  // Neon Meridyen (boyut yolculuğu)
  'dimensionEntered', 'dimensionLeft', 'gateOpened', 'dimCalibrated', 'propUsed', 'lockOpened', 'terminalFound',
]);
const PUBLIC_SET = {};
PUBLIC_EVENTS.forEach((k) => { PUBLIC_SET[k] = true; });

/** G.ui değerlerinden simülasyonu durduranlar (menü açıkken dünya donar). */
export const PAUSING_UI = Object.freeze({
  pause: true, map: true, journal: true, victory: true, shop: true,
});

/** Mutable boş HUD (hudStore.EMPTY_HUD donuk; çekirdek bunun kopyasını yazar). */
export function makeMutableHud(base, mode) {
  const b = base || {};
  const hotbar = [];
  for (let i = 0; i < 9; i++) hotbar.push({ item: null, count: 0 });
  return {
    hp: b.hp !== undefined ? b.hp : 20,
    maxHp: 20,
    hunger: 20,
    oxygen: 15,
    xpLevel: 0,
    hotbar,
    selected: 0,
    held: null,
    target: { block: null, name: null, progress: 0 },
    coords: { x: 0, y: 0, z: 0 },
    depth: { rel: 0, band: '', key: '' },
    zone: { id: 0, name: '' },
    biome: '',
    time: 'gündüz',
    weather: '',
    quest: { title: '', lines: [] },
    boss: null,
    banner: null,
    parkour: null,
    abilities: {
      doubleJump: false, grapple: false, glide: false, portalGun: false,
    },
    mode: mode || 'macera',
    cameraMode: 'fp',
    ui: 'none',
    fps: 0,
    flying: false,
    sprinting: false,
    underwater: false,
    hint: null,
    mana: { value: 0, max: 0 },
    effects: [],
    spell: null,
    // teknoloji (systems/tech yazar; yalnız macera): enerji ağı, jetpack, eldeki şarj, tarayıcı, kalkan, portal tabancası
    energy: null,
    jetpack: null,
    charge: null,
    scanner: null,
    shield: null,
    portals: null,
    // Neon Meridyen (cityhud): boyut, bölge adı, geçiş yüklemesi, araç göstergesi (yer tutucu), şehir durumu
    dim: 'overworld',
    district: '',
    dimLoading: null,
    vehicle: null,
    city: null,
  };
}

/**
 * G bağlamı: alan kabukları + sistem kaydı + olay boru hattı. Çekirdek (game.js) nesneleri doldurur.
 * @param {object} opts createKesifGame seçenekleri
 * @param {{THREE?:object, mode?:string, seed?:number, worldCode?:string}} [init]
 */
export function createGameContext(opts, init) {
  const o = opts || {};
  const i = init || {};
  const callbacks = o.callbacks || {};
  const registry = createSystemRegistry();
  const G = {
    THREE: i.THREE || null,
    opts: o,
    mode: i.mode || 'macera',
    seed: i.seed || 0,
    worldCode: i.worldCode || '',
    seedInput: i.seed || 0,
    container: o.container || null,
    callbacks,

    renderer: null,
    scene: null,
    camera: null,
    sky: null,
    weatherLayer: null,
    postfx: null,
    materials: null,
    atlas: null,
    atlasPixels: null,
    chunkManager: null,
    particles: null,
    highlight: null,
    quality: null,
    viewModel: null,
    character: null,
    worldRoot: null,
    entityRoot: null,

    world: null,
    dim: 'overworld',
    dimMgr: null,
    dimMeta: null,
    dimStats: null,
    transition: null,
    simFrozen: false,
    transitionActive: false,
    portalMode: 'normal',
    inventory: null,
    survival: null,
    body: null,
    abilities: {
      doubleJump: false, grapple: false, glide: false, portalGun: false, fly: false,
    },
    clock: null,
    weatherSim: null,
    progression: null,
    puzzles: null,
    em: null,
    spawner: null,
    combat: null,
    chests: new Map(),
    spawn: { x: 0, y: 64, z: 0 },
    player: {
      yaw: 0,
      pitch: 0,
      cameraMode: 'fp',
      flying: false,
      sprinting: false,
      crouching: false,
      dead: false,
      deathInfo: null,
      heldKey: null,
      blocking: false,
      lastCheckpoint: null,
    },

    input: null,
    audio: null,
    hud: makeMutableHud(null, i.mode),
    hudStore: null,
    publishHud: noop,

    time: {
      tick: 0, seconds: 0, dt: 0, frame: 0, paused: false, playTime: 0,
    },

    emit: noop,
    sound: noop,
    fx: noop,
    speak: noop,
    haptic: noop,
    setUi: noop,
    getSystem: (name) => registry.get(name),
    addSystem: null,
    destroyed: false,
    // Hata ayıklama YALNIZ geliştirme derlemesinde (Vite DEV): üretimde ?debug=1 ve opts.debug yok sayılır (komutlar ve api._debug kapalı).
    debug: !!((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) && (o.debug || (typeof location !== 'undefined' && /[?&]debug=1\b/.test(location.search || '')))),

    // ---- çekirdek ek alanları ----
    inputState: {
      moveX: 0,
      moveZ: 0,
      lookDX: 0,
      lookDY: 0,
      jump: false,
      jumpPressed: false,
      crouch: false,
      sprint: false,
      breakHeld: false,
      placeHeld: false,
      attackPressed: false,
      placePressed: false,
      interactPressed: false,
      aimAssist: 0,
      usingGamepad: false,
      touch: false,
      locked: false,
      gyro: false,
    },
    inputOverride: null,
    eye: { x: 0, y: 64, z: 0 },
    eyeSim: { x: 0, y: 64, z: 0 },
    look: { x: 0, y: 0, z: -1 },
    fpState: {
      breaking: false, eating: -1, bowCharge: 0, nocked: false,
    },
    charAction: null,
    worldReady: false,
    combatLevel: 0,
    paused: false,
    ui: 'none',
    settings: {},
    mapMeta: null,
    saveHooks: [],
    reducedMotion: !!o.reducedMotion,
    accessibility: !!o.accessibility,
    haptics: o.haptics !== false,
    requestSave: noop,
    markDirty: noop,
    teleport: noop,
    respawnPlayer: noop,
    setSpawn: noop,
    stepFixed: noop,
    eyePos: null,
    scratch: null,
    registry,
    _emitting: false,
    _emitQueue: [],
    _initialized: false,
    _errCount: Object.create(null),
  };

  G.eyePos = (out) => {
    const b = G.body;
    const t = out || {};
    if (b) {
      t.x = b.x;
      t.y = b.y + b.eyeH;
      t.z = b.z;
    }
    return t;
  };

  G.addSystem = (sys) => {
    registry.add(sys);
    if (G._initialized && typeof sys.init === 'function') callSafe(G, sys, 'init', () => sys.init(G));
    return sys;
  };

  G.emit = (evt) => emitEvent(G, evt);
  G.applyProgression = (out) => {
    applyProgressionOutput(G, out);
    if (!G._emitting && G._emitQueue.length > 0) emitEvent(G, { type: 'progressionApplied' });
  };
  G.grantAbility = (key) => {
    if (!G.progression) return null;
    const out = G.progression.grantAbility(key);
    G.applyProgression(out);
    return out;
  };
  return G;
}

function noop() {}

/** Sistem kancası hatalarını yutar (oyun çökmesin); hata ayıklamada (G.opts.strictSystems) yeniden fırlatır. */
export function callSafe(G, sys, hook, fn) {
  try {
    return fn();
  } catch (err) {
    if (G.opts && G.opts.strictSystems) throw err;
    const key = (sys && sys.name ? sys.name : '?') + '.' + hook;
    const n = (G._errCount[key] || 0) + 1;
    G._errCount[key] = n;
    if (n <= 3 && typeof console !== 'undefined' && console.error) {
      console.error('[kesif] sistem hatası ' + key + ' (#' + n + '):', err);
    }
    return undefined;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Olay boru hattı
 * ---------------------------------------------------------------------------------------------- */
/** Progression çıktısını dünyaya uygular (alanlar progression.js üst yorumunda). */
export function applyProgressionOutput(G, out) {
  if (!out) return;
  const p = G.progression;
  const unl = out.unlockZones;
  for (let k = 0; k < unl.length; k++) {
    if (G.world && typeof G.world.unlockZone === 'function') G.world.unlockZone(unl[k]);
  }
  const gab = out.grantAbilities;
  for (let k = 0; k < gab.length; k++) {
    if (p && p.abilities) p.abilities[gab[k]] = true;
    if (gab[k] in G.abilities) G.abilities[gab[k]] = true;
  }
  const gi = out.giveItems;
  for (let k = 0; k < gi.length; k++) {
    if (!G.inventory) break;
    const left = G.inventory.add(gi[k].item, gi[k].count);
    if (left > 0 && G.em && typeof G.em.spawnItem === 'function' && G.body) {
      G.em.spawnItem(gi[k].item, left, G.body.x, G.body.y + 0.6, G.body.z);
    }
  }
  const ev = out.events;
  for (let k = 0; k < ev.length; k++) G._emitQueue.push(ev[k]);
  const rw = out.rewards;
  for (let k = 0; k < rw.length; k++) {
    G._emitQueue.push({ type: 'reward', key: rw[k].key });
  }
}

function dispatch(G, evt) {
  const list = G.registry.list();
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (typeof s.onEvent === 'function') callSafe(G, s, 'onEvent', () => s.onEvent(G, evt));
  }
  if (G.progression && evt.type !== 'inventoryChanged' && evt.type !== 'uiChanged') {
    const out = callSafe(G, { name: 'progression' }, 'onEvent', () => G.progression.onEvent(evt));
    if (out && (out.events.length || out.rewards.length || out.unlockZones.length || out.grantAbilities.length || out.giveItems.length)) {
      applyProgressionOutput(G, out);
    }
  }
  if (PUBLIC_SET[evt.type] === true && typeof G.callbacks.onEvent === 'function') {
    try {
      G.callbacks.onEvent(evt);
    } catch (e) {
      if (G.opts.strictSystems) throw e;
    }
  }
}

/** Olayı yayar (yeniden giriş güvenli: iç içe yayımlar sıraya alınır, sırayla işlenir; 256 olayda keser). */
export function emitEvent(G, evt) {
  if (!evt || typeof evt.type !== 'string') return;
  if (G.destroyed) return;
  if (G._emitting) {
    G._emitQueue.push(evt);
    return;
  }
  G._emitting = true;
  try {
    dispatch(G, evt);
    let guard = 0;
    while (G._emitQueue.length > 0 && guard++ < 256) dispatch(G, G._emitQueue.shift());
    G._emitQueue.length = 0;
  } finally {
    G._emitting = false;
  }
}
