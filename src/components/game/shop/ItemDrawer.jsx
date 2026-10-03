import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCheck, LuClock3, LuFootprints, LuBuilding2, LuLock, LuLogIn, LuShirt, LuShoppingBag, LuX, LuMessageCircle } from 'react-icons/lu';
import GameDialog from '../avatar/GameDialog';
import ShopItemPreview from './ShopItemPreview';
import ProfilePreview from './ProfilePreview';
import RarityBadge from './RarityBadge';
import JetonAmount from './Jeton';
import { rarityOf, slotOfCategory } from '../../../game/shop';
import { itemState, lockHint, lockText } from './shopUtils';
import { formatCountdown, formatNumber } from '../gameUtils';
import useNow from '../useNow';

/*
 * Ürün çekmecesi (dar ekranda alttan açılır, geniş ekranda ortada kart):
 * büyük önizleme, açıklama, kilit/süre bilgisi, "profilinde nasıl görünür"
 * canlı önizleme (kendi fotoğraf + kullanıcı adınla, kuşandıklarınla
 * birlikte), satın al → onay adımı, kuşan / çıkar.
 *
 * Satın alma iki adımlı: "Satın al" → fiyat/bakiye/sonra kalan özeti →
 * "Onayla". Bakiye yetmiyorsa onay kapalı, eksik miktar ve Koşu/Kule
 * bağlantıları gösterilir. Sunucu hatası pencerede kalır.
 */

const EarnLinks = () => (
    <div className="flex flex-wrap gap-2">
        <Link
            to="/oyun/kosu"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-4 text-sm font-bold text-white game-press"
        >
            <LuFootprints aria-hidden="true" /> Koşuda jeton topla
        </Link>
        <Link
            to="/oyun/kule"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-4 text-sm font-bold text-white game-press"
        >
            <LuBuilding2 aria-hidden="true" /> Kulede yüksel
        </Link>
    </div>
);

const ItemDrawer = ({
    open,
    item,
    equipped = {},
    balance = 0,
    user = null,
    avatar = null,
    gender = null,
    guest = false,
    busy = false,
    error = null,
    errorReason = null,
    onBuy,
    onEquip,
    onClose,
}) => {
    const [step, setStep] = useState('view');
    const now = useNow(1000, open && !!item?.available_until);
    if (!item) return null;

    const state = itemState(item, equipped, balance, now);
    const r = rarityOf(item.rarity);
    const slot = slotOfCategory(item.category);
    const leftMs = state.untilMs ? state.untilMs - now : null;
    const missing = state.price != null ? Math.max(0, state.price - balance) : 0;
    const previewCosmetics = slot ? { ...equipped, [slot]: item.key } : equipped;
    const confirming = step === 'confirm' && state.purchasable;

    return (
        <GameDialog open={open} title={confirming ? `${item.name} satın alınsın mı?` : item.name} onClose={onClose} dismissable={!busy} size="max-w-2xl">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-5" data-testid="item-drawer">
                {/* Büyük önizleme */}
                <div
                    className={`relative mx-auto flex aspect-square w-full max-w-[15rem] items-center justify-center overflow-hidden rounded-3xl ${item.rarity === 'legendary' ? 'shop-sheen' : ''}`}
                    style={{
                        background: `radial-gradient(circle at 50% 40%, ${r.glowColor}55 0%, transparent 62%), linear-gradient(180deg, #2a1a5e 0%, #151038 100%)`,
                        boxShadow: r.glow ? `0 16px 40px -18px ${r.glowColor}` : undefined,
                    }}
                >
                    <span className="flex h-full w-full items-center justify-center p-4">
                        <ShopItemPreview item={item} variant="big" user={user} avatar={avatar} gender={gender} />
                    </span>
                </div>

                <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <RarityBadge rarity={item.rarity} size="md" />
                        {state.equipped && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                <LuCheck aria-hidden="true" /> Kuşanıldı
                            </span>
                        )}
                        {state.owned && !state.equipped && (
                            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                {state.consumable ? `Sende: ${formatNumber(state.quantity)} adet` : 'Sende'}
                            </span>
                        )}
                    </div>

                    {item.description && <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{item.description}</p>}

                    {leftMs != null && leftMs > 0 && (
                        <p className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-300">
                            <LuClock3 aria-hidden="true" /> Satıştan kalkmasına <span className="tabular-nums">{formatCountdown(leftMs)}</span>
                        </p>
                    )}
                    {state.locked && (
                        <p className="flex items-start gap-2 rounded-2xl bg-slate-500/10 px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
                            <LuLock className="mt-0.5 shrink-0" aria-hidden="true" /> {lockHint(item.unlock)}
                        </p>
                    )}

                    {/* Canlı profil önizlemesi (kozmetikler) */}
                    {slot && !confirming && (
                        <div>
                            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Profilinde nasıl görünür</p>
                            <ProfilePreview user={user || { username: 'sen' }} cosmetics={previewCosmetics} />
                        </div>
                    )}
                    {item.category === 'avatar_part' && !confirming && (
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Karakter parçaları koşuda, kulede ve profilindeki karakter kartında görünür. Satın aldıktan sonra{' '}
                            <Link to="/oyun/karakter" className="font-bold text-coral underline">karakter editöründe</Link> giyebilirsin.
                        </p>
                    )}
                    {item.category === 'consumable' && !confirming && (
                        <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                            <LuMessageCircle className="mt-0.5 shrink-0 text-coral" aria-hidden="true" />
                            Mesajlarını kapatmış birinin profilinde ya da sohbetinde “Mesaj Bileti kullan” seçeneği çıkar. Bilet yalnızca gerçekten gerektiğinde harcanır.
                        </p>
                    )}

                    {/* Onay adımı */}
                    {confirming && (
                        <dl className="space-y-1.5 rounded-2xl bg-slate-100 p-3 text-sm dark:bg-white/5" data-testid="buy-confirm">
                            <div className="flex justify-between gap-3">
                                <dt className="text-slate-500 dark:text-slate-400">Fiyat</dt>
                                <dd className="font-extrabold">{state.free ? 'Ücretsiz' : <JetonAmount value={state.price} />}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-slate-500 dark:text-slate-400">Bakiyen</dt>
                                <dd className="font-bold tabular-nums">{formatNumber(balance)}</dd>
                            </div>
                            {state.affordable && (
                                <div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5 dark:border-white/10">
                                    <dt className="text-slate-500 dark:text-slate-400">Sonra kalan</dt>
                                    <dd className="font-bold tabular-nums">{formatNumber(balance - state.price)}</dd>
                                </div>
                            )}
                        </dl>
                    )}
                    {(confirming || (state.purchasable && !guest)) && !state.affordable && (
                        <div className="space-y-2 rounded-2xl bg-amber-500/10 px-3 py-2.5" role="status">
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                Yeterli jetonun yok: <strong className="tabular-nums">{formatNumber(missing)}</strong> jeton daha gerekiyor.
                            </p>
                            <EarnLinks />
                        </div>
                    )}

                    {/* Yetersiz bakiye zaten yukarıdaki kutuda anlatılıyor; sunucunun aynı hatası tekrar yazılmaz. */}
                    {error && !(errorReason === 'insufficient' && !state.affordable) && (
                        <p className="rounded-2xl bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-300" role="alert">
                            {error}
                        </p>
                    )}

                    {/* Eylemler */}
                    <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:flex-wrap sm:justify-end">
                        {guest ? (
                            <Link
                                to="/login"
                                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-6 font-bold text-white game-press game-glow-coral"
                            >
                                <LuLogIn aria-hidden="true" /> Satın almak için giriş yap
                            </Link>
                        ) : confirming ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setStep('view')}
                                    disabled={busy}
                                    className="min-h-[48px] rounded-2xl px-5 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onBuy?.(item)}
                                    disabled={busy || !state.affordable}
                                    data-autofocus
                                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-coral px-6 font-bold text-slate-950 shadow-lg game-press disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <LuShoppingBag aria-hidden="true" />
                                    {busy ? 'Satın alınıyor…' : state.free ? 'Ücretsiz al' : `${formatNumber(state.price)} jetona onayla`}
                                </button>
                            </>
                        ) : (
                            <>
                                {slot && state.owned && (
                                    state.equipped ? (
                                        <button
                                            type="button"
                                            onClick={() => onEquip?.(slot, null)}
                                            disabled={busy}
                                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 px-5 font-bold text-slate-700 game-press disabled:opacity-60 dark:border-white/20 dark:text-slate-200"
                                        >
                                            <LuX aria-hidden="true" /> {busy ? 'Kaydediliyor…' : 'Çıkar'}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => onEquip?.(slot, item.key)}
                                            disabled={busy}
                                            data-autofocus
                                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 font-bold text-white shadow-lg game-press disabled:opacity-60"
                                        >
                                            <LuShirt aria-hidden="true" /> {busy ? 'Kaydediliyor…' : 'Kuşan'}
                                        </button>
                                    )
                                )}
                                {item.category === 'avatar_part' && state.owned && (
                                    <Link
                                        to="/oyun/karakter"
                                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-6 font-bold text-white game-press"
                                    >
                                        <LuShirt aria-hidden="true" /> Karakterde giy
                                    </Link>
                                )}
                                {state.purchasable ? (
                                    <button
                                        type="button"
                                        onClick={() => setStep('confirm')}
                                        disabled={busy}
                                        data-autofocus={state.owned && slot ? undefined : true}
                                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-coral px-6 font-bold text-slate-950 shadow-lg game-press disabled:opacity-60"
                                    >
                                        <LuShoppingBag aria-hidden="true" />
                                        {state.free ? 'Ücretsiz al' : <>Satın al · <JetonAmount value={state.price} iconClassName="h-4 w-4" /></>}
                                    </button>
                                ) : !state.owned && state.locked ? (
                                    <button type="button" disabled className="inline-flex min-h-[48px] cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-slate-200 px-6 font-bold text-slate-500 dark:bg-white/10 dark:text-slate-400">
                                        <LuLock aria-hidden="true" /> {lockText(item.unlock)}
                                    </button>
                                ) : !state.owned && state.inactive ? (
                                    <button type="button" disabled className="inline-flex min-h-[48px] cursor-not-allowed items-center justify-center rounded-2xl bg-slate-200 px-6 font-bold text-slate-500 dark:bg-white/10 dark:text-slate-400">
                                        Satışta değil
                                    </button>
                                ) : null}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </GameDialog>
    );
};

export default ItemDrawer;
