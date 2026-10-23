/*
 * KEŞİF blok sistemi — inşa paleti (yaratıcı mod).
 *
 *   buildPalette() → [{id, key, name, category, group, item}]   BUILD_GROUPS sırasıyla tüm inşa edilebilir + yerleştirilebilir bloklar
 *                                                               (sistem blokları ve haritada yasak kimlikler hiç yer almaz); önbellekli, donuk
 */
import {
  BLOCKS, BUILD_GROUPS, PLACEABLE_IDS,
} from '../sim/blocks.js';

let cache = null;

export function buildPalette() {
  if (cache) return cache;
  const out = [];
  for (let g = 0; g < BUILD_GROUPS.length; g++) {
    for (let i = 0; i < PLACEABLE_IDS.length; i++) {
      const b = BLOCKS[PLACEABLE_IDS[i]];
      if (b.group !== BUILD_GROUPS[g].key) continue;
      out.push(Object.freeze({
        id: b.id, key: b.key, name: b.name, category: BUILD_GROUPS[g].key, group: BUILD_GROUPS[g].key, item: 'blok:' + b.key,
      }));
    }
  }
  cache = Object.freeze(out);
  return cache;
}
