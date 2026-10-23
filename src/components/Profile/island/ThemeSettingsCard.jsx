import React, { Component, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { FaCheck } from 'react-icons/fa';
import { LuEye, LuEyeOff, LuShoppingBag, LuSparkles } from 'react-icons/lu';
import JetonAmount from '../../game/shop/Jeton';
import WalletChip from '../../game/shop/WalletChip';
import profileThemeApi from '../../../services/profileThemeApi';
import ThemeArt from './ThemeArt';
import ThemePurchaseDialog from './ThemePurchaseDialog';
import { formatDateTR, mergeTheme, pickTheme, purchaseSummary, themeErrorInfo, themeStatus } from './themeUtils';
import './themeSettings.css';

/*
 * Ayarlar > Profil Teması: Ada Profili kartı.
 *  - Durum (Aktif · kalan N gün / Süresiz (yönetici) / Süresi doldu / Sahip değilsin),
 *    fiyat ve gün sayısı sunucudan (overview), bakiye, satın al / uzat.
 *  - Yönetici (`can_free`): jeton harcamadan "Ücretsiz ve süresiz etkinleştir".
 *  - Aç/kapa anahtarı: iyimser, hata olursa eski değere döner.
 *  - Önizle: canlı sahne (IslandPreview) tembel yüklenir. WebGL2 / erişilebilirlik
 *    yedeğini IslandPreview kendisi yönetir; modül yüklenemezse statik resim kalır.
 * Kart yalnız bölüm açılınca bağlanır (SettingsCard gizliyken çocukları çizmez),
 * `overview` isteği bu yüzden tembeldir.
 */

const BTN_PRIMARY = 'theme-btn-primary inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-coral to-brand-pink px-5 text-sm font-bold text-white shadow-[0_10px_25px_-10px_rgba(231,71,152,0.7)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none';
const BTN_GHOST = 'theme-btn-ghost inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700';

// Canlı önizleme ayrı parça: three.js ana pakete girmez. Modül yüklenemezse
// ErrorBoundary statik yedeğe döner.
const LazyIslandPreview = lazy(() => import('./IslandPreview'));

class PreviewBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { failed: false };
    }

    static getDerivedStateFromError() {
        return { failed: true };
    }

    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}

const StaticPreview = ({ note }) => (
    <div className="theme-preview-box" data-testid="theme-preview-static">
        <ThemeArt className="h-full w-full" />
        {note && <p className="absolute inset-x-0 bottom-0 bg-black/45 px-3 py-1.5 text-center text-xs font-medium text-white" role="note">{note}</p>}
    </div>
);

const ThemeSwitch = ({ checked, onChange, disabled, label, description }) => {
    const id = React.useId();
    return (
        <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-4 dark:border-gray-700">
            <div className="min-w-0 flex-1">
                <label htmlFor={id} className="block cursor-pointer text-sm font-semibold text-gray-900 dark:text-white">{label}</label>
                <p id={`${id}-aciklama`} className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
            </div>
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={checked}
                aria-describedby={`${id}-aciklama`}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className="theme-switch relative inline-flex min-h-[44px] min-w-[56px] shrink-0 cursor-pointer items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50"
            >
                <span className="sr-only">{checked ? 'Açık' : 'Kapalı'}</span>
                <span className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ${checked ? 'bg-gradient-to-r from-coral to-brand-pink' : 'bg-gray-200 dark:bg-gray-600'}`} aria-hidden="true">
                    <span className={`pointer-events-none flex h-6 w-6 transform items-center justify-center rounded-full bg-white shadow-md transition-transform duration-200 ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}>
                        {checked && <FaCheck className="text-[9px] text-brand-pink" />}
                    </span>
                </span>
            </button>
        </div>
    );
};

const ThemeSettingsCard = ({ user, onNotify }) => {
    const [theme, setTheme] = useState(null);
    const [wallet, setWallet] = useState(null);
    const [phase, setPhase] = useState('loading'); // loading | ready | error | missing
    const [loadError, setLoadError] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [activating, setActivating] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [notice, setNotice] = useState(null); // onNotify yoksa satır içi bildirim
    const toggleLock = useRef(false);
    const activateLock = useRef(false);
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
    }, []);

    const notify = useCallback((message, type = 'success') => {
        if (onNotify) onNotify(message, type);
        else setNotice({ message, type });
    }, [onNotify]);

    const load = useCallback(async () => {
        setPhase((p) => (p === 'ready' ? p : 'loading'));
        try {
            const data = await profileThemeApi.overview();
            if (!alive.current) return;
            const t = pickTheme(data);
            setWallet(data?.wallet || null);
            setTheme(t);
            setPhase(t ? 'ready' : 'missing');
        } catch (err) {
            if (!alive.current) return;
            setLoadError(themeErrorInfo(err, 'Tema bilgisi alınamadı.').message);
            setPhase('error');
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const balance = Number(wallet?.balance) || 0;

    const applyResult = (res) => {
        if (res?.wallet) setWallet(res.wallet);
        if (res?.theme) setTheme((prev) => mergeTheme(prev, res.theme));
    };

    const handleToggle = async (value) => {
        if (!theme || toggleLock.current) return;
        const prev = theme;
        toggleLock.current = true;
        setToggling(true);
        setTheme({ ...theme, enabled: value });
        try {
            const res = await profileThemeApi.toggle(theme.key, value);
            if (!alive.current) return;
            if (res?.theme) setTheme((cur) => mergeTheme(cur || prev, res.theme));
            notify(value ? 'Ada teması profilinde açıldı.' : 'Ada teması kapatıldı; profilin standart görünümde.');
        } catch (err) {
            if (!alive.current) return;
            setTheme(prev);
            const info = themeErrorInfo(err, 'Tema ayarı güncellenemedi.');
            notify(info.message, 'error');
            if (info.kind === 'not_entitled' || info.status === 422) load();
        } finally {
            toggleLock.current = false;
            if (alive.current) setToggling(false);
        }
    };

    const handleActivate = async () => {
        if (!theme || activateLock.current) return;
        activateLock.current = true;
        setActivating(true);
        try {
            const res = await profileThemeApi.activate(theme.key);
            if (!alive.current) return;
            applyResult(res);
            notify('Ada Profili ücretsiz ve süresiz etkinleştirildi.');
            if (!res?.theme) load();
        } catch (err) {
            if (!alive.current) return;
            notify(themeErrorInfo(err, 'Tema etkinleştirilemedi.').message, 'error');
        } finally {
            activateLock.current = false;
            if (alive.current) setActivating(false);
        }
    };

    const handlePurchased = (res) => {
        applyResult(res);
        notify('Ada Profili senin oldu.');
    };

    if (phase === 'loading') {
        return (
            <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Tema bilgisi yükleniyor" data-testid="theme-loading">
                <div className="h-32 rounded-2xl bg-gray-200/70 dark:bg-gray-700/60" />
                <div className="h-11 w-48 rounded-xl bg-gray-200/70 dark:bg-gray-700/60" />
            </div>
        );
    }

    if (phase === 'error') {
        return (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200" role="alert">
                <p>{loadError}</p>
                <button type="button" onClick={load} className={`${BTN_GHOST} mt-3`}>Tekrar dene</button>
            </div>
        );
    }

    if (phase === 'missing' || !theme) {
        return <p className="text-sm text-gray-500 dark:text-gray-400" role="status">Profil teması şu an kullanılamıyor.</p>;
    }

    const status = themeStatus(theme);
    const sum = purchaseSummary(theme, balance);
    const expiryDate = status.kind === 'active' ? formatDateTR(theme.expires_at) : '';
    const adminFree = theme.can_free;
    const showBuy = !adminFree && !sum.blocked;

    return (
        <div className="space-y-5" data-testid="theme-card">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="h-28 w-full shrink-0 overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5 sm:w-48" aria-hidden="true">
                    <ThemeArt />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-extrabold text-gray-900 dark:text-white">{theme.name}</h3>
                        <span className="theme-badge" data-tone={status.tone} data-testid="theme-status">{status.label}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        Profil başlığın yüzen, 3 boyutlu bir adaya dönüşür. Yalnızca web profilinde görünür; mobil uygulamada hiçbir şey değişmez.
                    </p>
                    {expiryDate && <p className="text-xs text-gray-500 dark:text-gray-400">Bitiş: {expiryDate}</p>}
                    {!adminFree && !sum.blocked && (
                        <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <dt className="text-gray-500 dark:text-gray-400">Fiyat</dt>
                                <dd className="font-extrabold"><JetonAmount value={theme.price} /></dd>
                            </div>
                            <div className="flex items-center gap-2">
                                <dt className="text-gray-500 dark:text-gray-400">Süre</dt>
                                <dd className="font-bold">{theme.days} gün</dd>
                            </div>
                            <div className="flex items-center gap-2">
                                <dt className="text-gray-500 dark:text-gray-400">Bakiyen</dt>
                                <dd><WalletChip balance={balance} /></dd>
                            </div>
                        </dl>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                {showBuy && (
                    <button type="button" onClick={() => setDialogOpen(true)} className={BTN_PRIMARY}>
                        <LuShoppingBag aria-hidden="true" />
                        {sum.extending ? `${theme.days} gün uzat` : 'Satın al'}
                    </button>
                )}
                {adminFree && (
                    <button type="button" onClick={handleActivate} disabled={activating || status.kind === 'unlimited'} aria-busy={activating} className={BTN_PRIMARY}>
                        <LuSparkles aria-hidden="true" />
                        {activating ? 'Etkinleştiriliyor…' : status.kind === 'unlimited' ? 'Süresiz etkin' : 'Ücretsiz ve süresiz etkinleştir'}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    aria-expanded={showPreview}
                    aria-controls="profil-temasi-onizleme"
                    className={BTN_GHOST}
                >
                    {showPreview ? <LuEyeOff aria-hidden="true" /> : <LuEye aria-hidden="true" />}
                    {showPreview ? 'Önizlemeyi kapat' : 'Önizle'}
                </button>
            </div>

            {adminFree && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Yönetici olarak bu temayı jeton harcamadan ve süre sınırı olmadan etkinleştirebilirsin.</p>
            )}

            {showPreview && (
                <div id="profil-temasi-onizleme" data-testid="theme-preview">
                    <PreviewBoundary fallback={<StaticPreview note="Canlı önizleme şu an yüklenemedi." />}>
                        <Suspense fallback={<StaticPreview note="Önizleme yükleniyor…" />}>
                            <LazyIslandPreview avatar={user?.detail?.game_avatar ?? null} gender={user?.gender} />
                        </Suspense>
                    </PreviewBoundary>
                </div>
            )}

            <ThemeSwitch
                label="Profilimde Ada temasını göster"
                description={status.entitled
                    ? 'Kapatırsan profilin standart görünümde kalır; süren işlemeye devam eder.'
                    : 'Önce temayı satın alman gerekir.'}
                checked={status.entitled && theme.enabled}
                disabled={!status.entitled || toggling}
                onChange={handleToggle}
            />

            {notice && (
                <p
                    className={`rounded-xl px-3 py-2 text-sm font-medium ${notice.type === 'error' ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-200' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'}`}
                    role={notice.type === 'error' ? 'alert' : 'status'}
                    data-testid="theme-notice"
                >
                    {notice.message}
                </p>
            )}

            <ThemePurchaseDialog
                open={dialogOpen}
                theme={theme}
                balance={balance}
                username={user?.username}
                onClose={() => setDialogOpen(false)}
                onSuccess={handlePurchased}
                onRefresh={load}
            />
        </div>
    );
};

export default ThemeSettingsCard;
