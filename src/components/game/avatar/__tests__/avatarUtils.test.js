import { describe, expect, it } from 'vitest';
import {
    CLOTH_COLOR_NAMES,
    HAIR_COLOR_NAMES,
    SKIN_NAMES,
    avatarSummary,
    indexItems,
    itemState,
    lockBadgeText,
    lockHint,
    lockedKeysOf,
    sameAvatar,
    slotOptions,
    styleOf,
    withColor,
    withStyle,
} from '../avatarUtils';
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, STYLES, defaultAvatar } from '../../../../game/avatar/catalog';

const ITEMS = [
    { key: 'hair:kisa', unlock: { type: 'free' }, owned: false, unlocked: true },
    { key: 'hair:mohawk', unlock: { type: 'price', jeton: 900 }, owned: false, unlocked: false },
    { key: 'acc:tac', unlock: { type: 'level', level: 10 }, owned: false, unlocked: false },
    { key: 'top:forma', unlock: { type: 'badge', badge: 'runner_5k' }, owned: false, unlocked: false },
    { key: 'top:hoodie', unlock: { type: 'free' }, owned: false, unlocked: true },
];

describe('avatarUtils', () => {
    it('renk adları paletlerle aynı uzunlukta', () => {
        expect(SKIN_NAMES).toHaveLength(SKIN_TONES.length);
        expect(HAIR_COLOR_NAMES).toHaveLength(HAIR_COLORS.length);
        expect(CLOTH_COLOR_NAMES).toHaveLength(CLOTH_COLORS.length);
    });

    it('stil / renk değiştirme saf (girdiyi bozmaz)', () => {
        const a = Object.freeze({ ...defaultAvatar(), hair: Object.freeze({ style: 'kisa', color: 0 }) });
        expect(withStyle(a, 'hair', 'mohawk').hair).toEqual({ style: 'mohawk', color: 0 });
        expect(withStyle(a, 'acc', 'tac').acc).toBe('tac');
        expect(withColor(a, 'hair', 6).hair).toEqual({ style: 'kisa', color: 6 });
        expect(withColor(a, 'skin', 4).skin).toBe(4);
        expect(styleOf(a, 'hair')).toBe('kisa');
        expect(styleOf(a, 'trail')).toBe('none');
    });

    it('kilit durumu ve metinleri', () => {
        const idx = indexItems(ITEMS);
        expect(lockBadgeText(itemState(idx.get('hair:mohawk')))).toBe('900');
        expect(lockHint(itemState(idx.get('hair:mohawk')))).toBe('900 jetonla açılır.');
        expect(lockBadgeText(itemState(idx.get('acc:tac')))).toBe('Sv. 10');
        expect(lockHint(itemState(idx.get('acc:tac')))).toBe('Oyun seviyesi 10 olunca açılır.');
        expect(lockBadgeText(itemState(idx.get('top:forma')))).toBe('Rozet');
        // Sunucu listesinde olmayan öğe kilitli sayılır.
        expect(itemState(undefined)).toMatchObject({ unlocked: false, kind: 'unknown' });
        expect(indexItems(null).size).toBe(0);
    });

    it('kilitli kullanılan öğeleri bulur', () => {
        const idx = indexItems(ITEMS);
        const a = { ...defaultAvatar(), hair: { style: 'mohawk', color: 0 }, acc: 'tac' };
        // jean/spor/none öğeleri bu listede yok -> kilitli sayılır; mohawk ve taç kesin.
        expect(lockedKeysOf(a, idx)).toEqual(expect.arrayContaining(['hair:mohawk', 'acc:tac']));
        expect(lockedKeysOf(a, idx)).not.toContain('top:hoodie');
    });

    it('karşılaştırma ve özet', () => {
        expect(sameAvatar(defaultAvatar('female'), { ...defaultAvatar('female') })).toBe(true);
        expect(sameAvatar(defaultAvatar('female'), defaultAvatar('male'))).toBe(false);
        expect(avatarSummary(defaultAvatar('female')).map((r) => r.value)).toEqual(['At Kuyruğu', 'Kapüşonlu']);
        expect(avatarSummary({ ...defaultAvatar(), acc: 'tac', trail: 'kalp' }).map((r) => r.label)).toEqual(['Saç', 'Üst', 'Aksesuar', 'Koşu İzi']);
    });

    it('sekme seçenekleri katalog sırasında', () => {
        const opts = slotOptions('hair', indexItems(ITEMS));
        expect(opts.map((o) => o.id)).toEqual(STYLES.hair.map((s) => s.id));
        expect(opts.find((o) => o.id === 'mohawk')).toMatchObject({ key: 'hair:mohawk', state: { kind: 'price', price: 900, unlocked: false } });
    });
});
