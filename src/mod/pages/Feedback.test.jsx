// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// vi.mock dosyanın en üstüne taşınır: sahteler vi.hoisted ile tanımlanmalı.
const { api, toast } = vi.hoisted(() => ({
    api: { feedback: vi.fn(), feedbackItem: vi.fn(), resolveFeedback: vi.fn() },
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../panel/api/endpoints', () => ({ modApi: api }));
vi.mock('../../panel/hooks/useToast', () => ({ useToast: () => toast }));

import Feedback from './Feedback';
import { FEEDBACK_CATEGORY_LABELS } from '../../panel/lib/feedback';

const ok = (data, message = '') => Promise.resolve({ data: { success: true, message, data } });

const rows = [
    { id: 'f1', category: 'child_safety', status: 'open', message: 'Bir profilde çocuklara yönelik uygunsuz paylaşım var.', platform: 'android', app_version: '1.1.2', created_at: new Date().toISOString(), user: { id: 'u1', username: 'ayse' }, contact_email: 'ayse@example.com', wants_reply: true },
    { id: 'f2', category: 'bug', status: 'open', message: 'Klavye yorum kutusunu kapatıyor.', platform: 'web', created_at: new Date().toISOString(), user: null, contact_email: null },
];

beforeEach(() => {
    vi.clearAllMocks();
    api.feedback.mockImplementation(() => ok({ items: rows, pagination: { current_page: 1, total_pages: 1, total: rows.length }, counts: { open: 2, child_safety_open: 1 } }));
    api.feedbackItem.mockImplementation((id) => ok({ feedback: rows.find((r) => r.id === id) }));
});

const mount = () => render(<MemoryRouter><Feedback /></MemoryRouter>);

describe('Mod > Geri bildirim kuyruğu', () => {
    it('listeyi çeker, çocuk güvenliği uyarısını ve ilk kaydın detayını gösterir', async () => {
        mount();
        await waitFor(() => expect(screen.getByTestId('feedback-list')).toBeInTheDocument());
        expect(api.feedback).toHaveBeenCalledWith(expect.objectContaining({ status: 'open', page: 1 }));
        expect(screen.getByTestId('child-safety-alert')).toHaveTextContent('1');
        expect(screen.getAllByText(FEEDBACK_CATEGORY_LABELS.child_safety).length).toBeGreaterThan(0);
        await waitFor(() => expect(screen.getByTestId('feedback-message')).toHaveTextContent('çocuklara yönelik'));
        expect(screen.getByText('@ayse')).toBeInTheDocument();
        expect(screen.getByText('ayse@example.com')).toBeInTheDocument();
    });

    it('"İncelemeye al" durumu in_review yapar ve açık filtresinden düşürür', async () => {
        api.resolveFeedback.mockImplementation((id, body) => ok({ feedback: { ...rows[0], status: body.status } }, 'Geri bildirim güncellendi.'));
        mount();
        await waitFor(() => expect(screen.getByTestId('feedback-review')).toBeInTheDocument());
        fireEvent.click(screen.getByTestId('feedback-review'));
        await waitFor(() => expect(api.resolveFeedback).toHaveBeenCalledWith('f1', { status: 'in_review', resolution_notes: undefined }));
        expect(toast.success).toHaveBeenCalledWith('Geri bildirim güncellendi.');
        await waitFor(() => expect(screen.queryByTestId('feedback-row-f1')).toBeNull());
    });

    it('"Çözüldü" notla gönderilir', async () => {
        api.resolveFeedback.mockImplementation((id, body) => ok({ feedback: { ...rows[0], status: 'resolved', resolution_notes: body.resolution_notes } }));
        mount();
        await waitFor(() => expect(screen.getByTestId('feedback-resolve')).toBeInTheDocument());
        fireEvent.click(screen.getByTestId('feedback-resolve'));
        fireEvent.change(screen.getByTestId('feedback-notes'), { target: { value: 'Kullanıcı uyarıldı.' } });
        fireEvent.click(screen.getByTestId('feedback-resolve-submit'));
        await waitFor(() => expect(api.resolveFeedback).toHaveBeenCalledWith('f1', { status: 'resolved', resolution_notes: 'Kullanıcı uyarıldı.' }));
    });
});
