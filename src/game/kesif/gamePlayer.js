/*
 * KEŞİF — oyuncu: girdi → fizik → hayatta kalma; karakter + birinci şahıs kol senkronu; ses/parçacık tepkileri.
 *
 *   createPlayerCore(G, camRig, audioApi) → {
 *       system,                 'core.player' sistemi (order −100): fixedUpdate (fizik+survival), onAction (hotbar, yetenekler, uçma)
 *       pollInput(dtSec),       her çizim karesinin BAŞINDA: girdiyi okur, kenar bayraklarını kilitler, yaw/pitch'i uygular
 *       clearEdges(),           fixedUpdate geçişinden sonra kenar bayraklarını siler
 *       frameVisuals(dt),       karakter + elde eşya + kol güncellemesi (kare sonu)
 *       teleport(x,y,z,opts), respawn(reason), setSpawn(x,y,z) }
 *   physicsInputFrom(state, pin) → saf girdi eşlemesi (test edilir)      applyLook(p, lookDX, lookDY)
 *
 * Konvansiyonlar: yaw 0 = −Z, + sola; lookDX + = sağa dön (yaw azalır), lookDY + = yukarı bak.
 */
import {
  stepPlayer, resetBody, lookDir, PLAYER,
} from './sim/physics.js';
import { raycastBlocks, createRayHit } from './sim/raycast.js';
import {
  update as survivalUpdate, consumePhysicsEvents, collectDeathDrops, respawn as survivalRespawn, setArmor,
} from './sim/survival.js';
import { B, BLOCKS } from './sim/blocks.js';
import { maxDurability } from './sim/items.js';
import { maxCharge } from './sim/techCharge.js';
import { WORLD_H, WORLD_RADIUS, zoneIndexAt } from './sim/constants.js';
import { findSafeSpawn } from './gameWorld.js';
import { getMobType } from './sim/mobTypes.js';
import { ABILITY_INFO, ABILITY_LIST } from './sim/progressionData.js';
import { dampTo } from './gameCamera.js';
import { GLINT_SUFFIX } from './render/enchantGlint.js';

const PITCH_MAX = Math.PI / 2 - 0.02;
/** Yetenek eşyaları ruha bağlıdır: ölümde çantaya düşmez (aksi halde doğuşta yeniden verilen kopya + çanta = çift eşya). */
const ABILITY_ITEM_KEYS = ABILITY_LIST.map((k) => ABILITY_INFO[k].item);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Legacy (insa/harita) modlarında oyuncu ayağı bu yüksekliğin üstüne çıkamaz (sonsuz yükselme/çerçeve üstünden kaçış yok). */
export const CEILING_Y = WORLD_H + 12;

/**
 * Oyuncu ayağının çıkabileceği en yüksek y: macera = inşa tavanı (WORLD_Y_MAX + 1: en üst bloğun üstünde durulabilir),
 * legacy modlar = CEILING_Y. Tavanda "Yükseklik sınırına ulaştın" ipucu (sessionModes.boundsContact → 'height').
 */
export function ceilingFor(world) {
  return world && world.legacy === false && world.yTop !== undefined ? world.yTop : CEILING_Y;
}

/**
 * Sınırlı modlarda (insa/harita) gövdeyi 8×8 chunk alanına, her modda tavana sıkıştırır (saf; test edilir).
 * bounds: {minCx,maxCx,minCz,maxCz} | null. Sıkıştırılan eksenin hızı sıfırlanır. Değişti mi → true.
 */
export function clampBodyToWorld(b, bounds, ceiling = CEILING_Y) {
  let moved = false;
  if (bounds) {
    const hw = b.w * 0.5 + 0.001;
    const minX = bounds.minCx * 16 + hw;
    const maxX = (bounds.maxCx + 1) * 16 - hw;
    const minZ = bounds.minCz * 16 + hw;
    const maxZ = (bounds.maxCz + 1) * 16 - hw;
    if (b.x < minX) { b.x = minX; if (b.vx < 0) b.vx = 0; moved = true; } else if (b.x > maxX) { b.x = maxX; if (b.vx > 0) b.vx = 0; moved = true; }
    if (b.z < minZ) { b.z = minZ; if (b.vz < 0) b.vz = 0; moved = true; } else if (b.z > maxZ) { b.z = maxZ; if (b.vz > 0) b.vz = 0; moved = true; }
  }
  if (b.y > ceiling) {
    b.y = ceiling;
    if (b.vy > 0) b.vy = 0;
    moved = true;
  }
  return moved;
}

/**
 * Mühür kuralı (saf; test edilir): macera dünyasında kilitli bir bölgeye (ya da dünya kenarının ötesine) girilemez. Bariyer halkası
 * 0..WORLD_Y_MAX arası katıdır ama gövde ayağı tavanda (y = yTop) bariyerin ÜSTÜNDEN geçebilir (jetpack/planör/yüksek kule): bu kontrol o
 * kaçışı her yükseklikte kapatır. x,z gövde merkezi; world.isZoneUnlocked(k) kilit durumudur.
 */
export function sealBlocked(world, x, z) {
  if (!world || world.legacy !== false || world.frame || typeof world.isZoneUnlocked !== 'function') return false;
  const edge = WORLD_RADIUS + 2;
  if (x * x + z * z > edge * edge) return true;
  const zi = zoneIndexAt(x, z);
  for (let k = 1; k <= zi; k++) if (!world.isZoneUnlocked(k)) return true;
  return false;
}

/** Girdi durumu → fizik girdisi (out yeniden kullanılır). */
export function physicsInputFrom(s, out, yaw) {
  out.moveX = s.moveX;
  out.moveZ = s.moveZ;
  out.yaw = yaw;
  out.jump = s.jump;
  out.jumpPressed = s.jumpPressed;
  out.sprint = s.sprint;
  out.crouch = s.crouch;
  return out;
}

/** Bakış uygular; pitch sıkıştırılır, yaw sarılır. */
export function applyLook(p, lookDX, lookDY) {
  // NaN/Infinity (bozuk jiroskop, taşan fare farkı) yaw/pitch'i kalıcı olarak zehirlemesin
  if (Number.isFinite(lookDX)) p.yaw -= lookDX;
  if (Number.isFinite(lookDY)) p.pitch = clamp(p.pitch + lookDY, -PITCH_MAX, PITCH_MAX);
  if (!Number.isFinite(p.yaw)) p.yaw = 0;
  if (!Number.isFinite(p.pitch)) p.pitch = 0;
  if (p.yaw > Math.PI * 4 || p.yaw < -Math.PI * 4) p.yaw %= Math.PI * 2;
  return p;
}

/** Gövde konum/hızı sonlu mu (NaN yayılımı denetimi). */
export function bodyIsFinite(b) {
  return Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z)
    && Number.isFinite(b.vx) && Number.isFinite(b.vy) && Number.isFinite(b.vz);
}

export function createPlayerCore(G, camRig, audioApi) {
  const b = G.body;
  const p = G.player;
  const s = G.inputState;
  const pin = {
    moveX: 0, moveZ: 0, yaw: 0, jump: false, jumpPressed: false, sprint: false, crouch: false,
    glide: false, toggleFly: false, grapple: null, grappleRelease: false,
  };
  const pset = { mode: G.mode, autoJump: false };
  const ray = createRayHit();
  const rayOpts = { solidOnly: true, out: ray };
  const rayOrigin = { x: 0, y: 0, z: 0 };
  G._rs = {
    px: b.x, py: b.y, pz: b.z, peh: b.eyeH,
  };
  const rs = G._rs;
  let pendGrapple = null;
  let pendGrappleRelease = false;
  let pendToggleFly = false;
  let glideOn = false;
  let lastHurtT = 0;
  let healFlash = 0;
  const pos = { x: 0, y: 0, z: 0 };
  const motion = {
    speed: 0, vy: 0, onGround: true, crouch: false, swim: false, glide: false, grapple: false, dead: false, yaw: 0, pitch: 0,
    hurt: undefined, action: null, cheer: false,
  };
  const fp = {
    speed: 0, sprint: false, onGround: true, crouch: false, swimming: false, breaking: false, eating: -1, bowCharge: 0,
    nocked: false, yawRate: 0, pitchRate: 0, skyLight: 1, blockLight: 0, sunDir: null, underwater: false, reducedMotion: false,
  };
  let lastEvents = null;
  let sealHintTick = -1000;
  const lastGood = { x: 0, y: 0, z: 0, ok: false };

  /* ---------------------------------------------------------------------------------------------
   * Girdi
   * ------------------------------------------------------------------------------------------- */
  function pollInput(dtSec) {
    const ov = G.inputOverride;
    const raw = ov || (G.input ? G.input.getState(dtSec) : null);
    const paused = G.time.paused;
    if (!raw || paused || !G.worldReady) {
      s.moveX = 0; s.moveZ = 0; s.jump = false; s.crouch = false; s.sprint = false;
      s.breakHeld = false; s.placeHeld = false; s.lookDX = 0; s.lookDY = 0; s.vehicle = null;
      // duraklatılmışken adım atılmaz (clearEdges çağrılmaz): menü açılırken kilitlenen kenarlar devamda sahte eylem üretmesin
      s.jumpPressed = false; s.attackPressed = false; s.placePressed = false; s.interactPressed = false;
      if (raw) {
        s.touch = !!raw.touch;
        s.locked = !!raw.locked;
      }
      return;
    }
    s.moveX = raw.moveX || 0;
    s.moveZ = raw.moveZ || 0;
    s.jump = !!raw.jump;
    s.crouch = !!raw.crouch;
    s.sprint = !!raw.sprint;
    s.breakHeld = !!raw.breakHeld;
    s.placeHeld = !!raw.placeHeld;
    s.aimAssist = raw.aimAssist || 0;
    s.usingGamepad = !!raw.usingGamepad;
    s.touch = !!raw.touch;
    s.locked = !!raw.locked;
    s.gyro = !!raw.gyro;
    s.vehicle = raw.vehicle && typeof raw.vehicle === 'object' ? raw.vehicle : null; // sürüş girdisi (vehicle_ui)
    // kenarlar kilitli kalır (OR); fixedUpdate sonrası clearEdges siler
    if (raw.jumpPressed) s.jumpPressed = true;
    if (raw.attackPressed) s.attackPressed = true;
    if (raw.placePressed) s.placePressed = true;
    if (raw.interactPressed) s.interactPressed = true;
    if (ov) {
      // test girdisinde kenarlar bir kez tüketilir
      ov.jumpPressed = false;
      ov.attackPressed = false;
      ov.placePressed = false;
      ov.interactPressed = false;
    }
    s.lookDX = raw.lookDX || 0;
    s.lookDY = raw.lookDY || 0;
    if (!p.dead) applyLook(p, s.lookDX, s.lookDY);
    if (ov) {
      ov.lookDX = 0;
      ov.lookDY = 0;
    }
    s.lookDX = 0;
    s.lookDY = 0;
    lookDir(p.yaw, p.pitch, G.look);
  }

  function clearEdges() {
    s.jumpPressed = false;
    s.attackPressed = false;
    s.placePressed = false;
    s.interactPressed = false;
  }

  /* ---------------------------------------------------------------------------------------------
   * Yetenekler / eylemler
   * ------------------------------------------------------------------------------------------- */
  function syncAbilities() {
    const a = G.abilities;
    const pa = G.progression ? G.progression.abilities : null;
    if (pa && G.mode === 'macera') {
      a.doubleJump = !!pa.doubleJump;
      a.grapple = !!pa.grapple;
      a.glide = !!pa.glide;
      a.portalGun = !!pa.portalGun;
    }
    a.fly = G.mode === 'insa';
  }

  function aimGrapple() {
    G.eyePos(rayOrigin);
    const hit = raycastBlocks(G.world, rayOrigin, G.look, PLAYER.grappleRange, rayOpts);
    if (!hit) return null;
    if (!pendGrapple) pendGrapple = { x: 0, y: 0, z: 0 };
    pendGrapple.x = hit.point.x;
    pendGrapple.y = hit.point.y;
    pendGrapple.z = hit.point.z;
    return pendGrapple;
  }

  function onAction(_G, a) {
    if (!a) return;
    switch (a.type) {
      case 'hotbarSet':
        if (G.inventory && Number.isFinite(a.index)) G.inventory.selected = a.index;
        break;
      case 'hotbarDelta':
        if (G.inventory && Number.isFinite(a.delta)) G.inventory.selectStep(a.delta);
        break;
      case 'ability1':
        if (!G.abilities.grapple || p.dead) break;
        if (b.grapple.active) pendGrappleRelease = true;
        else if (!aimGrapple()) {
          G.sound('ui_error');
          G.speak('Kancayı atacak yer bulunamadı.');
        } else G.emit({ type: 'abilityUsed', ability: 'grapple' });
        break;
      case 'ability2':
        if (!G.abilities.glide || p.dead) break;
        glideOn = !glideOn;
        if (glideOn) G.emit({ type: 'abilityUsed', ability: 'glide' });
        break;
      case 'fly':
        // çift zıplama zaten fizikte uçuşu açtı: aynı karedeki 'fly' olayını yok say
        if (!s.jumpPressed && G.mode === 'insa' && !p.dead) pendToggleFly = true;
        break;
      default:
        break;
    }
  }

  /* ---------------------------------------------------------------------------------------------
   * Sabit adım
   * ------------------------------------------------------------------------------------------- */
  function handlePhysicsEvents(ev) {
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      switch (e.type) {
        case 'step': {
          const mat = e.block && BLOCKS[e.block] ? BLOCKS[e.block].sound : 'çim';
          audioApi.footstep(mat, e.sprinting, b);
          if (e.sprinting && G.particles && e.block) {
            pos.x = b.x; pos.y = b.y + 0.05; pos.z = b.z;
            G.particles.stepDust(e.block, pos);
          }
          break;
        }
        case 'jump':
        case 'doubleJump': {
          G.sound(e.type === 'jump' ? 'jump' : 'fly', b, { vol: 0.5, pitch: e.type === 'jump' ? 1 : 1.25 });
          if (e.type === 'doubleJump' && G.particles) {
            pos.x = b.x; pos.y = b.y + 0.1; pos.z = b.z;
            G.particles.magicBurst(pos, 0x9fe8ff, { radius: 0.6, scale: 0.7 });
          }
          break;
        }
        case 'land': {
          const mat = e.block && BLOCKS[e.block] ? BLOCKS[e.block].sound : 'çim';
          G.sound('land:' + mat, b, { vol: clamp(e.impact / 16, 0.3, 1) });
          camRig.onLand(e.impact);
          if (G.particles && e.block) {
            pos.x = b.x; pos.y = b.y + 0.05; pos.z = b.z;
            G.particles.stepDust(e.block, pos);
          }
          G.emit({ type: 'playerLanded', impact: e.impact });
          break;
        }
        case 'fall':
          G.emit({ type: 'fall', distance: e.distance, damage: e.damage });
          break;
        case 'splash':
          G.sound('splash', b, { vol: clamp(e.impact / 12, 0.4, 1) });
          break;
        case 'bounce':
          G.sound('jump', b, { vol: 0.7, pitch: 0.8 });
          break;
        case 'fly':
          G.sound(e.on ? 'ui_open' : 'ui_close', undefined, { vol: 0.4 });
          G.emit({ type: 'flyToggle', on: e.on });
          break;
        case 'grappleStart':
          G.sound('arrow', b, { vol: 0.6, pitch: 1.2 });
          break;
        case 'grappleFail':
          G.sound('ui_error');
          break;
        default:
          break;
      }
    }
  }

  /** Doğuş yatağı hâlâ yerinde mi? Kırılmış/yok olmuşsa kayıt silinir (ölünce olmayan yatakta doğulmaz). */
  function bedStillThere() {
    const bs = G.bedSpawn;
    if (!bs || !G.world) return !!bs;
    const bx = Math.floor(bs.x);
    const by = Math.floor(bs.y) - 1;
    const bz = Math.floor(bs.z);
    let id = G.world.getBlock(bx, by, bz);
    if (id === null && G.world.canGenerate(bx >> 4, bz >> 4)) {
      G.world.ensureChunk(bx >> 4, bz >> 4);
      id = G.world.getBlock(bx, by, bz);
    }
    if (id === null || id === B.BED) return true; // doğrulanamıyorsa kaydı koru
    G.bedSpawn = null;
    return false;
  }

  function onDeath(cause) {
    if (p.dead) return;
    p.dead = true;
    // Neon Meridyen'de ölüm: eşya DÜŞMEZ (sözleşme §5); en yakın bulunmuş terminalde yeniden doğulur
    const cityDeath = G.dim !== undefined && G.dim !== 'overworld';
    const info = collectDeathDrops(G.survival, G.inventory, { clear: true, hasBed: cityDeath ? false : bedStillThere(), keepInventory: cityDeath });
    if (!info.keep) {
      for (let i = info.drops.length - 1; i >= 0; i--) {
        const d = info.drops[i];
        if (ABILITY_ITEM_KEYS.indexOf(d.item) >= 0) {
          G.inventory.addStack(d.item, d.count, d.dur, d.ench, d.charge); // ruha bağlı eşya: şarjı da korunur
          info.drops.splice(i, 1);
        }
      }
    }
    let lost = 0;
    if (!info.keep && G.em && typeof G.em.spawnItem === 'function') {
      for (let i = 0; i < info.drops.length; i++) {
        const d = info.drops[i];
        lost += d.count;
        const ang = (i * 2.399) % (Math.PI * 2);
        G.em.spawnItem(d.item, d.count, b.x, b.y + 0.8, b.z, {
          vx: Math.cos(ang) * 1.6, vy: 3.5, vz: Math.sin(ang) * 1.6, dur: d.dur, ench: d.ench, charge: d.charge, life: info.despawnSeconds, delay: 1.2,
        });
      }
    } else if (!info.keep) {
      for (let i = 0; i < info.drops.length; i++) lost += info.drops[i].count;
    }
    p.deathInfo = {
      cause: cause || 'genel', x: b.x, y: b.y, z: b.z, lostCount: lost, kept: !!info.keep, respawn: info.respawn,
    };
    b.vx = 0;
    b.vz = 0;
    G.sound('die', b);
    G.haptic('heavy');
    G.emit({ type: 'died' });
    // son vuran yaratık (6 sn içinde) → ölüm ekranı "Gölge seni yendi." diyebilsin
    const lh = G.lastHit;
    const mt = lh && G.time.seconds - lh.t < 6 && lh.mob ? getMobType(lh.mob) : null;
    const by = mt ? mt.name : undefined;
    if (by) p.deathInfo.by = by;
    G.emit({
      type: 'death', cause: p.deathInfo.cause, by, boss: !!(mt && mt.boss), x: b.x, y: b.y, z: b.z, lostCount: lost, kept: !!info.keep,
    });
    G.speak('Yenildin. Yeniden doğabilirsin.');
    G.setUi('dead');
  }

  const svScratch = [];
  /** survival.events'i kopyalayıp boşaltır ve işler (işlerken yeni hasar gelirse kaybolmaz). */
  function drainSurvivalEvents() {
    const src = G.survival.events;
    if (src.length === 0) return;
    svScratch.length = 0;
    for (let i = 0; i < src.length; i++) svScratch.push(src[i]);
    src.length = 0;
    processSurvivalEvents(svScratch);
  }

  function processSurvivalEvents(ev) {
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type === 'damage') {
        lastHurtT = G.time.seconds;
        camRig.onHurt(e.amount);
        G.sound('hurt', b, { vol: 0.8 });
        G.haptic('medium');
        G.emit({
          type: 'playerHurt', amount: e.amount, cause: e.cause, hp: e.hp,
        });
      } else if (e.type === 'shieldAbsorb') {
        // Kuantum Zırhı enerji kalkanı hasarın bir kısmını emdi (ses/parıltı/okuma: systems/tech)
        G.emit({ type: 'shieldAbsorb', amount: e.amount, cause: e.cause });
      } else if (e.type === 'heal') {
        healFlash = Math.min(1, healFlash + 0.5);
      } else if (e.type === 'eat') {
        healFlash = Math.min(1, healFlash + (e.healed > 0 ? 0.4 : 0));
        G.sound('eat', b, { vol: 0.7 });
      } else if (e.type === 'drowning') {
        G.sound('bubble', b, { vol: 0.7 });
      } else if (e.type === 'death') {
        onDeath(e.cause);
      }
    }
  }

  /** Hayatta kalma adımı (order −90): artık olaylar → survival.update → fizik olayları (düşme/boşluk). */
  function survivalStep(_G, dt) {
    const sv = G.survival;
    drainSurvivalEvents();
    survivalUpdate(sv, dt, {
      headInWater: b.headInLiquid && !b.inLava,
      inLava: b.inLava,
      contactDps: b.contactDps,
      contactType: b.inLava ? 'lav' : 'kaktüs',
      sprinting: b.sprinting,
      swimming: b.swimming,
      flying: b.flying,
      moved: b.speed * dt,
      mode: G.mode,
      mods: G.mods || undefined,
    });
    const ev = lastEvents || b.events;
    const rescue = consumePhysicsEvents(sv, ev, { mode: G.mode, sprinting: b.sprinting, mods: G.mods || undefined });
    drainSurvivalEvents();
    if (sv.dead && !p.dead) onDeath(sv.deathCause);
    if (rescue && !p.dead) {
      teleport(G.spawn.x, G.spawn.y, G.spawn.z, { rescue: true });
      G.emit({ type: 'rescue' });
      G.speak('Boşluğa düştün; başlangıç noktasına döndün.');
    }
  }

  /** Geçiş sonu (order 1000): sistemlerin (mobs vb.) uyguladığı hasar olaylarını işler, ölümü yakalar. */
  function postStep() {
    drainSurvivalEvents();
    if (G.survival.dead && !p.dead) onDeath(G.survival.deathCause);
  }

  function fixedUpdate(_G, dt) {
    rs.px = b.x; rs.py = b.y; rs.pz = b.z; rs.peh = b.eyeH;
    syncAbilities();
    const dead = p.dead;
    physicsInputFrom(s, pin, p.yaw);
    if (dead || !G.worldReady) {
      pin.moveX = 0; pin.moveZ = 0; pin.jump = false; pin.jumpPressed = false; pin.sprint = false; pin.crouch = false;
    }
    pin.toggleFly = pendToggleFly;
    pendToggleFly = false;
    pin.grapple = pendGrapple;
    pendGrapple = null;
    pin.grappleRelease = pendGrappleRelease;
    pendGrappleRelease = false;
    if (b.onGround || b.inLiquid || b.flying) glideOn = false;
    pin.glide = glideOn && G.abilities.glide;
    pset.mode = G.mode;
    pset.autoJump = !!s.touch;
    pset.mods = G.mods || null; // büyü/iksir etkileri (hız, zıplama); büyü sistemi yoksa kimlik
    // derin dünya: gövdenin çevresindeki derin kesitler adımdan ÖNCE hazır olsun (hızlı düşüşte ilerisi de); eksik kesit fizikte katıdır
    if (G.world.legacy === false) G.world.ensureSectionsNear(b.x, b.y, b.z, 6, 22 + Math.min(40, Math.abs(b.vy) * 0.6), 8);
    // sürüş (systems/vehicles): gövde araç koltuğunda sabitlenir, yürüme fiziği atlanır (olaylar boş)
    const ev = p.vehicle ? (b.events.length = 0, b.events) : stepPlayer(b, pin, G.world, dt, G.abilities, pset);
    lastEvents = ev;
    clampBodyToWorld(b, G.world.frame ? G.world.bounds : null, ceilingFor(G.world));
    if (!dead && G.worldReady && sealBlocked(G.world, b.x, b.z)) {
      const g = lastGood.ok && !sealBlocked(G.world, lastGood.x, lastGood.z) ? lastGood : G.spawn;
      b.x = g.x; b.z = g.z; b.vx = 0; b.vz = 0;
      if (G.time.tick - sealHintTick > 90) {
        sealHintTick = G.time.tick;
        G.emit({ type: 'actionDenied', reason: 'seal' });
      }
    }
    if (!bodyIsFinite(b)) {
      // NaN kurtarma: son sağlam konuma (yoksa doğuş noktasına) dön; yoksa kamera/chunk yöneticisi de NaN'a bulaşır
      const g = lastGood.ok ? lastGood : G.spawn;
      resetBody(b, g.x, g.y, g.z);
      camRig.snap();
      G.emit({ type: 'rescue', reason: 'nan' });
    } else if (!p.dead) {
      lastGood.x = b.x; lastGood.y = b.y; lastGood.z = b.z; lastGood.ok = true;
    }
    handlePhysicsEvents(ev);

    p.sprinting = b.sprinting;
    p.crouching = b.crouching;
    p.flying = b.flying;
    G.eyeSim.x = b.x;
    G.eyeSim.y = b.y + b.eyeH;
    G.eyeSim.z = b.z;
  }

  /* ---------------------------------------------------------------------------------------------
   * Işınlanma / doğuş
   * ------------------------------------------------------------------------------------------- */
  function teleport(x, y, z, opts) {
    const o = opts || {};
    // Sonsuz/NaN hedef (bozuk komut/portal) gövdeyi zehirlemesin: doğuş noktasına düş
    const okXZ = Number.isFinite(x) && Number.isFinite(z);
    let tx = okXZ ? x : G.spawn.x;
    let ty = Number.isFinite(y) && okXZ ? y : G.spawn.y;
    let tz = okXZ ? z : G.spawn.z;
    x = tx; y = ty; z = tz;
    if (o.safe !== false) {
      const sp = findSafeSpawn(G.world, x, y, z, { maxR: o.maxR > 0 ? o.maxR : 6, lazy: true });
      if (sp.ok) {
        tx = sp.x; ty = sp.y; tz = sp.z;
      }
    } else if (!G.world.hasChunk(Math.floor(x) >> 4, Math.floor(z) >> 4) && G.world.canGenerate(Math.floor(x) >> 4, Math.floor(z) >> 4)) {
      G.world.ensureChunk(Math.floor(x) >> 4, Math.floor(z) >> 4);
    }
    // derin dünyada ışınlanma/doğuş: varış noktasının çevresindeki derin kesitler hemen üretilir (boşluğa/katıya gömülme olmasın)
    if (G.world.legacy === false) G.world.ensureSectionsNear(tx, ty, tz, 24, 48);
    resetBody(b, tx, ty, tz);
    if (Number.isFinite(o.yaw)) p.yaw = o.yaw;
    if (Number.isFinite(o.pitch)) p.pitch = clamp(o.pitch, -PITCH_MAX, PITCH_MAX);
    rs.px = b.x; rs.py = b.y; rs.pz = b.z; rs.peh = b.eyeH;
    glideOn = false;
    camRig.snap();
    if (G.chunkManager) G.chunkManager.update(b, G.camera, 6);
    return { x: tx, y: ty, z: tz };
  }

  function respawn(reason) {
    const city = G.dim !== undefined && G.dim !== 'overworld' && G.dimMgr;
    const cp = city ? G.dimMgr.respawnPoint() : null;
    const hadBed = !!G.bedSpawn && !city;
    const t = cp || (city ? G.spawn : bedStillThere() ? G.bedSpawn : G.spawn);
    if (hadBed && !G.bedSpawn) {
      const msg = 'Yatağın yok olmuş: başlangıç noktasında doğdun.';
      if (typeof G.hint === 'function') G.hint(msg, { ttl: 5000, priority: 4, key: 'bedgone' });
      else if (G.hud) G.hud.hint = msg;
    }
    survivalRespawn(G.survival);
    teleport(t.x, t.y, t.z, { yaw: cp && Number.isFinite(cp.yaw) ? cp.yaw : p.yaw });
    p.dead = false;
    p.deathInfo = null;
    G.setUi(null);
    G.emit({ type: 'respawn', reason: reason || 'manual' });
    G.sound('ui_open', undefined, { vol: 0.5 });
    return true;
  }

  function setSpawn(x, y, z) {
    G.spawn = { x, y, z };
  }

  /* ---------------------------------------------------------------------------------------------
   * Kare sonu görsel senkron
   * ------------------------------------------------------------------------------------------- */
  function frameVisuals(dt, lit) {
    // elde eşya
    const key = G.inventory ? G.inventory.heldItem() : null;
    // büyülü eşya: model anahtarına parıltı eki (render/enchantGlint) eklenir; büyü eklenip kalkınca model yeniden kurulur
    const hs = key && G.inventory ? G.inventory.held() : null;
    const glint = !!(hs && hs.ench);
    if (key !== p.heldKey || glint !== p.heldGlint) {
      p.heldKey = key;
      p.heldGlint = glint;
      const mk = key && glint ? key + GLINT_SUFFIX : key;
      if (G.viewModel) G.viewModel.setHeld(mk);
      if (G.character) G.character.setHeld(mk);
    }
    const st = camRig.state;
    healFlash = dampTo(healFlash, 0, 3, dt);
    if (G.viewModel && G.viewModel.group.visible) {
      const f = G.fpState;
      fp.speed = b.speed;
      fp.sprint = b.sprinting;
      fp.onGround = b.onGround || b.climbing;
      fp.crouch = b.crouching;
      fp.swimming = b.swimming;
      fp.breaking = !!f.breaking && !G.time.paused;
      fp.eating = f.eating;
      fp.bowCharge = f.bowCharge;
      fp.nocked = f.nocked;
      fp.yawRate = st.yawRate;
      fp.pitchRate = st.pitchRate;
      fp.skyLight = lit.sky;
      fp.blockLight = lit.block;
      fp.sunDir = lit.sunDir;
      fp.underwater = st.underwater;
      fp.reducedMotion = G.reducedMotion || G.accessibility;
      G.viewModel.update(dt, fp);
    }
    if (G.character && G.character.root.visible) {
      motion.speed = b.speed;
      motion.vy = b.vy;
      motion.onGround = b.onGround || b.climbing;
      motion.crouch = b.crouching;
      motion.swim = b.swimming;
      motion.glide = b.gliding;
      motion.grapple = b.grapple.active;
      motion.dead = p.dead;
      motion.yaw = p.yaw;
      motion.pitch = p.pitch;
      const hf = G.survival.hurtFlash;
      motion.hurt = hf > 0 && !p.dead ? 1 - hf : undefined;
      motion.action = G.charAction;
      G.character.update(dt, motion);
    }
  }

  /** Boyut değişti (gameDimension.swap): son sağlam konum / kanca / planör gibi dünyaya bağlı durum sıfırlanır. */
  function onDimension() {
    lastGood.ok = false;
    glideOn = false;
    pendGrapple = null;
    pendGrappleRelease = false;
    pendToggleFly = false;
    lastEvents = null;
    rs.px = b.x; rs.py = b.y; rs.pz = b.z; rs.peh = b.eyeH;
  }

  const system = {
    name: 'core.player',
    order: -100,
    fixedUpdate,
    onAction,
    onDimension,
  };
  const survivalSystem = { name: 'core.survival', order: -90, fixedUpdate: survivalStep };
  const postSystem = { name: 'core.post', order: 1000, fixedUpdate: postStep };

  return {
    system,
    survivalSystem,
    postSystem,
    drainSurvivalEvents,
    pollInput,
    clearEdges,
    frameVisuals,
    teleport,
    respawn,
    setSpawn,
    get healFlash() { return healFlash; },
    get lastHurtT() { return lastHurtT; },
    get lastEvents() { return lastEvents; },
    syncArmor() {
      if (G.inventory && G.survival) setArmor(G.survival, G.inventory.armorDefense());
    },
    hotbarFill(hotbar) {
      const inv = G.inventory;
      for (let i = 0; i < 9; i++) {
        const sl = inv ? inv.slots[i] : null;
        const t = hotbar[i];
        if (sl && sl.item) {
          t.item = sl.item;
          t.count = sl.count;
          if (sl.ench) t.ench = Object.keys(sl.ench).length;
          else delete t.ench;
          if (sl.dur !== undefined) {
            const md = maxDurability(sl.item);
            if (md > 0) t.dur = clamp(sl.dur / md, 0, 1);
            else delete t.dur;
          } else delete t.dur;
          // teknoloji şarjı: 0..1 oran (yakıt/şarj çubuğu)
          if (sl.charge !== undefined) {
            const mc = maxCharge(sl.item);
            if (mc > 0) t.charge = clamp(sl.charge / mc, 0, 1);
            else delete t.charge;
          } else delete t.charge;
        } else {
          t.item = null;
          t.count = 0;
          delete t.dur;
          delete t.ench;
          delete t.charge;
        }
      }
    },
  };
}
