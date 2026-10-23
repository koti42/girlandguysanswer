import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PanelShell from './PanelShell.jsx';
import PanelTabs from './PanelTabs.jsx';
import { drawMap } from './panelMapDraw.js';
import {
    MARKER_TYPES, bearingLabel, buildTileRGBA, centerOn, formatDistance, hitTestMarker, listPlaces, mapBounds, mapSummary,
    normalizeMarkers, overviewView, localScale, panBy, scaleLimits, shapePoints, zoneRings, zoomAt,
} from './panelMap.js';
import { useApiSnapshot, useLiveMessage } from './panelHooks.js';

const TABS = [{ key: 'harita', name: 'Harita' }, { key: 'liste', name: 'Liste' }];
const DEFAULT_SIZE = { w: 640, h: 400 };

/* Gösterge şekli (renk + şekil). */
const LegendShape = ({ shape, color }) => {
    const pts = shapePoints(shape, 10, 10, 8);
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            {pts ? <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={color} stroke="#0b0f22" strokeWidth="1.5" /> : <circle cx="10" cy="10" r="7" fill={color} stroke="#0b0f22" strokeWidth="1.5" />}
        </svg>
    );
};

/*
 * Harita ekranı: canvas'ta api.getMapInfo() kareleri (bilinmeyen = sis), bölge halkaları, işaretler (renk + şekil),
 * oyuncu oku. Kaydır (sürükle / ok tuşları), yakınlaştır (tekerlek, iki parmak, +/-), "Merkeze dön".
 * "Liste" sekmesi: keşfedilmiş yerler (uzaklık + yön) — canvas'a erişemeyenler için metin alternatifi.
 * Props: api (getMapInfo), onClose, version, accessibility, reducedMotion.
 */
const MapScreen = ({ api, onClose, version = 0, accessibility = false, reducedMotion = false }) => {
    const read = useCallback(() => api.getMapInfo(), [api]);
    const [info, bump] = useApiSnapshot(read, version);
    const [tab, setTab] = useState('harita');
    const [selectedKey, setSelectedKey] = useState(null);
    const [msg, announce] = useLiveMessage();

    const markers = useMemo(() => normalizeMarkers(info && info.markers), [info]);
    const bounds = useMemo(() => mapBounds(info), [info]);
    const tileData = useMemo(() => buildTileRGBA(info && info.tiles), [info]);
    const rings = useMemo(() => zoneRings(info), [info]);
    const player = info && info.player ? info.player : null;
    const places = useMemo(() => listPlaces(markers, player), [markers, player]);
    const hiddenCount = markers.filter((m) => !m.discovered).length;
    const selected = markers.find((m) => m.key === selectedKey) || null;

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
        stateRef.current = { info, markers, bounds, rings, selectedKey, accessibility, player };
    });

    // bilinen yenileme: oyuncu hareket ediyorsa harita güncel kalsın
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
        } catch (_e) {
            ctx = null;
        }
        if (!ctx) return;
        const size = sizeRef.current;
        if (!viewRef.current) viewRef.current = overviewView(s.bounds, size.w, size.h, s.player, s.markers);
        try {
            drawMap(ctx, {
                w: size.w,
                h: size.h,
                dpr: size.dpr,
                view: viewRef.current,
                bounds: s.bounds,
                tileCanvas: tileCanvasRef.current,
                markers: s.markers,
                rings: s.rings,
                player: s.player,
                spawn: s.info && s.info.spawn,
                selectedKey: s.selectedKey,
                contrast: s.accessibility,
            });
        } catch (_e) {
            /* çizim hatası haritayı bozmasın */
        }
    }, []);

    const requestDraw = useCallback(() => {
        if (rafRef.current) return;
        if (typeof requestAnimationFrame === 'function') rafRef.current = requestAnimationFrame(draw);
        else rafRef.current = setTimeout(draw, 16);
    }, [draw]);

    // kareler → ekran dışı canvas
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
        } catch (_e) {
            tileCanvasRef.current = null;
        }
        requestDraw();
    }, [tileData, requestDraw]);

    useEffect(() => {
        requestDraw();
    }, [info, selectedKey, accessibility, tab, requestDraw]);

    // boyut izleme
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
        } else {
            window.addEventListener('resize', measure);
        }
        return () => {
            if (ro) ro.disconnect();
            else window.removeEventListener('resize', measure);
        };
    }, [tab, requestDraw]);

    useEffect(() => () => {
        if (rafRef.current) {
            if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafRef.current);
            clearTimeout(rafRef.current);
            // StrictMode (geliştirme) efekti söküp yeniden kurar: iptal edilen kare kimliği kalırsa
            // requestDraw "zaten bekliyor" sanıp bir daha çizmez (harita boş kalır).
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
    const goSpawn = () => {
        const sp = info && info.spawn;
        const v = viewRef.current;
        if (!v) return;
        viewRef.current = centerOn(v, sp && Number.isFinite(sp.x) ? sp.x : 0, sp && Number.isFinite(sp.z) ? sp.z : 0, bounds);
        requestDraw();
        announce('Harita başlangıç noktasına gitti.');
    };

    // tekerlek: yakınlaştır (pasif olmayan dinleyici gerekir)
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
    const onPointerDown = (e) => {
        const [x, y] = local(e);
        pointers.current.set(e.pointerId, { x, y });
        gesture.current = { moved: 0, lastDist: 0 };
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch (_e) {
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
        const hit = hitTestMarker(markers, v, sizeRef.current.w, sizeRef.current.h, x, y, accessibility ? 22 : 16);
        setSelectedKey(hit ? hit.key : null);
        if (hit) announce(hit.discovered ? hit.name + ', ' + hit.label : 'Keşfedilmemiş bir yer.');
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
        setSelectedKey(m.key);
        setTab('harita');
        const v = viewRef.current;
        const { w, h } = sizeRef.current;
        const base = v || overviewView(bounds, w, h, player, markers);
        viewRef.current = centerOn({ cx: base.cx, cz: base.cz, scale: Math.max(base.scale, 1.5) }, m.x, m.z, bounds);
        requestDraw();
    };

    const legend = useMemo(() => {
        const seen = new Map();
        markers.forEach((m) => {
            if (m.discovered && !seen.has(m.type)) seen.set(m.type, m);
        });
        return Array.from(seen.values());
    }, [markers]);

    const dist = (m) => {
        if (!player) return null;
        const dx = m.x - player.x;
        const dz = m.z - player.z;
        return { d: Math.sqrt(dx * dx + dz * dz), dir: bearingLabel(dx, dz) };
    };
    const selInfo = selected && selected.discovered ? dist(selected) : null;
    const px = player ? Math.round(player.x) : 0;
    const pz = player ? Math.round(player.z) : 0;
    const subtitle = info && info.zone && info.zone.name ? `${info.zone.name} · Konum ${px}, ${pz}` : undefined;

    return (
        <PanelShell
            title="Harita"
            subtitle={subtitle}
            onClose={onClose}
            testId="map-screen"
            className="kp-map"
            accessibility={accessibility}
            reducedMotion={reducedMotion}
        >
            <PanelTabs tabs={TABS} value={tab} onChange={setTab} label="Harita görünümü" idPrefix="map" />
            <div role="tabpanel" id="map-panel" aria-labelledby={`map-tab-${tab}`} className="kp-map-body">
                {!info ? <p className="kp-empty">Harita okunamadı.</p> : null}
                {info && tab === 'harita' ? (
                    <>
                        <div className="kp-map-tools" role="group" aria-label="Harita denetimleri">
                            <button type="button" className="kp-btn" onClick={() => zoomBy(1.4)} aria-label="Yakınlaştır">+</button>
                            <button type="button" className="kp-btn" onClick={() => zoomBy(1 / 1.4)} aria-label="Uzaklaştır">−</button>
                            <button type="button" className="kp-btn kp-btn-good" onClick={recenter}>Merkeze dön</button>
                            <button type="button" className="kp-btn" onClick={goSpawn}>Başlangıca git</button>
                        </div>
                        <div ref={wrapRef} className="kp-canvas-wrap">
                            <canvas
                                ref={canvasRef}
                                className="kp-canvas"
                                data-testid="map-canvas"
                                role="img"
                                tabIndex={0}
                                aria-label={mapSummary(info, markers)}
                                aria-describedby="map-keys"
                                onPointerDown={onPointerDown}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerUp}
                                onPointerCancel={onPointerUp}
                                onKeyDown={onKeyDown}
                            />
                        </div>
                        <p id="map-keys" className="kp-hint">Sürükleyerek kaydır, tekerlek ya da iki parmakla yakınlaştır. Klavye: ok tuşları kaydırır, + ve − yakınlaştırır, 0 merkeze döner.</p>
                        {selected ? (
                            <div className="kp-map-card" data-testid="map-selected">
                                <strong>{selected.discovered ? selected.name : 'Keşfedilmemiş yer'}</strong>
                                <span>{selected.discovered ? selected.label : 'Oraya gidince açılır'}</span>
                                {selInfo ? <span>{selInfo.dir} · {formatDistance(selInfo.d)}</span> : null}
                                <button type="button" className="kp-btn" onClick={() => setSelectedKey(null)}>Kapat</button>
                            </div>
                        ) : null}
                        <ul className="kp-legend" aria-label="Harita göstergesi">
                            <li><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><polygon points={shapePoints('arrow', 10, 10, 8).map((p) => p.join(',')).join(' ')} fill="#fff" stroke="#2a7fff" strokeWidth="1.5" /></svg> Sen</li>
                            {legend.map((m) => (
                                <li key={m.type}><LegendShape shape={m.shape} color={m.color} /> {(MARKER_TYPES[m.type] || { label: m.label }).label}</li>
                            ))}
                            {hiddenCount > 0 ? <li><span className="kp-legend-q" aria-hidden="true">?</span> Keşfedilmemiş ({hiddenCount})</li> : null}
                            <li><span className="kp-legend-ring" aria-hidden="true" /> Bölge sınırı</li>
                        </ul>
                    </>
                ) : null}
                {info && tab === 'liste' ? (
                    <section aria-label="Keşfedilen yerler">
                        <p className="kp-summary" data-testid="place-summary">
                            {places.length} keşfedilmiş yer{hiddenCount > 0 ? `, ${hiddenCount} keşfedilmemiş` : ''}
                        </p>
                        {places.length === 0 ? <p className="kp-empty">Henüz yer keşfetmedin. Etrafı gezerek kuleler ve tapınaklar bul.</p> : null}
                        <ul className="kp-places">
                            {places.map((m) => (
                                <li key={m.key}>
                                    <button type="button" className="kp-place" onClick={() => showOnMap(m)} data-testid={`place-${m.key}`}>
                                        <LegendShape shape={m.shape} color={m.color} />
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
            <div className="kp-live" role="status" aria-live="polite" data-testid="live">{msg}</div>
        </PanelShell>
    );
};

export default MapScreen;
