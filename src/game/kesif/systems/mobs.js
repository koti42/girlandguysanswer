/*
 * KEŞİF — "mobs" sistemi: yaratıklar, boss'lar, dövüş, yerdeki eşyalar, mermiler ve ilgili tüm sunum.
 *
 * Kayıt (gameSystems): iki sistem döner —
 *   'mobs.combat' (order −60)  oyuncu dövüş girdisi (mobsCombat.js): saldırı/yay/ışın tüfeği/kalkan/portal; blok sisteminden ÖNCE
 *                               çalışır ve G.aimEntity (nişandaki yaratık; doluysa blok sistemi kırmaz), G.combatClaim {attack,use},
 *                               G.player.blocking yazar.
 *   'mobs'        (order 40)    sabit adım: dünya bağlantısı (mobsWorld) + spawner.update + em.update + oyuncu etkileri; kare:
 *                               model/eşya/mermi/telegraf/hasar sayısı görünümleri, HUD boss çubuğu, müzik gerilimi (G.combatLevel),
 *                               kamera sarsıntısı. Boss'ları doğurur (içerik sisteminin G.arenas listesinden), kamp çevresini güvenli tutar.
 *
 * Olay sözleşmesi: em olayları G.emit hattıyla gelir (mobKilled/bossDefeated progression'a da gider: xp, yetenek, mühür/bölge, ödül).
 * Bu sistem yayınlar: 'portalShot' {x,y,z,face,color,handled} (bulmaca sistemi evt.handled yazar), 'playerHurtBy'.
 * Yerdeki eşya toplama sesi/parçacığı/'itemPickedUp' blocks sisteminde (G.pickupItem de oradan).
 * Yetenek tuşları: ability1 (kanca) / ability2 (planör) çekirdekte; ability3 = portal tabancası ateşi (G.abilities.portalGun);
 * ability4 kullanılmaz.
 *
 * Genel api: respawn() → bool, getBossInfo() → {id,key,name,hp,maxHp,phase,exposed,invuln}|null, getMobStats().
 * Kayıt: serialize → {v, combat:{cells}, marker, assist}. Yaratıklar ve yerdeki eşyalar oturum sisteminin kaydında (em.serialize/restore,
 * sim/save sınırları) yazılır; burada yalnızca savaş durumu, ölüm işareti ve kolaylaştırma sayacı tutulur.
 *
 * Blok hasarı kararı: ışın tüfeği blokları sim içinde (entitiesProjectiles.damageBlock → world.setBlock, 'blockBroken' by:'beam' olayı,
 * eşya düşürme) YAVAŞ kırar; harita modunda kapalıdır. Ayrı bir 'blockDamage' olayı yoktur.
 */
import { createCombat } from './mobsCombat.js';
import { createPlayerGlue } from './mobsPlayer.js';
import { createWorldGlue } from './mobsWorld.js';
import { createMobViews, qualityName } from './mobsModels.js';
import { createDropViews } from './mobsDrops.js';
import { createShots } from './mobsShots.js';
import { createTelegraphs } from './mobsTelegraph.js';
import { createFloaters } from './mobsFloaters.js';
import { createFx } from './mobsFx.js';
import { createBoss } from './mobsBoss.js';
import { warmPrograms } from './mobsWarm.js';
import {
  addShake, combatLevelStep, shakeByDistance, shakeNow, threatFromCount,
} from './mobsLogic.js';

const SAVE_V = 1;

export function createSystems(G) {
  let impl = null;
  let keepers = null;
  let carry = null;
  let needsBuild = false; // beforeDimension söktü, onDimension henüz kurmadı (swap yarıda kalırsa fixedUpdate kurar)
  const markers = Object.create(null); // boyut kimliği → ölüm işareti (overworld konumu şehirde çizilmesin)

  /** Alt modülleri atar (ısınma "keepers" korunur: shader programları sıcak kalsın). */
  function teardown() {
    if (!impl) return;
    const m = impl;
    impl = null;
    m.views.dispose();
    m.drops.dispose();
    m.shots.dispose();
    m.tele.dispose();
    m.floaters.dispose();
  }

  const combatSys = {
    name: 'mobs.combat',
    order: -60,
    fixedUpdate(g, dt) {
      if (impl) impl.combat.system.fixedUpdate(g, dt);
    },
    onAction(g, a) {
      if (impl) impl.combat.system.onAction(g, a);
    },
  };

  const mainSys = {
    name: 'mobs',
    order: 40,
    get impl() { return impl; },

    init(g) {
      if (impl || !g.em || !g.entityRoot || !g.particles) return;
      impl = build(g);
      impl.world.init();
      const w = warmPrograms(g, impl, qualityName(g));
      if (w) {
        keepers = w.keepers;
        impl.keepers = w.keepers;
        for (let i = 0; i < w.pool.length; i++) impl.views.adopt(w.pool[i]);
      }
    },

    /**
     * Boyut değişmeden ÖNCE (G.entityRoot hâlâ eski kök): em / world / entityRoot önbellekleyen TÜM alt modüller sökülür (modüller kendi kök grubunu
     * G.entityRoot'tan kaldırır: swap sonrası sökülürse yanlış köke bakıp sahnede asılı kalırdı). Saldırgan-yardım sayacı ve ölüm işareti saklanır.
     */
    beforeDimension(g, from) {
      if (!impl) return;
      const fromId = from && from.id ? from.id : 'overworld';
      markers[fromId] = impl.player.marker || null;
      carry = { deaths: impl.player.assist.deaths.slice(), until: impl.player.assist.until };
      teardown();
      needsBuild = true;
    },

    /** Boyut değişti: alt modüller yeni boyutun em/dünya/kökü için yeniden kurulur; paylaşılan oyuncu durumu (yardım sayacı) taşınır, ölüm işareti boyuta özgüdür. */
    onDimension(g, from, to) {
      if (impl || !g.em || !g.entityRoot || !g.particles) return;
      const toId = to && to.id ? to.id : g.dim || 'overworld';
      needsBuild = false;
      impl = build(g);
      impl.world.init();
      impl.keepers = keepers;
      if (carry) {
        for (let i = 0; i < carry.deaths.length; i++) impl.player.assist.deaths.push(carry.deaths[i]);
        impl.player.assist.until = carry.until;
        carry = null;
      }
      if (markers[toId]) impl.player.restoreMarker(markers[toId]);
      impl.boss.forceRefresh();
    },

    fixedUpdate(g, dt) {
      if (!impl && needsBuild) mainSys.onDimension(g, null, null);
      if (!impl) return;
      const b = g.body;
      const m = impl;
      m.world.update(dt, b);
      g.spawner.update(dt, b, m.world.spawnCtx);
      g.em.update(dt, b, m.world.emCtx);
      m.player.afterStep(dt);
      m.views.afterStep();
      m.boss.refresh(dt);
      m.threatT -= dt;
      if (m.threatT <= 0) {
        m.threatT = 0.25;
        m.threatN = countThreats(g);
      }
      const target = threatFromCount(m.threatN, m.boss.engaged);
      g.combatLevel = combatLevelStep(g.combatLevel, g.player.dead ? 0 : target, dt);
      m.drops.setMarker(m.player.stepMarker(dt));
    },

    frameUpdate(g, dt, alpha) {
      if (!impl || !g.worldReady) return;
      const m = impl;
      m.visT += dt;
      const cam = g.camera.position;
      m.views.update(dt, alpha, cam, g.look);
      m.drops.update(dt, alpha, cam, m.visT);
      m.shots.update(dt, alpha, cam, m.visT);
      m.tele.update(g.em.hazards, cam, m.visT);
      m.tele.setReducedMotion(!!(g.reducedMotion || g.accessibility));
      m.floaters.setVisible(g.settings.showDamageNumbers !== false);
      m.floaters.update(g.em.numbers.list, cam);
      m.combat.applyAction();
      g.hud.bowCharge = g.fpState.bowCharge;
      applyShake(g, m, dt);
    },

    onEvent(g, e) {
      if (!impl) return;
      const m = impl;
      switch (e.type) {
        case 'fx': m.fx.fx(e); break;
        case 'mobHurt': m.fx.mobHurt(e); break;
        case 'mobKilled': m.fx.mobKilled(e); break;
        case 'playerHit': m.player.onPlayerHit(e); break;
        case 'playerEffect': m.player.onPlayerEffect(e); break;
        case 'bossEngage':
        case 'bossPhase':
        case 'bossFinale':
        case 'bossReset':
          m.boss.onEvent(e);
          break;
        case 'bossDefeated':
          m.boss.onEvent(e);
          m.world.invalidate();
          break;
        case 'died': m.player.onDied(); break;
        case 'death': m.player.onDeath(e); break;
        case 'respawn': m.player.onRespawn(); break;
        default: break;
      }
    },

    api(g) {
      return {
        respawn() {
          return impl ? impl.player.respawn() : false;
        },
        getBossInfo() {
          return impl ? impl.boss.info() : null;
        },
        getMobStats() {
          return impl ? mobStats(g, impl) : null;
        },
      };
    },

    serialize(g) {
      if (!impl) return null;
      const mk = impl.player.marker;
      return {
        v: SAVE_V,
        combat: { cells: g.combat.cells },
        marker: mk ? {
          x: mk.x, y: mk.y, z: mk.z, t: mk.t, life: mk.life,
        } : null,
        assist: { deaths: impl.player.assist.deaths.slice(), until: impl.player.assist.until },
      };
    },

    restore(g, data) {
      if (!impl || !data || typeof data !== 'object') return;
      impl.views.clear();
      impl.drops.clear();
      impl.shots.clear();
      impl.world.resetPopulation();
      if (data.combat && Number.isFinite(data.combat.cells)) g.combat.cells = Math.max(0, Math.min(6, data.combat.cells | 0));
      const mk = data.marker;
      if (mk && Number.isFinite(mk.x) && Number.isFinite(mk.y) && Number.isFinite(mk.z)) {
        const life = Number.isFinite(mk.life) && mk.life > 0 ? mk.life : 300;
        impl.player.restoreMarker({
          x: mk.x, y: mk.y, z: mk.z, t: Number.isFinite(mk.t) ? mk.t : 0, life, empty: 0, done: false, pulse: 0,
        });
      }
      if (data.assist && Array.isArray(data.assist.deaths)) {
        const a = impl.player.assist;
        a.deaths.length = 0;
        for (let i = 0; i < data.assist.deaths.length && i < 8; i++) if (Number.isFinite(data.assist.deaths[i])) a.deaths.push(data.assist.deaths[i]);
        a.until = Number.isFinite(data.assist.until) ? data.assist.until : 0;
      }
      impl.boss.forceRefresh();
    },

    dispose() {
      if (!impl) return;
      teardown();
      if (keepers) keepers.forEach((k) => k.dispose());
      keepers = null;
      if (G.hud) G.hud.boss = null;
    },
  };

  return [combatSys, mainSys];
}

/* ------------------------------------------------------------------------------------------------
 * Kurulum
 * ---------------------------------------------------------------------------------------------- */
function build(G) {
  const spos = { x: 0, y: 0, z: 0 };
  const shake = { amp: 0, t: 0, dur: 1 };
  const reduced = () => !!(G.reducedMotion || G.accessibility);
  const sound = (name, x, y, z, vol, pitch) => {
    spos.x = x; spos.y = y; spos.z = z;
    G.sound(name, spos, { vol: vol === undefined ? 1 : vol, pitch: pitch === undefined ? 1 : pitch });
  };
  const shakeAt = (amp, dur, x, z) => {
    const b = G.body;
    const dx = x - b.x;
    const dz = z - b.z;
    addShake(shake, shakeByDistance(amp, Math.sqrt(dx * dx + dz * dz), 48), dur, reduced());
  };

  const shots = createShots(G);
  const views = createMobViews(G, {
    onBossCue(name, info) {
      if (name === 'step') {
        sound('break:taş', info.x, info.y, info.z, 0.55, 0.55);
        shakeAt(0.012, 0.18, info.x, info.z);
      }
    },
  });
  const drops = createDropViews(G);
  const tele = createTelegraphs(G.THREE, G.entityRoot, { reducedMotion: reduced() });
  const floaters = createFloaters(G.THREE, G.entityRoot, {
    reducedMotion: reduced(),
    hidePlayer: () => !!G.survival.easy || G.mode !== 'macera',
  });
  const combat = createCombat(G, { sound, shots, particles: G.particles });
  const player = createPlayerGlue(G, { sound, particles: G.particles, combat });
  const world = createWorldGlue(G, { assistActive: () => player.assistActive() });
  const entInfo = (id) => {
    const e = G.em.mobs.get(id);
    if (!e) return null;
    const v = views.viewOf(id);
    return {
      key: e.key, boss: e.def.boss, h: e.h, deathColor: v ? v.model.deathColor : 0,
    };
  };
  const fx = createFx({
    G, particles: G.particles, sound, shake: shakeAt, flash: shots.flash, muzzle: shots.muzzle, entInfo,
  });
  const boss = createBoss(G, { sound, shake: shakeAt, particles: G.particles });
  return {
    shots,
    views,
    drops,
    tele,
    floaters,
    combat,
    player,
    world,
    fx,
    boss,
    shake,
    visT: 0,
    threatT: 0,
    threatN: 0,
  };
}

function countThreats(G) {
  const b = G.body;
  let n = 0;
  G.em.mobs.forEach((e) => {
    if (e.dead || !e.def.hostile || e.def.boss || e.minion || !e.target) return;
    const dx = e.x - b.x;
    const dz = e.z - b.z;
    if (dx * dx + dz * dz < 24 * 24) n++;
  });
  return n;
}

const SHAKE_T = { v: 0 };
function applyShake(G, m, dt) {
  if (!(dt > 0)) return;
  const a = shakeNow(m.shake, dt);
  if (a <= 0) return;
  SHAKE_T.v += dt * 83;
  const cam = G.camera;
  cam.position.y += Math.cos(SHAKE_T.v * 2.3) * a;
  cam.rotation.x += Math.sin(SHAKE_T.v * 1.7) * a * 0.5;
  cam.rotation.z += Math.sin(SHAKE_T.v * 1.3) * a * 0.3;
}

function mobStats(G, m) {
  const c = G.em.counts();
  return {
    mobs: G.em.mobs.size,
    hostile: c.hostile,
    passive: c.passive,
    items: G.em.items.size,
    projectiles: G.em.projectiles.length,
    hazards: G.em.hazards.length,
    views: m.views.count,
    visible: m.views.stats.visible,
    pooled: m.views.stats.pooled,
    modelsCreated: m.views.stats.created,
    dropViews: m.drops.count,
    telegraphs: m.tele.stats.active,
    floaters: m.floaters.stats.active,
    difficulty: m.world.difficulty,
    combatLevel: G.combatLevel,
    arenas: m.world.refs.arenas.length,
    safes: m.world.refs.safes.length,
  };
}

export default createSystems;
