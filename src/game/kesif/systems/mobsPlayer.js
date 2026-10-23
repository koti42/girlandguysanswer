/*
 * KEŞİF mobs sistemi — oyuncu tarafı: yaratık vuruşu (kalkan/zırh/geri tepme), durum etkileri (yavaşlama), ölüm işareti,
 * yeniden doğuş sonrası temizlik, art arda ölümde kolaylaştırma.
 *
 *   createPlayerGlue(G, c) → {
 *     onPlayerHit(evt), onPlayerEffect(evt), afterStep(dt), onDeath(evt), onRespawn(), onDied(),
 *     respawn() → bool, status, marker (getter), stepMarker(dt), assistActive(), assist
 *   }
 *     c: { sound(name,x,y,z,vol,pitch), particles, combat:{reset} }
 *
 * Sorumluluk bölüşümü: hasar uygulandığında can/ölüm/kamera sarsıntısı/'hurt' sesi çekirdekte (survival olayları); burada geri tepme,
 * kalkan sesi, yavaşlama ve ölüm görselleri. Kolay mod/inşa/harita modu: hasar 0 olduğundan yalnızca yumuşak geri itme uygulanır.
 */
import { applyKnockback, isBoxFree } from '../sim/physics.js';
import { resolvePlayerHit } from '../sim/combat.js';
import { ITEMS } from '../sim/items.js';
import {
  DEATH_MARKER, assistActive, assistOnDeath, assistReset, createAssist, createDeathMarker, slowDisplace, stepDeathMarker,
} from './mobsLogic.js';

const tmp = { x: 0, z: 0 };
const prevP = { x: 0, z: 0 };
const spark = { x: 0, y: 0, z: 0 };

export function createPlayerGlue(G, c) {
  const body = G.body;
  const status = { slowT: 0, slowF: 1, softCd: 0, chillT: 0, announceT: 0 };
  const assist = createAssist();
  let marker = null;
  let markerT = 0;
  let assistAnnounced = false;
  G.lastHit = null;

  function soft() {
    return G.survival.easy || G.mode === 'insa' || G.mode === 'harita';
  }

  function applyEffect(kind, t, factor) {
    if (kind !== 'slow' || !(t > 0)) return;
    const dur = soft() ? t * 0.5 : t;
    status.slowF = status.slowT > 0 ? Math.min(status.slowF, factor > 0 ? factor : 0.6) : (factor > 0 ? factor : 0.6);
    status.slowT = Math.max(status.slowT, dur);
    if (status.announceT <= 0) {
      status.announceT = 6;
      G.speak('Yavaşladın.');
    }
  }

  function onPlayerHit(evt) {
    if (G.player.dead) return;
    const isSoft = soft();
    const heldBefore = G.inventory ? G.inventory.heldItem() : null;
    const r = resolvePlayerHit(evt, {
      survival: G.survival, inventory: G.inventory, mode: G.mode, mods: G.mode === 'macera' ? G.mods : undefined, em: G.em, // Dikenler
    });
    const taken = r.applied > 0;
    if (evt.blocked) {
      c.sound('block', body.x, body.y, body.z, 0.9, 1 + ((G.time.tick * 5) % 7) / 40);
      G.haptic('light');
      spark.x = body.x - Math.sin(G.player.yaw) * 0.8;
      spark.y = body.y + 1.25;
      spark.z = body.z - Math.cos(G.player.yaw) * 0.8;
      c.particles.hitSpark(spark, null, 0xc8d0d8, 6);
      const held = G.inventory ? G.inventory.heldItem() : null;
      if (heldBefore && ITEMS[heldBefore] && ITEMS[heldBefore].shield && !held) {
        G.sound('ui_error');
        G.speak('Kalkanın kırıldı.');
      }
    }
    const canKnock = taken || (isSoft && status.softCd <= 0 && evt.damage > 0);
    if (r.knock && canKnock) {
      const mul = (evt.blocked ? 0.4 : 1) * (taken ? 1 : 0.5);
      applyKnockback(body, r.knock.x, r.knock.z, r.knock.strength * mul, evt.blocked ? 2.5 : 4.5);
      if (!taken) status.softCd = 0.6;
    }
    if (r.effect && (taken || isSoft)) applyEffect(r.effect.kind, r.effect.t, r.effect.factor);
    if (taken) {
      G.lastHit = {
        x: evt.x, z: evt.z, t: G.time.seconds, damage: r.applied, mob: evt.sourceType, cause: evt.cause,
      };
      G.emit({
        type: 'playerHurtBy', mob: evt.sourceType, damage: r.applied, cause: evt.cause, blocked: !!evt.blocked,
      });
    }
  }

  function onPlayerEffect(evt) {
    if (G.player.dead) return;
    applyEffect(evt.effect, evt.t, evt.factor);
  }

  /** Sabit adım sonu (fizikten sonra): yavaşlatma, sayaçlar. */
  function afterStep(dt) {
    if (status.softCd > 0) status.softCd -= dt;
    if (status.announceT > 0) status.announceT -= dt;
    if (status.slowT > 0) {
      status.slowT -= dt;
      const rs = G._rs;
      if (rs && body.knockT <= 0 && !body.flying && !body.grapple.active && !G.player.dead) {
        prevP.x = rs.px;
        prevP.z = rs.pz;
        slowDisplace(prevP, body, status.slowF, tmp);
        const hw = body.w * 0.5;
        if (isBoxFree(G.world, tmp.x - hw, body.y + 0.02, tmp.z - hw, tmp.x + hw, body.y + body.h - 0.02, tmp.z + hw)) {
          body.x = tmp.x;
          body.z = tmp.z;
        }
      }
      status.chillT -= dt;
      if (status.chillT <= 0) {
        status.chillT = 0.35;
        spark.x = body.x; spark.y = body.y + 0.9; spark.z = body.z;
        c.particles.magicBurst(spark, 0xa8e8d0, { radius: 0.5, scale: 0.35 });
      }
      if (status.slowT <= 0) {
        status.slowT = 0;
        status.slowF = 1;
      }
    }
  }

  function onDied() {
    if (assistOnDeath(assist, G.time.seconds) && !assistAnnounced) {
      assistAnnounced = true;
      G.speak('Biraz kolaylaştırdık: yaratıklar bir süre daha az zarar verecek.');
    }
    status.slowT = 0;
    status.slowF = 1;
  }

  /** 'death' olayı (çekirdek): düşen eşya varsa ölüm noktasını işaretle. */
  function onDeath(evt) {
    if (evt.kept || !(evt.lostCount > 0)) return;
    marker = createDeathMarker(evt.x, evt.y, evt.z, DEATH_MARKER.life);
    markerT = 0;
  }

  /** Yeniden doğuş sonrası: etkileri sıfırla, çevredeki düşman ve mermileri temizle. */
  function onRespawn() {
    status.slowT = 0;
    status.slowF = 1;
    status.softCd = 0;
    if (c.combat) c.combat.reset();
    const em = G.em;
    const gone = [];
    em.mobs.forEach((e) => {
      if (e.dead || e.def.boss || e.minion || !e.def.hostile) return;
      const dx = e.x - body.x;
      const dz = e.z - body.z;
      if (dx * dx + dz * dz < 24 * 24) gone.push(e);
    });
    for (let i = 0; i < gone.length; i++) em.dismiss(gone[i], 'mobFade');
    for (let i = em.projectiles.length - 1; i >= 0; i--) {
      const p = em.projectiles[i];
      const dx = p.x - body.x;
      const dz = p.z - body.z;
      if (p.team === 'mob' && dx * dx + dz * dz < 36 * 36) em.projectiles.splice(i, 1);
    }
    assistAnnounced = assistActive(assist, G.time.seconds);
  }

  function stepMarker(dt) {
    if (!marker) return null;
    markerT -= dt;
    let near = true;
    if (markerT <= 0) {
      markerT = 0.5;
      near = false;
      const r2 = 8 * 8;
      G.em.items.forEach((e) => {
        const dx = e.x - marker.x;
        const dz = e.z - marker.z;
        if (dx * dx + dz * dz < r2) near = true;
      });
      marker.near = near;
    }
    stepDeathMarker(marker, dt, marker.near !== false);
    if (marker.done) marker = null;
    return marker;
  }

  function respawn() {
    if (!G.player.dead) return false;
    return G.respawnPlayer('manual') !== false;
  }

  return {
    status,
    assist,
    onPlayerHit,
    onPlayerEffect,
    afterStep,
    onDied,
    onDeath,
    onRespawn,
    stepMarker,
    respawn,
    get marker() { return marker; },
    assistActive: () => assistActive(assist, G.time.seconds),
    resetAssist: () => { assistReset(assist); assistAnnounced = false; },
    restoreMarker(m) { marker = m; },
  };
}
