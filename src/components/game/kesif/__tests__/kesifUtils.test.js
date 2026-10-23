import { describe, expect, it } from 'vitest';
import { MAP_BASES } from '../../../../game/kesif/sim/mapFormat.js';
import { parseWorldCode } from '../../../../game/kesif/sim/rng.js';
import {
    BASES,
    REPORT_REASON_KEYS,
    buildEntry,
    classifyKesifError,
    cleanWorldCode,
    coverPalette,
    entryForSave,
    formatCount,
    formatPlayTime,
    generateWorldCode,
    kesifErrorText,
    mapState,
    mergeSaves,
    normalizeMap,
    normalizeSave,
    parseLobbyMode,
    prettyWorldCode,
    readEntry,
    relativeTime,
    safeCover,
    slotLabel,
    slotPercent,
    slotSpeech,
} from '../kesifUtils';

const httpErr = (status, data, message) => ({ response: { status, data: { message, data } } });

describe('sabitler sim ile uyumlu', () => {
    it('BASES = mapFormat MAP_BASES (aynı sıra)', () => {
        expect(BASES.map((b) => b.key)).toEqual([...MAP_BASES]);
    });
    it('rapor nedenleri sunucu listesiyle aynı', () => {
        expect(REPORT_REASON_KEYS).toEqual(['uygunsuz', 'siddet', 'nefret', 'spam', 'kisisel_bilgi', 'diger']);
    });
});

describe('Dünya Kodu', () => {
    it('8 hane BÜYÜK base36 ve belirlenimci (rnd enjekte)', () => {
        let n = 0;
        const rnd = () => ((n += 7) % 36) / 36;
        const a = generateWorldCode(rnd);
        n = 0;
        expect(generateWorldCode(rnd)).toBe(a);
        expect(a).toMatch(/^[0-9A-Z]{8}$/);
    });
    it('rastgele kod geçerli ve sim tohumuna çevrilebilir', () => {
        const c = generateWorldCode();
        expect(cleanWorldCode(c)).toBe(c);
        expect(parseWorldCode(c)).not.toBeNull();
    });
    it('cleanWorldCode boşluk/tire/küçük harfi temizler, geçersizde null', () => {
        expect(cleanWorldCode('abcd-1234')).toBe('ABCD1234');
        expect(cleanWorldCode(' ab cd 12 34 ')).toBe('ABCD1234');
        expect(cleanWorldCode('kısa')).toBeNull();
        expect(cleanWorldCode(null)).toBeNull();
        expect(cleanWorldCode('ABCD12345')).toBeNull();
    });
    it('prettyWorldCode dörderli', () => {
        expect(prettyWorldCode('abcd1234')).toBe('ABCD 1234');
        expect(prettyWorldCode('x')).toBe('x');
    });
});

describe('buildEntry / readEntry', () => {
    it('macera: seed ya da saveId gerekir', () => {
        expect(buildEntry({ mode: 'macera', seed: 'ABCD1234' })).toEqual({ mode: 'macera', seed: 'ABCD1234', mapId: null, saveId: null, base: null });
        expect(buildEntry({ mode: 'macera', saveId: 'cloud' })).toEqual({ mode: 'macera', seed: null, mapId: null, saveId: 'cloud', base: null });
        expect(buildEntry({ mode: 'macera' })).toBeNull();
        expect(buildEntry({ mode: 'macera', seed: '   ' })).toBeNull();
    });
    it('macera mapId ve base taşımaz', () => {
        const e = buildEntry({ mode: 'macera', seed: 'ABCD1234', mapId: 'abc', base: 'ada' });
        expect(e.mapId).toBeNull();
        expect(e.base).toBeNull();
    });
    it('harita: mapId zorunlu, seed/saveId atılır', () => {
        expect(buildEntry({ mode: 'harita' })).toBeNull();
        expect(buildEntry({ mode: 'harita', mapId: '3f1b2c4d-0000-4000-8000-123456789abc', seed: 'X', saveId: 'y' })).toEqual({
            mode: 'harita',
            seed: null,
            mapId: '3f1b2c4d-0000-4000-8000-123456789abc',
            saveId: null,
            base: null,
        });
    });
    it('insa: hepsi isteğe bağlı; base yalnızca haritasızken ve geçerliyse', () => {
        expect(buildEntry({ mode: 'insa' })).toEqual({ mode: 'insa', seed: null, mapId: null, saveId: null, base: null });
        expect(buildEntry({ mode: 'insa', base: 'ada' }).base).toBe('ada');
        expect(buildEntry({ mode: 'insa', base: 'lav' }).base).toBeNull();
        const edit = buildEntry({ mode: 'insa', mapId: 'abc-123', base: 'ada' });
        expect(edit.mapId).toBe('abc-123');
        expect(edit.base).toBeNull();
    });
    it('geçersiz mod / kimlik reddedilir; sayısal seed metne çevrilir', () => {
        expect(buildEntry({ mode: 'savas' })).toBeNull();
        expect(buildEntry()).toBeNull();
        expect(buildEntry({ mode: 'harita', mapId: '../etc/passwd' })).toBeNull();
        expect(buildEntry({ mode: 'macera', seed: 12345 }).seed).toBe('12345');
        expect(buildEntry({ mode: 'macera', seed: NaN })).toBeNull();
        expect(buildEntry({ mode: 'macera', seed: 'x'.repeat(41) })).toBeNull();
    });
    it('readEntry: { entry } ve düz biçim; consumed ve çöp null', () => {
        const entry = { mode: 'macera', seed: 'ABCD1234' };
        expect(readEntry({ entry })).toEqual(buildEntry(entry));
        expect(readEntry(entry)).toEqual(buildEntry(entry));
        expect(readEntry({ entry, consumed: true })).toBeNull();
        expect(readEntry({ entry: { ...entry, consumed: true } })).toBeNull();
        expect(readEntry(null)).toBeNull();
        expect(readEntry('x')).toBeNull();
        expect(readEntry({ entry: { mode: 'harita' } })).toBeNull();
    });
    it('buildEntry çıktısı readEntry ile aynen geri okunur (gidiş-dönüş)', () => {
        const e = buildEntry({ mode: 'insa', seed: 'ABCD1234', base: 'çayır' });
        expect(readEntry({ entry: e })).toEqual(e);
    });
    it('entryForSave', () => {
        expect(entryForSave({ id: 's1', seed: 'ABCD1234' })).toEqual({ mode: 'macera', seed: 'ABCD1234', mapId: null, saveId: 's1', base: null });
        expect(entryForSave(null)).toBeNull();
    });
});

describe('sayı / zaman biçimleri', () => {
    it('formatCount', () => {
        expect(formatCount(0)).toBe('0');
        expect(formatCount(999)).toBe('999');
        expect(formatCount(1250)).toBe('1,3 B');
        expect(formatCount(15400)).toBe('15 B');
        expect(formatCount(2500000)).toBe('2,5 Mn');
        expect(formatCount(-4)).toBe('0');
        expect(formatCount('x')).toBe('0');
    });
    it('slot yardımcıları', () => {
        expect(slotLabel(3, 5)).toBe('3/5');
        expect(slotLabel(-1, undefined)).toBe('0/0');
        expect(slotPercent(3, 5)).toBe(60);
        expect(slotPercent(9, 5)).toBe(100);
        expect(slotPercent(1, 0)).toBe(0);
        expect(slotSpeech(3, 5)).toBe('5 haktan 3 tanesi dolu, 2 boş hak');
        expect(slotSpeech(0, 0)).toBe('Henüz harita hakkın yok');
    });
    it('formatPlayTime', () => {
        expect(formatPlayTime(20)).toBe("1 dk'dan az");
        expect(formatPlayTime(12 * 60)).toBe('12 dk');
        expect(formatPlayTime(2 * 3600 + 5 * 60)).toBe('2 sa 5 dk');
        expect(formatPlayTime(3600)).toBe('1 sa');
    });
    it('relativeTime', () => {
        const now = Date.parse('2026-10-16T12:00:00Z');
        expect(relativeTime('2026-10-16T11:59:40Z', now)).toBe('az önce');
        expect(relativeTime('2026-10-16T11:55:00Z', now)).toBe('5 dk önce');
        expect(relativeTime('2026-10-16T09:00:00Z', now)).toBe('3 sa önce');
        expect(relativeTime('2026-10-13T12:00:00Z', now)).toBe('3 gün önce');
        expect(relativeTime(null, now)).toBe('');
        expect(relativeTime('çöp', now)).toBe('');
        expect(relativeTime('2026-01-02T00:00:00Z', now)).toMatch(/2026/);
    });
});

describe('harita nesneleri', () => {
    const raw = {
        id: 'm1',
        title: 'Güzel Vadi',
        description: 'açıklama',
        author: { id: 'u1', username: 'ayse', avatar: null, gender: 'female' },
        likes: 12,
        plays: 140,
        cover: 'data:image/jpeg;base64,/9j/4AAQ',
        published_at: '2026-10-10T10:00:00Z',
        liked_by_me: true,
        mine: false,
    };
    it('normalizeMap güvenli biçim üretir', () => {
        const m = normalizeMap(raw);
        expect(m).toMatchObject({ id: 'm1', title: 'Güzel Vadi', likes: 12, plays: 140, liked: true, mine: false, visibility: null, status: null });
        expect(m.author.username).toBe('ayse');
        expect(m.cover).toBe(raw.cover);
    });
    it('normalizeMap kimliksizi atar, eksik alanları doldurur', () => {
        expect(normalizeMap(null)).toBeNull();
        expect(normalizeMap({ title: 'x' })).toBeNull();
        const m = normalizeMap({ id: 'z', likes: -5, plays: 'abc' });
        expect(m.title).toBe('Adsız harita');
        expect(m.likes).toBe(0);
        expect(m.plays).toBe(0);
        expect(m.author.username).toBe('oyuncu');
    });
    it('safeCover yalnızca küçük görsel data-URL kabul eder', () => {
        expect(safeCover('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
        expect(safeCover('javascript:alert(1)')).toBeNull();
        expect(safeCover('https://evil.example/x.png')).toBeNull();
        expect(safeCover('data:image/svg+xml;base64,AAAA')).toBeNull();
        expect(safeCover(`data:image/jpeg;base64,${'A'.repeat(70000)}`)).toBeNull();
        expect(safeCover(null)).toBeNull();
    });
    it('mapState: eylem yetkileri', () => {
        expect(mapState({ visibility: 'private', status: 'ok' })).toMatchObject({ key: 'private', canPublish: true, canUnpublish: false, canEdit: true });
        expect(mapState({ visibility: 'public', status: 'ok' })).toMatchObject({ key: 'public', canPublish: false, canUnpublish: true });
        expect(mapState({ visibility: 'public', status: 'hidden' })).toMatchObject({ key: 'hidden', canPublish: false, canUnpublish: false, canEdit: true });
        expect(mapState({ visibility: 'public', status: 'removed' })).toMatchObject({ key: 'removed', canPublish: false, canEdit: false });
    });
    it('coverPalette belirlenimci', () => {
        expect(coverPalette('abc')).toEqual(coverPalette('abc'));
        expect(coverPalette('abc')).not.toEqual(coverPalette('abd'));
    });
});

describe('kayıt özetleri', () => {
    it('normalizeSave: yerel ve bulut', () => {
        const l = normalizeSave({ id: 'slot-1', name: 'Dünyam', worldCode: 'abcd1234', playTime: 125, zone: { name: 'Fısıldayan Ormanlar' }, updatedAt: 5 });
        expect(l).toMatchObject({ id: 'slot-1', name: 'Dünyam', worldCode: 'ABCD1234', seed: 'abcd1234', playTime: 125, zone: 'Fısıldayan Ormanlar', source: 'local' });
        const c = normalizeSave({ name: '', seed: 'ABCD1234', saved_at: '2026-10-16T10:00:00Z' }, 'cloud');
        expect(c).toMatchObject({ id: 'cloud', name: 'Bulut kaydı', source: 'cloud', seed: 'ABCD1234' });
        expect(normalizeSave({ name: 'kimliksiz' })).toBeNull();
        expect(normalizeSave(null)).toBeNull();
    });
    it('mergeSaves en yeniden eskiye sıralar, geçersizi atar', () => {
        const list = mergeSaves(
            [
                { id: 'a', updatedAt: 100 },
                { id: 'b', updatedAt: 300 },
                { nope: true },
            ],
            { name: 'bulut', updatedAt: '1970-01-01T00:00:00.200Z' }
        );
        expect(list.map((s) => s.id)).toEqual(['b', 'cloud', 'a']);
    });
});

describe('hata sınıflandırma ve metinleri', () => {
    it('durum + reason -> tür', () => {
        expect(classifyKesifError({}).kind).toBe('network');
        expect(classifyKesifError(httpErr(401)).kind).toBe('unauth');
        expect(classifyKesifError(httpErr(403)).kind).toBe('forbidden');
        expect(classifyKesifError(httpErr(404)).kind).toBe('notfound');
        expect(classifyKesifError(httpErr(409)).kind).toBe('conflict');
        expect(classifyKesifError(httpErr(429)).kind).toBe('throttle');
        expect(classifyKesifError(httpErr(503)).kind).toBe('server');
        expect(classifyKesifError(httpErr(422, { reason: 'insufficient', balance: 5 })).kind).toBe('insufficient');
        expect(classifyKesifError(httpErr(422, { reason: 'no_slot' })).kind).toBe('no_slot');
        expect(classifyKesifError(httpErr(422, { reason: 'slot_cap' })).kind).toBe('slot_cap');
        expect(classifyKesifError(httpErr(422, { reason: 'text_blocked', field: 'title' })).kind).toBe('text_blocked');
        expect(classifyKesifError(httpErr(422, { reason: 'invalid_map' })).kind).toBe('invalid_map');
        expect(classifyKesifError(httpErr(422)).kind).toBe('validation');
        expect(classifyKesifError(httpErr(418)).kind).toBe('other');
    });
    it('metinler Türkçe ve türe uygun', () => {
        expect(kesifErrorText({})).toMatch(/Sunucuya ulaşılamadı/);
        expect(kesifErrorText(httpErr(422, { reason: 'no_slot' }))).toMatch(/Boş harita hakkın kalmadı/);
        expect(kesifErrorText(httpErr(422, { reason: 'text_blocked', field: 'description' }))).toMatch(/Açıklamada/);
        expect(kesifErrorText(httpErr(422, { reason: 'text_blocked', field: 'title' }))).toMatch(/Başlıkta/);
        expect(kesifErrorText(httpErr(404))).toMatch(/bulunamadı/);
        expect(kesifErrorText(httpErr(403, null, 'Bu harita sana ait değil.'))).toBe('Bu harita sana ait değil.');
        expect(kesifErrorText(httpErr(422, { reason: 'x' }, 'Başlık en az 2 karakter olmalı.'))).toBe('Başlık en az 2 karakter olmalı.');
        expect(kesifErrorText(httpErr(418), 'yedek')).toBe('yedek');
        expect(kesifErrorText(httpErr(429))).toMatch(/Çok hızlı/);
    });
});

describe('parseLobbyMode', () => {
    it('?mode= değerleri', () => {
        expect(parseLobbyMode('?mode=macera')).toBe('macera');
        expect(parseLobbyMode('?mode=insa')).toBe('insa');
        expect(parseLobbyMode('?mode=build')).toBe('insa');
        expect(parseLobbyMode('?mode=topluluk')).toBe('topluluk');
        expect(parseLobbyMode('?mode=slots')).toBe('slots');
        expect(parseLobbyMode('?mode=haritalarim')).toBe('haritalarim');
        expect(parseLobbyMode('?mode=bilinmeyen')).toBeNull();
        expect(parseLobbyMode('')).toBeNull();
        expect(parseLobbyMode(undefined)).toBeNull();
    });
});
