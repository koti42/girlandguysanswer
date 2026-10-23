import { describe, expect, it } from 'vitest';
import { createProgression } from './progression.js';
import { BIOME_KEYS } from './constants.js';
import { ACHIEVEMENT_ICONS } from './achievementsData.js';
import { SCALAR_METRICS } from './progressionMetrics.js';
import {
  ACHIEVEMENTS, ACHIEVEMENT_BY_ID, achievementProgressText, achievementValue, checkAchievements, getAchievementList,
  isAchievementDone, restoreAchievements,
} from './achievements.js';

describe('başarım verisi', () => {
  it('en az 40 başarım; benzersiz kimlik; geçerli ölçüt, hedef ve simge; Türkçe metin', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    ACHIEVEMENTS.forEach((a) => {
      expect(SCALAR_METRICS[a.metric], a.id).toBeTypeOf('function');
      expect(a.target, a.id).toBeGreaterThan(0);
      expect(ACHIEVEMENT_ICONS, a.id).toContain(a.icon);
      expect(a.title.length).toBeGreaterThan(2);
      expect(a.desc.length).toBeGreaterThan(8);
      expect(a.xp).toBeGreaterThanOrEqual(0);
      expect(ACHIEVEMENT_BY_ID[a.id]).toBe(a);
    });
  });

  it('başarım hedefleri ulaşılabilir (ölçütün olası üst sınırı)', () => {
    const caps = { sealsComplete: 5, bossesDefeated: 4, abilityCount: 4, zonesUnlocked: 5, zonesVisited: 5, parkourTiers: 5, biomesDiscovered: BIOME_KEYS.length, templesDone: 14, conquered: 1 };
    ACHIEVEMENTS.forEach((a) => {
      if (caps[a.metric] !== undefined) expect(a.target, a.id).toBeLessThanOrEqual(caps[a.metric]);
    });
  });
});

describe('başarım açılışı', () => {
  it('ilk yaratık → "İlk Av"; aynı başarım ikinci kez açılmaz', () => {
    const p = createProgression(1);
    const out = p.onEvent({ type: 'mobKilled', key: 'golge' });
    const ach = out.events.filter((e) => e.type === 'achievement');
    expect(ach.map((e) => e.id)).toContain('ilk_av');
    expect(ach[0]).toMatchObject({ title: expect.any(String), icon: expect.any(String) });
    expect(isAchievementDone(p, 'ilk_av')).toBe(true);
    const out2 = p.onEvent({ type: 'mobKilled', key: 'golge' });
    expect(out2.events.filter((e) => e.type === 'achievement' && e.id === 'ilk_av')).toHaveLength(0);
    expect(p.achievements.filter((a) => a === 'ilk_av')).toHaveLength(1);
  });

  it('checkAchievements yeni açılanları döner ve p.achievements\'a yazar', () => {
    const p = createProgression(1);
    p.stats.blocksBroken = 1200;
    p.stats.blocksPlaced = 60;
    const fresh = checkAchievements(p);
    expect(fresh.map((a) => a.id)).toEqual(expect.arrayContaining(['kazici_100', 'madenci_1000', 'yapici_50']));
    expect(fresh.map((a) => a.id)).not.toContain('yer_efendisi');
    expect(checkAchievements(p)).toEqual([]);
    expect(p.achievements).toEqual(expect.arrayContaining(['kazici_100', 'madenci_1000']));
  });

  it('boss, mühür, yetenek, zafer başarımları durum makinesinden açılır', () => {
    const p = createProgression(1);
    const ids = [];
    const take = (o) => o.events.filter((e) => e.type === 'achievement').forEach((e) => ids.push(e.id));
    for (let i = 0; i < 2; i++) take(p.onEvent({ type: 'crystalCollected', zone: 0, id: 'a' + i }));
    for (let i = 0; i < 2; i++) take(p.onEvent({ type: 'crystalPlaced', zone: 0, id: 'a' + i }));
    expect(ids).toEqual(expect.arrayContaining(['muhur_1', 'kristal_3'].slice(0, 1)));
    for (let z = 1; z <= 4; z++) take(p.onEvent({ type: 'bossDefeated', zone: z }));
    expect(ids).toEqual(expect.arrayContaining(['boss_1', 'boss_4', 'yetenek_1', 'yetenek_4', 'fetih']));
    expect(p.achievements).toContain('fetih');
  });

  it('parkur, hız, bulmaca, keşif başarımları', () => {
    const p = createProgression(1);
    p.onEvent({ type: 'parkourDone', id: 'a', tier: 1, ms: 80000 });
    expect(isAchievementDone(p, 'parkur_1')).toBe(true);
    expect(isAchievementDone(p, 'hiz_seytani')).toBe(true);
    for (let i = 0; i < 10; i++) p.onEvent({ type: 'puzzleSolved', id: 'pz' + i, zone: 0 });
    expect(isAchievementDone(p, 'bulmaca_10')).toBe(true);
    ['cayir', 'orman', 'col', 'tundra', 'dag'].forEach((b) => p.onEvent({ type: 'biomeEntered', biome: b }));
    expect(isAchievementDone(p, 'biyom_5')).toBe(true);
    expect(isAchievementDone(p, 'biyom_9')).toBe(false);
  });

  it('başarım xp ödülü verir ve başarım-sayısı ölçütü zincirleme açılır', () => {
    const p = createProgression(1);
    const before = p.stats.xp;
    p.onEvent({ type: 'mobKilled', key: 'tavuk' });
    expect(p.stats.xp).toBeGreaterThan(before);
    const q = createProgression(1);
    ACHIEVEMENTS.filter((x) => x.id !== 'koleksiyoncu' && x.id !== 'ilk_av' && x.id !== 'seviye_10')
      .slice(0, 24).forEach((x) => q.achievements.push(x.id));
    expect(q.achievements.length).toBe(24);
    const out = q.onEvent({ type: 'mobKilled', key: 'golge' });
    const ids = out.events.filter((e) => e.type === 'achievement').map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['ilk_av', 'koleksiyoncu']));
    expect(q.achievements).toContain('koleksiyoncu');
  });

  it('gizli başarım açılana dek gizli listelenir', () => {
    const p = createProgression(1);
    let list = getAchievementList(p);
    const hidden = list.find((a) => a.id === 'ilk_dusus');
    expect(hidden).toMatchObject({ title: '???', hidden: true, done: false });
    p.onEvent({ type: 'died' });
    list = getAchievementList(p);
    expect(list.find((a) => a.id === 'ilk_dusus')).toMatchObject({ title: 'Olsun, Düzelir', hidden: false, done: true });
  });
});

describe('ilerleme metni ve liste', () => {
  it('"n/hedef birim" metni; tamamlanınca hedef/hedef', () => {
    const p = createProgression(1);
    p.stats.distance = 400.7;
    const a = ACHIEVEMENT_BY_ID.yuruyus_1k;
    expect(achievementValue(p, a)).toBe(400);
    expect(achievementProgressText(p, a)).toBe('400/1000 blok');
    p.stats.distance = 99999;
    checkAchievements(p);
    expect(achievementProgressText(p, a)).toBe('1000/1000 blok');
    expect(achievementProgressText(p, ACHIEVEMENT_BY_ID.ilk_av)).toBe('0/1');
  });

  it('getAchievementList tüm başarımları ilerlemeyle verir', () => {
    const p = createProgression(1);
    p.stats.mobsKilled = 10;
    const list = getAchievementList(p);
    expect(list).toHaveLength(ACHIEVEMENTS.length);
    expect(list.find((a) => a.id === 'avci_25')).toMatchObject({ progress: 10, target: 25, progressText: '10/25', done: false });
  });

  it('restoreAchievements bilinmeyen/yinelenen kimlikleri atar', () => {
    const p = createProgression(1);
    expect(restoreAchievements(p, ['ilk_av', 'ilk_av', 'yok', 5, null, 'boss_1'])).toBe(2);
    expect(p.achievements).toEqual(['ilk_av', 'boss_1']);
    expect(isAchievementDone(p, 'boss_1')).toBe(true);
    expect(restoreAchievements(p, 'x')).toBe(0);
    expect(isAchievementDone(p, 'boss_1')).toBe(false);
  });
});
