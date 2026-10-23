// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-hot-toast', () => {
    const toast = vi.fn();
    toast.error = vi.fn();
    toast.success = vi.fn();
    return { default: toast };
});

import toast from 'react-hot-toast';
import MyMaps from '../MyMaps';
import { MINE_HIDDEN, MINE_PRIVATE, MINE_PUBLIC, PROFILE_3_OF_5, fakeApi, httpError } from './kesifTestKit';

const renderMine = (props = {}) => {
    const api = props.api || fakeApi();
    const handlers = { onProfile: vi.fn(), onBuySlots: vi.fn(), onEdit: vi.fn(), onPlay: vi.fn(), onBuild: vi.fn() };
    const utils = render(
        <MemoryRouter>
            <MyMaps api={api} member profile={PROFILE_3_OF_5} {...handlers} {...props} />
        </MemoryRouter>
    );
    return { api, ...handlers, ...utils };
};

const cardOf = (title) => screen.getByRole('article', { name: title });

describe('MyMaps', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('misafir: giriş çağrısı, istek yok', () => {
        const api = fakeApi();
        render(
            <MemoryRouter>
                <MyMaps api={api} member={false} />
            </MemoryRouter>
        );
        expect(screen.getByTestId('kesif-mymaps-guest')).toHaveTextContent('Haritalarını kaydetmek için giriş yap');
        expect(api.mine).not.toHaveBeenCalled();
    });

    it('hak sayacı "3/5" gösterir (ekran okuyucu metniyle), liste yüklenince profili üst bileşene bildirir', async () => {
        const { onProfile } = renderMine();
        expect(screen.getByTestId('kesif-slot-label')).toHaveTextContent('3/5');
        expect(screen.getByTestId('kesif-slot-label')).toHaveAttribute('aria-label', '5 haktan 3 tanesi dolu, 2 boş hak');
        expect(screen.getByText('2 boş hakkın var; yeni bir dünya yapıp kaydedebilirsin.')).toBeInTheDocument();
        await screen.findByText('Evim');
        expect(onProfile).toHaveBeenCalledWith(PROFILE_3_OF_5);
    });

    it('hak yokken ve doluyken açıklayıcı metin; "Harita hakkı al" onBuySlots çağırır', async () => {
        const { onBuySlots, rerender, api } = renderMine({ profile: { map_slots: 0, maps_used: 0 } });
        expect(screen.getByText(/Henüz harita hakkın yok/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Harita hakkı al/ }));
        expect(onBuySlots).toHaveBeenCalledTimes(1);
        rerender(
            <MemoryRouter>
                <MyMaps api={api} member profile={{ map_slots: 5, maps_used: 5 }} onBuySlots={onBuySlots} />
            </MemoryRouter>
        );
        expect(screen.getByText(/Boş hakkın kalmadı/)).toBeInTheDocument();
        await screen.findByText('Evim');
    });

    it('durum etiketleri ve duruma göre eylemler (özel/yayında/incelemede)', async () => {
        renderMine();
        await screen.findByText('Evim');

        const priv = cardOf('Evim');
        expect(within(priv).getByText('Özel')).toBeInTheDocument();
        expect(within(priv).getByRole('button', { name: 'Yayınla: Evim' })).toBeInTheDocument();
        expect(within(priv).queryByRole('button', { name: /Yayından kaldır/ })).not.toBeInTheDocument();

        const pub = cardOf('Açık Harita');
        expect(within(pub).getByText('Yayında')).toBeInTheDocument();
        expect(within(pub).getByRole('button', { name: 'Yayından kaldır: Açık Harita' })).toBeInTheDocument();
        expect(within(pub).queryByRole('button', { name: /^Yayınla/ })).not.toBeInTheDocument();

        const hidden = cardOf('İncelenen');
        expect(within(hidden).getByText('Gizlendi (inceleniyor)')).toBeInTheDocument();
        expect(within(hidden).getByText(/ekibimiz inceliyor/)).toBeInTheDocument();
        expect(within(hidden).queryByRole('button', { name: /^Yayınla/ })).not.toBeInTheDocument();
        expect(within(hidden).queryByRole('button', { name: /Yayından kaldır/ })).not.toBeInTheDocument();
        expect(within(hidden).getByRole('button', { name: 'Sil: İncelenen' })).toBeInTheDocument();
    });

    it('moderasyonla kaldırılan harita yalnızca silinebilir', async () => {
        const api = fakeApi({ mine: vi.fn(() => Promise.resolve({ maps: [{ ...MINE_HIDDEN, status: 'removed', title: 'Kaldırılan' }], profile: PROFILE_3_OF_5 })) });
        renderMine({ api });
        await screen.findByText('Kaldırılan');
        const c = cardOf('Kaldırılan');
        expect(within(c).getByText('Kaldırıldı')).toBeInTheDocument();
        expect(within(c).getByText(/kimse göremez/)).toBeInTheDocument();
        expect(within(c).queryByRole('button', { name: /^Oyna/ })).not.toBeInTheDocument();
        expect(within(c).queryByRole('button', { name: /Düzenle/ })).not.toBeInTheDocument();
        expect(within(c).getByRole('button', { name: 'Sil: Kaldırılan' })).toBeInTheDocument();
    });

    it('Oyna ve Düzenle üst bileşene harita nesnesini verir', async () => {
        const { onPlay, onEdit } = renderMine();
        await screen.findByText('Evim');
        fireEvent.click(within(cardOf('Evim')).getByRole('button', { name: 'Oyna: Evim' }));
        expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: 'mine-1' }));
        fireEvent.click(within(cardOf('Evim')).getByRole('button', { name: 'İnşa modunda düzenle: Evim' }));
        expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'mine-1' }));
    });

    it('silme: önce onay penceresi (vazgeç hiçbir şey yapmaz), onaylayınca kart kalkar ve profil güncellenir', async () => {
        const { api, onProfile } = renderMine();
        await screen.findByText('Evim');
        fireEvent.click(screen.getByRole('button', { name: 'Sil: Evim' }));
        const dlg = screen.getByRole('dialog', { name: 'Haritayı sil' });
        expect(dlg).toHaveTextContent('Evim');
        expect(dlg).toHaveTextContent('geri alınamaz');

        fireEvent.click(within(dlg).getByRole('button', { name: 'Vazgeç' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(api.deleteMap).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Sil: Evim' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Evet, sil' }));
        await waitFor(() => expect(screen.queryByText('Evim')).not.toBeInTheDocument());
        expect(api.deleteMap).toHaveBeenCalledWith('mine-1');
        expect(onProfile).toHaveBeenLastCalledWith(expect.objectContaining({ maps_used: 2, slots_free: 3 }));
        expect(toast.success).toHaveBeenCalled();
    });

    it('silme hatasında kart kalır, toast gösterilir', async () => {
        const api = fakeApi({ deleteMap: vi.fn(() => Promise.reject(httpError(403, undefined, 'Bu harita sana ait değil.'))) });
        renderMine({ api });
        await screen.findByText('Evim');
        fireEvent.click(screen.getByRole('button', { name: 'Sil: Evim' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Evet, sil' }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Bu harita sana ait değil.'));
        expect(cardOf('Evim')).toBeInTheDocument();
    });

    it('yayından kaldır: istek, etiket "Özel" olur', async () => {
        const { api } = renderMine();
        await screen.findByText('Açık Harita');
        fireEvent.click(screen.getByRole('button', { name: 'Yayından kaldır: Açık Harita' }));
        await waitFor(() => expect(within(cardOf('Açık Harita')).getByText('Özel')).toBeInTheDocument());
        expect(api.unpublish).toHaveBeenCalledWith('mine-2');
    });

    it('yayınla: başlık/açıklama + güvenlik onayı gerekir, sonra publish', async () => {
        const { api } = renderMine();
        await screen.findByText('Evim');
        fireEvent.click(screen.getByRole('button', { name: 'Yayınla: Evim' }));
        const dlg = screen.getByRole('dialog', { name: 'Haritayı yayınla' });
        const submit = within(dlg).getByRole('button', { name: 'Yayınla' });
        expect(submit).toBeDisabled();
        fireEvent.click(within(dlg).getByRole('checkbox'));
        expect(submit).toBeEnabled();
        fireEvent.click(submit);
        await waitFor(() => expect(within(cardOf('Evim')).getByText('Yayında')).toBeInTheDocument());
        expect(api.publish).toHaveBeenCalledWith('mine-1');
        // başlık değişmediği için updateMap çağrılmaz
        expect(api.updateMap).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('yayınlarken başlık değiştiyse önce updateMap sonra publish', async () => {
        const api = fakeApi({
            updateMap: vi.fn((id, body) => Promise.resolve({ map: { ...MINE_PRIVATE, id, title: body.title, description: body.description } })),
            // Sunucu yayın yanıtı güncel başlığı taşır.
            publish: vi.fn((id) => Promise.resolve({ map: { ...MINE_PRIVATE, id, title: 'Yeni Evim', visibility: 'public' } })),
        });
        renderMine({ api });
        await screen.findByText('Evim');
        fireEvent.click(screen.getByRole('button', { name: 'Yayınla: Evim' }));
        const dlg = screen.getByRole('dialog');
        fireEvent.change(within(dlg).getByLabelText('Başlık'), { target: { value: 'Yeni Evim' } });
        fireEvent.change(within(dlg).getByLabelText(/Açıklama/), { target: { value: '' } });
        fireEvent.click(within(dlg).getByRole('checkbox'));
        fireEvent.click(within(dlg).getByRole('button', { name: 'Yayınla' }));
        await waitFor(() => expect(api.publish).toHaveBeenCalled());
        expect(api.updateMap).toHaveBeenCalledWith('mine-1', { title: 'Yeni Evim', description: null });
        expect(api.updateMap.mock.invocationCallOrder[0]).toBeLessThan(api.publish.mock.invocationCallOrder[0]);
        await screen.findByRole('article', { name: 'Yeni Evim' });
    });

    it('yayın başlığı süzgeçten dönerse (text_blocked) hata alanın altında, pencere açık kalır', async () => {
        const api = fakeApi({ updateMap: vi.fn(() => Promise.reject(httpError(422, { reason: 'text_blocked', field: 'title' }, 'Başlık uygun değil.'))) });
        renderMine({ api });
        await screen.findByText('Evim');
        fireEvent.click(screen.getByRole('button', { name: 'Yayınla: Evim' }));
        const dlg = screen.getByRole('dialog');
        fireEvent.change(within(dlg).getByLabelText('Başlık'), { target: { value: 'kötü ad' } });
        fireEvent.click(within(dlg).getByRole('checkbox'));
        fireEvent.click(within(dlg).getByRole('button', { name: 'Yayınla' }));
        const err = await within(dlg).findByRole('alert');
        expect(err).toHaveTextContent('Başlıkta uygun olmayan bir ifade var');
        expect(within(dlg).getByLabelText('Başlık')).toHaveAttribute('aria-invalid', 'true');
        expect(api.publish).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('başlık çok kısaysa gönderilmez', async () => {
        const { api } = renderMine();
        await screen.findByText('Evim');
        fireEvent.click(screen.getByRole('button', { name: 'Ad ve açıklamayı değiştir: Evim' }));
        const dlg = screen.getByRole('dialog', { name: 'Harita bilgileri' });
        fireEvent.change(within(dlg).getByLabelText('Başlık'), { target: { value: 'a' } });
        expect(within(dlg).getByRole('button', { name: 'Kaydet' })).toBeDisabled();
        fireEvent.submit(within(dlg).getByRole('button', { name: 'Kaydet' }).closest('form'));
        expect(await within(dlg).findByRole('alert')).toHaveTextContent('Başlık 2-60 karakter olmalı.');
        expect(api.updateMap).not.toHaveBeenCalled();
    });

    it('bilgi düzenleme: yayın durumuna dokunmadan updateMap', async () => {
        const api = fakeApi({ updateMap: vi.fn((id, b) => Promise.resolve({ map: { ...MINE_PUBLIC, id, title: b.title } })) });
        renderMine({ api });
        await screen.findByText('Açık Harita');
        fireEvent.click(screen.getByRole('button', { name: 'Ad ve açıklamayı değiştir: Açık Harita' }));
        const dlg = screen.getByRole('dialog');
        fireEvent.change(within(dlg).getByLabelText('Başlık'), { target: { value: 'Yeni Ad' } });
        fireEvent.click(within(dlg).getByRole('button', { name: 'Kaydet' }));
        await screen.findByRole('article', { name: 'Yeni Ad' });
        expect(api.updateMap).toHaveBeenCalledWith('mine-2', { title: 'Yeni Ad', description: 'Dereli bir vadi.' });
        expect(api.publish).not.toHaveBeenCalled();
    });

    it('boş liste: yönlendirme ve İnşa Modu düğmesi', async () => {
        const api = fakeApi({ mine: vi.fn(() => Promise.resolve({ maps: [], profile: { ...PROFILE_3_OF_5, maps_used: 0 } })) });
        const { onBuild } = renderMine({ api });
        expect(await screen.findByText('Henüz haritan yok')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /İnşa Modu'na git/ }));
        expect(onBuild).toHaveBeenCalled();
    });

    it('yükleme hatası: tekrar dene', async () => {
        const api = fakeApi({ mine: vi.fn().mockRejectedValueOnce(httpError(500)).mockResolvedValue({ maps: [MINE_PRIVATE], profile: PROFILE_3_OF_5 }) });
        renderMine({ api });
        expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuda bir sorun oluştu');
        fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/ }));
        expect(await screen.findByText('Evim')).toBeInTheDocument();
    });
});
