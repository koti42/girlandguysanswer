import { describe, expect, it } from 'vitest';
import { ZONES } from './constants.js';
import { B } from './blocks.js';
import { Inventory } from './inventory.js';
import {
  EMPTY_OUTPUT, ABILITY_INFO, DIFFICULTIES, createProgression, isRewardKey, migrateProgression,
  registerProgressionMigration, unregisterProgressionMigration, xpLevel,
} from './progression.js';
import { DISC_CELLS, MAP_GRID } from './progressionMap.js';

function allEvents(outs) {
  return outs.reduce((a, o) => a.concat(o.events), []);
}
function collect(p, zone, n, prefix) {
  const outs = [];
  for (let i = 0; i < n; i++) outs.push(p.onEvent({ type: 'crystalCollected', zone, id: (prefix || 'z' + zone) + '-' + i }));
  return outs;
}
function place(p, zone, n, prefix) {
  const outs = [];
  for (let i = 0; i < n; i++) outs.push(p.onEvent({ type: 'crystalPlaced', zone, id: (prefix || 'z' + zone) + '-' + i }));
  return outs;
}
function rewardKeys(outs) {
  return outs.reduce((a, o) => a.concat(o.rewards.map((r) => r.key)), []);
}

describe('createProgression: başlangıç durumu', () => {
  it('yalnız Başlangıç Vadisi açık, yetenek yok', () => {
    const p = createProgression(1);
    expect(p.zonesUnlocked).toEqual([true, false, false, false, false]);
    expect(p.abilityFlags()).toEqual({
      doubleJump: false, grapple: false, glide: false, portalGun: false,
    });
    expect(p.isZoneUnlocked(0)).toBe(true);
    expect(p.isZoneUnlocked(1)).toBe(false);
    expect(p.victory).toBe(false);
    expect(p.getDifficulty().key).toBe('normal');
  });

  it('boş/bozuk olay boş çıktı döner ve atmaz', () => {
    const p = createProgression(1);
    expect(p.onEvent(null)).toBe(EMPTY_OUTPUT);
    expect(p.onEvent(42)).toBe(EMPTY_OUTPUT);
    expect(() => p.onEvent({ type: 'bilinmeyen' })).not.toThrow();
    expect(() => p.onEvent({ type: 'blockBroken', id: 'xx' })).not.toThrow();
  });

  it('zorluk ayarları', () => {
    const p = createProgression(1, { difficulty: 'zor' });
    expect(p.getDifficulty()).toBe(DIFFICULTIES.zor);
    expect(p.setDifficulty('kolay')).toBe(true);
    expect(p.getDifficulty().keepInventory).toBe(true);
    expect(p.setDifficulty('imkansız')).toBe(false);
    expect(p.difficulty).toBe('kolay');
  });
});

describe('Mühür akışı', () => {
  it('Z0: iki kristal → mühür → bölge 1 açılır, jeton ödülü yok', () => {
    const p = createProgression(1);
    const c = collect(p, 0, 2);
    expect(allEvents(c).filter((e) => e.type === 'crystal').map((e) => e.count)).toEqual([1, 2]);
    expect(p.sealProgress(0)).toMatchObject({ collected: 2, placed: 0, required: 2, done: false });
    const first = p.onEvent({ type: 'crystalPlaced', zone: 0, id: 'z0-0' });
    expect(first.events.map((e) => e.type)).toContain('sealProgress');
    expect(first.unlockZones).toEqual([]);
    const last = p.onEvent({ type: 'crystalPlaced', zone: 0, id: 'z0-1' });
    expect(last.unlockZones).toEqual([1]);
    expect(last.unlockZone).toBe(1);
    expect(last.events.map((e) => e.type)).toEqual(expect.arrayContaining(['sealProgress', 'sealComplete', 'zoneUnlocked']));
    expect(last.events.some((e) => e.type === 'bossDoor')).toBe(false);
    expect(last.rewards).toEqual([]);
    expect(last.giveItems.map((g) => g.item)).toContain('item:pusula');
    expect(p.isZoneUnlocked(1)).toBe(true);
    expect(p.isZoneUnlocked(2)).toBe(false);
    expect(p.sealProgress(0).done).toBe(true);
  });

  it('Z1..Z3: gerekli sayıda kristal, ödül anahtarı zone:n:seal, boss kapısı, sonraki bölge', () => {
    const p = createProgression(2);
    collect(p, 0, 2);
    place(p, 0, 2);
    for (let z = 1; z <= 3; z++) {
      const req = ZONES[z].temples;
      collect(p, z, req);
      const outs = place(p, z, req);
      expect(rewardKeys(outs)).toEqual(['zone:' + z + ':seal']);
      const last = outs[outs.length - 1];
      expect(last.unlockZone).toBe(z + 1);
      expect(allEvents(outs).filter((e) => e.type === 'bossDoor')).toHaveLength(1);
      expect(p.sealProgress(z)).toMatchObject({ done: true, bossDoor: true });
    }
    expect(p.zonesUnlocked).toEqual([true, true, true, true, true]);
  });

  it('Z4 mührü: sonraki bölge yok ama boss kapısı ve zone:4:seal', () => {
    const p = createProgression(3);
    collect(p, 0, 2);
    place(p, 0, 2);
    for (let z = 1; z <= 3; z++) {
      collect(p, z, ZONES[z].temples);
      place(p, z, ZONES[z].temples);
    }
    collect(p, 4, 3);
    const outs = place(p, 4, 3);
    expect(rewardKeys(outs)).toEqual(['zone:4:seal']);
    expect(outs[2].unlockZones).toEqual([]);
    expect(allEvents(outs).some((e) => e.type === 'bossDoor' && e.zone === 4)).toBe(true);
  });

  it('tekrarlanan/fazla yerleştirme ve aynı kristal ikinci kez sayılmaz', () => {
    const p = createProgression(1);
    p.onEvent({ type: 'crystalCollected', zone: 0, id: 'a' });
    const again = p.onEvent({ type: 'crystalCollected', zone: 0, id: 'a' });
    expect(again.events.filter((e) => e.type === 'crystal')).toHaveLength(0);
    expect(p.stats.crystalsCollected).toBe(1);
    p.onEvent({ type: 'crystalPlaced', zone: 0, id: 'a' });
    expect(p.onEvent({ type: 'crystalPlaced', zone: 0, id: 'a' })).toBe(EMPTY_OUTPUT);
    p.onEvent({ type: 'crystalPlaced', zone: 0, id: 'b' });
    expect(p.sealProgress(0).done).toBe(true);
    // mühür tamam: sonraki yerleştirmeler etkisiz
    const extra = p.onEvent({ type: 'crystalPlaced', zone: 0, id: 'c' });
    expect(extra).toBe(EMPTY_OUTPUT);
    expect(p.placed[0]).toHaveLength(2);
  });

  it('kimliksiz kristal olayları sentetik kimlik alır; yerleştirilen toplanmış sayılır', () => {
    const p = createProgression(1);
    p.onEvent({ type: 'crystalPlaced', zone: 0 });
    p.onEvent({ type: 'crystalPlaced', zone: 0 });
    expect(p.sealProgress(0)).toMatchObject({ placed: 2, collected: 2, done: true });
  });

  it('kilitli bölgenin mührü tamamlansa bile sonraki bölge sırayı atlayıp açılmaz', () => {
    const p = createProgression(1);
    collect(p, 2, 3);
    const outs = place(p, 2, 3);
    expect(p.seals[2]).toBe(true);
    expect(outs.some((o) => o.unlockZones.length > 0)).toBe(false);
    expect(p.isZoneUnlocked(3)).toBe(false);
  });

  it('geçersiz bölge indeksi yok sayılır', () => {
    const p = createProgression(1);
    expect(p.onEvent({ type: 'crystalCollected', zone: 9, id: 'x' })).toBe(EMPTY_OUTPUT);
    expect(p.onEvent({ type: 'crystalPlaced', zone: -1 })).toBe(EMPTY_OUTPUT);
    expect(p.onEvent({ type: 'bossDefeated', zone: 0 })).toBe(EMPTY_OUTPUT);
  });
});

describe('Boss, yetenek, zafer', () => {
  it('her bölge boss\'u kendi yeteneğini ve ödülünü verir (eşya + anahtar)', () => {
    const p = createProgression(1);
    const expected = { 1: 'doubleJump', 2: 'grapple', 3: 'glide', 4: 'portalGun' };
    for (let z = 1; z <= 4; z++) {
      const out = p.onEvent({ type: 'bossDefeated', zone: z, key: ZONES[z].bossKey });
      expect(out.grantAbility).toBe(expected[z]);
      expect(out.grantAbilities).toEqual([expected[z]]);
      expect(out.giveItems.map((g) => g.item)).toContain(ABILITY_INFO[expected[z]].item);
      expect(out.rewards).toEqual(
        z === 4 ? [{ key: 'zone:4:boss' }, { key: 'world:conquered' }] : [{ key: 'zone:' + z + ':boss' }],
      );
      expect(p.hasAbility(expected[z])).toBe(true);
    }
    expect(p.victory).toBe(true);
  });

  it('yetenek verme tekrar edilebilir değil (idempotent)', () => {
    const p = createProgression(1);
    const a = p.grantAbility('grapple');
    expect(a.grantAbilities).toEqual(['grapple']);
    expect(a.giveItems).toEqual([{ item: 'item:kanca', count: 1 }]);
    expect(p.grantAbility('grapple')).toBe(EMPTY_OUTPUT);
    expect(p.grantAbility('uçmak')).toBe(EMPTY_OUTPUT);
    // boss sonradan yenilse de ikinci kez yetenek eşyası verilmez ama boss ödülü verilir
    const boss = p.onEvent({ type: 'bossDefeated', zone: 2 });
    expect(boss.grantAbilities).toEqual([]);
    expect(boss.giveItems.map((g) => g.item)).not.toContain('item:kanca');
    expect(boss.rewards).toEqual([{ key: 'zone:2:boss' }]);
  });

  it('boss ikinci kez ödül vermez; mobKilled(boss) bossDefeated\'a yönlenir', () => {
    const p = createProgression(1);
    const k = p.onEvent({ type: 'mobKilled', key: 'kokana' });
    expect(k.grantAbility).toBe('doubleJump');
    expect(p.bossesDefeated[1]).toBe(true);
    const again = p.onEvent({ type: 'mobKilled', key: 'kokana' });
    expect(again.rewards).toEqual([]);
    expect(again.grantAbilities).toEqual([]);
    expect(p.onEvent({ type: 'bossDefeated', zone: 1 }).rewards).toEqual([]);
  });

  it('boss anahtarı takma adı (golgehukumdari) çözülür; zafer olayı ve world:conquered bir kez', () => {
    const p = createProgression(1);
    const out = p.onEvent({ type: 'bossDefeated', key: 'golgehukumdari' });
    expect(out.events.map((e) => e.type)).toContain('victory');
    expect(out.rewards.map((r) => r.key)).toContain('world:conquered');
    expect(p.onEvent({ type: 'bossDefeated', zone: 4 }).rewards).toEqual([]);
  });

  it('eksik yetenek eşyaları envanterle karşılaştırılır', () => {
    const p = createProgression(1);
    p.grantAbility('doubleJump');
    p.grantAbility('glide');
    const inv = new Inventory();
    inv.add('item:planör', 1);
    expect(p.missingAbilityItems(inv)).toEqual([{ item: 'item:çift_zıplama_botları', count: 1 }]);
  });
});

describe('Ödül kuyruğu', () => {
  it('bekleyen ödüller markClaimed ile düşer ve yeniden üretilmez', () => {
    const p = createProgression(1);
    const o = p.onEvent({ type: 'parkourDone', id: 'parkur:1', tier: 2, ms: 50000 });
    expect(o.rewards).toEqual([{ key: 'parkour:2:first' }]);
    expect(p.pendingRewards()).toEqual([{ key: 'parkour:2:first' }]);
    p.markClaimed('parkour:2:first');
    expect(p.pendingRewards()).toEqual([]);
    expect(p.rewards.claimed).toContain('parkour:2:first');
    // aynı kademe ikinci parkur: ödül yok
    expect(p.onEvent({ type: 'parkourDone', id: 'parkur:2', tier: 2, ms: 40000 }).rewards).toEqual([]);
  });

  it('sunucudan gelen alınmış anahtarlar yeniden sıraya girmez', () => {
    const p = createProgression(1);
    p.syncClaimed(['zone:1:boss', 'zone:9:boss', 'x']);
    expect(p.rewards.claimed).toEqual(['zone:1:boss']);
    const out = p.onEvent({ type: 'bossDefeated', zone: 1 });
    expect(out.rewards).toEqual([]);
  });

  it('anahtar biçimleri sunucu desenleriyle uyumlu', () => {
    ['zone:1:boss', 'zone:4:seal', 'parkour:5:first', 'world:conquered'].forEach((k) => expect(isRewardKey(k)).toBe(true));
    ['zone:0:boss', 'zone:5:seal', 'parkour:0:first', 'parkour:6:first', 'world', 'zone:1:x', 12].forEach((k) => {
      expect(isRewardKey(k)).toBe(false);
    });
    // üretilen her anahtar geçerli
    const p = createProgression(1);
    const keys = [];
    for (let z = 0; z < 5; z++) {
      collect(p, z, ZONES[z].temples);
      place(p, z, ZONES[z].temples).forEach((o) => o.rewards.forEach((r) => keys.push(r.key)));
      p.onEvent({ type: 'bossDefeated', zone: z }).rewards.forEach((r) => keys.push(r.key));
    }
    for (let t = 1; t <= 5; t++) p.onEvent({ type: 'parkourDone', id: 'p' + t, tier: t, ms: 1000 }).rewards.forEach((r) => keys.push(r.key));
    expect(keys.length).toBe(4 + 4 + 1 + 5);
    keys.forEach((k) => expect(isRewardKey(k)).toBe(true));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('macera dışı modlarda ödül, görev ve başarım üretilmez', () => {
    ['insa', 'harita'].forEach((mode) => {
      const p = createProgression(1, { mode });
      expect(p.active).toBe(false);
      expect(p.onEvent({ type: 'bossDefeated', zone: 1 }).rewards).toEqual([]);
      expect(p.onEvent({ type: 'parkourDone', id: 'a', tier: 1, ms: 5 }).rewards).toEqual([]);
      expect(p.onEvent({ type: 'blockPlaced', id: B.STONE })).toBe(EMPTY_OUTPUT);
      expect(p.pendingRewards()).toEqual([]);
    });
  });
});

describe('Parkur, bulmaca, keşif', () => {
  it('parkur en iyi süre yalnız iyileşince güncellenir', () => {
    const p = createProgression(1);
    const a = p.onEvent({ type: 'parkourDone', id: 'p1', tier: 1, ms: 60000 });
    expect(a.events.find((e) => e.type === 'parkourRecord')).toMatchObject({ best: true, first: true, tier: 1 });
    const b = p.onEvent({ type: 'parkourDone', id: 'p1', tier: 1, ms: 70000 });
    expect(b.events.find((e) => e.type === 'parkourRecord')).toMatchObject({ best: false, first: false });
    p.onEvent({ type: 'parkourDone', id: 'p1', tier: 1, ms: 55000 });
    expect(p.stats.parkourBest.p1).toBe(55000);
    expect(p.onEvent({ type: 'parkourDone', id: 'x', tier: 9, ms: 1 })).toBe(EMPTY_OUTPUT);
  });

  it('bulmaca aynı kimlikle bir kez sayılır; bölge sayacı', () => {
    const p = createProgression(1);
    p.onEvent({ type: 'puzzleSolved', id: 'a', zone: 1 });
    p.onEvent({ type: 'puzzleSolved', id: 'a', zone: 1 });
    p.onEvent({ type: 'puzzleSolved', id: 'b', zone: 2 });
    expect(p.stats.puzzlesSolved).toBe(2);
    expect(p.stats.puzzlesByZone).toEqual({ 1: 1, 2: 1 });
  });

  it('yapı keşfi: kimlik türü öneklenir, tekrar sayılmaz, kule haritayı açar', () => {
    const p = createProgression(1);
    const o = p.onEvent({
      type: 'structureDiscovered', id: '3,4', structType: 'gozcukulesi', zone: 0, x: 100, z: 100, name: 'Kule',
    });
    expect(o.events.find((e) => e.type === 'discover')).toMatchObject({ kind: 'structure', structType: 'gozcukulesi' });
    expect(p.discovered.structures).toEqual(['gozcukulesi:3,4']);
    expect(p.isRevealed(100, 100)).toBe(true);
    expect(p.isRevealed(200, 100)).toBe(true); // 112 blok yarıçap
    expect(p.isRevealed(400, 400)).toBe(false);
    const dup = p.onEvent({ type: 'structureDiscovered', id: 'gozcukulesi:3,4', structType: 'gozcukulesi' });
    expect(dup.events.some((e) => e.type === 'discover')).toBe(false);
  });

  it('biyom keşfi geçerli anahtarla bir kez', () => {
    const p = createProgression(1);
    expect(p.onEvent({ type: 'biomeEntered', biome: 'orman' }).events.some((e) => e.type === 'discover')).toBe(true);
    expect(p.onEvent({ type: 'biomeEntered', biome: 'orman' }).events.some((e) => e.type === 'discover')).toBe(false);
    p.onEvent({ type: 'biomeEntered', biome: 'yok' });
    expect(p.discovered.biomes).toEqual(['orman']);
  });

  it('istatistik sayaçları ve eşya anahtarı doğrulaması', () => {
    const p = createProgression(1);
    p.onEvent({ type: 'blockBroken', id: B.STONE });
    p.onEvent({ type: 'blockPlaced', id: B.BRICK });
    p.onEvent({ type: 'itemCrafted', item: 'item:kazma_ahsap', count: 1, recipeId: 'kazma_ahşap' });
    p.onEvent({ type: 'itemCrafted', item: 'item:demir_külçe', count: 2, recipeId: 'ocak:demir' });
    p.onEvent({ type: 'itemCrafted', item: 'item:yok_boyle_esya', count: 1 });
    p.onEvent({ type: 'itemPickedUp', item: 'item:elmas', count: 3 });
    p.onEvent({ type: 'mobKilled', key: 'golge' });
    p.onEvent({ type: 'mobKilled', key: 'tavuk' });
    p.onEvent({ type: 'died' });
    p.onEvent({ type: 'eaten', item: 'item:elma' });
    expect(p.stats.broken[B.STONE]).toBe(1);
    expect(p.stats.placed[B.BRICK]).toBe(1);
    expect(p.stats.crafted['item:kazma_ahşap']).toBe(1);
    expect(p.stats.smelted).toBe(2);
    expect(p.stats.smeltedBy['item:demir_külçe']).toBe(2);
    expect(p.stats.itemsCrafted).toBe(4);
    expect(Object.keys(p.stats.crafted)).not.toContain('item:yok_boyle_esya');
    expect(p.stats.picked['item:elmas']).toBe(3);
    expect(p.stats.mobsKilled).toBe(2);
    expect(p.stats.hostileKilled).toBe(1);
    expect(p.stats.mobKinds).toEqual({ golge: 1, tavuk: 1 });
    expect(p.stats.deaths).toBe(1);
    expect(p.stats.foodEaten).toBe(1);
  });
});

describe('tick: süre, mesafe, harita açılımı', () => {
  it('oyun süresi ve mesafe birikir, ışınlanma mesafeye eklenmez', () => {
    const p = createProgression(1);
    p.onEvent({ type: 'tick', dt: 1, x: 0, z: 0 });
    p.onEvent({ type: 'tick', dt: 1, x: 3, z: 4 });
    expect(p.stats.playTime).toBe(2);
    expect(p.stats.distance).toBeCloseTo(5, 5);
    p.onEvent({ type: 'tick', dt: 0.1, x: 500, z: 500 });
    expect(p.stats.distance).toBeCloseTo(5, 5);
  });

  it('açılım yarıçapı ışığa göre; karanlıkta ve meşalesiz daha dar', () => {
    const a = createProgression(1);
    a.onEvent({ type: 'tick', dt: 0.1, x: 0, z: 0, light: 15 });
    const b = createProgression(1);
    b.onEvent({ type: 'tick', dt: 0.1, x: 0, z: 0, light: 2 });
    const c = createProgression(1);
    c.onEvent({ type: 'tick', dt: 0.1, x: 0, z: 0, light: 2, torch: true });
    expect(a.revealCount).toBeGreaterThan(c.revealCount);
    expect(c.revealCount).toBeGreaterThan(b.revealCount);
    expect(a.isRevealed(20, 0)).toBe(true);
    expect(b.isRevealed(20, 0)).toBe(false);
  });

  it('yürüdükçe yüzde artar; mapView canlı veri verir', () => {
    const p = createProgression(1);
    for (let i = 0; i < 100; i++) p.onEvent({ type: 'tick', dt: 0.1, x: i * 8, z: 0, light: 15 });
    const v = p.mapView();
    expect(v.grid).toBe(MAP_GRID);
    expect(v.explored).toBe(p.revealCount);
    expect(v.percent).toBeGreaterThan(0);
    expect(v.percent).toBeCloseTo(Math.round((p.revealCount / DISC_CELLS) * 1000) / 10, 5);
    expect(p.stats.distance).toBeCloseTo(792, 0);
  });

  it('tick çoğu zaman paylaşılan boş çıktıyı döner; 2 sn\'de bir görev/başarım denetler', () => {
    const p = createProgression(1);
    expect(p.onEvent({ type: 'tick', dt: 0.016, x: 1, z: 1 })).toBe(EMPTY_OUTPUT);
    p.stats.distance = 1500; // ks_mesafe1 + yuruyus_1k hedefi
    let out = EMPTY_OUTPUT;
    for (let i = 0; i < 200 && out === EMPTY_OUTPUT; i++) out = p.onEvent({ type: 'tick', dt: 0.016, x: 1, z: 1 });
    expect(out).not.toBe(EMPTY_OUTPUT);
    expect(out.events.some((e) => e.type === 'achievement' && e.id === 'yuruyus_1k')).toBe(true);
  });

  it('tick ile biyom keşfi', () => {
    const p = createProgression(1);
    const out = p.onEvent({ type: 'tick', dt: 0.016, x: 0, z: 0, biome: 'cayir' });
    expect(out.events.some((e) => e.type === 'discover' && e.id === 'cayir')).toBe(true);
  });
});

describe('Görev entegrasyonu', () => {
  it('onboarding zinciri olaylarla ilerler; ödül eşyası ve xp çıkar', () => {
    const p = createProgression(1);
    expect(p.activeQuest().id).toBe('ilk_odun');
    let out;
    for (let i = 0; i < 3; i++) out = p.onEvent({ type: 'blockBroken', id: B.LOG_OAK });
    const done = out.events.filter((e) => e.type === 'questUpdate' && e.completed);
    expect(done.map((e) => e.id)).toEqual(['ilk_odun']);
    expect(out.giveItems).toEqual([{ item: 'item:elma', count: 2 }]);
    expect(p.stats.xp).toBeGreaterThanOrEqual(10);
    expect(p.activeQuest().id).toBe('tahta_yap');
    p.onEvent({ type: 'itemCrafted', item: 'blok:meşe_tahta', count: 4, recipeId: 'tahta_meşe' });
    const o2 = p.onEvent({ type: 'itemCrafted', item: 'blok:meşe_tahta', count: 4, recipeId: 'tahta_meşe' });
    expect(o2.events.filter((e) => e.completed).map((e) => e.id)).toEqual(['tahta_yap']);
    expect(p.activeQuest().id).toBe('tezgah_yap');
  });

  it('önceden yapılan iş açılan görevi hemen tamamlar (zincirleme)', () => {
    const p = createProgression(1);
    // sırayı atlayarak önce üretim yap: ilk_odun bitmediği için hiçbiri sayılmaz
    p.onEvent({ type: 'itemCrafted', item: 'blok:meşe_tahta', count: 8 });
    p.onEvent({ type: 'itemCrafted', item: 'item:sopa', count: 4 });
    p.onEvent({ type: 'itemCrafted', item: 'blok:tezgah', count: 1 });
    p.onEvent({ type: 'blockPlaced', id: B.WORKBENCH });
    p.onEvent({ type: 'itemCrafted', item: 'item:kazma_ahşap', count: 1 });
    expect(p.questsDone).toEqual({});
    expect(p.activeQuest().id).toBe('ilk_odun');
    let out;
    for (let i = 0; i < 3; i++) out = p.onEvent({ type: 'blockBroken', id: B.LOG_OAK });
    const ids = out.events.filter((e) => e.completed).map((e) => e.id);
    expect(ids).toEqual(['ilk_odun', 'tahta_yap', 'tezgah_yap', 'tezgah_koy', 'sopa_yap', 'ahsap_kazma']);
    expect(p.activeQuest().id).toBe('sandik_yap'); // sandık görevleri ahşap kazmadan hemen sonra öğretilir
  });

  it('bölge görev zinciri ön koşullar sağlanınca mühür/boss ile ilerler', () => {
    const p = createProgression(1);
    collect(p, 0, 2);
    place(p, 0, 2);
    expect(p.questsDone.z0_kristal).toBeUndefined(); // ilk_tapinak ön koşulu henüz yok
    p.onEvent({ type: 'itemCrafted', item: 'blok:meşe_tahta', count: 8 });
    p.onEvent({ type: 'itemCrafted', item: 'blok:tezgah', count: 1 });
    p.onEvent({ type: 'itemCrafted', item: 'item:sopa', count: 4 });
    p.onEvent({ type: 'itemCrafted', item: 'item:kazma_ahşap', count: 1 });
    p.onEvent({ type: 'puzzleSolved', id: 'a', zone: 0 });
    p.onEvent({ type: 'structureDiscovered', id: 'anahtartapinagi:1,1', structType: 'anahtartapinagi', zone: 0 });
    for (let i = 0; i < 3; i++) p.onEvent({ type: 'blockBroken', id: B.LOG_OAK });
    expect(p.questsDone.ilk_tapinak).toBe(true);
    expect(p.questsDone.z0_kristal).toBe(true);
    expect(p.questsDone.z0_muhur).toBe(true);
    p.onEvent({ type: 'zoneEnter', zone: 1 });
    expect(p.questsDone.z1_gec).toBe(true);
    collect(p, 1, 3);
    place(p, 1, 3);
    p.onEvent({ type: 'bossDefeated', zone: 1 });
    expect(p.questsDone.z1_kristal).toBe(true);
    expect(p.questsDone.z1_muhur).toBe(true);
    expect(p.questsDone.z1_boss).toBe(true);
  });

  it('kilitli bölgeye zoneEnter olayı ziyareti işaretlemez', () => {
    const p = createProgression(1);
    p.onEvent({ type: 'zoneEnter', zone: 3 });
    expect(p.zonesVisited[3]).toBeUndefined();
  });

  it('journal(), questLines(), questHud(), hint()', () => {
    const p = createProgression(1);
    const j = p.journal();
    expect(j.quests.length).toBeGreaterThan(0);
    expect(j.achievements.length).toBeGreaterThanOrEqual(40);
    expect(j.abilities.doubleJump).toBe(false);
    expect(j.stats.level).toBe(0);
    expect(p.questLines(2)).toHaveLength(2);
    expect(p.questHud().title).toBe('İlk Odunlar');
    expect(p.hint({})).toContain('ağaca');
    expect(p.hint({ hp: 2, maxHp: 20 })).toContain('Canın azaldı');
  });

  it('seviye atlama olayı', () => {
    const p = createProgression(1);
    const out = p.onEvent({ type: 'xp', amount: 200 });
    expect(out.events.find((e) => e.type === 'levelUp').level).toBe(xpLevel(200));
  });
});

describe('Serileştirme, yükleme, göç', () => {
  function played() {
    const p = createProgression(7);
    collect(p, 0, 2);
    place(p, 0, 2);
    p.onEvent({ type: 'bossDefeated', zone: 1 });
    p.onEvent({ type: 'parkourDone', id: 'p1', tier: 3, ms: 61000 });
    p.onEvent({ type: 'puzzleSolved', id: 'pz1', zone: 0 });
    p.onEvent({ type: 'structureDiscovered', id: 'turbe:1,1', structType: 'turbe', zone: 0 });
    p.onEvent({ type: 'biomeEntered', biome: 'dag' });
    p.onEvent({ type: 'itemCrafted', item: 'item:sopa', count: 4 });
    p.onEvent({ type: 'blockBroken', id: B.COAL_ORE });
    for (let i = 0; i < 30; i++) p.onEvent({ type: 'tick', dt: 0.2, x: i * 5, z: 3, light: 15 });
    p.setDifficulty('zor');
    return p;
  }

  it('serialize → JSON → restore aynı durumu verir', () => {
    const p = played();
    const json = JSON.parse(JSON.stringify(p.serialize()));
    const q = createProgression(7);
    expect(q.restore(json)).toBe(true);
    expect(q.serialize()).toEqual(p.serialize());
    expect(q.zonesUnlocked).toEqual(p.zonesUnlocked);
    expect(q.hasAbility('doubleJump')).toBe(true);
    expect(q.difficulty).toBe('zor');
    expect(q.revealCount).toBe(p.revealCount);
    expect(q.activeQuest().id).toBe(p.activeQuest().id);
    expect(q.pendingRewards()).toEqual(p.pendingRewards());
    expect(q.stats.parkourBest).toEqual({ p1: 61000 });
    expect(q.questsDone).toEqual(p.questsDone);
  });

  it('geri yüklenen durumda olaylar eskisi gibi çalışır (kristal/ödül tekrarı yok)', () => {
    const q = createProgression(7);
    q.restore(JSON.parse(JSON.stringify(played().serialize())));
    expect(q.onEvent({ type: 'bossDefeated', zone: 1 }).rewards).toEqual([]);
    expect(q.onEvent({ type: 'puzzleSolved', id: 'pz1', zone: 0 }).events.length).toBe(0);
    expect(q.stats.puzzlesSolved).toBe(1);
  });

  it('kayıt çıktısı JSON-güvenli ve makul boyutta', () => {
    const s = JSON.stringify(played().serialize());
    expect(s.length).toBeLessThan(20000);
    expect(JSON.parse(s).v).toBe(1);
  });

  it('bozuk veri atmaz: sınırlar, tutarsız bölge kilitleri düzeltilir', () => {
    const q = createProgression(1);
    expect(q.restore('merhaba')).toBe(false);
    expect(q.restore(null)).toBe(false);
    expect(q.restore([1, 2])).toBe(false);
    expect(q.zonesUnlocked).toEqual([true, false, false, false, false]);
    expect(q.restore({
      v: 1,
      zonesUnlocked: [false, false, true, true, true],
      seals: { 3: true, 9: true },
      abilities: { doubleJump: 'evet', grapple: true, hile: true },
      stats: { blocksBroken: -5, distance: 'x', mobsKilled: 1e30, crafted: { 'item:sopa': 5, '__proto__': 9, kotu: 3 } },
      rewards: { pending: ['zone:1:boss', 'zone:1:boss', 'hile', 5], claimed: ['zone:1:boss'] },
      discovered: { structures: ['turbe:1,1', 'turbe:1,1', '<script>', 5], biomes: ['orman', 'yok'] },
      difficulty: 'efsane',
      mapReveal: 'bozuk!',
    })).toBe(true);
    expect(q.zonesUnlocked).toEqual([true, false, false, false, false]); // zincir kopuk: bölge 1 kapalıyken ardıllar açılamaz
    expect(q.seals).toEqual({});
    expect(q.abilities.doubleJump).toBe(false);
    expect(q.abilities.grapple).toBe(true);
    expect(Object.keys(q.abilities)).not.toContain('hile');
    expect(q.stats.blocksBroken).toBe(0);
    expect(q.stats.distance).toBe(0);
    expect(q.stats.mobsKilled).toBeLessThanOrEqual(2147483000);
    expect(q.stats.crafted).toEqual({ 'item:sopa': 5 });
    expect(q.rewards.pending).toEqual([]); // zaten alınmış olan bekleyenden çıkar
    expect(q.rewards.claimed).toEqual(['zone:1:boss']);
    expect(q.discovered.structures).toEqual(['turbe:1,1']);
    expect(q.discovered.biomes).toEqual(['orman']);
    expect(q.difficulty).toBe('normal');
    expect(q.revealCount).toBe(0);
  });

  it('mühürü bitmiş bölgenin ardılı kayıtta açık sayılır', () => {
    const q = createProgression(1);
    q.restore({ v: 1, seals: { 0: true }, zonesUnlocked: [true] });
    expect(q.zonesUnlocked).toEqual([true, true, false, false, false]);
  });

  it('v0 (sürümsüz) eski biçim yerleşik göçle yüklenir', () => {
    const q = createProgression(1);
    expect(q.restore({ zones: [true, true, false, false, false], stats: { blocksBroken: 12 } })).toBe(true);
    expect(q.zonesUnlocked).toEqual([true, true, false, false, false]);
    expect(q.stats.blocksBroken).toBe(12);
    const m = migrateProgression({ zones: [true] });
    expect(m).toMatchObject({ ok: true, from: 0 });
    expect(m.data.v).toBe(1);
  });

  it('kayıtlı göç dönüştürücüsü kullanılır ve geri alınabilir', () => {
    registerProgressionMigration(0, (d) => Object.assign({}, d, { v: 1, stats: { blocksBroken: 777 } }));
    try {
      const q = createProgression(1);
      q.restore({ foo: 1 });
      expect(q.stats.blocksBroken).toBe(777);
    } finally {
      unregisterProgressionMigration(0);
    }
    const q2 = createProgression(1);
    q2.restore({ stats: { blocksBroken: 3 } });
    expect(q2.stats.blocksBroken).toBe(3);
    // atan göç dönüştürücüsü yükleme başarısızlığı olur, atmaz
    registerProgressionMigration(0, () => { throw new Error('x'); });
    try {
      expect(createProgression(1).restore({})).toBe(false);
    } finally {
      unregisterProgressionMigration(0);
    }
  });

  it('gelecek sürüm verisi alanlarıyla sınırlanarak okunur', () => {
    const q = createProgression(1);
    expect(q.restore({ v: 9, stats: { blocksBroken: 4 }, yeniAlan: { a: 1 } })).toBe(true);
    expect(q.stats.blocksBroken).toBe(4);
  });

  it('rastgele bozulmuş ilerleme verisi asla atmaz', () => {
    const base = JSON.parse(JSON.stringify(played().serialize()));
    let seed = 12345;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const junk = [null, undefined, 'x', -1, 1e99, NaN, [], {}, [1, 2, 3], { a: 1 }, true, '__proto__', 0];
    const keys = Object.keys(base);
    for (let i = 0; i < 400; i++) {
      const d = JSON.parse(JSON.stringify(base));
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const key = keys[Math.floor(rnd() * keys.length)];
        const v = junk[Math.floor(rnd() * junk.length)];
        if (rnd() < 0.5 && d[key] && typeof d[key] === 'object') {
          const sub = Object.keys(d[key]);
          if (sub.length) d[key][sub[Math.floor(rnd() * sub.length)]] = v;
        } else {
          d[key] = v;
        }
      }
      const q = createProgression(1);
      expect(() => q.restore(d)).not.toThrow();
      expect(() => q.serialize()).not.toThrow();
      expect(() => q.onEvent({ type: 'sync' })).not.toThrow();
      q.zonesUnlocked.forEach((z) => expect(typeof z).toBe('boolean'));
      expect(q.zonesUnlocked[0]).toBe(true);
    }
  });
});

describe('düşmanca olay verisi', () => {
  it('"__proto__"/"constructor" gibi anahtarlar istatistik haritalarını bozmaz', () => {
    const p = createProgression(1);
    ['__proto__', 'constructor', 'toString', 'hasOwnProperty'].forEach((k) => {
      expect(() => p.onEvent({ type: 'mobKilled', key: k })).not.toThrow();
      expect(() => p.onEvent({ type: 'itemCrafted', item: k, count: 2 })).not.toThrow();
      expect(() => p.onEvent({ type: 'itemPickedUp', item: k, count: 2 })).not.toThrow();
      expect(() => p.onEvent({ type: 'eaten', item: k })).not.toThrow();
      expect(() => p.onEvent({ type: 'parkourDone', id: k, tier: 1, ms: 5 })).not.toThrow();
      expect(() => p.onEvent({ type: 'structureDiscovered', id: k, structType: k })).not.toThrow();
    });
    expect(p.stats.mobKinds).toEqual({});
    expect(p.stats.crafted).toEqual({});
    expect(p.stats.picked).toEqual({});
    expect(p.stats.eaten).toEqual({});
    expect(Object.keys(p.stats.parkourBest)).not.toContain('__proto__');
    expect(p.stats.mobsKilled).toBe(4);
    const json = JSON.parse(JSON.stringify(p.serialize()));
    const q = createProgression(1);
    expect(q.restore(json)).toBe(true);
    expect(({}).polluted).toBeUndefined();
  });

  it('aşırı değerler sınırlanır (negatif/NaN/dev sayı)', () => {
    const p = createProgression(1);
    p.onEvent({ type: 'itemCrafted', item: 'item:sopa', count: -5 });
    p.onEvent({ type: 'itemCrafted', item: 'item:sopa', count: NaN });
    p.onEvent({ type: 'itemPickedUp', item: 'item:elma', count: 1e30 });
    p.onEvent({ type: 'distance', d: 1e30 });
    p.onEvent({ type: 'xp', amount: -10 });
    p.onEvent({ type: 'tick', dt: -5, x: NaN, z: Infinity });
    expect(p.stats.itemsCrafted).toBe(0);
    expect(p.stats.itemsPicked).toBeLessThanOrEqual(100000);
    expect(p.stats.distance).toBeLessThanOrEqual(5000);
    expect(Number.isFinite(p.stats.xp) && p.stats.xp >= 0).toBe(true);
    expect(p.stats.playTime).toBe(0);
    expect(Number.isFinite(p.stats.distance)).toBe(true);
  });
});
