// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ overview: vi.fn(), buy: vi.fn(), toggle: vi.fn(), activate: vi.fn() }));
vi.mock('../../../../services/profileThemeApi', () => ({ profileThemeApi: api, default: api }));

// Canlı sahne modülü çizim sırasında patlıyor (yükleme/WebGL hatası benzetimi).
vi.mock('../IslandPreview', () => ({
    default: () => { throw new Error('sahne yüklenemedi'); },
}));

import ThemeSettingsCard from '../ThemeSettingsCard';

describe('Ada Profili önizlemesi yedeği', () => {
    let errSpy;
    beforeEach(() => {
        errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        api.overview.mockReset();
        api.overview.mockImplementation(() => Promise.resolve({
            themes: [{ key: 'ada', name: 'Ada Profili', price: 1000000, days: 15, owned: false, active: false, enabled: false, expires_at: null, unlimited: false, source: null, can_free: false }],
            wallet: { balance: 10 },
        }));
    });
    afterEach(() => errSpy.mockRestore());

    it('sahne bileşeni çökerse sayfa çökmez; statik resim ve açıklama kalır', async () => {
        render(<MemoryRouter><ThemeSettingsCard user={{ username: 'ayse' }} /></MemoryRouter>);
        const el = await screen.findByTestId('theme-card');
        fireEvent.click(within(el).getByRole('button', { name: 'Önizle' }));
        await waitFor(() => expect(screen.getByTestId('theme-preview-static')).toHaveTextContent('Canlı önizleme şu an yüklenemedi.'));
        // Kartın geri kalanı çalışmaya devam eder.
        expect(within(el).getByRole('button', { name: /Satın al/ })).toBeInTheDocument();
    });
});
