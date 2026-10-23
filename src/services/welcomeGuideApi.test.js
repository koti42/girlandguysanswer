// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import api, { authAPI } from './api';

/**
 * Karşılama rehberi işareti: eskiden PATCH /user/me gidiyordu, API yalnızca PUT
 * kabul ediyordu (405). Artık özel uç: PUT /user/me/welcome-guide.
 */
describe('authAPI.markWelcomeGuideSeen', () => {
    it('PUT /user/me/welcome-guide gönderir (PATCH /user/me değil)', async () => {
        const seen = [];
        const original = api.defaults.adapter;
        api.defaults.adapter = (config) => {
            seen.push({ method: config.method, url: config.url });
            return Promise.resolve({ data: { success: true, data: { has_seen_welcome_guide: true } }, status: 200, statusText: 'OK', headers: {}, config });
        };
        try {
            await authAPI.markWelcomeGuideSeen();
        } finally {
            api.defaults.adapter = original;
        }
        expect(seen).toEqual([{ method: 'put', url: '/user/me/welcome-guide' }]);
    });
});
