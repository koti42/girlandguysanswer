import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_NAMES, QUEST_CHAIN_NEON } from '../cityNames.js';
import { citySeed } from '../cityPlanTestKit.js';
import { ensureCityState, metricsOf, STAT_KEYS } from '../cityState.js';
import {
  ACHIEVEMENTS, ACHIEVEMENT_BY_ID, achievementRows, evaluateAchievements, metricValue,
} from './achievements.js';
import {
  CHAIN_ORDER, QUESTS, QUEST_BY_ID, activeQuest, autoStart, evaluateQuests, questProgress, questRows, questState, questTarget, startQuest,
} from './quests.js';

describe('başarımlar', () => {
  it('52 başarım: 24 sözleşme adı + 28 ek; benzersiz kimlik, Türkçe metin, gizli olanlar var, ölçütler STAT/ türetilmiş anahtarlarda', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
    expect(ACHIEVEMENTS).toHaveLength(52);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    ACHIEVEMENT_NAMES.forEach((n) => {
      expect(ACHIEVEMENT_BY_ID[n.id].name).toBe(n.name);
      expect(ACHIEVEMENT_BY_ID[n.id].desc).toBe(n.desc);
    });
    expect(ACHIEVEMENTS.filter((a) => a.hidden).length).toBeGreaterThanOrEqual(4);
    const metrics = Object.keys(metricsOf({}));
    ACHIEVEMENTS.forEach((a) => {
      expect(a.id).toMatch(/^nm_[a-z0-9_]{2,24}$/);
      expect(a.name.length).toBeGreaterThan(2);
      expect(a.desc.length).toBeGreaterThan(5);
      expect(a.target).toBeGreaterThan(0);
      expect(a.kredi).toBeGreaterThanOrEqual(0);
      if (a.id !== 'nm_neon_usta') expect(metrics.concat(['achOthers']), a.id + ' ölçütü ' + a.metric).toContain(a.metric);
    });
    STAT_KEYS.forEach((k) => expect(typeof k).toBe('string'));
  });

  it('değerlendirme: eşik aşılınca bir kez açılır (verilen küme güncellenmedikçe aynı sonuç), usta zinciri en sonda', () => {
    const view = Object.assign(metricsOf({}), { chipsFound: 130, jobsDone: 12, dimHops: 1 });
    const got = evaluateAchievements(view, new Set());
    const ids = got.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['nm_ilk_cip', 'nm_cip_60', 'nm_cip_120', 'nm_kurye_1', 'nm_kurye_10', 'nm_ilk_gecis']));
    expect(ids).not.toContain('nm_cip_240');
    expect(ids).not.toContain('nm_neon_usta');
    // zaten açıklar tekrar gelmez
    const have = new Set(ids);
    expect(evaluateAchievements(view, have)).toEqual([]);
    expect(evaluateAchievements(view, Object.fromEntries(ids.map((i) => [i, 1])))).toEqual([]);
    // hepsi sağlanınca usta, aynı turda
    const all = {};
    Object.keys(metricsOf({})).forEach((k) => { all[k] = 1e6; });
    const everything = evaluateAchievements(all, new Set());
    expect(everything).toHaveLength(ACHIEVEMENTS.length);
    expect(everything[everything.length - 1].id).toBe('nm_neon_usta');
    const rest = new Set(ACHIEVEMENTS.filter((a) => a.id !== 'nm_neon_usta').map((a) => a.id));
    expect(evaluateAchievements({}, rest).map((a) => a.id)).toEqual(['nm_neon_usta']);
    rest.delete('nm_cip_60');
    expect(evaluateAchievements({}, rest)).toEqual([]);
  });

  it('satırlar: gizli+kilitli ??? gösterir; ilerleme sınırlı; NaN/negatif ölçüt 0', () => {
    const rows = achievementRows(Object.assign(metricsOf({}), { chipsFound: 30 }), ['nm_ilk_gecis']);
    expect(rows).toHaveLength(52);
    const sec = rows.find((r) => r.id === 'nm_diyar_isigi');
    expect(sec.name).toBe('???');
    expect(sec.hidden).toBe(true);
    expect(sec.text).toBe('');
    const c60 = rows.find((r) => r.id === 'nm_cip_60');
    expect(c60.progress).toBe(30);
    expect(c60.text).toBe('30/60');
    expect(rows.find((r) => r.id === 'nm_ilk_gecis').done).toBe(true);
    const doneSecret = achievementRows({}, ['nm_diyar_isigi']).find((r) => r.id === 'nm_diyar_isigi');
    expect(doneSecret.name).toBe('Diyar Işığı');
    expect(metricValue({ x: NaN }, { metric: 'x' })).toBe(0);
    expect(metricValue({ x: -4 }, { metric: 'x' })).toBe(0);
    expect(metricValue(null, { metric: 'x' })).toBe(0);
  });
});

describe('hikâye görev zinciri', () => {
  it('14 görev: 12 sözleşme kimliği (cityNames) + hoşgeldin + altı mahalle; kimlikler benzersiz, sıra bellidir, son görev Diyar Işığı', () => {
    expect(QUESTS).toHaveLength(14);
    QUEST_CHAIN_NEON.forEach((q) => {
      expect(QUEST_BY_ID[q.id]).toBeTruthy();
      expect(QUEST_BY_ID[q.id].name).toBe(q.name);
    });
    expect(CHAIN_ORDER[0]).toBe('nm_hosgeldin');
    expect(CHAIN_ORDER[CHAIN_ORDER.length - 1]).toBe('nm_portal_yumurtasi');
    expect(new Set(CHAIN_ORDER).size).toBe(14);
    const metrics = Object.keys(metricsOf({}));
    QUESTS.forEach((q) => {
      expect(metrics, q.id).toContain(q.metric);
      expect(q.target).toBeGreaterThan(0);
      expect(q.hint.length).toBeGreaterThan(8);
      expect(q.kredi).toBeGreaterThan(0);
    });
  });

  it('başlat/bitir: yalnız 0→1→2; ilerleme toplam ölçütten; sonradan başlayan görev önceki ilerlemeyi sayar (soft-lock yok)', () => {
    const q = {};
    expect(startQuest(q, 'nm_yok')).toBe(false);
    expect(startQuest(q, 'nm_cip_10')).toBe(true);
    expect(startQuest(q, 'nm_cip_10')).toBe(false);
    expect(questState(q, 'nm_cip_10')).toBe(1);
    const view = { chipsFound: 4 };
    expect(questProgress(view, QUEST_BY_ID.nm_cip_10)).toEqual({ have: 4, need: 10 });
    expect(evaluateQuests(view, q).done).toEqual([]);
    expect(evaluateQuests({ chipsFound: 25 }, q).done.map((d) => d.id)).toEqual(['nm_cip_10']);
    expect(questState(q, 'nm_cip_10')).toBe(2);
    expect(evaluateQuests({ chipsFound: 25 }, q).done).toEqual([]);
    expect(startQuest(q, 'nm_cip_10')).toBe(false);
    // önceden yapılmış iş: görev başlar başlamaz tamamlanır
    startQuest(q, 'nm_graffiti_5');
    expect(evaluateQuests({ graffitiDone: 9 }, q).done.map((d) => d.id)).toEqual(['nm_graffiti_5']);
    expect(questProgress(null, QUEST_BY_ID.nm_cip_10).have).toBe(0);
  });

  it('autoStart: ilk girişte hoşgeldin; etkin görev yoksa zincirdeki sıradaki başlar; Kasa görevi 8 görev bitince', () => {
    const q = {};
    expect(autoStart({ dimHops: 0 }, q)).toEqual([]);
    expect(autoStart({ dimHops: 1 }, q).map((d) => d.id)).toEqual(['nm_hosgeldin']);
    expect(autoStart({ dimHops: 1 }, q)).toEqual([]);
    q.nm_hosgeldin = 2;
    expect(autoStart({ dimHops: 1 }, q).map((d) => d.id)).toEqual(['nm_ilk_surus']);
    expect(activeQuest(q).id).toBe('nm_ilk_surus');
    // 8 görev tamamla → Kasa görevi açılır
    ['nm_ilk_surus', 'nm_ilk_teslimat', 'nm_bolgeler', 'nm_yaris_bronz', 'nm_cip_10', 'nm_graffiti_5', 'nm_cati_parkur'].forEach((id) => { q[id] = 2; });
    const started = autoStart({ dimHops: 1 }, q).map((d) => d.id);
    expect(started).toContain('nm_portal_yumurtasi');
    // etkin hiç yoksa 'nm_portal_yumurtasi' dışı sıradaki başlatılır
    const q2 = {};
    CHAIN_ORDER.forEach((id) => { q2[id] = 2; });
    q2.nm_taksi_5 = 0;
    delete q2.nm_taksi_5;
    expect(autoStart({ dimHops: 1 }, q2).map((d) => d.id)).toEqual(['nm_taksi_5']);
    const done = {};
    CHAIN_ORDER.forEach((id) => { done[id] = 2; });
    expect(autoStart({ dimHops: 1 }, done)).toEqual([]);
    expect(activeQuest(done)).toBeNull();
  });

  it('satırlar: kilitli gizli görev ???, etkinde ipucu, bitenlerde ilerleme tam', () => {
    const q = { nm_ilk_surus: 1, nm_cip_10: 2 };
    const rows = questRows({ driveM: 120, chipsFound: 12 }, q);
    expect(rows).toHaveLength(14);
    expect(rows.find((r) => r.id === 'nm_portal_yumurtasi').title).toBe('???');
    const a = rows.find((r) => r.id === 'nm_ilk_surus');
    expect(a.state).toBe('active');
    expect(a.hint.length).toBeGreaterThan(5);
    expect(a.progress).toBe(120);
    expect(rows.find((r) => r.id === 'nm_cip_10')).toMatchObject({ state: 'done', progress: 10, goal: 10 });
    expect(rows.find((r) => r.id === 'nm_robot_10').state).toBe('locked');
  });

  it('görev hedefi: ilgili ilgi noktasının en yakını; sır görevlerde null', () => {
    const seed = citySeed(2);
    const t = questTarget(seed, QUEST_BY_ID.nm_ilk_teslimat, 0, 0);
    expect(t && Number.isFinite(t.x + t.z)).toBe(true);
    const t2 = questTarget(seed, QUEST_BY_ID.nm_ilk_teslimat, t.x + 1, t.z + 1);
    expect(t2.x).toBe(t.x);
    expect(questTarget(seed, QUEST_BY_ID.nm_gizli_oda, 0, 0)).toBeNull();
    expect(questTarget(seed, QUEST_BY_ID.nm_portal_yumurtasi, 0, 0)).toBeNull();
    expect(questTarget(seed, null, 0, 0)).toBeNull();
    ['nm_ilk_surus', 'nm_yaris_bronz', 'nm_cati_parkur', 'nm_fotograf', 'nm_garaj_boya'].forEach((id) => {
      expect(questTarget(seed, QUEST_BY_ID[id], 100, 100), id).not.toBeNull();
    });
    expect(ensureCityState({}).quests).toEqual({});
  });
});
