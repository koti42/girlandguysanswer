// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('./api', () => ({ default: http }));

import { profileThemeApi, freshKey } from './profileThemeApi';

const envelope = (data) => Promise.resolve({ data: { success: true, message: 'ok', data } });

describe('profileThemeApi', () => {
    beforeEach(() => {
        Object.values(http).forEach((f) => f.mockReset());
        http.get.mockImplementation(() => envelope({ themes: [] }));
        http.post.mockImplementation(() => envelope({ theme: { key: 'ada' } }));
        http.put.mockImplementation(() => envelope({ theme: { key: 'ada' } }));
    });

    it('overview: GET /game/themes/overview, zarfı açar', async () => {
        http.get.mockImplementation(() => envelope({ themes: [{ key: 'ada' }], wallet: { balance: 5 } }));
        await expect(profileThemeApi.overview()).resolves.toEqual({ themes: [{ key: 'ada' }], wallet: { balance: 5 } });
        expect(http.get).toHaveBeenCalledWith('/game/themes/overview', { timeout: 15000 });
    });

    it('zarf boşsa boş nesne döner', async () => {
        http.get.mockImplementation(() => Promise.resolve({ data: {} }));
        await expect(profileThemeApi.overview()).resolves.toEqual({});
    });

    it('buy: POST /game/themes/ada/buy, boş gövde + taze Idempotency-Key + zaman aşımı', async () => {
        await profileThemeApi.buy();
        const [url, body, config] = http.post.mock.calls[0];
        expect(url).toBe('/game/themes/ada/buy');
        expect(body).toEqual({});
        expect(config.timeout).toBe(15000);
        expect(config.headers['Idempotency-Key']).toBeTruthy();
    });

    it('her çağrı farklı Idempotency-Key alır', async () => {
        await profileThemeApi.buy();
        await profileThemeApi.buy();
        const k1 = http.post.mock.calls[0][2].headers['Idempotency-Key'];
        const k2 = http.post.mock.calls[1][2].headers['Idempotency-Key'];
        expect(k1).not.toBe(k2);
        expect(freshKey().headers['Idempotency-Key']).not.toBe(freshKey().headers['Idempotency-Key']);
    });

    it('toggle: PUT /game/themes/ada/toggle { enabled } boolean olur', async () => {
        await profileThemeApi.toggle('ada', 0);
        expect(http.put).toHaveBeenLastCalledWith('/game/themes/ada/toggle', { enabled: false }, expect.objectContaining({ timeout: 15000, headers: expect.any(Object) }));
        await profileThemeApi.toggle('ada', true);
        expect(http.put.mock.calls[1][1]).toEqual({ enabled: true });
    });

    it('activate: POST /game/themes/ada/activate', async () => {
        await profileThemeApi.activate();
        const [url, body, config] = http.post.mock.calls[0];
        expect(url).toBe('/game/themes/ada/activate');
        expect(body).toEqual({});
        expect(config.headers['Idempotency-Key']).toBeTruthy();
    });

    it('tema anahtarı yola kaçışlanarak girer', async () => {
        await profileThemeApi.buy('a/b?c');
        expect(http.post.mock.calls[0][0]).toBe('/game/themes/a%2Fb%3Fc/buy');
    });

    it('hata olduğu gibi fırlatılır (durum kodu korunur)', async () => {
        const err = { response: { status: 422, data: { message: 'x', data: { reason: 'insufficient' } } } };
        http.post.mockImplementation(() => Promise.reject(err));
        await expect(profileThemeApi.buy()).rejects.toBe(err);
    });
});
