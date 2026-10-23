/*
 * KEŞİF props sistemi — İÇ MEKÂN ORTAM SESLERİ. Yakındaki `def.amb` taşıyan proplar (buzdolabı uğultusu, arcade bipleri, akvaryum baloncukları,
 * sunucu fanı, ramen buharı, otomat vızıltısı, çalışan duş) için aralıklı kısa ses çalar. Ses düğümü bütçesi: en çok N en yakın prop eşzamanlı
 * (N: yüksek 3 / orta 2 / düşük 1); aynı katta (|dy| < 5), `amb.range` içinde; ses uzaklıkla azalır. Math.random yok: aralık sapması id hash'inden.
 *
 *   const pa = createPropAmbience(G, {limit?})
 *   pa.update(dt)        kare/adım başı (≤2 Hz tarama, çalma zamanlayıcıları her çağrıda)       pa.setLimit(n)     pa.stats {playing, scans, played}
 */
import { hash32 } from '../sim/rng.js';

const SCAN_EVERY = 0.5;

export function createPropAmbience(G, opts) {
  let limit = opts && opts.limit > 0 ? opts.limit | 0 : 2;
  const timers = new Map();
  const picked = [];
  const stats = { playing: 0, scans: 0, played: 0 };
  let clock = 0;
  let scanAt = 0;

  function candidates() {
    const pw = G.props;
    const b = G.body;
    if (!pw || !b || typeof pw.chunkProps !== 'function') return;
    const cx = Math.floor(b.x / 16);
    const cz = Math.floor(b.z / 16);
    const list = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const props = pw.chunkProps(cx + dx, cz + dz);
        for (let i = 0; i < props.length; i++) {
          const p = props[i];
          const e = pw.entry(p.id);
          if (!e || !e.def.amb) continue;
          const a = e.def.amb;
          if (a.on !== undefined && e.state !== a.on) continue;
          const ox = p.x - b.x;
          const oy = p.y - b.y;
          const oz = p.z - b.z;
          if (oy > 5 || oy < -5) continue;
          const d = Math.sqrt(ox * ox + oz * oz);
          if (d > a.range) continue;
          list.push({ id: p.id, d, amb: a, x: p.x, y: p.y + 1, z: p.z });
        }
      }
    }
    list.sort((p, q) => p.d - q.d || p.id - q.id);
    picked.length = 0;
    for (let i = 0; i < list.length && i < limit; i++) picked.push(list[i]);
  }

  return {
    stats,
    setLimit(n) {
      limit = n > 0 ? n | 0 : 1;
    },
    update(dt) {
      if (!(dt > 0)) return;
      clock += dt;
      if (clock >= scanAt) {
        scanAt = clock + SCAN_EVERY;
        stats.scans++;
        candidates();
        // seçilmeyenlerin zamanlayıcısı atılır
        timers.forEach((v, k) => {
          if (!picked.some((c) => c.id === k)) timers.delete(k);
        });
      }
      stats.playing = picked.length;
      if (typeof G.sound !== 'function') return;
      for (let i = 0; i < picked.length; i++) {
        const c = picked[i];
        let at = timers.get(c.id);
        if (at === undefined) {
          at = clock + (hash32(c.id) % 1000) / 1000 * c.amb.period * 0.6;
          timers.set(c.id, at);
        }
        if (clock >= at) {
          const vol = Math.max(0.12, 1 - c.d / c.amb.range) * 0.7;
          G.sound(c.amb.sound, { x: c.x, y: c.y, z: c.z }, { vol });
          stats.played++;
          timers.set(c.id, clock + c.amb.period * (0.9 + (hash32(c.id ^ stats.played) % 100) / 500));
        }
      }
    },
  };
}
