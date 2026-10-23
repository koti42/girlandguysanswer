// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

const api = vi.hoisted(() => ({ getCurrentUser: vi.fn(), markWelcomeGuideSeen: vi.fn() }));
vi.mock('../../services/api', () => ({ authAPI: api }));

import { AuthProvider, useAuth } from '../AuthContext';

const holder = { current: null };
const Probe = () => {
    const value = useAuth();
    React.useEffect(() => {
        holder.current = value;
    });
    return null;
};

const mount = async () => {
    await act(async () => {
        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );
    });
    await act(async () => {});
};

const meResponse = (user) => ({ data: { data: { user, permissions: {} } } });

beforeEach(() => {
    localStorage.clear();
    api.getCurrentUser.mockReset();
    api.markWelcomeGuideSeen.mockReset();
    api.markWelcomeGuideSeen.mockResolvedValue({ data: { success: true } });
    localStorage.setItem('token', 't');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', username: 'ali' }));
});

describe('AuthContext: karşılama rehberi işareti', () => {
    it('sunucudaki has_seen_welcome_guide kullanıcıya yansır (yeniden yüklemede modal çıkmaz)', async () => {
        api.getCurrentUser.mockResolvedValue(meResponse({ id: 'u1', username: 'ali', has_seen_welcome_guide: true }));
        await mount();
        expect(holder.current.user.has_seen_welcome_guide).toBe(true);
    });

    it('işaretleyince yerelde hemen kaydeder ve sunucuya TEK istek gönderir', async () => {
        api.getCurrentUser.mockResolvedValue(meResponse({ id: 'u1', username: 'ali', has_seen_welcome_guide: false }));
        await mount();
        expect(holder.current.user.has_seen_welcome_guide).toBe(false);

        await act(async () => {
            await holder.current.markWelcomeGuideSeen();
        });
        expect(localStorage.getItem('has_seen_welcome_guide')).toBe('1');
        expect(holder.current.user.has_seen_welcome_guide).toBe(true);
        expect(JSON.parse(localStorage.getItem('user')).has_seen_welcome_guide).toBe(true);
        expect(api.markWelcomeGuideSeen).toHaveBeenCalledTimes(1);
    });

    it('sunucu isteği başarısız olsa da yerel işaret kalır ve hata fırlatmaz', async () => {
        api.getCurrentUser.mockResolvedValue(meResponse({ id: 'u1', username: 'ali', has_seen_welcome_guide: false }));
        api.markWelcomeGuideSeen.mockRejectedValue(new Error('ağ yok'));
        await mount();
        await act(async () => {
            await expect(holder.current.markWelcomeGuideSeen()).resolves.toBeUndefined();
        });
        expect(localStorage.getItem('has_seen_welcome_guide')).toBe('1');
        expect(holder.current.user.has_seen_welcome_guide).toBe(true);
    });
});
