import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCircleAlert, LuCoins, LuMap } from 'react-icons/lu';
import GameDialog from '../avatar/GameDialog';
import JetonAmount from '../shop/Jeton';
import kesifApiDefault from '../../../services/kesifApi';
import { formatNumber } from '../gameUtils';
import { DEFAULT_SLOT_PACK, DEFAULT_SLOT_PRICE, classifyKesifError, kesifErrorText, slotLabel } from './kesifUtils';

const CONFETTI_COLORS = ['#ffd34d', '#2dd4bf', '#a78bfa', '#fb7185', '#60a5fa', '#a3e635'];

// Sabit dağılım: render'lar arasında zıplamasın (Math.random yok).
function confettiPieces(n = 22) {
    let s = 20261016;
    const rnd = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
    return Array.from({ length: n }, (_, i) => {
        const angle = rnd() * Math.PI * 2;
        const dist = 80 + rnd() * 120;
        return {
            '--x': `${Math.round(Math.cos(angle) * dist)}px`,
            '--y': `${Math.round(Math.sin(angle) * dist * 0.7 + 60)}px`,
            '--r': `${Math.round(rnd() * 540 - 270)}deg`,
            '--d': `${Math.round(rnd() * 200)}ms`,
            '--c': CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        };
    });
}

const EARN_LINKS = [
    { to: '/oyun/kosu', label: 'Herkesler Koşuyor' },
    { to: '/oyun/kule', label: 'Herkesler Yükseliyor' },
];

/**
 * Harita Hakkı Al penceresi: 10.000 jeton = +5 harita hakkı (fiyat/paket
 * sunucudan, profile.slot_price / slot_pack).
 *
 * Akış: onay -> satın alma -> kutlama. Çift dokunuş ref kilidiyle tek isteğe
 * iner; her istek taze Idempotency-Key taşır. Belirsiz sonuçlarda (409,
 * ağ/5xx) sunucudaki gerçek hak sayısı overview ile doğrulanır: hak arttıysa
 * başarı sayılır, artmadıysa güvenle tekrar denenebilir (çift ücret yok).
 *
 * `onChange({ profile?, wallet? })` her güncel sunucu verisinde çağrılır;
 * lobi sayaçlarını/bakiyeyi buradan tazeler.
 */
const SlotShop = ({ open, api = kesifApiDefault, profile, wallet, onClose, onChange }) => {
    const price = Number(profile?.slot_price) > 0 ? Number(profile.slot_price) : DEFAULT_SLOT_PRICE;
    const pack = Number(profile?.slot_pack) > 0 ? Number(profile.slot_pack) : DEFAULT_SLOT_PACK;
    // Bakiye henüz bilinmiyorsa (özet yükleniyor / alınamadı) "yetersiz" denmez: sunucu karar verir (422 insufficient).
    const walletKnown = wallet != null && Number.isFinite(Number(wallet.balance));
    const balance = walletKnown ? Number(wallet.balance) : 0;
    const slots = Number(profile?.map_slots) || 0;
    const used = Number(profile?.maps_used) || 0;

    const [phase, setPhase] = useState('idle'); // idle | buying | success
    const [error, setError] = useState('');
    const [after, setAfter] = useState(null); // { profile, wallet, purchased }
    const lock = useRef(false);
    const mounted = useRef(true);
    const pieces = useMemo(() => confettiPieces(), []);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // Her açılışta temiz başla (render sırasında türetilmiş durum; effect'te setState yok).
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setPhase('idle');
            setError('');
            setAfter(null);
        }
    }
    useEffect(() => {
        if (open) lock.current = false;
    }, [open]);

    if (!open) return null;

    const missing = Math.max(0, price - balance);
    const insufficient = walletKnown && missing > 0;

    const finish = (res) => {
        if (!mounted.current) return;
        setAfter(res);
        setPhase('success');
        onChange?.({ profile: res.profile, wallet: res.wallet });
    };

    // Belirsiz sonuç: gerçek hak sayısına bak.
    const verify = async () => {
        try {
            const ov = await api.overview();
            if (ov?.wallet) onChange?.({ wallet: ov.wallet });
            if (ov?.profile) onChange?.({ profile: ov.profile });
            const grown = Number(ov?.profile?.map_slots) - slots;
            if (grown > 0) {
                finish({ profile: ov.profile, wallet: ov.wallet, purchased: grown });
                return true;
            }
        } catch {
            // doğrulanamadı: kullanıcı yeniden deneyebilir
        }
        return false;
    };

    const buy = async () => {
        if (lock.current || phase === 'buying' || insufficient) return;
        lock.current = true;
        setPhase('buying');
        setError('');
        try {
            const res = await api.buySlots();
            finish({ profile: res?.profile, wallet: res?.wallet, purchased: Number(res?.purchased) || pack });
        } catch (err) {
            const { kind, data } = classifyKesifError(err);
            if (!mounted.current) return;
            if (kind === 'insufficient') {
                // Sunucudaki bakiye ekrandakinden düşükmüş: ekranı düzelt.
                if (data.wallet) onChange?.({ wallet: data.wallet });
                else if (Number.isFinite(Number(data.balance))) onChange?.({ wallet: { ...(wallet || {}), balance: Number(data.balance) } });
                setError('');
            } else if (kind === 'conflict' || kind === 'network' || kind === 'server') {
                if (await verify()) return;
                setError(
                    kind === 'conflict'
                        ? 'Başka bir işlem sürüyor. Birkaç saniye sonra tekrar dene; jetonun ancak bir kez düşer.'
                        : kesifErrorText(err)
                );
            } else {
                setError(kesifErrorText(err, 'Satın alma tamamlanamadı.'));
            }
            lock.current = false;
            setPhase('idle');
        }
    };

    const buying = phase === 'buying';
    const newProfile = after?.profile;
    const newTotal = Number(newProfile?.map_slots) || slots + (after?.purchased || pack);
    const newUsed = Number(newProfile?.maps_used ?? used) || 0;

    return (
        <GameDialog open={open} title={phase === 'success' ? 'Harita hakkı senin!' : 'Harita Hakkı Al'} onClose={onClose} dismissable={!buying}>
            {phase === 'success' ? (
                <div className="text-center" data-testid="kesif-slot-success">
                    <div className="kesif-burst" aria-hidden="true">
                        <span className="kesif-confetti">
                            {pieces.map((style, i) => (
                                <span key={i} style={style} />
                            ))}
                        </span>
                        <span className="kesif-burst-cubes">
                            {Array.from({ length: Math.min(10, after?.purchased || pack) }, (_, i) => (
                                <span key={i} className="kesif-cube" style={{ '--i': i }} />
                            ))}
                        </span>
                    </div>
                    <p className="text-xl font-extrabold" role="status">
                        +{after?.purchased || pack} harita hakkı eklendi
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        Toplam hakkın <strong>{slotLabel(newUsed, newTotal)}</strong> (dolu/toplam). Artık yeni dünyalarını kaydedip paylaşabilirsin.
                    </p>
                    {after?.wallet && (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                            Kalan bakiyen: <JetonAmount value={after.wallet.balance} className="font-extrabold" />
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        data-autofocus
                        className="mt-5 min-h-[48px] w-full rounded-2xl bg-gradient-to-r from-amber-300 to-amber-400 px-5 font-black text-slate-950 shadow-lg game-press"
                    >
                        Harika!
                    </button>
                </div>
            ) : (
                <div>
                    <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3 dark:bg-amber-400/10">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center bg-gradient-to-br from-amber-200 to-amber-400 text-slate-950 shadow" aria-hidden="true">
                            <LuMap className="text-2xl" />
                        </span>
                        <div className="min-w-0">
                            <p className="font-extrabold">+{pack} harita hakkı</p>
                            <p className="text-sm text-slate-600 dark:text-slate-300">Her hak, kendi yaptığın bir haritayı kaydetmeni sağlar.</p>
                        </div>
                        <JetonAmount value={price} className="ml-auto shrink-0 text-lg font-black" iconClassName="h-5 w-5" />
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                            <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Bakiyen</dt>
                            <dd className="font-extrabold">
                                {walletKnown ? <JetonAmount value={balance} /> : <span aria-label="Bakiye yükleniyor">…</span>}
                            </dd>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                            <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Harita hakkın</dt>
                            <dd className="font-extrabold tabular-nums">
                                {slotLabel(used, slots)} <span className="text-xs font-semibold text-slate-500">→ {slotLabel(used, slots + pack)}</span>
                            </dd>
                        </div>
                    </dl>

                    {insufficient && (
                        <div role="status" className="mt-3 rounded-2xl bg-rose-500/10 px-3 py-3 text-sm text-rose-900 dark:text-rose-100" data-testid="kesif-slot-insufficient">
                            <p className="flex items-start gap-2 font-bold">
                                <LuCircleAlert className="mt-0.5 shrink-0" aria-hidden="true" />
                                <span>Yeterli jetonun yok: {formatNumber(missing)} jeton daha lazım.</span>
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
                                <LuCoins aria-hidden="true" /> Jeton kazanmak için oyna:
                            </p>
                            <ul className="mt-1.5 flex flex-wrap gap-2">
                                {EARN_LINKS.map((l) => (
                                    <li key={l.to}>
                                        <Link
                                            to={l.to}
                                            onClick={onClose}
                                            className="inline-flex min-h-[44px] items-center rounded-xl bg-white px-3 text-sm font-bold text-slate-900 shadow-sm game-press dark:bg-white/15 dark:text-white"
                                        >
                                            {l.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {error && (
                        <p role="alert" className="mt-3 rounded-2xl bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-800 dark:text-rose-100">
                            {error}
                        </p>
                    )}

                    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={buying}
                            className="min-h-[48px] rounded-2xl px-5 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                            Vazgeç
                        </button>
                        <button
                            type="button"
                            onClick={buy}
                            disabled={buying || insufficient}
                            data-autofocus={insufficient ? undefined : true}
                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-300 to-amber-400 px-6 font-black text-slate-950 shadow-lg game-press disabled:cursor-not-allowed disabled:opacity-55"
                        >
                            <LuCoins aria-hidden="true" />
                            {buying ? 'Satın alınıyor…' : `${formatNumber(price)} jetonla satın al`}
                        </button>
                    </div>
                </div>
            )}
        </GameDialog>
    );
};

export default SlotShop;
