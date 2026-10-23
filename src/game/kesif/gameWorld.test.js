import { describe, expect, it } from 'vitest';
import {
  createModeWorld, findSafeSpawn, standableAt, resolveSeed, mapTimePhase,
} from './gameWorld.js';
import { B, isSolid } from './sim/blocks.js';
import { parseWorldCode } from './sim/rng.js';
import { buildInsaMap } from './sim/saveMapIO.js';
import { ZONES, zoneIndexAt } from './sim/constants.js';

describe('resolveSeed', () => {
  it('Dünya Kodu: seed = parseWorldCode, kod aynen (küçük harf/tire temizlenir)', () => {
    const r = resolveSeed('abcd-1234');
    expect(r.worldCode).toBe('ABCD1234');
    expect(r.seed).toBe(parseWorldCode('ABCD1234'));
    expect(r.seedInput).toBe('ABCD1234');
    expect(resolveSeed(r.seedInput)).toEqual(r);
  });
  it('serbest metin: belirlenimci kod türetilir ve kod paylaşılınca aynı dünya (yuvarlak gidiş-dönüş)', () => {
    const a = resolveSeed('merhaba');
    expect(a).toEqual(resolveSeed('merhaba'));
    expect(a.worldCode).toMatch(/^[0-9A-Z]{8}$/);
    const b = resolveSeed(a.worldCode);
    expect(b.seed).toBe(a.seed);
    expect(b.worldCode).toBe(a.worldCode);
    expect(resolveSeed(a.seedInput).seed).toBe(a.seed);
  });
  it('sayı: kimlik (kayıttan gelen çözülmüş tohum aynı dünyayı verir); boş girdi 0', () => {
    const a = resolveSeed('merhaba');
    expect(resolveSeed(a.seed).seed).toBe(a.seed);
    expect(resolveSeed(12345).seed).toBe(12345);
    expect(resolveSeed('12345').seed).toBe(12345);
    expect(resolveSeed(undefined).seed).toBe(0);
    expect(resolveSeed(12345).worldCode).toMatch(/^[0-9A-Z]{8}$/);
  });
});

describe('mapTimePhase', () => {
  it('gün batımı 0,5 / gece 0,75 / diğer gündüz', () => {
    expect(mapTimePhase('gün batımı')).toBe(0.5);
    expect(mapTimePhase('gece')).toBe(0.75);
    expect(mapTimePhase('gündüz')).toBeGreaterThan(0.1);
    expect(mapTimePhase('gündüz')).toBeLessThan(0.4);
    expect(mapTimePhase('x')).toBe(mapTimePhase('gündüz'));
  });
});

describe('createModeWorld macera', () => {
  const m = createModeWorld({ mode: 'macera', seed: 'test-dunya-1' });
  it('sınırsız dünya, Başlangıç Vadisi içinde güvenli doğuş', () => {
    expect(m.mode).toBe('macera');
    expect(m.world.frame).toBe(false);
    expect(m.world.bounds).toBeNull();
    expect(zoneIndexAt(m.spawn.x, m.spawn.z)).toBe(0);
    expect(Math.hypot(m.spawn.x, m.spawn.z)).toBeLessThan(ZONES[0].rOut);
    expect(standableAt(m.world, Math.floor(m.spawn.x), m.spawn.y, Math.floor(m.spawn.z))).toBe(true);
    expect(m.frozenClock).toBe(false);
    expect(m.mapMeta).toBeNull();
  });
  it('doğuş zemini katı ve zararsız, ayak/baş hücreleri boş', () => {
    const bx = Math.floor(m.spawn.x);
    const bz = Math.floor(m.spawn.z);
    const under = m.world.getBlock(bx, m.spawn.y - 1, bz);
    expect([B.WATER, B.LAVA, B.AIR]).not.toContain(under);
    // ayak/baş hücresi katı değil (çiçek/ot olabilir)
    expect(isSolid(m.world.getBlock(bx, m.spawn.y, bz))).toBe(false);
    expect(isSolid(m.world.getBlock(bx, m.spawn.y + 1, bz))).toBe(false);
  });
  it('aynı tohum → aynı doğuş', () => {
    const m2 = createModeWorld({ mode: 'macera', seed: 'test-dunya-1' });
    expect(m2.spawn).toEqual(m.spawn);
    expect(m2.worldCode).toBe(m.worldCode);
  });
  it('mühür: kilitli bölgeler dışarıda üretilemez (zoneUnlocked kancası)', () => {
    let unlocked = false;
    const w = createModeWorld({ mode: 'macera', seed: 7, zoneUnlocked: (i) => (i === 1 ? unlocked : false) }).world;
    const outer = Math.ceil((ZONES[0].rOut + 1) / 16); // merkezi bölge 1'de kalan ilk chunk
    expect(w.canGenerate(outer, 0)).toBe(false);
    unlocked = true;
    expect(w.canGenerate(outer, 0)).toBe(true);
  });
});

describe('createModeWorld insa/harita', () => {
  it('insa tabanları 8×8 chunk sınırlı; doğuş sınır içinde ve güvenli', () => {
    ['düz', 'ada', 'boş', 'çayır'].forEach((base) => {
      const r = createModeWorld({ mode: 'insa', base });
      expect(r.world.frame).toBe(true);
      expect(r.world.bounds).toMatchObject({ minCx: 0, maxCx: 7, minCz: 0, maxCz: 7 });
      expect(r.world.isBlockInBounds(Math.floor(r.spawn.x), Math.floor(r.spawn.z))).toBe(true);
      expect(standableAt(r.world, Math.floor(r.spawn.x), r.spawn.y, Math.floor(r.spawn.z))).toBe(true);
      expect(r.frozenClock).toBe(true);
      expect(r.errors).toEqual([]);
    });
  });

  it('harita: insa ile yapılan düzenleme haritaya dönüşür ve harita modunda aynen yüklenir', () => {
    const a = createModeWorld({ mode: 'insa', base: 'düz' });
    a.world.ensureChunk(4, 4);
    expect(a.world.setBlock(70, 64, 70, B.BRICK)).toBe(true);
    const built = buildInsaMap(a.world, { title: 'Deneme', spawn: [64.5, 64, 64.5], time: 'gece' });
    expect(built.ok).toBe(true);
    const h = createModeWorld({ mode: 'harita', mapData: built.map });
    expect(h.errors).toEqual([]);
    expect(h.mode).toBe('harita');
    expect(h.time).toBe('gece');
    expect(h.phase).toBe(0.75);
    expect(h.mapMeta.title).toBe('Deneme');
    h.world.ensureChunk(4, 4);
    expect(h.world.getBlock(70, 64, 70)).toBe(B.BRICK);
    // çerçeve dışı yazma reddedilir (kaçış yok)
    expect(h.world.setBlock(-5, 64, 5, B.STONE)).toBe(false);
  });

  it('geçersiz/eksik harita → taban dünyaya düşer ve Türkçe hata verir', () => {
    const bad = createModeWorld({ mode: 'harita', mapData: { v: 99, nonsense: true } });
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(bad.world.frame).toBe(true);
    expect(standableAt(bad.world, Math.floor(bad.spawn.x), bad.spawn.y, Math.floor(bad.spawn.z))).toBe(true);
    const none = createModeWorld({ mode: 'harita' });
    expect(none.errors.length).toBe(1);
  });

  it('harita doğuşu duvarın içindeyse güvenli noktaya çekilir', () => {
    const a = createModeWorld({ mode: 'insa', base: 'düz' });
    const map = buildInsaMap(a.world, { spawn: [64.5, 64, 64.5] }).map;
    map.spawn = [10.5, 20, 10.5]; // yer altı (taş) ortasında
    const h = createModeWorld({ mode: 'harita', mapData: map });
    expect(standableAt(h.world, Math.floor(h.spawn.x), h.spawn.y, Math.floor(h.spawn.z))).toBe(true);
    expect(h.world.isBlockInBounds(Math.floor(h.spawn.x), Math.floor(h.spawn.z))).toBe(true);
  });
});

describe('findSafeSpawn', () => {
  it('suyun/boşluğun üstünden güvenli zemine kayar; çerçeve dışına çıkmaz', () => {
    const r = createModeWorld({ mode: 'insa', base: 'boş' });
    // boş taban: yalnız 7×7 platform; uzak nokta → platforma çekilir
    const s = findSafeSpawn(r.world, 100.5, 70, 100.5, { maxR: 40 });
    expect(s.ok).toBe(true);
    expect(r.world.isBlockInBounds(Math.floor(s.x), Math.floor(s.z))).toBe(true);
    expect(standableAt(r.world, Math.floor(s.x), s.y, Math.floor(s.z))).toBe(true);
  });
  it('aranan yarıçapta yoksa ok:false döner (asla fırlatmaz)', () => {
    const r = createModeWorld({ mode: 'insa', base: 'boş' });
    const s = findSafeSpawn(r.world, 100.5, 70, 100.5, { maxR: 2 });
    expect(s.ok).toBe(false);
    expect(Number.isFinite(s.x + s.y + s.z)).toBe(true);
  });
  it('uzak ışınlanma: komşu chunklar peşinen değil GEREKİRSE üretilir (eskiden r=20 → ~9 chunk ≈ 100–350 ms tek karede)', () => {
    const m = createModeWorld({ mode: 'macera', seed: 'lazy-tp' });
    const w = m.world;
    let n = 0;
    const orig = w.ensureChunk.bind(w);
    w.ensureChunk = (cx, cz) => { n++; return orig(cx, cz); };
    const far = 5 * 16 + 8; // bölge 0 içinde (mühürsüz), doğuştan uzak, hiç yüklenmemiş bir yer
    expect(w.hasChunk(far >> 4, 0)).toBe(false);
    const s = findSafeSpawn(w, far, NaN, 8, { maxR: 24, lazy: true });
    expect(s.ok).toBe(true);
    expect(standableAt(w, Math.floor(s.x), s.y, Math.floor(s.z))).toBe(true);
    // ilk sütun uygunsa tek chunk; uygun değilse spiral birkaç komşuya uzanabilir ama peşin 3×3 halka üretilmez
    expect(n).toBeLessThanOrEqual(4);
  });
  it('lazy üretim sonucu eskisiyle aynı: yüklü ve yüklü olmayan dünyada aynı güvenli nokta', () => {
    const a = createModeWorld({ mode: 'macera', seed: 'lazy-same' }).world;
    const b = createModeWorld({ mode: 'macera', seed: 'lazy-same' }).world;
    // b: ilgili bölgeyi peşinen yükle (eski davranışın sonucu); a: tembel
    for (let cz = -2; cz <= 2; cz++) for (let cx = 3; cx <= 7; cx++) if (b.canGenerate(cx, cz)) b.ensureChunk(cx, cz);
    const sa = findSafeSpawn(a, 5 * 16 + 3, NaN, 5, { maxR: 24, lazy: true });
    const sb = findSafeSpawn(b, 5 * 16 + 3, NaN, 5, { maxR: 24 });
    expect(sa.ok).toBe(true);
    expect(sa).toEqual(sb);
  });
  it('varsayılan (doğuş kurulumu) peşin yükler: çevre 3×3 chunk hazırdır; lazy yalnız merkezi yükler', () => {
    const e = createModeWorld({ mode: 'macera', seed: 'eager' }).world;
    const l = createModeWorld({ mode: 'macera', seed: 'eager' }).world;
    const cx = 5;
    expect(e.hasChunk(cx, 0)).toBe(false);
    findSafeSpawn(e, cx * 16 + 8, NaN, 8, { maxR: 24 });
    findSafeSpawn(l, cx * 16 + 8, NaN, 8, { maxR: 24, lazy: true });
    const count = (w) => { let n = 0; for (let z = -2; z <= 2; z++) for (let x = cx - 2; x <= cx + 2; x++) if (w.hasChunk(x, z)) n++; return n; };
    expect(count(e)).toBeGreaterThanOrEqual(9);
    expect(count(l)).toBeLessThan(count(e));
  });
});
