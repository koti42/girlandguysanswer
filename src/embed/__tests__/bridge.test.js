// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    HAPTIC_MIN_GAP_MS,
    __resetBridgeForTests,
    applySafeArea,
    createHaptics,
    installNativeReceiver,
    isSafeInternalPath,
    onNativeMessage,
    parseIncoming,
    postToNative,
    readGame,
    readNativeConfig,
    receiveFromNative,
    validateOutgoing,
} from '../bridge';

const AVATAR = { v: 1, body: 'kiz', skin: 2, hair: { style: 'uzun', color: 4 }, top: { style: 'tisort', color: 1 }, bottom: { style: 'etek', color: 2 }, shoes: { style: 'spor', color: 0 }, acc: 'gozluk', trail: 'none' };

describe('köprü: web -> native şeması', () => {
    it('bilinen tipleri ve alanlarını doğrular', () => {
        expect(validateOutgoing({ type: 'ready' })).toBe(true);
        expect(validateOutgoing({ type: 'ready', game: 'kosu' })).toBe(true);
        expect(validateOutgoing({ type: 'ready', game: 'kesif' })).toBe(true);
        expect(validateOutgoing({ type: 'ready', game: 'golf' })).toBe(false);
        expect(validateOutgoing({ type: 'haptic', style: 'success' })).toBe(true);
        expect(validateOutgoing({ type: 'haptic', style: 'boom' })).toBe(false);
        expect(validateOutgoing({ type: 'exit' })).toBe(true);
        expect(validateOutgoing({ type: 'login' })).toBe(true);
        expect(validateOutgoing({ type: 'settings', muted: true, music: false })).toBe(true);
        expect(validateOutgoing({ type: 'settings', muted: 'evet', music: false })).toBe(false);
        expect(validateOutgoing({ type: 'error', message: 'Oyun durdu.' })).toBe(true);
        expect(validateOutgoing({ type: 'error', message: '' })).toBe(false);
        expect(validateOutgoing({ type: 'error', message: 'x'.repeat(501) })).toBe(false);
        expect(validateOutgoing({ type: 'bilinmeyen' })).toBe(false);
        expect(validateOutgoing({ type: 'toString' })).toBe(false);
        expect(validateOutgoing(null)).toBe(false);
        expect(validateOutgoing('exit')).toBe(false);
    });

    it('result: oyun ve skor zorunlu, özet alanları düz değer', () => {
        expect(validateOutgoing({ type: 'result', game: 'kosu', score: 4321, distance_m: 870, new_best: true, saved: null })).toBe(true);
        expect(validateOutgoing({ type: 'result', game: 'kosu', score: null, saved: true })).toBe(true);
        expect(validateOutgoing({ type: 'result', game: 'kesif', score: 350, zone: 1, puzzles: 1, playSeconds: 90, mode: 'macera', victory: false })).toBe(true);
        expect(validateOutgoing({ type: 'result', game: 'avatar', score: 1 })).toBe(false);
        expect(validateOutgoing({ type: 'result', game: 'kosu', score: -1 })).toBe(false);
        expect(validateOutgoing({ type: 'result', game: 'kosu', score: 1.5 })).toBe(false);
        expect(validateOutgoing({ type: 'result', game: 'kosu', score: 1, gates: [1, 2] })).toBe(false);
        expect(validateOutgoing({ type: 'result', game: 'kosu', score: 1, nested: { a: 1 } })).toBe(false);
    });

    it('openUrl yalnızca site içi göreli yolları kabul eder', () => {
        expect(isSafeInternalPath('/oyun/kosu')).toBe(true);
        expect(isSafeInternalPath('/profile/ayse?tab=badges')).toBe(true);
        expect(validateOutgoing({ type: 'openUrl', url: '/oyun/karakter' })).toBe(true);
        for (const bad of ['https://kotu.example', '//kotu.example', '/\\kotu', 'javascript:alert(1)', 'oyun', '', '/a b', `/${'a'.repeat(400)}`, null]) {
            expect(validateOutgoing({ type: 'openUrl', url: bad })).toBe(false);
        }
    });
});

describe('köprü: gönderim', () => {
    afterEach(() => {
        delete window.ReactNativeWebView;
    });

    it('ReactNativeWebView yoksa etkisiz (hata yok, false)', () => {
        expect(window.ReactNativeWebView).toBeUndefined();
        expect(postToNative('exit')).toBe(false);
        expect(postToNative('haptic', { style: 'light' })).toBe(false);
    });

    it('geçerli mesajı JSON metni olarak gönderir; geçersizi göndermez', () => {
        const postMessage = vi.fn();
        window.ReactNativeWebView = { postMessage };
        expect(postToNative('settings', { muted: true, music: true })).toBe(true);
        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({ type: 'settings', muted: true, music: true });
        // payload içindeki "type" mesaj tipini ezemez.
        postToNative('exit', { type: 'login' });
        expect(JSON.parse(postMessage.mock.calls[1][0])).toEqual({ type: 'exit' });

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(postToNative('haptic', { style: 'patlama' })).toBe(false);
        expect(postToNative('openUrl', { url: 'https://kotu.example' })).toBe(false);
        expect(postMessage).toHaveBeenCalledTimes(2);
    });

    it('postMessage hata fırlatsa da oyun düşmez', () => {
        window.ReactNativeWebView = {
            postMessage: () => {
                throw new Error('köprü kapandı');
            },
        };
        expect(postToNative('exit')).toBe(false);
    });

    it('titreşim: ayar kapalıysa gönderilmez; aynı stil kısa sürede bir kez gider', () => {
        const post = vi.fn(() => true);
        let t = 1000;
        const haptic = createHaptics({ enabled: true, post, now: () => t });
        expect(haptic('light')).toBe(true);
        expect(haptic('light')).toBe(false);
        expect(haptic('heavy')).toBe(true);
        t += HAPTIC_MIN_GAP_MS;
        expect(haptic('light')).toBe(true);
        expect(haptic('bilinmeyen')).toBe(false);
        expect(post).toHaveBeenCalledTimes(3);
        expect(post).toHaveBeenCalledWith('haptic', { style: 'heavy' });

        const off = createHaptics({ enabled: false, post });
        expect(off('success')).toBe(false);
        expect(post).toHaveBeenCalledTimes(3);
    });
});

describe('köprü: native -> web alımı', () => {
    beforeEach(() => {
        __resetBridgeForTests();
    });

    it('yalnızca beklenen tipleri işler; JSON metni de kabul eder', () => {
        expect(parseIncoming({ type: 'pause' })).toEqual({ type: 'pause' });
        expect(parseIncoming('{"type":"setMuted","muted":true}')).toEqual({ type: 'setMuted', muted: true });
        expect(parseIncoming({ type: 'setAvatar', avatar: AVATAR })).toMatchObject({ type: 'setAvatar' });
        expect(parseIncoming({ type: 'setAvatar', avatar: null })).toMatchObject({ avatar: null });
        expect(parseIncoming({ type: 'setAvatar', avatar: 'kiz' })).toBeNull();
        expect(parseIncoming({ type: 'setMuted', muted: 'true' })).toBeNull();
        expect(parseIncoming({ type: 'setMusic' })).toBeNull();
        expect(parseIncoming({ type: 'eval', code: 'alert(1)' })).toBeNull();
        expect(parseIncoming({ type: '__proto__' })).toBeNull();
        expect(parseIncoming('{bozuk')).toBeNull();
        expect(parseIncoming(42)).toBeNull();
    });

    it('__hsNativeReceive kurulur; dinleyiciye iletir, bilinmeyeni yok sayar', () => {
        installNativeReceiver(window);
        installNativeReceiver(window);
        expect(typeof window.__hsNativeReceive).toBe('function');
        const got = [];
        const off = onNativeMessage((m) => got.push(m.type));
        expect(window.__hsNativeReceive({ type: 'back' })).toBe(true);
        expect(window.__hsNativeReceive({ type: 'bilinmeyen' })).toBe(false);
        expect(window.__hsNativeReceive(JSON.stringify({ type: 'setMusic', music: false }))).toBe(true);
        expect(got).toEqual(['back', 'setMusic']);
        off();
        receiveFromNative({ type: 'pause' });
        expect(got).toEqual(['back', 'setMusic']);
    });

    it('dinleyici yokken gelen back kuyruğa alınmaz ve false döner (native geri tuşu çıksın)', () => {
        expect(receiveFromNative({ type: 'back' })).toBe(false);
        expect(receiveFromNative({ type: 'pause' })).toBe(true);
        const got = [];
        onNativeMessage((m) => got.push(m.type));
        expect(got).toEqual(['pause']);
        expect(receiveFromNative({ type: 'back' })).toBe(true);
        expect(got).toEqual(['pause', 'back']);
    });

    it('dinleyici bağlanmadan gelen mesajlar kuyrukta bekler, sırayla teslim edilir', () => {
        receiveFromNative({ type: 'pause' });
        receiveFromNative({ type: 'setMuted', muted: true });
        const got = [];
        onNativeMessage((m) => got.push(m));
        expect(got).toEqual([{ type: 'pause' }, { type: 'setMuted', muted: true }]);
    });

    it('bir dinleyicinin hatası diğerlerini durdurmaz', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const b = vi.fn();
        onNativeMessage(() => {
            throw new Error('x');
        });
        onNativeMessage(b);
        receiveFromNative({ type: 'resume' });
        expect(b).toHaveBeenCalledWith({ type: 'resume' });
    });
});

describe('köprü: native yapılandırması', () => {
    it('__HS_NATIVE__ doğrulanarak okunur', () => {
        const win = {
            __HS_NATIVE__: {
                v: 1,
                platform: 'android',
                token: '12|AbCdEf123',
                user: { id: 'u1', username: 'ayse', gender: 'female' },
                safeArea: { top: 24.6, right: 0, bottom: 999, left: -5 },
                muted: true,
                music: false,
                haptics: false,
                avatar: AVATAR,
            },
            location: { search: '' },
        };
        expect(readNativeConfig(win)).toEqual({
            v: 1,
            platform: 'android',
            token: '12|AbCdEf123',
            user: { id: 'u1', username: 'ayse', gender: 'female' },
            safeArea: { top: 25, right: 0, bottom: 200, left: 0 },
            muted: true,
            music: false,
            haptics: false,
            avatar: AVATAR,
            accessibility: false,
            native: true,
        });
    });

    it('bozuk alanlar güvenli varsayılana düşer', () => {
        const cfg = readNativeConfig({ __HS_NATIVE__: { token: 'kötü token <script>', user: { username: 'x' }, platform: 'windows', avatar: [1] } });
        expect(cfg).toMatchObject({ token: null, user: null, platform: 'web', muted: false, music: true, haptics: true, avatar: null, safeArea: null, native: true });
    });

    it('native yoksa adres parametrelerinden test yapılandırması; token adresten okunmaz', () => {
        const cfg = readNativeConfig({ location: { search: '?game=kosu&platform=ios&muted=1&music=0&haptics=0&safe=47,0,34,0&gender=female&token=gizli' } });
        expect(cfg).toMatchObject({
            platform: 'ios',
            token: null,
            muted: true,
            music: false,
            haptics: false,
            safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
            user: { gender: 'female' },
            native: false,
        });
        expect(readNativeConfig({ location: { search: '' } })).toMatchObject({ platform: 'web', token: null, user: null, muted: false, music: true });
    });

    it('oyun parametresi ve güvenli alan CSS değişkenleri', () => {
        expect(readGame('?game=kosu&v=1')).toBe('kosu');
        expect(readGame('?game=avatar')).toBe('avatar');
        expect(readGame('?game=kule')).toBe('kule');
        expect(readGame('?game=kesif&mode=insa')).toBe('kesif');
        expect(readGame('?game=golf')).toBeNull();
        expect(readGame('')).toBeNull();

        const root = document.createElement('div');
        applySafeArea({ top: 47, right: 0, bottom: 34, left: 0 }, root);
        expect(root.style.getPropertyValue('--hs-safe-top')).toBe('47px');
        expect(root.style.getPropertyValue('--hs-safe-bottom')).toBe('34px');
        expect(root.style.getPropertyValue('--hs-safe-left')).toBe('0px');
        applySafeArea(null, root);
        expect(root.style.getPropertyValue('--hs-safe-top')).toBe('47px');
    });
});
