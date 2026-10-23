/*
 * KEŞİF sim — toplu yeniden dışa aktarım (saf modüller; DOM/three yok).
 *
 * Çakışan adlar (aynı ad iki modülde farklı değerle): `BOSS_KEYS` (constants = mobTypes değerce aynı; constants
 * sürümü verilir), `SAVE_VERSION` (constants = save, aynı bağlama), `DIFFICULTIES` (combat ↔ progression farklı
 * tablolar → COMBAT_DIFFICULTIES / PROGRESSION_DIFFICULTIES). Ayrıca her modül ad alanı olarak da verilir
 * (örn. `mobTypesModule.BOSS_KEYS`).
 */
export * from './constants.js';
export * from './rng.js';
export * from './noise.js';
export * from './blocks.js';
export * from './items.js';
export * from './inventory.js';
export * from './mapFormat.js';
export * from './chunk.js';
export * from './world.js';
export * from './lighting.js';
export * from './worldgen.js';
export * from './physics.js';
export * from './raycast.js';
export * from './survival.js';
export * from './daynight.js';
export * from './mobTypes.js';
export * from './structures.js';
export * from './parkour.js';
export * from './loot.js';
export * from './puzzles/index.js';
export * from './entities.js';
export * from './mobAI.js';
export * from './combat.js';
export * from './spawner.js';
export * from './progression.js';
export * from './quests.js';
export * from './achievements.js';
export * from './save.js';
export * from './saveMapIO.js';
export * from './saveStorage.js';
export * from './saveEdits.js';
export * from './saveEnvelope.js';
// Boyutlar (Neon Meridyen): tablo, üretici kaydı, koruma kuralları, boyut bağlamı/kaydı, yolculuk kuralları
export * from './dim/dimensions.js';
export * from './dim/genRegistry.js';
export * from './dim/dimRules.js';
export * from './dim/dimState.js';
export * from './dim/dimSanitize.js';
export * from './dim/travel.js';

// Çakışma çözümü (belirgin dışa aktarım, `export *` belirsizliğini ezer).
export { BOSS_KEYS, SAVE_VERSION } from './constants.js';
export { DIFFICULTIES as COMBAT_DIFFICULTIES } from './combat.js';
export { DIFFICULTIES as PROGRESSION_DIFFICULTIES } from './progression.js';

export * as mobTypesModule from './mobTypes.js';
export * as combatModule from './combat.js';
export * as progressionModule from './progression.js';
export * as saveModule from './save.js';
