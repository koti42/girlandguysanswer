import { beforeAll, describe, expect, it } from 'vitest';
import { makeTestG } from './sessionTestKit.js';
import {
  COMMAND_NAMES, commandsEnabled, coord, parseCommandLine, runCommand, tokenize,
} from './sessionCommands.js';
import { createSaver } from './sessionSave.js';
import { B } from '../sim/blocks.js';
import { applyDamage } from '../sim/survival.js';
import { ZONE_COUNT } from '../sim/constants.js';

function insaG() {
  const G = makeTestG({ mode: 'insa', base: 'düz' });
  G.worldReady = true;
  G.debug = true;
  for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) G.world.ensureChunk(cx, cz);
  G.body.x = 64.5; G.body.y = 60; G.body.z = 64.5;
  return G;
}

describe('ayrıştırma', () => {
  it('tokenize: tırnaklar tek parça', () => {
    expect(tokenize('give "taş blok" 5')).toEqual(['give', 'taş blok', '5']);
    expect(tokenize("  a   'b c' d ")).toEqual(['a', 'b c', 'd']);
    expect(tokenize('')).toEqual([]);
  });

  it('parseCommandLine', () => {
    expect(parseCommandLine('tp 10 70 -5')).toEqual({ name: 'tp', args: ['10', '70', '-5'] });
    expect(parseCommandLine('/GIVE item:elma 3')).toEqual({ name: 'give', args: ['item:elma', '3'] });
    expect(parseCommandLine('   ')).toBe(null);
    expect(parseCommandLine(5)).toBe(null);
  });

  it('coord: göreli ve mutlak', () => {
    expect(coord('~', 10)).toBe(10);
    expect(coord('~5', 10)).toBe(15);
    expect(coord('~-2.5', 10)).toBe(7.5);
    expect(coord('3', 10)).toBe(3);
    expect(Number.isNaN(coord('~x', 1))).toBe(true);
    expect(Number.isNaN(coord('abc', 1))).toBe(true);
    expect(Number.isNaN(coord(undefined, 1))).toBe(true);
  });
});

describe('etkinleştirme', () => {
  it('üretimde (debug yok, DEV değil) hiçbir şey yapmaz', () => {
    const G = insaG();
    G.debug = false;
    G.opts.debug = false;
    expect(commandsEnabled(G, { DEV: false })).toBe(false);
    const before = G.inventory.toJSON();
    const r = runCommand(G, 'give', ['blok:taş', '5'], { env: { DEV: false } });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/kapalı/);
    expect(G.inventory.toJSON()).toEqual(before);
  });

  it('?debug=1 / opts.debug / DEV ile açık', () => {
    const G = insaG();
    G.debug = false;
    G.opts.debug = false;
    expect(commandsEnabled(G, { DEV: true })).toBe(true);
    G.opts.debug = true;
    expect(commandsEnabled(G, { DEV: false })).toBe(true);
    G.opts.debug = false;
    G.debug = true;
    expect(commandsEnabled(G, { DEV: false })).toBe(true);
  });

  it('bilinmeyen komut, geçersiz ad ve metin satırı', () => {
    const G = insaG();
    expect(runCommand(G, 'yok', []).ok).toBe(false);
    expect(runCommand(G, 42, []).ok).toBe(false);
    expect(runCommand(G, '__proto__', []).ok).toBe(false);
    expect(runCommand(G, 'constructor', []).ok).toBe(false);
    expect(runCommand(G, 'help').ok).toBe(true);
    expect(runCommand(G, 'heal now please').ok).toBe(true); // tek metin satırı → ayrıştırılır
    COMMAND_NAMES.forEach((k) => expect(typeof k).toBe('string'));
  });
});

describe('komutlar (inşa)', () => {
  it('tp: mutlak, göreli, spawn; geçersiz', () => {
    const G = insaG();
    const r = runCommand(G, 'tp', ['40', '80', '40']);
    expect(r.ok).toBe(true);
    expect(G.body.x).toBeCloseTo(40, 1);
    expect(G.body.y).toBeCloseTo(80, 1);
    expect(runCommand(G, 'tp', ['~2', '~', '~']).ok).toBe(true);
    expect(G.body.x).toBeCloseTo(42, 1);
    expect(runCommand(G, 'tp', ['spawn']).ok).toBe(true);
    expect(G.body.x).toBeCloseTo(G.spawn.x, 1);
    expect(runCommand(G, 'tp', ['abc', '1', '2']).ok).toBe(false);
    expect(runCommand(G, 'tp', []).ok).toBe(false);
    expect(runCommand(G, 'tp', ['50', '50']).ok).toBe(true); // x z → yüzeye
    expect(G.body.y).toBeGreaterThan(30);
    expect(runCommand(G, 'tp', ['9999', '9999']).ok).toBe(false); // sınır dışı
    expect(runCommand(G, 'tp', ['zone', '9']).ok).toBe(false);
  });

  it('give: anahtar, takma ad, blok anahtarı, ad; adet sınırı; hatalar', () => {
    const G = insaG();
    G.inventory.clear();
    G.inventory.infinite = false;
    expect(runCommand(G, 'give', ['item:elma', '3']).ok).toBe(true);
    expect(G.inventory.count('item:elma')).toBe(3);
    expect(runCommand(G, 'give', ['blok:taş']).ok).toBe(true);
    expect(G.inventory.count('blok:taş')).toBe(1);
    expect(runCommand(G, 'give', ['taş', '4']).ok).toBe(true);
    expect(G.inventory.count('blok:taş')).toBe(5);
    expect(runCommand(G, 'give', ['kazma_demir']).ok).toBe(true);
    expect(runCommand(G, 'give', ['olmayan_esya']).ok).toBe(false);
    expect(runCommand(G, 'give', []).ok).toBe(false);
    const r = runCommand(G, 'give', ['blok:taş', '999999']);
    expect(r.ok).toBe(true);
    expect(r.data.given).toBeLessThanOrEqual(2304);
  });

  it('time / weather / godmode / fly / heal', () => {
    const G = insaG();
    expect(runCommand(G, 'time', ['gece']).ok).toBe(true);
    expect(G.clock.time / G.clock.dayLengthSec).toBeCloseTo(0.75, 2);
    expect(runCommand(G, 'time', ['0.1']).ok).toBe(true);
    expect(runCommand(G, 'time', ['freeze']).ok).toBe(true);
    expect(G.clock.frozen).toBe(true);
    expect(runCommand(G, 'time', ['unfreeze']).ok).toBe(true);
    expect(G.clock.frozen).toBe(false);
    expect(runCommand(G, 'time', ['saçma']).ok).toBe(false);
    expect(runCommand(G, 'weather', ['rain']).ok).toBe(true);
    expect(G._weatherForce.kind).toBe('rain');
    expect(runCommand(G, 'weather', ['storm']).ok).toBe(true);
    expect(G._weatherForce.intensity).toBeGreaterThan(0.9);
    expect(runCommand(G, 'weather', ['auto']).ok).toBe(true);
    expect(G._weatherForce).toBe(null);
    expect(runCommand(G, 'weather', ['dolu']).ok).toBe(false);

    G.survival.hp = 3;
    G.survival.hunger = 2;
    expect(runCommand(G, 'heal').ok).toBe(true);
    expect(G.survival.hp).toBe(G.survival.maxHp);
    expect(G.survival.hunger).toBe(G.survival.maxHunger);
    expect(runCommand(G, 'godmode', ['on']).data.on).toBe(true);
    expect(G.cheats.god).toBe(true);
    expect(runCommand(G, 'godmode').data.on).toBe(false);
    expect(runCommand(G, 'fly', ['on']).ok).toBe(true);
    expect(G.body.flying).toBe(true);
    expect(runCommand(G, 'fly', ['off']).ok).toBe(true);
    expect(G.body.flying).toBe(false);
  });

  it('setblock: mutlak/göreli, blok anahtarı, id, hava; hatalar', () => {
    const G = insaG();
    expect(runCommand(G, 'setblock', ['70', '70', '70', 'taş']).ok).toBe(true);
    expect(G.world.getBlock(70, 70, 70)).toBe(B.STONE);
    expect(runCommand(G, 'setblock', ['70', '70', '70', 'hava']).ok).toBe(true);
    expect(G.world.getBlock(70, 70, 70)).toBe(0);
    expect(runCommand(G, 'setblock', ['70', '70', '70', '5']).ok).toBe(true);
    expect(G.world.getBlock(70, 70, 70)).toBe(5);
    expect(runCommand(G, 'setblock', ['~', '~3', '~', 'blok:taş']).ok).toBe(true);
    expect(runCommand(G, 'setblock', ['70', '70', '70', 'yokblok']).ok).toBe(false);
    expect(runCommand(G, 'setblock', ['70', '70']).ok).toBe(false);
    expect(runCommand(G, 'setblock', ['70', '70', '70', '500']).ok).toBe(false);
    expect(runCommand(G, 'setblock', ['70', '70', '70', '5']).ok).toBe(false); // aynı değer
  });

  it('spawnmob: tür çözümü, adet sınırı, bilinmeyen tür', () => {
    const G = insaG();
    const r = runCommand(G, 'spawnmob', ['tavuk', '2']);
    expect(r.ok).toBe(true);
    expect(G.em.mobs.size).toBeGreaterThanOrEqual(1);
    expect(runCommand(G, 'spawnmob', ['ejderha']).ok).toBe(false);
    expect(runCommand(G, 'spawnmob', []).ok).toBe(false);
  });

  it('seed / stats / save / reveal / ability hataları', () => {
    const G = insaG();
    const s = runCommand(G, 'seed');
    expect(s.ok).toBe(true);
    expect(s.data.worldCode).toBe(G.worldCode);
    const st = runCommand(G, 'stats', [], { saver: createSaver(G) });
    expect(st.ok).toBe(true);
    expect(st.data.mode).toBe('insa');
    G.callbacks.onSave = () => {};
    const saver = createSaver(G);
    const sv = runCommand(G, 'save', [], { saver });
    expect(sv.ok).toBe(true);
    expect(runCommand(G, 'save', []).ok).toBe(false); // saver yok
    expect(runCommand(G, 'ability', ['uçmak']).ok).toBe(false);
    expect(runCommand(G, 'unlockzone', []).ok).toBe(false); // macera değil
    expect(runCommand(G, 'crystal', []).ok).toBe(false);
  });

  it('args nesne/metin biçimleri', () => {
    const G = insaG();
    expect(runCommand(G, 'give', 'item:elma 2').ok).toBe(true);
    expect(runCommand(G, 'give', { args: ['item:elma', 2] }).ok).toBe(true);
    expect(runCommand(G, 'time', 'gün batımı').ok).toBe(true);
    expect(runCommand(G, 'give', 5).ok).toBe(false);
  });
});

describe('komutlar (macera)', () => {
  let G;
  beforeAll(() => {
    G = makeTestG({ mode: 'macera', seed: 'KOMUT001' });
    G.worldReady = true;
    G.debug = true;
    G.hud.zone.id = 0;
  }, 120000);

  it('unlockzone gerçek ilerleme hattıyla bölge açar ve zoneUnlocked yayar', () => {
    const seen = [];
    G.addSystem({ name: 'dinleyici', onEvent: (_g, e) => { if (e.type === 'zoneUnlocked' || e.type === 'sealComplete') seen.push(e.type + ':' + e.zone); } });
    expect(G.progression.zonesUnlocked[1]).toBe(false);
    const r = runCommand(G, 'unlockzone', ['1']);
    expect(r.ok).toBe(true);
    expect(G.progression.zonesUnlocked[1]).toBe(true);
    expect(G.world.isZoneUnlocked(1)).toBe(true);
    expect(seen).toContain('zoneUnlocked:1');
    // varsayılan: sıradaki
    const r2 = runCommand(G, 'unlockzone', []);
    expect(r2.ok).toBe(true);
    expect(G.progression.zonesUnlocked[2]).toBe(true);
    runCommand(G, 'unlockzone', ['4']);
    for (let i = 1; i < ZONE_COUNT; i++) expect(G.progression.zonesUnlocked[i]).toBe(true);
    expect(runCommand(G, 'unlockzone', []).message).toMatch(/açık/);
    expect(runCommand(G, 'unlockzone', ['9']).ok).toBe(false);
  });

  it('ability: tek ve hepsi; progression ve G.abilities güncellenir', () => {
    expect(runCommand(G, 'ability', ['grapple']).ok).toBe(true);
    expect(G.progression.abilities.grapple).toBe(true);
    expect(G.abilities.grapple).toBe(true);
    expect(runCommand(G, 'ability', ['all']).ok).toBe(true);
    expect(G.progression.abilities.portalGun).toBe(true);
    expect(runCommand(G, 'ability', ['yok']).ok).toBe(false);
  });

  it('crystal: olay yayar, sayaç artar', () => {
    const before = G.progression.crystals[1].length;
    const r = runCommand(G, 'crystal', ['1', '2']);
    expect(r.ok).toBe(true);
    expect(G.progression.crystals[1].length).toBeGreaterThanOrEqual(before);
    expect(runCommand(G, 'crystal', ['99']).ok).toBe(false);
  });

  it('tp zone: kilitli bölgeye gitmez, açıksa gider', () => {
    const H = makeTestG({ mode: 'macera', seed: 'KOMUT002' });
    H.worldReady = true;
    H.debug = true;
    expect(runCommand(H, 'tp', ['zone', '1']).ok).toBe(false);
    runCommand(H, 'unlockzone', ['1']);
    const r = runCommand(H, 'tp', ['zone', '1']);
    expect(r.ok).toBe(true);
    expect(Math.hypot(H.body.x, H.body.z)).toBeGreaterThan(96);
  });

  it('reveal harita hücresi açar; solvepuzzle bulmaca yoksa hata', () => {
    const r = runCommand(G, 'reveal', ['64']);
    expect(r.ok).toBe(true);
    expect(runCommand(G, 'solvepuzzle', ['nearest']).ok).toBe(false);
    expect(runCommand(G, 'solvepuzzle', ['yok:1']).ok).toBe(false);
  });

  it('solvepuzzle: kayıtlı bulmacayı çözülmüş işaretler ve olay yayar', () => {
    const solved = [];
    G.addSystem({ name: 'bulmaca-dinleyici', onEvent: (_g, e) => { if (e.type === 'puzzleSolved') solved.push(e.id); } });
    const bx = Math.floor(G.body.x);
    const bz = Math.floor(G.body.z);
    const reg = G.puzzles.register('test:p1', {
      type: 'basincplakasi', origin: { x: bx + 6, y: Math.floor(G.body.y), z: bz + 6 }, facing: 0, difficulty: 1, zone: 0,
    });
    expect(reg).not.toBe(null);
    const r = runCommand(G, 'solvepuzzle', ['nearest']);
    expect(r.ok).toBe(true);
    expect(G.puzzles.isSolved('test:p1')).toBe(true);
    expect(solved).toContain('test:p1');
    expect(runCommand(G, 'solvepuzzle', ['test:p1']).message).toMatch(/Zaten/);
  });

  it('godmode: hasarsız kalır (invuln korunur)', () => {
    runCommand(G, 'godmode', ['on']);
    expect(G.survival.invuln).toBeGreaterThanOrEqual(1);
    expect(G.survival.hp).toBe(G.survival.maxHp);
    // 400 blokluk derin şaft düşüşü bile ölümsüzde ölüm üretmez
    expect(applyDamage(G.survival, 400, { type: 'düşme' })).toBe(0);
    expect(G.survival.dead).toBe(false);
    runCommand(G, 'godmode', ['off']);
    G.survival.lastDamage = 0;
  });

  it('fly (macera): G.abilities.fly erişimcisi çekirdeğin üzerine yazmasına dayanır', () => {
    runCommand(G, 'fly', ['on']);
    expect(G.abilities.fly).toBe(true);
    G.abilities.fly = false; // çekirdek her adımda bunu yapar
    expect(G.abilities.fly).toBe(true);
    expect(G.body.flying).toBe(true);
    runCommand(G, 'fly', ['off']);
    expect(G.abilities.fly).toBe(false);
  });
});

describe('mana komutu (büyü)', () => {
  it('mana n ayarlar ve sınırlar; full doldurur; büyü sistemi yoksa hata', () => {
    const G = insaG();
    expect(runCommand(G, 'mana', ['10']).ok).toBe(false);
    G.magic = { state: { mana: 5, maxMana: 120, cooldowns: { ates_topu: 2 } } };
    expect(runCommand(G, 'mana', ['40']).ok).toBe(true);
    expect(G.magic.state.mana).toBe(40);
    expect(G.magic.state.cooldowns).toEqual({});
    runCommand(G, 'mana', ['9999']);
    expect(G.magic.state.mana).toBe(120);
    runCommand(G, 'mana', ['-5']);
    expect(G.magic.state.mana).toBe(0);
    runCommand(G, 'mana', ['full']);
    expect(G.magic.state.mana).toBe(120);
    runCommand(G, 'mana');
    expect(G.magic.state.mana).toBe(120);
    const r = runCommand(G, 'mana', ['abc']);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Kullanım/);
    expect(COMMAND_NAMES).toContain('mana');
  });
});
