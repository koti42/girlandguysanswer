import { describe, expect, it } from 'vitest';
import { BOSS_KEYS, MOB_TYPES } from './mobTypes.js';
import { ABILITY_ITEMS } from './combat.js';
import { hazardHits } from './entitiesHazards.js';
import {
  makeEm, makePlayer, makeWorld, ofType, run,
} from './mobAITestKit.js';

const NIGHT = { dayFactor: 0 };

function arena(key, seed) {
  const kit = makeEm(makeWorld(), seed ? { seed } : undefined);
  const boss = kit.em.spawnBoss(key, 0.5, 1, 0.5);
  const p = makePlayer(9, 1, 0.5);
  return { ...kit, boss, p, def: MOB_TYPES[key] };
}

/** Çatışma başlat: kısa koştur (arena içinde oyuncu). */
function engage(a) {
  run(a.em, a.p, 0.1, NIGHT);
}

describe('Boss — devreye girme, arena, sıfırlama', () => {
  it.each(BOSS_KEYS)('%s: oyuncu arenaya girene kadar uyur; girince bossEngage + HUD', (key) => {
    const a = arena(key);
    a.p.x = 80;
    run(a.em, a.p, 3, NIGHT);
    expect(a.boss.state).toBe('idle');
    expect(ofType(a.events, 'bossEngage').length).toBe(0);
    expect(a.em.bossHud()).toBeNull();
    a.p.x = 9;
    run(a.em, a.p, 0.5, NIGHT);
    const e = ofType(a.events, 'bossEngage');
    expect(e.length).toBe(1);
    expect(e[0].boss).toBe(key);
    const hud = a.em.bossHud();
    expect(hud.name).toBe(a.def.name);
    expect(hud.hp).toBe(a.boss.maxHp);
    expect(hud.phase).toBe(0);
  });

  it.each(BOSS_KEYS)('%s: oyuncu ayrılırsa tamamen sıfırlanır (can, aşama, tehlikeler, yavrular)', (key) => {
    const a = arena(key);
    run(a.em, a.p, 20, NIGHT);
    a.boss.hp = a.boss.maxHp * 0.5;
    run(a.em, a.p, 5, NIGHT);
    expect(a.boss.phase).toBeGreaterThanOrEqual(1);
    a.p.x = 200;
    run(a.em, a.p, 11, NIGHT);
    expect(a.boss.hp).toBe(a.boss.maxHp);
    expect(a.boss.phase).toBe(0);
    expect(a.boss.fx.length).toBe(0);
    expect(a.em.minionCount(a.boss.id)).toBe(0);
    expect(ofType(a.events, 'bossReset').length).toBe(1);
    expect(a.em.bossHud()).toBeNull();
  });

  it.each(BOSS_KEYS)('%s: arena dışına çıkmaz (90 sn savaş)', (key) => {
    const a = arena(key);
    let maxD = 0;
    run(a.em, a.p, 90, NIGHT, (i) => {
      if (i === 60 * 30) a.boss.hp = a.boss.maxHp * 0.6;
      if (i === 60 * 60) a.boss.hp = a.boss.maxHp * 0.3;
      maxD = Math.max(maxD, Math.hypot(a.boss.x - 0.5, a.boss.z - 0.5));
    });
    expect(maxD).toBeLessThan(a.def.arenaRadius);
    expect(Number.isFinite(a.boss.x + a.boss.y + a.boss.z)).toBe(true);
  });
});

describe('Boss — aşamalar', () => {
  it.each(BOSS_KEYS)('%s: eşiklerde aşama geçişi, geçişte dokunulmaz', (key) => {
    const a = arena(key);
    engage(a);
    expect(a.boss.phase).toBe(0);
    a.boss.hp = a.boss.maxHp * 0.6;
    run(a.em, a.p, 0.1, NIGHT);
    expect(a.boss.phase).toBe(1);
    expect(a.boss.invuln).toBe(true);
    expect(a.boss.state).toBe('phaseshift');
    const r = a.em.damage(a.boss.id, 50, { kind: 'melee' });
    expect(r.blocked).toBe(true);
    run(a.em, a.p, 2, NIGHT);
    expect(a.boss.invuln).toBe(false);
    a.boss.hp = a.boss.maxHp * 0.3;
    run(a.em, a.p, 0.1, NIGHT);
    expect(a.boss.phase).toBe(2);
    const ph = ofType(a.events, 'bossPhase');
    expect(ph.map((e) => e.phase)).toEqual([1, 2]);
    expect(ph[0].hpRatio).toBeLessThanOrEqual(0.66);
    expect(a.em.bossHud().phase).toBe(2);
  });

  it('tek vuruşta %20 canına inse bile doğru aşamaya geçer', () => {
    const a = arena('tasbekci');
    engage(a);
    a.boss.hp = a.boss.maxHp * 0.2;
    run(a.em, a.p, 0.1, NIGHT);
    expect(a.boss.phase).toBe(2);
  });
});

describe('Boss — telegraf adaleti', () => {
  it.each(BOSS_KEYS)('%s: hasarlı her tehlike ≥ 0,6 sn önceden işaretlenir; ilk saniyede vuruş yok', (key) => {
    const a = arena(key);
    const seen = new Set();
    let minWind = 99;
    let firstHit = Infinity;
    run(a.em, a.p, 90, NIGHT, (i) => {
      if (i === 60 * 30) a.boss.hp = a.boss.maxHp * 0.6;
      if (i === 60 * 60) a.boss.hp = a.boss.maxHp * 0.3;
      for (let k = 0; k < a.em.hazards.length; k++) {
        const h = a.em.hazards[k];
        if (seen.has(h.id)) continue;
        seen.add(h.id);
        if (h.dmg > 1 && h.shape !== 'zone') minWind = Math.min(minWind, h.windup);
        if (h.windup > 0) expect(h.stage).toBe('windup');
      }
      if (firstHit === Infinity && a.events.some((e) => e.type === 'playerHit')) firstHit = i / 60;
    });
    expect(seen.size).toBeGreaterThan(5);
    expect(minWind).toBeGreaterThanOrEqual(0.6);
    expect(firstHit).toBeGreaterThan(1);
  });

  it('isabet geometrisi: halka zıplanarak aşılır; daire/çizgi/ışın', () => {
    const ring = {
      shape: 'ring', x: 0, y: 1, z: 0, r: 5, thick: 1.3, height: 0.9, dx: 0, dz: -1, len: 8, width: 1, effLen: 8,
    };
    const ground = { x: 5, y: 1, z: 0, w: 0.6, h: 1.8 };
    const air = { x: 5, y: 2.2, z: 0, w: 0.6, h: 1.8 };
    expect(hazardHits(ring, ground)).toBe(true);
    expect(hazardHits(ring, air)).toBe(false);
    expect(hazardHits({ ...ring, r: 2 }, ground)).toBe(false);
    const circle = { shape: 'circle', x: 0, y: 1, z: 0, r: 2, height: 2.2 };
    expect(hazardHits(circle, { x: 1.5, y: 1, z: 0, w: 0.6, h: 1.8 })).toBe(true);
    expect(hazardHits(circle, { x: 3, y: 1, z: 0, w: 0.6, h: 1.8 })).toBe(false);
    const line = {
      shape: 'line', x: 0, y: 1, z: 0, dx: 0, dz: -1, len: 8, width: 1.4, height: 1.6,
    };
    expect(hazardHits(line, { x: 0.3, y: 1, z: -4, w: 0.6, h: 1.8 })).toBe(true);
    expect(hazardHits(line, { x: 2, y: 1, z: -4, w: 0.6, h: 1.8 })).toBe(false);
    expect(hazardHits(line, { x: 0, y: 1, z: 3, w: 0.6, h: 1.8 })).toBe(false);
    const beam = { ...line, shape: 'beam', height: 0.9, effLen: 5 };
    expect(hazardHits(beam, { x: 0, y: 1, z: -4, w: 0.6, h: 1.8 })).toBe(true);
    expect(hazardHits(beam, { x: 0, y: 1, z: -7, w: 0.6, h: 1.8 })).toBe(false); // engelle kısalmış
    expect(hazardHits(beam, { x: 0, y: 2.05, z: -4, w: 0.6, h: 1.8 })).toBe(false); // zıplayarak aşıldı
  });

  it('şok halkası durağan oyuncuya çarpar (Taş Bekçi)', () => {
    const a = arena('tasbekci');
    engage(a);
    run(a.em, a.p, 40, NIGHT);
    expect(a.events.filter((e) => e.type === 'fx' && e.name === 'slam').length).toBeGreaterThan(0);
    expect(ofType(a.events, 'playerHit').filter((e) => e.cause === 'yaratık').length).toBeGreaterThan(0);
  });

  it('halkaya zamanında zıplayan hasar almaz (Taş Bekçi, 60 sn)', () => {
    const a = arena('tasbekci');
    engage(a);
    let ringsPassed = 0;
    run(a.em, a.p, 60, NIGHT, () => {
      let near = false;
      for (let i = 0; i < a.boss.fx.length; i++) {
        const h = a.boss.fx[i];
        if (h.shape !== 'ring') continue;
        const d = Math.hypot(a.p.x - h.x, a.p.z - h.z);
        const live = h.stage === 'active' || h.progress > 0.8;
        if (live && Math.abs(d - h.r) < 2.4) near = true;
        if (h.stage === 'active' && Math.abs(d - h.r) < 0.2) ringsPassed++;
      }
      a.p.y = near ? 2.3 : 1; // halka yaklaşırken havada ol
    });
    expect(ringsPassed).toBeGreaterThan(0);
    const ringHits = ofType(a.events, 'playerHit').filter((e) => e.rawDamage === MOB_TYPES.tasbekci.damage && e.kStrength === 7);
    expect(ringHits.length).toBe(0);
  });
});

describe('Kök Ana', () => {
  it('kökler, sarmaşık, spor + tomurcuk yavruları ve aşama 3 öfkesi', () => {
    const a = arena('kokana');
    const shapes = {};
    run(a.em, a.p, 100, NIGHT, (i) => {
      if (i === 60 * 20) a.boss.hp = a.boss.maxHp * 0.6;
      if (i === 60 * 55) a.boss.hp = a.boss.maxHp * 0.3;
      for (const h of a.boss.fx) shapes[h.shape] = true;
    });
    expect(shapes.circle).toBe(true);
    expect(shapes.line).toBe(true);
    expect(shapes.zone).toBe(true);
    expect(shapes.ring).toBe(true);
    const bulbs = [...a.em.mobs.values()].filter((e) => e.skin === 'tomurcuk');
    expect(bulbs.length).toBeGreaterThan(0);
    expect(bulbs.length).toBeLessThanOrEqual(3);
    expect(a.boss.enraged).toBe(true);
    expect(a.events.some((e) => e.type === 'fx' && e.name === 'root')).toBe(true);
    expect(a.events.some((e) => e.type === 'fx' && e.name === 'vine')).toBe(true);
  });

  it('kök patlamaları ritimli: aynı saldırının daireleri artan windup ile gelir', () => {
    const a = arena('kokana');
    engage(a);
    let wind = null;
    run(a.em, a.p, 30, NIGHT, () => {
      const cs = a.boss.fx.filter((h) => h.shape === 'circle' && h.cue === 'root');
      if (cs.length >= 3 && !wind) wind = cs.map((h) => h.windup).sort((x, y) => x - y);
    });
    expect(wind).not.toBeNull();
    expect(wind[1]).toBeGreaterThan(wind[0]);
    expect(wind[2]).toBeGreaterThan(wind[1]);
  });
});

describe('Taş Bekçi', () => {
  it('zırhlıyken hasar ×0,45; rünler yanarken ×2,5', () => {
    const a = arena('tasbekci');
    engage(a);
    const hp0 = a.boss.hp;
    a.em.damage(a.boss.id, 10, { kind: 'melee' });
    expect(hp0 - a.boss.hp).toBeCloseTo(4.5, 5);
    a.boss.exposed = true;
    const hp1 = a.boss.hp;
    a.em.damage(a.boss.id, 10, { kind: 'melee' });
    expect(hp1 - a.boss.hp).toBeCloseTo(25, 5);
  });

  it('şok/ezme sonrası pencere açılır: durum exposed + rün işareti + fx olayı', () => {
    const a = arena('tasbekci');
    let sawExposed = false;
    let rune = false;
    run(a.em, a.p, 40, NIGHT, () => {
      if (a.boss.state === 'exposed') {
        sawExposed = a.boss.exposed && a.boss.weak;
        if (a.boss.fx.some((h) => h.shape === 'rune')) rune = true;
      }
    });
    expect(sawExposed).toBe(true);
    expect(rune).toBe(true);
    expect(a.events.some((e) => e.name === 'runes')).toBe(true);
  });

  it('kaya fırlatma: iniş noktası işaretli, alan hasarı', () => {
    const a = arena('tasbekci');
    let rock = null;
    let markerAtLanding = false;
    run(a.em, a.p, 80, NIGHT, () => {
      const r = a.em.projectiles.find((q) => q.kind === 'kaya');
      if (r && !rock) {
        rock = { ...r };
        markerAtLanding = a.boss.fx.some((h) => h.shape === 'circle' && h.dmg === 0 && h.windup > 0.9);
      }
    });
    expect(rock).not.toBeNull();
    expect(rock.aoe.r).toBeGreaterThan(2);
    expect(rock.g).toBe(22);
    expect(markerAtLanding).toBe(true);
    expect(a.events.some((e) => e.name === 'rockImpact')).toBe(true);
  });
});

describe('Buz Kral', () => {
  it('mızrak yağmuru: hızlı düz mızraklar, yavaşlatır, fx olayı', () => {
    const a = arena('buzkral');
    let spear = null;
    run(a.em, a.p, 60, NIGHT, () => {
      const s = a.em.projectiles.find((q) => q.kind === 'mizrak');
      if (s && !spear) spear = { ...s };
    });
    expect(spear).not.toBeNull();
    expect(Math.hypot(spear.vx, spear.vz)).toBeCloseTo(20, 3);
    expect(spear.vy).toBe(0);
    expect(spear.effect).toMatchObject({ kind: 'slow' });
    expect(ofType(a.events, 'fx').some((e) => e.name === 'spear')).toBe(true);
  });

  it('zıplama-ezme: boss havalanır, iniş sonrası don bölgesi', () => {
    const a = arena('buzkral');
    let maxY = 0;
    let frost = false;
    run(a.em, a.p, 120, NIGHT, (i) => {
      if (i === 60 * 5) a.boss.hp = a.boss.maxHp * 0.6;
      maxY = Math.max(maxY, a.boss.y);
      if (a.boss.fx.some((h) => h.shape === 'zone' && h.effect && h.effect.kind === 'slow')) frost = true;
    });
    expect(maxY).toBeGreaterThan(2);
    expect(frost).toBe(true);
    expect(a.events.some((e) => e.name === 'slam')).toBe(true);
  });
});

describe('Gölge Hükümdar', () => {
  it('ışınlanma: varış işaretli, kaybolur (dokunulmaz) ve başka yerde belirir', () => {
    const a = arena('golgehukumdar');
    let jumped = 0;
    let hiddenFrames = 0;
    let hiddenDamageBlocked = false;
    let last = { x: a.boss.x, z: a.boss.z };
    run(a.em, a.p, 120, NIGHT, (i) => {
      if (i === 60 * 5) a.boss.hp = a.boss.maxHp * 0.6;
      if (Math.hypot(a.boss.x - last.x, a.boss.z - last.z) > 4) jumped++;
      last = { x: a.boss.x, z: a.boss.z };
      if (a.boss.hidden) {
        hiddenFrames++;
        const r = a.em.damage(a.boss.id, 5, { kind: 'melee' });
        if (r && r.blocked) hiddenDamageBlocked = true;
      }
    });
    expect(a.events.filter((e) => e.name === 'teleport').length).toBeGreaterThanOrEqual(2);
    expect(jumped).toBeGreaterThan(0);
    expect(hiddenFrames).toBeGreaterThan(0);
    expect(hiddenDamageBlocked).toBe(true);
  });

  it('gölge klonlar: saydam, tek vuruşta dağılır, ganimet/xp yok; gerçek olan etkilenmez', () => {
    const a = arena('golgehukumdar');
    engage(a);
    a.boss.hp = a.boss.maxHp * 0.6;
    let clones = [];
    for (let i = 0; i < 60 * 80 && clones.length === 0; i++) {
      a.em.update(1 / 60, a.p, NIGHT);
      clones = [...a.em.mobs.values()].filter((e) => e.clone);
    }
    expect(clones.length).toBeGreaterThanOrEqual(2);
    const c = clones[0];
    expect(c.ghost).toBe(true);
    expect(c.maxHp).toBe(1);
    expect(c.key).toBe('golgehukumdar');
    const hpBoss = a.boss.hp;
    const itemsBefore = a.em.items.size;
    const r = a.em.damage(c.id, 1, { kind: 'melee' });
    expect(r.killed).toBe(true);
    expect(a.boss.hp).toBe(hpBoss);
    expect(a.em.items.size).toBe(itemsBefore);
    const k = ofType(a.events, 'mobKilled').filter((e) => e.id === c.id)[0];
    expect(k.minion).toBe(true);
    expect(ofType(a.events, 'bossDefeated').length).toBe(0);
  });

  it('finale portal kuralı: portalın içindeyken dokunulmaz, yalnızca çıkış anında hasar alır', () => {
    const a = arena('golgehukumdar');
    engage(a);
    a.boss.hp = a.boss.maxHp * 0.2; // aşama 3 + finale
    run(a.em, a.p, 2.7, NIGHT);
    expect(ofType(a.events, 'bossFinale').length).toBe(1);
    expect(ofType(a.events, 'bossFinale')[0].portals.length).toBe(2);
    expect(a.boss.hidden).toBe(true);
    expect(a.em.damage(a.boss.id, 20, { kind: 'melee' }).blocked).toBe(true);
    expect(a.boss.fx.filter((h) => h.shape === 'portal').length).toBe(2);
    let emerged = false;
    run(a.em, a.p, 8, NIGHT, () => {
      if (!emerged && a.boss.exposed && !a.boss.hidden) {
        emerged = true;
        const hp = a.boss.hp;
        const r = a.em.damage(a.boss.id, 10, { kind: 'melee' });
        expect(r.blocked).toBe(false);
        expect(hp - a.boss.hp).toBeCloseTo(16, 5);
      }
    });
    expect(emerged).toBe(true);
    expect(a.em.minionCount(a.boss.id)).toBeGreaterThan(0);
    expect(Math.hypot(a.boss.x - 0.5, a.boss.z - 0.5)).toBeGreaterThan(5);
  });
});

describe('Boss — ölüm, ganimet, bossDefeated', () => {
  it.each(BOSS_KEYS)('%s: bossDefeated olayı ganimet + yetenek + bölge ile; yavrular silinir', (key) => {
    const a = arena(key);
    run(a.em, a.p, 45, NIGHT, (i) => {
      if (i === 60 * 25) a.boss.hp = a.boss.maxHp * 0.6;
    });
    a.boss.invuln = false;
    a.boss.hidden = false;
    a.boss.exposed = true;
    a.em.damage(a.boss.id, 99999, { kind: 'melee' });
    const d = ofType(a.events, 'bossDefeated');
    expect(d.length).toBe(1);
    expect(d[0].boss).toBe(key);
    expect(d[0].zone).toBe(a.def.zone);
    expect(d[0].ability).toBe(a.def.ability);
    expect(d[0].loot.some((l) => l.item === ABILITY_ITEMS[a.def.ability])).toBe(true);
    expect(d[0].xp).toBe(a.def.xp);
    expect(a.em.items.size).toBeGreaterThan(0);
    expect(a.boss.dead).toBe(true);
    expect(a.boss.fx.length).toBe(0);
    run(a.em, a.p, 1.6, NIGHT);
    expect(a.em.minionCount(a.boss.id)).toBe(0);
    expect(a.em.mobs.has(a.boss.id)).toBe(false);
    expect(a.em.bossHud()).toBeNull();
  });
});

describe('Boss — belirlenimcilik', () => {
  it.each(BOSS_KEYS)('%s: aynı tohum → aynı savaş', (key) => {
    const outs = [];
    for (let n = 0; n < 2; n++) {
      const a = arena(key, 42);
      run(a.em, a.p, 40, NIGHT, (i) => {
        if (i === 60 * 15) a.boss.hp = a.boss.maxHp * 0.6;
      });
      outs.push(JSON.stringify([
        a.events.map((e) => e.type + (e.name || '')).join(','),
        a.boss.x.toFixed(3), a.boss.z.toFixed(3), a.boss.hp, a.em.hazards.length, a.em.mobs.size,
      ]));
    }
    expect(outs[0]).toBe(outs[1]);
  });
});
