/*
 * KEŞİF sim/city — yüzey kodu → blok eşlemesi (SURF.* → y63 bloğu). Saf; cityTerrain ve cityBridges ortak kullanır.
 *
 *  plazaBlockId(x,z)            meydan döşemesi: 4×4 iki tonlu dama
 *  surfaceBlockId(s,x,z,gnd)    yüzey kodu → blok kimliği (yol 223–228, meydan, park çimi, rıhtım taşı, avlu zemini gnd)
 *  groundIdOf(lay)              bloğun avlu zemini (bölge tablosu: kaldırım | beton | çim)
 */
import { DISTRICTS } from './archetypes.js';
import { SURF, SURF_BLOCK } from './cityRoads.js';
import { ID } from './cityEmit.js';

const GROUND_ID = Object.freeze({ kaldirim: ID.SIDEWALK, beton: ID.ASPHALT, cim: ID.GRASS });

/** Meydan döşemesi: 8×8 iki tonlu dama (kaldırım plakası + koyu asfalt; ikisi de ıslak yüzey → yağmurda tüm meydan yansır). */
export function plazaBlockId(x, z) {
  return ((x >> 3) + (z >> 3)) & 1 ? ID.SIDEWALK : ID.ASPHALT;
}

export function surfaceBlockId(s, x, z, gnd) {
  if (s >= SURF.ASPHALT && s <= SURF.SIDEWALK) return SURF_BLOCK[s];
  switch (s) {
    case SURF.PLAZA: return plazaBlockId(x, z);
    case SURF.PARK: return ID.GRASS;
    case SURF.QUAY: return ID.SIDEWALK;
    default: return gnd;
  }
}

export function groundIdOf(lay) {
  const d = lay && lay.district ? DISTRICTS[lay.district] : null;
  return GROUND_ID[d ? d.ground : 'kaldirim'] || ID.SIDEWALK;
}
