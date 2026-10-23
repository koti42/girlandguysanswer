// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

/**
 * "Mesaj gönderilemedi. Lütfen tekrar deneyin." düzeltmesinin regresyon testleri.
 * Kök neden: POST başarılı (201, mesaj kayıtlı) olduktan sonra çalışan yerel kod (örn. sohbetten
 * çıkılınca null olan conversationRef.current.id) aynı try/catch içindeydi; fırlatınca başarılı
 * gönderim "gönderilemedi" diye raporlanıyor, kullanıcı yeniden yazıp çift mesaj gönderiyordu.
 */

const toastError = vi.fn();
vi.mock('../../utils/notificationToast', () => {
    const fn = vi.fn();
    fn.error = (...a) => toastError(...a);
    fn.success = vi.fn();
    return { notificationToast: fn, default: fn };
});

const messagesAPI = {
    getMessages: vi.fn(),
    markAsRead: vi.fn(),
    getNickname: vi.fn(),
    getNotes: vi.fn(),
    sendMessage: vi.fn(),
    sendFile: vi.fn(),
    sendTyping: vi.fn(),
};
vi.mock('../../services/api', () => ({ messagesAPI }));
vi.mock('../../services/pusherClient', () => ({ subscribeToUserChannel: () => () => {} }));
vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'me-1', username: 'me' }, permissions: {} }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../game/shop/useTicketCheck', () => ({
    default: () => ({ status: 'idle', data: null, error: null, refresh: vi.fn() }),
}));
vi.mock('../game/shop/MessageTicketBanner', () => ({ default: () => null }));
vi.mock('../game/shop/MessageTicketDialog', () => ({ default: () => null }));

const { default: ChatWindow } = await import('../ChatWindow');
const { retryConfig } = await import('../../utils/messageSend');

const conv = {
    id: 'c-1',
    other_user: { id: 'other-1', username: 'karsi' },
    latest_message: null,
};

const ok = (id = 'm-1', content = 'selam') => ({
    data: {
        success: true,
        data: {
            message: { id, conversation_id: 'c-1', sender_id: 'me-1', content, type: 'text', created_at: new Date().toISOString() },
            conversation: { id: 'c-1', other_user: conv.other_user },
        },
    },
});

const httpError = (status, data = {}, headers = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data, headers } });
const networkError = () => Object.assign(new Error('Network Error'), { response: undefined });

async function typeAndSend(text) {
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter' });
}

beforeEach(() => {
    toastError.mockClear();
    retryConfig.delays = [0, 0];
    Object.values(messagesAPI).forEach((f) => f.mockReset());
    messagesAPI.getMessages.mockResolvedValue({ data: { data: { messages: [], has_more: false } } });
    messagesAPI.markAsRead.mockResolvedValue({});
    messagesAPI.getNickname.mockResolvedValue({ data: { data: {} } });
    messagesAPI.getNotes.mockResolvedValue({ data: { data: { notes: [] } } });
    messagesAPI.sendTyping.mockResolvedValue({});
    window.HTMLElement.prototype.scrollTo = vi.fn();
    window.URL.createObjectURL = vi.fn(() => 'blob:x');
});

describe('ChatWindow gönderim: başarılı gönderim asla "gönderilemedi" olmaz', () => {
    it('sunucu 201 döndükten sonra üst bileşen (onNewMessage) hata atsa bile hata toast ı çıkmaz', async () => {
        messagesAPI.sendMessage.mockResolvedValue(ok());
        const onNewMessage = vi.fn(() => { throw new Error('parent boom'); });
        render(<ChatWindow conversation={conv} onBack={() => {}} onNewMessage={onNewMessage} />);
        await typeAndSend('selam');
        await waitFor(() => expect(onNewMessage).toHaveBeenCalled());
        expect(toastError).not.toHaveBeenCalled();
        expect(document.querySelector('[data-send-failed]')).toBeNull();
    });

    it('POST uçuştayken sohbetten çıkılırsa (conversationRef null) 201 sonrası hata toast ı ÇIKMAZ (asıl kök neden)', async () => {
        let resolveSend;
        messagesAPI.sendMessage.mockImplementation(() => new Promise((r) => { resolveSend = r; }));
        const onNewMessage = vi.fn();
        const { rerender } = render(<ChatWindow conversation={conv} onBack={() => {}} onNewMessage={onNewMessage} />);
        await typeAndSend('geri tuşu');
        await waitFor(() => expect(messagesAPI.sendMessage).toHaveBeenCalled());

        // Kullanıcı geri okuna bastı: MessagesPage activeConversation değerini null yapar.
        try { rerender(<ChatWindow conversation={null} onBack={() => {}} onNewMessage={onNewMessage} />); } catch { /* null sohbette render edilmeyebilir */ }

        await act(async () => { resolveSend(ok('m-9', 'geri tuşu')); });
        await new Promise((r) => setTimeout(r, 20));
        expect(toastError).not.toHaveBeenCalled();
        expect(onNewMessage).toHaveBeenCalledTimes(1);
    });

    it('gönderim sürerken bileşen kaldırılırsa (unmount) da hata toast ı çıkmaz', async () => {
        let resolveSend;
        messagesAPI.sendMessage.mockImplementation(() => new Promise((r) => { resolveSend = r; }));
        const { unmount } = render(<ChatWindow conversation={conv} onBack={() => {}} onNewMessage={() => {}} />);
        await typeAndSend('uçuşta');
        await waitFor(() => expect(messagesAPI.sendMessage).toHaveBeenCalled());
        unmount();
        await act(async () => { resolveSend(ok('m-8', 'uçuşta')); });
        await new Promise((r) => setTimeout(r, 20));
        expect(toastError).not.toHaveBeenCalled();
    });

    it('gönderilirken balon "Gönderiliyor…" gösterir, başarılı olunca kalkar', async () => {
        let resolveSend;
        messagesAPI.sendMessage.mockImplementation(() => new Promise((r) => { resolveSend = r; }));
        render(<ChatWindow conversation={conv} onBack={() => {}} onNewMessage={() => {}} />);
        await typeAndSend('merhaba');
        await waitFor(() => expect(document.querySelector('[data-sending]')).not.toBeNull());
        await act(async () => { resolveSend(ok('m-2', 'merhaba')); });
        await waitFor(() => expect(document.querySelector('[data-sending]')).toBeNull());
        expect(document.querySelector('[data-send-failed]')).toBeNull();
    });
});

describe('ChatWindow gönderim: hata eşlemesi ve tekrar dene', () => {
    it('ağ hatası: önce otomatik yeniden dener (aynı kimlik), sonra "Gönderilemedi — Tekrar dene" gösterir', async () => {
        messagesAPI.sendMessage.mockRejectedValue(networkError());
        render(<ChatWindow conversation={conv} onBack={() => {}} onNewMessage={() => {}} />);
        await typeAndSend('merhaba');
        await waitFor(() => expect(toastError).toHaveBeenCalled());
        expect(messagesAPI.sendMessage).toHaveBeenCalledTimes(3); // 1 + 2 otomatik deneme
        const ids = new Set(messagesAPI.sendMessage.mock.calls.map((c) => c[0].client_temp_id));
        expect(ids.size).toBe(1); // hep AYNI mesaj kimliği
        expect(toastError.mock.calls[0][0]).toMatch(/Sunucuya ulaşılamadı|İnternet bağlantın/);
        expect(screen.getByText('merhaba')).toBeInTheDocument();
        expect(document.querySelector('[data-send-failed]')).not.toBeNull();
        expect(screen.getByRole('button', { name: /Tekrar dene/ })).toBeInTheDocument();
    });

    it('"Tekrar dene" aynı client_temp_id ile gönderir ve başarılı olunca işareti kaldırır (çift balon yok)', async () => {
        messagesAPI.sendMessage.mockRejectedValue(httpError(500, { message: 'Failed to send message: boom' }));
        render(<ChatWindow conversation={conv} onBack={() => {}} onNewMessage={() => {}} />);
        await typeAndSend('merhaba');
        await waitFor(() => expect(document.querySelector('[data-send-failed]')).not.toBeNull());
        const firstId = messagesAPI.sendMessage.mock.calls[0][0].client_temp_id;
        expect(toastError.mock.calls[0][0]).not.toMatch(/Failed to send/); // teknik metin sızmaz

        messagesAPI.sendMessage.mockResolvedValueOnce(ok('m-5', 'merhaba'));
        fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/ }));
        await waitFor(() => expect(document.querySelector('[data-send-failed]')).toBeNull());
        const last = messagesAPI.sendMessage.mock.calls.at(-1)[0];
        expect(last.client_temp_id).toBe(firstId);
        expect(screen.getAllByText('merhaba')).toHaveLength(1);
    });

    it('aynı metni art arda göndermek iki AYRI kimlikle iki ayrı mesaj olarak gider', async () => {
        messagesAPI.sendMessage.mockResolvedValueOnce(ok('m-a', 'aynı')).mockResolvedValueOnce(ok('m-b', 'aynı'));
        render(<ChatWindow conversation={conv} onBack={() => {}} onNewMessage={() => {}} />);
        await typeAndSend('aynı');
        await waitFor(() => expect(messagesAPI.sendMessage).toHaveBeenCalledTimes(1));
        await typeAndSend('aynı');
        await waitFor(() => expect(messagesAPI.sendMessage).toHaveBeenCalledTimes(2));
        const [a, b] = messagesAPI.sendMessage.mock.calls.map((c) => c[0].client_temp_id);
        expect(a).not.toBe(b);
        await waitFor(() => expect(screen.getAllByText('aynı')).toHaveLength(2));
    });

    it('durum kodları farklı, doğru metinlerle gösterilir (429, 401, 403, 413, 504, 408)', async () => {
        const cases = [
            { err: httpError(429, { message: 'Too Many Attempts.' }), re: /Çok hızlı/, keep: true },
            { err: httpError(401, { message: 'Unauthenticated.' }), re: /Oturumun sona/, keep: true },
            { err: httpError(403, { message: 'Bu kullanıcı mesaj almıyor.' }), re: /Bu kullanıcı mesaj almıyor\./, keep: false },
            { err: httpError(413, { message: '' }), re: /çok büyük/, keep: false },
            { err: httpError(504, '<html>504 Gateway Time-out</html>'), re: /ulaşılamıyor/, keep: true },
            { err: httpError(408, { error: 'Request timeout' }), re: /zaman aşımı/i, keep: true },
        ];
        for (const c of cases) {
            toastError.mockClear();
            messagesAPI.sendMessage.mockReset();
            messagesAPI.sendMessage.mockRejectedValue(c.err);
            const { unmount } = render(<ChatWindow conversation={conv} onBack={() => {}} onNewMessage={() => {}} />);
            await typeAndSend('deneme');
            await waitFor(() => expect(toastError).toHaveBeenCalled());
            expect(toastError.mock.calls[0][0]).toMatch(c.re);
            expect(toastError.mock.calls[0][0]).not.toBe('Mesaj gönderilemedi. Lütfen tekrar deneyin.');
            await waitFor(() => expect(!!document.querySelector('[data-send-failed]')).toBe(c.keep));
            unmount();
        }
    });

    it('2xx ama mesaj içermeyen yanıt (güvenlik duvarı sayfası) başarı sayılmaz: tekrar dene sunulur', async () => {
        messagesAPI.sendMessage.mockResolvedValue({ data: '<html>challenge</html>' });
        render(<ChatWindow conversation={conv} onBack={() => {}} onNewMessage={() => {}} />);
        await typeAndSend('merhaba');
        await waitFor(() => expect(toastError).toHaveBeenCalled());
        expect(document.querySelector('[data-send-failed]')).not.toBeNull();
    });

    it('yeni sohbette (id yok) art arda iki gönderim sıraya girer: ikinci istek birincinin bitmesini bekler', async () => {
        let resolveFirst;
        messagesAPI.sendMessage
            .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
            .mockResolvedValueOnce(ok('m-2', 'iki'));
        const fresh = { id: null, other_user: conv.other_user, latest_message: null };
        render(<ChatWindow conversation={fresh} onBack={() => {}} onNewMessage={() => {}} />);
        await typeAndSend('bir');
        await typeAndSend('iki');
        await new Promise((r) => setTimeout(r, 20));
        expect(messagesAPI.sendMessage).toHaveBeenCalledTimes(1);
        await act(async () => { resolveFirst(ok('m-1', 'bir')); });
        await waitFor(() => expect(messagesAPI.sendMessage).toHaveBeenCalledTimes(2));
    });
});
