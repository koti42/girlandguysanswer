// @vitest-environment jsdom
import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import SlotShop from '../SlotShop';
import { PROFILE_3_OF_5, deferred, fakeApi, httpError } from './kesifTestKit';

/** Lobinin yaptığı gibi onChange ile profil/cüzdanı tazeleyen küçük kap. */
const Harness = ({ api, balance = 12000, profile = PROFILE_3_OF_5, onClose = () => {}, spy }) => {
    const [state, setState] = useState({ profile, wallet: { balance } });
    return (
        <MemoryRouter>
            <SlotShop
                open
                api={api}
                profile={state.profile}
                wallet={state.wallet}
                onClose={onClose}
                onChange={(patch) => {
                    spy?.(patch);
                    setState((s) => ({ profile: patch.profile || s.profile, wallet: patch.wallet || s.wallet }));
                }}
            />
        </MemoryRouter>
    );
};

const buyButton = () => screen.getByRole('button', { name: /jetonla satın al/ });

describe('SlotShop', () => {
    let api;
    beforeEach(() => {
        api = fakeApi();
    });

    it('diyalog erişilebilir: role=dialog, aria-modal, başlık, fiyat/paket/sayaç', () => {
        render(<Harness api={api} />);
        const dlg = screen.getByRole('dialog', { name: 'Harita Hakkı Al' });
        expect(dlg).toHaveAttribute('aria-modal', 'true');
        expect(within(dlg).getByText('+5 harita hakkı')).toBeInTheDocument();
        expect(within(dlg).getByText(/3\/5/)).toBeInTheDocument();
        expect(within(dlg).getByText(/→ 3\/10/)).toBeInTheDocument();
        expect(buyButton()).toHaveTextContent('10.000 jetonla satın al');
        expect(buyButton()).toBeEnabled();
    });

    it('yetersiz bakiye: eksik miktar, jeton kazanma bağlantıları, satın alma kapalı, istek yok', () => {
        render(<Harness api={api} balance={4000} />);
        const box = screen.getByTestId('kesif-slot-insufficient');
        expect(box).toHaveTextContent('Yeterli jetonun yok: 6.000 jeton daha lazım.');
        expect(within(box).getByRole('link', { name: 'Herkesler Koşuyor' })).toHaveAttribute('href', '/oyun/kosu');
        expect(within(box).getByRole('link', { name: 'Herkesler Yükseliyor' })).toHaveAttribute('href', '/oyun/kule');
        expect(buyButton()).toBeDisabled();
        fireEvent.click(buyButton());
        expect(api.buySlots).not.toHaveBeenCalled();
    });

    it('bakiye henüz bilinmiyorsa (özet yükleniyor) yanlış "yetersiz" uyarısı çıkmaz, satın alma açık kalır', () => {
        render(
            <MemoryRouter>
                <SlotShop open api={api} profile={PROFILE_3_OF_5} wallet={null} onClose={() => {}} onChange={() => {}} />
            </MemoryRouter>
        );
        expect(screen.queryByTestId('kesif-slot-insufficient')).toBeNull();
        expect(screen.getByLabelText('Bakiye yükleniyor')).toBeInTheDocument();
        expect(buyButton()).toBeEnabled();
    });

    it('başarı: bir istek, kutlama, yeni sayaç ve kalan bakiye; onChange güncel veriyle çağrılır', async () => {
        const spy = vi.fn();
        render(<Harness api={api} spy={spy} />);
        fireEvent.click(buyButton());
        expect(await screen.findByText('+5 harita hakkı eklendi')).toBeInTheDocument();
        expect(api.buySlots).toHaveBeenCalledTimes(1);
        const ok = screen.getByTestId('kesif-slot-success');
        expect(ok).toHaveTextContent('3/10');
        expect(ok).toHaveTextContent('2.000');
        expect(screen.getByRole('dialog', { name: 'Harita hakkı senin!' })).toBeInTheDocument();
        expect(spy).toHaveBeenCalledWith({ profile: expect.objectContaining({ map_slots: 10 }), wallet: { balance: 2000 } });
        expect(screen.getByRole('button', { name: 'Harika!' })).toBeInTheDocument();
    });

    it('çift dokunuş: tek istek (ikinci tıklama yutulur, düğme "Satın alınıyor")', async () => {
        const d = deferred();
        api.buySlots.mockReturnValueOnce(d.promise);
        render(<Harness api={api} />);
        const btn = buyButton();
        fireEvent.click(btn);
        fireEvent.click(btn);
        fireEvent.click(btn);
        expect(api.buySlots).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: /Satın alınıyor/ })).toBeDisabled();
        // satın alma sürerken pencere kapatılamaz
        expect(screen.queryByRole('button', { name: 'Kapat' })).not.toBeInTheDocument();
        d.resolve({ profile: { ...PROFILE_3_OF_5, map_slots: 10 }, wallet: { balance: 2000 }, purchased: 5 });
        expect(await screen.findByText('+5 harita hakkı eklendi')).toBeInTheDocument();
        expect(api.buySlots).toHaveBeenCalledTimes(1);
    });

    it('409 + sunucuda hak artmışsa (ilk istek aslında işlendi): başarı sayılır, ikinci ücret yok', async () => {
        api.buySlots.mockRejectedValueOnce(httpError(409, undefined, 'İşlem şu an yapılamadı, lütfen tekrar dene.'));
        api.overview.mockResolvedValueOnce({ profile: { ...PROFILE_3_OF_5, map_slots: 10, slots_free: 7 }, wallet: { balance: 2000 } });
        render(<Harness api={api} />);
        fireEvent.click(buyButton());
        expect(await screen.findByText('+5 harita hakkı eklendi')).toBeInTheDocument();
        expect(api.buySlots).toHaveBeenCalledTimes(1);
        expect(api.overview).toHaveBeenCalledTimes(1);
    });

    it('409 + hak artmamışsa: açıklayıcı hata, düğme açılır, yeniden deneme çalışır', async () => {
        api.buySlots.mockRejectedValueOnce(httpError(409, undefined, 'x'));
        render(<Harness api={api} />);
        fireEvent.click(buyButton());
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Başka bir işlem sürüyor');
        expect(buyButton()).toBeEnabled();
        fireEvent.click(buyButton());
        expect(await screen.findByText('+5 harita hakkı eklendi')).toBeInTheDocument();
        expect(api.buySlots).toHaveBeenCalledTimes(2);
    });

    it('422 insufficient (ekrandaki bakiye eskiymiş): bakiye sunucuya göre düzelir, yetersiz kutusu açılır', async () => {
        api.buySlots.mockRejectedValueOnce(httpError(422, { reason: 'insufficient', balance: 3000, price: 10000, wallet: { balance: 3000 } }, 'Yeterli jetonun yok.'));
        const spy = vi.fn();
        render(<Harness api={api} spy={spy} />);
        fireEvent.click(buyButton());
        expect(await screen.findByTestId('kesif-slot-insufficient')).toHaveTextContent('7.000 jeton daha lazım');
        expect(spy).toHaveBeenCalledWith({ wallet: { balance: 3000 } });
        expect(buyButton()).toBeDisabled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('422 slot_cap: sunucu mesajı gösterilir', async () => {
        api.buySlots.mockRejectedValueOnce(httpError(422, { reason: 'slot_cap', max_slots: 500 }, 'En fazla 500 harita hakkına sahip olabilirsin.'));
        render(<Harness api={api} />);
        fireEvent.click(buyButton());
        expect(await screen.findByRole('alert')).toHaveTextContent('En fazla 500 harita hakkına');
        expect(buyButton()).toBeEnabled();
    });

    it('ağ hatası ve doğrulama da başarısızsa: ağ metni, tekrar denenebilir', async () => {
        api.buySlots.mockRejectedValueOnce(Object.assign(new Error('net'), { code: 'ECONNABORTED' }));
        api.overview.mockRejectedValueOnce(new Error('net'));
        render(<Harness api={api} />);
        fireEvent.click(buyButton());
        expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya ulaşılamadı');
        await waitFor(() => expect(buyButton()).toBeEnabled());
    });

    it('sunucu fiyatı/paketi (profile.slot_price/slot_pack) arayüze yansır', () => {
        render(<Harness api={api} profile={{ ...PROFILE_3_OF_5, slot_price: 8000, slot_pack: 3 }} />);
        expect(screen.getByText('+3 harita hakkı')).toBeInTheDocument();
        expect(buyButton()).toHaveTextContent('8.000 jetonla satın al');
        expect(screen.getByText(/→ 3\/8/)).toBeInTheDocument();
    });

    it('kapat düğmesi onClose çağırır; Esc de kapatır', () => {
        const onClose = vi.fn();
        render(<Harness api={api} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('open=false iken hiçbir şey çizilmez', () => {
        render(
            <MemoryRouter>
                <SlotShop open={false} api={api} profile={PROFILE_3_OF_5} wallet={{ balance: 99999 }} onClose={() => {}} />
            </MemoryRouter>
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
