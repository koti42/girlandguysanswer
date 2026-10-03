// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import api, { communityAPI } from './api';

/* communityAPI.leave gövdesi: keep_open yalnızca açıkça verildiğinde gider. */

describe('communityAPI.leave', () => {
    let sent;
    let originalAdapter;

    beforeEach(() => {
        sent = [];
        originalAdapter = api.defaults.adapter;
        api.defaults.adapter = async (config) => {
            sent.push(config);
            return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config };
        };
    });

    afterEach(() => {
        api.defaults.adapter = originalAdapter;
    });

    it('seçenek yoksa gövde boş', async () => {
        await communityAPI.leave('abc');
        expect(sent[0].method).toBe('post');
        expect(sent[0].url).toBe('/communities/abc/leave');
        expect(sent[0].data).toBeUndefined();
    });

    it('keepOpen true/false keep_open olarak gönderilir', async () => {
        await communityAPI.leave('abc', { keepOpen: true });
        await communityAPI.leave('abc', { keepOpen: false });
        expect(JSON.parse(sent[0].data)).toEqual({ keep_open: true });
        expect(JSON.parse(sent[1].data)).toEqual({ keep_open: false });
    });
});
