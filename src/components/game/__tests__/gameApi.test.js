// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/api', () => {
    const ok = () => Promise.resolve({ data: { data: { ok: true } } });
    return { default: { get: vi.fn(ok), post: vi.fn(ok) } };
});

import api from '../../../services/api';
import { gameApi } from '../../../services/gameApi';

describe('gameApi koşu uçları', () => {
    beforeEach(() => vi.clearAllMocks());

    it('her koşu isteği zaman aşımıyla gider (takılan bağlantı ekranı kilitlemesin)', async () => {
        await gameApi.startRunner();
        await gameApi.runnerGate('r1', { gate: 0, lane: 2 });
        await gameApi.finishRunner('r1', { end_tick: 10, inputs: '', client_score: 5 });
        await gameApi.abandonRunner('r1');
        await gameApi.runnerOverview();
        await gameApi.runnerLeaderboard();
        const timeouts = [...api.post.mock.calls.map((c) => c[2]?.timeout), ...api.get.mock.calls.map((c) => c[1]?.timeout)];
        expect(timeouts).toEqual([15000, 8000, 20000, 10000, 15000, 15000]);
        // Taze Idempotency-Key korunuyor.
        api.post.mock.calls.forEach((c) => expect(c[2].headers['Idempotency-Key']).toBeTruthy());
    });

    it('kapı: gövdede yalnızca gate ve lane gider (mola bayrağı yok)', async () => {
        await gameApi.runnerGate('r1', { gate: 1, lane: 0 });
        await gameApi.runnerGate('r1', { gate: 2, lane: 1, paused: true });
        expect(api.post.mock.calls[0][1]).toEqual({ gate: 1, lane: 0 });
        expect(api.post.mock.calls[1][1]).toEqual({ gate: 2, lane: 1 });
    });
});
