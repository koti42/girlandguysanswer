/*
 * "Herkesler Yükseliyor" kule simülasyonu — ortak API (şartname §B.1).
 * Kule motoru, oturum kancası ve testler yalnızca bu dosyadan içe aktarır;
 * PHP portu (app/Services/Game/Tower/TowerSim.php) aynı yüzeyi birebir izler.
 *
 * bot.js buradan dışa AKTARILMAZ: yalnızca testler ve fikstür üreticisi içindir,
 * üretim paketine girmemeli.
 */
export { TOWER_SIM_VERSION, TC, offsetAt, speedFor, axisFor, isQuestionFloor } from './constants.js';
export { createTowerSim, replayTower } from './sim.js';
export { computeTowerScore } from './score.js';
export { decodeTowerInputs, encodeTowerInputs, TowerInputError } from './inputs.js';
export { towerStateHash, fnv1a } from './hash.js';
