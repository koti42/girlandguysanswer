import { describe, expect, it } from 'vitest';
import { sanitizeCityState, ensureCityState } from '../cityState.js';
import { sanitizeNeon } from '../../dim/dimSanitize.js';
import { decodePhotoState, applyShot, SUBJECT_IDS } from './photoTargets.js';
import {
  cityMapLayer, decodePmap, emptyPmap, mapPoiList, poiBit, setPoiBit,
} from './mapFog.js';
import { dimSeed } from '../../dim/dimensions.js';
import { mulberry32 } from '../../rng.js';

const SEED = dimSeed(77, 'neon');

describe('foto albümü ve harita durumu: kayıt (city.photo, city.pmap)', () => {
  it('gidiş-dönüş: sanitize + JSON bayt-aynı; ensureCityState alanları eklemez (varsayılan kayda girmez)', () => {
    const st = decodePhotoState(null);
    applyShot(st, ['terminal', 'arac'], null);
    const pm = emptyPmap();
    setPoiBit(pm, 3);
    setPoiBit(pm, 40);
    const raw = { v: 1, kredi: 120, photo: st, pmap: pm, stats: { dmask: 5, tmask: 9 } };
    const a = sanitizeCityState(raw);
    const b = sanitizeCityState(JSON.parse(JSON.stringify(a)));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.photo).toEqual(st);
    expect(a.pmap).toEqual(pm);
    const c = ensureCityState({ v: 1 });
    expect('photo' in c).toBe(false);
    expect('pmap' in c).toBe(false);
  });

  it('boyut kaydı sanitizer\'ı da korur (dims.neon.city)', () => {
    const st = decodePhotoState(null);
    applyShot(st, ['robot'], null);
    const pm = emptyPmap();
    setPoiBit(pm, 7);
    const neon = sanitizeNeon({ v: 1, city: { v: 1, kredi: 5, photo: st, pmap: pm } });
    expect(neon.city.photo).toEqual(st);
    expect(neon.city.pmap).toEqual(pm);
  });

  it('fuzz: bozuk/kötü niyetli photo ve pmap sanitize + çözümden sonra GEÇERLİ aralıkta kalır, atmaz', () => {
    const r = mulberry32(77);
    const junk = [NaN, Infinity, -1, 1e30, 'x', null, undefined, {}, [], [1, 2, 3, 4, 5, 6], { __proto__: { evil: 1 } }, true, '__proto__'];
    const pick = () => junk[Math.floor(r() * junk.length)];
    for (let i = 0; i < 300; i++) {
      const raw = {
        v: 1,
        photo: r() < 0.5 ? { n: pick(), s: pick(), a: pick(), w: pick(), extra: pick() } : pick(),
        pmap: r() < 0.5 ? { p: [pick(), pick(), pick(), pick(), pick()] } : pick(),
        stats: { dmask: pick(), tmask: pick(), mmask: pick() },
      };
      const clean = sanitizeCityState(raw);
      const ps = decodePhotoState(clean && clean.photo);
      expect(Number.isInteger(ps.n) && ps.n >= 0 && ps.n <= 1000000).toBe(true);
      expect(ps.s >= 0 && ps.s <= 255 && Number.isInteger(ps.s)).toBe(true);
      expect(ps.a >= 0 && ps.a <= 255).toBe(true);
      expect(ps.w === 0 || ps.w === 1).toBe(true);
      const pm = decodePmap(clean && clean.pmap);
      expect(pm.p.length).toBe(3);
      pm.p.forEach((w) => expect(Number.isInteger(w) && w >= 0 && w <= 0x3fffffff).toBe(true));
      // haritaya verilince çökmez; açık hücre sayısı sonlu
      const layer = cityMapLayer(SEED, { dmask: clean && clean.stats ? clean.stats.dmask : 0, tmask: 0, mmask: 0, pmap: clean && clean.pmap });
      expect(Number.isFinite(layer.tiles.known)).toBe(true);
    }
    // prototip kirlenmedi
    expect({}.evil).toBeUndefined();
  });

  it('yükleme sonrası harita aynı: kayıtlı pmap bitleri işaretleri ve açık döşemeleri geri verir', () => {
    const list = mapPoiList(SEED);
    const pm = emptyPmap();
    [2, 11, 25, 49].forEach((i) => setPoiBit(pm, i));
    const saved = JSON.parse(JSON.stringify(sanitizeCityState({ v: 1, pmap: pm })));
    const loaded = sanitizeCityState(saved);
    const a = cityMapLayer(SEED, { dmask: 1, tmask: 0, mmask: 0, pmap: pm });
    const b = cityMapLayer(SEED, { dmask: 1, tmask: 0, mmask: 0, pmap: loaded.pmap });
    expect(b.tiles).toBe(a.tiles); // aynı girdi → aynı önbellekli nesne
    expect(b.markers.map((m) => m.id)).toEqual(a.markers.map((m) => m.id));
    expect(a.markers.length).toBe(4);
    [2, 11, 25, 49].forEach((i) => expect(poiBit(loaded.pmap, i)).toBe(true));
    expect(list.length).toBe(54);
  });

  it('albüm ödülü yükleme sonrası tekrar verilmez (w bayrağı kalıcı)', () => {
    const st = decodePhotoState(null);
    SUBJECT_IDS.forEach((k) => applyShot(st, [k], null));
    expect(st.w).toBe(1);
    const loaded = decodePhotoState(sanitizeCityState({ v: 1, photo: JSON.parse(JSON.stringify(st)) }).photo);
    expect(loaded).toEqual(st);
    expect(applyShot(loaded, SUBJECT_IDS, null).kredi).toBe(0);
  });
});
