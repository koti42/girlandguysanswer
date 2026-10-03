// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/towerApi', () => ({ towerApi: { finish: vi.fn() } }));
vi.mock('../../../../services/gameApi', () => ({
    gameApi: {},
    gameErrorStatus: (err) => err?.response?.status ?? null,
    gameErrorMessage: (err, fallback) => err?.response?.data?.message || fallback || 'Hata',
}));

import { towerApi } from '../../../../services/towerApi';
import {
    PENDING_TTL_MS,
    STORAGE_KEYS,
    TOWER_RETRY,
    TOWER_SIM_VERSION,
    clearPending,
    finishFailureText,
    finishTowerOnce,
    loadGuestBest,
    loadMusicEnabled,
    loadPending,
    normalizeTowerRun,
    parseAnswerResult,
    perfectWord,
    recordGuestRun,
    sanitizeHud,
    saveMusicEnabled,
    savePending,
    shouldShowTapHint,
    markTapHintLearned,
    HINT_LEARN_FLOOR,
} from '../towerUtils';

const RUN = {
    id: 'r1',
    seed: 5,
    sim_version: 1,
    question_count: 2,
    questions: [
        { index: 1, question: { id: 2, text: 'İkinci', options: ['a', 2] } },
        { index: 0, question: { id: 1, text: 'Birinci', options: ['x', 'y'], category: { name: 'Genel' } } },
    ],
};

describe('towerUtils', () => {
    beforeEach(() => {
        localStorage.clear();
        towerApi.finish.mockReset();
        TOWER_RETRY.finish = [0, 0];
    });

    it('normalizeTowerRun: sıralar, şıkları metne çevirir, bozuk veriyi reddeder', () => {
        const r = normalizeTowerRun(RUN);
        expect(r.id).toBe('r1');
        expect(r.simVersion).toBe(TOWER_SIM_VERSION);
        expect(r.questions.map((q) => q.index)).toEqual([0, 1]);
        expect(r.questions[1].question.options).toEqual(['a', '2']);
        expect(normalizeTowerRun({ ...RUN, question_count: 3 })).toBeNull();
        expect(normalizeTowerRun({ ...RUN, questions: [{ index: 1, question: { text: 'x', options: ['a', 'b'] } }] })).toBeNull();
        expect(normalizeTowerRun({ ...RUN, questions: [{ index: 0, question: { text: 'x', options: ['a', 'b', 'c'] } }], question_count: 1 })).toBeNull();
        expect(normalizeTowerRun({ ...RUN, seed: -1 })).toBeNull();
        expect(normalizeTowerRun({ ...RUN, id: '' })).toBeNull();
        expect(normalizeTowerRun(null)).toBeNull();
        // Sorusuz kule de geçerli (sunucu soru bulamadıysa)
        expect(normalizeTowerRun({ id: 'r2', seed: 0, sim_version: 1, questions: [] })).toMatchObject({ questions: [] });
    });

    it('cevap yanıtı esnek okunur', () => {
        expect(parseAnswerResult({ answer: { correct: true, correct_choice: 1 } })).toEqual({ correct: true, correctChoice: 1, explanation: null });
        expect(parseAnswerResult({ is_correct: false, correctChoice: 0, explanation: ' Açıklama ' })).toEqual({ correct: false, correctChoice: 0, explanation: ' Açıklama ' });
        expect(parseAnswerResult({ answer: { correct: 'evet', correct_choice: 5 } })).toEqual({ correct: false, correctChoice: null, explanation: null });
        expect(parseAnswerResult(null)).toEqual({ correct: false, correctChoice: null, explanation: null });
    });

    it('bekleyen kayıt: kullanıcıya bağlı, süreli, bozuksa silinir', () => {
        savePending({ userId: 'u1', runId: 'r1', endTick: 500, inputs: '10T', clientScore: 3e9 });
        const p = loadPending('u1');
        expect(p).toMatchObject({ run_id: 'r1', end_tick: 500, inputs: '10T', client_score: 2000000000 });
        expect(loadPending('u2')).toBeNull();
        expect(loadPending('u1', Date.now() + PENDING_TTL_MS + 1000)).toBeNull();
        expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
        savePending({ userId: 'u1', runId: 'r1', endTick: 500, inputs: '10T' });
        clearPending('baska');
        expect(loadPending('u1')).not.toBeNull();
        clearPending('r1');
        expect(loadPending('u1')).toBeNull();
        localStorage.setItem(STORAGE_KEYS.pending, '{bozuk');
        expect(loadPending('u1')).toBeNull();
        localStorage.setItem(STORAGE_KEYS.pending, JSON.stringify({ v: 1, run_id: 'x', end_tick: 999999, inputs: '', saved_at: Date.now() }));
        expect(loadPending('u1')).toBeNull();
    });

    it('misafir rekoru skor ve katı ayrı tutar', () => {
        expect(loadGuestBest()).toEqual({ score: 0, floor: 0 });
        expect(recordGuestRun({ score: 100, floor: 10 })).toEqual({ best: { score: 100, floor: 10 }, newBest: true });
        expect(recordGuestRun({ score: 80, floor: 14 })).toEqual({ best: { score: 100, floor: 14 }, newBest: false });
        expect(loadGuestBest()).toEqual({ score: 100, floor: 14 });
    });

    it('müzik varsayılan açık; ipucu 3 kez öğrenilene (3. kata çıkılana) kadar', () => {
        expect(loadMusicEnabled()).toBe(true);
        saveMusicEnabled(false);
        expect(loadMusicEnabled()).toBe(false);
        expect(HINT_LEARN_FLOOR).toBe(3);
        // Eski sayaç (her açılan kulede artan) ipucunu artık gizlemez.
        localStorage.setItem('hs_tower_hint_seen', '9');
        for (let i = 0; i < 3; i++) {
            expect(shouldShowTapHint()).toBe(true);
            markTapHintLearned();
        }
        expect(shouldShowTapHint()).toBe(false);
    });

    it('HUD temizliği kopyalar ve sınırlar', () => {
        const raw = { score: 12.7, floor: -3, combo: 'x', perfect: 4, maxCombo: 9 };
        const h = sanitizeHud(raw);
        expect(h).toEqual({ score: 12, floor: 0, combo: 0, perfect: 4, maxCombo: 9 });
        expect(h).not.toBe(raw);
        expect(sanitizeHud(null).floor).toBe(0);
    });

    it('mükemmel yazısı kombo ile', () => {
        expect(perfectWord(1)).toBe('Mükemmel!');
        expect(perfectWord(3)).toBe('Harika!');
        expect(perfectWord(7)).toBe('İnanılmaz!');
        expect(perfectWord(25)).toBe('Efsane!');
    });

    it('finishTowerOnce aynı kule için tek zincir, ağ hatasında 3 deneme', async () => {
        let resolve;
        towerApi.finish.mockReturnValueOnce(new Promise((r) => (resolve = r)));
        const a = finishTowerOnce('r1', { end_tick: 1, inputs: '' });
        const b = finishTowerOnce('r1', { end_tick: 1, inputs: '' });
        expect(a).toBe(b);
        resolve({ result: { score: 1 } });
        await expect(a).resolves.toEqual({ result: { score: 1 } });

        towerApi.finish.mockReset();
        towerApi.finish.mockRejectedValue(Object.assign(new Error('net'), { response: undefined }));
        await expect(finishTowerOnce('r2', { end_tick: 1, inputs: '' })).rejects.toThrow('net');
        expect(towerApi.finish).toHaveBeenCalledTimes(3);
    });

    it('kalıcı bitiş hatası metinleri', () => {
        expect(finishFailureText({ response: { status: 422 } })).toBe('Kulen doğrulanamadı; bu oyun sayılmadı.');
        expect(finishFailureText({ response: { status: 409 } })).toMatch(/sunucuda kapanmış/);
        expect(finishFailureText({ response: { status: 404 } })).toBe('Bu kule artık kaydedilemiyor.');
        expect(finishFailureText({ response: { status: 422, data: { message: 'Sunucu mesajı' } } })).toBe('Sunucu mesajı');
    });
});
