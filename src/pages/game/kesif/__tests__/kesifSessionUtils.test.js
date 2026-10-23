import { describe, expect, it, vi } from 'vitest';
import {
    baseSlotFor,
    classifyEngineError,
    createCloudSaver,
    createRewardClaimer,
    createVersionStore,
    deathInfoFrom,
    mapDataFromResponse,
    normalizeProgress,
    pickFreeSlot,
    pickStats,
    pickTip,
    readLocalSave,
    saveFailText,
    victoryStatsFrom,
    zoneIndexOf,
    LOADING_TIPS,
    KEY_TIPS,
    TOUCH_TIPS,
    tipsFor,
} from '../kesifSessionUtils';
import { prepareStart } from '../kesifSessionStart';
import * as storage from '../../../../game/kesif/sim/saveStorage.js';
import { SAVE, MAP, httpErr } from './fakeKesifEngine';

const timers = () => {
    const q = [];
    return {
        setTimer: (fn, ms) => {
            q.push({ fn, ms });
            return q.length;
        },
        clearTimer: (id) => {
            if (q[id - 1]) q[id - 1].fn = null;
        },
        fire: () => {
            const t = q.find((x) => x.fn);
            if (t) {
                const f = t.fn;
                t.fn = null;
                f();
            }
            return Boolean(t);
        },
        pending: () => q.filter((x) => x.fn).length,
        q,
    };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('kayıt yuvası', () => {
    it('yeni macera: dünya kodu -> m-kod; kayıt kimliği korunur; serbest metin tohumdan', () => {
        expect(baseSlotFor({ mode: 'macera', seed: 'ABCD-1234' })).toBe('m-abcd1234');
        expect(baseSlotFor({ mode: 'macera', saveId: 'm-zzz' })).toBe('m-zzz');
        expect(baseSlotFor({ mode: 'macera', saveId: 'cloud' }, { seed: 4242 })).toMatch(/^m-[0-9a-z]+$/);
        expect(baseSlotFor({ mode: 'macera', seed: 'benim dünyam' })).toMatch(/^m-[0-9a-z]+$/);
        expect(baseSlotFor({ mode: 'macera', seed: 'benim dünyam' })).toBe(baseSlotFor({ mode: 'macera', seed: 'benim dünyam' }));
    });

    it('pickFreeSlot: dolu yuvanın üzerine yazmaz', async () => {
        const adapter = storage.createMemoryAdapter();
        expect(await pickFreeSlot(storage, adapter, 'm-abcd1234')).toBe('m-abcd1234');
        await storage.saveToSlot(adapter, 'm-abcd1234', SAVE);
        expect(await pickFreeSlot(storage, adapter, 'm-abcd1234')).toBe('m-abcd1234-2');
        await storage.saveToSlot(adapter, 'm-abcd1234-2', SAVE);
        expect(await pickFreeSlot(storage, adapter, 'm-abcd1234')).toBe('m-abcd1234-3');
    });

    it('readLocalSave: ham kayıt nesnesini döner; olmayan/bozuk kayıt Türkçe hata', async () => {
        const adapter = storage.createMemoryAdapter();
        await storage.saveToSlot(adapter, 'm-x', SAVE);
        const ok = await readLocalSave(storage, adapter, 'm-x');
        expect(ok.ok).toBe(true);
        expect(ok.save).toEqual(SAVE);
        const miss = await readLocalSave(storage, adapter, 'm-yok');
        expect(miss).toMatchObject({ ok: false, code: 'missing' });
        expect(miss.text).toMatch(/bulunamadı/);
        await adapter.set(storage.SAVE_KEY_PREFIX + 'bozuk', '{"v":1');
        expect((await readLocalSave(storage, adapter, 'bozuk')).text).toMatch(/bozuk/);
    });

    it('saveFailText', () => {
        expect(saveFailText('full')).toMatch(/dolu/);
        expect(saveFailText('quota')).toMatch(/yer kalmadı/);
        expect(saveFailText('x')).toMatch(/kaydedilemedi/);
    });

    it('mapDataFromResponse: nesne ya da JSON metni', () => {
        expect(mapDataFromResponse({ map: { data: MAP } })).toEqual(MAP);
        expect(mapDataFromResponse({ map: { data: JSON.stringify(MAP) } })).toEqual(MAP);
        expect(mapDataFromResponse({ map: { data: '{bozuk' } })).toBeNull();
        expect(mapDataFromResponse(null)).toBeNull();
    });
});

describe('prepareStart', () => {
    const base = { member: true, api: null, loadStorage: async () => storage };

    it('macera: yeni dünya tohumu ve boş yuva; kayıtla devam kayıt ve yuvayı verir', async () => {
        const fresh = await prepareStart({ ...base, entry: { mode: 'macera', seed: 'ABCD1234', saveId: null, mapId: null, base: null } });
        expect(fresh).toMatchObject({ ok: true, seed: 'ABCD1234', save: null });
        expect(fresh.slot).toBe('m-abcd1234');

        // Yerel yuva IndexedDB/localStorage yerine bellek adaptörüyle: modül adaptörü enjekte edilir.
        const mem = storage.createMemoryAdapter();
        await storage.saveToSlot(mem, 'm-eski', SAVE);
        const mod = { ...storage, createBestAdapter: () => mem };
        const cont = await prepareStart({ ...base, loadStorage: async () => mod, entry: { mode: 'macera', seed: null, saveId: 'm-eski', mapId: null, base: null } });
        expect(cont.ok).toBe(true);
        expect(cont.save).toEqual(SAVE);
        expect(cont.seed).toBe(4242);
        expect(cont.slot).toBe('m-eski');

        const missing = await prepareStart({ ...base, loadStorage: async () => mod, entry: { mode: 'macera', seed: null, saveId: 'm-yok', mapId: null, base: null } });
        expect(missing).toMatchObject({ ok: false, retry: false });
    });

    it('bulut kaydı: misafir giriş ister; üye getSave ile okur', async () => {
        const entry = { mode: 'macera', seed: null, saveId: 'cloud', mapId: null, base: null };
        const guest = await prepareStart({ ...base, member: false, entry });
        expect(guest).toMatchObject({ ok: false, login: true });
        const api = { getSave: vi.fn(() => Promise.resolve({ save: SAVE, saved_at: 'x', bytes: 10 })) };
        const ok = await prepareStart({ ...base, api, entry });
        expect(ok.save).toEqual(SAVE);
        const bad = await prepareStart({ ...base, api: { getSave: () => Promise.reject(httpErr(401)) }, entry });
        expect(bad).toMatchObject({ ok: false, login: true, retry: true });
        const empty = await prepareStart({ ...base, api: { getSave: () => Promise.resolve({ save: null }) }, entry });
        expect(empty.ok).toBe(false);
    });

    it('harita: veri çekilir ve önbelleğe alınır; hata yeniden denenebilir; inşa düzenlemesi mapMeta verir', async () => {
        const api = { map: vi.fn(() => Promise.resolve({ map: { id: 'm1', title: 'Evim', description: 'd', mine: true, data: MAP } })) };
        const play = await prepareStart({ ...base, api, entry: { mode: 'harita', mapId: 'm1', seed: null, saveId: null, base: null } });
        expect(play).toMatchObject({ ok: true, mapData: MAP, mapMeta: null });
        const edit = await prepareStart({ ...base, api, entry: { mode: 'insa', mapId: 'm1', seed: 'ABCD1234', saveId: null, base: null } });
        expect(edit.mapMeta).toEqual({ id: 'm1', title: 'Evim', description: 'd' });
        // önbellek: ikinci çağrı ağa gitmez
        api.map.mockClear();
        const cached = await prepareStart({ ...base, api, mapCache: edit.mapCache, entry: { mode: 'insa', mapId: 'm1', seed: 'ABCD1234', saveId: null, base: null } });
        expect(cached.mapData).toEqual(MAP);
        expect(api.map).not.toHaveBeenCalled();

        const nf = await prepareStart({ ...base, api: { map: () => Promise.reject(httpErr(404)) }, entry: { mode: 'harita', mapId: 'm9', seed: null, saveId: null, base: null } });
        expect(nf).toMatchObject({ ok: false, retry: true });
        expect(nf.text).toMatch(/bulunamadı/);
        const corrupt = await prepareStart({ ...base, api: { map: () => Promise.resolve({ map: { id: 'm1', data: null } }) }, entry: { mode: 'harita', mapId: 'm1', seed: null, saveId: null, base: null } });
        expect(corrupt.ok).toBe(false);
    });

    it('başkasının haritası inşada düzenlenmez (kopya olur)', async () => {
        const api = { map: () => Promise.resolve({ map: { id: 'm2', title: 'Başkası', mine: false, data: MAP } }) };
        const r = await prepareStart({ ...base, api, entry: { mode: 'insa', mapId: 'm2', seed: null, saveId: null, base: null } });
        expect(r.mapMeta).toBeNull();
    });
});

describe('createCloudSaver', () => {
    const make = (api, extra = {}) => {
        let t = 1000;
        const tm = timers();
        const states = [];
        const saver = createCloudSaver({ getApi: () => api, now: () => t, onState: (s) => states.push(s), setTimer: tm.setTimer, clearTimer: tm.clearTimer, ...extra });
        return { saver, tm, states, advance: (ms) => (t += ms) };
    };

    it('otomatik kayıtlar 30 sn aralıkla gider; elle kayıt beklemez', async () => {
        const api = { putSave: vi.fn(() => Promise.resolve({})) };
        const { saver, tm, advance, states } = make(api);
        expect(await saver.push(SAVE, 'auto')).toBe(true);
        expect(api.putSave).toHaveBeenCalledTimes(1);
        expect(states).toEqual(['saving', 'saved']);
        // 5 sn sonra: zamanlanır, gitmez
        advance(5000);
        expect(await saver.push({ ...SAVE, playTime: 100 }, 'auto')).toBe(false);
        expect(api.putSave).toHaveBeenCalledTimes(1);
        expect(tm.pending()).toBe(1);
        // zamanlayıcı dolunca en son kayıt gider
        advance(26000);
        tm.fire();
        await flush();
        expect(api.putSave).toHaveBeenCalledTimes(2);
        expect(api.putSave.mock.calls[1][0].playTime).toBe(100);
        // elle kayıt aralığı beklemez
        advance(1000);
        expect(await saver.push({ ...SAVE, playTime: 200 }, 'manual')).toBe(true);
        expect(api.putSave).toHaveBeenCalledTimes(3);
    });

    it('ağ hatasında sessiz: son kayıt tutulur ve bir dakika sonra yeniden denenir', async () => {
        const api = { putSave: vi.fn().mockRejectedValueOnce(httpErr(503)).mockResolvedValue({}) };
        const { saver, tm, states } = make(api);
        expect(await saver.push(SAVE, 'manual')).toBe(false);
        expect(states[states.length - 1]).toBe('error');
        expect(tm.q[tm.q.length - 1].ms).toBe(60000);
        tm.fire();
        await flush();
        expect(api.putSave).toHaveBeenCalledTimes(2);
        expect(saver.state()).toBe('saved');
        expect(saver.hasPending()).toBe(false);
    });

    it('401 bulut yazmayı kapatır (tekrar denemez)', async () => {
        const api = { putSave: vi.fn(() => Promise.reject(httpErr(401))) };
        const { saver, states } = make(api);
        await saver.push(SAVE, 'manual');
        expect(saver.state()).toBe('off');
        await saver.push(SAVE, 'manual');
        expect(api.putSave).toHaveBeenCalledTimes(1);
        expect(states).toContain('off');
    });

    it('çok büyük kayıt kırpılarak (en uzak düzenlemeler atılır) gönderilir', async () => {
        const api = { putSave: vi.fn(() => Promise.resolve({})) };
        const { saver } = make(api);
        const big = { ...SAVE, edits: { '0,0': 'x'.repeat(1600000) } };
        expect(await saver.push(big, 'manual')).toBe(true);
        const sent = api.putSave.mock.calls[0][0];
        expect(sent.truncated).toBe(true);
        expect(JSON.stringify(sent).length).toBeLessThan(1500000);
    });

    it('flush: bekleyen kaydı hemen gönderir, asılı istekte süre aşımıyla döner', async () => {
        const api = { putSave: vi.fn(() => new Promise(() => {})) };
        const { saver, advance } = make(api);
        saver.push(SAVE, 'manual');
        advance(1);
        const t0 = Date.now();
        expect(await saver.flush(30)).toBe(false);
        expect(Date.now() - t0).toBeLessThan(500);
    });
});

describe('createRewardClaimer', () => {
    const setup = (api, over = {}) => {
        const tm = timers();
        const marked = [];
        const granted = [];
        const c = createRewardClaimer({
            getApi: () => api,
            isMember: () => true,
            getSeed: () => 'ABCD1234',
            markClaimed: (k) => marked.push(k),
            onGranted: (k, r) => granted.push([k, r]),
            onCapped: vi.fn(),
            onGuest: vi.fn(),
            onStopped: vi.fn(),
            setTimer: tm.setTimer,
            ...over,
        });
        return { c, tm, marked, granted };
    };

    it('başarı: talep + motora bildir + tutar', async () => {
        const api = { claim: vi.fn(() => Promise.resolve({ claimed: true, key: 'zone:1:boss', amount: 150, granted: 150, capped: false })) };
        const { c, marked, granted } = setup(api);
        expect(c.claim('zone:1:boss')).toBe(true);
        expect(c.claim('zone:1:boss')).toBe(false); // uçuşta tekrar yok
        await flush();
        expect(api.claim).toHaveBeenCalledWith('zone:1:boss', 'ABCD1234');
        expect(marked).toEqual(['zone:1:boss']);
        expect(granted[0][1].granted).toBe(150);
    });

    it('409 already_claimed de motora bildirilir (tekrar gelmesin)', async () => {
        const api = { claim: vi.fn(() => Promise.reject(httpErr(409, { reason: 'already_claimed', key: 'k' }))) };
        const { c, marked, granted } = setup(api);
        c.claim('k');
        await flush();
        expect(marked).toEqual(['k']);
        expect(granted).toEqual([]);
    });

    it('günlük tavan dolu (claimed:false): bildirilmez, onCapped çağrılır', async () => {
        const api = { claim: vi.fn(() => Promise.resolve({ claimed: false, key: 'k', amount: 80, granted: 0, capped: true })) };
        const onCapped = vi.fn();
        const { c, marked } = setup(api, { onCapped });
        c.claim('k');
        await flush();
        expect(marked).toEqual([]);
        expect(onCapped).toHaveBeenCalled();
        // talep tüketilmediği için aynı anahtar sonra yeniden talep edilebilir
        expect(c.claim('k')).toBe(true);
    });

    it('ağ hatası geri çekilmeli yeniden deneme; 3 denemeden sonra vazgeçer', async () => {
        const api = { claim: vi.fn(() => Promise.reject(httpErr(503))) };
        const { c, tm, marked } = setup(api);
        c.claim('k');
        await flush();
        expect(api.claim).toHaveBeenCalledTimes(1);
        expect(tm.q.map((x) => x.ms)).toEqual([2000]);
        tm.fire();
        await flush();
        tm.fire();
        await flush();
        tm.fire();
        await flush();
        expect(api.claim).toHaveBeenCalledTimes(4);
        expect(tm.pending()).toBe(0);
        expect(marked).toEqual([]);
        expect(c.claim('k')).toBe(true); // vazgeçilen anahtar sonra yine talep edilebilir
    });

    it('geçici hata sonrası başarı', async () => {
        const api = { claim: vi.fn().mockRejectedValueOnce(new Error('Network Error')).mockResolvedValue({ claimed: true, granted: 40, amount: 40 }) };
        const { c, tm, marked } = setup(api);
        c.claim('k');
        await flush();
        tm.fire();
        await flush();
        expect(marked).toEqual(['k']);
    });

    it('misafir talep etmez, tek kez bilgilendirir; 401 durdurur; dispose zamanlayıcıları keser', async () => {
        const api = { claim: vi.fn() };
        const onGuest = vi.fn();
        const g = setup(api, { isMember: () => false, onGuest });
        expect(g.c.claim('a')).toBe(false);
        expect(g.c.claim('b')).toBe(false);
        expect(onGuest).toHaveBeenCalledTimes(1);
        expect(api.claim).not.toHaveBeenCalled();

        const onStopped = vi.fn();
        const u = setup({ claim: vi.fn(() => Promise.reject(httpErr(401))) }, { onStopped });
        u.c.claim('a');
        await flush();
        expect(onStopped).toHaveBeenCalledWith('unauth');
        expect(u.c.claim('b')).toBe(true); // durdu: sessizce yutulur
        await flush();

        const d = setup({ claim: vi.fn(() => Promise.reject(httpErr(503))) });
        d.c.claim('k');
        await flush();
        d.c.dispose();
        d.tm.fire();
        await flush();
    });
});

describe('küçük yardımcılar', () => {
    it('versiyon deposu: bump abonelere haber verir', () => {
        const s = createVersionStore();
        const l = vi.fn();
        const off = s.subscribe(l);
        s.bump();
        s.bump();
        expect(s.get()).toBe(2);
        expect(l).toHaveBeenCalledTimes(2);
        off();
        s.bump();
        expect(l).toHaveBeenCalledTimes(2);
    });

    it('normalizeProgress: 0..1, 0..100, nesne, geçersiz', () => {
        expect(normalizeProgress(0.4)).toEqual({ value: 0.4, label: '' });
        expect(normalizeProgress(40)).toEqual({ value: 0.4, label: '' });
        expect(normalizeProgress({ progress: 0.5, label: 'Chunk üretiliyor' })).toEqual({ value: 0.5, label: 'Chunk üretiliyor' });
        expect(normalizeProgress({ value: 2 }).value).toBe(0.02);
        expect(normalizeProgress(undefined)).toEqual({ value: 0, label: '' });
        expect(normalizeProgress(NaN).value).toBe(0);
        expect(normalizeProgress(-1).value).toBe(0);
    });

    it('classifyEngineError', () => {
        expect(classifyEngineError({ code: 'context_lost' })).toBe('contextlost');
        expect(classifyEngineError(new Error('WebGL context lost'))).toBe('contextlost');
        expect(classifyEngineError({ code: 'webgl' })).toBe('webgl');
        expect(classifyEngineError(new Error('WebGL 2 desteklenmiyor'))).toBe('webgl');
        expect(classifyEngineError(new Error('boom'))).toBe('other');
        expect(classifyEngineError(null)).toBe('other');
    });

    it('pickStats: motor istatistiği ve olay sayaçlarından en büyüğü', () => {
        expect(pickStats({ puzzlesSolved: 3, zone: { id: 2 }, playTime: 90.7 }, { puzzles: 5, zone: 1, bosses: 1, victory: true })).toEqual({
            puzzles: 5,
            zone: 2,
            bosses: 1,
            playSeconds: 90,
            victory: true,
        });
        expect(pickStats(null, {})).toEqual({ puzzles: 0, zone: 0, bosses: 0, playSeconds: 0, victory: false });
    });

    it('victoryStatsFrom: olay + motor + sayaç; geçersizler atılır', () => {
        const v = victoryStatsFrom({ playTime: 600, deaths: 2, mobsKilled: 'x' }, { puzzlesSolved: 40, distance: 1234 }, { puzzles: 1, crystals: 4 });
        expect(v).toEqual({ playTime: 600, puzzlesSolved: 40, crystals: 4, deaths: 2, distance: 1234 });
    });

    it('deathInfoFrom / zoneIndexOf', () => {
        expect(deathInfoFrom({ cause: 'fall', lost: 3 })).toEqual({ reason: { cause: 'fall', by: undefined }, lostCount: 3 });
        expect(deathInfoFrom({ reason: 'Düştün', lostCount: 2 })).toEqual({ reason: 'Düştün', lostCount: 2 });
        expect(deathInfoFrom(null)).toEqual({ reason: null, lostCount: 0 });
        expect(zoneIndexOf({ zone: 2 })).toBe(2);
        expect(zoneIndexOf({ zone: { id: 3 } })).toBe(3);
        expect(zoneIndexOf({ index: 1 })).toBe(1);
        expect(zoneIndexOf({})).toBeNull();
    });

    it('ipuçları döner ve taşar', () => {
        expect(pickTip(0)).toBe(LOADING_TIPS[0]);
        expect(pickTip(LOADING_TIPS.length)).toBe(LOADING_TIPS[0]);
        expect(LOADING_TIPS.every((t) => typeof t === 'string' && t.length > 10)).toBe(true);
    });

    it('aygıta özel ipuçları: masaüstünde E/R tuşları doğru, dokunmatikte tuş adı geçmez', () => {
        expect(tipsFor(false)).toEqual(LOADING_TIPS.concat(KEY_TIPS));
        expect(tipsFor(true)).toEqual(LOADING_TIPS.concat(TOUCH_TIPS));
        expect(tipsFor(undefined)).toBe(LOADING_TIPS);
        const key = KEY_TIPS.join(' ');
        expect(key).toMatch(/Envanter için E/);
        expect(key).toMatch(/üretim menüsü için R/);
        TOUCH_TIPS.forEach((t) => expect(t).not.toMatch(/[ER] tuşu|tuşuna|tıkla/));
        LOADING_TIPS.forEach((t) => expect(t).not.toMatch(/dokun|tıkla/));
        expect(pickTip(LOADING_TIPS.length, false)).toBe(KEY_TIPS[0]);
        expect(pickTip(LOADING_TIPS.length, true)).toBe(TOUCH_TIPS[0]);
        expect(pickTip(tipsFor(false).length, false)).toBe(LOADING_TIPS[0]);
    });
});
