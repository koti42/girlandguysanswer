import React from 'react';
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaTimes } from 'react-icons/fa';

const config = {
    success: {
        gradient: 'from-emerald-500 to-green-600',
        light: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
        icon: FaCheckCircle,
        iconColor: 'text-emerald-500',
        title: 'Başarılı',
    },
    error: {
        gradient: 'from-red-500 to-rose-600',
        light: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
        icon: FaExclamationCircle,
        iconColor: 'text-red-500',
        title: 'Hata',
    },
    warning: {
        gradient: 'from-amber-500 to-orange-500',
        light: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
        icon: FaExclamationCircle,
        iconColor: 'text-amber-500',
        title: 'Uyarı',
    },
    info: {
        gradient: 'from-blue-500 to-indigo-600',
        light: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
        icon: FaInfoCircle,
        iconColor: 'text-blue-500',
        title: 'Bilgi',
    },
};

const ToastNotification = ({ type = 'info', message, onClose }) => {
    const c = config[type] || config.info;
    const Icon = c.icon;

    return (
        <div
            className={`
                flex items-start gap-3 py-3 pl-3 pr-2 rounded-2xl border w-[min(420px,calc(100vw-2rem))]
                bg-white/95 dark:bg-slate-900/95 border-slate-200/80 dark:border-white/10 backdrop-blur-md
                shadow-[0_18px_40px_-12px_rgba(15,23,42,0.28)] dark:shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]
            `}
        >
            <div className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${c.gradient} shadow-lg flex items-center justify-center`}>
                <Icon className="text-white text-lg" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
                <p className="font-bold text-slate-900 dark:text-white text-sm">{c.title}</p>
                <p className="text-slate-600 dark:text-slate-300 text-sm mt-0.5 leading-snug [overflow-wrap:anywhere]">{message}</p>
            </div>
            <button
                type="button"
                onClick={onClose}
                className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
                aria-label="Kapat"
            >
                <FaTimes className="text-sm" />
            </button>
        </div>
    );
};

export default ToastNotification;
