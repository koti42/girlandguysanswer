// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CommunityCard from '../CommunityCard';

/* Sahibi "Açık bırak" deyip ayrılan yazılı odada kapanış rozeti. */

const HOUR = 3_600_000;
const room = (extra = {}) => ({
    id: 1, uuid: 'a', title: 'Kitap kulübü', type: 'text', participants_count: 4,
    owner: { username: 'ayse' }, ...extra,
});

describe('CommunityCard — kapanış rozeti', () => {
    it('closes_at yoksa rozet yok', () => {
        render(<CommunityCard community={room({ closes_at: null })} onClick={vi.fn()} />);
        expect(screen.queryByTestId('community-closing-badge')).toBeNull();
    });

    it('kalan saati yukarı yuvarlayarak gösterir', () => {
        const closesAt = new Date(Date.now() + 5.5 * HOUR).toISOString();
        render(<CommunityCard community={room({ owner_left_at: new Date().toISOString(), closes_at: closesAt })} onClick={vi.fn()} />);
        expect(screen.getByTestId('community-closing-badge')).toHaveTextContent('Sahip ayrıldı · 6 sa içinde kapanır');
    });

    it('bir saatten az kaldıysa en az 1 sa yazar', () => {
        const closesAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        render(<CommunityCard community={room({ closes_at: closesAt })} onClick={vi.fn()} />);
        expect(screen.getByTestId('community-closing-badge')).toHaveTextContent('1 sa içinde kapanır');
    });

    it('süre geçtiyse rozet gizlenir', () => {
        const closesAt = new Date(Date.now() - HOUR).toISOString();
        render(<CommunityCard community={room({ closes_at: closesAt })} onClick={vi.fn()} />);
        expect(screen.queryByTestId('community-closing-badge')).toBeNull();
    });
});
