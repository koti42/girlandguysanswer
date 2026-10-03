import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { LuChevronRight } from 'react-icons/lu';
import ShopArt from './ShopArt';
import TitlePill from './TitlePill';
import RarityBadge from './RarityBadge';
import JetonAmount from './Jeton';
import { normalizeShop, pickShowcase } from './shopUtils';
import { shopApi } from '../../../services/shopApi';
import useAsync from '../useAsync';

/*
 * Oyun Merkezi'ndeki "Mağaza" kartı: cüzdan bakiyesi + vitrinden bir ürün.
 *
 * Üyede GET /game/shop çekilir (bakiye + Haftanın Vitrini); vitrinin ilk
 * çizilebilir ürünü (çerçeve / mini avatar / unvan) gösterilir. Misafirde ya
 * da istek düşerse sabit bir vitrin ürünü çizilir: kart hiçbir durumda boş
 * kalmaz, hub'ı da bekletmez. Görsel yalnızca koddaki tasarımdan (anahtar ile)
 * gelir; sunucudan işaretleme alınmaz.
 */
const Showcase = ({ pick }) => {
    const d = pick.design;
    if (!d) return null;
    if (d.category === 'title') {
        return (
            <span className="flex h-24 w-28 items-center justify-center sm:w-32">
                <TitlePill itemKey={pick.key} size="sm" srPrefix="" />
            </span>
        );
    }
    return (
        <span className="relative flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28">
            {d.category === 'frame' && (
                // Çerçevenin ortasındaki fotoğraf alanı (r=70/200): örnek bir zemin.
                <span className="absolute inset-[16%] rounded-full bg-gradient-to-br from-indigo-400/50 to-fuchsia-400/40" />
            )}
            <ShopArt itemKey={pick.key} className="relative h-full w-full" />
        </span>
    );
};

const ShopHubCard = ({ member = false, className = '' }) => {
    const fetchShop = useCallback(() => (member ? shopApi.get().then(normalizeShop) : Promise.resolve(null)), [member]);
    const { data } = useAsync(fetchShop, member ? 'm' : 'g');
    const pick = pickShowcase(data?.featured);
    const balance = data?.wallet?.balance;

    return (
        <Link
            to="/oyun/magaza"
            className={`group game-card game-press relative flex items-center gap-3 overflow-hidden rounded-3xl p-4 sm:p-5 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${className}`}
            aria-label={`Mağaza: profil çerçeveleri, mini avatarlar, unvanlar ve Mesaj Bileti${
                Number.isFinite(balance) ? `. Cüzdanında ${balance} jeton var` : ''
            }. Mağazaya git`}
        >
            <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-300/20 blur-2xl" aria-hidden="true" />
            <span className="relative min-w-0 flex-1" aria-hidden="true">
                <span className="flex items-center gap-2">
                    <ShopArt icon="shop" className="h-7 w-7 shrink-0" />
                    <span className="text-lg font-extrabold">Mağaza</span>
                </span>
                <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">
                    Koşu ve kulede kazandığın jetonlarla çerçeve, mini avatar ve unvan al.
                </span>
                {Number.isFinite(balance) ? (
                    <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-sm font-extrabold text-amber-700 dark:text-amber-300">
                        <JetonAmount value={balance} iconClassName="h-4 w-4" />
                    </span>
                ) : (
                    <span className="mt-2.5 inline-flex items-center gap-1 text-sm font-extrabold text-coral">
                        Vitrine göz at <LuChevronRight className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                )}
            </span>
            <span className="relative flex shrink-0 flex-col items-center gap-1" aria-hidden="true">
                <Showcase pick={pick} />
                {pick.design?.rarity && <RarityBadge rarity={pick.design.rarity} size="xs" />}
                <span className="max-w-[8rem] truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {pick.live ? 'Vitrinde: ' : ''}
                    {pick.design?.name}
                </span>
            </span>
        </Link>
    );
};

export default ShopHubCard;
