/*
 * "Herkesler Koşuyor" simülasyon çekirdeği — ortak API (şartname §3.8, v2 §A).
 * 3D motor, arayüz ve testler yalnızca bu dosyadan içe aktarır; PHP portu
 * (app/Services/Game/Runner) aynı yüzeyi birebir izler.
 *
 * bot.js buradan dışa AKTARILMAZ: yalnızca testler ve fikstür üreticisi içindir,
 * üretim paketine girmemeli.
 */
export { SIM_VERSION, C, gateTick, zGate, speedAt, laneX, rampHeight, surfaceAt } from './constants.js';
export { createSim, replay } from './sim.js';
export { computeScore } from './score.js';
export { decodeInputs, encodeInputs, InputFormatError } from './inputs.js';
export { stateHash, fnv1a } from './hash.js';
export { chunkKind, tierOf, tunnelAt } from './generator.js';
