/*
 * KEŞİF motor girişi: createKesifGame, isWebGLAvailable ve sabitler.
 * Sayfa kodu motoru dinamik içe aktarır: () => import('../../../game/kesif/index.js') (bkz. pages/game/kesif/engineLoader.js).
 */
export { createKesifGame, isWebGLAvailable } from './game.js';
export { QUALITY, QUALITY_KEYS } from './render/quality.js';
export {
  CHUNK_SIZE, WORLD_H, MAP_H, WORLD_Y_MIN, WORLD_Y_MAX, SECTION_H, SEA_LEVEL, ZONES, ZONE_COUNT, BIOMES, MAP_LIMITS, BUILDABLE_MAX,
  SAVE_VERSION, DEPTH_BANDS, depthBandAt,
} from './sim/constants.js';
export { MAP_BASES, MAP_TIMES } from './sim/mapFormat.js';
export { resolveSeed, mapTimePhase } from './gameWorld.js';
export { createHudStore, EMPTY_HUD, sanitizeHud } from './hudStore.js';
export { PUBLIC_EVENTS } from './gameCtx.js';

/** Motor sözleşme sürümü (api yüzeyi değişirse artar). */
export const KESIF_ENGINE_VERSION = 1;
