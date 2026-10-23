import { describe, expect, it } from 'vitest';
import { ZONES } from './constants.js';
import { BLOCKS } from './blocks.js';
import { Inventory } from './inventory.js';
import { itemByKey } from './items.js';
import { createProgression } from './progression.js';
import { SCALAR_METRICS, goalValue } from './progressionMetrics.js';
import {
  QUESTS, QUEST_BY_ID, QUEST_CHAINS, getActiveQuest, getActiveQuests, getHint, getHintInfo, getQuestHud, getQuestLines,
  getQuestList, getQuest, isQuestAvailable, questProgress, questState, restoreQuests, serializeQuests, syncQuests,
} from './quests.js';

const GOAL_TYPES = [
  'break', 'place', 'craft', 'smelt', 'pickup', 'kill', 'puzzle', 'crystal', 'sealPlace', 'seal', 'boss', 'zone',
  'discover', 'parkour', 'ability', 'eat', 'stat',
];
const TURKISH = /[a-zçğıöşüÇĞİÖŞÜ]/i;

describe('görev verisi', () => {
  it('en az 40 görev, benzersiz kimlik, geçerli zincir', () => {
    expect(QUESTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    const chains = QUEST_CHAINS.map((c) => c.key);
    QUESTS.forEach((q) => expect(chains).toContain(q.chain));
    chains.forEach((c) => expect(QUESTS.some((q) => q.chain === c)).toBe(true));
  });

  it('her görevde Türkçe başlık/açıklama/ipucu, geçerli hedef ve ödül', () => {
    QUESTS.forEach((q) => {
      ['title', 'desc', 'hint'].forEach((f) => {
        expect(typeof q[f], q.id + '.' + f).toBe('string');
        expect(q[f].length, q.id + '.' + f).toBeGreaterThan(3);
        expect(TURKISH.test(q[f])).toBe(true);
      });
      expect(Number.isInteger(q.n) && q.n >= 1, q.id).toBe(true);
      expect(GOAL_TYPES, q.id).toContain(q.goal.type);
      expect(q.rewards.xp, q.id).toBeGreaterThan(0);
      q.rewards.items.forEach((it) => {
        expect(itemByKey(it.item), q.id + ' ödül ' + it.item).not.toBeNull();
        expect(it.count).toBeGreaterThan(0);
      });
    });
  });

  it('hedeflerdeki blok kimlikleri, eşyalar, ölçütler, bölgeler geçerli', () => {
    QUESTS.forEach((q) => {
      const g = q.goal;
      if (g.ids) g.ids.forEach((id) => expect(BLOCKS[id] && BLOCKS[id].id, q.id).toBe(id));
      if (g.items) g.items.forEach((it) => expect(itemByKey(it), q.id + ' ' + it).not.toBeNull());
      if (g.prefix) expect(typeof g.prefix).toBe('string');
      if (g.type === 'stat') expect(SCALAR_METRICS[g.name], q.id + ' ' + g.name).toBeTypeOf('function');
      if (g.zone !== undefined) expect(ZONES[g.zone], q.id).toBeTruthy();
      if (g.tier !== undefined) expect(g.tier >= 1 && g.tier <= 5).toBe(true);
    });
  });

  it('ön koşullar mevcut ve döngüsüz (her görev başlangıçtan ulaşılabilir)', () => {
    const done = new Set();
    let progress = true;
    QUESTS.forEach((q) => q.requires.forEach((r) => expect(QUEST_BY_ID[r], q.id + '→' + r).toBeTruthy()));
    while (progress) {
      progress = false;
      QUESTS.forEach((q) => {
        if (!done.has(q.id) && q.requires.every((r) => done.has(r))) {
          done.add(q.id);
          progress = true;
        }
      });
    }
    expect(done.size).toBe(QUESTS.length);
  });

  it('bölge zinciri: her bölge için geç → kristal → mühür → boss; yetenek ödüllü boss görevleri', () => {
    for (let z = 1; z < ZONES.length; z++) {
      ['gec', 'kristal', 'muhur', 'boss'].forEach((k) => expect(getQuest('z' + z + '_' + k), 'z' + z + k).toBeTruthy());
      expect(getQuest('z' + z + '_kristal').n).toBe(ZONES[z].temples);
      expect(getQuest('z' + z + '_muhur').n).toBe(ZONES[z].temples);
    }
    expect(getQuest('z0_kristal').n).toBe(ZONES[0].temples);
    const chains = new Set(QUESTS.map((q) => q.chain));
    expect(chains.has('parkur') && chains.has('keşif') && chains.has('inşa') && chains.has('savaş')).toBe(true);
    for (let t = 1; t <= 5; t++) expect(QUESTS.some((q) => q.goal.type === 'parkour' && q.goal.tier === t)).toBe(true);
  });
});

describe('görev motoru', () => {
  it('başlangıç: yalnız ön koşulsuz görevler açık; ana görev "İlk Odunlar"', () => {
    const p = createProgression(1);
    const act = getActiveQuests(p, 100);
    act.forEach((a) => expect(getQuest(a.id).requires).toEqual([].concat(getQuest(a.id).requires.filter((r) => p.questsDone[r]))));
    expect(getActiveQuest(p).id).toBe('ilk_odun');
    expect(questState(p, getQuest('tahta_yap'))).toBe('locked');
    expect(isQuestAvailable(p, getQuest('ilk_odun'))).toBe(true);
    expect(act.map((a) => a.id)).toEqual(expect.arrayContaining(['ilk_odun', 'ks_biyom3', 'ks_mesafe1', 'yk_ye']));
  });

  it('syncQuests tamamlananı ve ilerleme değişimini bildirir; tamamlanan tekrar bildirilmez', () => {
    const p = createProgression(1);
    p.stats.broken[40] = 1;
    p.stats.blocksBroken = 1;
    const a = syncQuests(p);
    expect(a.changed.map((c) => c.quest.id)).toContain('ilk_odun');
    expect(a.completed).toHaveLength(0);
    expect(syncQuests(p).changed).toHaveLength(0);
    p.stats.broken[40] = 3;
    const b = syncQuests(p);
    expect(b.completed.map((q) => q.id)).toEqual(['ilk_odun']);
    expect(syncQuests(p).completed).toHaveLength(0);
    expect(questState(p, getQuest('ilk_odun'))).toBe('done');
    expect(questProgress(p, getQuest('ilk_odun'))).toBe(3);
  });

  it('ilerleme hedefle sınırlanır; goalValue türleri', () => {
    const p = createProgression(1);
    p.stats.broken[40] = 99;
    expect(questProgress(p, getQuest('ilk_odun'))).toBe(3);
    p.stats.crafted['blok:meşe_tahta'] = 5;
    p.stats.crafted['blok:huş_tahta'] = 4;
    expect(goalValue(p, getQuest('tahta_yap').goal)).toBe(9);
    p.stats.crafted['item:kazma_taş'] = 1;
    expect(goalValue(p, { type: 'craft', prefix: 'item:kazma_' })).toBe(1);
    p.crystals[2] = ['a', 'b'];
    expect(goalValue(p, { type: 'crystal', zone: 2 })).toBe(2);
    p.discovered.structures = ['turbe:1,1', 'turbe:2,2', 'kamp:0,0'];
    expect(goalValue(p, { type: 'discover', types: ['turbe'] })).toBe(2);
    expect(goalValue(p, { type: 'discover', types: ['turbe', 'kamp'] })).toBe(3);
    expect(goalValue(p, { type: 'yok' })).toBe(0);
  });

  it('zincirleme tamamlama aynı çağrıda ilerler', () => {
    const p = createProgression(1);
    p.stats.broken[40] = 3;
    p.stats.crafted['blok:meşe_tahta'] = 8;
    p.stats.crafted['blok:tezgah'] = 1;
    p.stats.placed[92] = 1;
    p.stats.crafted['item:sopa'] = 4;
    const r = syncQuests(p);
    expect(r.completed.map((q) => q.id)).toEqual(['ilk_odun', 'tahta_yap', 'tezgah_yap', 'tezgah_koy', 'sopa_yap']);
    expect(getActiveQuest(p).id).toBe('ahsap_kazma');
  });

  it('HUD yardımcıları', () => {
    const p = createProgression(1);
    const lines = getQuestLines(p, 3);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/\(0\/3\)$/);
    const hud = getQuestHud(p);
    expect(hud.title).toBe('İlk Odunlar');
    expect(hud.lines).toHaveLength(3);
    p.stats.broken[40] = 2;
    syncQuests(p);
    expect(getQuestLines(p, 1)[0]).toMatch(/\(2\/3\)$/);
    QUESTS.forEach((q) => { p.questsDone[q.id] = true; });
    expect(getActiveQuest(p)).toBeNull();
    expect(getQuestHud(p).title).toBe('Tüm görevler tamam');
    expect(getQuestLines(p)).toEqual([]);
  });

  it('günlük listesi: açıklar önce, bitenler sonra; kilitliler isteğe bağlı; zincir süzgeci', () => {
    const p = createProgression(1);
    p.questsDone.ilk_odun = true;
    const l = getQuestList(p, {});
    const firstDone = l.findIndex((q) => q.state === 'done');
    const lastActive = l.map((q) => q.state).lastIndexOf('active');
    expect(firstDone).toBeGreaterThan(lastActive);
    expect(l.some((q) => q.state === 'locked')).toBe(false);
    const all = getQuestList(p, { includeLocked: true });
    expect(all).toHaveLength(QUESTS.length);
    expect(getQuestList(p, { chain: 'parkur', includeLocked: true }).every((q) => q.chain === 'parkur')).toBe(true);
  });

  it('serializeQuests / restoreQuests: yalnız bilinen biten görevler geri gelir', () => {
    const p = createProgression(1);
    p.questsDone.ilk_odun = true;
    p.questsDone.tahta_yap = true;
    const arr = serializeQuests(p);
    expect(arr.find((e) => e.id === 'ilk_odun')).toEqual({ id: 'ilk_odun', state: 'done', progress: 3 });
    expect(arr.every((e) => e.state === 'done' || e.state === 'active')).toBe(true);
    expect(arr.find((e) => e.id === 'tezgah_yap').state).toBe('active');
    const q = createProgression(1);
    expect(restoreQuests(q, JSON.parse(JSON.stringify(arr)))).toBe(2);
    expect(q.questsDone).toEqual({ ilk_odun: true, tahta_yap: true });
    expect(restoreQuests(q, [{ id: 'yok', state: 'done' }, null, 5, { id: 'ilk_odun', state: 'active' }, { id: 'ilk_odun', state: 'done' }])).toBe(1);
    expect(restoreQuests(q, 'x')).toBe(0);
  });
});

describe('bağlamsal ipucu', () => {
  function inv(items) {
    const i = new Inventory();
    Object.keys(items).forEach((k) => i.add(k, items[k]));
    return i;
  }

  it('öncelik: düşük can > açlık > gece > karanlık > bulmaca > görev', () => {
    const p = createProgression(1);
    const ctx = {
      hp: 3, maxHp: 20, hunger: 2, isNight: true, underground: true, light: 0, inventory: inv({}), puzzleHint: 'Plakaya bas.',
    };
    expect(getHintInfo(p, ctx).key).toBe('düşük_can');
    ctx.hp = 20;
    expect(getHintInfo(p, ctx).key).toBe('aç');
    ctx.hunger = 20;
    ctx.underground = false;
    expect(getHintInfo(p, ctx).key).toBe('gece');
    ctx.isNight = false;
    ctx.underground = true;
    expect(getHintInfo(p, ctx).key).toBe('karanlık');
    ctx.inventory = inv({ 'blok:meşale': 2 });
    expect(getHintInfo(p, ctx)).toEqual({ key: 'bulmaca', text: 'Plakaya bas.' });
    ctx.puzzleHint = null;
    expect(getHintInfo(p, ctx).key).toBe('görev:ilk_odun');
    expect(getHint(p, ctx)).toBe(getQuest('ilk_odun').hint);
  });

  it('gün batımı (ilk akşamlar): "Gece geliyor" nazik uyarısı; meşale varsa, yeraltında ya da gece değilse yok', () => {
    const p = createProgression(1);
    const ctx = {
      hp: 20, maxHp: 20, hunger: 20, dusk: true, isNight: false, underground: false, inventory: inv({}),
    };
    expect(getHintInfo(p, ctx)).toEqual({
      key: 'gece_geliyor', text: 'Gece geliyor: meşale yap, barınak kur veya yatağa uzan.',
    });
    // can/açlık hâlâ önceliklidir
    expect(getHintInfo(p, Object.assign({}, ctx, { hp: 3 })).key).toBe('düşük_can');
    expect(getHintInfo(p, Object.assign({}, ctx, { hunger: 2 })).key).toBe('aç');
    // meşale varsa ya da mağaradaysa görev ipucuna döner
    expect(getHintInfo(p, Object.assign({}, ctx, { inventory: inv({ 'blok:meşale': 1 }) })).key).toBe('görev:ilk_odun');
    expect(getHintInfo(p, Object.assign({}, ctx, { underground: true })).key).not.toBe('gece_geliyor');
    expect(getHintInfo(p, Object.assign({}, ctx, { dusk: false })).key).toBe('görev:ilk_odun');
    // gece olunca bildik "Gece oldu" ipucu
    expect(getHintInfo(p, Object.assign({}, ctx, { dusk: false, isNight: true })).key).toBe('gece');
  });

  it('yiyecek ve şifa iksiri varlığı metni değiştirir', () => {
    const p = createProgression(1);
    expect(getHint(p, { hunger: 3, inventory: inv({ 'item:elma': 2 }) })).toContain('yiyeceği seç');
    expect(getHint(p, { hunger: 3, inventory: inv({}) })).toContain('elma topla');
    expect(getHint(p, { hp: 2, maxHp: 20, inventory: inv({ 'item:şifa_iksiri': 1 }) })).toContain('şifa iksirini');
  });

  it('bağlam yoksa ana görev ipucu; her şey bitince null', () => {
    const p = createProgression(1);
    expect(getHint(p, undefined)).toBe(getQuest('ilk_odun').hint);
    QUESTS.forEach((q) => { p.questsDone[q.id] = true; });
    expect(getHint(p, {})).toBeNull();
    expect(getHintInfo(p, null)).toBeNull();
  });
});
