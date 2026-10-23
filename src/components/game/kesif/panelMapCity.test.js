import { describe, expect, it } from 'vitest';
import { buildTileRGBA, markerInfo, normalizeMarkers, zoneRings } from './panelMap.js';
import { drawMinimap } from './kxMinimapDraw.js';
import { CITY_MAP_PALETTE } from '../../../game/kesif/sim/city/cityMapRaster.js';

/** qa_p1 G5: şehir haritası — ana diyar bölge halkaları çizilmez; Boyut Terminali işareti; şehir paleti döşeme olarak okunur. */
describe('şehir haritası arayüzü', () => {
  it('zoneRings: ana diyarda 6 halka; şehirde (dim neon) hiç', () => {
    expect(zoneRings({ zones: [] }).length).toBeGreaterThan(0);
    expect(zoneRings({ dim: 'neon', zones: [] })).toEqual([]);
  });

  it('terminal işareti: etiket + elmas şekli; normalizeMarkers korur', () => {
    expect(markerInfo('terminal')).toEqual({ label: 'Boyut Terminali', shape: 'diamond' });
    const m = normalizeMarkers([{ id: 'terminal:0', type: 'terminal', name: 'Kapı Meydanı Terminali', x: 0, z: 0, discovered: true, color: '#4fe3d6' }]);
    expect(m[0]).toMatchObject({ key: 'terminal:0', shape: 'diamond', label: 'Boyut Terminali', discovered: true });
  });

  it('şehir paleti paletteBase:1 ile 1..7 değerlerini boyar (bilinmeyen değil)', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 0]);
    const t = buildTileRGBA({ w: 4, h: 2, data, palette: CITY_MAP_PALETTE, paletteBase: 1 });
    expect(t.known).toBe(7);
  });

  it('mini harita: şehirde halka yayı çizilmez', () => {
    const arcs = [];
    const ctx = new Proxy({}, {
      get(_t, k) {
        if (k === 'arc') return (x, y, r) => { arcs.push(r); };
        return () => {};
      },
      set() { return true; },
    });
    const pose = { x: 0, z: 0, yaw: 0 };
    drawMinimap(ctx, 100, { dim: 'neon', zone: { id: 0, name: 'Merkez' }, bounds: { minX: -800, minZ: -800, maxX: 800, maxZ: 800 }, markers: [] }, pose, null, { radiusBlocks: 48, dpr: 1 });
    // clip dairesi (1 yay) dışında yay yok
    expect(arcs.length).toBe(1);
    arcs.length = 0;
    drawMinimap(ctx, 100, { zone: { id: 0, name: 'Merkez' }, markers: [] }, pose, null, { radiusBlocks: 48, dpr: 1 });
    expect(arcs.length).toBeGreaterThan(1);
  });
});
