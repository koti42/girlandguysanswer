/*
 * KEŞİF render — şehir chunk geometrisi (mesher `opts.city` çıktısından).
 *
 *   createCityGeometry(THREE, pass, bounds?) → BufferGeometry | null
 *     createChunkGeometry ile aynı öznitelikler + `aCity` (Uint8×4, NORMALIZED). Geçişte `city` tamponu yoksa (ana diyar mesh'i) `aCity` eklenmez.
 *   CITY_MESH_ATTRIBUTES  (mesher.js) öznitelik listesi: MESH_ATTRIBUTES + {key:'city', name:'aCity', itemSize:4, normalized:true, type:'uint8'}
 *   cityDummyAttributes(THREE, vertexCount) ısınma/kukla geometri için aynı öznitelik kümesi (normalized Uint8 dâhil).
 */
import { createChunkGeometry } from './materials.js';
import { CITY_ATTRIBUTE } from './mesher.js';

export function createCityGeometry(THREE, pass, bounds) {
  const g = createChunkGeometry(THREE, pass, bounds);
  if (!g) return null;
  if (pass.city) g.setAttribute(CITY_ATTRIBUTE.name, new THREE.BufferAttribute(pass.city, CITY_ATTRIBUTE.itemSize, CITY_ATTRIBUTE.normalized));
  return g;
}

/** Kukla (çizilmeyen) şehir geometrisine aCity ekler: program anahtarı gerçek geometriyle aynı kalsın. */
export function cityDummyAttributes(THREE, geometry, vertexCount = 3) {
  geometry.setAttribute(CITY_ATTRIBUTE.name, new THREE.BufferAttribute(new Uint8Array(CITY_ATTRIBUTE.itemSize * vertexCount), CITY_ATTRIBUTE.itemSize, true));
  return geometry;
}
