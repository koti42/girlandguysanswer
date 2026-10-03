// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CoinReward from '../CoinReward';

const renderReward = (props) =>
    render(
        <MemoryRouter>
            <CoinReward {...props} />
        </MemoryRouter>,
    );

describe('CoinReward', () => {
    it('kazanılan jetonu ve bakiyeyi gösterir, tavan notu yok', () => {
        renderReward({ coins: 52, balance: 1200 });
        expect(screen.getByText('+52 jeton kazandın')).toBeInTheDocument();
        expect(screen.queryByTestId('coin-reward-capped')).toBeNull();
    });

    it('coins_capped ve kısmi kazançta fazlasının eklenmediğini söyler', () => {
        renderReward({ coins: 150, balance: 900, capped: true });
        expect(screen.getByText('+150 jeton kazandın')).toBeInTheDocument();
        expect(screen.getByTestId('coin-reward-capped')).toHaveTextContent('fazlası cüzdana eklenmedi');
    });

    it('coins_capped ve 0 jetonda günlük sınır mesajı gösterir (bakiye yoksa da)', () => {
        renderReward({ coins: 0, capped: true });
        expect(screen.getByText('Bu oyunda jeton kazanılmadı')).toBeInTheDocument();
        expect(screen.getByTestId('coin-reward-capped')).toHaveTextContent('Bugünkü jeton sınırına ulaştın');
    });

    it('0 jeton, bakiye yok ve tavan yoksa hiçbir şey çizmez', () => {
        const { container } = renderReward({ coins: 0 });
        expect(container).toBeEmptyDOMElement();
    });
});
