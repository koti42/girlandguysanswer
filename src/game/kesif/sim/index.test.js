import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as sim from './index.js';
import * as constants from './constants.js';
import * as rng from './rng.js';
import * as noise from './noise.js';
import * as blocks from './blocks.js';
import * as items from './items.js';
import * as inventory from './inventory.js';
import * as mapFormat from './mapFormat.js';
import * as chunk from './chunk.js';
import * as world from './world.js';
import * as lighting from './lighting.js';
import * as worldgen from './worldgen.js';
import * as physics from './physics.js';
import * as raycast from './raycast.js';
import * as survival from './survival.js';
import * as daynight from './daynight.js';
import * as mobTypes from './mobTypes.js';
import * as structures from './structures.js';
import * as parkour from './parkour.js';
import * as loot from './loot.js';
import * as puzzles from './puzzles/index.js';
import * as entities from './entities.js';
import * as mobAI from './mobAI.js';
import * as combat from './combat.js';
import * as spawner from './spawner.js';
import * as progression from './progression.js';
import * as quests from './quests.js';
import * as achievements from './achievements.js';
import * as save from './save.js';
import * as saveMapIO from './saveMapIO.js';
import * as saveStorage from './saveStorage.js';
import * as saveEdits from './saveEdits.js';
import * as saveEnvelope from './saveEnvelope.js';

describe('index.js toplu dışa aktarım', () => {
  it('her modülün tüm adları yeniden dışa aktarılır, çakışma yok', () => {
    const mods = [constants, rng, noise, blocks, items, inventory, mapFormat, chunk, world, lighting, worldgen, physics,
      raycast, survival, daynight, mobTypes, structures, parkour, loot, puzzles, entities, mobAI, combat, spawner,
      progression, quests, achievements, save, saveMapIO, saveStorage, saveEdits, saveEnvelope];
    // bilinen çakışmalar (index.js belgesi): değerce aynı ya da yeniden adlandırılmış
    const known = new Set(['BOSS_KEYS', 'SAVE_VERSION', 'DIFFICULTIES']);
    const seen = new Map();
    for (const m of mods) {
      for (const k of Object.keys(m)) {
        if (known.has(k)) continue;
        expect(seen.has(k), 'çakışan dışa aktarım: ' + k).toBe(false);
        seen.set(k, m[k]);
        expect(sim[k], k).toBe(m[k]);
      }
    }
    expect(sim.BOSS_KEYS).toBe(constants.BOSS_KEYS);
    expect(sim.SAVE_VERSION).toBe(constants.SAVE_VERSION);
    expect(sim.COMBAT_DIFFICULTIES).toBe(combat.DIFFICULTIES);
    expect(sim.PROGRESSION_DIFFICULTIES).toBe(progression.DIFFICULTIES);
    ['COMBAT_DIFFICULTIES', 'PROGRESSION_DIFFICULTIES', 'mobTypesModule', 'combatModule', 'progressionModule', 'saveModule']
      .forEach((k) => expect(sim[k], k).toBeDefined());
  });

  it('sözleşmedeki adlar mevcut', () => {
    const need = [
      'CHUNK_SIZE', 'WORLD_H', 'SEA_LEVEL', 'MAX_BLOCK_ID', 'BUILDABLE_MAX', 'SAVE_VERSION', 'MAP_LIMITS',
      'TICK_RATE', 'ZONES', 'zoneAt', 'zoneIndexAt', 'distanceToZoneBoundary', 'mulberry32', 'hash32', 'hash2',
      'hash3', 'seededRandom', 'stringSeedToInt', 'makeWorldCode', 'parseWorldCode', 'createNoise', 'BLOCKS', 'B',
      'getBlock', 'isSolid', 'isOpaque', 'isLiquid', 'blockByKey', 'BUILDABLE_IDS', 'breakTime', 'TILE_NAMES',
      'TILE_COUNT', 'resolveDrops', 'ITEMS', 'RECIPES', 'itemByKey', 'blockItemKey', 'itemToBlockId',
      'recipesFor', 'canCraft', 'toolSpeed', 'Inventory', 'creativeInventory', 'encodeRle', 'decodeRle',
      'encodeChunk', 'decodeChunk', 'validateMap', 'RULES', 'buildMap',
      'Chunk', 'World', 'generateChunk', 'stepPlayer', 'createSurvival', 'computeSky', 'EntityManager', 'Spawner',
      'Progression', 'serializeGame', 'PuzzleManager', 'warmStructures', 'raycastBlocks', 'MOB_TYPES', 'importMap', 'buildInsaMap',
      'MAP_BASE_SEED', 'saveToSlot', 'encodeEdits', 'buildCloudEnvelope',
    ];
    need.forEach((k) => expect(sim[k], k).toBeDefined());
  });

  it('sim kuralları: yasaklı API ve bağımlılık yok (kaynak taraması)', () => {
    const files = [
      'constants', 'rng', 'noise', 'blocks', 'items', 'inventory', 'mapFormat', 'index',
    ];
    const banned = [
      /Math\.random/, /Date\.now/, /Object\.hasOwn\b/, /\.replaceAll\(/, /structuredClone/, /[\w\])]\.at\(/, /\bbtoa\(/, /\batob\(/,
      /from ['"]three/, /\bwindow\./, /\bdocument\./, /TODO/, /not implemented/, /catch\s*\(/,
    ];
    files.forEach((f) => {
      const src = readFileSync(fileURLToPath(new URL('./' + f + '.js', import.meta.url)), 'utf8');
      // yorum satırlarını at (belge metni yasak sözcükleri anabilir)
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      banned.forEach((re) => expect(re.test(code), f + ' içinde ' + re).toBe(false));
      expect(src.split('\n').length, f).toBeLessThanOrEqual(900);
    });
  });
});
