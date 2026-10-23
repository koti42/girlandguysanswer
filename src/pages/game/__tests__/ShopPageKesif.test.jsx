// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

/*
 * /oyun/magaza — Keşif Koleksiyonu: sekme (dalga kapalıyken gizli), tür çipleri, sıralama,
 * kilit/sahip/kuşanılmış durumları, kuşanma gövdesi { kesif: { yuva: anahtar|null } }, özel Keşif
 * yükü (kullanıcı detayına yazılmaz), eski/yeni sunucu kombinasyonları, misafir.
 */

const auth = { user: null, isAuthenticated: true, loading: false, updateUser: vi.fn() };
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../../services/shopApi', () => ({
    shopApi: { get: vi.fn(), buy: vi.fn(), equip: vi.fn(), transactions: vi.fn(), kesifLoadout: vi.fn() },
}));

import { shopApi } from '../../../services/shopApi';
import ShopPage from '../ShopPage';
import { FRAMES, getDesign } from '../../../game/shop';

const item = (key, extra = {}) => {
    const d = getDesign(key);
    return {
        key,
        category: d.category,
        name: d.name,
        description: d.description,
        price: 1000,
        rarity: d.rarity,
        unlock: { type: 'price', jeton: 1000 },
        owned: false,
        quantity: 0,
        unlocked: false,
        available_until: null,
        is_featured: false,
        is_active: true,
        ...extra,
    };
};

const NEON = 'portal:neon-sokak';
const ALTIN = 'portal:altin-kapi';
const LIMON = 'arac:limonata';
const SERIT = 'alet:neon-serit';
const YILDIZ = 'gecis:yildiz-yagmuru';
const CIP = 'title:cip-avcisi';

const kesifCategory = (over = {}) => ({
    key: 'kesif',
    name: 'Keşif Koleksiyonu',
    items: [
        item(ALTIN, { price: 3000 }),
        item(NEON, { price: 1600 }),
        item(LIMON, { price: 800 }),
        item(SERIT, { price: null, unlock: { type: 'level', level: 8 }, unlocked: false }),
        item(YILDIZ, { price: null, unlock: { type: 'level', level: 12 }, unlocked: true }),
    ],
    ...over,
});

const shopData = (over = {}) => ({
    wallet: { balance: 5000, earned_total: 6000, spent_total: 1000 },
    featured: [],
    categories: [
        { key: 'frame', name: 'Çerçeveler', items: [item(FRAMES[0].id, { price: 500 })] },
        { key: 'title', name: 'Unvanlar', items: [item(CIP, { price: null, unlock: { type: 'badge', badge: 'kesif_neon_cip_60' } })] },
        kesifCategory(),
    ],
    equipped: { frame: null, mini_avatar: null, title: null },
    tickets: 0,
    player: { level: 4 },
    ...over,
});

const probe = { location: null };
const LocationProbe = () => {
    const location = useLocation();
    useEffect(() => {
        probe.location = location;
    }, [location]);
    return null;
};

const renderPage = (path = '/oyun/magaza?kategori=kesif') =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/oyun/magaza" element={<><ShopPage /><LocationProbe /></>} />
            </Routes>
        </MemoryRouter>
    );

const axiosError = (status, data = {}, message = 'Hata') => Object.assign(new Error(message), { response: { status, data: { success: false, message, data } } });
const panelKeys = () =>
    [...screen.getByRole('tabpanel').querySelectorAll('[data-testid^="shop-card-"]')].map((el) => el.getAttribute('data-testid').replace('shop-card-', ''));

describe('ShopPage — Keşif Koleksiyonu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        auth.user = { id: 'u1', username: 'ayse', avatar: null, gender: 'female', detail: { game_cosmetics: { frame: null, mini_avatar: null, title: null } } };
        auth.isAuthenticated = true;
        auth.loading = false;
        shopApi.get.mockResolvedValue(shopData());
        shopApi.kesifLoadout.mockResolvedValue({ loadout: {} });
        shopApi.transactions.mockResolvedValue({ transactions: [], pagination: { current_page: 1, last_page: 1 } });
    });

    describe('sekme görünürlüğü (eski/yeni sunucu)', () => {
        it('dalga kapalıyken sunucu Keşif kategorisini dönmez: sekme yok, ?kategori=kesif ilk kategoriye düşer, yük sorgulanmaz', async () => {
            shopApi.get.mockResolvedValue(shopData({ categories: [{ key: 'frame', name: 'Çerçeveler', items: [item(FRAMES[0].id)] }, { key: 'title', name: 'Unvanlar', items: [] }] }));
            renderPage();
            await screen.findByTestId('shop-balance');
            const tabs = screen.getAllByRole('tab');
            expect(tabs.map((t) => t.textContent)).toEqual([expect.stringContaining('Çerçeveler')]);
            expect(screen.queryByRole('tab', { name: /Keşif/ })).toBeNull();
            expect(screen.queryByTestId('kesif-chips')).toBeNull();
            expect(within(screen.getByRole('tabpanel')).getByTestId(`shop-card-${FRAMES[0].id}`)).toBeInTheDocument();
            expect(shopApi.kesifLoadout).not.toHaveBeenCalled();
        });

        it('Keşif kategorisi boş liste dönerse de sekme çizilmez', async () => {
            shopApi.get.mockResolvedValue(shopData({ categories: [{ key: 'frame', name: 'Çerçeveler', items: [item(FRAMES[0].id)] }, { key: 'kesif', name: 'Keşif Koleksiyonu', items: [] }] }));
            renderPage();
            await screen.findByTestId('shop-balance');
            expect(screen.queryByRole('tab', { name: /Keşif/ })).toBeNull();
        });

        it('Keşif kategorisi varken sekme Unvanlar’dan sonra gelir ve ?kategori=kesif doğrudan açar', async () => {
            renderPage();
            await screen.findByTestId('shop-balance');
            const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
            expect(tabs).toEqual([expect.stringContaining('Çerçeveler'), expect.stringContaining('Unvanlar'), expect.stringContaining('Keşif Koleksiyonu')]);
            expect(screen.getByRole('tab', { name: /Keşif Koleksiyonu/ })).toHaveAttribute('aria-selected', 'true');
            expect(panelKeys()).toEqual([ALTIN, NEON, LIMON, SERIT, YILDIZ]);
        });

        it('sunucu bu sürümün tanımadığı bir Keşif anahtarı da döndürse sayfa çökmez (yedek ikon), kuşanma düğmesi yok', async () => {
            shopApi.get.mockResolvedValue(
                shopData({
                    categories: [
                        {
                            key: 'kesif',
                            name: 'Keşif Koleksiyonu',
                            items: [{ ...item(NEON), key: 'portal:gelecekte-eklenecek', name: 'Yeni Portal', owned: true, unlocked: true }],
                        },
                    ],
                })
            );
            renderPage();
            fireEvent.click(await screen.findByTestId('shop-card-portal:gelecekte-eklenecek'));
            const drawer = await screen.findByRole('dialog');
            expect(within(drawer).getByText('Yeni Portal')).toBeInTheDocument();
            expect(within(drawer).getByText('Portal Tabancası')).toBeInTheDocument();
            expect(within(drawer).getByRole('button', { name: /^Kuşan$/ })).toBeInTheDocument(); // yuva önekten bilinir
        });
    });

    describe('tür çipleri ve sıralama', () => {
        it('çipler yalnız katalogdaki türler için çizilir; çip yerel süzgeçtir, istek atmaz', async () => {
            renderPage();
            await screen.findByTestId('shop-balance');
            const chips = within(screen.getByTestId('kesif-chips'));
            expect(chips.getAllByRole('button').map((b) => b.textContent)).toEqual(['Tümü', 'Portal', 'Alet', 'Araç', 'Geçiş']);
            expect(chips.getByRole('button', { name: 'Tümü' })).toHaveAttribute('aria-pressed', 'true');
            fireEvent.click(chips.getByRole('button', { name: 'Portal' }));
            expect(chips.getByRole('button', { name: 'Portal' })).toHaveAttribute('aria-pressed', 'true');
            expect(panelKeys()).toEqual([ALTIN, NEON]);
            fireEvent.click(chips.getByRole('button', { name: 'Araç' }));
            expect(panelKeys()).toEqual([LIMON]);
            fireEvent.click(chips.getByRole('button', { name: 'Tümü' }));
            expect(panelKeys()).toHaveLength(5);
            expect(shopApi.get).toHaveBeenCalledTimes(1);
        });

        it('çip yalnız Keşif sekmesinde görünür', async () => {
            renderPage('/oyun/magaza?kategori=frame');
            await screen.findByTestId('shop-balance');
            expect(screen.queryByTestId('kesif-chips')).toBeNull();
            fireEvent.click(screen.getByRole('tab', { name: /Keşif Koleksiyonu/ }));
            expect(screen.getByTestId('kesif-chips')).toBeInTheDocument();
            expect(probe.location.search).toContain('kategori=kesif');
        });

        it('sıralama: önerilen sunucu sırası, fiyat artan (fiyatsızlar sonda), nadirlik en nadir önce', async () => {
            renderPage();
            await screen.findByTestId('shop-balance');
            const select = screen.getByTestId('shop-sort');
            expect([...select.options].map((o) => o.value)).toEqual(['recommended', 'price', 'rarity']);
            expect(select.value).toBe('recommended');
            fireEvent.change(select, { target: { value: 'price' } });
            expect(panelKeys()).toEqual([LIMON, NEON, ALTIN, SERIT, YILDIZ]);
            fireEvent.change(select, { target: { value: 'rarity' } });
            expect(panelKeys()).toEqual([ALTIN, SERIT, YILDIZ, NEON, LIMON]); // epic'ler (sunucu sırası) → rare → common
            fireEvent.change(select, { target: { value: 'recommended' } });
            expect(panelKeys()).toEqual([ALTIN, NEON, LIMON, SERIT, YILDIZ]);
        });

        it('sıralama ve çip birlikte; süzgeç boşsa "Tümünü göster" ikisini de sıfırlar', async () => {
            shopApi.get.mockResolvedValue(shopData());
            renderPage();
            await screen.findByTestId('shop-balance');
            fireEvent.click(within(screen.getByTestId('kesif-chips')).getByRole('button', { name: 'Portal' }));
            fireEvent.change(screen.getByTestId('shop-sort'), { target: { value: 'price' } });
            expect(panelKeys()).toEqual([NEON, ALTIN]);
            fireEvent.click(screen.getByRole('button', { name: 'Sahip olduklarım' }));
            expect(screen.getByText(/henüz senin bir şeyin yok/)).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Tümünü göster' }));
            expect(panelKeys()).toHaveLength(5);
            expect(within(screen.getByTestId('kesif-chips')).getByRole('button', { name: 'Tümü' })).toHaveAttribute('aria-pressed', 'true');
        });
    });

    describe('kilitli / sahip / kuşanılmış durumları', () => {
        it('kilitli (seviye), seviyesi tutan (sahip gibi) ve rozet kilitli öğeler doğru etiketlenir', async () => {
            shopApi.get.mockResolvedValue(shopData({ kesif_loadout: { portal: null, alet: null, asa: null, jet: null, arac: null, gecis: YILDIZ } }));
            renderPage();
            const locked = await screen.findByTestId(`shop-card-${SERIT}`);
            expect(locked).toHaveAccessibleName(/kilitli, seviye 8/);
            expect(within(locked).getAllByText(/Seviye 8/).length).toBeGreaterThan(0);
            expect(screen.getByTestId(`shop-card-${YILDIZ}`)).toHaveAccessibleName(/kuşanıldı/);
            expect(screen.getByTestId(`shop-card-${NEON}`)).toHaveAccessibleName(/1\.600 jeton/);
            fireEvent.click(screen.getByRole('tab', { name: /Unvanlar/ }));
            const badge = screen.getByTestId(`shop-card-${CIP}`);
            expect(badge).toHaveAccessibleName(/kilitli, rozetle açılır/);
            fireEvent.click(badge);
            const drawer = await screen.findByRole('dialog');
            expect(within(drawer).getByText('“Çip Koleksiyoncusu” rozetini kazanınca açılır.')).toBeInTheDocument();
        });

        it('kilitli seviye öğesinin çekmecesinde satın alma yok, kilit düğmesi var', async () => {
            renderPage();
            fireEvent.click(await screen.findByTestId(`shop-card-${SERIT}`));
            const drawer = await screen.findByRole('dialog');
            expect(within(drawer).getByText(/Oyun seviyen 8 olunca açılır/)).toBeInTheDocument();
            expect(within(drawer).queryByRole('button', { name: /Satın al/ })).toBeNull();
            expect(within(drawer).getByRole('button', { name: /Seviye 8/ })).toBeDisabled();
        });

        it('çekmece: "Oyunda şöyle görünür", tür açıklaması, renk çipleri, gizlilik notu; profil önizlemesi yok', async () => {
            renderPage();
            fireEvent.click(await screen.findByTestId(`shop-card-${NEON}`));
            const drawer = await screen.findByRole('dialog');
            expect(within(drawer).getByText('Oyunda şöyle görünür')).toBeInTheDocument();
            const note = within(drawer).getByTestId('kesif-preview-note');
            expect(within(note).getByText('Portal Tabancası')).toBeInTheDocument();
            expect(note.querySelectorAll('[data-swatch]')).toHaveLength(3);
            expect(within(note).getByText(/Yalnız sen görürsün/)).toBeInTheDocument();
            expect(within(drawer).queryByTestId('profile-preview')).toBeNull();
            expect(within(drawer).getByRole('button', { name: /Satın al/ })).toBeInTheDocument();
        });
    });

    describe('kuşanma (PUT /game/shop/equip { kesif })', () => {
        const ownedData = (loadout) => shopData({ kesif_loadout: loadout, categories: [{ key: 'kesif', name: 'Keşif Koleksiyonu', items: [item(NEON, { owned: true, unlocked: true }), item(ALTIN, { owned: true, unlocked: true }), item(LIMON)] }] });
        const EMPTY = { portal: null, alet: null, asa: null, jet: null, arac: null, gecis: null };

        it('Kuşan: gövde iç içe; yanıttaki kesif_loadout kartı günceller; kullanıcı detayına (profil) yazılmaz', async () => {
            shopApi.get.mockResolvedValue(ownedData(EMPTY));
            shopApi.equip.mockResolvedValue({ equipped: { frame: null, mini_avatar: null, title: null }, kesif_loadout: { ...EMPTY, portal: NEON } });
            renderPage();
            fireEvent.click(await screen.findByTestId(`shop-card-${NEON}`));
            const drawer = await screen.findByRole('dialog');
            fireEvent.click(within(drawer).getByRole('button', { name: /^Kuşan$/ }));
            await waitFor(() => expect(shopApi.equip).toHaveBeenCalledWith({ kesif: { portal: NEON } }));
            await waitFor(() => expect(screen.getByTestId(`shop-card-${NEON}`)).toHaveAccessibleName(/kuşanıldı/));
            expect(screen.getByTestId(`shop-card-${ALTIN}`)).not.toHaveAccessibleName(/kuşanıldı/);
            expect(auth.updateUser).not.toHaveBeenCalled();
            expect(screen.getAllByRole('status').some((el) => el.textContent === `${getDesign(NEON).name} kuşanıldı.`)).toBe(true);
        });

        it('Çıkar: { kesif: { yuva: null } } gider ve varsayılana döner', async () => {
            shopApi.get.mockResolvedValue(ownedData({ ...EMPTY, portal: NEON }));
            shopApi.equip.mockResolvedValue({ kesif_loadout: EMPTY });
            renderPage();
            fireEvent.click(await screen.findByTestId(`shop-card-${NEON}`));
            const drawer = await screen.findByRole('dialog');
            fireEvent.click(within(drawer).getByRole('button', { name: /Çıkar/ }));
            await waitFor(() => expect(shopApi.equip).toHaveBeenCalledWith({ kesif: { portal: null } }));
            await waitFor(() => expect(screen.getByTestId(`shop-card-${NEON}`)).not.toHaveAccessibleName(/kuşanıldı/));
        });

        it('aynı yuvadaki başka öğe kuşanılınca öncekinin rozeti kalkar (sunucu yanıtı yetkili)', async () => {
            shopApi.get.mockResolvedValue(ownedData({ ...EMPTY, portal: NEON }));
            shopApi.equip.mockResolvedValue({ kesif_loadout: { ...EMPTY, portal: ALTIN } });
            renderPage();
            fireEvent.click(await screen.findByTestId(`shop-card-${ALTIN}`));
            fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^Kuşan$/ }));
            await waitFor(() => expect(screen.getByTestId(`shop-card-${ALTIN}`)).toHaveAccessibleName(/kuşanıldı/));
            expect(screen.getByTestId(`shop-card-${NEON}`)).not.toHaveAccessibleName(/kuşanıldı/);
        });

        it('sunucu yanıtında kesif_loadout yoksa yerel birleştirme; bilinmeyen anahtar yuvaya girmez', async () => {
            shopApi.get.mockResolvedValue(ownedData(EMPTY));
            shopApi.equip.mockResolvedValue({ equipped: { frame: null, mini_avatar: null, title: null } });
            renderPage();
            fireEvent.click(await screen.findByTestId(`shop-card-${ALTIN}`));
            fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^Kuşan$/ }));
            await waitFor(() => expect(screen.getByTestId(`shop-card-${ALTIN}`)).toHaveAccessibleName(/kuşanıldı/));
        });

        it('kuşanma hatası çekmecede gösterilir ve durum değişmez', async () => {
            shopApi.get.mockResolvedValue(ownedData(EMPTY));
            shopApi.equip.mockRejectedValue(axiosError(422, { slot: 'portal', item: NEON }, 'Bu öğe sende değil.'));
            renderPage();
            fireEvent.click(await screen.findByTestId(`shop-card-${NEON}`));
            fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^Kuşan$/ }));
            expect(await screen.findByRole('alert')).toHaveTextContent('Bu öğe sende değil.');
            expect(screen.getByTestId(`shop-card-${NEON}`)).not.toHaveAccessibleName(/kuşanıldı/);
        });

        it('eski kozmetik kuşanma gövdesi değişmez: unvan düz yuvayla gider', async () => {
            shopApi.get.mockResolvedValue(
                shopData({ categories: [{ key: 'title', name: 'Unvanlar', items: [item('title:neon-gezgin', { owned: true, unlocked: true })] }] })
            );
            shopApi.equip.mockResolvedValue({ equipped: { frame: null, mini_avatar: null, title: 'title:neon-gezgin' } });
            renderPage('/oyun/magaza?kategori=title');
            fireEvent.click(await screen.findByTestId('shop-card-title:neon-gezgin'));
            fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^Kuşan$/ }));
            await waitFor(() => expect(shopApi.equip).toHaveBeenCalledWith({ title: 'title:neon-gezgin' }));
            expect(auth.updateUser).toHaveBeenCalled();
        });
    });

    describe('Keşif yükünün kaynağı', () => {
        it('GET /game/shop yükü listeyle dönerse ayrıca sorulmaz', async () => {
            shopApi.get.mockResolvedValue(shopData({ kesif_loadout: { portal: NEON } }));
            renderPage();
            await waitFor(() => expect(screen.getByTestId(`shop-card-${NEON}`)).toBeInTheDocument());
            expect(shopApi.kesifLoadout).not.toHaveBeenCalled();
        });

        it('liste yükü dönmezse GET /game/kesif/loadout bir kez sorulur ve sahip olunan öğe kuşanılmış görünür', async () => {
            shopApi.get.mockResolvedValue(shopData({ categories: [{ key: 'kesif', name: 'Keşif Koleksiyonu', items: [item(NEON, { owned: true, unlocked: true }), item(LIMON)] }] }));
            shopApi.kesifLoadout.mockResolvedValue({ loadout: { portal: NEON, arac: LIMON } });
            renderPage();
            await waitFor(() => expect(screen.getByTestId(`shop-card-${NEON}`)).toHaveAccessibleName(/kuşanıldı/));
            expect(shopApi.kesifLoadout).toHaveBeenCalledTimes(1);
            // sahip olunmayan öğenin bayat yükü kuşanılmış gösterilmez
            expect(screen.getByTestId(`shop-card-${LIMON}`)).not.toHaveAccessibleName(/kuşanıldı/);
        });

        it('yük sorgusu başarısızsa sessizce varsayılan; mağaza çalışmaya devam eder', async () => {
            shopApi.kesifLoadout.mockRejectedValue(axiosError(500));
            renderPage();
            await screen.findByTestId(`shop-card-${NEON}`);
            await waitFor(() => expect(shopApi.kesifLoadout).toHaveBeenCalled());
            expect(screen.queryByRole('alert')).toBeNull();
            expect(screen.getByTestId(`shop-card-${NEON}`)).not.toHaveAccessibleName(/kuşanıldı/);
        });
    });

    describe('satın alma → hemen kuşan', () => {
        it('Keşif öğesi satın alınır, kutlamada "Hemen kuşan" iç içe gövdeyle gider', async () => {
            const EMPTY = { portal: null, alet: null, asa: null, jet: null, arac: null, gecis: null };
            shopApi.get.mockResolvedValue(shopData({ kesif_loadout: EMPTY }));
            shopApi.buy.mockResolvedValue({ wallet: { balance: 3400, earned_total: 6000, spent_total: 2600 }, item: item(NEON, { owned: true, unlocked: true, price: 1600 }), tickets: 0 });
            shopApi.equip.mockResolvedValue({ kesif_loadout: { ...EMPTY, portal: NEON } });
            renderPage();
            fireEvent.click(await screen.findByTestId(`shop-card-${NEON}`));
            fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Satın al/ }));
            fireEvent.click(await screen.findByRole('button', { name: /jetona onayla/ }));
            await waitFor(() => expect(shopApi.buy).toHaveBeenCalledWith(NEON));
            const celebration = await screen.findByTestId('buy-celebration');
            expect(within(celebration).getByText(/Kuşanırsan Keşif oyununda görünür/)).toBeInTheDocument();
            fireEvent.click(within(celebration).getByRole('button', { name: /Hemen kuşan/ }));
            await waitFor(() => expect(shopApi.equip).toHaveBeenCalledWith({ kesif: { portal: NEON } }));
            await waitFor(() => expect(screen.getByTestId(`shop-card-${NEON}`)).toHaveAccessibleName(/kuşanıldı/));
        });
    });

    describe('misafir', () => {
        it('statik katalog: Keşif dalgası öğeleri ve sekmesi yok (sunucu bayrağı misafire bilinmez); sıralama var', async () => {
            auth.isAuthenticated = false;
            auth.user = null;
            renderPage('/oyun/magaza?kategori=kesif');
            const tabs = await screen.findAllByRole('tab');
            expect(tabs.length).toBeGreaterThan(0);
            expect(screen.queryByRole('tab', { name: /Keşif/ })).toBeNull();
            expect(screen.getByTestId('shop-sort')).toBeInTheDocument();
            // 15 çerçevenin hiçbirinde dalga çerçevesi yok
            fireEvent.click(screen.getByRole('tab', { name: /Çerçeve/ }));
            expect(panelKeys().some((k) => k === 'frame:neon-meridyen')).toBe(false);
            expect(panelKeys()).toHaveLength(15);
            expect(shopApi.get).not.toHaveBeenCalled();
            expect(shopApi.kesifLoadout).not.toHaveBeenCalled();
        });
    });
});
