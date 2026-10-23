import React, { memo, useEffect, useRef, useState } from 'react';
import { drawCityMinimap, markerArrow, prepareCityMap } from './cityMinimapDraw.js';
import { minimapRange } from './vehicleHudUtils.js';

/*
 * Sürüş mini haritası (Neon Meridyen): aracın baktığı yön yukarıda, yollar vektör, POI simgeleri (şekil + renk), trafik noktaları, kendi aracın ve rota işareti.
 * Veri motor yüzeyinden ~20 Hz okunur (kare başı React yeniden çizimi yok): api.getDriveInfo() {seed,x,z,yaw,speed}, api.getTrafficDots(),
 * api.getDriveMarker() {x,z,label}. Sekme gizliyken / duraklatılmışken hiçbir iş yapılmaz. 140 px (telefon 112 px).
 * Ekran okuyucu: role="img"; açıklama ≤ 1 Hz güncellenir (hedef uzaklığı dahil).
 *
 * Props: api, size (css px, 140), paused, reducedMotion, onOpen (büyük haritayı aç; verilirse düğme olur)
 */
const MIN_GAP_MS = 50;
const LABEL_MS = 1500;

const CityMinimap = ({ api, size = 140, paused = false, onOpen }) => {
  const canvasRef = useRef(null);
  const [label, setLabel] = useState('Mini harita. Aracın yönü yukarıdadır.');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || paused || !api || typeof api.getDriveInfo !== 'function') return undefined;
    const dpr = Math.max(1, Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
    const px = Math.round(size * dpr);
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    let ctx = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return undefined;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const data = {
      map: null, pose: { x: 0, z: 0, yaw: 0 }, range: 100, dots: null, marker: null,
    };
    let seed = -1;
    let alive = true;
    let raf = 0;
    let last = 0;
    let smoothRange = 100;
    const labelTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      let txt = 'Mini harita. Aracın yönü yukarıdadır.';
      if (data.marker) {
        const a = markerArrow(data.marker.x - data.pose.x, data.marker.z - data.pose.z, data.pose.yaw, data.range);
        txt += ' Hedef' + (data.marker.label ? ' ' + data.marker.label : '') + ': ' + Math.round(a.dist) + ' metre.';
      }
      setLabel((prev) => (prev === txt ? prev : txt));
    }, LABEL_MS);

    const frame = (ts) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (typeof document !== 'undefined' && document.hidden) return;
      if (ts - last < MIN_GAP_MS) return;
      last = ts;
      let info = null;
      try {
        info = api.getDriveInfo();
      } catch {
        info = null;
      }
      if (!info || !Number.isFinite(info.x) || !Number.isFinite(info.z)) return;
      if (info.seed !== seed) {
        seed = info.seed;
        try {
          data.map = prepareCityMap(seed);
        } catch {
          data.map = null;
        }
      }
      data.pose.x = info.x;
      data.pose.z = info.z;
      data.pose.yaw = Number.isFinite(info.yaw) ? info.yaw : 0;
      const want = minimapRange(info.speed, size >= 130);
      smoothRange += (want - smoothRange) * 0.12;
      data.range = smoothRange;
      try {
        data.dots = typeof api.getTrafficDots === 'function' ? api.getTrafficDots() : null;
        data.marker = typeof api.getDriveMarker === 'function' ? api.getDriveMarker() : null;
      } catch {
        data.dots = null;
        data.marker = null;
      }
      try {
        drawCityMinimap(ctx, size, data);
      } catch {
        // bozuk veri arayüzü düşürmesin
      }
    };
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      clearInterval(labelTimer);
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    };
  }, [api, size, paused]);

  const inner = <canvas ref={canvasRef} className="kv-map-canvas" width={size} height={size} aria-hidden="true" />;
  const style = { width: size, height: size };
  return onOpen ? (
    <button type="button" className="kv-map" data-testid="drive-map" data-no-tap style={style} onClick={onOpen} aria-label={label + ' Büyük haritayı açmak için dokun.'}>
      {inner}
    </button>
  ) : (
    <div className="kv-map" data-testid="drive-map" data-no-tap role="img" style={style} aria-label={label}>
      {inner}
    </div>
  );
};

export default memo(CityMinimap);
