import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuBuilding2, LuFootprints, LuHistory, LuLogIn, LuPackageOpen, LuTicket } from 'react-icons/lu';
import { useAuth } from '../../context/AuthContext';
import GameLayout from '../../components/game/GameLayout';
import { GameError, GameLoading } from '../../components/game/GameStates';
import ShopArt from '../../components/game/shop/ShopArt';
import ShopCard from '../../components/game/shop/ShopCard';
import ItemDrawer from '../../components/game/shop/ItemDrawer';
import BuyCelebration from '../../components/game/shop/BuyCelebration';
import WalletHistory from '../../components/game/shop/WalletHistory';
import WalletChip from '../../components/game/shop/WalletChip';
import {
    KESIF_CHIPS,
    SORTS,
    buyErrorMessage,
    featuredDeadline,
    filterByKesifKind,
    findItem,
    guestKesifEnabled,
    itemState,
    normalizeShop,
    replaceItem,
    shopError,
    sortItems,
    toInt,
} from '../../components/game/shop/shopUtils';
import { SHOP_CATEGORIES, getDesign, kesifSlotOfKey, normalizeCosmetics, normalizeKesifLoadout, staticCatalog } from '../../game/shop';
import { shopApi } from '../../services/shopApi';
import { formatCountdown, formatNumber, nextIstanbulMonday } from '../../components/game/gameUtils';
import useNow from '../../components/game/useNow';

/*
 * Jeton Mağazası — /oyun/magaza (SPEC_V2 §F.8).
 *
 * Misafire açık: katalog koddaki tasarımlardan statik önizleme olarak
 * görünür (fiyat/sahiplik yok), satın almak için giriş çağrısı. Üyede
 * GET /game/shop; satın alma / kuşanma yanıtları yerel durumu yerinde
 * günceller (tam yeniden yükleme yok), kuşanılan kozmetikler oturumdaki
 * kullanıcıya da yazılır ki profil hemen güncel görünsün.
 *
 * URL: ?kategori=frame|mini_avatar|title|kesif|avatar_part|consumable, ?urun=<key>
 * (ör. sohbetteki "Mağazadan bilet al" → ?urun=ticket:message çekmeceyi açar).
 *
 * Keşif Koleksiyonu: sunucu dalga bayrağı (GAME_SHOP_KESIF1) kapalıyken o kategoriyi
 * hiç döndürmez; sekme yalnız öğesi olan kategoriler için çizildiğinden kendiliğinden
 * gizlenir. Kuşanma `PUT /game/shop/equip { kesif: { <yuva>: anahtar|null } }`; Keşif
 * yükü özeldir (kullanıcı detayına/profile yazılmaz). Sunucu `kesif_loadout`u listeyle
 * dönmezse bir kez GET /game/kesif/loadout ile sorulur. Tür çipleri ve sıralama yereldir.
 *
 * Yarış durumları: aynı anda tek satın alma/kuşanma (busyRef); her istek
 * taze Idempotency-Key ile gider; sunucu kozmetik çift alımı 409 ile reddeder.
 * Yanıt hiç gelmezse (zaman aşımı / ağ) satın alma sunucuda gerçekleşmiş
 * olabilir: düğme kilitli kalır, GET /game/shop ile cüzdan/bilet/sahiplik
 * yeniden sorulur ve satın almanın olup olmadığı buna göre söylenir. Yenileme
 * de başarısızsa bakiye "doğrulanamadı" olarak işaretlenir ve bir sonraki
 * dokunuş satın almadan önce yeniden durum sorar (Mesaj Bileti gibi tüketilebilir
 * öğe körlemesine ikinci kez alınmasın).
 */

const CATEGORY_KEYS = SHOP_CATEGORIES.map((c) => c.key);
const FILTERS = [
    { key: 'all', label: 'Tümü' },
    { key: 'owned', label: 'Sahip olduklarım' },
];

/*
 * Misafir kataloğu sunucusuzdur; Keşif dalgasının 46 öğesi, sunucu bayrağı açılıp
 * web yayınlandıktan sonra VITE_SHOP_KESIF_GUEST=1 ile misafire de gösterilir.
 */
const GUEST_KESIF = (() => {
    try {
        return guestKesifEnabled(import.meta.env);
    } catch {
        return false;
    }
})();

const GUEST_SHOP = (() => {
    const categories = staticCatalog({ wave: GUEST_KESIF });
    const all = categories.flatMap((c) => c.items);
    const featured = all.filter((i) => i.rarity === 'legendary' || i.rarity === 'epic').slice(0, 8);
    return {
        wallet: { balance: 0, earned_total: 0, spent_total: 0 },
        featured,
        categories,
        equipped: normalizeCosmetics(null),
        kesifLoadout: normalizeKesifLoadout(null),
        kesifKnown: true,
        tickets: 0,
        player: { level: 1 },
    };
})();

/* ---------------------------------------------------------------- parçalar */

const EarnCard = () => (
    <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
        <p className="flex items-center gap-2 text-sm font-extrabold">
            <ShopArt icon="jeton" className="h-5 w-5" /> Jeton nasıl kazanılır?
        </p>
        <ul className="mt-2 space-y-1.5 text-sm text-white/80">
            <li>Herkesler Koşuyor’da topladığın her jeton cüzdanına eklenir.</li>
            <li>Herkesler Yükseliyor’da çıktığın her kat jeton kazandırır.</li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
            <Link
                to="/oyun/kosu"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-4 text-sm font-bold text-white game-press"
            >
                <LuFootprints aria-hidden="true" /> Koşu
            </Link>
            <Link
                to="/oyun/kule"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white/15 px-4 text-sm font-bold text-white game-press hover:bg-white/20"
            >
                <LuBuilding2 aria-hidden="true" /> Kule
            </Link>
        </div>
    </div>
);

const WalletHero = ({ shop, stale = false, onHistory }) => (
    <section className="game-hero relative overflow-hidden rounded-3xl p-5 shadow-xl sm:p-6 game-pop-in" aria-labelledby="shop-wallet-title">
        <ShopArt icon="sparkle" className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 opacity-20" />
        <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,22rem)] md:items-center">
            <div className="min-w-0">
                <h2 id="shop-wallet-title" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-white/70">
                    <ShopArt icon="wallet" className="h-5 w-5" /> Cüzdanın
                </h2>
                <p className="mt-1 flex items-center gap-2 text-4xl font-extrabold tabular-nums" data-testid="shop-balance">
                    <ShopArt icon="jeton" className="h-9 w-9" />
                    {formatNumber(shop.wallet.balance)}
                    <span className="sr-only"> jeton</span>
                </p>
                {stale && (
                    <p className="mt-1 text-xs font-bold text-amber-200" data-testid="shop-balance-stale">
                        Bakiye doğrulanamadı; güncel olmayabilir.
                    </p>
                )}
                <p className="mt-1 text-xs text-white/65">
                    Toplam kazanılan {formatNumber(shop.wallet.earned_total)} · harcanan {formatNumber(shop.wallet.spent_total)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={onHistory}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white/15 px-4 text-sm font-bold text-white game-press hover:bg-white/20"
                    >
                        <LuHistory aria-hidden="true" /> İşlem geçmişi
                    </button>
                    <span className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-bold text-white/90" data-testid="shop-tickets">
                        <LuTicket aria-hidden="true" /> Mesaj Bileti: {formatNumber(shop.tickets)}
                    </span>
                </div>
            </div>
            <EarnCard />
        </div>
    </section>
);

const GuestHero = () => (
    <section className="game-hero relative overflow-hidden rounded-3xl p-5 shadow-xl sm:p-6 game-pop-in" aria-labelledby="shop-guest-title">
        <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,22rem)] md:items-center">
            <div className="min-w-0">
                <h2 id="shop-guest-title" className="flex items-center gap-2 text-xl font-extrabold">
                    <ShopArt icon="shop" className="h-7 w-7" /> Jetonlarını tarzına dönüştür
                </h2>
                <p className="mt-1.5 text-sm text-white/75">
                    Profil çerçeveleri, mini avatarlar, unvanlar ve karakter parçaları seni bekliyor. Satın almak ve kuşanmak için giriş yap.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                        to="/login"
                        className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-5 font-bold text-white game-press game-glow-coral"
                    >
                        <LuLogIn aria-hidden="true" /> Giriş yap
                    </Link>
                    <Link to="/signup" className="inline-flex min-h-[48px] items-center rounded-2xl bg-white/10 px-5 font-bold text-white game-press hover:bg-white/15">
                        Üye ol
                    </Link>
                </div>
            </div>
            <EarnCard />
        </div>
    </section>
);

const FeaturedStrip = ({ items, guest, renderCard }) => {
    const now = useNow(1000, !guest && items.length > 0);
    if (!items.length) return null;
    const deadline = featuredDeadline(items, now) ?? nextIstanbulMonday(now);
    return (
        <section className="mt-6" aria-labelledby="shop-featured-title">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <h2 id="shop-featured-title" className="flex items-center gap-2 text-lg font-extrabold">
                    <ShopArt icon="sparkle" className="h-6 w-6" /> {guest ? 'Öne çıkanlar' : 'Haftanın Vitrini'}
                </h2>
                {!guest && (
                    <p className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-200">
                        <ShopArt icon="clock" className="h-4 w-4" /> Yenilenmesine
                        <span className="tabular-nums" data-testid="featured-countdown">{formatCountdown(deadline - now)}</span>
                    </p>
                )}
            </div>
            <ul className="shop-strip -mx-4 flex gap-3 overflow-x-auto px-4 pb-3" aria-label={guest ? 'Öne çıkan ürünler' : 'Haftanın vitrini ürünleri'}>
                {items.map((item) => (
                    <li key={item.key} className="w-[min(68vw,14.5rem)] shrink-0 sm:w-56">
                        {renderCard(item, 'featured')}
                    </li>
                ))}
            </ul>
        </section>
    );
};

/** Keşif sekmesi tür çipleri: yalnız katalogda öğesi olan türler (kısmi katalogda boş çip çizilmez). */
const KesifChips = ({ items, value, onChange }) => {
    const present = useMemo(() => new Set(items.map((i) => kesifSlotOfKey(i.key)).filter(Boolean)), [items]);
    const chips = KESIF_CHIPS.filter((c) => c.key === 'all' || present.has(c.key));
    if (chips.length <= 2) return null;
    return (
        <div className="shop-strip -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Keşif türü" data-testid="kesif-chips">
            {chips.map((c) => (
                <button
                    key={c.key}
                    type="button"
                    aria-pressed={value === c.key}
                    onClick={() => onChange(c.key)}
                    className={`min-h-[36px] shrink-0 rounded-full px-3.5 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral ${
                        value === c.key
                            ? 'bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white shadow'
                            : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15'
                    }`}
                >
                    {c.label}
                </button>
            ))}
        </div>
    );
};

const SortSelect = ({ value, onChange }) => (
    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
        <span>Sırala</span>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral dark:border-white/15 dark:bg-slate-900 dark:text-white"
            data-testid="shop-sort"
        >
            {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                    {s.label}
                </option>
            ))}
        </select>
    </label>
);

const CategoryTabs = ({ categories, active, onChange, baseId }) => {
    const refs = useRef({});
    const onKeyDown = (e) => {
        const idx = categories.findIndex((c) => c.key === active);
        let next = null;
        if (e.key === 'ArrowRight') next = categories[(idx + 1) % categories.length];
        else if (e.key === 'ArrowLeft') next = categories[(idx - 1 + categories.length) % categories.length];
        else if (e.key === 'Home') next = categories[0];
        else if (e.key === 'End') next = categories[categories.length - 1];
        if (!next) return;
        e.preventDefault();
        onChange(next.key);
        refs.current[next.key]?.focus();
    };
    return (
        <div
            role="tablist"
            aria-label="Mağaza kategorileri"
            onKeyDown={onKeyDown}
            className="shop-strip -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
            {categories.map((c) => {
                const meta = SHOP_CATEGORIES.find((m) => m.key === c.key);
                const selected = c.key === active;
                return (
                    <button
                        key={c.key}
                        ref={(el) => {
                            refs.current[c.key] = el;
                        }}
                        type="button"
                        role="tab"
                        id={`${baseId}-tab-${c.key}`}
                        aria-selected={selected}
                        aria-controls={`${baseId}-panel`}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onChange(c.key)}
                        className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-2xl px-3.5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral ${
                            selected
                                ? 'bg-gradient-to-r from-coral to-fuchsia-500 text-white shadow-md'
                                : 'game-card text-slate-700 hover:bg-indigo-50 dark:text-slate-200 dark:hover:bg-white/10'
                        }`}
                    >
                        {meta?.icon && <ShopArt icon={meta.icon} className="h-5 w-5" />}
                        {c.name || meta?.name}
                        <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${selected ? 'bg-white/25' : 'bg-slate-200 dark:bg-white/10'}`}>
                            {c.items.length}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

/* ---------------------------------------------------------------- mağaza */

const Shop = ({ shop, setShop, guest, user, updateUser }) => {
    const [params, setParams] = useSearchParams();
    const [filter, setFilter] = useState('all');
    const [kind, setKind] = useState('all');
    const [sort, setSort] = useState('recommended');
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [drawerError, setDrawerError] = useState(null);
    const [celebrate, setCelebrate] = useState(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [announce, setAnnounce] = useState('');
    // Yanıtı kaybolan satın almanın durumu doğrulanamadıysa: { key, tickets, quantity, owned }
    const [stale, setStale] = useState(false);
    const pendingRef = useRef(null);
    const shopRef = useRef(shop);
    shopRef.current = shop;
    const now = useNow(60000);
    const baseId = 'shop';

    const categories = useMemo(
        () => [...shop.categories].sort((a, b) => CATEGORY_KEYS.indexOf(a.key) - CATEGORY_KEYS.indexOf(b.key)).filter((c) => c.items.length > 0),
        [shop.categories]
    );
    const wanted = params.get('kategori');
    const active = categories.some((c) => c.key === wanted) ? wanted : categories[0]?.key;
    const activeCat = categories.find((c) => c.key === active);
    const selectedKey = params.get('urun');
    const selected = selectedKey ? findItem(shop, selectedKey) : null;
    const hasKesif = categories.some((c) => c.key === 'kesif');

    // Sunucu Keşif yükünü listeyle dönmediyse bir kez sorulur (yalnız üye + Keşif kategorisi varken).
    useEffect(() => {
        if (guest || !hasKesif || shopRef.current.kesifKnown || typeof shopApi.kesifLoadout !== 'function') return undefined;
        let alive = true;
        Promise.resolve()
            .then(() => shopApi.kesifLoadout())
            .then(
                (res) => alive && setShop((s) => ({ ...s, kesifLoadout: normalizeKesifLoadout(res), kesifKnown: true })),
                () => {}
            );
        return () => {
            alive = false;
        };
    }, [guest, hasKesif, setShop]);

    const setParam = useCallback(
        (patch) => {
            setParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    for (const [k, v] of Object.entries(patch)) {
                        if (v == null) next.delete(k);
                        else next.set(k, v);
                    }
                    return next;
                },
                { replace: true }
            );
        },
        [setParams]
    );

    const openItem = useCallback(
        (item) => {
            setDrawerError(null);
            setParam({ urun: item.key });
        },
        [setParam]
    );
    const closeItem = useCallback(() => {
        if (busyRef.current) return;
        setDrawerError(null);
        setParam({ urun: null });
    }, [setParam]);

    const syncCosmetics = useCallback(
        (equipped) => {
            if (!user) return;
            updateUser?.({ detail: { ...(user.detail || {}), game_cosmetics: equipped } });
        },
        [user, updateUser]
    );

    const markBought = useCallback(
        (item, bought) => {
            setParam({ urun: null });
            setCelebrate({ ...item, ...bought });
            setAnnounce(`${item.name} satın alındı.`);
        },
        [setParam]
    );

    /*
     * Yanıtı kaybolan satın almadan sonra mağazayı sunucudan yeniden alır ve
     * satın almanın gerçekleşip gerçekleşmediğini söyler. busyRef çağıran
     * tarafından tutulur; düğme bu sürede kilitli kalır.
     */
    const verifyPending = useCallback(async () => {
        const pending = pendingRef.current;
        setDrawerError({ message: 'Satın alma durumu kontrol ediliyor…', reason: 'checking' });
        let fresh;
        try {
            fresh = normalizeShop(await shopApi.get());
        } catch {
            setStale(true);
            setDrawerError({
                message: 'Satın alma durumu doğrulanamadı. Bakiyen güncel olmayabilir; tekrar dokunduğunda önce durum kontrol edilir.',
                reason: 'unverified',
            });
            return;
        }
        pendingRef.current = null;
        setStale(false);
        setShop(() => fresh);
        const freshItem = pending ? findItem(fresh, pending.key) : null;
        const went = pending
            ? pending.category === 'consumable'
                ? fresh.tickets > pending.tickets || toInt(freshItem?.quantity) > pending.quantity
                : !!freshItem?.owned && !pending.owned
            : false;
        if (went) {
            markBought(pending.item, freshItem || {});
            setDrawerError(null);
        } else {
            setDrawerError({
                message: 'Satın alma tamamlanmadı. Bakiyen ve biletlerin güncellendi; istersen tekrar deneyebilirsin.',
                reason: null,
            });
        }
    }, [setShop, markBought]);

    const handleBuy = useCallback(
        async (item) => {
            if (guest || busyRef.current) return;
            busyRef.current = true;
            setBusy(true);
            setDrawerError(null);
            try {
                if (pendingRef.current) {
                    // Önceki satın almanın sonucu bilinmiyor: önce durumu sor, körlemesine yeniden alma
                    await verifyPending();
                    return;
                }
                const current = shopRef.current;
                const snapshot = {
                    key: item.key,
                    item,
                    category: item.category,
                    tickets: toInt(current?.tickets),
                    quantity: toInt(item.quantity),
                    owned: !!item.owned,
                };
                let res;
                try {
                    res = await shopApi.buy(item.key);
                } catch (err) {
                    if (!err?.response) {
                        // Zaman aşımı / ağ: sunucu satın almayı işlemiş olabilir
                        pendingRef.current = snapshot;
                        await verifyPending();
                        return;
                    }
                    throw err;
                }
                const bought = res?.item && res.item.key === item.key ? res.item : { ...item, owned: true, quantity: toInt(item.quantity) + 1 };
                setShop((s) => {
                    const next = replaceItem(s, bought);
                    return {
                        ...next,
                        wallet: res?.wallet ? normalizeShop({ wallet: res.wallet }).wallet : s.wallet,
                        tickets: res?.tickets != null ? Math.max(0, toInt(res.tickets)) : s.tickets,
                    };
                });
                markBought(item, bought);
            } catch (err) {
                const e = buyErrorMessage(err);
                if (e.status === 409 && item.category !== 'consumable') {
                    // Zaten sende (başka sekmeden alınmış olabilir): yerel durumu düzelt
                    setShop((s) => replaceItem(s, { ...item, owned: true }));
                }
                if (e.reason === 'insufficient' && err?.response?.data?.data?.wallet) {
                    setShop((s) => ({ ...s, wallet: normalizeShop({ wallet: err.response.data.data.wallet }).wallet }));
                }
                setDrawerError({ message: e.message, reason: e.reason });
            } finally {
                busyRef.current = false;
                setBusy(false);
            }
        },
        [guest, setShop, markBought, verifyPending]
    );

    const handleEquip = useCallback(
        async (slot, key) => {
            if (guest || busyRef.current) return;
            busyRef.current = true;
            setBusy(true);
            setDrawerError(null);
            try {
                if (typeof slot === 'string' && slot.startsWith('kesif:')) {
                    // Keşif görünümü: iç içe gövde, özel yük (profil/kullanıcı detayına yazılmaz)
                    const slotKind = slot.slice('kesif:'.length);
                    const res = await shopApi.equip({ kesif: { [slotKind]: key } });
                    const raw = res?.kesif_loadout ?? res?.kesif?.loadout;
                    const next = normalizeKesifLoadout(raw != null ? raw : { ...shopRef.current.kesifLoadout, [slotKind]: key });
                    setShop((s) => ({ ...s, kesifLoadout: next, kesifKnown: true }));
                    const kname = key ? getDesign(key)?.name : null;
                    setAnnounce(key ? `${kname || 'Öğe'} kuşanıldı.` : 'Çıkarıldı.');
                    setCelebrate(null);
                    return;
                }
                const res = await shopApi.equip({ [slot]: key });
                const equipped = normalizeCosmetics(res?.equipped ?? { ...shop.equipped, [slot]: key });
                setShop((s) => ({ ...s, equipped }));
                syncCosmetics(equipped);
                const name = key ? getDesign(key)?.name : null;
                setAnnounce(key ? `${name || 'Öğe'} kuşanıldı.` : 'Çıkarıldı.');
                setCelebrate(null);
            } catch (err) {
                setDrawerError(shopError(err, 'Kaydedilemedi. Lütfen tekrar dene.').message);
            } finally {
                busyRef.current = false;
                setBusy(false);
            }
        },
        [guest, setShop, shop.equipped, syncCosmetics]
    );

    const avatar = user?.detail?.game_avatar ?? null;
    const gender = user?.gender ?? null;
    const previewUser = user ? { username: user.username, avatar: user.avatar } : null;

    const renderCard = (item, size = 'grid') => (
        <ShopCard
            item={item}
            equipped={shop.equipped}
            balance={shop.wallet.balance}
            onOpen={openItem}
            size={size}
            avatar={avatar}
            gender={gender}
            now={now}
            guest={guest}
            kesifLoadout={shop.kesifLoadout}
        />
    );

    const visible = useMemo(() => {
        let items = activeCat?.items || [];
        if (filter === 'owned') items = items.filter((i) => itemState(i, shop.equipped, shop.wallet.balance).owned);
        if (active === 'kesif') items = filterByKesifKind(items, kind);
        return sortItems(items, sort);
    }, [activeCat, active, filter, kind, sort, shop.equipped, shop.wallet.balance]);

    return (
        <>
            {guest ? <GuestHero /> : <WalletHero shop={shop} stale={stale} onHistory={() => setHistoryOpen(true)} />}

            <FeaturedStrip items={shop.featured} guest={guest} renderCard={renderCard} />

            <section className="mt-6" aria-label="Kategoriler">
                <CategoryTabs categories={categories} active={active} onChange={(k) => setParam({ kategori: k })} baseId={baseId} />

                <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={active ? `${baseId}-tab-${active}` : undefined} className="mt-4">
                    {!guest && (
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5" role="group" aria-label="Filtre">
                                {FILTERS.map((f) => (
                                    <button
                                        key={f.key}
                                        type="button"
                                        aria-pressed={filter === f.key}
                                        onClick={() => setFilter(f.key)}
                                        className={`min-h-[36px] rounded-lg px-3 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral ${
                                            filter === f.key ? 'bg-white text-slate-900 shadow dark:bg-white/15 dark:text-white' : 'text-slate-600 dark:text-slate-300'
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                {active === 'consumable' && (
                                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Sende {formatNumber(shop.tickets)} bilet var</span>
                                )}
                                <WalletChip balance={shop.wallet.balance} onClick={() => setHistoryOpen(true)} />
                            </div>
                        </div>
                    )}

                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        {active === 'kesif' ? <KesifChips items={activeCat?.items || []} value={kind} onChange={setKind} /> : <span />}
                        <SortSelect value={sort} onChange={setSort} />
                    </div>

                    {visible.length === 0 ? (
                        <div className="game-card rounded-3xl p-6 text-center">
                            <LuPackageOpen className="mx-auto mb-2 text-3xl text-indigo-400" aria-hidden="true" />
                            <p className="font-semibold">
                                {filter === 'owned' ? 'Bu kategoride henüz senin bir şeyin yok.' : 'Bu türde şu an ürün yok.'}
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    setFilter('all');
                                    setKind('all');
                                }}
                                className="mt-2 min-h-[44px] text-sm font-bold text-coral underline"
                            >
                                Tümünü göster
                            </button>
                        </div>
                    ) : (
                        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label={activeCat?.name}>
                            {visible.map((item) => (
                                <li key={item.key}>{renderCard(item)}</li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>

            <p className="sr-only" role="status" aria-live="polite">
                {announce}
            </p>

            <ItemDrawer
                key={selected?.key || 'none'}
                open={!!selected}
                item={selected}
                equipped={shop.equipped}
                balance={shop.wallet.balance}
                user={previewUser}
                avatar={avatar}
                gender={gender}
                guest={guest}
                busy={busy}
                kesifLoadout={shop.kesifLoadout}
                error={typeof drawerError === 'string' ? drawerError : drawerError?.message ?? null}
                errorReason={typeof drawerError === 'string' ? null : drawerError?.reason ?? null}
                onBuy={handleBuy}
                onEquip={handleEquip}
                onClose={closeItem}
            />
            <BuyCelebration
                open={!!celebrate}
                item={celebrate}
                equipped={shop.equipped}
                kesifLoadout={shop.kesifLoadout}
                user={previewUser}
                avatar={avatar}
                gender={gender}
                busy={busy}
                onEquip={handleEquip}
                onClose={() => !busyRef.current && setCelebrate(null)}
            />
            {!guest && <WalletHistory open={historyOpen} wallet={shop.wallet} onClose={() => setHistoryOpen(false)} />}
        </>
    );
};

const MemberShop = ({ user, updateUser }) => {
    const [state, setState] = useState({ status: 'loading', shop: null, error: null });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let alive = true;
        shopApi.get().then(
            (data) => alive && setState({ status: 'ready', shop: normalizeShop(data), error: null }),
            (err) => alive && setState({ status: 'error', shop: null, error: shopError(err, 'Mağaza yüklenemedi.').message })
        );
        return () => {
            alive = false;
        };
    }, [attempt]);

    const setShop = useCallback((updater) => {
        setState((s) => (s.shop ? { ...s, shop: typeof updater === 'function' ? updater(s.shop) : updater } : s));
    }, []);

    if (state.status === 'error') {
        return (
            <GameError
                message={state.error}
                onRetry={() => {
                    setState({ status: 'loading', shop: null, error: null });
                    setAttempt((a) => a + 1);
                }}
            />
        );
    }
    if (!state.shop) return <GameLoading label="Mağaza yükleniyor" />;
    return <Shop shop={state.shop} setShop={setShop} guest={false} user={user} updateUser={updateUser} />;
};

const noop = () => {};

const ShopPage = () => {
    const { user, isAuthenticated, loading, updateUser } = useAuth();

    return (
        <GameLayout
            title="Jeton Mağazası"
            docTitle="Mağaza"
            subtitle="Koşu ve kuleden kazandığın jetonlarla profilini süsle."
            back={{ to: '/oyun', label: 'Oyun Merkezi' }}
        >
            {loading && !isAuthenticated ? (
                <GameLoading label="Yükleniyor" />
            ) : isAuthenticated ? (
                <MemberShop user={user} updateUser={updateUser} />
            ) : (
                <Shop shop={GUEST_SHOP} setShop={noop} guest user={null} updateUser={noop} />
            )}
        </GameLayout>
    );
};

export default ShopPage;
