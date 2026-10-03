import React from 'react';
import toast, { Toaster, resolveValue } from 'react-hot-toast';
import { LuCheck, LuX, LuTriangleAlert, LuSparkles } from 'react-icons/lu';

/*
 * Sitenin genel bildirim görünümü. Uygulamadaki tüm toast.success /
 * toast.error / toast(...) çağrıları buradan çizilir; çağrı yerlerine
 * dokunmak gerekmez. toast.custom ile gelen hazır bileşenler (ör.
 * notificationToast) olduğu gibi, yalnızca giriş/çıkış animasyonuyla sarılır.
 */

const VARIANTS = {
    success: {
        chip: 'from-emerald-400 to-teal-500 shadow-emerald-500/30',
        bar: 'from-emerald-400 to-teal-500',
        Icon: LuCheck,
    },
    error: {
        chip: 'from-rose-500 to-red-500 shadow-rose-500/30',
        bar: 'from-rose-500 to-red-500',
        Icon: LuTriangleAlert,
    },
    loading: {
        chip: 'from-indigo-500 to-violet-500 shadow-indigo-500/30',
        bar: 'from-indigo-500 to-violet-500',
        Icon: null,
    },
    blank: {
        chip: 'from-coral to-fuchsia-500 shadow-coral/30',
        bar: 'from-coral to-fuchsia-500',
        Icon: LuSparkles,
    },
};

const Spinner = () => (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
);

const AppToast = ({ t }) => {
    const motion = t.visible ? 'app-toast-in' : 'app-toast-out';

    if (t.type === 'custom') {
        return <div className={motion}>{resolveValue(t.message, t)}</div>;
    }

    const v = VARIANTS[t.type] || VARIANTS.blank;
    const { Icon } = v;
    // Seçenekle verilen özel ikon (ör. emoji) varsa renkli kutunun içinde gösterilir.
    const custom = t.icon && typeof t.icon !== 'boolean' ? t.icon : null;
    const timed = Number.isFinite(t.duration) && t.type !== 'loading';

    return (
        <div
            {...t.ariaProps}
            className={`${motion} app-toast group pointer-events-auto relative flex w-[min(420px,calc(100vw-2rem))] items-start gap-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 py-3 pl-3 pr-2 shadow-[0_18px_40px_-12px_rgba(15,23,42,0.28)] backdrop-blur-md dark:border-white/10 dark:bg-slate-900/95 dark:shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]`}
        >
            <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-lg text-white shadow-lg ${v.chip}`}
            >
                {custom ?? (t.type === 'loading' ? <Spinner /> : <Icon aria-hidden="true" />)}
            </span>
            <div className="min-w-0 flex-1 self-center py-0.5 text-sm font-semibold leading-snug text-slate-800 [overflow-wrap:anywhere] dark:text-slate-100">
                {resolveValue(t.message, t)}
            </div>
            {t.type !== 'loading' && (
                <button
                    type="button"
                    onClick={() => toast.dismiss(t.id)}
                    className="-mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral dark:hover:bg-white/10 dark:hover:text-white"
                    aria-label="Bildirimi kapat"
                >
                    <LuX aria-hidden="true" />
                </button>
            )}
            {timed && (
                <span
                    className={`app-toast-progress absolute bottom-0 left-0 h-[3px] w-full origin-left bg-gradient-to-r ${v.bar}`}
                    style={{ animationDuration: `${t.duration}ms` }}
                    aria-hidden="true"
                />
            )}
        </div>
    );
};

const AppToaster = () => (
    <Toaster
        position="top-center"
        gutter={10}
        containerStyle={{ top: 'max(12px, env(safe-area-inset-top))' }}
        toastOptions={{
            success: { duration: 3500 },
            error: { duration: 5000 },
            blank: { duration: 4000 },
        }}
    >
        {(t) => <AppToast t={t} />}
    </Toaster>
);

export default AppToaster;
