import { describe, expect, it } from 'vitest';
import {
    ABILITY_INFO, JOURNAL_TABS, abilityRows, abilitySource, discoveryRows, formatDuration, formatMs, pct, questState, statRows,
} from './panelJournal.js';
import { BIOMES } from '../../../game/kesif/sim/constants.js';

describe('panelJournal', () => {
    it('sekmeler', () => {
        expect(JOURNAL_TABS.map((t) => t.name)).toEqual(['Görevler', 'Başarımlar', 'Keşifler', 'İstatistik', 'Yetenekler']);
    });
    it('pct sınırlar ve geçersizi 0 yapar', () => {
        expect(pct(1, 4)).toBe(25);
        expect(pct(9, 4)).toBe(100);
        expect(pct(-3, 4)).toBe(0);
        expect(pct(1, 0)).toBe(0);
        expect(pct('x', 4)).toBe(0);
    });
    it('questState durum adlarını ve hedefe ulaşmayı çözer', () => {
        expect(questState({ state: 'tamamlandı' })).toEqual({ key: 'done', label: 'Tamamlandı' });
        expect(questState({ state: 'done' }).key).toBe('done');
        expect(questState({ state: 'locked' }).key).toBe('locked');
        expect(questState({ state: 'aktif', progress: 1, goal: 3 }).key).toBe('active');
        expect(questState({ state: 'aktif', progress: 3, goal: 3 }).key).toBe('done');
        expect(questState(null).key).toBe('active');
    });
    it('formatDuration / formatMs', () => {
        expect(formatDuration(45)).toBe('45 sn');
        expect(formatDuration(125)).toBe('2 dk 5 sn');
        expect(formatDuration(3725)).toBe('1 sa 2 dk');
        expect(formatDuration(-1)).toBe('0 sn');
        expect(formatMs(12340)).toBe('12,34 sn');
        expect(formatMs(65300)).toBe('1:05,30');
        expect(formatMs(NaN)).toBe('0,00 sn');
    });
    it('statRows bilinen alanları Türkçe etiketler, parkur rekorlarını sıralar', () => {
        const rows = statRows({ blocksBroken: 1234, mobsKilled: 7, distance: 2500, playTime: 3700, deaths: 2, parkourBest: { b: 20000, a: 15000 }, bilinmeyen: 5 });
        const by = Object.fromEntries(rows.map((r) => [r.key, r.value]));
        expect(by.blocksBroken).toBe((1234).toLocaleString('tr-TR'));
        expect(by.mobsKilled).toBe('7');
        expect(by.distance).toBe('2,5 km');
        expect(by.playTime).toBe('1 sa 1 dk');
        expect(by['parkour:a']).toBe('15,00 sn');
        expect(by.bilinmeyen).toBeUndefined();
        expect(rows.find((r) => r.key === 'blocksBroken').label).toBe('Kırılan blok');
        expect(statRows(null)).toEqual([]);
    });
    it('discoveryRows biyom toplamını bilir', () => {
        const rows = discoveryRows({ biomes: 3, structures: 12 });
        expect(rows[0]).toMatchObject({ key: 'biomes', value: 3, max: BIOMES.length });
        expect(rows[1]).toMatchObject({ key: 'structures', value: 12, max: 0 });
        expect(discoveryRows({ biomes: 999 })[0].value).toBe(BIOMES.length);
        expect(discoveryRows(null)[1].value).toBe(0);
    });
    it('abilityRows dört yeteneği her zaman verir, kaynağı bölgeden bulur', () => {
        const rows = abilityRows({ doubleJump: true });
        expect(rows.map((r) => r.key)).toEqual(Object.keys(ABILITY_INFO));
        expect(rows[0].unlocked).toBe(true);
        expect(rows[1].unlocked).toBe(false);
        expect(abilitySource('doubleJump')).toContain('Kök Ana');
        expect(abilitySource('portalGun')).toContain('Gölge Hükümdar');
        expect(abilitySource('yok')).toBe('');
        expect(abilityRows(null).every((r) => !r.unlocked)).toBe(true);
    });
});
