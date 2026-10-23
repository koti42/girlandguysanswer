/*
 * KEŞİF sim — yapı türleri kaydı + bölge doluluk/ağırlık tabloları (saf veri).
 */
import { TEMPLE } from './structuresTemple.js';
import { SEAL } from './structuresSeal.js';
import { BOSS_ARENA } from './structuresBoss.js';
import { TURBE } from './structuresTurbe.js';
import { KAMP } from './structuresCamp.js';
import { GOZCU } from './structuresTower.js';
import { GIZLI, HARABE, HAZINE } from './structuresRuins.js';
import { YUZENADA } from './structuresIsland.js';
import { KOY } from './structuresVillage.js';
import { PARKUR } from './structuresParkour.js';

export const TYPES = Object.freeze({
  anahtartapinagi: TEMPLE,
  muhursunagi: SEAL,
  bossarena: BOSS_ARENA,
  turbe: TURBE,
  kamp: KAMP,
  gozcukulesi: GOZCU,
  harabe: HARABE,
  yuzenada: YUZENADA,
  gizlimagara: GIZLI,
  hazine: HAZINE,
  koy: KOY,
  parkur: PARKUR,
});

/** Contract §6 / addendum §C: 12 tür anahtarı (parkur 5 kademe). */
export const STRUCTURE_TYPES = Object.freeze(Object.keys(TYPES));

/** Biyoma göre tür ağırlığı çarpanları (hücre merkezindeki biyom). */
export const BIOME_MULT = Object.freeze({
  plaj: Object.freeze({ hazine: 2.2, yuzenada: 1.3, harabe: 0.5, parkur: 0.6 }),
  col: Object.freeze({ harabe: 1.7, hazine: 1.5, koy: 0.7, gizlimagara: 1.2 }),
  tundra: Object.freeze({ gizlimagara: 1.4, kamp: 1.4, yuzenada: 1.2 }),
  bataklik: Object.freeze({ harabe: 1.6, koy: 0.4, parkur: 0.7 }),
  kristal: Object.freeze({ yuzenada: 2, gizlimagara: 1.5, gozcukulesi: 0.8 }),
  orman: Object.freeze({ koy: 1.5, kamp: 1.3, harabe: 1.2 }),
  karacam: Object.freeze({ koy: 1.3, kamp: 1.2, gizlimagara: 1.1 }),
  dag: Object.freeze({ gozcukulesi: 1.7, gizlimagara: 1.5, parkur: 0.7, koy: 0.5 }),
  cayir: Object.freeze({ koy: 1.4, parkur: 1.2, turbe: 1.1 }),
});

/** Hücre başına yapı olasılığı (bölge). Küçük bölgeler daha yoğun. */
export const OCCUPANCY = Object.freeze([0.95, 0.62, 0.56, 0.5, 0.46]);

/** Rastgele hücre türü ağırlıkları (çapalar hariç). [tür, ağırlık] */
export const WEIGHTS = Object.freeze([
  Object.freeze([['kamp', 8], ['turbe', 16], ['gozcukulesi', 12], ['harabe', 14], ['koy', 10], ['hazine', 9], ['gizlimagara', 8], ['parkur', 16], ['yuzenada', 3]]),
  Object.freeze([['kamp', 10], ['turbe', 16], ['gozcukulesi', 10], ['harabe', 16], ['koy', 8], ['hazine', 9], ['gizlimagara', 10], ['parkur', 16], ['yuzenada', 4]]),
  Object.freeze([['kamp', 8], ['turbe', 16], ['gozcukulesi', 10], ['harabe', 16], ['koy', 6], ['hazine', 9], ['gizlimagara', 12], ['parkur', 18], ['yuzenada', 5]]),
  Object.freeze([['kamp', 6], ['turbe', 15], ['gozcukulesi', 10], ['harabe', 16], ['koy', 4], ['hazine', 9], ['gizlimagara', 12], ['parkur', 18], ['yuzenada', 6]]),
  Object.freeze([['kamp', 4], ['turbe', 14], ['gozcukulesi', 10], ['harabe', 16], ['koy', 2], ['hazine', 9], ['gizlimagara', 12], ['parkur', 20], ['yuzenada', 6]]),
]);
