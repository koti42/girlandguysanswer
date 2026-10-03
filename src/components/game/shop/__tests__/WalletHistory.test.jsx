// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WalletHistory from '../WalletHistory';
import { shopApi } from '../../../../services/shopApi';

vi.mock('../../../../services/shopApi', () => ({ shopApi: { transactions: vi.fn() } }));

describe('WalletHistory', () => {
    it('ürün adı: tasarımı olan öğede tasarım adı, karakter parçasında sunucunun item_name alanı', async () => {
        shopApi.transactions.mockResolvedValue({
            transactions: [
                { id: 3, amount: -900, balance_after: 100, type: 'purchase', item_key: 'hair:mohawk', item_name: 'Saç: Mohawk', created_at: '2026-10-03T09:00:00Z' },
                { id: 2, amount: -2800, balance_after: 1000, type: 'purchase', item_key: 'frame:neon-gece', item_name: 'Sunucu adı', created_at: '2026-10-03T08:00:00Z' },
                { id: 1, amount: 3800, balance_after: 3800, type: 'admin_grant', item_key: null, note: 'Etkinlik ödülü', created_at: '2026-10-03T07:00:00Z' },
            ],
            pagination: { current_page: 1, last_page: 1 },
        });
        render(<WalletHistory open wallet={{ balance: 100, earned_total: 3800, spent_total: 3700 }} onClose={() => {}} />);
        expect(await screen.findByText(/Saç: Mohawk/)).toBeInTheDocument();
        expect(screen.getByText(/Neon Gece/)).toBeInTheDocument();
        expect(screen.queryByText(/Sunucu adı/)).toBeNull();
        expect(screen.getByText(/Etkinlik ödülü/)).toBeInTheDocument();
    });
});
