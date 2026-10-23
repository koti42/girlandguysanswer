import React, { memo, useEffect, useRef } from 'react';
import { clamp } from './kxHudUtils.js';
import { drawMinimap, paintTiles } from './kxMinimapDraw.js';

const TILE_REFRESH_MS = 1500;
const DRAW_MIN_GAP_MS = 33;

/*
 * Mini harita: küçük yuvarlak canvas; oyuncunun bakış yönü her zaman yukarıdadır (harita yaw ile döner).
 * Bölge halkaları (mühür sınırları), keşfedilmiş işaretler ve kuzey "K" harfi çizilir.
 *
 * Verimlilik: getMapInfo() düşük sıklıkta (pollMs, varsayılan 300 ms) okunur; döşeme verisi (tiles) ayrı bir
 * ekran dışı canvas'a en çok ~1,5 sn'de bir yeniden boyanır. Ekrana çizim yalnızca oyuncu konumu/yönü
 * ya da veri değişince yapılır; sekme gizliyken ve `paused` iken hiçbir iş yapılmaz.
 *
 * getMapInfo() → { zone:{id,name}, size:number|{x,z}, player:{x,z,yaw}, spawn:{x,z},
 *                  tiles:{w,h,data:Uint8Array,palette:[hex]}, markers:[{type,name,x,z,discovered,color,track?}] }
 *   - Döşeme ızgarası dünyayı (0,0) merkezli kaplar: x ∈ [-size/2, size/2) → [0,w). `info.bounds`
 *     ({minX,minZ,maxX,maxZ}) verilirse o esas alınır.
 *   - Döşeme değeri 0 = bilinmiyor; renk = palette[v] (yoksa palette[v-1]) .
 * getPose() (isteğe bağlı, ucuz) → { x, z, yaw }: akıcı dönüş için kare başına okunur (≤ 30 Hz çizim).
 */

const Minimap = ({ getMapInfo, getPose, size = 92, radiusBlocks = 44, pollMs = 300, paused = false, onOpen, label }) => {
  const canvasRef = useRef(null);
  const infoRef = useRef(null);
  const zoneRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || paused || typeof getMapInfo !== 'function') return undefined;
    const dpr = clamp(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1, 2);
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
    const off = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    let offReady = false;
    let lastTiles = 0;
    let lastTileData = null;
    let dirty = true;
    let lastX = NaN;
    let lastZ = NaN;
    let lastYaw = NaN;
    let lastDraw = 0;
    let raf = 0;
    let alive = true;
    const opts = { radiusBlocks, dpr };
    const sizeCss = size;
    // Çizim "css px" uzayında; setTransform(dpr) içeride uygulanır.
    const draw = (pose) => {
      try {
        drawMinimap(ctx, sizeCss, infoRef.current, pose, offReady ? off : null, opts);
      } catch {
        // Bozuk harita verisi arayüzü düşürmesin.
      }
    };

    const poll = () => {
      let info = null;
      try {
        info = getMapInfo();
      } catch {
        info = null;
      }
      if (!info) return;
      infoRef.current = info;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const t = info.tiles;
      if (off && t && t.data && (t.data !== lastTileData || now - lastTiles > TILE_REFRESH_MS)) {
        try {
          offReady = paintTiles(off, t) || offReady;
        } catch {
          offReady = false;
        }
        lastTileData = t.data;
        lastTiles = now;
        dirty = true;
      }
      const zn = info.zone && info.zone.name ? info.zone.name : '';
      if (zn !== zoneRef.current) {
        zoneRef.current = zn;
        dirty = true;
      }
    };

    const frame = (ts) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (typeof document !== 'undefined' && document.hidden) return;
      if (ts - lastDraw < DRAW_MIN_GAP_MS) return;
      const info = infoRef.current;
      if (!info) return;
      let pose = null;
      if (typeof getPose === 'function') {
        try {
          pose = getPose();
        } catch {
          pose = null;
        }
      }
      if (!pose) pose = info.player;
      if (!pose || typeof pose.x !== 'number') return;
      if (!dirty && Math.abs(pose.x - lastX) < 0.05 && Math.abs(pose.z - lastZ) < 0.05 && Math.abs((pose.yaw || 0) - lastYaw) < 0.004) return;
      dirty = false;
      lastX = pose.x;
      lastZ = pose.z;
      lastYaw = pose.yaw || 0;
      lastDraw = ts;
      draw(pose);
    };

    poll();
    const iv = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) poll();
    }, Math.max(100, pollMs));
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      clearInterval(iv);
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    };
  }, [getMapInfo, getPose, size, radiusBlocks, pollMs, paused]);

  const aria = label || 'Mini harita. Büyük haritayı açmak için dokun.';
  const inner = <canvas ref={canvasRef} className="kx-minimap-canvas" width={size} height={size} aria-hidden="true" />;
  return onOpen ? (
    <button type="button" className="kx-minimap" data-no-tap style={{ width: size, height: size }} onClick={onOpen} aria-label={aria}>
      {inner}
    </button>
  ) : (
    <div className="kx-minimap" data-no-tap role="img" style={{ width: size, height: size }} aria-label={aria}>
      {inner}
    </div>
  );
};

export default memo(Minimap);
