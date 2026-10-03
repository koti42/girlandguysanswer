import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LuCoins, LuLock, LuLogIn, LuSave, LuShoppingBag, LuUndo2 } from 'react-icons/lu';
import { useAuth } from '../../context/AuthContext';
import GameLayout from '../../components/game/GameLayout';
import { GameError, GameLoading } from '../../components/game/GameStates';
import useAsync from '../../components/game/useAsync';
import { formatNumber } from '../../components/game/gameUtils';
import AvatarBust from '../../components/game/avatar/AvatarBust';
import AvatarPreview from '../../components/game/avatar/AvatarPreview';
import SlotTabs from '../../components/game/avatar/SlotTabs';
import ItemGrid from '../../components/game/avatar/ItemGrid';
import ItemIcon from '../../components/game/avatar/ItemIcon';
import ColorSwatches from '../../components/game/avatar/ColorSwatches';
import BuyDialog from '../../components/game/avatar/BuyDialog';
import {
    CLOTH_COLOR_NAMES,
    COLOR_SLOTS,
    HAIR_COLOR_NAMES,
    SKIN_NAMES,
    indexItems,
    itemState,
    keyLabel,
    lockHint,
    lockedKeysOf,
    panelId,
    sameAvatar,
    slotOptions,
    styleOf,
    tabId,
    withColor,
    withStyle,
} from '../../components/game/avatar/avatarUtils';
import { BODIES, CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, SLOTS, defaultAvatar, itemKey, normalizeAvatar } from '../../game/avatar/catalog';
import { avatarApi } from '../../services/avatarApi';
import { gameErrorData, gameErrorMessage, gameErrorStatus } from '../../services/gameApi';

/*
 * Oyun karakteri editörü (/oyun/karakter).
 *
 * Akış: GET /game/avatar (kayıtlı karakter + kilitler + cüzdan) -> taslak
 * üzerinde düzenleme (kilitli parçalar da önizlemede denenebilir) ->
 * kilitli parça için satın alma onayı -> PUT /game/avatar. Kaydedilince
 * AuthContext'teki user.detail.game_avatar güncellenir: koşu/kule yeni
 * karakteri hemen kullanır.
 *
 * Sunucu verisi useAsync'ten salt okunur gelir; satın alma ve kayıt sonrası
 * değişiklikler `patch` içinde tutulup üstüne uygulanır (effect içinde state
 * kopyalama yok).
 */

const LEAVE_MSG = 'Kaydedilmemiş değişikliklerin var. Çıkarsan kaybolacak. Yine de çıkılsın mı?';

const SLOT_COPY = {
    body: { legend: 'Vücut tipi', hint: 'Yalnızca siluet ve oranlar değişir; tüm parçalar herkese açık.' },
    skin: { legend: 'Ten rengi' },
    hair: { legend: 'Saç stili', color: 'Saç rengi' },
    top: { legend: 'Üst giysi', color: 'Renk' },
    bottom: { legend: 'Alt giysi', color: 'Renk', hint: 'Alt giysi 3D karakterde görünür.' },
    shoes: { legend: 'Ayakkabı', color: 'Renk', hint: 'Ayakkabılar 3D karakterde görünür.' },
    acc: { legend: 'Aksesuar' },
    trail: { legend: 'Koşu izi', hint: 'Koşu izi koşarken arkanda kalır; önizlemeye dokununca kısa bir gösterim yapar.' },
};

const COLOR_PALETTES = {
    hair: { colors: HAIR_COLORS, names: HAIR_COLOR_NAMES },
    top: { colors: CLOTH_COLORS, names: CLOTH_COLOR_NAMES },
    bottom: { colors: CLOTH_COLORS, names: CLOTH_COLOR_NAMES },
    shoes: { colors: CLOTH_COLORS, names: CLOTH_COLOR_NAMES },
};

const FREE = { unlocked: true, owned: false, kind: 'free' };

/*
 * Kaydedilmemiş değişiklik uyarısı. BrowserRouter'da useBlocker yok: site içi
 * bağlantı tıklamaları yakalama evresinde (React'in kök dinleyicisinden önce)
 * onaya sorulur; sekme kapatma / yenileme için beforeunload.
 */
function useUnsavedGuard(active) {
    useEffect(() => {
        if (!active) return undefined;
        const onBeforeUnload = (e) => {
            e.preventDefault();
            e.returnValue = '';
        };
        const onClick = (e) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const a = e.target?.closest?.('a[href]');
            if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
            let url;
            try {
                url = new URL(a.getAttribute('href'), window.location.href);
            } catch {
                return;
            }
            if (url.origin !== window.location.origin) return; // dış bağlantı: beforeunload
            if (url.pathname === window.location.pathname && url.search === window.location.search) return;
            if (!window.confirm(LEAVE_MSG)) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        document.addEventListener('click', onClick, true);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            document.removeEventListener('click', onClick, true);
        };
    }, [active]);
}

const WalletChip = ({ balance }) => (
    <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1.5 text-sm font-extrabold text-amber-700 ring-1 ring-amber-400/40 dark:text-amber-200"
        aria-label={`Cüzdan: ${formatNumber(balance)} jeton`}
        data-testid="wallet-balance"
    >
        <LuCoins aria-hidden="true" />
        <span className="tabular-nums" aria-hidden="true">{formatNumber(balance)}</span>
    </span>
);

const GuestView = () => (
    <GameLayout title="Karakterin" docTitle="Karakter" back={{ to: '/oyun', label: 'Oyun Merkezi' }} maxWidth="max-w-3xl">
        <section className="game-hero relative overflow-hidden rounded-3xl p-6 sm:p-8 game-pop-in" aria-labelledby="karakter-misafir">
            <div className="flex flex-col items-center gap-6 sm:flex-row">
                <div className="flex shrink-0 items-end -space-x-6">
                    <AvatarBust config={defaultAvatar('female')} className="h-28 w-28 drop-shadow-xl game-float" />
                    <AvatarBust config={{ ...defaultAvatar('male'), acc: 'sapka' }} className="h-28 w-28 drop-shadow-xl game-float [animation-delay:600ms]" />
                </div>
                <div className="text-center sm:text-left">
                    <h2 id="karakter-misafir" className="text-xl font-extrabold">
                        Kendi karakterini tasarla
                    </h2>
                    <p className="mt-1.5 text-sm text-white/75">
                        Saç, kıyafet, aksesuar ve koşu izi seç; koşuda ve kulede karakterinle yarış. Karakter oluşturmak için giriş yapmalısın.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
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
                    <p className="mt-3 text-xs text-white/60">
                        Giriş yapmadan da{' '}
                        <Link to="/oyun/kosu" className="font-bold text-gold underline">
                            antrenmanda
                        </Link>{' '}
                        varsayılan karakterle koşabilirsin.
                    </p>
                </div>
            </div>
        </section>
    </GameLayout>
);

const Editor = ({ user, onSaved }) => {
    const baseId = useId();
    const gender = user?.gender;
    const fetcher = useCallback(() => avatarApi.get(), []);
    const { data, error: loadError, reload } = useAsync(fetcher, user?.id ?? 'me');

    // Sunucu yanıtının üstüne uygulanan yerel değişiklikler.
    const [patch, setPatch] = useState({ wallet: null, owned: [], locked: [], saved: null });
    const [draft, setDraft] = useState(null);
    const [slot, setSlot] = useState(SLOTS[0].id);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [buy, setBuy] = useState(null);
    const [buying, setBuying] = useState(false);
    const [buyError, setBuyError] = useState(null);

    const index = useMemo(() => {
        const idx = indexItems(data?.items);
        for (const k of patch.locked) {
            const it = idx.get(k);
            if (it) idx.set(k, { ...it, unlocked: false, owned: false });
        }
        for (const k of patch.owned) {
            const it = idx.get(k);
            if (it) idx.set(k, { ...it, owned: true, unlocked: true });
        }
        return idx;
    }, [data, patch.owned, patch.locked]);

    const saved = useMemo(
        () => patch.saved ?? (data ? normalizeAvatar(data.avatar, gender) : null),
        [patch.saved, data, gender]
    );
    const current = draft ?? saved;
    const wallet = patch.wallet ?? data?.wallet ?? null;
    const balance = Number(wallet?.balance) || 0;
    const level = data?.player?.level ?? 1;
    const isDefault = !!data?.is_default && !patch.saved;
    const dirty = !!draft && !!saved && !sameAvatar(draft, saved);
    const locked = current ? lockedKeysOf(current, index) : [];
    const canSave = !!current && (dirty || isDefault) && locked.length === 0 && !saving;

    useUnsavedGuard(dirty);

    // Karakter başka bir cihazda (mobil) kaydedildiyse oturumdaki kopyayı tazele:
    // oyunlar AuthContext'ten okuyor.
    // Yalnızca ilk yükleme: burada kaydedildikten sonra `data` eskidir.
    const serverAvatar = data && !data.is_default && !patch.saved ? data.avatar : null;
    const sessionAvatar = user?.detail?.game_avatar ?? null;
    useEffect(() => {
        if (serverAvatar && JSON.stringify(serverAvatar) !== JSON.stringify(sessionAvatar)) onSaved?.(serverAvatar);
    }, [serverAvatar, sessionAvatar, onSaved]);

    const update = (next) => {
        setDraft(next);
        setSaveError(null);
    };

    const onSave = async () => {
        if (!canSave) return;
        const sent = normalizeAvatar(current, gender);
        setSaving(true);
        setSaveError(null);
        try {
            const res = await avatarApi.save(sent);
            const stored = res?.avatar && typeof res.avatar === 'object' ? res.avatar : sent;
            setPatch((p) => ({ ...p, saved: normalizeAvatar(stored, gender) }));
            // Kayıt sürerken yapılan yeni seçim kaybolmasın.
            setDraft((d) => (d && !sameAvatar(d, sent) ? d : null));
            onSaved?.(stored);
            toast.success('Karakterin kaydedildi! Koşuda ve kulede bu karakterle oynayacaksın.');
        } catch (err) {
            const item = gameErrorData(err)?.item;
            if (gameErrorStatus(err) === 422 && typeof item === 'string') {
                setPatch((p) => ({ ...p, locked: [...new Set([...p.locked, item])], owned: p.owned.filter((k) => k !== item) }));
            }
            setSaveError(gameErrorMessage(err, 'Karakter kaydedilemedi. Lütfen tekrar dene.'));
        } finally {
            setSaving(false);
        }
    };

    const openBuy = (key) => {
        const st = itemState(index.get(key));
        if (st.kind !== 'price' || st.unlocked) return;
        setBuyError(null);
        setBuy({ key, label: keyLabel(key), price: st.price ?? 0 });
    };

    const confirmBuy = async () => {
        if (!buy || buying) return;
        const { key, label } = buy;
        setBuying(true);
        setBuyError(null);
        try {
            const res = await avatarApi.buy(key);
            const owned = Array.isArray(res?.owned_keys) ? res.owned_keys : [key];
            setPatch((p) => ({
                ...p,
                wallet: res?.wallet ?? p.wallet,
                owned: [...new Set([...p.owned, ...owned, key])],
                locked: p.locked.filter((k) => k !== key),
            }));
            setBuy(null);
            toast.success(`${label} artık senin! Giymek için kaydetmeyi unutma.`);
        } catch (err) {
            if (gameErrorStatus(err) === 409) {
                // Zaten sahip (başka sekmede / cihazda alınmış).
                setPatch((p) => ({ ...p, owned: [...new Set([...p.owned, key])], locked: p.locked.filter((k) => k !== key) }));
                setBuy(null);
                toast.success(`${label} zaten sende.`);
            } else {
                setBuyError(gameErrorMessage(err, 'Satın alma tamamlanamadı. Lütfen tekrar dene.'));
            }
        } finally {
            setBuying(false);
        }
    };

    if (loadError) {
        return (
            <GameLayout title="Karakterin" docTitle="Karakter" back={{ to: '/oyun', label: 'Oyun Merkezi' }}>
                <GameError message={gameErrorMessage(loadError, 'Karakter yüklenemedi.')} onRetry={reload} />
            </GameLayout>
        );
    }
    if (!data || !current) {
        return (
            <GameLayout title="Karakterin" docTitle="Karakter" back={{ to: '/oyun', label: 'Oyun Merkezi' }}>
                <GameLoading label="Karakter yükleniyor" />
            </GameLayout>
        );
    }

    const copy = SLOT_COPY[slot] || {};
    const flagged = [...new Set(locked.map((k) => k.split(':')[0]))];
    const selectedKey = COLOR_SLOTS.includes(slot) || slot === 'acc' || slot === 'trail' ? itemKey(slot, styleOf(current, slot)) : null;
    const selectedState = selectedKey ? itemState(index.get(selectedKey)) : FREE;

    const renderPreview = (opt) => {
        if (slot === 'body') {
            return <AvatarBust config={{ ...current, body: opt.id }} className="h-full w-full" />;
        }
        if (slot === 'bottom' || slot === 'shoes') {
            return <ItemIcon itemKey={opt.key} color={CLOTH_COLORS[current[slot].color]} className="h-3/4 w-3/4" />;
        }
        if (slot === 'trail') return <ItemIcon itemKey={opt.key} className="h-3/4 w-3/4" />;
        return <AvatarBust config={withStyle(current, slot, opt.id)} className="h-full w-full" />;
    };

    const buySlot = buy?.key.split(':')[0];
    let buyPreview = null;
    if (buySlot === 'bottom' || buySlot === 'shoes') {
        buyPreview = <ItemIcon itemKey={buy.key} color={CLOTH_COLORS[current[buySlot].color]} className="h-16 w-16" />;
    } else if (buySlot === 'trail') {
        buyPreview = <ItemIcon itemKey={buy.key} className="h-16 w-16" />;
    } else if (buySlot) {
        buyPreview = <AvatarBust config={withStyle(current, buySlot, buy.key.split(':')[1])} className="h-full w-full" />;
    }

    let status;
    if (saveError) status = <span className="text-rose-600 dark:text-rose-300" role="alert">{saveError}</span>;
    else if (locked.length) {
        status = (
            <span className="text-amber-700 dark:text-amber-200">
                Kilitli parça seçili: {locked.map(keyLabel).join(', ')}. Satın al ya da açık bir parça seç.
            </span>
        );
    } else if (dirty) status = 'Kaydedilmemiş değişikliklerin var.';
    else if (isDefault) status = 'Bu varsayılan karakter. Beğendiysen kaydet, profilinde de görünsün.';
    else status = 'Tüm değişiklikler kayıtlı.';

    return (
        <GameLayout
            title="Karakterin"
            docTitle="Karakter"
            subtitle="Koşuda ve kulede bu karakterle oynarsın."
            back={{ to: '/oyun', label: 'Oyun Merkezi' }}
            actions={<WalletChip balance={balance} />}
        >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
                <div className="space-y-3">
                    <section className="game-hero relative rounded-3xl p-2 shadow-xl" aria-label="Karakter önizlemesi">
                        <AvatarPreview config={current} gender={gender} className="h-64 rounded-2xl sm:h-80 lg:h-[26rem]" />
                        <span className="absolute left-4 top-4 rounded-full bg-gradient-to-r from-gold to-coral px-2.5 py-1 text-[11px] font-extrabold text-slate-950 shadow">
                            Seviye {level}
                        </span>
                    </section>

                    {/*
                      * Kaydet çubuğu. Dar ekranda (md altı) ekranın altına sabit: uzun
                      * ızgarada aşağıdayken de elinin altında. Sitenin kabuğu
                      * overflow-x-hidden olduğundan `sticky` çalışmıyor, `fixed`
                      * kullanılır. Genişte önizlemenin altında (sağ alttaki mesaj
                      * kutusuyla çakışmasın).
                      */}
                    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-indigo-100 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_24px_-12px_rgba(49,46,129,0.25)] backdrop-blur md:static md:rounded-2xl md:border md:p-3 md:shadow-md dark:border-white/10 dark:bg-[#151038]/95">
                        <div className="mx-auto flex max-w-5xl flex-col gap-2">
                            <p className="line-clamp-2 text-xs font-medium text-slate-600 sm:text-sm dark:text-slate-300" aria-live="polite">
                                {status}
                            </p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDraft(null);
                                        setSaveError(null);
                                    }}
                                    disabled={!dirty || saving}
                                    className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-slate-100 px-4 font-semibold text-slate-700 game-press disabled:opacity-40 dark:bg-white/10 dark:text-slate-200"
                                >
                                    <LuUndo2 aria-hidden="true" /> Geri al
                                </button>
                                <button
                                    type="button"
                                    onClick={onSave}
                                    disabled={!canSave}
                                    className="inline-flex min-h-[48px] flex-[2] items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-gradient-to-r from-coral to-fuchsia-500 px-6 font-bold text-white shadow-lg game-press disabled:opacity-40"
                                >
                                    <LuSave aria-hidden="true" /> {saving ? 'Kaydediliyor…' : 'Kaydet'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <section className="game-card rounded-3xl p-3 sm:p-5">
                    <SlotTabs slots={SLOTS} active={slot} onChange={setSlot} baseId={baseId} flagged={flagged} />

                    <div
                        role="tabpanel"
                        id={panelId(baseId, slot)}
                        aria-labelledby={tabId(baseId, slot)}
                        className="mt-4 space-y-5"
                        data-testid={`panel-${slot}`}
                    >
                        {slot === 'body' && (
                            <ItemGrid
                                legend={copy.legend}
                                options={BODIES.map((b) => ({ id: b.id, label: b.label, key: `body:${b.id}`, state: FREE }))}
                                value={current.body}
                                onChange={(id) => update({ ...current, body: id })}
                                renderPreview={renderPreview}
                            />
                        )}

                        {slot === 'skin' && (
                            <ColorSwatches
                                legend={copy.legend}
                                colors={SKIN_TONES}
                                names={SKIN_NAMES}
                                value={current.skin}
                                onChange={(i) => update(withColor(current, 'skin', i))}
                            />
                        )}

                        {selectedKey && (
                            <>
                                <ItemGrid
                                    legend={copy.legend}
                                    options={slotOptions(slot, index)}
                                    value={styleOf(current, slot)}
                                    onChange={(id) => update(withStyle(current, slot, id))}
                                    renderPreview={renderPreview}
                                />
                                {!selectedState.unlocked && (
                                    <div
                                        className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-400/10 px-4 py-3 ring-1 ring-amber-400/30"
                                        data-testid="lock-strip"
                                    >
                                        <LuLock className="shrink-0 text-amber-500" aria-hidden="true" />
                                        <p className="min-w-0 flex-1 text-sm font-medium text-amber-900 dark:text-amber-100">
                                            <strong>{keyLabel(selectedKey)}</strong> kilitli. {lockHint(selectedState)}
                                            {selectedState.kind === 'level' && ` Şu an seviye ${level}.`}
                                        </p>
                                        {selectedState.kind === 'price' && (
                                            <button
                                                type="button"
                                                onClick={() => openBuy(selectedKey)}
                                                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-coral px-4 text-sm font-bold text-slate-950 shadow game-press"
                                            >
                                                <LuShoppingBag aria-hidden="true" /> Satın al
                                            </button>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {COLOR_PALETTES[slot] && (
                            <ColorSwatches
                                legend={copy.color}
                                colors={COLOR_PALETTES[slot].colors}
                                names={COLOR_PALETTES[slot].names}
                                value={current[slot].color}
                                onChange={(i) => update(withColor(current, slot, i))}
                            />
                        )}

                        {copy.hint && <p className="text-xs text-slate-500 dark:text-slate-400">{copy.hint}</p>}
                    </div>
                </section>
            </div>

            {/* Dar ekranda sabit kaydet çubuğu ızgaranın altında kalmasın. */}
            <div className="h-32 md:hidden" aria-hidden="true" />

            <BuyDialog
                open={!!buy}
                item={buy}
                balance={balance}
                busy={buying}
                error={buyError}
                onConfirm={confirmBuy}
                onClose={() => !buying && setBuy(null)}
                preview={buyPreview}
            />
        </GameLayout>
    );
};

const AvatarEditorPage = () => {
    const { user, isAuthenticated, loading, setGameAvatar } = useAuth();

    if (loading && !isAuthenticated) {
        return (
            <GameLayout title="Karakterin" docTitle="Karakter" back={{ to: '/oyun', label: 'Oyun Merkezi' }}>
                <GameLoading label="Yükleniyor" />
            </GameLayout>
        );
    }
    if (!isAuthenticated) return <GuestView />;
    return <Editor user={user} onSaved={setGameAvatar} />;
};

export default AvatarEditorPage;
