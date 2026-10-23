import React, {
  memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import PanelShell from '../PanelShell.jsx';
import PanelTabs from '../PanelTabs.jsx';
import { drawMap } from '../panelMapDraw.js';
import {
  bearingLabel, buildTileRGBA, centerOn, formatDistance, hitTestMarker, listPlaces, localScale, mapBounds, panBy, scaleLimits, shapePoints, zoomAt,
} from '../panelMap.js';
import { useApiSnapshot, useLiveMessage } from '../panelHooks.js';
import {
  cityMapSummary, cityOverview, districtSummary, drawCityUnder, legendRows, normalizeCityMarkers, travelIdOf, travelRow,
} from './cityMapUtils.js';
import './cityMap.css';

/*
 * Neon Meridyen ŞEHİR HARİTASI (G.dim === 'neon'; ui 'map'): yalnız BULUNMUŞ bölgeler, terminaller, metro durakları, yarış/kurye/kiralık/foto/çatı yerleri ve çip/grafiti/oda
 * işaretleri görünür (sis = karanlık). Sürükle/oklar = kaydır, tekerlek/iki parmak/+ − = yakınlaştır, 0 = oyuncuya dön. Seçili yer için «Yol tarifi» (rota çizgisi) ve
 * bulunmuş terminal/metro için «Işınlan» (hızlı seyahat: Kredi bedeli, bekleme süresi, nedeni yazılı kurallar).
 *
 * Engine api: getMapInfo() · getFastTravel() · fastTravel(id) · getMapRoute(x, z). Props: api, onClose, version, accessibility, reducedMotion.
 * Erişilebilirlik: tuval role="img" + özet; «Liste» sekmesi canvas'a erişemeyenler için tam eşdeğer (konum, uzaklık, yön, Işınlan); hedefler ≥ 44 px; renk + şekil + ad.
 */
const TABS = [{ key: 'harita', name: 'Harita' }, { key: 'liste', name: 'Liste' }];
const DEFAULT_SIZE = { w: 640, h: 400 };

const Shape = ({ shape, color }) => {
  const pts = shapePoints(shape, 10, 10, 8);
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {pts ? <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={color} stroke="#0b0f22" strokeWidth="1.5" /> : <circle cx="10" cy="10" r="7" fill={color} stroke="#0b0f22" strokeWidth="1.5" />}
    </svg>
  );
};

const TravelButton = ({ node, cost, onGo }) => (
  <div className="kcm-travel">
    <button type="button" className="kp-btn kp-btn-good kcm-go" disabled={!node.ok} onClick={() => onGo(node.id)} data-testid={'travel-' + node.id}>
      Işınlan · {cost} Kredi
    </button>
    {!node.ok ? <span className="kcm-why" role="note">{node.message}</span> : null}
  </div>
);

const CityMap = ({
  api, onClose, version = 0, accessibility = false, reducedMotion = false,
}) => {
  const read = useCallback(() => ({
    map: api && typeof api.getMapInfo === 'function' ? api.getMapInfo() : null,
    travel: api && typeof api.getFastTravel === 'function' ? api.getFastTravel() : null,
  }), [api]);
  const [snap, bump] = useApiSnapshot(read, version);
  const info = snap ? snap.map : null;
  const travel = snap ? snap.travel : null;
  const [tab, setTab] = useState('harita');
  const [selectedKey, setSelectedKey] = useState(null);
  const [routeOn, setRouteOn] = useState(false);
  const [msg, announce] = useLiveMessage();

  const markers = useMemo(() => normalizeCityMarkers(info && info.markers), [info]);
  const bounds = useMemo(() => mapBounds(info), [info]);
  const tilesRef = info ? info.tiles : null;
  const tileData = useMemo(() => buildTileRGBA(tilesRef), [tilesRef]);
  const player = info && info.player ? info.player : null;
  const places = useMemo(() => listPlaces(markers, player), [markers, player]);
  const selected = markers.find((m) => m.key === selectedKey) || null;
  const nodes = useMemo(() => (travel && Array.isArray(travel.nodes) ? travel.nodes : []), [travel]);
  const nodeOf = useCallback((m) => {
    const id = travelIdOf(m);
    return id ? nodes.find((n) => n.id === id) || null : null;
  }, [nodes]);

  // rota: seçili yer + açıkken oyuncu hareket ettikçe yenilenir
  const route = useMemo(() => {
    if (!routeOn || !selected || !api || typeof api.getMapRoute !== 'function') return null;
    try {
      return api.getMapRoute(selected.x, selected.z);
    } catch {
      return null;
    }
    // oyuncu konumu değişince (poll) yeniden hesaplanır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOn, selected, api, player && Math.round(player.x / 16), player && Math.round(player.z / 16)]);

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const tileCanvasRef = useRef(null);
  const viewRef = useRef(null);
  const sizeRef = useRef({ ...DEFAULT_SIZE, dpr: 1 });
  const stateRef = useRef({});
  const rafRef = useRef(0);
  const pointers = useRef(new Map());
  const gesture = useRef({ moved: 0, lastDist: 0 });

  useLayoutEffect(() => {
    stateRef.current = {
      info, markers, bounds, selectedKey, accessibility, player, route,
    };
  });

  useEffect(() => {
    const id = setInterval(bump, 1500);
    return () => clearInterval(id);
  }, [bump]);

  const draw = useCallback(() => {
    rafRef.current = 0;
    const canvas = canvasRef.current;
    const s = stateRef.current;
    if (!canvas || !s.bounds) return;
    let ctx = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    const size = sizeRef.current;
    if (!viewRef.current) viewRef.current = cityOverview(s.info, s.markers, s.bounds, size.w, size.h);
    try {
      drawMap(ctx, {
        w: size.w,
        h: size.h,
        dpr: size.dpr,
        view: viewRef.current,
        bounds: s.bounds,
        tileCanvas: tileCanvasRef.current,
        markers: s.markers,
        rings: [],
        player: s.player,
        selectedKey: s.selectedKey,
        contrast: s.accessibility,
        drawUnder: drawCityUnder,
        districts: s.info ? s.info.districts : [],
        cityRoute: s.route,
      });
    } catch {
      /* çizim hatası haritayı bozmasın */
    }
  }, []);

  const requestDraw = useCallback(() => {
    if (rafRef.current) return;
    if (typeof requestAnimationFrame === 'function') rafRef.current = requestAnimationFrame(draw);
    else rafRef.current = setTimeout(draw, 16);
  }, [draw]);

  useEffect(() => {
    if (!tileData.w) {
      tileCanvasRef.current = null;
      requestDraw();
      return;
    }
    try {
      const c = document.createElement('canvas');
      c.width = tileData.w;
      c.height = tileData.h;
      const cx = c.getContext('2d');
      if (cx) {
        const img = cx.createImageData(tileData.w, tileData.h);
        img.data.set(tileData.rgba);
        cx.putImageData(img, 0, 0);
        tileCanvasRef.current = c;
      }
    } catch {
      tileCanvasRef.current = null;
    }
    requestDraw();
  }, [tileData, requestDraw]);

  useEffect(() => {
    requestDraw();
  }, [info, selectedKey, accessibility, tab, route, requestDraw]);

  useEffect(() => {
    if (tab !== 'harita') return undefined;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;
    const measure = () => {
      const r = wrap.getBoundingClientRect();
      const w = Math.round(r.width) || DEFAULT_SIZE.w;
      const h = Math.round(r.height) || DEFAULT_SIZE.h;
      const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      requestDraw();
    };
    measure();
    let ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(measure);
      ro.observe(wrap);
    } else window.addEventListener('resize', measure);
    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', measure);
    };
  }, [tab, requestDraw]);

  useEffect(() => () => {
    if (rafRef.current) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafRef.current);
      clearTimeout(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const limitsNow = () => scaleLimits(stateRef.current.bounds || bounds, sizeRef.current.w, sizeRef.current.h);
  const zoomBy = (factor, sx, sy) => {
    const v = viewRef.current;
    if (!v) return;
    const { w, h } = sizeRef.current;
    viewRef.current = zoomAt(v, factor, sx === undefined ? w / 2 : sx, sy === undefined ? h / 2 : sy, w, h, limitsNow(), bounds);
    requestDraw();
  };
  const panPx = (dx, dy) => {
    const v = viewRef.current;
    if (!v) return;
    viewRef.current = panBy(v, dx, dy, bounds);
    requestDraw();
  };
  const recenter = () => {
    const { w, h } = sizeRef.current;
    const px = player && Number.isFinite(player.x) ? player.x : 0;
    const pz = player && Number.isFinite(player.z) ? player.z : 0;
    const lim = scaleLimits(bounds, w, h);
    viewRef.current = centerOn({ cx: px, cz: pz, scale: Math.max(lim.min, Math.min(lim.max, localScale(w))) }, px, pz, bounds);
    requestDraw();
    announce('Harita senin konumuna döndü.');
  };
  const goPlaza = () => {
    const v = viewRef.current;
    if (!v) return;
    viewRef.current = centerOn(v, 0, 0, bounds);
    requestDraw();
    announce('Harita Kapı Meydanı\'na gitti.');
  };

  useEffect(() => {
    if (tab !== 'harita') return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, bounds]);

  const local = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const select = (m) => {
    setSelectedKey(m ? m.key : null);
    setRouteOn(false);
    if (m) announce(m.name + ', ' + m.label);
  };
  const onPointerDown = (e) => {
    const [x, y] = local(e);
    pointers.current.set(e.pointerId, { x, y });
    gesture.current = { moved: 0, lastDist: 0 };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* yakalama desteklenmiyor */
    }
  };
  const onPointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const [x, y] = local(e);
    pointers.current.set(e.pointerId, { x, y });
    const pts = Array.from(pointers.current.values());
    if (pts.length >= 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (gesture.current.lastDist > 0 && d > 0) zoomBy(d / gesture.current.lastDist, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      gesture.current.lastDist = d;
      gesture.current.moved += 10;
    } else {
      gesture.current.moved += Math.abs(x - prev.x) + Math.abs(y - prev.y);
      panPx(x - prev.x, y - prev.y);
    }
  };
  const onPointerUp = (e) => {
    const had = pointers.current.has(e.pointerId);
    const single = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    gesture.current.lastDist = 0;
    if (!had || !single || gesture.current.moved > 8 || e.type === 'pointercancel') return;
    const [x, y] = local(e);
    const v = viewRef.current;
    if (!v) return;
    select(hitTestMarker(markers.filter((m) => m.discovered), v, sizeRef.current.w, sizeRef.current.h, x, y, accessibility ? 24 : 18));
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 160 : 60;
    if (e.key === 'ArrowLeft') panPx(step, 0);
    else if (e.key === 'ArrowRight') panPx(-step, 0);
    else if (e.key === 'ArrowUp') panPx(0, step);
    else if (e.key === 'ArrowDown') panPx(0, -step);
    else if (e.key === '+' || e.key === '=') zoomBy(1.3);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.3);
    else if (e.key === '0' || e.key === 'Home') recenter();
    else return;
    e.preventDefault();
  };

  const showOnMap = (m) => {
    select(m);
    setTab('harita');
    const v = viewRef.current;
    const { w, h } = sizeRef.current;
    const base = v || cityOverview(info, markers, bounds, w, h);
    viewRef.current = centerOn({ cx: base.cx, cz: base.cz, scale: Math.max(base.scale, 1.5) }, m.x, m.z, bounds);
    requestDraw();
  };

  const doTravel = useCallback((id) => {
    const r = api && typeof api.fastTravel === 'function' ? api.fastTravel(id) : null;
    announce((r && r.message) || 'Hızlı seyahat şu an kullanılamıyor.');
    bump();
  }, [api, announce, bump]);

  const legend = useMemo(() => legendRows(markers), [markers]);
  const selNode = selected ? nodeOf(selected) : null;
  const dist = (m) => {
    if (!player) return null;
    const dx = m.x - player.x;
    const dz = m.z - player.z;
    return { d: Math.sqrt(dx * dx + dz * dz), dir: bearingLabel(dx, dz) };
  };
  const selInfo = selected ? dist(selected) : null;
  const subtitle = info && info.zone && info.zone.name ? `${info.zone.name} · ${districtSummary(info)}` : undefined;
  const cost = travel && travel.cost !== undefined ? travel.cost : 0;

  return (
    <PanelShell title="Şehir Haritası" subtitle={subtitle} onClose={onClose} testId="city-map" className="kp-map kcm" accessibility={accessibility} reducedMotion={reducedMotion}>
      <PanelTabs tabs={TABS} value={tab} onChange={setTab} label="Harita görünümü" idPrefix="cmap" />
      <div role="tabpanel" id="cmap-panel" aria-labelledby={`cmap-tab-${tab}`} className="kp-map-body">
        {!info ? <p className="kp-empty">Harita okunamadı.</p> : null}
        {info && tab === 'harita' ? (
          <>
            <div className="kp-map-tools" role="group" aria-label="Harita denetimleri">
              <button type="button" className="kp-btn" onClick={() => zoomBy(1.4)} aria-label="Yakınlaştır">+</button>
              <button type="button" className="kp-btn" onClick={() => zoomBy(1 / 1.4)} aria-label="Uzaklaştır">−</button>
              <button type="button" className="kp-btn kp-btn-good" onClick={recenter}>Bana dön</button>
              <button type="button" className="kp-btn" onClick={goPlaza}>Kapı Meydanı</button>
              {travel && travel.enabled ? <span className="kcm-status" data-testid="travel-status">Kredi: {travel.kredi}{travel.cooldown > 0 ? ` · Bekleme: ${travel.cooldown} sn` : ''}</span> : null}
            </div>
            <div ref={wrapRef} className="kp-canvas-wrap">
              <canvas
                ref={canvasRef}
                className="kp-canvas"
                data-testid="city-map-canvas"
                role="img"
                tabIndex={0}
                aria-label={cityMapSummary(info, markers)}
                aria-describedby="cmap-keys"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onKeyDown={onKeyDown}
              />
            </div>
            <p id="cmap-keys" className="kp-hint">Yalnız keşfettiğin yerler görünür; karanlık bölgelere gidince açılır. Sürükleyerek kaydır, tekerlek ya da iki parmakla yakınlaştır. Klavye: oklar kaydırır, + ve − yakınlaştırır, 0 sana döner.</p>
            {selected ? (
              <div className="kp-map-card kcm-card" data-testid="city-map-selected">
                <strong>{selected.name}</strong>
                <span>{selected.label}</span>
                {selInfo ? <span>{selInfo.dir} · {formatDistance(selInfo.d)}</span> : null}
                <div className="kcm-actions">
                  <button type="button" className="kp-btn" aria-pressed={routeOn} onClick={() => setRouteOn((v) => !v)} data-testid="route-toggle">
                    {routeOn ? 'Yol tarifini gizle' : 'Yol tarifi'}
                  </button>
                  {selNode ? <TravelButton node={selNode} cost={cost} onGo={doTravel} /> : null}
                  <button type="button" className="kp-btn" onClick={() => select(null)}>Kapat</button>
                </div>
                {routeOn && route ? <span className="kcm-route" data-testid="route-info">Rota: yaklaşık {formatDistance(route.length)}{route.straight ? ' (kuş uçuşu)' : ''}</span> : null}
              </div>
            ) : null}
            <ul className="kp-legend" aria-label="Harita göstergesi">
              <li><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><polygon points={shapePoints('arrow', 10, 10, 8).map((p) => p.join(',')).join(' ')} fill="#fff" stroke="#2a7fff" strokeWidth="1.5" /></svg> Sen</li>
              {legend.map((m) => <li key={m.type}><Shape shape={m.shape} color={m.color} /> {m.label}</li>)}
              <li><span className="kcm-fog" aria-hidden="true" /> Keşfedilmemiş (karanlık)</li>
            </ul>
          </>
        ) : null}
        {info && tab === 'liste' ? (
          <section aria-label="Keşfedilen yerler">
            <p className="kp-summary" data-testid="city-place-summary">
              {districtSummary(info)} · {places.length} keşfedilmiş yer
            </p>
            {nodes.length > 0 ? (
              <>
                <h3 className="kcm-h">Hızlı seyahat</h3>
                <ul className="kp-places" aria-label="Hızlı seyahat noktaları">
                  {nodes.map((n) => (
                    <li key={n.id} className="kcm-node" data-ok={n.ok ? '1' : '0'}>
                      <span className="kcm-node-name">{travelRow(n)}</span>
                      <TravelButton node={n} cost={cost} onGo={doTravel} />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <h3 className="kcm-h">Keşfedilen yerler</h3>
            {places.length === 0 ? <p className="kp-empty">Henüz yer keşfetmedin. Sokaklarda gez; yarış kapıları, kurye masaları ve terminaller haritaya eklenir.</p> : null}
            <ul className="kp-places">
              {places.map((m) => (
                <li key={m.key}>
                  <button type="button" className="kp-place" onClick={() => showOnMap(m)} data-testid={`city-place-${m.key}`}>
                    <Shape shape={m.shape} color={m.color} />
                    <span className="kp-place-name">{m.name}</span>
                    <span className="kp-place-type">{m.label}</span>
                    <span className="kp-place-dist">{m.dir} · {formatDistance(m.dist)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <div className="kp-live" role="status" aria-live="polite" data-testid="city-map-live">{msg}</div>
    </PanelShell>
  );
};

export default memo(CityMap);
