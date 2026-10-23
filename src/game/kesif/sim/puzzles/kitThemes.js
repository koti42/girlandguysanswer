/*
 * KEŞİF bulmaca altyapısı — bölge temaları (saf).
 *
 * Her bölgenin oda kabuğu kendi malzemesiyle kurulur:
 *   Z0 taş tuğla harabe · Z1 yosunlu/sarmaşıklı kalıntı · Z2 kumtaşı/kanyon · Z3 buz/mavi taş · Z4 obsidyen/rün/karanlık
 * Tema alanları blok KİMLİKLERİdir (blocks.js `B`); zemin hiçbir temada kaygan/hasarlı değildir.
 */
import { B } from '../blocks.js';
import { ZONE_COUNT } from '../constants.js';

function theme(key, zone, name, o) {
  return Object.freeze(Object.assign({
    key,
    zone,
    name,
    altChance: 0.15,
    light: B.LANTERN,
    torch: B.TORCH,
    lock: B.LOCKED_DOOR,
  }, o));
}

export const THEMES = Object.freeze([
  theme('harabe', 0, 'Taş Harabe', {
    wall: B.STONE_BRICK, wallAlt: B.COBBLE, altChance: 0.14,
    floor: B.POLISHED, floorAlt: B.STONE_BRICK, base: B.STONE, ceiling: B.STONE_BRICK,
    pillar: B.PILLAR, glow: B.CRYSTAL_ROCK,
  }),
  theme('yosunlu', 1, 'Yosunlu Kalıntı', {
    wall: B.STONE_BRICK, wallAlt: B.MOSS, altChance: 0.3,
    floor: B.COBBLE, floorAlt: B.MOSS, base: B.STONE, ceiling: B.STONE_BRICK,
    pillar: B.PILLAR, glow: B.AMETHYST,
  }),
  theme('kumtasi', 2, 'Kumtaşı Kanyon Odası', {
    wall: B.SANDSTONE, wallAlt: B.CANYON_ROCK, altChance: 0.2,
    floor: B.CANYON_ROCK, floorAlt: B.SANDSTONE, base: B.SANDSTONE, ceiling: B.SANDSTONE,
    pillar: B.PILLAR, glow: B.REDSTONE_ORE,
  }),
  theme('buz', 3, 'Buzul Taş Oda', {
    wall: B.CONCRETE_BLUE, wallAlt: B.ICE, altChance: 0.12,
    floor: B.POLISHED, floorAlt: B.CONCRETE_BLUE, base: B.STONE, ceiling: B.CONCRETE_BLUE,
    pillar: B.PILLAR, glow: B.CRYSTAL_ROCK,
  }),
  theme('golge', 4, 'Gölge Rün Odası', {
    wall: B.BASALT, wallAlt: B.CONCRETE_BLACK, altChance: 0.25,
    floor: B.CONCRETE_BLACK, floorAlt: B.BASALT, base: B.BASALT, ceiling: B.BASALT,
    pillar: B.PILLAR, glow: B.QUANTUM_BLOCK,
  }),
]);

/** Bölge indeksi (0..4, dışı sıkıştırılır) → tema. */
export function themeForZone(zone) {
  let z = Math.floor(Number(zone));
  if (!Number.isFinite(z)) z = 0;
  return THEMES[Math.max(0, Math.min(ZONE_COUNT - 1, THEMES.length - 1, z))];
}

/** Tema nesnesi | anahtar metin | bölge sayısı | tanımsız → tema (tanımsızsa `zone` fallback'i). */
export function resolveTheme(t, zone) {
  if (t && typeof t === 'object' && typeof t.wall === 'number') return t;
  if (typeof t === 'string') {
    for (let i = 0; i < THEMES.length; i++) if (THEMES[i].key === t) return THEMES[i];
  }
  if (typeof t === 'number') return themeForZone(t);
  return themeForZone(zone);
}
