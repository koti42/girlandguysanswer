// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

/*
 * Mesaj Bileti akışı (F.6): check dalları, onay/gönderim, hatalar; sohbet
 * şeridi + ChatWindow bütünleşmesi; sohbet balonunda via_ticket etiketi.
 */

const auth = { user: { id: 'u1', username: 'ayse', detail: {} }, permissions: {}, isAuthenticated: true };
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../services/shopApi', () => ({
    shopApi: { checkMessageTicket: vi.fn(), sendTicketMessage: vi.fn() },
}));
vi.mock('../../../../services/api', () => ({
    messagesAPI: {
        getMessages: vi.fn(),
        getNickname: vi.fn(),
        markAsRead: vi.fn(),
        sendMessage: vi.fn(),
        sendFile: vi.fn(),
        sendTyping: vi.fn(),
    },
}));
vi.mock('../../../../services/pusherClient', () => ({ subscribeToUserChannel: () => () => {} }));
vi.mock('../../../../utils/notificationToast', () => {
    const fn = vi.fn();
    fn.error = vi.fn();
    fn.success = vi.fn();
    return { notificationToast: fn };
});

import { shopApi } from '../../../../services/shopApi';
import { messagesAPI } from '../../../../services/api';
import MessageTicketDialog from '../MessageTicketDialog';
import MessageTicketBanner from '../MessageTicketBanner';
import MessageBubble from '../../../MessageBubble';
import ChatWindow from '../../../ChatWindow';

const check = (over = {}) => ({
    needs_ticket: true, can_use: true, reason: null, tickets: 2, price: 7500,
    recipient: { username: 'mert', avatar: null }, ...over,
});
const axiosError = (status, data = {}, message = 'Hata') => Object.assign(new Error(message), { response: { status, data: { success: false, message, data } } });

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('MessageTicketDialog', () => {
    beforeEach(() => vi.clearAllMocks());

    it('kullanılabilir: kurallar + metin → gönder → iletildi', async () => {
        shopApi.checkMessageTicket.mockResolvedValue(check());
        shopApi.sendTicketMessage.mockResolvedValue({ message: { id: 'm1' }, conversation_id: 'c1', tickets: 1 });
        const onSent = vi.fn();
        wrap(<MessageTicketDialog open username="mert" onClose={vi.fn()} onSent={onSent} />);
        expect(screen.getByText(/Kurallar kontrol ediliyor/)).toBeInTheDocument();
        const form = await screen.findByTestId('ticket-compose');
        expect(shopApi.checkMessageTicket).toHaveBeenCalledWith('mert');
        expect(within(form).getByText(/ikinci bir mesaj gönderemezsin/)).toBeInTheDocument();
        const send = within(form).getByRole('button', { name: /Bileti kullan ve gönder/ });
        expect(send).toBeDisabled();
        fireEvent.change(within(form).getByLabelText('Mesajın'), { target: { value: '  Merhaba, sorunu çok beğendim!  ' } });
        fireEvent.click(send);
        fireEvent.click(send);
        await waitFor(() => expect(shopApi.sendTicketMessage).toHaveBeenCalledTimes(1));
        expect(shopApi.sendTicketMessage).toHaveBeenCalledWith({ username: 'mert', body: 'Merhaba, sorunu çok beğendim!' });
        expect(await screen.findByTestId('ticket-sent')).toHaveTextContent(/iletildi/);
        expect(screen.getByText(/Kalan biletin: 1/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Sohbete git/ })).toHaveAttribute('href', '/messages/mert');
        expect(onSent).toHaveBeenCalledWith({ message: { id: 'm1' }, conversation_id: 'c1', tickets: 1 });
    });

    it('500 karakteri aşınca gönderim kapalı', async () => {
        shopApi.checkMessageTicket.mockResolvedValue(check());
        wrap(<MessageTicketDialog open username="mert" onClose={vi.fn()} />);
        const form = await screen.findByTestId('ticket-compose');
        fireEvent.change(within(form).getByLabelText('Mesajın'), { target: { value: 'a'.repeat(501) } });
        expect(within(form).getByRole('button', { name: /Bileti kullan/ })).toBeDisabled();
        expect(within(form).getByText('501/500')).toBeInTheDocument();
    });

    it('bilet yok: fiyat + mağaza bağlantısı', async () => {
        shopApi.checkMessageTicket.mockResolvedValue(check({ can_use: false, reason: 'no_ticket', tickets: 0 }));
        wrap(<MessageTicketDialog open username="mert" onClose={vi.fn()} />);
        const box = await screen.findByTestId('ticket-reason-no_ticket');
        expect(box).toHaveTextContent('7.500');
        expect(within(box).getByRole('link', { name: /Mağazadan bilet al/ })).toHaveAttribute(
            'href',
            '/oyun/magaza?kategori=consumable&urun=ticket%3Amessage'
        );
    });

    it('gerekmiyor: doğrudan mesaj bağlantısı', async () => {
        shopApi.checkMessageTicket.mockResolvedValue(check({ needs_ticket: false, can_use: false, reason: 'not_needed' }));
        wrap(<MessageTicketDialog open username="mert" onClose={vi.fn()} />);
        const box = await screen.findByTestId('ticket-reason-not_needed');
        expect(within(box).getByRole('link', { name: /Mesaj gönder/ })).toHaveAttribute('href', '/messages/mert');
    });

    it.each([
        ['blocked', /engelleme/],
        ['recipient_opted_out', /kabul etmiyor/],
        ['already_used', /son 90 gün içinde Mesaj Bileti ile yazdın/],
        ['daily_limit', /günde en fazla 2/],
        ['account_too_new', /7 günlük/],
        ['recipient_unavailable', /ulaşılamıyor/],
    ])('kullanılamaz (%s): açıklama, gönderim yok', async (reason, text) => {
        shopApi.checkMessageTicket.mockResolvedValue(check({ can_use: false, reason }));
        wrap(<MessageTicketDialog open username="mert" onClose={vi.fn()} />);
        const box = await screen.findByTestId(`ticket-reason-${reason}`);
        expect(box).toHaveTextContent(text);
        expect(screen.queryByRole('button', { name: /Bileti kullan/ })).toBeNull();
    });

    it('gönderim hatası neden taşıyorsa ilgili açıklamaya geçer; taşımıyorsa formda kalır', async () => {
        shopApi.checkMessageTicket.mockResolvedValue(check());
        shopApi.sendTicketMessage.mockRejectedValueOnce(axiosError(422, {}, 'Bağlantı paylaşamazsın.'));
        wrap(<MessageTicketDialog open username="mert" onClose={vi.fn()} />);
        const form = await screen.findByTestId('ticket-compose');
        fireEvent.change(within(form).getByLabelText('Mesajın'), { target: { value: 'selam' } });
        fireEvent.click(within(form).getByRole('button', { name: /Bileti kullan/ }));
        expect(await within(form).findByRole('alert')).toHaveTextContent('Bağlantı paylaşamazsın.');

        shopApi.sendTicketMessage.mockRejectedValueOnce(axiosError(422, { reason: 'daily_limit' }, 'Bugünkü hakkın doldu.'));
        fireEvent.click(within(form).getByRole('button', { name: /Bileti kullan/ }));
        const box = await screen.findByTestId('ticket-reason-daily_limit');
        expect(box).toHaveTextContent('Bugünkü hakkın doldu.');
    });

    it('check hatası: Tekrar dene', async () => {
        shopApi.checkMessageTicket.mockRejectedValueOnce(axiosError(500, {}, 'Sunucu hatası')).mockResolvedValueOnce(check());
        wrap(<MessageTicketDialog open username="mert" onClose={vi.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: /Tekrar dene/ }));
        expect(await screen.findByTestId('ticket-compose')).toBeInTheDocument();
    });
});

describe('MessageTicketBanner', () => {
    it('kullanılabilir / bilet yok / gerekmiyor', () => {
        const onUse = vi.fn();
        const { rerender } = wrap(<MessageTicketBanner check={check()} username="mert" onUse={onUse} />);
        fireEvent.click(screen.getByRole('button', { name: /Mesaj Bileti kullan \(2 adet\)/ }));
        expect(onUse).toHaveBeenCalled();
        rerender(<MemoryRouter><MessageTicketBanner check={check({ can_use: false, reason: 'no_ticket' })} username="mert" /></MemoryRouter>);
        expect(screen.getByRole('link', { name: /Mağazadan bilet al/ })).toBeInTheDocument();
        rerender(<MemoryRouter><MessageTicketBanner check={check({ needs_ticket: false })} username="mert" /></MemoryRouter>);
        expect(screen.queryByTestId('ticket-banner')).toBeNull();
    });
});

describe('sohbet balonu via_ticket etiketi', () => {
    const msg = { id: 'm1', content: 'Merhaba', type: 'text', sender_id: 'u2', created_at: new Date().toISOString() };
    it('alıcıda etiket + ne yapabileceği; normal mesajda yok', () => {
        const { rerender } = wrap(<MessageBubble message={{ ...msg, via_ticket: true }} isMine={false} currentUserId="u1" />);
        expect(screen.getByTestId('ticket-badge')).toHaveTextContent('🎟️ Mesaj Bileti ile gönderildi');
        expect(screen.getByText(/şikâyet edebilir ya da engelleyebilirsin/)).toBeInTheDocument();
        rerender(<MemoryRouter><MessageBubble message={{ ...msg, via_ticket: true }} isMine currentUserId="u2" /></MemoryRouter>);
        expect(screen.getByTestId('ticket-badge')).toBeInTheDocument();
        expect(screen.queryByText(/şikâyet edebilir/)).toBeNull();
        rerender(<MemoryRouter><MessageBubble message={msg} isMine={false} currentUserId="u1" /></MemoryRouter>);
        expect(screen.queryByTestId('ticket-badge')).toBeNull();
    });

    it('bilet mesajında Düzenle yok (sunucu 403), Sil kalır; normal mesajda Düzenle var', () => {
        const noop = () => {};
        const { unmount } = wrap(<MessageBubble message={{ ...msg, via_ticket: true }} isMine currentUserId="u2" onEdit={noop} onDelete={noop} />);
        fireEvent.click(screen.getByRole('button', { name: 'Menü' }));
        expect(screen.queryByText('Düzenle')).toBeNull();
        expect(screen.getByText('Sil')).toBeInTheDocument();
        unmount();
        wrap(<MessageBubble message={msg} isMine currentUserId="u2" onEdit={noop} onDelete={noop} />);
        fireEvent.click(screen.getByRole('button', { name: 'Menü' }));
        expect(screen.getByText('Düzenle')).toBeInTheDocument();
    });
});

describe('ChatWindow bilet akışı', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Element.prototype.scrollIntoView = vi.fn();
        Element.prototype.scrollTo = vi.fn();
        messagesAPI.getMessages.mockResolvedValue({ data: { data: { messages: [] } } });
        messagesAPI.getNickname.mockResolvedValue({ data: { data: {} } });
        messagesAPI.markAsRead.mockResolvedValue({});
        messagesAPI.sendTyping.mockResolvedValue({});
    });

    it('yeni sohbette alıcı mesaj almıyorsa şerit → bilet → mesaj eklenir, şerit "zaten kullandın"a geçer', async () => {
        // 1) sohbet açılışı, 2) pencere açılışı → kullanılabilir; sonra "zaten kullandın"
        shopApi.checkMessageTicket
            .mockResolvedValueOnce(check())
            .mockResolvedValueOnce(check())
            .mockResolvedValue(check({ can_use: false, reason: 'already_used', tickets: 1 }));
        shopApi.sendTicketMessage.mockResolvedValue({
            message: { id: 'm9', content: 'Selam!', type: 'text', sender_id: 'u1', created_at: new Date().toISOString() },
            conversation_id: 'c9',
            tickets: 1,
        });
        const onNewMessage = vi.fn();
        const conversation = { id: null, other_user: { id: 'u2', username: 'mert', avatar: null } };
        wrap(<ChatWindow conversation={conversation} onBack={vi.fn()} onNewMessage={onNewMessage} />);

        const banner = await screen.findByTestId('ticket-banner');
        expect(screen.getByPlaceholderText('Mesaj...')).toBeDisabled();
        fireEvent.click(within(banner).getByRole('button', { name: /Mesaj Bileti kullan/ }));
        const form = await screen.findByTestId('ticket-compose');
        fireEvent.change(within(form).getByLabelText('Mesajın'), { target: { value: 'Selam!' } });
        fireEvent.click(within(form).getByRole('button', { name: /Bileti kullan/ }));

        expect(await screen.findByTestId('ticket-sent')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Sohbete git/ })).toBeNull();
        expect(onNewMessage).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'm9' }),
            { id: 'c9', other_user: conversation.other_user }
        );
        fireEvent.click(screen.getByRole('button', { name: 'Tamam' }));
        expect(await screen.findByText(/son 90 gün içinde Mesaj Bileti ile yazdın/)).toBeInTheDocument();
        expect(screen.getAllByTestId('ticket-badge').length).toBeGreaterThan(0);
    });

    it('bilet mesajı yanıtsız mevcut sohbet açılınca "yanıt bekleniyor" şeridi çıkar, yanıt varsa sorulmaz', async () => {
        const mine = { id: 'm1', content: 'Selam', type: 'text', sender_id: 'u1', via_ticket: true, created_at: new Date().toISOString() };
        shopApi.checkMessageTicket.mockResolvedValue(check({ can_use: false, reason: 'already_used', tickets: 0 }));
        messagesAPI.getMessages.mockResolvedValue({ data: { data: { messages: [mine] } } });
        const conversation = { id: 'c2', other_user: { id: 'u2', username: 'mert', avatar: null } };
        const { unmount } = wrap(<ChatWindow conversation={conversation} onBack={vi.fn()} onNewMessage={vi.fn()} />);
        await waitFor(() => expect(shopApi.checkMessageTicket).toHaveBeenCalledWith('mert'));
        expect(await screen.findByText(/son 90 gün içinde Mesaj Bileti ile yazdın/)).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Mesaj...')).toBeDisabled();
        unmount();

        shopApi.checkMessageTicket.mockClear();
        const reply = { ...mine, id: 'm2', sender_id: 'u2', via_ticket: false };
        messagesAPI.getMessages.mockResolvedValue({ data: { data: { messages: [mine, reply] } } });
        wrap(<ChatWindow conversation={{ ...conversation, id: 'c3' }} onBack={vi.fn()} onNewMessage={vi.fn()} />);
        await waitFor(() => expect(messagesAPI.getMessages).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 50));
        expect(shopApi.checkMessageTicket).not.toHaveBeenCalled();
    });

    it('mevcut sohbette gönderim 403 alınca bilet durumu sorulur', async () => {
        shopApi.checkMessageTicket.mockResolvedValue(check({ can_use: false, reason: 'no_ticket', tickets: 0 }));
        messagesAPI.sendMessage.mockRejectedValue(axiosError(403, {}, 'Bu kullanıcı mesaj almıyor.'));
        const conversation = { id: 'c1', other_user: { id: 'u2', username: 'mert', avatar: null } };
        wrap(<ChatWindow conversation={conversation} onBack={vi.fn()} onNewMessage={vi.fn()} />);
        await waitFor(() => expect(messagesAPI.getMessages).toHaveBeenCalled());
        expect(shopApi.checkMessageTicket).not.toHaveBeenCalled();
        const input = screen.getByPlaceholderText('Mesaj...');
        fireEvent.change(input, { target: { value: 'selam' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(messagesAPI.sendMessage).toHaveBeenCalled());
        await waitFor(() => expect(shopApi.checkMessageTicket).toHaveBeenCalledWith('mert'));
        expect(await screen.findByRole('link', { name: /Mağazadan bilet al/ })).toBeInTheDocument();
    });
});
