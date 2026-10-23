import { describe, expect, it } from 'vitest';
import { bossColor, createFx } from './mobsFx.js';
import { createBoss } from './mobsBoss.js';
import { resolveSound } from '../audioRecipes.js';
import { MOB_KEYS } from '../sim/mobTypes.js';

function mkCtx(extra) {
  const calls = [];
  const rec = (n) => (...a) => { calls.push([n, ...a]); };
  const particles = new Proxy({}, { get: (t, k) => rec('p.' + String(k)) });
  const infos = (extra && extra.infos) || {};
  const G = {
    body: { x: 0, y: 41, z: 0 },
    time: { tick: 3 },
    haptic: (s) => calls.push(['haptic', s]),
    speak: (t) => calls.push(['speak', t]),
    player: { dead: false },
    hud: { boss: null },
    em: { bossHud: () => (extra && extra.boss) || null },
  };
  const c = {
    G,
    particles,
    sound: (n, x, y, z, v, p) => calls.push(['sound', n, v, p]),
    shake: (a, d) => calls.push(['shake', a, d]),
    flash: (...a) => calls.push(['flash', ...a]),
    muzzle: (o) => { o.x = 0; o.y = 42; o.z = -0.5; return o; },
    entInfo: (id) => infos[id] || null,
  };
  return { c, calls, G };
}

describe('createFx.fx', () => {
  it('slam: şok dalgası + ses + sarsıntı; boss rengi sahibe göre', () => {
    const { c, calls } = mkCtx({ infos: { 7: { key: 'buzkral', boss: true, h: 5 } } });
    const f = createFx(c);
    f.fx({ name: 'slam', x: 3, y: 41, z: 2, r: 5, id: 7 });
    const sw = calls.find((x) => x[0] === 'p.bossShockwave');
    expect(sw[2]).toMatchObject({ radius: 5, color: bossColor('buzkral') });
    expect(calls.some((x) => x[0] === 'sound' && x[1] === 'break:taş')).toBe(true);
    expect(calls.some((x) => x[0] === 'shake')).toBe(true);
  });

  it('bilinmeyen ad ve uzak olay yok sayılır', () => {
    const { c, calls } = mkCtx();
    const f = createFx(c);
    f.fx({ name: 'yok', x: 0, y: 0, z: 0 });
    f.fx({ name: 'slam', x: 500, y: 41, z: 0, r: 3 });
    expect(calls).toHaveLength(0);
  });

  it('her bilinen ipucu çökmeden çalışır ve ses/parçacıktan en az birini üretir', () => {
    const { c, calls } = mkCtx({ infos: { 1: { key: 'golgehukumdar', boss: true, h: 4, deathColor: 0x123456 } } });
    const f = createFx(c);
    const keys = Object.keys(f.table);
    expect(keys.length).toBeGreaterThanOrEqual(25);
    keys.forEach((name) => {
      calls.length = 0;
      const evt = {
        name, x: 2, y: 41, z: 2, r: 4, id: 1, mob: 'golge', team: 'player', x1: 2, y1: 41, z1: -10, hit: 'block', charge: 1,
      };
      expect(() => f.fx(evt)).not.toThrow();
      if (name !== 'itemPuff') expect(calls.length, name).toBeGreaterThan(0);
    });
  });

  it('beam: oyuncu ışını namlu ucundan çizilir; boss işareti yalnızca ses', () => {
    const { c, calls } = mkCtx();
    const f = createFx(c);
    f.fx({
      name: 'beam', team: 'player', x: 0, y: 42, z: 0, x1: 0, y1: 42, z1: -20, hit: 'entity',
    });
    const fl = calls.find((x) => x[0] === 'flash');
    expect(fl.slice(1, 4)).toEqual([0, 42, -0.5]); // muzzle
    expect(calls.some((x) => x[0] === 'p.beamImpact')).toBe(true);
    calls.length = 0;
    f.fx({
      name: 'beam', x: 5, y: 41, z: 5, r: 1, shape: 'beam', id: 3,
    });
    expect(calls.some((x) => x[0] === 'flash')).toBe(false);
    expect(calls.some((x) => x[0] === 'sound' && x[1] === 'gun')).toBe(true);
  });

  it('mobDeath: ölüm rengi ve boyut; boss ek şok dalgası', () => {
    const { c, calls } = mkCtx({ infos: { 2: { key: 'tasbekci', boss: true, h: 5, deathColor: 0xabcdef }, 3: { key: 'tavuk', boss: false, h: 0.3, deathColor: 0 } } });
    const f = createFx(c);
    f.fx({
      name: 'mobDeath', x: 1, y: 41, z: 1, id: 2, mob: 'tasbekci',
    });
    const dm = calls.find((x) => x[0] === 'p.deathMotes');
    expect(dm[2]).toBe(0xabcdef);
    expect(dm[3]).toBe(3.5); // üst sınır
    expect(calls.some((x) => x[0] === 'p.bossShockwave')).toBe(true);
    expect(calls.some((x) => x[0] === 'sound' && x[1] === 'mob:tasbekci:die')).toBe(true);
    calls.length = 0;
    f.fx({
      name: 'mobDeath', x: 1, y: 41, z: 1, id: 3, mob: 'tavuk',
    });
    expect(calls.find((x) => x[0] === 'p.deathMotes')[3]).toBe(0.5); // alt sınır
    expect(calls.some((x) => x[0] === 'p.bossShockwave')).toBe(false);
  });

  it('bowShot ses seviyesi gerilmeye göre', () => {
    const { c, calls } = mkCtx();
    const f = createFx(c);
    f.fx({ name: 'bowShot', x: 0, y: 42, z: 0, charge: 0.2 });
    f.fx({ name: 'bowShot', x: 0, y: 42, z: 0, charge: 1 });
    const v = calls.filter((x) => x[0] === 'sound').map((x) => x[2]);
    expect(v[1]).toBeGreaterThan(v[0]);
  });
});

describe('createFx.mobHurt / mobKilled', () => {
  it('oyuncu kaynaklı vuruş: kıvılcım, haptik, tür sesi; kritik altın renk', () => {
    const { c, calls } = mkCtx();
    const f = createFx(c);
    f.mobHurt({
      mob: 'golge', x: 1, y: 42, z: -2, crit: true, source: 'melee',
    });
    const hs = calls.find((x) => x[0] === 'p.hitSpark');
    expect(hs[3]).toBe(0xffd23a);
    expect(hs[4]).toBe(14);
    expect(calls.some((x) => x[0] === 'haptic' && x[1] === 'medium')).toBe(true);
    expect(calls.some((x) => x[0] === 'sound' && x[1] === 'mob:golge:hurt')).toBe(true);
    calls.length = 0;
    f.mobHurt({
      mob: 'golge', x: 1, y: 42, z: -2, crit: false, source: 'env',
    });
    expect(calls.some((x) => x[0] === 'haptic')).toBe(false);
    calls.length = 0;
    f.mobHurt({
      mob: 'golge', x: 1, y: 42, z: -2, source: 'projectile',
    });
    expect(calls.some((x) => x[0] === 'sound' && x[1] === 'arrow_hit')).toBe(true);
  });

  it('mobKilled: xp varsa küre; minyon ve uzak atlanır; boss ağır haptik', () => {
    const { c, calls } = mkCtx();
    const f = createFx(c);
    f.mobKilled({
      x: 1, y: 41, z: 1, xp: 5, boss: false,
    });
    expect(calls.some((x) => x[0] === 'p.xpOrb')).toBe(true);
    calls.length = 0;
    f.mobKilled({
      x: 1, y: 41, z: 1, xp: 5, minion: true,
    });
    expect(calls).toHaveLength(0);
    f.mobKilled({
      x: 1, y: 41, z: 1, xp: 120, boss: true,
    });
    expect(calls.some((x) => x[0] === 'haptic' && x[1] === 'heavy')).toBe(true);
  });
});

describe('createBoss', () => {
  const bossInfo = {
    id: 9, boss: 'kokana', name: 'Kök Ana', hp: 300, maxHp: 400, phase: 1, exposed: false, invuln: false,
  };

  it('HUD boss nesnesi yazılır/temizlenir; getBossInfo özeti', () => {
    const k = mkCtx({ boss: bossInfo });
    const b = createBoss(k.G, { sound: k.c.sound, shake: k.c.shake, particles: k.c.particles });
    b.refresh(0.2);
    expect(k.G.hud.boss).toEqual({
      name: 'Kök Ana', hp: 300, maxHp: 400, phase: 1,
    });
    expect(b.engaged).toBe(true);
    expect(b.info()).toMatchObject({ key: 'kokana', hp: 300 });
    k.G.em.bossHud = () => null;
    b.refresh(0.2);
    expect(k.G.hud.boss).toBeNull();
    expect(b.engaged).toBe(false);
    expect(b.info()).toBeNull();
  });

  it('olaylar: engage/phase/finale/reset/defeated ses, sarsıntı, ekran okuyucu', () => {
    const k = mkCtx({ boss: bossInfo });
    const b = createBoss(k.G, { sound: k.c.sound, shake: k.c.shake, particles: k.c.particles });
    b.onEvent({ type: 'bossEngage', name: 'Kök Ana' });
    expect(k.calls.some((x) => x[0] === 'sound' && x[1] === 'boss_spawn')).toBe(true);
    expect(k.calls.some((x) => x[0] === 'speak' && /savaş başladı/.test(x[1]))).toBe(true);
    k.calls.length = 0;
    b.onEvent({
      type: 'bossPhase', boss: 'kokana', name: 'Kök Ana', phase: 2,
    });
    expect(k.calls.some((x) => x[0] === 'speak' && /son aşama/.test(x[1]))).toBe(true);
    expect(k.calls.some((x) => x[0] === 'sound' && x[1] === 'mob:kokana:attack')).toBe(true);
    k.calls.length = 0;
    b.onEvent({ type: 'bossFinale' });
    expect(k.calls.some((x) => x[0] === 'sound' && x[1] === 'portal')).toBe(true);
    k.calls.length = 0;
    b.onEvent({ type: 'bossReset' });
    expect(k.calls.some((x) => x[0] === 'speak' && /sıfırlandı/.test(x[1]))).toBe(true);
    k.G.player.dead = true;
    k.calls.length = 0;
    b.onEvent({ type: 'bossReset' });
    expect(k.calls.some((x) => x[0] === 'speak')).toBe(false);
    k.G.em.bossHud = () => null;
    k.calls.length = 0;
    b.onEvent({
      type: 'bossDefeated', boss: 'kokana', name: 'Kök Ana', x: 1, y: 41, z: 1,
    });
    expect(k.calls.some((x) => x[0] === 'p.levelUp')).toBe(true);
    expect(k.calls.some((x) => x[0] === 'sound' && x[1] === 'achievement')).toBe(true);
    expect(k.G.hud.boss).toBeNull();
  });
});

describe('ses adları', () => {
  it('sistemin çaldığı her ses adı audio tarifleriyle çözülür (tüm fx + olaylar + tür sesleri)', () => {
    const { c, calls } = mkCtx({
      infos: { 1: { key: 'golgehukumdar', boss: true, h: 4, deathColor: 1 } },
      boss: {
        id: 1, boss: 'golgehukumdar', name: 'G', hp: 1, maxHp: 2, phase: 0,
      },
    });
    const f = createFx(c);
    Object.keys(f.table).forEach((name) => {
      f.fx({
        name, x: 1, y: 41, z: 1, r: 3, id: 1, mob: 'golge', team: 'player', x1: 1, y1: 41, z1: -8, hit: 'block', charge: 1,
      });
      f.fx({
        name, x: 1, y: 41, z: 1, r: 3, id: 1, mob: 'golge', team: 'mob', x1: 1, y1: 41, z1: -8,
      });
    });
    MOB_KEYS.forEach((key) => {
      f.mobHurt({
        mob: key, x: 1, y: 41, z: 1, source: 'melee',
      });
      f.fx({
        name: 'mobDeath', x: 1, y: 41, z: 1, id: 1, mob: key,
      });
    });
    const b = createBoss(c.G, { sound: c.sound, shake: c.shake, particles: c.particles });
    ['bossEngage', 'bossPhase', 'bossFinale', 'bossReset', 'bossDefeated'].forEach((type) => b.onEvent({
      type, boss: 'kokana', name: 'K', phase: 1, x: 1, y: 41, z: 1,
    }));
    const used = new Set(calls.filter((x) => x[0] === 'sound').map((x) => x[1]));
    ['ui_error', 'ui_click', 'gun_empty', 'puzzle_wrong', 'hit', 'block', 'portal', 'step:çim', 'step:taş', 'pickup', 'die'].forEach((n) => used.add(n));
    MOB_KEYS.forEach((key) => ['idle', 'attack', 'hurt', 'die'].forEach((m) => { if (key !== 'kelebek' && key !== 'atesbocegi') used.add('mob:' + key + ':' + m); }));
    expect(used.size).toBeGreaterThan(20);
    const bad = [];
    // kelebek / ateş böceği sessizdir (ses ailesi yok): çözülmemesi beklenir, G.sound sessizce yok sayar
    used.forEach((n) => { if (!resolveSound(n) && !/kelebek|atesbocegi/.test(n)) bad.push(n); });
    expect(bad).toEqual([]);
  });
});

describe('büyü fx: fireImpact / iceImpact / büyü isabeti', () => {
  it('fireImpact: ateş patlaması, ses (spell:fire:impact çözülebilir) ve sarsıntı', () => {
    const { c, calls } = mkCtx();
    createFx(c).fx({ name: 'fireImpact', x: 3, y: 41, z: 2, r: 2.2 });
    const b = calls.find((x) => x[0] === 'p.fireBurst');
    expect(b).toBeTruthy();
    expect(b[2]).toBeCloseTo(2.2, 5);
    expect(calls.some((x) => x[0] === 'sound' && x[1] === 'spell:fire:impact')).toBe(true);
    expect(calls.some((x) => x[0] === 'shake')).toBe(true);
    expect(calls.some((x) => x[0] === 'flash')).toBe(false); // silindir flaşı yok: patlama parçacıklarla çizilir
    expect(resolveSound('spell:fire:impact')).toBeTruthy();
  });

  it('iceImpact: donma patlaması + cam sesi; buz mızrağı kıran ses çözülebilir', () => {
    const { c, calls } = mkCtx();
    createFx(c).fx({ name: 'iceImpact', x: 1, y: 41, z: 1, r: 1 });
    expect(calls.some((x) => x[0] === 'p.frostBurst')).toBe(true);
    expect(calls.some((x) => x[0] === 'sound' && x[1] === 'spell:ice:impact')).toBe(true);
    ['spell:fire:cast', 'spell:ice:cast', 'spell:heal:cast', 'spell:blink:cast', 'spell:blink:impact', 'enchant', 'potion_drink', 'brew_bubble', 'brew_done', 'mana_low']
      .forEach((n) => expect(resolveSound(n), n).toBeTruthy());
  });

  it('büyü isabeti (source magic) oyuncu kaynaklı sayılır: vuruş sesi + haptik', () => {
    const { c, calls } = mkCtx();
    createFx(c).mobHurt({ x: 1, y: 41, z: 1, source: 'magic', mob: 'golge', crit: false });
    expect(calls.some((x) => x[0] === 'sound' && x[1] === 'hit')).toBe(true);
    expect(calls.some((x) => x[0] === 'haptic')).toBe(true);
  });
});
