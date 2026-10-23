/*
 * KEŞİF mobs sistemi — boss akışı: HUD boss çubuğu, müzik gerilimi, aşama/engage/finale/yenilgi tepkileri.
 *
 *   createBoss(G, c) → { onEvent(evt), refresh(dt), info(), engaged }
 *     c: { sound(name,x,y,z,vol,pitch), shake(amp,dur,x,z), particles }
 *
 * Boss ödülü/bölge ilerlemesi sim'den G.emit hattıyla gelir (bossDefeated → progression.onEvent: yetenek, mühür/bölge, ödül);
 * burada yalnızca sunum (ses, parçacık, sarsıntı, ekran okuyucu) yapılır. HUD: G.hud.boss = {name, hp, maxHp, phase} | null.
 */
import { bossColor } from './mobsFx.js';

const PHASE_LABEL = ['1. aşama', '2. aşama', 'son aşama'];

export function createBoss(G, c) {
  const hudObj = {
    name: '', hp: 0, maxHp: 1, phase: 0,
  };
  let cur = null;
  let acc = 0;
  let engagedId = 0;

  function refreshNow() {
    const b = G.em.bossHud();
    cur = b;
    if (!b) {
      if (G.hud.boss) G.hud.boss = null;
      engagedId = 0;
      return;
    }
    engagedId = b.id;
    hudObj.name = b.name;
    hudObj.hp = b.hp;
    hudObj.maxHp = b.maxHp;
    hudObj.phase = b.phase;
    if (G.hud.boss !== hudObj) G.hud.boss = hudObj;
  }

  return {
    get engaged() { return engagedId !== 0; },
    info() {
      if (!cur) return null;
      return {
        id: cur.id, key: cur.boss, name: cur.name, hp: cur.hp, maxHp: cur.maxHp, phase: cur.phase, exposed: cur.exposed, invuln: cur.invuln,
      };
    },
    /** dt: kare/adım süresi; boss çubuğu ≈10 Hz, ölünce hemen kapanır. */
    refresh(dt) {
      acc += dt;
      if (acc < 0.1 && engagedId !== 0) return;
      acc = 0;
      refreshNow();
    },
    forceRefresh: refreshNow,
    onEvent(e) {
      switch (e.type) {
        case 'bossEngage': {
          c.sound('boss_spawn', G.body.x, G.body.y, G.body.z, 0.9, 1);
          c.shake(0.04, 0.4, G.body.x, G.body.z);
          G.speak(e.name + ' ile savaş başladı!');
          G.haptic('heavy');
          refreshNow();
          break;
        }
        case 'bossPhase': {
          const label = PHASE_LABEL[e.phase] || ('aşama ' + (e.phase + 1));
          c.sound('mob:' + e.boss + ':attack', G.body.x, G.body.y, G.body.z, 0.85, 0.7);
          c.shake(0.07, 0.6, G.body.x, G.body.z);
          G.speak(e.name + ' öfkelendi: ' + label + '.');
          G.haptic('heavy');
          refreshNow();
          break;
        }
        case 'bossFinale': {
          c.sound('portal', G.body.x, G.body.y, G.body.z, 0.9, 0.7);
          c.shake(0.05, 0.5, G.body.x, G.body.z);
          G.speak('Son aşama! Portalları izle.');
          break;
        }
        case 'bossReset': {
          if (!G.player.dead) G.speak('Boss sıfırlandı. Hazırlanıp yeniden dene.');
          refreshNow();
          break;
        }
        case 'bossDefeated': {
          const col = bossColor(e.boss);
          c.particles.levelUp({ x: e.x, y: e.y + 1.5, z: e.z }, col, { multi: true });
          c.sound('achievement', G.body.x, G.body.y, G.body.z, 0.9, 1);
          c.shake(0.06, 0.7, e.x, e.z);
          G.speak(e.name + ' yenildi! Tebrikler.');
          G.haptic('heavy');
          refreshNow();
          break;
        }
        default:
          break;
      }
    },
  };
}
