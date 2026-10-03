// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/api', () => {
    const ok = () => Promise.resolve({ data: { success: true, data: { ok: true } } });
    return { default: { get: vi.fn(ok), put: vi.fn(ok), post: vi.fn(ok) } };
});

import api from '../../../../services/api';
import { avatarApi } from '../../../../services/avatarApi';
import { defaultAvatar } from '../../../../game/avatar/catalog';

describe('avatarApi', () => {
    beforeEach(() => vi.clearAllMocks());

    it('uçlar, gövdeler, zaman aşımları; zarfın data alanını döndürür', async () => {
        const a = defaultAvatar('female');
        await expect(avatarApi.get()).resolves.toEqual({ ok: true });
        await avatarApi.save(a);
        await avatarApi.buy('hair:mohawk');
        expect(api.get).toHaveBeenCalledWith('/game/avatar', { timeout: 15000 });
        expect(api.put.mock.calls[0][0]).toBe('/game/avatar');
        expect(api.put.mock.calls[0][1]).toEqual({ avatar: a });
        expect(api.put.mock.calls[0][2].timeout).toBe(15000);
        expect(api.post.mock.calls[0][0]).toBe('/game/avatar/buy');
        expect(api.post.mock.calls[0][1]).toEqual({ item: 'hair:mohawk' });
        expect(api.post.mock.calls[0][2].timeout).toBe(15000);
    });

    it('kaydet / satın al her çağrıda taze Idempotency-Key alır', async () => {
        const a = defaultAvatar();
        await avatarApi.save(a);
        await avatarApi.save(a);
        await avatarApi.buy('acc:kedi');
        await avatarApi.buy('acc:kedi');
        const keys = [...api.put.mock.calls, ...api.post.mock.calls].map((c) => c[2].headers['Idempotency-Key']);
        expect(keys.every(Boolean)).toBe(true);
        expect(new Set(keys).size).toBe(4);
    });

    it('hata olduğu gibi fırlatılır', async () => {
        const err = Object.assign(new Error('x'), { response: { status: 409 } });
        api.post.mockRejectedValueOnce(err);
        await expect(avatarApi.buy('acc:kedi')).rejects.toBe(err);
    });
});
