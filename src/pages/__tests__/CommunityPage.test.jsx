// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/* Meydan listesi: yükleniyor iskeleti, boş durum daveti ve oda kartları. */

vi.mock('../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../components/Widgets', () => ({
    TrendsWidget: () => null, TopUsersWidget: () => null, AnnouncementsWidget: () => null, PopularQuestionsWidget: () => null,
}));
vi.mock('../../components/SEO', () => ({ default: () => null }));
vi.mock('../../services/api', () => ({
    communityAPI: { getAll: vi.fn(), create: vi.fn() },
}));

import { communityAPI } from '../../services/api';
import CommunityPage from '../CommunityPage';

const renderPage = () => render(<MemoryRouter><CommunityPage /></MemoryRouter>);

describe('CommunityPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('yüklenirken tek bir dönen simge yerine kart iskeletleri gösterir', () => {
        communityAPI.getAll.mockReturnValue(new Promise(() => {}));
        renderPage();
        expect(screen.getByRole('heading', { level: 1, name: 'Meydan' })).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Odalar yükleniyor');
        expect(screen.getAllByTestId('community-skeleton').length).toBeGreaterThan(1);
    });

    it('oda yokken boş durum: çizim, açıklama kutuları ve oda kurma penceresini açan düğme', async () => {
        communityAPI.getAll.mockResolvedValue({ data: { data: [] } });
        const user = userEvent.setup();
        renderPage();

        const cta = await screen.findByRole('button', { name: 'İlk odayı oluştur' });
        expect(screen.getByRole('heading', { name: 'Meydan şimdilik sessiz' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: /meydanda/i })).toBeInTheDocument();
        expect(screen.getByText('Sesli oda')).toBeInTheDocument();
        expect(screen.getByText('Konuş, dinle, el kaldır.')).toBeInTheDocument();
        expect(screen.getByText('Yazılı sohbet')).toBeInTheDocument();
        expect(screen.getByText('Mesajlaşarak tartış.')).toBeInTheDocument();
        // Boş durumda yüzen düğme gereksiz; sayfanın kendi daveti var
        expect(screen.queryByRole('button', { name: 'Oda Oluştur' })).toBeNull();

        expect(screen.queryByText('Yeni Oda Oluştur')).toBeNull();
        await user.click(cta);
        expect(screen.getByText('Yeni Oda Oluştur')).toBeInTheDocument();
    });

    it('oda varken kartları listeler, boş durum görünmez', async () => {
        communityAPI.getAll.mockResolvedValue({
            data: { data: [{ id: 1, uuid: 'a', title: 'Maç sonu', type: 'voice', owner: { username: 'mert' } }] },
        });
        renderPage();

        expect(await screen.findByText('Maç sonu')).toBeInTheDocument();
        expect(screen.queryByText('Meydan şimdilik sessiz')).toBeNull();
        expect(screen.getByRole('button', { name: 'Oda Oluştur' })).toBeInTheDocument();
    });
});
