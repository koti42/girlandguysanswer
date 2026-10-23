import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { createProgression } from './progression.js';
import { ACHIEVEMENT_BY_ID } from './achievementsData.js';
import { QUEST_BY_ID } from './questsData.js';
import { STAT_COUNTERS } from './progressionData.js';
import { TREE_ACHIEVEMENTS, TREE_QUESTS } from './treeData.js';

function evs(outs) {
  return outs.reduce((a, o) => a.concat(o.events), []);
}

describe('ağaç devirme: ilerleme, görev ve başarımlar', () => {
  it('veri kayıtlı: iki görev (keşif zinciri), üç başarım, iki sayaç', () => {
    expect(TREE_QUESTS.map((q) => q.id)).toEqual(['ks_agac_devir', 'ks_agac_dik']);
    TREE_QUESTS.forEach((q) => {
      expect(QUEST_BY_ID[q.id].chain).toBe('keşif');
      expect(QUEST_BY_ID[q.id].goal.type).toBe('stat');
    });
    expect(QUEST_BY_ID.ks_agac_dik.requires).toEqual(['ks_agac_devir']);
    expect(ACHIEVEMENT_BY_ID.ilk_agac.title).toBe('İlk Ağacı Devir');
    expect(ACHIEVEMENT_BY_ID.kereste_ustasi.title).toBe('Kereste Ustası');
    expect(TREE_ACHIEVEMENTS).toHaveLength(3);
    expect(STAT_COUNTERS).toContain('treesFelled');
    expect(STAT_COUNTERS).toContain('treesGrown');
  });

  it('treeFelled olayı sayaçları artırır; İlk Ağacı Devir açılır, görev biter', () => {
    const p = createProgression(1);
    const out = [p.onEvent({ type: 'treeFelled', trees: 1, logs: 5, leaves: 30 })];
    expect(p.stats.treesFelled).toBe(1);
    const ids = evs(out).filter((e) => e.type === 'achievement').map((e) => e.id);
    expect(ids).toContain('ilk_agac');
    const done = evs(out).filter((e) => e.type === 'questUpdate' && e.completed).map((e) => e.id);
    expect(done).toContain('ks_agac_devir');
    expect(p.questsDone.ks_agac_devir).toBeTruthy();
  });

  it('Kereste Ustası: 25 ağaç; Fidancı: 10 büyüme', () => {
    const p = createProgression(1);
    let outs = [];
    for (let i = 0; i < 25; i++) outs.push(p.onEvent({ type: 'treeFelled', trees: 1 }));
    expect(evs(outs).filter((e) => e.type === 'achievement').map((e) => e.id)).toContain('kereste_ustasi');
    outs = [];
    for (let i = 0; i < 10; i++) outs.push(p.onEvent({ type: 'treeGrown' }));
    expect(p.stats.treesGrown).toBe(10);
    expect(evs(outs).filter((e) => e.type === 'achievement').map((e) => e.id)).toContain('fidanci');
  });

  it('toplu blockBroken (count): kütükler İlk Odunlar görevine sayılır (tek ağaç yeter)', () => {
    const p = createProgression(1);
    const out = p.onEvent({ type: 'blockBroken', id: B.LOG_OAK, count: 9, by: 'treefall' });
    expect(out.events.filter((e) => e.type === 'questUpdate' && e.completed).map((e) => e.id)).toContain('ilk_odun');
    expect(p.stats.blocksBroken).toBe(9);
    expect(p.stats.broken[B.LOG_OAK]).toBe(9);
    // aşırı/negatif/NaN count güvenli: 1
    p.onEvent({ type: 'blockBroken', id: B.LOG_OAK, count: -5 });
    p.onEvent({ type: 'blockBroken', id: B.LOG_OAK, count: NaN });
    p.onEvent({ type: 'blockBroken', id: B.LOG_OAK, count: 1e9 });
    expect(p.stats.broken[B.LOG_OAK]).toBe(9 + 1 + 1 + 1000);
  });

  it('kayıt gidiş-dönüş: sayaçlar korunur', () => {
    const p = createProgression(1);
    p.onEvent({ type: 'treeFelled', trees: 2 });
    p.onEvent({ type: 'treeGrown' });
    const ser = JSON.parse(JSON.stringify(p.serialize()));
    const q = createProgression(1);
    q.restore(ser);
    expect(q.stats.treesFelled).toBe(2);
    expect(q.stats.treesGrown).toBe(1);
  });
});
