import { describe, expect, it } from 'vitest';
import { makeTestG } from './sessionTestKit.js';
import {
  boundsContact, deniedText, exportMap, introFor, setMapTime, setupMode, worldCodeFor,
} from './sessionModes.js';
import { validateMap, decodeBase64, MAP_RULES } from '../sim/mapFormat.js';
import { B } from '../sim/blocks.js';
import { CEILING_Y } from '../gamePlayer.js';

function insaG(extra) {
  const G = makeTestG(Object.assign({ mode: 'insa', base: 'düz' }, extra || {}));
  G.worldReady = true;
  return G;
}

function build(G) {
  for (let cz = 0; cz < 3; cz++) for (let cx = 0; cx < 3; cx++) G.world.ensureChunk(cx, cz);
  for (let x = 20; x < 28; x++) for (let z = 20; z < 28; z++) G.world.setBlock(x, 50, z, 1 + ((x + z) % 9));
  G.world.setBlock(21, 51, 21, 110); // sistem bloğu (yasak)
  G.world.setBlock(22, 51, 21, 101);
}

/** PHP doğrulayıcısı kurallarının bağımsız bir uygulaması (addendum §A). */
function phpRules(map) {
  const errs = [];
  if (map.v !== 1) errs.push('v');
  if (['düz', 'ada', 'boş', 'çayır'].indexOf(map.base) < 0) errs.push('base');
  if (!map.size || map.size.x !== 128 || map.size.z !== 128) errs.push('size');
  if (!Array.isArray(map.spawn) || map.spawn.length !== 3 || !map.spawn.every((n) => Number.isFinite(n))) errs.push('spawn');
  else if (map.spawn[0] < 0 || map.spawn[0] >= 128 || map.spawn[1] < 0 || map.spawn[1] >= 128 || map.spawn[2] < 0 || map.spawn[2] >= 128) errs.push('spawn-range');
  const keys = Object.keys(map.chunks);
  if (keys.length > 64) errs.push('chunks>64');
  let total = 0;
  keys.forEach((k) => {
    const m = /^(0|[1-9][0-9]*),(0|[1-9][0-9]*)$/.exec(k);
    if (!m || Number(m[1]) > 7 || Number(m[2]) > 7) errs.push('key:' + k);
    const str = map.chunks[k];
    total += str.length;
    const bytes = decodeBase64(str);
    if (!bytes || bytes.length % 3 !== 0) {
      errs.push('rle:' + k);
      return;
    }
    let sum = 0;
    for (let i = 0; i < bytes.length; i += 3) {
      const v = bytes[i];
      const len = bytes[i + 1] | (bytes[i + 2] << 8);
      if (len === 0) errs.push('zero-run:' + k);
      if (v > 99) errs.push('id>99:' + k);
      sum += len;
    }
    if (sum !== 32768) errs.push('len:' + k);
  });
  if (total > 700 * 1024) errs.push('bytes');
  if (map.meta && Array.from(map.meta.title || '').length > 60) errs.push('title');
  return errs;
}

describe('harita dışa aktarımı', () => {
  it('geçerli harita üretir; sistem blokları kırpılır; PHP kuralları sağlanır', () => {
    const G = insaG();
    build(G);
    G.mapMeta.title = 'Kalem Kale';
    const r = exportMap(G, { desc: 'Güzel bir harita' });
    expect(r.ok).toBe(true);
    expect(validateMap(r.map).ok).toBe(true);
    expect(phpRules(r.map)).toEqual([]);
    expect(r.meta.title).toBe('Kalem Kale');
    expect(r.meta.desc).toBe('Güzel bir harita');
    expect(r.meta.blockCount).toBeGreaterThan(0);
    expect(r.meta.chunkCount).toBeGreaterThan(0);
    expect(r.meta.spawn).toHaveLength(3);
    expect(r.meta.time).toBe('gündüz');
    expect(r.errors).toEqual([]);
    // düzenlenmiş chunk'lar dışındakiler eklenmez
    expect(Object.keys(r.map.chunks).length).toBeLessThan(10);
  });

  it('yasak (sistem) blok yerine taş/hava konur', () => {
    const G = insaG();
    build(G);
    const r = exportMap(G);
    const bytes = decodeBase64(r.map.chunks['1,1'] || r.map.chunks['1,0']);
    expect(bytes).not.toBe(null);
    for (let i = 0; i < bytes.length; i += 3) expect(bytes[i]).toBeLessThanOrEqual(99);
  });

  it('hiçbir şey inşa edilmediyse reddeder (Türkçe neden)', () => {
    const G = insaG();
    const r = exportMap(G);
    expect(r.ok).toBe(false);
    expect(r.map).toBe(null);
    expect(r.codes).toEqual(['empty']);
    expect(r.errors[0]).toMatch(/inşa/);
  });

  it('inşa dışı modda reddeder', () => {
    const G = insaG();
    G.mode = 'harita';
    const r = exportMap(G);
    expect(r.ok).toBe(false);
    expect(r.codes).toEqual(['mode']);
  });

  it('başlık temizlenir ve 60 karaktere kırpılır; HTML işaretleri atılır', () => {
    const G = insaG();
    build(G);
    const r = exportMap(G, { title: '<b>' + 'ğ'.repeat(80) + '</b>', desc: 'x\ny' });
    expect(r.ok).toBe(true);
    expect(Array.from(r.meta.title).length).toBe(60);
    expect(r.meta.title.indexOf('<')).toBe(-1);
    expect(r.meta.desc).toBe('x y');
    expect(validateMap(r.map).ok).toBe(true);
  });

  it('gece saati haritaya yazılır; setMapTime saati kilitler', () => {
    const G = insaG();
    build(G);
    expect(setMapTime(G, 'gece')).toBe('gece');
    expect(G.clock.frozen).toBe(true);
    expect(G.mapMeta.time).toBe('gece');
    expect(exportMap(G).map.time).toBe('gece');
    expect(setMapTime(G, 'gün batımı')).toBe('gün batımı');
    expect(setMapTime(G, 'öğlen')).toBe(null);
    G.mode = 'macera';
    expect(setMapTime(G, 'gece')).toBe(null);
  });

  it('var olan haritayla başlayıp dokunmadan dışa aktarma içeriği korur', () => {
    const A = insaG();
    build(A);
    const first = exportMap(A);
    expect(first.ok).toBe(true);
    const B2 = insaG({ mapData: first.map });
    const again = exportMap(B2);
    expect(again.ok).toBe(true);
    Object.keys(first.map.chunks).forEach((k) => {
      expect(again.map.chunks[k]).toBe(first.map.chunks[k]);
    });
    // JSON metni olarak verilen harita
    const C = insaG({ mapData: JSON.stringify(first.map) });
    expect(exportMap(C).ok).toBe(true);
  });

  it('en kötü durum: 64 chunk tamamen dolu (rastgele) → boyut sınırı ihlali Türkçe hata ile reddedilir', () => {
    const G = insaG();
    for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) G.world.ensureChunk(cx, cz);
    let s = 1;
    for (let cz = 0; cz < 8; cz++) {
      for (let cx = 0; cx < 8; cx++) {
        const c = G.world.getChunk(cx, cz);
        const dense = new Uint8Array(32768);
        for (let i = 0; i < dense.length; i++) {
          s = (Math.imul(s, 1103515245) + 12345) >>> 0;
          dense[i] = s % 90;
        }
        c.loadDense(dense, 0);
        c.edited = true;
      }
    }
    const r = exportMap(G);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(typeof r.errors[0]).toBe('string');
    expect(r.map).toBe(null);
  });

  it('kurallar tablosu ile uyumlu sabitler', () => {
    expect(MAP_RULES.maxChunks).toBe(64);
  });
});

describe('mod kurulumu', () => {
  it('harita modu salt okunur; diğerleri değil', () => {
    const H = makeTestG({ mode: 'harita', base: 'düz' });
    expect(setupMode(H)).toBe(true);
    expect(H.readOnly).toBe(true);
    expect(H.buildBounds).toEqual({
      minCx: 0, maxCx: 7, minCz: 0, maxCz: 7,
    });
    const I = insaG();
    expect(setupMode(I)).toBe(false);
    expect(I.readOnly).toBe(false);
    expect(I.buildBounds).not.toBe(null);
  });

  it('dünya kodu yalnız macera için', () => {
    const I = insaG();
    expect(worldCodeFor(I)).toBe('');
    I.mode = 'macera';
    I.worldCode = 'ABCD1234';
    expect(worldCodeFor(I)).toBe('ABCD1234');
  });

  it('reddedilme metinleri Türkçe ve bilinmeyen sebep için sistem metni', () => {
    ['readOnly', 'bounds', 'height', 'system', 'protected'].forEach((k) => expect(deniedText(k).length).toBeGreaterThan(10));
    expect(deniedText('???')).toBe(deniedText('system'));
  });
});

describe('açılış duyuruları', () => {
  it('yeni macera: Dünya Kodu başlığı + ilk adım ipucu', () => {
    const G = makeTestG({ mode: 'insa', base: 'düz' });
    G.mode = 'macera';
    G.worldCode = 'K7P2QX9M';
    const intro = introFor(G, { resumed: false });
    expect(intro.banners[0].text).toBe('Dünya Kodu: K7P2QX9M');
    expect(intro.banners[0].sub).toMatch(/Başlangıç Vadisi/);
    expect(intro.hints[0].text).toMatch(/ağaca/);
    expect(intro.hints[0].text).toMatch(/sol tık/);
    G.inputState.touch = true;
    expect(introFor(G, { resumed: false }).hints[0].text).toMatch(/düğme/);
  });

  it('devam: ipucu yok, başlık "Maceraya devam"', () => {
    const G = makeTestG({ mode: 'insa', base: 'düz' });
    G.mode = 'macera';
    G.worldCode = 'K7P2QX9M';
    const intro = introFor(G, { resumed: true });
    expect(intro.banners[0].text).toBe('Maceraya devam');
    expect(intro.hints).toHaveLength(0);
  });

  it('kayıt okunamadı duyurusu en önde', () => {
    const G = insaG();
    const intro = introFor(G, { resumed: false, restoreError: true });
    expect(intro.banners[0].text).toBe('Kayıt okunamadı');
    expect(intro.banners).toHaveLength(2);
  });

  it('inşa ve harita açılışları', () => {
    const I = insaG();
    expect(introFor(I).banners[0].text).toBe('İnşa Alanı');
    expect(introFor(I).hints[0].text).toMatch(/uçuş/);
    expect(introFor(I, { resumed: true }).hints).toHaveLength(0);
    const H = makeTestG({ mode: 'harita', base: 'düz' });
    H.mapMeta.title = 'Gizemli Ada';
    const hi = introFor(H);
    expect(hi.banners[0].text).toBe('Gizemli Ada');
    expect(hi.banners[0].sub).toMatch(/salt okunur/);
    H.mapMeta.title = '';
    expect(introFor(H).banners[0].text).toBe('Topluluk Haritası');
  });
});

describe('sınır teması', () => {
  it('kenara dayanıp hareket etmek istenince bildirir; ortada ve macerada yok', () => {
    const G = insaG();
    setupMode(G);
    G.body.x = 64; G.body.z = 64; G.body.y = 60;
    G.inputState.moveZ = 1;
    expect(boundsContact(G)).toBe(null);
    G.body.x = 0.3 + 0.002;
    expect(boundsContact(G)).toBe('bounds');
    G.inputState.moveZ = 0;
    G.inputState.moveX = 0;
    expect(boundsContact(G)).toBe(null); // hareket isteği yok
    G.inputState.moveX = 1;
    G.body.x = 128 - 0.3 - 0.002;
    expect(boundsContact(G)).toBe('bounds');
    G.body.x = 64;
    G.body.y = CEILING_Y;
    expect(boundsContact(G)).toBe('height');
    // macera: yapı alanı sınırı yok; yalnız kendi tavanı (World.yTop) 'height' verir
    G.mode = 'macera';
    G.world = { legacy: false, yTop: 363 };
    G.body.y = CEILING_Y;
    expect(boundsContact(G)).toBe(null);
    G.body.y = 363;
    expect(boundsContact(G)).toBe('height');
  });

  it('tavanda durup beklemek "tavana ulaştın" ipucunu tekrarlatmaz; yukarı/ileri denemek eder', () => {
    const G = insaG();
    setupMode(G);
    G.body.x = 64; G.body.z = 64; G.body.y = CEILING_Y;
    G.inputState.moveX = 0;
    G.inputState.moveZ = 0;
    G.inputState.jump = false;
    expect(boundsContact(G)).toBe(null);
    G.inputState.jump = true;
    expect(boundsContact(G)).toBe('height');
    G.inputState.jump = false;
    G.inputState.moveZ = 1;
    expect(boundsContact(G)).toBe('height');
  });
});

describe('sistem blok kimlikleri', () => {
  it('B tablosu beklenen sabitleri taşır', () => {
    expect(B.AIR).toBe(0);
  });
});
