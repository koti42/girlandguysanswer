// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ getProfile: vi.fn(), block: vi.fn(), unblock: vi.fn(), follow: vi.fn(), unfollow: vi.fn() }));
vi.mock('../../../services/api', () => ({ usersAPI: api }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { username: 'ben' } }) }));
vi.mock('../../game/shop/MessageTicketDialog', () => ({ default: () => null }));
vi.mock('../../UserAvatar', () => ({ default: () => <span>avatar</span> }));

import ProfileActions from '../ProfileActions';
import UserHoverCard from '../../UserHoverCard';

const profile = (over = {}) => ({ username: 'ayse', hasBlocked: false, isBlocked: false, isFollowing: false, allow_messaging: true, ...over });

const renderActions = (data) =>
    render(
        <MemoryRouter>
            <ProfileActions
                profileData={data}
                isOwnProfile={false}
                onFollowToggle={() => {}}
                onBlockToggle={() => {}}
                onUnblock={() => {}}
                showActionsMenu
                setShowActionsMenu={() => {}}
                actionsMenuRef={{ current: null }}
            />
        </MemoryRouter>,
    );

describe('Sistem hesabı engelleme seçeneği', () => {
    it('profil menüsü: normal kullanıcıda "Kullanıcıyı Engelle" var', () => {
        renderActions(profile());
        expect(screen.getByRole('button', { name: /Kullanıcıyı Engelle/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Şikayet Et/ })).toBeInTheDocument();
    });

    it('profil menüsü: sistem hesabında engelleme seçeneği gizli, şikâyet kalır', () => {
        renderActions(profile({ username: 'herkeslersoruyor-system' }));
        expect(screen.queryByRole('button', { name: /Engelle/ })).toBeNull();
        expect(screen.getByRole('button', { name: /Şikayet Et/ })).toBeInTheDocument();
    });

    it('profil menüsü: sistem hesabına eski bir engel varsa "Engeli Kaldır" yine sunulur', () => {
        renderActions(profile({ username: 'herkeslersoruyor-system', hasBlocked: true }));
        expect(screen.getByRole('button', { name: /Engeli Kaldır/ })).toBeInTheDocument();
    });

    const hover = async (username) => {
        vi.useFakeTimers();
        try {
            api.getProfile.mockResolvedValue({ data: { data: { user: { username, stats: {} } } } });
            render(
                <MemoryRouter>
                    <UserHoverCard username={username}>
                        <span>tetik</span>
                    </UserHoverCard>
                </MemoryRouter>,
            );
            fireEvent.mouseEnter(screen.getByText('tetik').parentElement);
            await act(async () => {
                vi.advanceTimersByTime(400);
            });
        } finally {
            vi.useRealTimers();
        }
    };

    it('kullanıcı kartı: normal kullanıcıda engelle düğmesi var', async () => {
        await hover('ayse');
        expect(screen.getByTitle('Mesaj gönder')).toBeInTheDocument();
        expect(screen.getByTitle('Engelle')).toBeInTheDocument();
    });

    it('kullanıcı kartı: sistem hesabında engelle düğmesi gizli', async () => {
        await hover('herkeslersoruyor-system');
        expect(screen.getByTitle('Mesaj gönder')).toBeInTheDocument();
        expect(screen.queryByTitle('Engelle')).toBeNull();
    });
});
