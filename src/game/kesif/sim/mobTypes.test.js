import { describe, expect, it } from 'vitest';
import {
  BOSS_KEYS, HOSTILE_KEYS, MOB_KEYS, MOB_TYPES, PASSIVE_KEYS, bossForZone, canSpawnAt, getMobType, hitboxOf,
  isBossKey, mobsForZone, normalizeMobKey,
} from './mobTypes.js';
import { BIOME_KEYS, ZONES } from './constants.js';
import { itemByKey } from './items.js';

describe('MOB_TYPES tablosu', () => {
  it('constants.js listeleriyle birebir aynı anahtarları içerir (10 pasif, 7 düşman, 4 boss)', () => {
    expect(PASSIVE_KEYS.length).toBe(10);
    expect(HOSTILE_KEYS.length).toBe(7);
    expect(BOSS_KEYS.length).toBe(4);
    for (const k of [...PASSIVE_KEYS, ...HOSTILE_KEYS, ...BOSS_KEYS]) expect(MOB_TYPES[k]).toBeTruthy();
    expect(MOB_KEYS.length).toBe(21);
    expect(Object.isFrozen(MOB_TYPES)).toBe(true);
  });

  it('her kayıtta geçerli hitbox, can, hız ve ad var', () => {
    for (const k of MOB_KEYS) {
      const t = MOB_TYPES[k];
      expect(t.key).toBe(k);
      expect(t.name.length).toBeGreaterThan(2);
      expect(t.hitbox.w).toBeGreaterThan(0.1);
      expect(t.hitbox.h).toBeGreaterThan(0.1);
      expect(t.hitbox.w).toBeLessThanOrEqual(5);
      expect(t.hitbox.h).toBeLessThanOrEqual(7);
      expect(t.hp).toBeGreaterThan(0);
      expect(t.speed).toBeGreaterThan(0);
      expect(t.walkSpeed).toBeGreaterThan(0);
      expect(t.walkSpeed).toBeLessThanOrEqual(t.speed);
      expect(t.modelScale).toBeGreaterThan(0);
      expect(t.eyeHeight).toBeGreaterThan(0);
      expect(t.eyeHeight).toBeLessThanOrEqual(t.hitbox.h);
      expect(hitboxOf(k)).toBe(t.hitbox);
    }
  });

  it('boss bayrakları ve aşama tanımları tutarlı', () => {
    for (const k of MOB_KEYS) {
      const t = MOB_TYPES[k];
      expect(t.boss).toBe(BOSS_KEYS.includes(k));
      expect(isBossKey(k)).toBe(t.boss);
      if (t.boss) {
        expect(t.hostile).toBe(true);
        expect(t.hp).toBeGreaterThanOrEqual(300);
        expect(t.phases.count).toBe(3);
        expect(t.phases.thresholds.length).toBe(2);
        expect(t.phases.thresholds[0]).toBeGreaterThan(t.phases.thresholds[1]);
        expect(t.phases.thresholds[0]).toBeLessThan(1);
        expect(t.phases.thresholds[1]).toBeGreaterThan(0);
        expect(t.phases.attacks.length).toBe(3);
        expect(t.arenaRadius).toBeGreaterThan(10);
        expect(t.kbResist).toBeUndefined();
        expect(t.knockbackResist).toBe(1);
        expect(t.hitbox.h).toBeGreaterThanOrEqual(3.5);
      } else {
        expect(t.phases).toBeUndefined();
      }
    }
  });

  it('bosslar bölge tablosundaki bossKey ve yetenekle eşleşir', () => {
    for (const z of ZONES) {
      if (!z.bossKey) { expect(bossForZone(z.id)).toBeNull(); continue; }
      const t = bossForZone(z.id);
      expect(t.key).toBe(z.bossKey);
      expect(t.zone).toBe(z.id);
      expect(t.ability).toBe(z.abilityKey);
    }
  });

  it('pasif/düşman ayrımı ve hasar kuralları', () => {
    for (const k of PASSIVE_KEYS) {
      const t = MOB_TYPES[k];
      expect(t.passive).toBe(true);
      expect(t.hostile).toBe(false);
      expect(t.damage).toBe(0);
      expect(t.attack).toBeNull();
      expect(t.fleeRange).toBeGreaterThan(0);
    }
    for (const k of HOSTILE_KEYS) {
      const t = MOB_TYPES[k];
      expect(t.hostile).toBe(true);
      expect(t.passive).toBe(false);
      expect(t.damage).toBeGreaterThan(0);
      expect(t.attack.range).toBeGreaterThan(0.5);
      expect(t.attack.cooldown).toBeGreaterThan(0.3);
      expect(t.aggroRange).toBeGreaterThan(5);
      expect(t.loseRange).toBeGreaterThan(t.aggroRange);
      expect(['kaç', 'zayıfla']).toContain(t.lightReaction);
    }
  });

  it('doğma kuralları makul: düşman ışık ≤ 7, pasif aydınlıkta, bölgeler/biyomlar geçerli', () => {
    for (const k of MOB_KEYS) {
      const t = MOB_TYPES[k];
      if (t.boss) { expect(t.spawn).toBeNull(); continue; }
      const s = t.spawn;
      expect(s.zones.length).toBeGreaterThan(0);
      for (const z of s.zones) {
        expect(z).toBeGreaterThanOrEqual(0);
        expect(z).toBeLessThan(ZONES.length);
      }
      expect(s.minLight).toBeGreaterThanOrEqual(0);
      expect(s.maxLight).toBeLessThanOrEqual(15);
      expect(s.minLight).toBeLessThanOrEqual(s.maxLight);
      if (t.hostile) {
        expect(s.maxLight).toBeLessThanOrEqual(7);
        expect(s.minLight).toBe(0);
        expect(s.day).toBe(false);
      } else {
        expect(s.maxLight).toBeGreaterThanOrEqual(9);
      }
      if (s.biomes) for (const b of s.biomes) expect(BIOME_KEYS).toContain(b);
      expect(['yüzey', 'mağara', 'su', 'hava', 'her yer']).toContain(s.habitat);
      expect(s.weight).toBeGreaterThan(0);
      expect(s.group[0]).toBeGreaterThanOrEqual(1);
      expect(s.group[1]).toBeGreaterThanOrEqual(s.group[0]);
      expect(s.minY).toBeLessThanOrEqual(s.maxY);
      expect(s.minDist).toBeLessThan(s.maxDist);
      expect(s.night && s.day).toBe(false);
    }
  });

  it('bölge tablosundaki (ZONES.mobs) yaratıklarla doğma bölgeleri birebir uyumlu', () => {
    for (const z of ZONES) {
      const passive = mobsForZone(z.id, 'pasif').map((t) => t.key).sort();
      const hostile = mobsForZone(z.id, 'düşman').map((t) => t.key).sort();
      expect(passive).toEqual(z.mobs.passive.slice().sort());
      expect(hostile).toEqual(z.mobs.hostile.slice().sort());
    }
  });

  it('ganimet ipuçları gerçek eşyalara işaret eder', () => {
    for (const k of MOB_KEYS) {
      for (const d of MOB_TYPES[k].drops) {
        expect(itemByKey(d.item), k + ' → ' + d.item).toBeTruthy();
        expect(d.min).toBeGreaterThanOrEqual(0);
        expect(d.max).toBeGreaterThanOrEqual(d.min);
        expect(d.chance).toBeGreaterThan(0);
        expect(d.chance).toBeLessThanOrEqual(1);
      }
    }
    for (const k of BOSS_KEYS) expect(MOB_TYPES[k].drops.length).toBeGreaterThanOrEqual(3);
  });

  it('normalizeMobKey: ASCII, Türkçe, boşluk/alt çizgi ve takma adlar', () => {
    expect(normalizeMobKey('golgehukumdari')).toBe('golgehukumdar');
    expect(normalizeMobKey('golgehukumdar')).toBe('golgehukumdar');
    expect(normalizeMobKey('Gölge Hükümdar')).toBe('golgehukumdar');
    expect(normalizeMobKey('kök_ana')).toBe('kokana');
    expect(normalizeMobKey('Taş Bekçi')).toBe('tasbekci');
    expect(normalizeMobKey('orman kedisi')).toBe('ormankedisi');
    expect(normalizeMobKey('Ateş Böceği')).toBe('atesbocegi');
    expect(normalizeMobKey('yok')).toBeNull();
    expect(normalizeMobKey('')).toBeNull();
    expect(normalizeMobKey(null)).toBeNull();
    expect(getMobType('kumakrebi').name).toBe('Kum Akrebi');
    expect(getMobType('nope')).toBeNull();
  });

  it('canSpawnAt: ışık, bölge, biyom, gece/gündüz ve yaşam alanı kuralları', () => {
    expect(canSpawnAt('golge', { zone: 0, light: 3, biome: 'cayir', y: 60, night: true, habitat: 'yüzey' })).toBe(true);
    expect(canSpawnAt('golge', { zone: 0, light: 12, biome: 'cayir', y: 60, night: false, habitat: 'yüzey' })).toBe(false);
    expect(canSpawnAt('kemikci', { zone: 0, light: 2, biome: 'cayir', y: 60, night: true, habitat: 'yüzey' })).toBe(false);
    expect(canSpawnAt('kemikci', { zone: 2, light: 2, biome: 'col', y: 60, night: true, habitat: 'mağara' })).toBe(true);
    expect(canSpawnAt('koyun', { zone: 0, light: 14, biome: 'cayir', y: 60, night: false, habitat: 'yüzey' })).toBe(true);
    expect(canSpawnAt('koyun', { zone: 0, light: 14, biome: 'col', y: 60, night: false, habitat: 'yüzey' })).toBe(false);
    expect(canSpawnAt('koyun', { zone: 0, light: 14, biome: 'cayir', y: 60, night: true, habitat: 'yüzey' })).toBe(false);
    expect(canSpawnAt('balik', { zone: 0, light: 12, biome: 'plaj', y: 40, night: false, habitat: 'su' })).toBe(true);
    expect(canSpawnAt('balik', { zone: 0, light: 12, biome: 'plaj', y: 40, night: false, habitat: 'yüzey' })).toBe(false);
    expect(canSpawnAt('atesbocegi', { zone: 1, light: 4, biome: 'orman', y: 60, night: true, habitat: 'hava' })).toBe(true);
    expect(canSpawnAt('atesbocegi', { zone: 1, light: 4, biome: 'orman', y: 60, night: false, habitat: 'hava' })).toBe(false);
    expect(canSpawnAt('kokana', { zone: 1, light: 0, biome: 'orman', y: 60 })).toBe(false);
    expect(canSpawnAt('bilinmeyen', { zone: 0, light: 0 })).toBe(false);
  });
});

describe('derin dünya doğma aralıkları', () => {
  it('varsayılan aralık tüm dünyadır: yer altında ve yüksek dağlarda doğabilir', () => {
    for (const y of [-390, -250, -60, 10, 200, 340]) {
      expect(canSpawnAt('golge', { zone: 1, light: 0, biome: 'orman', y, night: true, habitat: 'mağara' })).toBe(true);
    }
  });

  it('derin mağarada (y < -220) biyom kısıtı gevşer; yüzeye yakın mağarada kısıt sürer', () => {
    const ctx = (y, biome) => ({ zone: 3, light: 0, biome, y, night: true, habitat: 'mağara' });
    expect(canSpawnAt('kristalbocegi', ctx(-300, 'cayir'))).toBe(true);
    expect(canSpawnAt('kristalbocegi', ctx(20, 'cayir'))).toBe(false);
    expect(canSpawnAt('kristalbocegi', ctx(20, 'kristal'))).toBe(true);
    expect(canSpawnAt('lavslime', { zone: 2, light: 0, biome: 'cayir', y: -330, night: true, habitat: 'mağara' })).toBe(true);
    expect(canSpawnAt('lavslime', { zone: 2, light: 0, biome: 'cayir', y: 30, night: true, habitat: 'yüzey' })).toBe(false);
    // yüzey habitatı derinlikten etkilenmez
    expect(canSpawnAt('buzhortlagi', { zone: 3, light: 0, biome: 'cayir', y: -300, night: true, habitat: 'yüzey' })).toBe(false);
  });
});
