import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { LuShirt, LuSparkles } from 'react-icons/lu';
import GameDialog from '../avatar/GameDialog';
import ShopItemPreview from './ShopItemPreview';
import RarityBadge from './RarityBadge';
import { rarityOf, slotOfCategory } from '../../../game/shop';

/*
 * Satın alma kutlaması: ışın halesi + konfeti + öğenin "pop" girişi.
 * Konfeti saf CSS (shop.css), ek bağımlılık yok; prefers-reduced-motion'da
 * ışınlar/konfeti/pop kapanır, yalnız sakin bir kart kalır.
 * Kozmetikte "Hemen kuşan", karakter parçasında "Karakterde giy".
 */

const COLORS = ['#FFD34D', '#FF6B6B', '#B47CFF', '#5AA2FF', '#3DDC84', '#FF8FA3'];

function confettiPieces(seedKey, n = 28) {
    // Anahtardan türeyen sabit dağılım (render'lar arasında zıplamasın)
    let s = 0;
    for (let i = 0; i < seedKey.length; i++) s = (s * 33 + seedKey.charCodeAt(i)) >>> 0;
    const rnd = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
    return Array.from({ length: n }, (_, i) => {
        const angle = rnd() * Math.PI * 2;
        const dist = 90 + rnd() * 140;
        return {
            '--x': `${Math.round(Math.cos(angle) * dist)}px`,
            '--y': `${Math.round(Math.sin(angle) * dist * 0.8 + 120)}px`,
            '--r': `${Math.round(rnd() * 720 - 360)}deg`,
            '--d': `${Math.round(rnd() * 220)}ms`,
            '--c': COLORS[i % COLORS.length],
            width: `${6 + Math.round(rnd() * 5)}px`,
            height: `${8 + Math.round(rnd() * 7)}px`,
        };
    });
}

const BuyCelebration = ({ open, item, equipped = {}, user, avatar, gender, busy = false, onEquip, onClose }) => {
    const pieces = useMemo(() => confettiPieces(item?.key || 'x'), [item?.key]);
    if (!item) return null;
    const slot = slotOfCategory(item.category);
    const r = rarityOf(item.rarity);
    const alreadyEquipped = slot && equipped?.[slot] === item.key;
    // Unvan rozeti yatay: kare kutuda büyük boy metin kırpılıyordu ("Gece K…").
    const wide = item.category === 'title';

    return (
        <GameDialog open={open} title="Senin oldu!" onClose={onClose} dismissable={!busy}>
            <div className="relative -mx-5 -mt-2 overflow-hidden px-5 pt-2 text-center" data-testid="buy-celebration">
                <div className={`relative mx-auto flex h-48 max-w-full items-center justify-center ${wide ? 'w-72' : 'w-48'}`}>
                    <span className="shop-rays absolute -inset-10 rounded-full" aria-hidden="true" />
                    <span
                        className="absolute inset-3 rounded-full blur-2xl"
                        style={{ background: `${r.glowColor}66` }}
                        aria-hidden="true"
                    />
                    <span className={`shop-celebrate-pop relative flex h-40 max-w-full items-center justify-center ${wide ? 'w-64' : 'w-40'}`}>
                        <ShopItemPreview item={item} variant="big" user={user} avatar={avatar} gender={gender} />
                    </span>
                    <span className="shop-confetti" aria-hidden="true">
                        {pieces.map((style, i) => (
                            <span key={i} style={style} />
                        ))}
                    </span>
                </div>

                <p className="mt-2 text-xl font-extrabold">{item.name}</p>
                <div className="mt-1.5 flex justify-center">
                    <RarityBadge rarity={item.rarity} size="md" />
                </div>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300" role="status">
                    {item.category === 'consumable'
                        ? 'Bilet cüzdanına eklendi. Mesajlarını kapatmış birine yazarken kullanabilirsin.'
                        : slot
                            ? alreadyEquipped
                                ? 'Profilinde görünüyor.'
                                : 'Koleksiyonuna eklendi. Kuşanırsan profilinde ve liderliklerde görünür.'
                            : 'Koleksiyonuna eklendi.'}
                </p>

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        data-autofocus={slot && !alreadyEquipped ? undefined : true}
                        className="min-h-[48px] rounded-2xl px-5 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                        Harika!
                    </button>
                    {slot && !alreadyEquipped && (
                        <button
                            type="button"
                            onClick={() => onEquip?.(slot, item.key)}
                            disabled={busy}
                            data-autofocus
                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 font-bold text-white shadow-lg game-press disabled:opacity-60"
                        >
                            <LuSparkles aria-hidden="true" /> {busy ? 'Kaydediliyor…' : 'Hemen kuşan'}
                        </button>
                    )}
                    {item.category === 'avatar_part' && (
                        <Link
                            to="/oyun/karakter"
                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-6 font-bold text-white game-press"
                        >
                            <LuShirt aria-hidden="true" /> Karakterde giy
                        </Link>
                    )}
                </div>
            </div>
        </GameDialog>
    );
};

export default BuyCelebration;
