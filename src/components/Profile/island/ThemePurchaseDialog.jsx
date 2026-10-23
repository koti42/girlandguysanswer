import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCoins, LuShoppingBag, LuSparkles } from 'react-icons/lu';
import GameDialog from '../../game/avatar/GameDialog';
import { formatNumber } from '../../game/gameUtils';
import profileThemeApi from '../../../services/profileThemeApi';
import ThemeArt from './ThemeArt';
import { formatDateTR, purchaseSummary, themeErrorInfo, themeStatus } from './themeUtils';
import '../../game/game.css';
import './themeSettings.css';

/*
 * Ada Profili satın alma / süre uzatma onayı.
 *  - Ne alındığını açıkça yazar: yalnızca web profilinde görünür, mobilde
 *    etkilenmez, N günlük, süre bitmeden alınırsa üstüne eklenir.
 *  - Bakiye yetmiyorsa onay düğmesi yerine eksik miktar ve /oyun bağlantısı çıkar.
 *  - Çift dokunma güvenli: istek sürerken ikinci tıklama yok sayılır (ref
 *    kilidi, state gecikmesine bağlı değil); her istek taze Idempotency-Key alır.
 *  - Başarıda aynı pencerede kutlama; hata (409/422 vb.) Türkçe ve pencere açık kalır.
 */

const CONFETTI_COLORS = ['#FFD34D', '#FF6B6B', '#B47CFF', '#5AA2FF', '#3DDC84', '#FF8FA3'];

// Sabit dağılım: render'lar arasında zıplamasın.
function confettiPieces(n = 26) {
    let s = 7;
    const rnd = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
    return Array.from({ length: n }, (_, i) => {
        const angle = rnd() * Math.PI * 2;
        const dist = 90 + rnd() * 130;
        return {
            '--x': `${Math.round(Math.cos(angle) * dist)}px`,
            '--y': `${Math.round(Math.sin(angle) * dist * 0.8 + 110)}px`,
            '--r': `${Math.round(rnd() * 720 - 360)}deg`,
            '--d': `${Math.round(rnd() * 200)}ms`,
            '--c': CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            width: `${6 + Math.round(rnd() * 5)}px`,
            height: `${8 + Math.round(rnd() * 7)}px`,
        };
    });
}

const Row = ({ label, children, strong = false, divider = false }) => (
    <div className={`flex justify-between gap-3 ${divider ? 'border-t border-slate-200 pt-1.5 dark:border-white/10' : ''}`}>
        <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className={`tabular-nums ${strong ? 'font-extrabold' : 'font-bold'}`}>{children}</dd>
    </div>
);

const ThemePurchaseDialog = ({ open, theme, balance = 0, username = '', onClose, onSuccess, onRefresh }) => {
    const [step, setStep] = useState('confirm');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [liveBalance, setLiveBalance] = useState(balance);
    const [forceShort, setForceShort] = useState(false);
    const [done, setDone] = useState(null);
    const lock = useRef(false);
    const pieces = useMemo(() => confettiPieces(), []);

    // Her açılışta temiz başla. Yalnız açılışta: açıkken bakiye prop'u değişse de ekran kıpırdamasın.
    useEffect(() => {
        if (!open) return;
        setStep('confirm');
        setBusy(false);
        setError(null);
        setForceShort(false);
        setDone(null);
        setLiveBalance(balance);
        lock.current = false;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!theme) return null;

    const sum = purchaseSummary(theme, liveBalance);
    const enough = sum.enough && !forceShort;

    const confirm = async () => {
        if (lock.current || !enough || sum.blocked) return;
        lock.current = true;
        setBusy(true);
        setError(null);
        try {
            const res = await profileThemeApi.buy(theme.key);
            if (Number.isFinite(Number(res?.wallet?.balance))) setLiveBalance(Number(res.wallet.balance));
            setDone(res?.theme || null);
            setStep('done');
            onSuccess?.(res);
        } catch (err) {
            const info = themeErrorInfo(err, 'Satın alma tamamlanamadı. Lütfen tekrar dene.');
            if (info.kind === 'insufficient') {
                setForceShort(true);
                if (info.balance !== null) setLiveBalance(info.balance);
            }
            if (info.kind === 'unlimited' || info.status === 409) onRefresh?.();
            setError(info.message);
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };

    if (step === 'done') {
        const st = themeStatus(done ? { ...theme, ...done } : theme);
        const until = st.kind === 'active' ? formatDateTR(done?.expires_at || sum.newExpiresAt) : '';
        return (
            <GameDialog open={open} title="Senin oldu!" onClose={onClose}>
                <div className="relative -mx-5 -mt-2 overflow-hidden px-5 pt-2 text-center" data-testid="theme-celebration">
                    <div className="relative mx-auto flex h-44 w-full max-w-[16rem] items-center justify-center">
                        <span className="theme-rays absolute -inset-8 rounded-full" aria-hidden="true" />
                        <span className="theme-pop relative block h-36 w-full overflow-hidden rounded-3xl shadow-xl ring-4 ring-white/70">
                            <ThemeArt />
                        </span>
                        <span className="theme-confetti" aria-hidden="true">
                            {pieces.map((style, i) => <span key={i} style={style} />)}
                        </span>
                    </div>
                    <p className="mt-2 text-xl font-extrabold">{theme.name}</p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300" role="status">
                        {until ? `Profilin artık bir ada. ${until} tarihine kadar geçerli.` : 'Profilin artık bir ada.'}
                        {' '}Yalnızca web profilinde görünür; istediğin an kapatabilirsin.
                    </p>
                    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
                        <button
                            type="button"
                            onClick={onClose}
                            data-autofocus
                            className="min-h-[48px] rounded-2xl px-5 font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                            Harika!
                        </button>
                        {username && (
                            <Link
                                to={`/profile/${encodeURIComponent(username)}`}
                                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 font-bold text-white shadow-lg game-press"
                            >
                                <LuSparkles aria-hidden="true" /> Profilimi gör
                            </Link>
                        )}
                    </div>
                </div>
            </GameDialog>
        );
    }

    const title = sum.extending ? `${theme.name} süresi uzatılsın mı?` : `${theme.name} satın alınsın mı?`;

    return (
        <GameDialog open={open} title={title} onClose={onClose} dismissable={!busy}>
            <div className="space-y-4">
                <div className="flex items-center gap-4">
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5">
                        <ThemeArt />
                    </div>
                    <dl className="min-w-0 flex-1 space-y-1.5 text-sm">
                        <Row label="Fiyat">
                            <span className="inline-flex items-center gap-1 font-extrabold">
                                <LuCoins className="text-amber-500" aria-hidden="true" /> {formatNumber(sum.price)}
                            </span>
                        </Row>
                        <Row label="Süre">{sum.days} gün</Row>
                        <Row label="Bakiyen">{formatNumber(sum.balance)}</Row>
                        {enough && <Row label="Sonra kalan" divider>{formatNumber(sum.after)}</Row>}
                    </dl>
                </div>

                <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                    <li>Yalnızca web profilinde görünür; mobil uygulamada hiçbir şey değişmez.</li>
                    <li>{sum.days} günlüktür; süre bitince profilin eski hâline döner.</li>
                    <li>Süre bitmeden tekrar alırsan {sum.days} gün mevcut sürenin üstüne eklenir.</li>
                    {sum.newExpiresAt && (
                        <li className="font-semibold text-slate-800 dark:text-slate-100" data-testid="theme-new-expiry">
                            {sum.extending ? 'Yeni bitiş' : 'Bitiş'}: {formatDateTR(sum.newExpiresAt)}
                        </li>
                    )}
                </ul>

                {!enough && (
                    <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-200" role="status" data-testid="theme-insufficient">
                        Yeterli jetonun yok{sum.missing > 0 ? <>: <strong className="tabular-nums">{formatNumber(sum.missing)}</strong> jeton daha gerekiyor</> : ''}.
                        {' '}Oyun Merkezi&apos;nde oynadıkça jeton kazanırsın.
                    </p>
                )}
                {error && (
                    <p className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-600 dark:text-rose-300" role="alert" data-testid="theme-error">
                        {error}
                    </p>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        data-autofocus={enough ? undefined : true}
                        className="min-h-[48px] rounded-2xl px-5 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                        Vazgeç
                    </button>
                    {enough ? (
                        <button
                            type="button"
                            onClick={confirm}
                            disabled={busy}
                            aria-busy={busy}
                            data-autofocus
                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-coral px-6 font-bold text-slate-950 shadow-lg game-press disabled:opacity-60"
                        >
                            <LuShoppingBag aria-hidden="true" />
                            {busy ? 'İşleniyor…' : `${formatNumber(sum.price)} jetona ${sum.extending ? 'uzat' : 'satın al'}`}
                        </button>
                    ) : (
                        <Link
                            to="/oyun"
                            className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-6 font-bold text-white game-press"
                        >
                            Jeton kazanmaya git
                        </Link>
                    )}
                </div>
            </div>
        </GameDialog>
    );
};

export default ThemePurchaseDialog;
