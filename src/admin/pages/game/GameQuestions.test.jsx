// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../panel/hooks/useToast';

const api = vi.hoisted(() => ({
    stats: vi.fn(), questions: vi.fn(), createQuestion: vi.fn(), updateQuestion: vi.fn(), deactivateQuestion: vi.fn(),
    categories: vi.fn(), updateCategory: vi.fn(), dilemmas: vi.fn(), createDilemma: vi.fn(), updateDilemma: vi.fn(), deleteDilemma: vi.fn(),
}));
vi.mock('../../gameAdminApi', () => ({ gameAdminApi: api, default: api }));

import GameQuestions from './GameQuestions';
import GameOverview from './GameOverview';

const ok = (data) => Promise.resolve({ data: { success: true, message: '', data } });
const categories = [
    { id: 1, slug: 'tarih', name: 'Tarih', icon: 'landmark', color: '#F59E0B', is_active: true, sort_order: 1 },
    { id: 2, slug: 'bilim', name: 'Bilim', icon: 'flask', color: '#10B981', is_active: true, sort_order: 2 },
];
const q1 = {
    id: 42, text: 'İstanbul hangi yıl fethedildi?', options: ['1453', '1071', '1299', '1923'], correct_index: 0,
    difficulty: 1, explanation: 'Fatih Sultan Mehmet.', category: { id: 1, slug: 'tarih', name: 'Tarih' },
    is_active: true, times_answered: 200, times_correct: 150,
};
const q2 = { id: 43, text: 'Suyun formülü nedir?', options: ['H2O', 'CO2', 'O2', 'NaCl'], correct_index: 0, difficulty: 2, explanation: null, category: 'bilim', is_active: false, times_answered: 0, times_correct: 0 };

const mount = (ui) => render(<MemoryRouter><ToastProvider>{ui}</ToastProvider></MemoryRouter>);

describe('GameQuestions', () => {
    beforeEach(() => {
        Object.values(api).forEach((f) => f.mockReset());
        api.categories.mockImplementation(() => ok({ categories }));
        api.questions.mockImplementation(() => ok({ questions: [q1, q2], pagination: { current_page: 1, last_page: 3, per_page: 20, total: 42 } }));
    });

    it('soru listesini doğruluk oranı, zorluk ve durumla gösterir', async () => {
        mount(<GameQuestions />);
        const rows = await screen.findAllByTestId('table-row');
        expect(rows).toHaveLength(2);
        expect(within(rows[0]).getByText('İstanbul hangi yıl fethedildi?')).toBeInTheDocument();
        expect(within(rows[0]).getByText('%75')).toBeInTheDocument(); // 150 / 200
        expect(within(rows[0]).getByText('Kolay')).toBeInTheDocument();
        expect(within(rows[0]).getByText('Aktif')).toBeInTheDocument();
        expect(within(rows[1]).getByText('Bilim')).toBeInTheDocument(); // slug → ad
        expect(within(rows[1]).getByText('Pasif')).toBeInTheDocument();
        expect(within(rows[1]).getByText('—')).toBeInTheDocument(); // hiç cevaplanmamış
        expect(screen.getByText(/sayfa 1\/3/)).toBeInTheDocument(); // last_page → Pagination
        expect(api.questions).toHaveBeenCalledWith({ search: '', category: '', difficulty: '', is_active: '', page: 1 });
    });

    it('filtre değişince sorguyu ilk sayfadan yeniler', async () => {
        mount(<GameQuestions />);
        await screen.findAllByTestId('table-row');
        fireEvent.click(screen.getByLabelText('Sonraki'));
        await waitFor(() => expect(api.questions).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
        fireEvent.change(screen.getByLabelText('Zorluk'), { target: { value: '3' } });
        await waitFor(() => expect(api.questions).toHaveBeenLastCalledWith(expect.objectContaining({ difficulty: '3', page: 1 })));
    });

    it('düzenleme modalı sözleşmedeki payload ile PUT atar', async () => {
        api.updateQuestion.mockImplementation(() => ok({ question: q1 }));
        mount(<GameQuestions />);
        const rows = await screen.findAllByTestId('table-row');
        fireEvent.click(within(rows[0]).getByText('Düzenle'));

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByTestId('question-text')).toHaveValue('İstanbul hangi yıl fethedildi?');
        expect(within(dialog).getByLabelText('Doğru şık A')).toBeChecked();

        fireEvent.change(within(dialog).getByTestId('question-text'), { target: { value: '  Konstantinopolis hangi yıl fethedildi?  ' } });
        fireEvent.change(within(dialog).getByLabelText('B şıkkı'), { target: { value: '1204' } });
        fireEvent.click(within(dialog).getByLabelText('Doğru şık A'));
        fireEvent.change(within(dialog).getByLabelText('Soru zorluğu'), { target: { value: '2' } });
        fireEvent.change(within(dialog).getByLabelText('Soru kategorisi'), { target: { value: 'bilim' } });
        fireEvent.click(within(dialog).getByRole('switch'));
        fireEvent.click(within(dialog).getByTestId('question-save'));

        await waitFor(() => expect(api.updateQuestion).toHaveBeenCalledTimes(1));
        expect(api.updateQuestion).toHaveBeenCalledWith(42, {
            category: 'bilim',
            text: 'Konstantinopolis hangi yıl fethedildi?',
            options: ['1453', '1204', '1299', '1923'],
            correct_index: 0,
            difficulty: 2,
            explanation: 'Fatih Sultan Mehmet.',
            is_active: false,
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(api.questions).toHaveBeenCalledTimes(2); // kayıttan sonra liste tazelenir
    });

    it('yeni soru: boş şık varsa istek atmaz, doldurulunca POST atar', async () => {
        api.createQuestion.mockImplementation(() => ok({ question: { id: 99 } }));
        mount(<GameQuestions />);
        await screen.findAllByTestId('table-row');
        fireEvent.click(screen.getByText('Yeni soru'));
        const dialog = await screen.findByRole('dialog');

        fireEvent.change(within(dialog).getByTestId('question-text'), { target: { value: 'En büyük gezegen?' } });
        fireEvent.click(within(dialog).getByTestId('question-save'));
        expect(api.createQuestion).not.toHaveBeenCalled();
        expect(within(dialog).getAllByText('Şık boş olamaz.')).toHaveLength(4);

        ['Merkür', 'Jüpiter', 'Mars', 'Venüs'].forEach((v, i) => fireEvent.change(within(dialog).getByLabelText(`${'ABCD'[i]} şıkkı`), { target: { value: v } }));
        fireEvent.click(within(dialog).getByLabelText('Doğru şık B'));
        fireEvent.click(within(dialog).getByTestId('question-save'));

        await waitFor(() => expect(api.createQuestion).toHaveBeenCalledWith({
            category: 'tarih', text: 'En büyük gezegen?', options: ['Merkür', 'Jüpiter', 'Mars', 'Venüs'], correct_index: 1, difficulty: 2, explanation: null,
        }));
    });

    it('sunucu doğrulama hatasını alanın altında gösterir', async () => {
        api.updateQuestion.mockImplementation(() => Promise.reject({ response: { status: 422, data: { message: 'Geçersiz.', errors: { text: ['Bu soru zaten var.'] } } } }));
        mount(<GameQuestions />);
        const rows = await screen.findAllByTestId('table-row');
        fireEvent.click(within(rows[0]).getByText('Düzenle'));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByTestId('question-save'));
        expect(await within(dialog).findByText('Bu soru zaten var.')).toBeInTheDocument();
    });

    it('liste hatasında tekrar dene düğmesi çıkar', async () => {
        api.questions.mockImplementation(() => Promise.reject({ response: { status: 500, data: { success: false, message: 'Sunucu hatası' } } }));
        mount(<GameQuestions />);
        expect(await screen.findByText('Sunucu hatası')).toBeInTheDocument();
        expect(screen.getByText('Tekrar dene')).toBeInTheDocument();
    });
});

describe('GameOverview', () => {
    beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); });

    it('toplamları, kategori tablosunu ve şüpheli oturumları gösterir', async () => {
        api.stats.mockImplementation(() => ok({
            totals: { questions: 1200, active_questions: 1100, dilemmas: 80, sessions: 5400, sessions_today: 37, players: 610, duels: 95 },
            by_category: [{ slug: 'tarih', name: 'Tarih', questions: 120, answered: 900, accuracy: 64 }],
            hardest: [{ id: 5, text: 'Zor soru?', times_answered: 50, times_correct: 5, difficulty: 3 }],
            suspicious: [{ user: { id: 'u1', username: 'hizli' }, session_id: 's-1', avg_time_ms: 640, correct_count: 10 }],
        }));
        mount(<GameOverview />);
        const totals = await screen.findByTestId('game-totals');
        expect(within(totals).getByText('Bugünkü oturum')).toBeInTheDocument();
        expect(within(totals).getByText('37')).toBeInTheDocument();
        expect(screen.getByText('%64')).toBeInTheDocument();
        expect(screen.getByText('Zor soru?')).toBeInTheDocument();
        expect(screen.getByText('%10')).toBeInTheDocument();
        const sus = screen.getByTestId('game-suspicious');
        expect(within(sus).getByText('@hizli')).toBeInTheDocument();
        expect(within(sus).getByText('640 ms ort.')).toBeInTheDocument();
        expect(within(sus).getByText('10 doğru')).toBeInTheDocument();
    });
});
