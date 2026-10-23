// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = { isAuthenticated: false, user: null, loading: false };
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('react-hot-toast', () => {
    const toast = vi.fn();
    toast.error = vi.fn();
    toast.success = vi.fn();
    return { default: toast };
});

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useNavigate: () => navigate };
});

// jsdom WebGL vermez; lobi testleri "destekli tarayıcı"yı varsayar (yoksa testi ayrıca aşağıda).
const webgl = { ok: true };
vi.mock('../../../../components/game/kesif/kesifUtils', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, detectWebGL: () => webgl.ok };
});

import KesifLobbyPage from '../KesifLobbyPage';
import { MAP_A, MINE_PRIVATE, PROFILE_3_OF_5, fakeApi } from '../../../../components/game/kesif/__tests__/kesifTestKit';

const renderLobby = ({ api = fakeApi(), saves = [], url = '/oyun/kesif' } = {}) => {
    const loadSaves = vi.fn(() => Promise.resolve(saves));
    const utils = render(
        <MemoryRouter initialEntries={[url]}>
            <KesifLobbyPage api={api} loadSaves={loadSaves} />
        </MemoryRouter>
    );
    return { api, loadSaves, ...utils };
};

const member = () => Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ben', gender: 'male' }, loading: false });
const lastEntry = () => navigate.mock.calls[navigate.mock.calls.length - 1][1].state.entry;

describe('KesifLobbyPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        webgl.ok = true;
        Object.assign(auth, { isAuthenticated: false, user: null, loading: false });
        Element.prototype.scrollIntoView = vi.fn();
    });

    describe('misafir', () => {
        it('kahraman, bölümler ve giriş çağrıları görünür; üyelik uçlarına istek atılmaz', async () => {
            const { api } = renderLobby();
            expect(screen.getByRole('heading', { level: 1, name: 'Herkesler Keşfediyor' })).toBeInTheDocument();
            for (const name of ['Yeni Macera', 'Devam Et', 'İnşa Modu', 'Topluluk Haritaları', 'Haritalarım', 'Nasıl oynanır?']) {
                expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
            }
            expect(screen.getByTestId('kesif-browser-guest')).toBeInTheDocument();
            expect(screen.getByTestId('kesif-mymaps-guest')).toBeInTheDocument();
            expect(screen.getAllByRole('link', { name: /giriş yap/i }).length).toBeGreaterThan(1);
            await waitFor(() => expect(screen.queryByText(/Henüz kayıtlı macera yok/)).toBeInTheDocument());
            expect(api.overview).not.toHaveBeenCalled();
            expect(api.maps).not.toHaveBeenCalled();
            expect(api.mine).not.toHaveBeenCalled();
            // misafirde cüzdan/hak çipi yok
            expect(screen.queryByLabelText(/^Cüzdan/)).not.toBeInTheDocument();
        });

        it('Maceraya Başla: Dünya Koduyla macera girişi oluşturur (girişsiz serbest)', () => {
            renderLobby();
            const code = screen.getByLabelText('Dünya Kodu').value;
            expect(code).toMatch(/^[0-9A-Z]{8}$/);
            fireEvent.click(screen.getByRole('button', { name: /Maceraya Başla/ }));
            expect(navigate).toHaveBeenCalledWith('/oyun/kesif/oyna', { state: { entry: { mode: 'macera', seed: code, mapId: null, saveId: null, base: null } } });
        });

        it('kodu düzenleyince o kodla başlar; geçersiz kodla başlanmaz', () => {
            renderLobby();
            const input = screen.getByLabelText('Dünya Kodu');
            fireEvent.change(input, { target: { value: 'k3f9a2xq' } });
            expect(input.value).toBe('K3F9A2XQ');
            fireEvent.click(screen.getAllByRole('button', { name: /Maceraya başla/i })[1]);
            expect(lastEntry().seed).toBe('K3F9A2XQ');

            navigate.mockClear();
            fireEvent.change(input, { target: { value: 'abc' } });
            expect(screen.getByText(/8 harf ya da rakamdan/)).toBeInTheDocument();
            expect(input).toHaveAttribute('aria-invalid', 'true');
            fireEvent.click(screen.getAllByRole('button', { name: /Maceraya başla/i })[1]);
            expect(screen.getAllByRole('button', { name: /Maceraya başla/i })[1]).toBeDisabled();
            expect(navigate).not.toHaveBeenCalled();
        });

        it('Yeni kod yeni rastgele kod üretir; kopyala panoya yazar', async () => {
            const writeText = vi.fn(() => Promise.resolve());
            Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
            renderLobby();
            const input = screen.getByLabelText('Dünya Kodu');
            const first = input.value;
            fireEvent.click(screen.getByRole('button', { name: 'Yeni rastgele kod üret' }));
            expect(input.value).not.toBe(first);
            fireEvent.click(screen.getByRole('button', { name: 'Dünya Kodunu kopyala' }));
            await waitFor(() => expect(writeText).toHaveBeenCalledWith(input.value));
            expect(await screen.findByText('Kopyalandı')).toBeInTheDocument();
        });

        it('İnşa Modu: zemini seçip başlatınca insa girişi (base ile)', () => {
            renderLobby();
            fireEvent.click(screen.getByLabelText('Ada'));
            fireEvent.click(screen.getByRole('button', { name: /İnşa etmeye başla/ }));
            const e = lastEntry();
            expect(e).toMatchObject({ mode: 'insa', mapId: null, saveId: null, base: 'ada' });
            expect(e.seed).toMatch(/^[0-9A-Z]{8}$/);
        });

        it('WebGL yoksa uyarı verir ve oyun düğmeleri kapanır', () => {
            webgl.ok = false;
            renderLobby();
            expect(screen.getByRole('alert')).toHaveTextContent('WebGL 2');
            expect(screen.getByRole('button', { name: /Maceraya Başla/ })).toBeDisabled();
            expect(screen.getByRole('button', { name: /İnşa etmeye başla/ })).toBeDisabled();
            fireEvent.click(screen.getByRole('button', { name: /Maceraya Başla/ }));
            expect(navigate).not.toHaveBeenCalled();
        });

        it('yerel kayıtlar Devam Et listesinde; Devam kayıt kimliğiyle girer', async () => {
            renderLobby({ saves: [{ id: 'slot-1', name: 'Ormanım', worldCode: 'ABCD1234', playTime: 3700, zone: { name: 'Fısıldayan Ormanlar' }, updatedAt: Date.now() - 120000 }] });
            const list = await screen.findByTestId('kesif-continue');
            await within(list).findByText('Ormanım');
            expect(list).toHaveTextContent('Bu cihaz');
            expect(list).toHaveTextContent('ABCD 1234');
            expect(list).toHaveTextContent('1 sa 1 dk');
            expect(list).toHaveTextContent('2 dk önce');
            expect(list).toHaveTextContent('Misafir kayıtların yalnızca bu tarayıcıda saklanır');
            fireEvent.click(within(list).getByRole('button', { name: 'Devam et: Ormanım' }));
            expect(lastEntry()).toEqual({ mode: 'macera', seed: 'ABCD1234', mapId: null, saveId: 'slot-1', base: null });
        });

        it('kayıt okuyucu hata verirse lobi çökmez, boş liste gösterir', async () => {
            const loadSaves = vi.fn(() => Promise.reject(new Error('idb')));
            render(
                <MemoryRouter>
                    <KesifLobbyPage api={fakeApi()} loadSaves={loadSaves} />
                </MemoryRouter>
            );
            expect(await screen.findByText(/Henüz kayıtlı macera yok/)).toBeInTheDocument();
        });

        it('?mode=slots misafirde pencere açmaz, Haritalarım bölümüne gider', () => {
            renderLobby({ url: '/oyun/kesif?mode=slots' });
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
        });

        it('Harita Hakkı Al karosu misafiri Haritalarım (giriş çağrısı) bölümüne götürür', () => {
            renderLobby();
            fireEvent.click(screen.getByRole('button', { name: /Harita Hakkı Al/ }));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
        });
    });

    describe('üye', () => {
        beforeEach(() => {
            member();
        });

        it('overview ile cüzdan ve hak çipleri; topluluk ve haritalarım yüklenir', async () => {
            const { api } = renderLobby();
            expect(api.overview).toHaveBeenCalledTimes(1);
            expect(await screen.findByLabelText('Cüzdan: 12.000 jeton')).toBeInTheDocument();
            expect(screen.getByLabelText('Harita hakkı: 3/5')).toBeInTheDocument();
            expect(await screen.findByText('Güzel Vadi')).toBeInTheDocument();
            expect(api.maps).toHaveBeenCalledWith({ sort: 'new', q: '', page: 1 });
            expect(await screen.findByText('Evim')).toBeInTheDocument();
            expect(screen.queryByTestId('kesif-browser-guest')).not.toBeInTheDocument();
            expect(screen.queryByTestId('kesif-mymaps-guest')).not.toBeInTheDocument();
        });

        it('bulut kaydı Devam Et listesinde; Devam saveId=cloud ile girer', async () => {
            const api = fakeApi({
                overview: vi.fn(() =>
                    Promise.resolve({
                        profile: PROFILE_3_OF_5,
                        wallet: { balance: 5 },
                        stats: { name: 'Bulut Dünyam', seed: 'ZZZZ9999', playTime: 600, zonesUnlocked: 2 },
                        cloud_save: { exists: true, saved_at: new Date().toISOString(), bytes: 1000 },
                    })
                ),
            });
            renderLobby({ api });
            const row = await screen.findByText('Bulut Dünyam');
            expect(row.closest('li')).toHaveTextContent('Bulut');
            expect(row.closest('li')).toHaveTextContent('2 bölge açık');
            fireEvent.click(screen.getByRole('button', { name: /Devam et: Bulut Dünyam/ }));
            expect(lastEntry()).toEqual({ mode: 'macera', seed: 'ZZZZ9999', mapId: null, saveId: 'cloud', base: null });
            // üyede "yalnızca bu tarayıcıda" notu yok
            expect(screen.queryByText(/yalnızca bu tarayıcıda/)).not.toBeInTheDocument();
        });

        it('bulut kaydı yoksa listede bulut satırı çıkmaz', async () => {
            renderLobby();
            await screen.findByText('Güzel Vadi');
            expect(screen.queryByText('Bulut kaydı')).not.toBeInTheDocument();
        });

        it('topluluk haritasında Oyna: oynanma sayacı + harita girişi', async () => {
            const { api } = renderLobby();
            await screen.findByText('Güzel Vadi');
            fireEvent.click(screen.getByRole('button', { name: 'Oyna: Güzel Vadi' }));
            expect(api.play).toHaveBeenCalledWith(MAP_A.id);
            expect(navigate).toHaveBeenCalledWith('/oyun/kesif/oyna', { state: { entry: { mode: 'harita', seed: null, mapId: MAP_A.id, saveId: null, base: null } } });
        });

        it('oynanma sayacı hata verse de oyun açılır', async () => {
            const api = fakeApi({ play: vi.fn(() => Promise.reject(new Error('ağ'))) });
            renderLobby({ api });
            await screen.findByText('Güzel Vadi');
            fireEvent.click(screen.getByRole('button', { name: 'Oyna: Güzel Vadi' }));
            expect(navigate).toHaveBeenCalledTimes(1);
            expect(lastEntry().mode).toBe('harita');
        });

        it('Haritalarım: Düzenle insa girişini harita kimliğiyle açar', async () => {
            renderLobby();
            await screen.findByText('Evim');
            fireEvent.click(screen.getByRole('button', { name: 'İnşa modunda düzenle: Evim' }));
            expect(lastEntry()).toEqual({ mode: 'insa', seed: null, mapId: MINE_PRIVATE.id, saveId: null, base: null });
        });

        it('Harita Hakkı Al karosu pencereyi açar; satın alma sayaçları tazeler', async () => {
            const { api } = renderLobby();
            await screen.findByLabelText('Harita hakkı: 3/5');
            fireEvent.click(screen.getByRole('button', { name: /Harita Hakkı Al\. 10\.000 jeton/ }));
            const dlg = screen.getByRole('dialog', { name: 'Harita Hakkı Al' });
            fireEvent.click(within(dlg).getByRole('button', { name: /jetonla satın al/ }));
            expect(await screen.findByText('+5 harita hakkı eklendi')).toBeInTheDocument();
            expect(api.buySlots).toHaveBeenCalledTimes(1);
            // lobi çipleri satın alma yanıtıyla güncellenir
            expect(screen.getByLabelText('Harita hakkı: 3/10')).toBeInTheDocument();
            expect(screen.getByLabelText('Cüzdan: 2.000 jeton')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Harika!' }));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('?mode=slots doğrudan Harita Hakkı Al penceresini açar', async () => {
            renderLobby({ url: '/oyun/kesif?mode=slots' });
            expect(screen.getByRole('dialog', { name: 'Harita Hakkı Al' })).toBeInTheDocument();
            await screen.findByText('Güzel Vadi');
        });

        it.each([
            ['macera', 'Yeni Macera'],
            ['insa', 'İnşa Modu'],
            ['topluluk', 'Topluluk Haritaları'],
            ['haritalarim', 'Haritalarım'],
        ])('?mode=%s ilgili bölüme kayar ve başlığa odaklanır', async (mode, heading) => {
            renderLobby({ url: `/oyun/kesif?mode=${mode}` });
            expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
            expect(screen.getByRole('heading', { level: 2, name: heading })).toHaveFocus();
            await screen.findByText('Güzel Vadi');
        });

        it('overview düşerse uyarı gösterir, geri kalan lobi çalışır; tekrar dene yeniden ister', async () => {
            const api = fakeApi({ overview: vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({ profile: PROFILE_3_OF_5, wallet: { balance: 1 } }) });
            renderLobby({ api });
            const note = await screen.findByText(/Sunucuya ulaşılamadı/);
            expect(note).toBeInTheDocument();
            expect(await screen.findByText('Güzel Vadi')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
            await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(2));
            await waitFor(() => expect(screen.queryByText(/Sunucuya ulaşılamadı/)).not.toBeInTheDocument());
        });
    });

    it('oturum yüklenirken yükleniyor gösterir', () => {
        Object.assign(auth, { loading: true });
        renderLobby();
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    });
});
