/*
 * KEŞİF — ŞEHİR HARİTASI KATMANI (photo_map): systems/contentMapCity.cityMapInfo çıktısını «yalnız bulunmuşlar» katmanıyla süsler ve yeni yer bulgularını izler.
 * systems/cityPhoto.js kurar (`G.cityMap`).
 *
 *   createMapView(G, kit) → mv
 *     mv.decorate(info) → info      bölgeye göre sisli döşemeler (tiles), bulunmuş bölge etiketleri (districts), bulunmuş POI + metro işaretleri (markers'a eklenir)
 *     mv.tick(dt)                   0,5 sn'de bir: oyuncu 60 blok yaklaştıkça POI'ler KALICI bulunur (city.pmap) → olay `mapPoiFound {ids, names}` + kısa ipucu
 *     mv.route(to)                  → {pts, length, straight} | null    oyuncudan to {x,y?,z}'ye çizim rotası
 *     mv.revealAll()                hata ayıklama: tüm bölge/terminal/POI/metro açılır
 *     mv.stats                      {decorated, revealed, ticks}
 *   Bulunmayan hiçbir şey sızmaz (sim/city/map/mapFog.test.js mülkiyet testi).
 */
import { emptyPmap, mapPoiList, revealNear, decodePmap, cityMapLayer } from '../sim/city/map/mapFog.js';
import { routePolyline } from '../sim/city/map/mapRoute.js';
import { statGet } from '../sim/city/cityState.js';

const EVERY = 0.5;

export function createMapView(G, kit) {
  const st = { acc: 0, decorated: 0, revealed: 0, ticks: 0 };

  function pmapOf(c) {
    if (!c) return emptyPmap();
    if (!c.pmap || !Array.isArray(c.pmap.p)) c.pmap = emptyPmap();
    else c.pmap = decodePmap(c.pmap);
    return c.pmap;
  }

  function decorate(info) {
    if (!info || !kit.inCity()) return info;
    const c = kit.blob();
    if (!c) return info;
    const seed = kit.seed();
    const layer = cityMapLayer(seed, {
      dmask: statGet(c, 'dmask'), tmask: kit.terminalMask(), mmask: statGet(c, 'mmask'), pmap: c.pmap,
    });
    st.decorated++;
    info.tiles = layer.tiles;
    info.districts = layer.districts;
    info.markers = (Array.isArray(info.markers) ? info.markers : []).concat(layer.markers);
    return info;
  }

  function tick(dt) {
    st.acc += dt;
    if (st.acc < EVERY) return;
    st.acc = 0;
    st.ticks++;
    if (!kit.inCity()) return;
    const c = kit.blob();
    if (!c) return;
    const p = kit.pos();
    const seed = kit.seed();
    const pm = pmapOf(c);
    const fresh = revealNear(seed, pm, p.x, p.y, p.z);
    if (fresh.length === 0) return;
    st.revealed += fresh.length;
    const list = mapPoiList(seed);
    const names = fresh.map((i) => list[i].name);
    G.emit({ type: 'mapPoiFound', ids: fresh.slice(), names });
    if (typeof kit.say === 'function') kit.say('Haritaya eklendi: ' + names[0] + (names.length > 1 ? ' ve ' + (names.length - 1) + ' yer daha' : '') + '.', 'harita:poi');
  }

  function route(to) {
    if (!kit.inCity() || !to) return null;
    return routePolyline(kit.seed(), kit.pos(), to);
  }

  function revealAll() {
    const c = kit.blob();
    if (!c) return false;
    c.stats.dmask = 0x3f;
    c.stats.mmask = 0x1f;
    const pm = pmapOf(c);
    mapPoiList(kit.seed()).forEach((p) => {
      const w = Math.floor(p.i / 30);
      pm.p[w] = (pm.p[w] | 0) | (1 << (p.i % 30));
    });
    const ctx = kit.ctx();
    if (ctx && ctx.terminals) ctx.terminals.found = 0xffff; // doğrudan maske (markTerminal doğuş noktasını da taşırdı)
    return true;
  }

  return {
    decorate, tick, route, revealAll, stats: st,
  };
}
