/*
 * gameApi.setCosmetics: canlı Keşif görünümü yüzeyi (sahte G): yok edilmiş oyunda etkisiz, denetleyiciye devreder, bozuk girdi istisna fırlatmaz.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildApi } from './gameApi.js';
import { createCosmetics } from './render/cosmetics.js';

function mk(over) {
  const G = {
    destroyed: false,
    registry: { mergeApi() {} },
    settings: {},
    opts: {},
    quality: { settings: { effTier: 'high' } },
    ...over,
  };
  const d = { ui: {}, render: {}, frameStats: {}, loop: { running: false }, cpuStats: {}, renderStats: {}, stepper: {}, player: {} };
  return { G, api: buildApi(G, d) };
}

describe('api.setCosmetics', () => {
  it('çekirdek api yüzeyinde; denetleyiciye devreder ve sonucu döner', () => {
    const set = vi.fn(() => true);
    const { api } = mk({ cosmetics: { set } });
    expect(typeof api.setCosmetics).toBe('function');
    const lo = { portal: 'portal:nane-ferahi' };
    expect(api.setCosmetics(lo, { preview: true })).toBe(true);
    expect(set).toHaveBeenCalledWith(lo, { preview: true });
  });

  it('oyun yok edilmişse ya da denetleyici yoksa etkisiz (false), istisna yok', () => {
    const set = vi.fn(() => true);
    const a = mk({ destroyed: true, cosmetics: { set } });
    expect(a.api.setCosmetics({})).toBe(false);
    expect(set).not.toHaveBeenCalled();
    const b = mk({});
    expect(b.api.setCosmetics({})).toBe(false);
  });

  it('gerçek denetleyiciyle: bozuk girdi istisnasız varsayılan; geçerli yük uygulanır', () => {
    const calls = [];
    const G0 = { body: { x: 0, y: 0, z: 0 }, character: { setSkins: (s) => calls.push(s && s.key) }, fx() {} };
    const { G, api } = mk(G0);
    G.cosmetics = createCosmetics(G, null);
    [undefined, null, 5, 'x', [], { portal: 1 }, { portal: 'yok:yok' }].forEach((x) => expect(() => api.setCosmetics(x)).not.toThrow());
    expect(calls).toEqual([]);
    expect(api.setCosmetics({ portal: 'portal:nane-ferahi' })).toBe(true);
    expect(calls).toHaveLength(1);
    expect(api.setCosmetics({ portal: 'portal:nane-ferahi' })).toBe(false);
    expect(api.setCosmetics(null)).toBe(true);
    expect(calls[1]).toBeNull();
  });
});
