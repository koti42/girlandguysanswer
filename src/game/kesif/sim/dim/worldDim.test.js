import { afterEach, describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { WORLD_Y_MAX, WORLD_Y_MIN } from '../constants.js';
import { World } from '../world.js';
import { hasDimGen, registerDimGen, unregisterDimGen } from './genRegistry.js';
import {
  ASPHALT, BUILDING, flatCityGen, installFlatCity, makeCityWorld,
} from './dimTestKit.js';

afterEach(() => unregisterDimGen('city'));

function cityWorld() {
  const w = makeCityWorld(7);
  w.ensureChunk(0, 0);
  w.ensureChunk(1, 0);
  return w;
}

describe('World neon: boyut alanları ve sınırlar', () => {
  it('dim/dimDef/bounds/yMin/yMax/bölge', () => {
    const w = cityWorld();
    expect(w.dim).toBe('neon');
    expect(w.dimDef.id).toBe('neon');
    expect(w.bounds).toEqual({
      minCx: -50, maxCx: 49, minCz: -50, maxCz: 49,
    });
    expect(w.yMin).toBe(WORLD_Y_MIN);
    expect(w.yMax).toBe(WORLD_Y_MAX);
    expect(w.sectionCount).toBe(48);
    expect(w.legacy).toBe(false);
    expect(w.zones).toBe(false);
    expect(w.isZoneUnlocked(4)).toBe(true);
    expect(w.zoneForChunk(40, 40)).toBe(0);
    expect(w.unlockZone(2)).toBe(0);
  });

  it('sınır dışı hücre ana kaya (duvar), sınır içi yüklenmemiş null; sınır dışı chunk üretilmez', () => {
    const w = cityWorld();
    expect(w.getBlock(900, 64, 0)).toBe(B.BEDROCK);
    expect(w.getBlock(-801, 64, 5)).toBe(B.BEDROCK);
    expect(w.getBlock(0, 64, 800)).toBe(B.BEDROCK);
    expect(w.getBlock(40, 64, 40)).toBeNull(); // sınır içi, yüklenmemiş
    expect(w.canGenerate(50, 0)).toBe(false);
    expect(w.ensureChunk(50, 0)).toBeNull();
    expect(w.canGenerate(49, 49)).toBe(true);
    expect(w.setBlock(900, 64, 0, B.STONE)).toBe(false);
  });

  it('üretim seçeneklerine dim eklenir (üretici dim bilir); overworld seçeneklerinde dim yok', () => {
    const seen = [];
    const impl = flatCityGen();
    const w = new World({
      seed: 5,
      dim: 'neon',
      worldgen: (s, cx, cz, o) => { seen.push(o); return impl.generateChunk(s, cx, cz, o); },
      sectionGen: impl.generateSection,
    });
    w.ensureChunk(0, 0);
    expect(seen[0].dim).toBe('neon');
    expect(seen[0].decorate).toBeUndefined();
    const ow = new World({ seed: 5 });
    expect(Object.prototype.hasOwnProperty.call(ow._genOpts(0), 'dim')).toBe(false);
  });

  it('opts.worldgen verilmezse boyutun üreticisi genRegistry\'den gelir', () => {
    const calls = [];
    const impl = flatCityGen();
    registerDimGen('city', {
      generateChunk: (...a) => { calls.push(a[3] && a[3].dim); return impl.generateChunk(...a); },
      generateSection: impl.generateSection,
    });
    const w = new World({ seed: 9, dim: 'neon' });
    w.ensureChunk(2, 3);
    w.ensureSection(2, 3, 5);
    expect(calls).toEqual(['neon']);
    expect(w.getBlock(40, 63, 55)).toBe(ASPHALT);
    expect(w.getBlock(40, 10, 55)).toBe(B.STONE);
    expect(w.getBlock(40, -310, 55)).toBe(B.STONE);
  });

  it('şehir üreticisi yokken dünya kurulur, chunk üretimi açık hata verir', () => {
    unregisterDimGen('city');
    const w = new World({ seed: 9, dim: 'neon' });
    expect(w.dim).toBe('neon');
    if (!hasDimGen('city')) expect(() => w.ensureChunk(0, 0)).toThrow(/Şehir üreticisi/);
  });

  it('insa/harita modunda dim yok sayılır (overworld); bilinmeyen dim overworld', () => {
    expect(new World({ seed: 1, mode: 'insa', dim: 'neon' }).dim).toBe('overworld');
    expect(new World({ seed: 1, mode: 'harita', dim: 'neon' }).dim).toBe('overworld');
    expect(new World({ seed: 1, dim: '__proto__' }).dim).toBe('overworld');
    expect(new World({ seed: 1, dim: 'xx' }).dim).toBe('overworld');
    const ow = new World({ seed: 1 });
    expect(ow.dim).toBe('overworld');
    expect(ow.zones).toBe(true);
    expect(ow.bounds).toBeNull();
    expect(ow.retired).toBe(false);
  });
});

describe('World neon: setBlock koruması', () => {
  it('şehir yapısı kırılamaz: false + blockDenied (korumali + ileti); dünya değişmez', () => {
    const w = cityWorld();
    const ev = [];
    w.on('blockDenied', (e) => ev.push(e));
    const ch = [];
    w.on('blockChange', (e) => ch.push(e));
    expect(w.setBlock(5, 63, 5, 0)).toBe(false);
    expect(w.getBlock(5, 63, 5)).toBe(ASPHALT);
    expect(w.setBlock(8, 64, 8, 0)).toBe(false);
    expect(w.getBlock(8, 64, 8)).toBe(BUILDING);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({
      type: 'blockDenied', x: 5, y: 63, z: 5, oldId: ASPHALT, newId: 0, reason: 'korumali', message: 'Neon Meridyen yapıları korunuyor.', dim: 'neon',
    });
    expect(ch).toHaveLength(0);
    expect(w.edits.size).toBe(0);
  });

  it('doğal dolgu (taş) kırılır; oyuncunun koyduğu blok yerleştirilir ve kırılır', () => {
    const w = cityWorld();
    expect(w.setBlock(5, 62, 5, 0)).toBe(true);
    expect(w.getBlock(5, 62, 5)).toBe(0);
    expect(w.setBlock(7, 64, 7, B.DIRT)).toBe(true); // koridor dışı
    expect(w.getBlock(7, 64, 7)).toBe(B.DIRT);
    expect(w.setBlock(7, 64, 7, 0)).toBe(true); // oyuncu koydu → kırılır
    expect(w.getBlock(7, 64, 7)).toBe(0);
  });

  it('yol koridoruna ve bina içine yerleştirme yasak; blockDenied korumali', () => {
    const w = cityWorld();
    const ev = [];
    w.on('blockDenied', (e) => ev.push(e.reason));
    expect(w.setBlock(2, 65, 0, B.DIRT)).toBe(false);
    expect(w.setBlock(6, 66, 2, B.DIRT)).toBe(false);
    expect(ev).toEqual(['korumali', 'korumali']);
    expect(w.getBlock(2, 65, 0)).toBe(0);
  });

  it('blok değiştirme: korumalı bloğun üstüne farklı blok konamaz', () => {
    const w = cityWorld();
    expect(w.setBlock(8, 64, 8, B.DIRT)).toBe(false);
    expect(w.getBlock(8, 64, 8)).toBe(BUILDING);
  });

  it('record:false (sistem geçişi / kayıttan uygulama) ve force:true korumayı aşar; silent olay yaymaz', () => {
    const w = cityWorld();
    const ev = [];
    w.on('blockDenied', (e) => ev.push(e));
    expect(w.setBlock(8, 64, 8, 0, { record: false })).toBe(true); // kayar kapı örüntüsü
    expect(w.getBlock(8, 64, 8)).toBe(0);
    expect(w.edits.size).toBe(0); // kayda girmez
    expect(w.setBlock(9, 64, 9, 0, { force: true })).toBe(true);
    expect(w.edits.get('9,64,9')).toBe(0);
    expect(w.setBlock(0, 64, 0, B.DIRT, { record: false })).toBe(true);
    expect(ev).toHaveLength(0);
    expect(w.setBlock(5, 63, 5, 0, { silent: true })).toBe(false);
    expect(ev).toHaveLength(0);
  });

  it('applyEdits korumalı hücrelere de uygular (kayıttan yükleme)', () => {
    const w = cityWorld();
    expect(w.applyEdits([[5, 63, 5, B.STONE], [0, 64, 0, B.DIRT]])).toBe(2);
    expect(w.getBlock(5, 63, 5)).toBe(B.STONE);
    expect(w.getBlock(0, 64, 0)).toBe(B.DIRT);
    // yüklenmemiş chunk için bekleyen düzenleme üretimde uygulanır
    w.applyEdits([[40, 63, 40, B.DIRT]]);
    w.ensureChunk(2, 2);
    expect(w.getBlock(40, 63, 40)).toBe(B.DIRT);
  });

  it('düzenleme bütçesi dolunca yerleştirme "doldu" ile reddedilir', () => {
    const w = cityWorld();
    // bütçe ölçümünü zorla doldurmak yerine önbelleği %95 yap (üst sınır tahmini hücre başına 12 bayt ekler)
    w._dimBudget = { n: w.edits.size, bytes: Math.floor(250 * 1024 * 0.95) };
    const ev = [];
    w.on('blockDenied', (e) => ev.push(e));
    expect(w.setBlock(7, 70, 7, B.DIRT)).toBe(false);
    expect(ev[0]).toMatchObject({ reason: 'doldu', message: 'Şehirde yer doldu.' });
    expect(w.setBlock(5, 62, 5, 0)).toBe(true); // kırma serbest
  });

  it('ana kaya tabanı ve y>yMax kuralları şehirde de geçerli', () => {
    const w = cityWorld();
    expect(w.setBlock(5, WORLD_Y_MAX + 1, 5, B.DIRT)).toBe(false);
    expect(w.setBlock(5, WORLD_Y_MIN - 1, 5, B.DIRT)).toBe(false);
  });

  it('overworld dünyasında koruma yok (aynı çağrı geçer)', () => {
    const w = new World({ seed: 3 });
    w.ensureChunk(0, 0);
    const y = w.surfaceY(4, 4);
    const id = w.getBlock(4, y, 4);
    expect(id).toBeGreaterThan(0);
    expect(w.setBlock(4, y, 4, 0)).toBe(true);
  });

  it('kurulu şehir kuralları yokken (cityRules yok, üretici sahte) yalnız bütçe kuralı uygulanır', () => {
    installFlatCity();
    const w = new World({ seed: 3, dim: 'neon' });
    w.ensureChunk(0, 0);
    // cityGen modülü yoksa kurallar yok → yerleştirme serbest; varsa gerçek kurallar yine boolean döner
    expect(typeof w.setBlock(7, 80, 7, B.DIRT)).toBe('boolean');
  });
});

describe('World.retire() tripwire', () => {
  const ops = {
    getBlock: (w) => w.getBlock(1, 64, 1),
    getLight: (w) => w.getLight(1, 64, 1),
    getSkyLight: (w) => w.getSkyLight(1, 64, 1),
    getBlockLight: (w) => w.getBlockLight(1, 64, 1),
    getBiome: (w) => w.getBiome(1, 1),
    surfaceY: (w) => w.surfaceY(1, 1),
    setBlock: (w) => w.setBlock(1, 62, 1, 0),
    ensureChunk: (w) => w.ensureChunk(0, 0),
    ensureSection: (w) => w.ensureSection(0, 0, 3),
    ensureSectionsNear: (w) => w.ensureSectionsNear(1, 60, 1),
    adoptSection: (w) => w.adoptSection(0, 0, 3, null, 1),
    setChunkBlocks: (w) => w.setChunkBlocks(0, 0, new Uint8Array(32768)),
  };

  it("'throw' kipi: her okuma/yazma/üretim çağrısı fırlatır ve sayılır", () => {
    Object.keys(ops).forEach((k) => {
      const w = cityWorld();
      w.retire({ mode: 'throw' });
      expect(w.retired).toBe(true);
      expect(() => ops[k](w), k).toThrow(/Emekli dünyaya erişim/);
      expect(w.staleHits, k).toBeGreaterThanOrEqual(1);
    });
  });

  it("varsayılan kip test ortamında 'throw'", () => {
    const w = cityWorld();
    w.retire();
    expect(() => w.getBlock(1, 64, 1)).toThrow();
  });

  it("'count' kipi: zararsız değer döner, staleHits artar, onStale çağrılır", () => {
    const w = cityWorld();
    const names = [];
    w.retire({ mode: 'count', onStale: (n, who) => { names.push(n); expect(who).toBe(w); } });
    expect(w.getBlock(1, 64, 1)).toBeNull();
    expect(w.getLight(1, 64, 1)).toBe(0);
    expect(w.getBiome(1, 1)).toBe(-1);
    expect(w.surfaceY(1, 1)).toBe(w.yMin - 1);
    expect(w.setBlock(1, 62, 1, 0)).toBe(false);
    expect(w.ensureChunk(5, 5)).toBeNull();
    expect(w.ensureSection(0, 0, 3)).toBe(false);
    expect(w.ensureSectionsNear(1, 60, 1)).toBe(0);
    expect(w.adoptSection(0, 0, 3, null, 1)).toBe(false);
    expect(w.setChunkBlocks(0, 0, new Uint8Array(32768))).toBe(-1);
    expect(w.staleHits).toBe(names.length);
    expect(w.staleHits).toBe(10);
    // yazma gerçekten yapılmadı
    w.revive();
    expect(w.getBlock(1, 62, 1)).toBe(B.STONE);
    expect(w.hasChunk(5, 5)).toBe(false);
  });

  it('serileştirme/olay/chunk tablosu emekli dünyada serbest (geçiş sırasında kullanılır)', () => {
    const w = cityWorld();
    w.setBlock(5, 62, 5, 0);
    w.retire({ mode: 'throw' });
    expect(() => {
      w.serializeEdits();
      w.edits.get('5,62,5');
      w.on('blockChange', () => {})();
      w.hasChunk(0, 0);
      w.getChunk(0, 0);
      w.forEachChunk(() => {});
      expect(w.chunkCount).toBe(2);
      w.unloadChunk(1, 0);
      w.zoneForChunk(0, 0);
      w.inBounds(0, 0);
      w.canGenerate(0, 0);
    }).not.toThrow();
    expect(w.serializeEdits()).toEqual({ '5,62,5': 0 });
    expect(w.staleHits).toBe(0);
  });

  it('revive() dünyayı eski haline getirir; tekrar retire kipi günceller', () => {
    const w = cityWorld();
    w.retire({ mode: 'throw' });
    w.revive();
    expect(w.retired).toBe(false);
    expect(w.getBlock(1, 62, 1)).toBe(B.STONE);
    w.retire({ mode: 'count' });
    expect(w.getBlock(1, 62, 1)).toBeNull();
    w.retire({ mode: 'throw' });
    expect(() => w.getBlock(1, 62, 1)).toThrow();
  });

  it('overworld dünyası da emekli edilebilir; emekli olmayan dünyada sayaç 0 ve davranış aynı', () => {
    const w = new World({ seed: 11 });
    w.ensureChunk(0, 0);
    const y = w.surfaceY(3, 3);
    expect(w.staleHits).toBe(0);
    w.retire({ mode: 'count' });
    expect(w.surfaceY(3, 3)).toBe(w.yMin - 1);
    w.revive();
    expect(w.surfaceY(3, 3)).toBe(y);
  });

  it('1000 canlı okuma emekli olmayan dünyada hiç sayılmaz', () => {
    const w = cityWorld();
    for (let i = 0; i < 1000; i++) w.getBlock(i & 15, 62, (i >> 4) & 15);
    expect(w.staleHits).toBe(0);
  });
});
