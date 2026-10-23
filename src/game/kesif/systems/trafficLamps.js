/*
 * KEŞİF — trafik direği lambaları (systems/traffic.js yardımcısı). Oyuncuya yakın (≤ RANGE) kavşak direklerinin prop durumunu (0 kırmızı, 1 yeşil, 2 sarı;
 * propGeo 'trafik_diregi' lamba malzemesi) trafik ışığı planının o anki durumuna eşitler. Durum zamanın saf işlevidir (sim/city/vehicle/trafficLights) ve
 * 'trafik_diregi' tanımı `transient` olduğundan kayda girmez. Direk kimliği ilk eşitlemede PropWorld.nearest ile bulunup önbelleğe alınır.
 *
 *   createLampSync() → {update(props, tn, t, px, pz), reset(), stats}
 *   lampList(tn) → [{jid, dir, x, y, z}]   (tn başına bir kez hesaplanır)
 */
import { armSignal } from '../sim/city/vehicle/trafficLights.js';

export const LAMP_RANGE = 150;
export const LAMP_EVERY = 0.2;
const LISTS = new WeakMap();

export function lampList(tn) {
  let l = LISTS.get(tn);
  if (l) return l;
  l = [];
  const inters = tn.net && tn.net.intersections ? tn.net.intersections : [];
  for (let i = 0; i < inters.length; i++) {
    const it = inters[i];
    for (let k = 0; k < it.lights.length; k++) {
      const L = it.lights[k];
      l.push({
        jid: it.id, dir: L.dir, x: L.x, y: L.y, z: L.z, key: it.id * 4 + L.dir,
      });
    }
  }
  LISTS.set(tn, l);
  return l;
}

const isPole = (p, def) => def.key === 'trafik_diregi';

export function createLampSync() {
  const cache = new Map();
  const missUntil = new Map(); // yüklü olmayan direk: tekrar aramadan önce bekleme (sn)
  const stats = {
    synced: 0, lookups: 0, misses: 0, changes: 0,
  };
  let acc = LAMP_EVERY;
  let clock = 0;
  return {
    stats,
    reset() {
      cache.clear();
      missUntil.clear();
      acc = LAMP_EVERY;
      clock = 0;
    },
    update(props, tn, t, px, pz, dt) {
      acc += dt;
      clock += dt;
      if (acc < LAMP_EVERY) return 0;
      acc = 0;
      if (!props || !tn) return 0;
      const list = lampList(tn);
      const r2 = LAMP_RANGE * LAMP_RANGE;
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        const L = list[i];
        const dx = L.x - px;
        const dz = L.z - pz;
        if (dx * dx + dz * dz > r2) continue;
        let id = cache.get(L.key);
        if (id === undefined || !props.has(id)) {
          const wait = missUntil.get(L.key);
          if (wait !== undefined && clock < wait) continue;
          stats.lookups++;
          const p = props.nearest(L.x, L.y + 3, L.z, 1.2, isPole);
          if (!p) {
            stats.misses++;
            cache.delete(L.key);
            missUntil.set(L.key, clock + 1.5); // chunk yüklenmemiş: 1,5 sn sonra yeniden dene
            continue;
          }
          missUntil.delete(L.key);
          id = p.id;
          cache.set(L.key, id);
        }
        const J = tn.junctions[L.jid];
        if (!J) continue;
        if (props.setState(id, armSignal(J.plan, L.dir, t))) stats.changes++;
        n++;
      }
      stats.synced = n;
      return n;
    },
  };
}
