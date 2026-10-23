/*
 * KEŞİF mobs sistemi — sim 'fx' olaylarının (boss/mob işaretleri) parçacık + ses karşılıkları.
 *
 *   createFx(c) → { fx(evt), mobHurt(evt), mobKilled(evt) }   (eşya alma sesi/parçacığı blocks sisteminde)
 *     c: { G, particles, sound(name,x,y,z,vol,pitch), shake(amp,dur,x,z), flash(ax,ay,az,bx,by,bz,color,radius,life), muzzle(out),
 *          entInfo(id) → {key, boss, h, deathColor}|null }
 *   bossColor(key)    boss türüne özgü vurgu rengi
 *
 * Çocuk dostu: kan yok; vuruş = kıvılcım, ölüm = parıldayan zerrelere dağılma. Uzaktaki (≈70 blok) olaylar atlanır. Her işleyici
 * ucuz ve ayırmasızdır (konum nesnesi yeniden kullanılır). Sim olay adları: sim/mobAI*.js, entities*.js başlıklarında.
 */

const BOSS_COLOR = Object.freeze({
  kokana: 0x7fd14a, tasbekci: 0xd9a066, buzkral: 0x9fdcff, golgehukumdar: 0x9b4dff,
});
const FAR = 70;

export function bossColor(key) {
  return BOSS_COLOR[key] || 0xffb060;
}

const P = { x: 0, y: 0, z: 0 };
const N = { x: 0, y: 1, z: 0 };

export function createFx(c) {
  const G = c.G;
  const pt = c.particles;
  const body = G.body;
  const dist = (e) => {
    const dx = e.x - body.x;
    const dy = (e.y === undefined ? body.y : e.y) - body.y;
    const dz = e.z - body.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  const at = (e, dy) => {
    P.x = e.x; P.y = e.y + (dy || 0); P.z = e.z;
    return P;
  };
  const snd = (name, e, vol, pitch) => c.sound(name, e.x, e.y, e.z, vol, pitch);
  const info = (e) => (e.id !== undefined ? c.entInfo(e.id) : null);
  const colorOf = (e) => {
    const i = info(e);
    return i && i.boss ? bossColor(i.key) : 0xffb060;
  };

  const table = {
    slam(e) {
      pt.bossShockwave(at(e, 0.1), { radius: e.r > 0 ? Math.min(e.r, 16) : 6, color: colorOf(e) });
      snd('break:taş', e, 1, 0.65);
      c.shake(0.075, 0.38, e.x, e.z);
    },
    root(e) {
      pt.magicBurst(at(e, 0.2), 0x6ab04c, { radius: e.r > 0 ? Math.min(e.r, 8) : 3, scale: 0.7 });
      snd('break:yaprak', e, 0.8, 0.8);
      c.shake(0.035, 0.25, e.x, e.z);
    },
    vine(e) {
      pt.hitSpark(at(e, 0.4), null, 0x7fd14a, 14);
      snd('break:yaprak', e, 0.7, 1.1);
      c.shake(0.02, 0.2, e.x, e.z);
    },
    spore(e) {
      pt.magicBurst(at(e, 0.4), 0xb5e04a, { radius: e.r > 0 ? Math.min(e.r, 7) : 3, scale: 0.8 });
      snd('mob:gloop:attack', e, 0.7, 0.8);
    },
    frost(e) {
      pt.bossShockwave(at(e, 0.1), { radius: e.r > 0 ? Math.min(e.r * 0.8, 14) : 5, color: 0x9fdcff });
      pt.magicBurst(at(e, 0.4), 0xcdeeff, { radius: 2.5, scale: 0.8 });
      snd('break:cam', e, 0.85, 0.9);
      c.shake(0.05, 0.3, e.x, e.z);
    },
    spear(e) {
      pt.hitSpark(at(e, 0.2), null, 0x9fdcff, 8);
      snd('bow', e, 0.7, 1.45);
    },
    rock(e) {
      pt.hitSpark(at(e, 0.1), null, 0xb0a090, 8);
      snd('break:taş', e, 0.55, 1.25);
    },
    leap(e) {
      const i = info(e);
      if (i && i.boss) {
        pt.bossShockwave(at(e, 0.1), { radius: 4, color: bossColor(i.key) });
        snd('jump', e, 0.9, 0.55);
        c.shake(0.03, 0.2, e.x, e.z);
      } else {
        pt.blockDust(0xb09a70, at(e, 0.1));
        snd('jump', e, 0.4, 0.9);
      }
    },
    teleport(e) {
      pt.portalSwirl(at(e, 0), 0x9b4dff, { radius: 1.3, count: 22 });
      snd('portal', e, 0.8, 1.2);
    },
    clones(e) {
      pt.portalSwirl(at(e, 0), 0x6a4dff, { radius: 2.2, count: 30 });
      pt.magicBurst(at(e, 0), 0x9b4dff, { radius: 3, scale: 0.9 });
      snd('portal', e, 0.8, 0.8);
      c.shake(0.03, 0.25, e.x, e.z);
    },
    runes(e) {
      pt.magicBurst(at(e, 0), 0xb08cff, { radius: 3.4, scale: 1 });
      snd('rune:3', e, 0.8, 1);
    },
    summon(e) {
      pt.portalSwirl(at(e, 0), colorOf(e), { radius: 1.6, count: 26 });
      snd('boss_spawn', e, 0.55, 1.3);
    },
    roar(e) {
      pt.bossShockwave(at(e, 0), { radius: 5.5, color: colorOf(e) });
      const i = info(e);
      snd('mob:' + (i ? i.key : 'golge') + ':attack', e, 1, 0.72);
      c.shake(0.06, 0.55, e.x, e.z);
    },
    shoot(e) {
      snd('bow', e, 0.55, 1.1);
    },
    dust(e) {
      pt.blockDust(0xb09a70, at(e, 0.1));
    },
    squish(e) {
      pt.magicBurst(at(e, 0.3), 0xff7a3a, { radius: 0.9, scale: 0.5 });
      snd('mob:lavslime:attack', e, 0.55, 1);
    },
    beamHit(e) {
      pt.beamImpact(at(e, 0), N, 0x9affff);
    },
    blockBreak(e) {
      pt.blockBreak(e.id, at(e, 0));
      snd('break', e, 0.8, 1);
    },
    blocked(e) {
      pt.hitSpark(at(e, 0), null, 0xc8d0d8, 5);
      snd('block', e, 0.75, 1);
    },
    mobDeath(e) {
      const i = info(e);
      const h = i && i.h > 0 ? i.h : 1;
      const scale = h < 0.5 ? 0.5 : h > 3.5 ? 3.5 : h;
      const color = i && i.deathColor ? i.deathColor : 0xc8b0ff;
      pt.deathMotes(at(e, 0), color, scale);
      snd('mob:' + (e.mob || (i ? i.key : 'golge')) + ':die', e, i && i.boss ? 1 : 0.85, 1);
      if (i && i.boss) {
        pt.bossShockwave(at(e, 0.1), { radius: 7, color: bossColor(i.key) });
        c.shake(0.08, 0.7, e.x, e.z);
      }
    },
    mobFade(e) {
      pt.deathMotes(at(e, 0), 0xb8c0cc, 0.45);
    },
    cloneBurst(e) {
      pt.magicBurst(at(e, 0), 0x9b4dff, { radius: 1.4, scale: 0.7 });
      snd('portal', e, 0.45, 1.5);
    },
    itemPuff() {},
    itemBurn(e) {
      pt.hitSpark(at(e, 0), null, 0xff8a3a, 6);
      snd('lava', e, 0.3, 1.2);
    },
    arrowHit(e) {
      pt.hitSpark(at(e, 0), null, 0xe8e0d0, 6);
      snd('arrow_hit', e, 0.7, 1);
    },
    arrowStick(e) {
      pt.hitSpark(at(e, 0), null, 0xd9c9a0, 3);
      snd('arrow_hit', e, 0.45, 0.9);
    },
    rockImpact(e) {
      pt.bossShockwave(at(e, 0.1), { radius: Math.max(2, (e.r || 1.5) * 1.6), color: 0xb0a090 });
      snd('break:taş', e, 0.9, 0.8);
      c.shake(0.04, 0.25, e.x, e.z);
    },
    iceImpact(e) {
      if (e.name === 'iceImpact' && pt.frostBurst) pt.frostBurst(at(e, 0), Math.max(1, e.r || 1));
      else pt.magicBurst(at(e, 0), 0x9fdcff, { radius: 1.6, scale: 0.8 });
      snd('spell:ice:impact', e, 0.75, 1);
    },
    fireImpact(e) {
      // büyü ateş topu: parlak patlama + kor zerreleri (render/particleFxMagic)
      if (pt.fireBurst) pt.fireBurst(at(e, 0.1), Math.max(1, e.r || 2));
      else pt.magicBurst(at(e, 0), 0xff7a2a, { radius: 2, scale: 0.9 });
      snd('spell:fire:impact', e, 0.9, 1);
      c.shake(0.035, 0.22, e.x, e.z);
    },
    bowShot(e) {
      const k = e.charge > 0 ? (e.charge > 1 ? 1 : e.charge) : 0.5;
      snd('bow', e, 0.55 + 0.4 * k, 0.9 + 0.25 * k);
    },
    beam(e) {
      if (e.team === undefined) {
        // boss ışını işareti (tehlike cue'su): etkinleşme sesi; çizgiyi telegraf bileşeni çizer
        snd('gun', e, 0.8, 0.55);
        return;
      }
      const player = e.team === 'player';
      let ax = e.x;
      let ay = e.y;
      let az = e.z;
      if (player) {
        c.muzzle(P);
        ax = P.x; ay = P.y; az = P.z;
      }
      const color = player ? 0x7fe9ff : 0xb36bff;
      c.flash(ax, ay, az, e.x1, e.y1, e.z1, color, player ? 0.035 : 0.09, player ? 0.13 : 0.22);
      P.x = ax; P.y = ay; P.z = az;
      const end = { x: e.x1, y: e.y1, z: e.z1 };
      pt.beamTrail(P, end, color);
      if (e.hit) {
        pt.beamImpact(end, N, color);
      }
      snd('gun', e, player ? 0.85 : 0.7, player ? 1 : 0.7);
    },
  };

  function fx(evt) {
    const h = table[evt.name];
    if (!h) return;
    if (evt.x !== undefined && dist(evt) > FAR) return;
    h(evt);
  }

  function mobHurt(e) {
    if (dist(e) > FAR) return;
    pt.hitSpark(at(e, 0), null, e.crit ? 0xffd23a : 0xfff0c0, e.crit ? 14 : 8);
    const fromPlayer = e.source === 'melee' || e.source === 'projectile' || e.source === 'beam' || e.source === 'magic';
    if (fromPlayer) {
      if (e.source === 'projectile') snd('arrow_hit', e, 0.75, e.crit ? 1.25 : 1);
      else if (e.source === 'magic') snd('hit', e, 0.7, 1.45);
      else if (e.source === 'beam') snd('hit', e, 0.6, 1.3);
      G.haptic(e.crit ? 'medium' : 'light');
    }
    if (e.mob) snd('mob:' + e.mob + ':hurt', e, 0.8, 1);
  }

  function mobKilled(e) {
    if (e.minion || dist(e) > FAR) return;
    if (e.xp > 0) pt.xpOrb(at(e, 0.5), 0x9dff7a);
    G.haptic(e.boss ? 'heavy' : 'medium');
  }

  return {
    fx, mobHurt, mobKilled, table,
  };
}
