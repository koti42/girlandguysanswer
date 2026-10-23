import { describe, expect, it, vi } from 'vitest';
import { createRewardClaimer, DEFER_MAX_MS, DEFER_MIN_MS, DEFER_PREREQ_MS } from '../kesifSessionUtils';
import { createPlayTracker, PING_EVERY_MS, PING_FIRST_MS } from '../kesifPlayTracker';
import { httpErr } from './fakeKesifEngine';

/*
 * Sunucu ödül kapıları (oturum / süre / sıra / saatlik tavan) için istemci akışları:
 *  - no_session: play/start sonra bir kez yeniden dene;
 *  - too_early / prerequisite / hourly_cap: ödül TÜKETİLMEZ (motora "alındı" denmez), ertelenir, ping'te yeniden denenir;
 *  - oturum izleyicisi: bir kez start (yeniden denemeli), ~60 sn ping, kalıcı hatada durma.
 */

const flush = async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

const fakeTimers = () => {
    const q = [];
    return {
        setTimer: (fn, ms) => {
            q.push({ fn, ms, id: q.length + 1 });
            return q.length;
        },
        clearTimer: (id) => {
            if (q[id - 1]) q[id - 1].fn = null;
        },
        /** Bekleyen ilk zamanlayıcıyı çalıştırır. */
        fire: () => {
            const t = q.find((x) => x.fn);
            if (t) {
                const f = t.fn;
                t.fn = null;
                f();
            }
            return Boolean(t);
        },
        pending: () => q.filter((x) => x.fn),
        q,
    };
};

const OK = { claimed: true, granted: 150, amount: 150, capped: false };
const gateErr = (status, data, message = 'x') => httpErr(status, data, message);

function setupClaimer(api, over = {}) {
    const clock = { t: 1000000 };
    const tm = fakeTimers();
    const marked = [];
    const deferredCalls = [];
    const c = createRewardClaimer({
        getApi: () => api,
        isMember: () => true,
        getSeed: () => 'ABCD1234',
        markClaimed: (k) => marked.push(k),
        onGranted: vi.fn(),
        onCapped: vi.fn(),
        onGuest: vi.fn(),
        onStopped: vi.fn(),
        onDeferred: (k, info) => deferredCalls.push([k, info]),
        setTimer: tm.setTimer,
        now: () => clock.t,
        ...over,
    });
    return { c, clock, tm, marked, deferredCalls };
}

describe('createRewardClaimer: sunucu kapıları', () => {
    it('no_session: önce oturumu başlatır, sonra talebi BİR kez yeniden dener ve başarıda motora bildirir', async () => {
        const api = { claim: vi.fn().mockRejectedValueOnce(gateErr(422, { reason: 'no_session', key: 'zone:1:boss' })).mockResolvedValue(OK) };
        const startSession = vi.fn(() => Promise.resolve(true));
        const { c, marked } = setupClaimer(api, { startSession });
        c.claim('zone:1:boss');
        await flush();
        expect(startSession).toHaveBeenCalledTimes(1);
        expect(api.claim).toHaveBeenCalledTimes(2);
        expect(api.claim).toHaveBeenLastCalledWith('zone:1:boss', 'ABCD1234');
        expect(marked).toEqual(['zone:1:boss']);
    });

    it('no_session iki kez gelirse döngüye girmez: tek yeniden deneme; ödül kuyrukta kalır (bildirilmez)', async () => {
        const api = { claim: vi.fn(() => Promise.reject(gateErr(422, { reason: 'no_session' }))) };
        const startSession = vi.fn(() => Promise.resolve(true));
        const { c, marked } = setupClaimer(api, { startSession });
        c.claim('k');
        await flush();
        expect(api.claim).toHaveBeenCalledTimes(2);
        expect(startSession).toHaveBeenCalledTimes(1);
        expect(marked).toEqual([]);
        // Anahtar serbest: motor yeniden yayınca tekrar denenir.
        expect(c.claim('k')).toBe(true);
    });

    it('no_session + oturum açılamadı: talep tüketilmez, yeniden denenmez, motora bildirilmez', async () => {
        const api = { claim: vi.fn(() => Promise.reject(gateErr(422, { reason: 'no_session' }))) };
        const startSession = vi.fn(() => Promise.resolve(false));
        const { c, marked } = setupClaimer(api, { startSession });
        c.claim('k');
        await flush();
        expect(api.claim).toHaveBeenCalledTimes(1);
        expect(marked).toEqual([]);
    });

    it('no_session ve startSession yoksa (eski istemci) yine bildirilmez', async () => {
        const api = { claim: vi.fn(() => Promise.reject(gateErr(422, { reason: 'no_session' }))) };
        const { c, marked } = setupClaimer(api);
        c.claim('k');
        await flush();
        expect(marked).toEqual([]);
        expect(api.claim).toHaveBeenCalledTimes(1);
    });

    it('too_early: ödül kuyrukta kalır (markClaimed yok), ertelenir; süre dolana dek motor olayları sunucuya gitmez', async () => {
        const api = { claim: vi.fn().mockRejectedValueOnce(gateErr(422, { reason: 'too_early', key: 'zone:1:boss', remaining_seconds: 240 })).mockResolvedValue(OK) };
        const { c, clock, marked, deferredCalls } = setupClaimer(api);
        expect(c.claim('zone:1:boss')).toBe(true);
        await flush();
        expect(marked).toEqual([]);
        expect(deferredCalls).toEqual([['zone:1:boss', { reason: 'too_early', remaining_seconds: 240, requires: undefined }]]);
        expect(c.deferredKeys()).toEqual(['zone:1:boss']);

        // Motor 90 sn'de bir yeniden yayar: süre dolmadı -> sunucuya vurulmaz.
        clock.t += 90000;
        expect(c.claim('zone:1:boss')).toBe(false);
        expect(api.claim).toHaveBeenCalledTimes(1);

        // Süre doldu (240 sn): yeniden talep edilir ve başarılı olur.
        clock.t += 151000;
        expect(c.claim('zone:1:boss')).toBe(true);
        await flush();
        expect(api.claim).toHaveBeenCalledTimes(2);
        expect(marked).toEqual(['zone:1:boss']);
        expect(c.deferredKeys()).toEqual([]);
    });

    it('retryDue: yalnız zamanı gelen erteli talepleri yeniden dener (ping başarısında çağrılır)', async () => {
        const api = {
            claim: vi.fn((key) =>
                api.claim.mock.calls.filter((x) => x[0] === key).length === 1
                    ? Promise.reject(gateErr(422, { reason: 'too_early', remaining_seconds: key === 'a' ? 60 : 600 }))
                    : Promise.resolve(OK)
            ),
        };
        const { c, clock, marked } = setupClaimer(api);
        c.claim('a');
        c.claim('b');
        await flush();
        expect(c.retryDue()).toBe(0); // henüz değil

        clock.t += 61000;
        expect(c.retryDue()).toBe(1);
        await flush();
        expect(marked).toEqual(['a']);
        expect(c.deferredKeys()).toEqual(['b']);

        clock.t += 600000;
        expect(c.retryDue()).toBe(1);
        await flush();
        expect(marked).toEqual(['a', 'b']);
    });

    it('bekleme süresi makul aralığa kırpılır (en az 5 sn, en çok 1 saat)', async () => {
        const api = { claim: vi.fn(() => Promise.reject(gateErr(422, { reason: 'too_early', remaining_seconds: 1 }))) };
        const { c, clock } = setupClaimer(api);
        c.claim('k');
        await flush();
        clock.t += DEFER_MIN_MS - 1;
        expect(c.claim('k')).toBe(false);
        clock.t += 2;
        expect(c.claim('k')).toBe(true);
        await flush();

        const api2 = { claim: vi.fn(() => Promise.reject(gateErr(422, { reason: 'too_early', remaining_seconds: 99999999 }))) };
        const s2 = setupClaimer(api2);
        s2.c.claim('k');
        await flush();
        s2.clock.t += DEFER_MAX_MS - 1;
        expect(s2.c.claim('k')).toBe(false);
        s2.clock.t += 2;
        expect(s2.c.claim('k')).toBe(true);
    });

    it('prerequisite: ertelenir (2 dk), motora bildirilmez', async () => {
        const api = { claim: vi.fn(() => Promise.reject(gateErr(422, { reason: 'prerequisite', key: 'zone:2:boss', requires: 'zone:1:boss' }))) };
        const { c, clock, marked, deferredCalls } = setupClaimer(api);
        c.claim('zone:2:boss');
        await flush();
        expect(marked).toEqual([]);
        expect(deferredCalls[0][1]).toMatchObject({ reason: 'prerequisite', requires: 'zone:1:boss' });
        clock.t += DEFER_PREREQ_MS - 1;
        expect(c.claim('zone:2:boss')).toBe(false);
        clock.t += 2;
        expect(c.claim('zone:2:boss')).toBe(true);
    });

    it('429 hourly_cap: retry_after kadar ertelenir; genel 429 ise eskisi gibi geri çekilmeli yeniden deneme', async () => {
        const api = { claim: vi.fn(() => Promise.reject(gateErr(429, { reason: 'hourly_cap', retry_after: 1800 }))) };
        const { c, clock, marked, tm } = setupClaimer(api);
        c.claim('k');
        await flush();
        expect(marked).toEqual([]);
        expect(tm.pending()).toHaveLength(0); // geri çekilmeli yeniden deneme zamanlanmadı
        clock.t += 1799000;
        expect(c.claim('k')).toBe(false);
        clock.t += 2000;
        expect(c.claim('k')).toBe(true);

        const plain = setupClaimer({ claim: vi.fn(() => Promise.reject(gateErr(429, null))) });
        plain.c.claim('k');
        await flush();
        expect(plain.tm.pending()).toHaveLength(1);
    });

    it('world_cap / lifetime_cap ve bilinmeyen 422: kalıcı, motora bildirilir (kuyruktan düşer); 409 hâlâ bildirilir', async () => {
        for (const reason of ['world_cap', 'lifetime_cap', 'bilinmiyor']) {
            const { c, marked } = setupClaimer({ claim: vi.fn(() => Promise.reject(gateErr(422, { reason }))) });
            c.claim('k');
            await flush();
            expect(marked, reason).toEqual(['k']);
        }
        const { c, marked } = setupClaimer({ claim: vi.fn(() => Promise.reject(gateErr(409, { reason: 'already_claimed' }))) });
        c.claim('k');
        await flush();
        expect(marked).toEqual(['k']);
    });

    it('dispose erteli talepleri temizler', async () => {
        const api = { claim: vi.fn(() => Promise.reject(gateErr(422, { reason: 'too_early', remaining_seconds: 30 }))) };
        const { c, clock } = setupClaimer(api);
        c.claim('k');
        await flush();
        c.dispose();
        expect(c.deferredKeys()).toEqual([]);
        clock.t += 100000;
        expect(c.retryDue()).toBe(0);
    });
});

describe('createPlayTracker', () => {
    const SESSION = { session: { world_code: 'ABCD1234' }, created: true };

    function setup(api, over = {}) {
        const tm = fakeTimers();
        const onPingOk = vi.fn();
        let playTime = 0;
        const tracker = createPlayTracker({
            getApi: () => api,
            canTrack: () => true,
            getWorldCode: () => 'ABCD1234',
            getPlayTime: () => playTime,
            onPingOk,
            setTimer: tm.setTimer,
            clearTimer: tm.clearTimer,
            ...over,
        });
        return { tracker, tm, onPingOk, setPlayTime: (v) => (playTime = v) };
    }

    it('begin: dünya koduyla BİR kez start; tekrar begin/ensureStarted yeni istek atmaz', async () => {
        const api = { playStart: vi.fn(() => Promise.resolve(SESSION)), playPing: vi.fn(() => Promise.resolve({})) };
        const { tracker } = setup(api);
        tracker.begin();
        tracker.begin();
        await flush();
        expect(api.playStart).toHaveBeenCalledTimes(1);
        expect(api.playStart).toHaveBeenCalledWith('ABCD1234');
        expect(tracker.isStarted()).toBe(true);
        await expect(tracker.ensureStarted()).resolves.toBe(true);
        expect(api.playStart).toHaveBeenCalledTimes(1);
    });

    it('ilk ping ~20 sn, sonra ~60 sn aralıkla; motor playTime gönderilir; her başarıda onPingOk', async () => {
        const api = { playStart: vi.fn(() => Promise.resolve(SESSION)), playPing: vi.fn(() => Promise.resolve({})) };
        const { tracker, tm, onPingOk, setPlayTime } = setup(api);
        tracker.begin();
        await flush();
        expect(tm.pending().map((t) => t.ms)).toEqual([PING_FIRST_MS]);

        setPlayTime(21);
        tm.fire();
        await flush();
        expect(api.playPing).toHaveBeenLastCalledWith('ABCD1234', 21);
        expect(onPingOk).toHaveBeenCalledTimes(1);
        expect(tm.pending().map((t) => t.ms)).toEqual([PING_EVERY_MS]);

        setPlayTime(81);
        tm.fire();
        await flush();
        expect(api.playPing).toHaveBeenLastCalledWith('ABCD1234', 81);
        expect(onPingOk).toHaveBeenCalledTimes(2);
        expect(tm.pending().map((t) => t.ms)).toEqual([PING_EVERY_MS]);
    });

    it('ağ hatasında start geri çekilmeli yeniden denenir; ping hatası zinciri bozmaz ve onPingOk çağırmaz', async () => {
        const api = {
            playStart: vi.fn().mockRejectedValueOnce(httpErr(503)).mockRejectedValueOnce(new Error('Network Error')).mockResolvedValue(SESSION),
            playPing: vi.fn().mockRejectedValueOnce(httpErr(503)).mockResolvedValue({}),
        };
        const { tracker, tm, onPingOk } = setup(api);
        tracker.begin();
        await flush();
        expect(tracker.isStarted()).toBe(false);
        expect(tm.pending().map((t) => t.ms)).toEqual([3000]);
        tm.fire();
        await flush();
        expect(tm.pending().map((t) => t.ms)).toEqual([10000]);
        tm.fire();
        await flush();
        expect(tracker.isStarted()).toBe(true);
        expect(api.playStart).toHaveBeenCalledTimes(3);

        tm.fire(); // ilk ping: 503
        await flush();
        expect(onPingOk).not.toHaveBeenCalled();
        expect(tm.pending().map((t) => t.ms)).toEqual([PING_EVERY_MS]);
        tm.fire();
        await flush();
        expect(onPingOk).toHaveBeenCalledTimes(1);
    });

    it('start denemeleri tükenince vazgeçer (söz false); ensureStarted yeni tur başlatabilir', async () => {
        const api = { playStart: vi.fn(() => Promise.reject(httpErr(503))), playPing: vi.fn() };
        const { tracker, tm } = setup(api, { startDelays: [10, 10] });
        const p = tracker.ensureStarted();
        await flush();
        tm.fire();
        await flush();
        tm.fire();
        await flush();
        await expect(p).resolves.toBe(false);
        expect(api.playStart).toHaveBeenCalledTimes(3);
        expect(tracker.isStopped()).toBe(false);

        api.playStart.mockResolvedValue(SESSION);
        await expect(tracker.ensureStarted()).resolves.toBe(true);
    });

    it('kalıcı hata (422 geçersiz kod / günlük oturum sınırı, 401) durdurur; ödül yürütücüsü false alır', async () => {
        for (const status of [422, 401, 403]) {
            const api = { playStart: vi.fn(() => Promise.reject(httpErr(status, { reason: 'session_cap' }))), playPing: vi.fn() };
            const { tracker, tm } = setup(api);
            tracker.begin();
            await flush();
            expect(tracker.isStopped(), String(status)).toBe(true);
            expect(tm.pending()).toHaveLength(0);
            await expect(tracker.ensureStarted()).resolves.toBe(false);
            expect(api.playStart).toHaveBeenCalledTimes(1);
        }
    });

    it('ping 422 no_session: oturum yeniden başlatılır ve ping zinciri sürer', async () => {
        const api = {
            playStart: vi.fn(() => Promise.resolve(SESSION)),
            playPing: vi.fn().mockRejectedValueOnce(httpErr(422, { reason: 'no_session' })).mockResolvedValue({}),
        };
        const { tracker, tm } = setup(api);
        tracker.begin();
        await flush();
        tm.fire(); // ping -> no_session
        await flush();
        expect(api.playStart).toHaveBeenCalledTimes(2);
        expect(tm.pending().map((t) => t.ms)).toEqual([PING_FIRST_MS]);
    });

    it('ping 401 zinciri durdurur', async () => {
        const api = { playStart: vi.fn(() => Promise.resolve(SESSION)), playPing: vi.fn(() => Promise.reject(httpErr(401))) };
        const { tracker, tm } = setup(api);
        tracker.begin();
        await flush();
        tm.fire();
        await flush();
        expect(tracker.isStopped()).toBe(true);
        expect(tm.pending()).toHaveLength(0);
    });

    it('canTrack false (misafir / macera dışı), api desteği yok ya da dünya kodu yok: istek atmaz', async () => {
        const api = { playStart: vi.fn(), playPing: vi.fn() };
        const a = setup(api, { canTrack: () => false });
        a.tracker.begin();
        await flush();
        expect(api.playStart).not.toHaveBeenCalled();
        await expect(a.tracker.ensureStarted()).resolves.toBe(false);

        const old = setup({}, {});
        await expect(old.tracker.ensureStarted()).resolves.toBe(false);

        const nocode = setup(api, { getWorldCode: () => '' });
        await expect(nocode.tracker.ensureStarted()).resolves.toBe(false);
        expect(api.playStart).not.toHaveBeenCalled();
    });

    it('dispose bekleyen zamanlayıcıları keser ve bir daha istek atmaz', async () => {
        const api = { playStart: vi.fn(() => Promise.resolve(SESSION)), playPing: vi.fn(() => Promise.resolve({})) };
        const { tracker, tm } = setup(api);
        tracker.begin();
        await flush();
        tracker.dispose();
        expect(tm.pending()).toHaveLength(0);
        tm.fire();
        await flush();
        expect(api.playPing).not.toHaveBeenCalled();
    });
});
