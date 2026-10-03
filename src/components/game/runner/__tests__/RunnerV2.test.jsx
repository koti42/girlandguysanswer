// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('react-confetti', () => ({ default: () => null }));

import RunnerHud from '../RunnerHud';
import RunnerResult from '../RunnerResult';
import RunnerHowTo from '../RunnerHowTo';
import { createHudStore, sanitizeHud } from '../hudStore';
import { RUNNER_SIM_VERSION, SAFE_AREA_PAD } from '../runnerUtils';
import { SIM_VERSION } from '../../../../game/runner/sim/constants.js';

describe('Koşu 2.0 arayüzü', () => {
    it('istemci sürümü sim ile aynı kaynaktan (v2)', () => {
        expect(RUNNER_SIM_VERSION).toBe(SIM_VERSION);
        expect(RUNNER_SIM_VERSION).toBe(3);
    });

    it('HUD: Süper Zıplama göstergesi kalan süreyle görünür, bitince kalkar', () => {
        expect(sanitizeHud({ superPct: 140 }).superPct).toBe(100);
        expect(sanitizeHud({ superPct: 'x' }).superPct).toBe(0);
        expect(sanitizeHud({}).superPct).toBe(0);

        const store = createHudStore();
        render(<RunnerHud store={store} muted={false} onToggleMute={() => {}} onPause={() => {}} />);
        expect(screen.queryByTestId('runner-super')).toBeNull();
        act(() => store.set(sanitizeHud({ superPct: 64.4 })));
        expect(screen.getByTestId('runner-super')).toHaveTextContent('Süper Zıplama %64');
        expect(screen.getByTestId('runner-super').className).not.toContain('animate-pulse');
        act(() => store.set(sanitizeHud({ superPct: 15 })));
        expect(screen.getByTestId('runner-super').className).toContain('motion-safe:animate-pulse');
        act(() => store.set(sanitizeHud({ superPct: 0, magnetPct: 30 })));
        expect(screen.queryByTestId('runner-super')).toBeNull();
        expect(screen.getByText('Mıknatıs %30')).toBeInTheDocument();
    });

    it('güvenli alan: native değişkeni yoksa env()', () => {
        expect(SAFE_AREA_PAD).toContain('var(--hs-safe-top,env(safe-area-inset-top))');
        expect(SAFE_AREA_PAD).toContain('var(--hs-safe-bottom,env(safe-area-inset-bottom))');
    });

    it('sonuç (gömme): paylaş yok, çıkış metni özel, misafir çağrısı onLogin butonu (Router gerekmez)', () => {
        const onLogin = vi.fn();
        const onLobby = vi.fn();
        render(
            <RunnerResult
                result={{ practice: true, score: 500, distance_m: 200, coins: 3, best_score: 500, best_distance: 200 }}
                onAgain={() => {}}
                onLobby={onLobby}
                lobbyLabel="Oyundan çık"
                share={false}
                onLogin={onLogin}
                guest
            />
        );
        expect(screen.queryByRole('button', { name: /Paylaş/ })).toBeNull();
        expect(screen.queryByRole('link')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Giriş yap/ }));
        expect(onLogin).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Oyundan çık/ }));
        expect(onLobby).toHaveBeenCalled();
    });

    it('nasıl oynanır: araç çatıları ve Süper Zıplama anlatılır', () => {
        render(<RunnerHowTo ranked={false} />);
        expect(screen.getByText(/Araçların çatısında koşabilirsin/)).toBeInTheDocument();
        expect(screen.getByText(/Süper Zıplama/)).toBeInTheDocument();
    });
});
