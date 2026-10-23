import { describe, expect, it } from 'vitest';
import { atlasTileSize, createAtlasBuilder, generateAtlasPixels } from './atlas.js';

describe('artımlı atlas üreticisi', () => {
  it('createAtlasBuilder ile üretim, generateAtlasPixels ile BİREBİR aynı (özet + tamponlar)', () => {
    const ref = generateAtlasPixels({ quality: 'low' });
    const b = createAtlasBuilder({ quality: 'low' });
    let steps = 0;
    while (!b.step(0.2)) steps++; // çok küçük bütçe: her çağrıda ≥ 1 doku ilerler
    const px = b.finish();
    expect(px.hash).toBe(ref.hash);
    expect(px.width).toBe(ref.width);
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    expect(same(px.color, ref.color)).toBe(true);
    expect(same(px.normal, ref.normal)).toBe(true);
    expect(same(px.material, ref.material)).toBe(true);
    expect(steps).toBeGreaterThan(5); // gerçekten parçalara bölündü
  });

  it('step(maxMs) en az bir doku ilerletir, ilerleme tekdüze artar, bitince done', () => {
    const b = createAtlasBuilder({ quality: 'low' });
    expect(b.done).toBe(false);
    expect(b.progress).toBe(0);
    let last = 0;
    let n = 0;
    while (!b.step(0)) {
      expect(b.progress).toBeGreaterThan(last);
      last = b.progress;
      n++;
      if (n > 5000) throw new Error('bitmedi');
    }
    expect(b.done).toBe(true);
    expect(b.progress).toBe(1);
  });

  it('finish() eksik kalan dokuları tamamlar (step çağrılmadan da çalışır)', () => {
    const a = createAtlasBuilder({ quality: 'low' }).finish();
    expect(a.hash).toBe(generateAtlasPixels({ quality: 'low' }).hash);
  });

  it('atlasTileSize: low 16, medium ve high 32 (aynı piksel → manuel medium↔high geçişinde yeniden üretim gerekmez)', () => {
    expect(atlasTileSize({ quality: 'low' })).toBe(16);
    expect(atlasTileSize({ quality: 'medium' })).toBe(32);
    expect(atlasTileSize({ quality: 'high' })).toBe(32);
    expect(generateAtlasPixels({ quality: 'medium' }).hash).toBe(generateAtlasPixels({ quality: 'high' }).hash);
  });
});
