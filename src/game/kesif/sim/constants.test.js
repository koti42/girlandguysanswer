import { describe, expect, it } from 'vitest';
import {
  ABILITY_KEYS, BIOME_KEYS, BOSS_KEYS, BUILDABLE_MAX, CHUNK_AREA, CHUNK_SIZE, CHUNK_VOLUME, DEPTH_BANDS, GEN_TOP_Y, HOSTILE_MOBS,
  MAP_H, MAP_LIMITS, MAP_SECTION_COUNT, MAX_BLOCK_ID, PASSIVE_MOBS, SAVE_VERSION, SEA_LEVEL, SECTION_H, SECTION_VOLUME, TICK_RATE,
  TOOL_TIERS, WORLD_H, WORLD_SECTION_COUNT, WORLD_Y_MAX, WORLD_Y_MIN, depthBandAt, itemCeilY, itemKillY, relativeToSea,
  sectionBaseY, sectionIndexOf, sectionVoxelIndex, worldMaxY, worldMinY,
  WORLD_RADIUS, ZONES, distanceToZoneBoundary, distanceToZoneOuter, foldTr, radiusAt, voxelIndex, zoneAt,
  zoneIndexAt,
} from './constants.js';

describe('temel sabitler', () => {
  it('chunk ve dünya boyutları sözleşmeye uyar', () => {
    expect(CHUNK_SIZE).toBe(16);
    expect(WORLD_H).toBe(128);
    expect(SEA_LEVEL).toBe(42);
    expect(MAX_BLOCK_ID).toBe(254); // 1–99 inşa, 100–127 sistem, 128–135 büyü, 136–159 üretim, 160–199 biyom, 200–239 teknoloji, 240–255 yedek
    expect(BUILDABLE_MAX).toBe(99);
    expect(CHUNK_AREA).toBe(256);
    expect(CHUNK_VOLUME).toBe(32768);
    expect(TICK_RATE).toBe(60);
    expect(SAVE_VERSION).toBe(3); // v3: boyutlar (dims.neon) — v2 sessizce göç eder
  });

  it('derin dünya: dikey düzen sabitleri', () => {
    expect(MAP_H).toBe(128);
    expect(WORLD_H).toBe(MAP_H); // eski ad = harita yüksekliği
    expect(SECTION_H).toBe(16);
    expect(SECTION_VOLUME).toBe(4096);
    expect(WORLD_Y_MIN).toBe(-400);
    expect(WORLD_Y_MAX).toBe(SEA_LEVEL + 320);
    expect(WORLD_Y_MAX).toBe(362);
    expect(WORLD_SECTION_COUNT).toBe(48);
    expect(MAP_SECTION_COUNT).toBe(8);
    expect(GEN_TOP_Y).toBe(368);
    expect(WORLD_Y_MIN + WORLD_SECTION_COUNT * SECTION_H).toBe(GEN_TOP_Y);
    expect(WORLD_Y_MAX).toBeLessThan(GEN_TOP_Y);
  });

  it('kesit yardımcıları: negatif y dahil kesit indeksi / taban y / kesit içi indeks', () => {
    expect(sectionIndexOf(-400)).toBe(0);
    expect(sectionIndexOf(-385)).toBe(0);
    expect(sectionIndexOf(-384)).toBe(1);
    expect(sectionIndexOf(-1)).toBe(24);
    expect(sectionIndexOf(0)).toBe(25);
    expect(sectionIndexOf(15)).toBe(25);
    expect(sectionIndexOf(16)).toBe(26);
    expect(sectionIndexOf(WORLD_Y_MAX)).toBe(47);
    expect(sectionIndexOf(5, 0)).toBe(0);
    expect(sectionBaseY(0)).toBe(-400);
    expect(sectionBaseY(25)).toBe(0);
    for (let y = -400; y <= WORLD_Y_MAX; y += 7) {
      const si = sectionIndexOf(y);
      expect(sectionBaseY(si) <= y && y < sectionBaseY(si) + 16).toBe(true);
    }
    expect(sectionVoxelIndex(15, 15, 15)).toBe(SECTION_VOLUME - 1);
    expect(sectionVoxelIndex(1, 0, 0)).toBe(1);
    expect(sectionVoxelIndex(0, 0, 1)).toBe(16);
    expect(sectionVoxelIndex(0, 1, 0)).toBe(256);
  });

  it('worldMinY / worldMaxY: taklit dünya eski harita aralığı, World kendi aralığı', () => {
    expect(worldMinY({})).toBe(0);
    expect(worldMaxY({})).toBe(127);
    expect(worldMinY({ yMin: -400, yMax: 362 })).toBe(-400);
    expect(worldMaxY({ yMin: -400, yMax: 362 })).toBe(362);
    expect(itemKillY({})).toBe(-30);
    expect(itemKillY({ killPlaneY: -448 })).toBe(-454);
    expect(itemCeilY({ yTop: 363 })).toBe(367);
    expect(itemCeilY({})).toBeGreaterThan(1e6);
  });

  it('derinlik bantları: sıralı, adlar ve sınırlar; yüksekliğe göre bant', () => {
    expect(DEPTH_BANDS.map((b) => b.name)).toEqual(['Yüzey', 'Mağaralar', 'Derin Mağaralar', 'Ham Kayalık', 'Dip']);
    for (let i = 1; i < DEPTH_BANDS.length; i++) expect(DEPTH_BANDS[i].minY).toBeLessThan(DEPTH_BANDS[i - 1].minY);
    expect(depthBandAt(WORLD_Y_MAX).key).toBe('yuzey');
    expect(depthBandAt(SEA_LEVEL).key).toBe('yuzey');
    expect(depthBandAt(19).key).toBe('magaralar');
    expect(depthBandAt(-81).key).toBe('derin');
    expect(depthBandAt(-221).key).toBe('ham');
    expect(depthBandAt(-341).key).toBe('dip');
    expect(depthBandAt(WORLD_Y_MIN).key).toBe('dip');
    expect(relativeToSea(SEA_LEVEL)).toBe(0);
    expect(relativeToSea(-400)).toBe(-442);
    expect(relativeToSea(WORLD_Y_MAX)).toBe(320);
  });

  it('harita sınırları', () => {
    expect(MAP_LIMITS.maxChunks).toBe(64);
    expect(MAP_LIMITS.chunksX * MAP_LIMITS.chunksZ).toBe(64);
    expect(MAP_LIMITS.sizeX).toBe(128);
    expect(MAP_LIMITS.maxEncodedBytes).toBe(700 * 1024);
  });

  it('voxelIndex sözleşme formülüdür ve çakışmaz', () => {
    expect(voxelIndex(0, 0, 0)).toBe(0);
    expect(voxelIndex(15, 127, 15)).toBe(CHUNK_VOLUME - 1);
    expect(voxelIndex(1, 0, 0)).toBe(1);
    expect(voxelIndex(0, 0, 1)).toBe(16);
    expect(voxelIndex(0, 1, 0)).toBe(256);
  });

  it('alet kademeleri 7 adet ve sıralı', () => {
    expect(TOOL_TIERS.map((t) => t.key)).toEqual(['ahşap', 'taş', 'bakır', 'demir', 'altın', 'elmas', 'kuantum']);
    const gold = TOOL_TIERS.find((t) => t.key === 'altın');
    const iron = TOOL_TIERS.find((t) => t.key === 'demir');
    expect(gold.speed).toBeGreaterThan(iron.speed); // hızlı
    expect(gold.durability).toBeLessThan(iron.durability); // zayıf
  });
});

describe('bölgeler', () => {
  it('5 bölge, halkalar bitişik ve artan', () => {
    expect(ZONES).toHaveLength(5);
    expect(ZONES[0].rIn).toBe(0);
    for (let i = 0; i < ZONES.length; i++) {
      expect(ZONES[i].id).toBe(i);
      expect(ZONES[i].rOut).toBeGreaterThan(ZONES[i].rIn);
      if (i > 0) expect(ZONES[i].rIn).toBe(ZONES[i - 1].rOut);
      expect(ZONES[i].difficulty).toBe(i + 1);
    }
    expect(ZONES.map((z) => z.rOut)).toEqual([176, 352, 608, 960, 1408]);
    expect(WORLD_RADIUS).toBe(1408);
  });

  it('adlar sözleşmedeki gibi', () => {
    expect(ZONES.map((z) => z.name)).toEqual([
      'Başlangıç Vadisi', 'Fısıldayan Ormanlar', 'Yanık Kanyonlar', 'Donmuş Zirveler', 'Çekirdek',
    ]);
  });

  it('biyom ağırlıkları geçerli ve toplam 1', () => {
    for (const z of ZONES) {
      let sum = 0;
      for (const k of Object.keys(z.biomes)) {
        expect(BIOME_KEYS).toContain(k);
        sum += z.biomes[k];
      }
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it('yaratık, boss ve yetenek anahtarları tanımlı kümelerden', () => {
    const bosses = [];
    const abilities = [];
    for (const z of ZONES) {
      z.mobs.passive.forEach((m) => expect(PASSIVE_MOBS).toContain(m));
      z.mobs.hostile.forEach((m) => expect(HOSTILE_MOBS).toContain(m));
      expect(z.mobs.hostile.length).toBeGreaterThan(0);
      if (z.bossKey) {
        expect(BOSS_KEYS).toContain(z.bossKey);
        bosses.push(z.bossKey);
      }
      if (z.abilityKey) {
        expect(ABILITY_KEYS).toContain(z.abilityKey);
        abilities.push(z.abilityKey);
      }
      expect(z.temples).toBeGreaterThanOrEqual(2);
      expect(z.temples).toBeLessThanOrEqual(3);
      for (const c of Object.values(z.ambient)) expect(c).toBeLessThanOrEqual(0xffffff);
      expect(z.ambient.fog).toBeGreaterThan(0);
    }
    expect(bosses).toEqual(['kokana', 'tasbekci', 'buzkral', 'golgehukumdar']);
    expect(abilities).toEqual(['doubleJump', 'grapple', 'glide', 'portalGun']);
    expect(ZONES[0].bossKey).toBeNull();
  });

  it('zoneAt/zoneIndexAt Öklid yarıçapı kullanır', () => {
    expect(zoneIndexAt(0, 0)).toBe(0);
    expect(zoneIndexAt(175.9, 0)).toBe(0);
    expect(zoneIndexAt(176, 0)).toBe(1);
    expect(zoneIndexAt(0, -176)).toBe(1);
    // köşegen: (125,125) → r=176.8 > 176
    expect(zoneIndexAt(125, 125)).toBe(1);
    expect(zoneIndexAt(123, 123)).toBe(0); // r=173.9
    expect(zoneIndexAt(-351, 0)).toBe(1);
    expect(zoneIndexAt(-352, 0)).toBe(2);
    expect(zoneIndexAt(0, 959)).toBe(3);
    expect(zoneIndexAt(0, 960)).toBe(4);
    expect(zoneIndexAt(100000, 100000)).toBe(4);
    expect(zoneAt(10, 10)).toBe(ZONES[0]);
    expect(radiusAt(3, 4)).toBe(5);
  });

  it('sınıra uzaklık', () => {
    expect(distanceToZoneBoundary(170, 0)).toBeCloseTo(6, 6);
    expect(distanceToZoneBoundary(0, 0)).toBeCloseTo(176, 6);
    expect(distanceToZoneBoundary(180, 0)).toBeCloseTo(4, 6); // bölge 1: iç sınır 176
    expect(distanceToZoneBoundary(250, 0)).toBeCloseTo(74, 6);
    expect(distanceToZoneOuter(170, 0)).toBeCloseTo(6, 6);
    expect(distanceToZoneOuter(180, 0, 0)).toBeCloseTo(-4, 6);
  });
});

describe('foldTr', () => {
  it('Türkçe karakterleri indirger', () => {
    expect(foldTr('Işık_Bloğu')).toBe('isik_blogu');
    expect(foldTr('ÇĞİÖŞÜ')).toBe('cgiosu');
    expect(foldTr('item:kazma_ahşap')).toBe('item:kazma_ahsap');
  });
});
