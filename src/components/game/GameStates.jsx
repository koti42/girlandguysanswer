import React from 'react';
import { LuRotateCcw, LuWifiOff } from 'react-icons/lu';

export const GameLoading = ({ label = 'Yükleniyor', className = '' }) => (
    <div className={`flex flex-col items-center justify-center gap-3 py-16 ${className}`} role="status" aria-live="polite">
        <div className="h-10 w-10 rounded-full border-[3px] border-coral border-t-transparent animate-spin" />
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}…</span>
    </div>
);

export const GameError = ({ message, onRetry, className = '' }) => (
    <div role="alert" className={`game-card rounded-3xl p-6 md:p-8 text-center game-fade-up ${className}`}>
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
            <LuWifiOff className="text-2xl" aria-hidden="true" />
        </div>
        <p className="font-semibold text-slate-800 dark:text-slate-100">Bir aksilik oldu</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{message}</p>
        {onRetry && (
            <button
                type="button"
                onClick={onRetry}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-coral to-orange-400 px-6 py-3 min-h-[48px] font-semibold text-white game-press game-glow-coral"
            >
                <LuRotateCcw aria-hidden="true" /> Tekrar dene
            </button>
        )}
    </div>
);

export const GameEmpty = ({ icon: Icon, title, children }) => (
    <div className="game-card rounded-3xl p-6 text-center">
        {Icon && <Icon className="mx-auto mb-2 text-3xl text-indigo-400" aria-hidden="true" />}
        <p className="font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        {children && <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">{children}</div>}
    </div>
);
