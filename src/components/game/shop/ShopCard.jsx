import React, { memo } from 'react';
import { LuCheck, LuLock, LuClock3 } from 'react-icons/lu';
import ShopItemPreview from './ShopItemPreview';
import RarityBadge from './RarityBadge';
import JetonAmount from './Jeton';
import useInView from './useInView';
import { rarityOf } from '../../../game/shop';
import { itemA11ySummary, itemState, lockText, shortLeft } from './shopUtils';

/*
 * Izgara / vitrin kartı. Kartın tamamı tek buton (klavye: Tab + Enter/Space)
 * ve ürün çekmecesini açar. Nadirlik: kenar rengi + parıltı (epik/efsanevi),
 * efsanevide kayan altın kenar. Rozetler: kuşanıldı / sende / kilit / süreli.
 */
const ShopCard = ({ item, equipped, balance = 0, onOpen, size = 'grid', avatar, gender, now, guest = false }) => {
    const [ref, inView] = useInView();
    const state = itemState(item, equipped, balance, now);
    const r = rarityOf(item.rarity);
    const featured = size === 'featured';
    const legendary = item.rarity === 'legendary';
    const leftMs = state.untilMs ? state.untilMs - now : null;
    const summary = itemA11ySummary(item, state, r.label);

    return (
        <button
            ref={ref}
            type="button"
            onClick={() => onOpen?.(item)}
            data-rarity={item.rarity || 'common'}
            data-testid={`shop-card-${item.key}`}
            aria-label={summary}
            className={`shop-card group flex h-full w-full flex-col overflow-hidden rounded-3xl border-2 bg-white text-left focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-coral dark:bg-[#1a1442] ${
                legendary ? 'shop-legendary-edge border-transparent' : ''
            }`}
            style={legendary ? undefined : { borderColor: `${r.glowColor}${item.rarity === 'common' ? '55' : '99'}` }}
        >
            <span
                className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[1.35rem] ${legendary ? 'shop-sheen' : ''}`}
                style={{
                    background: `radial-gradient(circle at 50% 38%, ${r.glowColor}${legendary ? '55' : '33'} 0%, transparent 62%), linear-gradient(180deg, #2a1a5e 0%, #151038 100%)`,
                }}
            >
                <span className={`flex h-full w-full items-center justify-center ${featured ? 'p-3' : 'p-2'}`}>
                    <ShopItemPreview item={item} animate={inView} avatar={avatar} gender={gender} />
                </span>

                {state.equipped ? (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-extrabold text-white shadow">
                        <LuCheck aria-hidden="true" /> Kuşanıldı
                    </span>
                ) : state.owned ? (
                    <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 shadow">
                        {state.consumable ? `Sende ×${state.quantity}` : 'Sende'}
                    </span>
                ) : null}

                {state.locked && (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-slate-950/75 px-2 py-0.5 text-[10px] font-bold text-white">
                        <LuLock aria-hidden="true" /> {lockText(item.unlock)}
                    </span>
                )}
                {!state.locked && leftMs != null && leftMs > 0 && (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-bold text-white tabular-nums">
                        <LuClock3 aria-hidden="true" /> {shortLeft(leftMs)}
                    </span>
                )}
            </span>

            <span className={`flex flex-1 flex-col gap-1 ${featured ? 'p-3.5' : 'p-2.5 sm:p-3'}`}>
                <span className={`line-clamp-1 font-extrabold text-slate-900 dark:text-white ${featured ? 'text-base' : 'text-sm'}`}>{item.name}</span>
                <span className="flex flex-wrap items-center justify-between gap-1">
                    <RarityBadge rarity={item.rarity} size="xs" />
                    <span className="text-sm font-extrabold">
                        {state.equipped || (state.owned && !state.consumable) ? (
                            <span className="text-emerald-600 dark:text-emerald-400">Sende</span>
                        ) : state.locked ? (
                            <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                <LuLock aria-hidden="true" className="text-xs" /> {lockText(item.unlock)}
                            </span>
                        ) : state.inactive ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">Satışta değil</span>
                        ) : state.price == null ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">{guest ? 'Giriş yap' : '—'}</span>
                        ) : state.free ? (
                            <span className="text-emerald-600 dark:text-emerald-400">Ücretsiz</span>
                        ) : (
                            <JetonAmount
                                value={state.price}
                                className={state.affordable ? 'text-amber-600 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}
                            />
                        )}
                    </span>
                </span>
            </span>
        </button>
    );
};

export default memo(ShopCard);
