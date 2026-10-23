/*
 * KEŞİF — sim nesnelerinin kurulumu (G.inventory, survival, body, clock, weatherSim, progression, puzzles, em, spawner, combat).
 *
 *   createProgressionFor(seed, mode, opts) → Progression
 *   buildSim(G, info) → G'ye yazar:  info = {world, spawn, phase, frozenClock, seed, mode}
 *
 * Çekirdek bu nesneleri KURAR; güncellemeyi (em/spawner/puzzles) sistemler yapar (bkz. gameCtx.js üst yorumu).
 * Modlar: macera → boş envanter, normal hayatta kalma; insa → sınırsız envanter (creativeInventory), hasarsız;
 * harita → boş envanter, hasarsız, uçmasız (blok kırma/yerleştirme sistemlerce kapatılır).
 */
import { Inventory, creativeInventory } from './sim/inventory.js';
import { createSurvival, setArmor } from './sim/survival.js';
import { createPlayerBody } from './sim/physics.js';
import { createClock, createWeather } from './sim/daynight.js';
import { Progression } from './sim/progression.js';
import { PuzzleManager } from './sim/puzzles/index.js';
import { EntityManager } from './sim/entities.js';
import { Spawner } from './sim/spawner.js';
import { createCombatState } from './sim/combat.js';

export function createProgressionFor(seed, mode, opts) {
  const o = opts || {};
  const p = new Progression(seed, { mode, difficulty: o.difficulty });
  return p;
}

export function buildSim(G, info) {
  const mode = info.mode;
  const easyOpt = !!(G.settings && G.settings.easy);
  G.inventory = mode === 'insa' ? creativeInventory() : new Inventory();
  G.survival = createSurvival({ easy: easyOpt || mode === 'harita' });
  setArmor(G.survival, G.inventory.armorDefense());
  G.body = createPlayerBody(info.spawn.x, info.spawn.y, info.spawn.z);
  G.body.eyeH = 1.62;
  G.spawn = { x: info.spawn.x, y: info.spawn.y, z: info.spawn.z };
  G.clock = createClock({ startPhase: info.phase, frozen: !!info.frozenClock });
  G.weatherSim = createWeather(info.seed);
  G.progression = info.progression;
  G.combat = createCombatState();
  G.em = new EntityManager({
    seed: info.seed,
    world: G.world,
    emit: (e) => G.emit(e),
    difficulty: easyOpt || mode === 'harita' ? 'easy' : 'normal',
    // yetenek eşyasını bossDefeated → progression.giveItems veriyor; ganimete ikinci kez koyma (çift eşya)
    abilityLoot: !(info.progression && info.progression.active),
  });
  G.spawner = new Spawner({ seed: info.seed, world: G.world, em: G.em });
  G.puzzles = new PuzzleManager({
    world: G.world,
    seed: info.seed,
    emit: (e) => G.emit(e),
    spawnEntity: (type, x, y, z, o) => (G.em ? G.em.spawn(type, x, y, z, o) : null),
  });
  return G;
}
